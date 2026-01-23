// routes/exportPdf.js
// Generates a PDF for a deck and (optionally) saves it to the user's account.
//
// NEW: "Page 1 Everything" layout with optional expansion pages.
// NEW: "pitch_deck_editorial" template for cinematic pitch deck aesthetic.
// Backwards compatible with the older include[] multi-page export.

import PDFDocument from "pdfkit";
import { PassThrough } from "stream";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import fetch from "node-fetch";

import { decodeDataUrlImage, normalizeDeckPayload, safeFilename } from "../utils/deckFormatter.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const EXPORT_BUCKET = process.env.SUPABASE_EXPORT_BUCKET || process.env.SUPABASE_PDF_BUCKET || "exports";

const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const supabaseService = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;

function supabaseUser(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function getUserFromReq(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { token: null, user: null };
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) return { token: null, user: null };
  return { token, user: data.user };
}

function isIncluded(includeSet, key) {
  if (!includeSet) return true;
  return includeSet.has(String(key || "").toLowerCase());
}

function truncText(input, maxChars) {
  const s = String(input || "").replace(/\s+/g, " ").trim();
  if (!maxChars || s.length <= maxChars) return s;
  return s.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}

function imgBufFromAny(img) {
  return decodeDataUrlImage(img)?.buffer || null;
}

function normalizeFrames(frames) {
  if (Array.isArray(frames)) return frames;
  if (!frames || typeof frames !== "object") return [];
  const keys = Object.keys(frames);
  const max = keys.reduce((m, k) => {
    const n = Number(k);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, -1);
  if (max < 0) return [];
  return Array.from({ length: max + 1 }, (_, i) => frames[i] || null);
}

// ============================================================================
// PITCH DECK EDITORIAL TEMPLATE
// A cinematic, premium PDF layout with full-bleed hero and editorial pages
// ============================================================================

const FOOTER_TEXT = "© 2026 Aran Studio. All rights reserved.";

// Typography configuration for editorial design
const TYPOGRAPHY = {
  // Josefin Sans-like styling (PDFKit uses Helvetica by default)
  titleSize: 42,
  subtitleSize: 14,
  sectionLabelSize: 10,
  bodySize: 11,
  beatTitleSize: 12,
  beatTextSize: 10,
  footerSize: 8,
  letterSpacing: 2,
  lineHeight: 1.5,
};

// Layout configuration
const LAYOUT = {
  heroMargin: 0, // Full-bleed
  editorialMargin: 72, // 1 inch margins
  editorialMarginLarge: 96, // Larger margins for breathing room
  columnGap: 36,
  beatSpacing: 48,
  footerHeight: 40,
};

/**
 * Fetch image buffer from URL
 */
async function fetchImageBuffer(url) {
  if (!url || typeof url !== "string") return null;
  
  // Handle data URLs directly
  if (url.startsWith("data:")) {
    return imgBufFromAny(url);
  }
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e) {
    console.error("Failed to fetch image:", e);
    return null;
  }
}

/**
 * Get image buffer from various sources (data URL, URL, or buffer)
 */
async function getImageBuffer(img) {
  if (!img) return null;
  
  // Already a buffer
  if (Buffer.isBuffer(img)) return img;
  
  // Data URL
  const decoded = decodeDataUrlImage(img);
  if (decoded?.buffer) return decoded.buffer;
  
  // URL - fetch it
  if (typeof img === "string" && (img.startsWith("http://") || img.startsWith("https://"))) {
    return await fetchImageBuffer(img);
  }
  
  return null;
}

/**
 * Render the pitch deck editorial PDF template
 */
async function renderPitchDeckEditorialPdf(deck) {
  const title = deck.title || "Untitled";
  const description = deck.prompt || deck.brief || "";
  const toneImage = deck.toneImage || null;
  const beats = Array.isArray(deck.beats) ? deck.beats : [];
  const visuals = normalizeFrames(deck.visuals);
  const storyboards = normalizeFrames(deck.storyboards);

  // Create document with no initial page (we'll add pages manually)
  const doc = new PDFDocument({ 
    autoFirstPage: false,
    margin: 0,
    size: "letter", // 612 x 792 points
    bufferPages: true,
  });

  const pass = new PassThrough();
  const chunks = [];
  pass.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    pass.on("end", () => resolve(Buffer.concat(chunks)));
    pass.on("error", reject);
  });
  doc.pipe(pass);

  const PAGE_WIDTH = 612;
  const PAGE_HEIGHT = 792;

  // Helper to add footer to current page
  function addFooter() {
    doc.save();
    doc.fontSize(TYPOGRAPHY.footerSize);
    doc.fillColor("#666666");
    const footerY = PAGE_HEIGHT - 30;
    doc.text(FOOTER_TEXT, 0, footerY, { 
      width: PAGE_WIDTH, 
      align: "center" 
    });
    doc.restore();
  }

  // -------------------- PAGE 1: HERO PAGE --------------------
  async function renderHeroPage() {
    doc.addPage({ margin: 0 });
    
    // Get tone image buffer
    const imgBuf = await getImageBuffer(toneImage);
    
    if (imgBuf) {
      try {
        // Full-bleed background image
        doc.image(imgBuf, 0, 0, { 
          width: PAGE_WIDTH, 
          height: PAGE_HEIGHT,
          cover: [PAGE_WIDTH, PAGE_HEIGHT],
        });
      } catch (e) {
        // Fallback to dark background if image fails
        doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill("#1a1a1a");
      }
    } else {
      // Dark cinematic background if no tone image
      doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill("#1a1a1a");
    }

    // Subtle gradient overlay for text readability (bottom to top)
    const gradientHeight = PAGE_HEIGHT * 0.6;
    const gradientSteps = 20;
    for (let i = 0; i < gradientSteps; i++) {
      const opacity = (i / gradientSteps) * 0.7;
      const y = PAGE_HEIGHT - gradientHeight + (i * (gradientHeight / gradientSteps));
      const h = gradientHeight / gradientSteps + 1;
      doc.save();
      doc.fillColor("#000000");
      doc.fillOpacity(opacity);
      doc.rect(0, y, PAGE_WIDTH, h).fill();
      doc.restore();
    }

    // Title - large, uppercase, centered near bottom
    const titleY = PAGE_HEIGHT - 200;
    doc.save();
    doc.fillColor("#ffffff");
    doc.fontSize(TYPOGRAPHY.titleSize);
    doc.text(title.toUpperCase(), LAYOUT.editorialMargin, titleY, {
      width: PAGE_WIDTH - (LAYOUT.editorialMargin * 2),
      align: "center",
      characterSpacing: TYPOGRAPHY.letterSpacing,
    });
    doc.restore();

    // Description - smaller, below title
    if (description) {
      const descY = titleY + 60;
      doc.save();
      doc.fillColor("#cccccc");
      doc.fontSize(TYPOGRAPHY.subtitleSize);
      const shortDesc = description.length > 150 
        ? description.slice(0, 147) + "..." 
        : description;
      doc.text(shortDesc, LAYOUT.editorialMargin, descY, {
        width: PAGE_WIDTH - (LAYOUT.editorialMargin * 2),
        align: "center",
        lineGap: 4,
      });
      doc.restore();
    }

    addFooter();
  }

  // -------------------- PAGE 2: INTRODUCTION PAGE --------------------
  function renderIntroPage() {
    doc.addPage({ margin: LAYOUT.editorialMarginLarge });
    
    // White background (default)
    doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill("#ffffff");
    
    const margin = LAYOUT.editorialMarginLarge;
    const contentWidth = PAGE_WIDTH - (margin * 2);
    let cursorY = margin;

    // Section label
    doc.save();
    doc.fillColor("#888888");
    doc.fontSize(TYPOGRAPHY.sectionLabelSize);
    doc.text("INTRODUCTION", margin, cursorY, {
      characterSpacing: TYPOGRAPHY.letterSpacing,
    });
    doc.restore();
    cursorY += 30;

    // Horizontal rule
    doc.save();
    doc.strokeColor("#e0e0e0");
    doc.lineWidth(0.5);
    doc.moveTo(margin, cursorY).lineTo(margin + contentWidth, cursorY).stroke();
    doc.restore();
    cursorY += 40;

    // Two-column layout
    const colGap = LAYOUT.columnGap;
    const leftColWidth = contentWidth * 0.55 - colGap / 2;
    const rightColWidth = contentWidth * 0.45 - colGap / 2;
    const rightColX = margin + leftColWidth + colGap;

    // Left column: Story description/prompt
    doc.save();
    doc.fillColor("#333333");
    doc.fontSize(TYPOGRAPHY.bodySize);
    
    const promptLabel = "STORY CONCEPT";
    doc.fontSize(TYPOGRAPHY.sectionLabelSize);
    doc.fillColor("#888888");
    doc.text(promptLabel, margin, cursorY, { characterSpacing: 1 });
    
    doc.moveDown(1.5);
    doc.fontSize(TYPOGRAPHY.bodySize);
    doc.fillColor("#333333");
    
    const storyText = description || "No description provided.";
    doc.text(storyText, margin, doc.y, {
      width: leftColWidth,
      lineGap: 6,
      align: "left",
    });
    doc.restore();

    // Right column: Metadata
    doc.save();
    doc.fontSize(TYPOGRAPHY.sectionLabelSize);
    doc.fillColor("#888888");
    doc.text("DETAILS", rightColX, cursorY, { characterSpacing: 1 });
    
    let rightY = cursorY + 30;
    doc.fontSize(TYPOGRAPHY.bodySize);
    doc.fillColor("#333333");

    // Title
    doc.text("Title", rightColX, rightY, { continued: false });
    rightY += 16;
    doc.fillColor("#666666");
    doc.text(title, rightColX, rightY);
    rightY += 30;

    // Beats count
    doc.fillColor("#333333");
    doc.text("Story Beats", rightColX, rightY);
    rightY += 16;
    doc.fillColor("#666666");
    doc.text(`${beats.length} beats`, rightColX, rightY);
    rightY += 30;

    // Visuals count
    const totalVisuals = visuals.length + storyboards.length;
    if (totalVisuals > 0) {
      doc.fillColor("#333333");
      doc.text("Visual Assets", rightColX, rightY);
      rightY += 16;
      doc.fillColor("#666666");
      doc.text(`${totalVisuals} images`, rightColX, rightY);
    }

    doc.restore();

    addFooter();
  }

  // -------------------- PAGE 3+: BEATS GALLERY PAGES --------------------
  async function renderBeatPages() {
    if (!beats.length) return;

    const margin = LAYOUT.editorialMarginLarge;
    const contentWidth = PAGE_WIDTH - (margin * 2);
    const columnWidth = (contentWidth - LAYOUT.columnGap) / 2;
    const maxContentY = PAGE_HEIGHT - LAYOUT.footerHeight - margin;

    let currentPage = null;
    let cursorY = 0;
    let currentColumn = 0; // 0 = left, 1 = right

    function startNewPage() {
      doc.addPage({ margin: margin });
      doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill("#ffffff");
      
      // Section label on each beats page
      doc.save();
      doc.fillColor("#888888");
      doc.fontSize(TYPOGRAPHY.sectionLabelSize);
      doc.text("STORY BEATS", margin, margin, {
        characterSpacing: TYPOGRAPHY.letterSpacing,
      });
      doc.restore();

      // Horizontal rule
      doc.save();
      doc.strokeColor("#e0e0e0");
      doc.lineWidth(0.5);
      doc.moveTo(margin, margin + 20).lineTo(margin + contentWidth, margin + 20).stroke();
      doc.restore();

      cursorY = margin + 50;
      currentColumn = 0;
      currentPage = true;
    }

    // Calculate beat height estimate
    function estimateBeatHeight(beat, hasImages) {
      let height = 30; // Title
      const textLines = Math.ceil((beat.text || "").length / 45);
      height += textLines * 14; // Text
      if (hasImages) height += 120; // Image thumbnails
      height += LAYOUT.beatSpacing;
      return Math.min(height, 300); // Cap max height
    }

    // Collect images for each beat
    const beatImages = {};
    for (let i = 0; i < beats.length; i++) {
      const images = [];
      // Check for visual at this beat index
      if (visuals[i]) {
        const v = visuals[i];
        const buf = await getImageBuffer(v.image || v.dataUrl || v.url);
        if (buf) images.push(buf);
      }
      // Check for storyboard at this beat index
      if (storyboards[i]) {
        const s = storyboards[i];
        const buf = await getImageBuffer(s.image || s.dataUrl || s.url);
        if (buf) images.push(buf);
      }
      beatImages[i] = images;
    }

    startNewPage();

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i] || {};
      const beatTitle = beat.title || `Beat ${i + 1}`;
      const beatText = beat.text || "";
      const images = beatImages[i] || [];

      const estimatedHeight = estimateBeatHeight(beat, images.length > 0);
      const colX = currentColumn === 0 
        ? margin 
        : margin + columnWidth + LAYOUT.columnGap;

      // Check if we need a new page or column
      if (cursorY + estimatedHeight > maxContentY) {
        if (currentColumn === 0) {
          // Move to right column
          currentColumn = 1;
          cursorY = margin + 50;
        } else {
          // New page
          addFooter();
          startNewPage();
        }
      }

      const beatX = currentColumn === 0 
        ? margin 
        : margin + columnWidth + LAYOUT.columnGap;

      // Beat title - uppercase, tracked
      doc.save();
      doc.fillColor("#333333");
      doc.fontSize(TYPOGRAPHY.beatTitleSize);
      doc.text(beatTitle.toUpperCase(), beatX, cursorY, {
        width: columnWidth,
        characterSpacing: 1,
      });
      doc.restore();

      cursorY = doc.y + 8;

      // Beat text
      if (beatText) {
        doc.save();
        doc.fillColor("#555555");
        doc.fontSize(TYPOGRAPHY.beatTextSize);
        doc.text(beatText, beatX, cursorY, {
          width: columnWidth,
          lineGap: 4,
          align: "left",
        });
        doc.restore();
        cursorY = doc.y + 12;
      }

      // Images (thumbnails)
      if (images.length > 0) {
        const thumbWidth = Math.min(100, (columnWidth - 10) / images.length);
        const thumbHeight = thumbWidth * 0.56; // 16:9 ratio

        for (let j = 0; j < images.length; j++) {
          const thumbX = beatX + (j * (thumbWidth + 10));
          try {
            doc.image(images[j], thumbX, cursorY, {
              fit: [thumbWidth, thumbHeight],
              align: "center",
              valign: "center",
            });
          } catch (e) {
            // Draw placeholder
            doc.save();
            doc.rect(thumbX, cursorY, thumbWidth, thumbHeight).fill("#f0f0f0");
            doc.restore();
          }
        }
        cursorY += thumbHeight + 10;
      }

      cursorY += LAYOUT.beatSpacing;
    }

    addFooter();
  }

  // -------------------- RENDER ALL PAGES --------------------
  await renderHeroPage();
  renderIntroPage();
  await renderBeatPages();

  doc.end();
  return done;
}

async function renderPdfToBuffer(deck, includeSet, layoutOptions) {
  const title = deck.title || "Aran Deck";
  const contentType = deck.contentType || "";
  const prompt = deck.prompt || "";
  const brief = deck.brief || "";

  const beats = Array.isArray(deck.beats) ? deck.beats : [];
  const toneImage = deck.toneImage || null;
  const visuals = normalizeFrames(deck.visuals);
  const storyboards = normalizeFrames(deck.storyboards);
  const scenes = Array.isArray(deck.scenes) ? deck.scenes : [];
  const shots = Array.isArray(deck.shots) ? deck.shots : [];
  const suggestions = Array.isArray(deck.suggestions) ? deck.suggestions : [];

  const useLayout = layoutOptions && typeof layoutOptions === "object";

  const doc = new PDFDocument({ autoFirstPage: true, margin: 48 });
  const pass = new PassThrough();
  const chunks = [];
  pass.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    pass.on("end", () => resolve(Buffer.concat(chunks)));
    pass.on("error", reject);
  });
  doc.pipe(pass);

  const pageW = () => doc.page.width;
  const pageH = () => doc.page.height;
  const mL = () => doc.page.margins.left;
  const mR = () => doc.page.margins.right;
  const mT = () => doc.page.margins.top;
  const mB = () => doc.page.margins.bottom;
  const usableW = () => pageW() - mL() - mR();

  function drawRuleAt(y) {
    doc.save();
    doc.lineWidth(0.6);
    doc.moveTo(mL(), y).lineTo(mL() + usableW(), y).stroke();
    doc.restore();
  }

  function headerBlock() {
    doc.fontSize(22).text(String(title), { align: "left" });
    if (contentType) {
      doc.moveDown(0.2);
      doc.fontSize(10).text(String(contentType), { align: "left" });
    }
  }

  // -------------------- NEW LAYOUT --------------------
  if (useLayout) {
    const density = String(layoutOptions.page1Density || "balanced").toLowerCase();
    const page1 = layoutOptions.page1 || {};
    const extras = layoutOptions.extras || {};

    const densityCfgMap = {
      compact: { beatChars: 220, maxBeats: 6, thumbRows: 1, thumbCols: 6, beatFont: 9 },
      balanced: { beatChars: 180, maxBeats: 8, thumbRows: 2, thumbCols: 4, beatFont: 9 },
      dense: { beatChars: 140, maxBeats: 12, thumbRows: 2, thumbCols: 5, beatFont: 8 },
    };
    const cfg = densityCfgMap[density] || densityCfgMap.balanced;

    // Page 1: everything
    headerBlock();

    const colGap = 18;
    const rightColW = Math.min(220, Math.round(usableW() * 0.35));
    const leftColW = usableW() - rightColW - colGap;

    const leftX = mL();
    const rightX = mL() + leftColW + colGap;

    const topY = doc.y + 10;
    let yLeft = topY;
    let yRight = topY;

    if (page1.prompt && prompt && isIncluded(includeSet, "prompt")) {
      doc.fontSize(12).text("Prompt", leftX, yLeft, { width: leftColW, underline: true });
      yLeft = doc.y + 6;
      doc.fontSize(10).text(truncText(prompt, 900), leftX, yLeft, { width: leftColW, lineGap: 3 });
      yLeft = doc.y + 10;
    }

    if (page1.brief && brief && isIncluded(includeSet, "brief")) {
      doc.fontSize(12).text("Brief", leftX, yLeft, { width: leftColW, underline: true });
      yLeft = doc.y + 6;
      doc.fontSize(10).text(truncText(brief, 800), leftX, yLeft, { width: leftColW, lineGap: 3 });
      yLeft = doc.y + 10;
    }

    const toneBuf = imgBufFromAny(toneImage);
    if (page1.toneImage && toneBuf && isIncluded(includeSet, "toneimage")) {
      const imgBoxH = Math.min(230, Math.round((pageH() - mT() - mB()) * 0.28));
      doc.save();
      doc.rect(rightX, yRight, rightColW, imgBoxH).stroke();
      try {
        doc.image(toneBuf, rightX + 6, yRight + 6, { fit: [rightColW - 12, imgBoxH - 12], align: "center", valign: "center" });
      } catch {
        doc.fontSize(10).text("(Couldn't embed tone image)", rightX, yRight, { width: rightColW });
      }
      doc.restore();
      yRight = yRight + imgBoxH + 10;
    }

    doc.y = Math.max(yLeft, yRight);
    drawRuleAt(doc.y);
    doc.moveDown(0.8);

    // Beats (compact)
    if (page1.beats && beats.length && isIncluded(includeSet, "beats")) {
      doc.fontSize(12).text("Beats", { underline: true });
      doc.moveDown(0.4);

      const take = beats.slice(0, cfg.maxBeats);
      for (let i = 0; i < take.length; i++) {
        const b = take[i] || {};
        const beatTitle = b.title || `Beat ${i + 1}`;
        const beatText = b.text || "";

        doc.fontSize(9).text(String(beatTitle).toUpperCase(), { characterSpacing: 0.5 });
        if (beatText) {
          doc.fontSize(cfg.beatFont).text(truncText(beatText, cfg.beatChars), { lineGap: 2 });
        }
        doc.moveDown(0.35);

        // Keep room for thumbs at the bottom
        if (doc.y > pageH() - mB() - 190) break;
      }

      if (beats.length > cfg.maxBeats) {
        doc.fontSize(9).text(`(+${beats.length - cfg.maxBeats} more)`, { opacity: 0.8 });
      }

      doc.moveDown(0.2);
      drawRuleAt(doc.y);
      doc.moveDown(0.6);
    }

    // Frames thumbs on page 1
    const thumbs = [];
    if (page1.visualThumbs && isIncluded(includeSet, "visuals")) {
      for (let i = 0; i < visuals.length; i++) {
        const v = visuals[i] || {};
        const buf = imgBufFromAny(v.image || v.dataUrl || v.url);
        if (buf) thumbs.push({ kind: "visual", i, buf });
      }
    }
    if (page1.storyboardThumbs && isIncluded(includeSet, "storyboards")) {
      for (let i = 0; i < storyboards.length; i++) {
        const s = storyboards[i] || {};
        const buf = imgBufFromAny(s.image || s.dataUrl || s.url);
        if (buf) thumbs.push({ kind: "storyboard", i, buf });
      }
    }

    if (thumbs.length) {
      doc.fontSize(12).text("Frames", { underline: true });
      doc.moveDown(0.5);

      const cols = cfg.thumbCols;
      const rows = cfg.thumbRows;
      const maxThumbs = cols * rows;
      const show = thumbs.slice(0, maxThumbs);

      const gap = 8;
      const cellW = (usableW() - gap * (cols - 1)) / cols;
      const cellH = cellW * 0.56;

      const startX = mL();
      const startY = doc.y;

      for (let idx = 0; idx < show.length; idx++) {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        const x = startX + c * (cellW + gap);
        const y = startY + r * (cellH + gap);

        doc.save();
        doc.rect(x, y, cellW, cellH).stroke();
        try {
          doc.image(show[idx].buf, x + 4, y + 4, { fit: [cellW - 8, cellH - 8], align: "center", valign: "center" });
        } catch {
          // ignore
        }
        doc.restore();
      }

      doc.y = startY + rows * (cellH + gap);
      if (thumbs.length > maxThumbs) {
        doc.moveDown(0.2);
        doc.fontSize(9).text(`(+${thumbs.length - maxThumbs} more frames)`, { opacity: 0.8 });
      }
    }

    // Optional expansion pages
    function largeFramePage(label, caption, buf) {
      doc.addPage();
      doc.fontSize(14).text(label, { underline: true });
      if (caption) {
        doc.moveDown(0.4);
        doc.fontSize(10).text(String(caption), { lineGap: 3 });
      }
      doc.moveDown(0.6);
      try {
        doc.image(buf, { fit: [520, 520], align: "center", valign: "center" });
      } catch {
        doc.fontSize(10).text("(Couldn't embed an image)");
      }
    }

    if (extras.largeVisuals && isIncluded(includeSet, "visuals") && visuals.length) {
      for (let i = 0; i < visuals.length; i++) {
        const v = visuals[i] || {};
        const caption = v.caption || v.prompt || v.title || `Visual ${i + 1}`;
        const buf = imgBufFromAny(v.image || v.dataUrl || v.url);
        if (!buf) continue;
        largeFramePage("Visual", caption, buf);
      }
    }

    if (extras.largeStoryboards && isIncluded(includeSet, "storyboards") && storyboards.length) {
      for (let i = 0; i < storyboards.length; i++) {
        const s = storyboards[i] || {};
        const caption = s.caption || s.prompt || s.title || `Storyboard ${i + 1}`;
        const buf = imgBufFromAny(s.image || s.dataUrl || s.url);
        if (!buf) continue;
        largeFramePage("Storyboard", caption, buf);
      }
    }

    if (extras.fullBeats && isIncluded(includeSet, "beats") && beats.length) {
      doc.addPage();
      doc.fontSize(14).text("Beats (Full)", { underline: true });
      doc.moveDown();
      for (let i = 0; i < beats.length; i++) {
        const b = beats[i] || {};
        const beatTitle = b.title || `Beat ${i + 1}`;
        const beatText = b.text || "";
        doc.fontSize(12).text(String(beatTitle));
        doc.moveDown(0.25);
        if (beatText) doc.fontSize(10).text(String(beatText), { lineGap: 3 });
        doc.moveDown();

        if (doc.y > pageH() - mB() - 140 && i !== beats.length - 1) doc.addPage();
      }
    }

    if (extras.suggestions && isIncluded(includeSet, "suggestions") && suggestions.length) {
      doc.addPage();
      doc.fontSize(14).text("Suggestions", { underline: true });
      doc.moveDown();
      suggestions.forEach((s, i) => {
        const text = s?.text || "";
        if (!text) return;
        doc.fontSize(10).text(`• ${text}`, { lineGap: 3 });
        if (i !== suggestions.length - 1) doc.moveDown(0.25);
      });
    }

    doc.end();
    return done;
  }

  // -------------------- OLD EXPORT (backwards compatible) --------------------
  doc.fontSize(22).text(String(title), { align: "left" });
  doc.moveDown(0.5);
  if (contentType) doc.fontSize(12).text(String(contentType), { align: "left" });

  if (prompt && isIncluded(includeSet, "prompt")) {
    doc.moveDown();
    doc.fontSize(12).text("Prompt", { underline: true });
    doc.moveDown(0.35);
    doc.fontSize(10).text(String(prompt), { lineGap: 3 });
  }

  if (brief && isIncluded(includeSet, "brief")) {
    doc.moveDown();
    doc.fontSize(12).text("Brief", { underline: true });
    doc.moveDown(0.35);
    doc.fontSize(10).text(String(brief), { lineGap: 3 });
  }

  const toneBufLegacy = imgBufFromAny(toneImage);
  if (toneBufLegacy && isIncluded(includeSet, "toneimage")) {
    doc.addPage();
    doc.fontSize(14).text("Tone Image", { underline: true });
    doc.moveDown();
    try {
      doc.image(toneBufLegacy, { fit: [520, 520], align: "center" });
    } catch {
      doc.fontSize(10).text("(Couldn't embed tone image)");
    }
  }

  if (beats.length && isIncluded(includeSet, "beats")) {
    doc.addPage();
    doc.fontSize(14).text("Beats", { underline: true });
    doc.moveDown();
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i] || {};
      const beatTitle = b.title || `Beat ${i + 1}`;
      const beatText = b.text || "";
      doc.fontSize(12).text(String(beatTitle));
      doc.moveDown(0.25);
      if (beatText) doc.fontSize(10).text(String(beatText), { lineGap: 3 });
      if (i !== beats.length - 1) doc.moveDown();
    }
  }

  if (scenes.length && isIncluded(includeSet, "scenes")) {
    doc.addPage();
    doc.fontSize(14).text("Scenes", { underline: true });
    doc.moveDown();
    scenes.forEach((scene, i) => {
      doc.fontSize(12).text(scene.title || `Scene ${i + 1}`);
      if (scene.text) {
        doc.moveDown(0.25);
        doc.fontSize(10).text(scene.text, { lineGap: 3 });
      }
      if (i !== scenes.length - 1) doc.moveDown();
    });
  }

  if (shots.length && isIncluded(includeSet, "shots")) {
    doc.addPage();
    doc.fontSize(14).text("Shots", { underline: true });
    doc.moveDown();
    shots.forEach((shot, i) => {
      doc.fontSize(12).text(shot.title || `Shot ${i + 1}`);
      if (shot.text) {
        doc.moveDown(0.25);
        doc.fontSize(10).text(shot.text, { lineGap: 3 });
      }
      if (i !== shots.length - 1) doc.moveDown();
    });
  }

  if (visuals.length && isIncluded(includeSet, "visuals")) {
    doc.addPage();
    doc.fontSize(14).text("Visuals", { underline: true });
    doc.moveDown();
    for (let i = 0; i < visuals.length; i++) {
      const v = visuals[i] || {};
      const caption = v.caption || v.prompt || v.title || `Visual ${i + 1}`;
      const img = v.image || v.dataUrl || v.url || null;
      doc.fontSize(12).text(String(caption));
      doc.moveDown(0.25);
      const buf = imgBufFromAny(img);
      if (buf) {
        try {
          doc.image(buf, { fit: [520, 520], align: "center" });
        } catch {
          doc.fontSize(10).text("(Couldn't embed an image)");
        }
      }
      if (i !== visuals.length - 1) doc.addPage();
    }
  }

  if (storyboards.length && isIncluded(includeSet, "storyboards")) {
    doc.addPage();
    doc.fontSize(14).text("Storyboards", { underline: true });
    doc.moveDown();
    for (let i = 0; i < storyboards.length; i++) {
      const s = storyboards[i] || {};
      const caption = s.caption || s.prompt || s.title || `Storyboard ${i + 1}`;
      const img = s.image || s.dataUrl || s.url || null;
      doc.fontSize(12).text(String(caption));
      doc.moveDown(0.25);
      const buf = imgBufFromAny(img);
      if (buf) {
        try {
          doc.image(buf, { fit: [520, 520], align: "center" });
        } catch {
          doc.fontSize(10).text("(Couldn't embed an image)");
        }
      }
      if (i !== storyboards.length - 1) doc.addPage();
    }
  }

  if (suggestions.length && isIncluded(includeSet, "suggestions")) {
    doc.addPage();
    doc.fontSize(14).text("Suggestions", { underline: true });
    doc.moveDown();
    suggestions.forEach((s, i) => {
      const text = s?.text || "";
      if (!text) return;
      doc.fontSize(10).text(`• ${text}`, { lineGap: 3 });
      if (i !== suggestions.length - 1) doc.moveDown(0.25);
    });
  }

  doc.end();
  return done;
}

export default async function exportPdf(req, res) {
  try {
    const body = req.body || {};

    // Frontend sends { deck, include, saveToAccount, layoutOptions, template }
    const deckIn = body.deck || body;
    const deck = normalizeDeckPayload(deckIn);

    // Check for pitch_deck_editorial template
    const template = String(body.template || "").toLowerCase();

    const includeRaw = Array.isArray(body.include) ? body.include : body.sections;
    const includeSet = Array.isArray(includeRaw)
      ? new Set(includeRaw.map((s) => String(s).toLowerCase()))
      : null;

    const layoutOptions = body.layoutOptions || null;

    // Optional account save
    const saveToAccount = Boolean(body.saveToAccount);
    const { token, user } = await getUserFromReq(req);

    if (saveToAccount && (!token || !user)) {
      return res.status(401).json({ error: "Sign in required to save exports" });
    }

    const filename = `${safeFilename(deck.title || "aran-deck")}.pdf`;

    // Route to appropriate renderer based on template
    let pdfBuffer;
    if (template === "pitch_deck_editorial") {
      // Use the new cinematic editorial template
      pdfBuffer = await renderPitchDeckEditorialPdf(deck);
    } else {
      // Use existing renderers
      pdfBuffer = await renderPdfToBuffer(deck, includeSet, layoutOptions);
    }

    // If requested, upload to Storage and optionally attach to a deck row.
    if (saveToAccount && user) {
      const uploader = supabaseService || supabaseUser(token);
      const deckId = deck.id || randomUUID();
      const path = `${user.id}/${deckId}/${filename}`;

      const { error: upErr } = await uploader.storage
        .from(EXPORT_BUCKET)
        .upload(path, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (upErr) {
        console.error("export upload error:", upErr);
      } else {
        const { data: pub } = uploader.storage.from(EXPORT_BUCKET).getPublicUrl(path);
        const publicUrl = pub?.publicUrl || null;
        if (publicUrl) res.setHeader("X-Aran-Pdf-Url", publicUrl);

        if (deck.id) {
          await uploader
            .from("decks")
            .update({ export_pdf_url: publicUrl })
            .eq("user_id", user.id)
            .eq("id", deck.id);
        }
      }
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("export pdf error:", err);
    if (!res.headersSent) return res.status(500).json({ error: err?.message || "Export failed" });
    try {
      res.end();
    } catch {}
  }
}
