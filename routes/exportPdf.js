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
  const b64 = m[2];
  try {
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
}

export default async function exportPdf(req, res) {
  try {
    const body = req.body || {};
    const title = body.title || "Aran Deck";
    const contentType = body.contentType || body.type || "";
    const prompt = body.prompt || "";
    const beats = Array.isArray(body.beats) ? body.beats : [];
    const beatTitles = Array.isArray(body.beatTitles) ? body.beatTitles : [];
    const toneImage = body.toneImage || null;
    const visuals = Array.isArray(body.visuals) ? body.visuals : [];
    const storyboards = Array.isArray(body.storyboards) ? body.storyboards : [];

    const filename = `${safeFilename(title)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

    const doc = new PDFDocument({ size: "LETTER", margin: 48 });
    doc.pipe(res);

    doc.fontSize(22).text(title, { align: "left" });
    if (contentType) {
      doc.moveDown(0.25);
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
        const heading = beatTitles[i] || b.title || b.heading || `Beat ${i + 1}`;
        const txt = b.text || b.description || b.body || b.content || (typeof b === "string" ? b : "");
        doc.fontSize(12).text(`${i + 1}. ${heading}`);
        doc.moveDown(0.25);
        doc.fontSize(10).text(String(txt || ""), { lineGap: 3 });
        doc.moveDown();
        if (doc.y > 720) doc.addPage();
      }
    }

    const imgCandidates = []
      .concat(storyboards || [])
      .concat(visuals || [])
      .map((v) => v?.dataUrl || v?.image || v?.url || v)
      .filter(Boolean);

    const imgs = imgCandidates.map(decodeDataUrlImage).filter(Boolean).slice(0, 6);

    if (imgs.length) {
      doc.addPage();
      doc.fontSize(14).text("Frames", { underline: true });
      doc.moveDown();
      for (let i = 0; i < imgs.length; i++) {
        try {
          doc.image(imgs[i], { fit: [520, 520], align: "center" });
          doc.moveDown();
          if (i !== imgs.length - 1) doc.addPage();
        } catch {
          doc.fontSize(10).text("(Couldn't embed an image)");
        }
      }
    }

    doc.end();
  } catch (err) {
    console.error("export pdf error:", err);
    if (!res.headersSent) return res.status(500).json({ error: "Export failed" });
    try { res.end(); } catch {}
  }
}
