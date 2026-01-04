// routes/exportPdf.js
import PDFDocument from "pdfkit";

function safeFilename(name) {
  return String(name || "aran-deck")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "aran-deck";
}

function decodeDataUrlImage(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!m) return null;
  try {
    return Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
}

export default async function exportPdf(req, res) {
  try {
    const body = req.body || {};

    // ✅ Support frontend shape: { deck: payload, saveToAccount: true/false }
    const deck = body.deck && typeof body.deck === "object" ? body.deck : null;
    const src = deck || body;

    const title = src.title || "Aran Deck";
    const contentType = src.contentType || src.type || "";
    const prompt = src.prompt || "";

    const beats = Array.isArray(src.beats) ? src.beats : [];
    const beatTitles = Array.isArray(src.beatTitles) ? src.beatTitles : [];

    const toneImage = src.toneImage || src.tone_image || null;
    const visuals = Array.isArray(src.visuals) ? src.visuals : [];
    const storyboards = Array.isArray(src.storyboards) ? src.storyboards : [];

    const filename = `${safeFilename(title)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ autoFirstPage: true, margin: 48 });
    doc.pipe(res);

    // Cover
    doc.fontSize(22).text(String(title), { align: "left" });
    doc.moveDown(0.5);
    if (contentType) {
      doc.fontSize(12).text(String(contentType), { align: "left" });
    }
    if (prompt) {
      doc.moveDown();
      doc.fontSize(12).text("Prompt", { underline: true });
      doc.moveDown(0.35);
      doc.fontSize(10).text(String(prompt), { lineGap: 3 });
    }

    const toneBuf = decodeDataUrlImage(toneImage);
    if (toneBuf) {
      doc.addPage();
      doc.fontSize(14).text("Tone Image", { underline: true });
      doc.moveDown();
      try {
        doc.image(toneBuf, { fit: [520, 520], align: "center" });
      } catch {
        doc.fontSize(10).text("(Couldn't embed tone image)");
      }
    }

    if (beats.length) {
      doc.addPage();
      doc.fontSize(14).text("Beats", { underline: true });
      doc.moveDown();

      for (let i = 0; i < beats.length; i++) {
        const b = beats[i] || {};
        const beatTitle = beatTitles[i] || b.title || `Beat ${i + 1}`;
        const beatText = b.text || b.body || b.description || "";

        doc.fontSize(12).text(String(beatTitle), { continued: false });
        doc.moveDown(0.25);
        if (beatText) {
          doc.fontSize(10).text(String(beatText), { lineGap: 3 });
        }
        if (i !== beats.length - 1) doc.moveDown();
      }
    }

    if (visuals.length) {
      doc.addPage();
      doc.fontSize(14).text("Visuals", { underline: true });
      doc.moveDown();

      for (let i = 0; i < visuals.length; i++) {
        const v = visuals[i] || {};
        const caption = v.caption || v.prompt || v.title || `Visual ${i + 1}`;
        const img = v.image || v.dataUrl || v.url || null;

        doc.fontSize(12).text(String(caption));
        doc.moveDown(0.25);

        const buf = decodeDataUrlImage(img);
        if (buf) {
          try {
            doc.image(buf, { fit: [520, 520], align: "center" });
          } catch {
            doc.fontSize(10).text("(Couldn't embed an image)");
          }
        } else if (typeof img === "string" && img) {
          doc.fontSize(9).text(String(img));
        }

        if (i !== visuals.length - 1) doc.addPage();
      }
    }

    if (storyboards.length) {
      doc.addPage();
      doc.fontSize(14).text("Storyboards", { underline: true });
      doc.moveDown();

      for (let i = 0; i < storyboards.length; i++) {
        const s = storyboards[i] || {};
        const caption = s.caption || s.prompt || s.title || `Storyboard ${i + 1}`;
        const img = s.image || s.dataUrl || s.url || null;

        doc.fontSize(12).text(String(caption));
        doc.moveDown(0.25);

        const buf = decodeDataUrlImage(img);
        if (buf) {
          try {
            doc.image(buf, { fit: [520, 520], align: "center" });
          } catch {
            doc.fontSize(10).text("(Couldn't embed an image)");
          }
        } else if (typeof img === "string" && img) {
          doc.fontSize(9).text(String(img));
        }

        if (i !== storyboards.length - 1) doc.addPage();
      }
    }

    doc.end();
  } catch (err) {
    console.error("export pdf error:", err);
    if (!res.headersSent) return res.status(500).json({ error: "Export failed" });
    try { res.end(); } catch {}
  }
}
