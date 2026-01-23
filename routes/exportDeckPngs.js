// routes/exportDeckPngs.js
// Exports PNG images from a Deck Builder project as a downloadable ZIP archive.
// Used when users prefer separate image files instead of a compiled PDF.

import archiver from "archiver";
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

/**
 * Decode base64 PNG to buffer
 * Handles both raw base64 and data URL format
 */
function decodeBase64Image(input) {
  if (!input || typeof input !== "string") return null;

  // Strip data URL prefix if present
  let base64 = input;
  let format = "png"; // default

  if (input.startsWith("data:")) {
    const match = input.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
    if (!match) return null;
    format = match[1].toLowerCase();
    if (format === "jpg") format = "jpeg";
    base64 = match[2];
  }

  try {
    return {
      buffer: Buffer.from(base64, "base64"),
      format,
    };
  } catch {
    return null;
  }
}

/**
 * Detect image format from buffer
 */
function detectImageFormat(buffer) {
  if (!buffer || buffer.length < 8) return "png"; // default

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

  // WebP signature: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.length > 11 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "webp";
  }

  return "png"; // default fallback
}

/**
 * Generate a zero-padded page number string
 */
function padPageNumber(num, total) {
  const digits = String(total).length;
  return String(num).padStart(Math.max(2, digits), "0");
}

/**
 * Main handler: POST /api/export/deck-pngs
 *
 * Request body:
 * {
 *   deckId: string (optional),
 *   title: string (optional),
 *   pages: [
 *     { pageId: "page_1", pageName: "Cover", pngBase64: "..." },
 *     { pageId: "page_2", pageName: "Introduction", pngBase64: "..." }
 *   ],
 *   saveToAccount: boolean (optional)
 * }
 *
 * Response: application/zip stream
 */
export default async function exportDeckPngs(req, res) {
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

    const deckId = body.deckId || randomUUID();
    const title = body.title || "Aran Deck";
    const safeTitle = safeFilename(title, "aran-deck");
    const zipFilename = `${safeTitle}-pages.zip`;

    // Set response headers for ZIP download
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipFilename}"`);

    // Create archiver instance
    const archive = archiver("zip", {
      zlib: { level: 6 }, // Balanced compression
    });

    // Handle archive errors
    archive.on("error", (err) => {
      console.error("archiver error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "ZIP creation failed" });
      }
    });

    // Pipe archive to response
    archive.pipe(res);

    // Process each page
    const errors = [];
    let successCount = 0;

    for (let i = 0; i < pages.length; i++) {
      const pageData = pages[i];
      if (!pageData || !pageData.pngBase64) {
        errors.push(`Page ${i + 1}: Missing pngBase64 data`);
        continue;
      }

      // Decode the image
      const decoded = decodeBase64Image(pageData.pngBase64);
      if (!decoded) {
        errors.push(`Page ${i + 1}: Invalid base64 image data`);
        continue;
      }

      // Detect actual format from buffer
      const detectedFormat = detectImageFormat(decoded.buffer);
      const ext = detectedFormat === "jpeg" ? "jpg" : detectedFormat;

      // Generate filename
      const pageNumber = padPageNumber(i + 1, pages.length);
      const pageName = pageData.pageName
        ? safeFilename(pageData.pageName, `page-${pageNumber}`)
        : `page-${pageNumber}`;

      const imageFilename = `${safeTitle}/${pageNumber}-${pageName}.${ext}`;

      // Add to archive
      archive.append(decoded.buffer, { name: imageFilename });
      successCount++;
    }

    // Add a manifest file with metadata
    const manifest = {
      exportedAt: new Date().toISOString(),
      deckId,
      title,
      pageCount: successCount,
      pages: pages.map((p, i) => ({
        pageNumber: i + 1,
        pageId: p.pageId,
        pageName: p.pageName || `Page ${i + 1}`,
      })),
    };

    archive.append(JSON.stringify(manifest, null, 2), {
      name: `${safeTitle}/manifest.json`,
    });

    // Finalize archive (sends remaining data and ends)
    await archive.finalize();

    // Log any warnings
    if (errors.length > 0) {
      console.warn("deck-pngs export warnings:", errors);
    }

    // Optional: save to user account (async, after response)
    const saveToAccount = Boolean(body.saveToAccount);
    const { token, user } = await getUserFromReq(req);

    if (saveToAccount && user && supabaseService) {
      // Note: We can't easily save the ZIP after streaming it to the response
      // For account saving, we'd need to buffer it first, which defeats streaming
      // This could be a separate endpoint or done client-side
      console.log("Note: saveToAccount for ZIPs requires buffered upload (not implemented for streaming)");
    }
  } catch (err) {
    console.error("export deck-pngs error:", err);
    if (!res.headersSent) {
      return res.status(500).json({
        error: "PNG export failed",
        details: err?.message || "Unknown error",
      });
    }
    try {
      res.end();
    } catch {}
  }
}

/**
 * Alternative handler for downloading a single PNG
 * POST /api/export/deck-png (singular)
 *
 * For when user just wants one page exported
 */
export async function exportSingleDeckPng(req, res) {
  try {
    const body = req.body || {};

    // Accept either single page or pick from pages array
    let pngBase64 = body.pngBase64;
    let pageName = body.pageName || body.pageId || "page";

    if (!pngBase64 && Array.isArray(body.pages) && body.pages.length > 0) {
      const pageIndex = Number(body.pageIndex) || 0;
      const page = body.pages[pageIndex];
      if (page) {
        pngBase64 = page.pngBase64;
        pageName = page.pageName || page.pageId || `page-${pageIndex + 1}`;
      }
    }

    if (!pngBase64) {
      return res.status(400).json({
        error: "Missing image data",
        details: "Request must contain pngBase64 field or pages array",
      });
    }

    // Decode the image
    const decoded = decodeBase64Image(pngBase64);
    if (!decoded) {
      return res.status(400).json({
        error: "Invalid image data",
        details: "Could not decode base64 image",
      });
    }

    // Detect format
    const detectedFormat = detectImageFormat(decoded.buffer);
    const ext = detectedFormat === "jpeg" ? "jpg" : detectedFormat;
    const mimeType = detectedFormat === "jpeg" ? "image/jpeg" : `image/${detectedFormat}`;

    const title = body.title || "aran-deck";
    const safeTitle = safeFilename(title, "aran-deck");
    const filename = `${safeTitle}-${safeFilename(pageName, "page")}.${ext}`;

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", decoded.buffer.length);

    return res.status(200).send(decoded.buffer);
  } catch (err) {
    console.error("export single deck-png error:", err);
    if (!res.headersSent) {
      return res.status(500).json({
        error: "PNG export failed",
        details: err?.message || "Unknown error",
      });
    }
  }
}
