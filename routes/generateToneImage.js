// routes/generateToneImage.js
import { openai, asDataUrlFromB64 } from "../utils/openaiClient.js";

export default async function generateToneImage(req, res) {
  try {
    const { prompt, beats = [], title = "" } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    const beatSnippet = Array.isArray(beats)
      ? beats.slice(0, 3).join(" / ")
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

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: imgPrompt,
      size: "1024x1024",
      response_format: "b64_json",
    });

    const b64 = response?.data?.[0]?.b64_json;
    const dataUrl = asDataUrlFromB64(b64);

    return res.json({
      images: dataUrl ? [{ dataUrl }] : [],
    });
  } catch (err) {
    console.error("generateToneImage error:", err);
    return res.status(500).json({
      error: err?.message || "Tone image failed",
    });
  }
}
