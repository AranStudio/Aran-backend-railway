// routes/exportPdf.js
import PDFDocument from "pdfkit";

import { decodeDataUrlImage, normalizeDeckPayload, safeFilename } from "../utils/deckFormatter.js";

function isIncluded(includeSet, key) {
  if (!includeSet) return true;
  return includeSet.has(key);
}

export default async function exportPdf(req, res) {
  try {
    const body = req.body || {};
    const deck = normalizeDeckPayload(body);
    const includeRaw = Array.isArray(body.include) ? body.include : body.sections;
    const includeSet = Array.isArray(includeRaw)
      ? new Set(includeRaw.map((s) => String(s).toLowerCase()))
      : null;

    const title = deck.title || "Aran Deck";
    const contentType = deck.contentType || "";
    const prompt = deck.prompt || "";
    const brief = deck.brief || "";

    const beats = Array.isArray(deck.beats) ? deck.beats : [];
    const toneImage = deck.toneImage || null;
    const visuals = Array.isArray(deck.visuals) ? deck.visuals : [];
    const storyboards = Array.isArray(deck.storyboards) ? deck.storyboards : [];
    const scenes = Array.isArray(deck.scenes) ? deck.scenes : [];
    const shots = Array.isArray(deck.shots) ? deck.shots : [];
    const suggestions = Array.isArray(deck.suggestions) ? deck.suggestions : [];

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

    const toneBuf = decodeDataUrlImage(toneImage)?.buffer;
    if (toneBuf && isIncluded(includeSet, "toneImage")) {
      doc.addPage();
      doc.fontSize(14).text("Tone Image", { underline: true });
      doc.moveDown();
      try {
        doc.image(toneBuf, { fit: [520, 520], align: "center" });
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

        doc.fontSize(12).text(String(beatTitle), { continued: false });
        doc.moveDown(0.25);
        if (beatText) {
          doc.fontSize(10).text(String(beatText), { lineGap: 3 });
        }
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

        const buf = decodeDataUrlImage(img)?.buffer;
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

        const buf = decodeDataUrlImage(img)?.buffer;
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
  } catch (err) {
    console.error("export pdf error:", err);
    if (!res.headersSent) return res.status(500).json({ error: "Export failed" });
    try { res.end(); } catch {}
  }
}
