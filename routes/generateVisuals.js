// routes/generateVisuals.js
import { openai, asDataUrlFromB64 } from "../utils/openaiClient.js";

export default async function generateVisuals(req, res) {
  try {
    const { prompt, beats = [] } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    if (!Array.isArray(beats) || beats.length === 0) {
      return res.json({ frames: [] });
    }

    const frames = [];

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];

      const framePrompt = `
Create ONE cinematic storyboard frame.
No text in the image.
Film still quality, professional composition.

Overall prompt: ${prompt}
This specific beat: ${beat}
`;

      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt: framePrompt,
        size: "1024x1024",
        response_format: "b64_json",
      });

      const b64 = response?.data?.[0]?.b64_json;
      const dataUrl = asDataUrlFromB64(b64);

      if (dataUrl) {
        frames.push({ beatIndex: i, dataUrl });
      }
    }

    return res.json({ frames });
  } catch (err) {
    console.error("generateVisuals error:", err);
    return res.status(500).json({
      error: err?.message || "Visuals failed",
    });
  }
}
