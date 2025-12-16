// routes/generate.js
import { chatCompletion } from "../utils/openaiClient.js";

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

export default async function generate(req, res) {
  try {
    const { prompt, contentType, styleHint, reimagine } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    const system = `
Return ONLY valid JSON with this exact shape:
{
  "title": "short title",
  "beats": ["beat 1", "beat 2", "beat 3", "beat 4", "beat 5", "beat 6"]
}
No extra keys. No markdown. No commentary.
Beats should be concise, visual, and ordered.
`;

    const user = `
Story prompt: ${prompt}
Content type: ${contentType || ""}
Style hint: ${styleHint || ""}
Reimagine: ${Boolean(reimagine)}

Generate a short title + 6 story beats.
`;

    const completion = await chatCompletion({
      prompt: `${system}\n\n${user}`,
      model: "gpt-4o-mini",
    });

    const text = completion?.choices?.[0]?.message?.content?.trim() || "";
    const parsed = safeJsonParse(text);

    const title =
      (parsed?.title && String(parsed.title)) ||
      "Untitled";

    const beats =
      Array.isArray(parsed?.beats)
        ? parsed.beats.map((b) => String(b)).filter(Boolean)
        : [];

    // Always return the shape your frontend expects:
    return res.json({ title, beats });
  } catch (err) {
    console.error("generate error:", err);
    return res.status(500).json({ error: "Error generating beats" });
  }
}
