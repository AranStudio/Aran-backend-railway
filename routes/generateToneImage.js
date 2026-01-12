// routes/generateToneImage.js
import { openai, asDataUrlFromB64 } from "../utils/openaiClient.js";

export default async function generateToneImage(req, res) {
  try {
    const { prompt, beats = [], title = "", contentType = "" } = req.body || {};
    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const beatSnippet = Array.isArray(beats)
      ? beats
          .slice(0, 4)
          .map((b) => String(b).trim())
          .filter(Boolean)
          .join(" / ")
      : "";

    // Lock the aspect ratio to 3:2 so the UI tone frame never crops awkwardly.
    // We also instruct "safe framing" so important elements are centered.
    const imgPrompt = `
Create ONE Aran "tone frame" image for this story.

RULES:
- No text, no titles, no logos, no watermarks.
- Keep the subject fully inside frame (safe margins). Avoid edge-cutoff.
- Cinematic, high-end still image. Beautiful lighting and composition.
- Match the story's genre and mood (content type: ${contentType || "any"}).
- Use a clean, modern, slightly futuristic feel that matches Aran's neon glass aesthetic.
- 3:2 landscape composition.

Story title: ${title}
Prompt: ${prompt}
Beats: ${beatSnippet}
`.trim();

    async function tryGenerate(size) {
      return await openai.images.generate({
        model: "gpt-image-1",
        prompt: imgPrompt,
        size,
      });
    }

    // Prefer landscape 3:2; fallback to square if the API ever rejects the size.
    let response;
    try {
      response = await tryGenerate("1536x1024");
    } catch (e) {
      response = await tryGenerate("1024x1024");
    }

    const url = response?.data?.[0]?.url || null;
    const b64 = response?.data?.[0]?.b64_json || null;
    const dataUrl = asDataUrlFromB64(b64);

    const images = [];
    if (dataUrl) images.push({ dataUrl });
    else if (url) images.push({ url });

    return res.json({ images });
  } catch (err) {
    console.error("generateToneImage error:", err);
    return res.status(500).json({
      error: err?.message || "Tone image failed",
    });
  }
}
