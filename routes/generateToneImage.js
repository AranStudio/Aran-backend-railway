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

GOAL:
- A single, cinematic HORIZONTAL cover image (like a film poster / book cover / opening poem line — but WITHOUT any text).
- It should feel like the *beginning* of the story: mood, world, genre, and a clear focal point.

COMPOSITION:
- Landscape image with safe margins. Keep key subjects centered and fully in-frame.
- No split panels. No triptych. No collage.
- No text, no titles, no logos, no watermarks.

STYLE:
- Premium, photoreal, high-end still.
- Subtle Aran aesthetic: clean framing, modern color contrast, and a hint of neon-glass energy (very subtle).
- Match the story's genre and mood (content type: ${contentType || "any"}).

Story title (no text in image): ${title}
Prompt: ${prompt}
Beats (context only): ${beatSnippet}
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
