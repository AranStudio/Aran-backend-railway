// routes/exportImage.js
import { buildExportPayload, decodeDataUrlImage, normalizeDeckPayload, safeFilename } from "../utils/deckFormatter.js";

function pickPrimaryImage(deck) {
  return (
    deck.toneImage ||
    deck.visuals?.find((v) => v?.image || v?.dataUrl || v?.url)?.image ||
    deck.visuals?.find((v) => v?.dataUrl || v?.url)?.dataUrl ||
    deck.storyboards?.find((v) => v?.image || v?.dataUrl || v?.url)?.image ||
    deck.storyboards?.find((v) => v?.dataUrl || v?.url)?.dataUrl ||
    null
  );
}

export default async function exportImage(req, res) {
  try {
    const body = req.body || {};
    const deck = normalizeDeckPayload(body);
    const includeSections = Array.isArray(body.include) ? body.include : body.sections;

    const primaryImage = pickPrimaryImage(deck);
    const decoded = decodeDataUrlImage(primaryImage);

    if (!decoded) {
      return res.status(400).json({ error: "No embeddable image found for JPG export" });
    }

    const payload = buildExportPayload(deck, includeSections);
    const filename = `${safeFilename(deck.title || "aran-deck")}.jpg`;

    res.setHeader("Content-Type", decoded.mime || "image/jpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Export-Include", JSON.stringify(includeSections || []));
    res.setHeader("X-Export-Meta", JSON.stringify({
      title: payload.title,
      prompt: payload.prompt,
      brief: payload.brief,
      contentType: payload.contentType,
    }));

    return res.status(200).send(decoded.buffer);
  } catch (err) {
    console.error("export image error:", err);
    return res.status(500).json({ error: "Export image failed" });
  }
}
