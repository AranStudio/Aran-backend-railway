// routes/export.js

/**
 * Provides a simple JSON export of the current project payload.
 * The client posts whatever data it wants to persist and receives
 * a downloadable JSON file in response.
 */
export default async function exportProject(req, res) {
  try {
    const now = new Date().toISOString();
    const { title, prompt, contentType, beats, visuals, toneImage, ...rest } = req.body || {};

    const payload = {
      exportedAt: now,
      title: title || "Untitled",
      prompt: prompt || "",
      contentType: contentType || "",
      beats: Array.isArray(beats) ? beats : [],
      visuals: Array.isArray(visuals) ? visuals : [],
      toneImage: toneImage || null,
      extra: rest,
    };

    const safeTitle = String(payload.title || "aran-export")
      .toLowerCase()
      .replace(/[^a-z0-9-_\.]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const filename = `${safeTitle || "aran-export"}.json`;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    return res.status(200).send(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error("export error:", err);
    return res.status(500).json({ error: "Export failed" });
  }
}
