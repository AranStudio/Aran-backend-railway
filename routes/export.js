// routes/export.js

import { buildExportPayload, normalizeDeckPayload, safeFilename } from "../utils/deckFormatter.js";

/**
 * Provides a structured JSON export of the current project payload.
 * The client posts whatever data it wants to persist and receives
 * a downloadable JSON file in response.
 */
export default async function exportProject(req, res) {
  try {
    const body = req.body || {};
    const deck = normalizeDeckPayload(body);
    const includeSections = Array.isArray(body.include) ? body.include : body.sections;

    const payload = buildExportPayload(deck, includeSections);
    const filename = `${safeFilename(deck.title || "aran-export", "aran-export")}.json`;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Export-Include", JSON.stringify(includeSections || []));

    return res.status(200).send(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error("export error:", err);
    return res.status(500).json({ error: "Export failed" });
  }
}
