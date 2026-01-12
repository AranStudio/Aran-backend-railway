// routes/generateToneImage.js
import { openai, asDataUrlFromB64 } from "../utils/openaiClient.js";

export default async function generateToneImage(req, res) {
  try {
    const { prompt, beats = [], title = "" } = req.body || {};
    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const beatSnippet = Array.isArray(beats)
      ? beats
          .slice(0, 3)
          .map((b) => String(b).trim())
          .filter(Boolean)
          .join(" / ")
      : "";

    const imgPrompt = `
Create ONE cinematic tone image.
No text in the image.
Visually beautiful, professional, film still quality.

Story title: ${title}
Prompt: ${prompt}
Beats: ${beatSnippet}

Style: cinematic lighting, high-end commercial still, tasteful composition.
`;

    // ✅ IMPORTANT: Do NOT pass response_format here.
    // The current OpenAI SDK images API typically returns a hosted URL.
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: imgPrompt,
      size: "1024x1024",
    });

    // Prefer base64 if present, else use url
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
