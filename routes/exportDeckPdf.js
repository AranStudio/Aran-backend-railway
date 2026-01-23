// routes/exportDeckPdf.js
// Compiles PNG images (from frontend Fabric.js canvas exports) into a multi-page PDF.
// Uses pdf-lib for simple, reliable PNG->PDF assembly with exact dimensions.

import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { safeFilename } from "../utils/deckFormatter.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const EXPORT_BUCKET =
  process.env.SUPABASE_EXPORT_BUCKET || process.env.SUPABASE_PDF_BUCKET || "exports";

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

// Page preset dimensions (pixels at 300 DPI)
const PAGE_PRESETS = {
  LETTER_PORTRAIT_300DPI: { width: 2550, height: 3300 }, // 8.5" x 11" at 300dpi
  LETTER_LANDSCAPE_300DPI: { width: 3300, height: 2550 },
  WIDESCREEN_16x9_4K: { width: 3840, height: 2160 },
  WIDESCREEN_16x9_HD: { width: 1920, height: 1080 },
  A4_PORTRAIT_300DPI: { width: 2480, height: 3508 }, // A4 at 300dpi
  A4_LANDSCAPE_300DPI: { width: 3508, height: 2480 },
  // Standard export (150dpi versions for smaller file sizes)
  LETTER_PORTRAIT_150DPI: { width: 1275, height: 1650 },
  LETTER_LANDSCAPE_150DPI: { width: 1650, height: 1275 },
};

// Convert pixel dimensions to PDF points (72 points per inch)
function pixelsToPoints(pixels, dpi = 300) {
  return (pixels / dpi) * 72;
}

/**
 * Decode base64 PNG to buffer
 * Handles both raw base64 and data URL format
 */
function decodeBase64Png(input) {
  if (!input || typeof input !== "string") return null;

  // Strip data URL prefix if present
  let base64 = input;
  if (input.startsWith("data:")) {
    const match = input.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
    if (!match) return null;
    base64 = match[2];
  }

  try {
    return Buffer.from(base64, "base64");
  } catch {
    return null;
  }
}

/**
 * Detect image format from buffer
 */
function detectImageFormat(buffer) {
  if (!buffer || buffer.length < 8) return null;

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "png";
  }

  // JPEG signature: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  return null;
}

/**
 * Main handler: POST /api/export/deck-pdf
 *
 * Request body:
 * {
 *   deckId: string (optional),
 *   title: string (optional),
 *   pagePreset: "LETTER_PORTRAIT_300DPI" | "WIDESCREEN_16x9_4K" | ...,
 *   quality: "standard" | "high" (optional, affects DPI calculation),
 *   pages: [
 *     { pageId: "page_1", pngBase64: "..." },
 *     { pageId: "page_2", pngBase64: "..." }
 *   ],
 *   saveToAccount: boolean (optional)
 * }
 *
 * Response: application/pdf stream
 */
export default async function exportDeckPdf(req, res) {
  try {
    const body = req.body || {};

    // Validate required fields
    const pages = body.pages;
    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({
        error: "Missing or empty pages array",
        details: "Request body must contain a 'pages' array with at least one page",
      });
    }

    // Maximum pages limit to prevent abuse
    const MAX_PAGES = 100;
    if (pages.length > MAX_PAGES) {
      return res.status(400).json({
        error: `Too many pages (max ${MAX_PAGES})`,
        details: `Received ${pages.length} pages, maximum allowed is ${MAX_PAGES}`,
      });
    }

    // Get page preset configuration
    const presetName = body.pagePreset || "LETTER_PORTRAIT_300DPI";
    const preset = PAGE_PRESETS[presetName] || PAGE_PRESETS.LETTER_PORTRAIT_300DPI;

    // Quality setting affects DPI for PDF page size calculation
    const quality = String(body.quality || "high").toLowerCase();
    const dpi = quality === "standard" ? 150 : 300;

    const deckId = body.deckId || randomUUID();
    const title = body.title || "Aran Deck";
    const filename = `${safeFilename(title, "aran-deck")}.pdf`;

    // Create PDF document
    const pdfDoc = await PDFDocument.create();

    // Set PDF metadata
    pdfDoc.setTitle(title);
    pdfDoc.setCreator("Aran Studio");
    pdfDoc.setProducer("Aran Deck Builder");
    pdfDoc.setCreationDate(new Date());

    // Process each page
    const errors = [];
    for (let i = 0; i < pages.length; i++) {
      const pageData = pages[i];
      if (!pageData || !pageData.pngBase64) {
        errors.push(`Page ${i + 1}: Missing pngBase64 data`);
        continue;
      }

      // Decode the PNG
      const pngBuffer = decodeBase64Png(pageData.pngBase64);
      if (!pngBuffer) {
        errors.push(`Page ${i + 1}: Invalid base64 image data`);
        continue;
      }

      // Detect image format
      const format = detectImageFormat(pngBuffer);
      if (!format) {
        errors.push(`Page ${i + 1}: Unknown image format`);
        continue;
      }

      try {
        // Embed the image based on format
        let image;
        if (format === "png") {
          image = await pdfDoc.embedPng(pngBuffer);
        } else if (format === "jpeg") {
          image = await pdfDoc.embedJpg(pngBuffer);
        } else {
          errors.push(`Page ${i + 1}: Unsupported image format '${format}'`);
          continue;
        }

        // Get image dimensions
        const { width: imgWidth, height: imgHeight } = image.scale(1);

        // Determine page size:
        // - If image matches preset dimensions, use preset-based PDF page size
        // - Otherwise, use image dimensions converted to points
        let pageWidth, pageHeight;

        // Check if image dimensions match preset (within tolerance)
        const tolerance = 10; // pixels
        const matchesPreset =
          Math.abs(imgWidth - preset.width) < tolerance &&
          Math.abs(imgHeight - preset.height) < tolerance;

        if (matchesPreset) {
          // Use preset-based sizing (converts pixels to PDF points at specified DPI)
          pageWidth = pixelsToPoints(preset.width, dpi);
          pageHeight = pixelsToPoints(preset.height, dpi);
        } else {
          // Use image dimensions directly (assume 72 DPI for PDF display)
          // This maintains pixel-perfect rendering at 100% zoom
          pageWidth = imgWidth;
          pageHeight = imgHeight;
        }

        // Add page with exact dimensions
        const page = pdfDoc.addPage([pageWidth, pageHeight]);

        // Draw image to fill entire page (no margins)
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
        });
      } catch (err) {
        errors.push(`Page ${i + 1}: Failed to embed image - ${err.message}`);
      }
    }

    // Check if we have at least one page
    if (pdfDoc.getPageCount() === 0) {
      return res.status(400).json({
        error: "No valid pages could be processed",
        details: errors,
      });
    }

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    // Optional: save to user account
    const saveToAccount = Boolean(body.saveToAccount);
    const { token, user } = await getUserFromReq(req);

    if (saveToAccount && user) {
      try {
        const uploader = supabaseService || supabaseUser(token);
        const path = `${user.id}/${deckId}/${filename}`;

        const { error: upErr } = await uploader.storage.from(EXPORT_BUCKET).upload(path, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });

        if (upErr) {
          console.error("deck-pdf upload error:", upErr);
        } else {
          const { data: pub } = uploader.storage.from(EXPORT_BUCKET).getPublicUrl(path);
          const publicUrl = pub?.publicUrl || null;
          if (publicUrl) {
            res.setHeader("X-Aran-Pdf-Url", publicUrl);
          }
        }
      } catch (uploadErr) {
        console.error("deck-pdf upload exception:", uploadErr);
      }
    }

    // Return warnings if some pages failed
    if (errors.length > 0) {
      res.setHeader("X-Aran-Warnings", JSON.stringify(errors));
    }

    // Return PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader("X-Aran-Page-Count", String(pdfDoc.getPageCount()));

    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("export deck-pdf error:", err);
    if (!res.headersSent) {
      return res.status(500).json({
        error: "PDF export failed",
        details: err?.message || "Unknown error",
      });
    }
    try {
      res.end();
    } catch {}
  }
}

// Also export page presets for use by other modules
export { PAGE_PRESETS };
