// routes/generateVisuals.js
import { openai, asDataUrlFromB64 } from "../utils/openaiClient.js";

export default async function generateVisuals(req, res) {
  try {
    // Log incoming payload for debugging
    console.log("generate-visuals payload:", JSON.stringify(req.body, null, 2));

    // Validate environment variables before processing
    if (!process.env.OPENAI_API_KEY) {
      console.error("generate-visuals error: Missing OPENAI_API_KEY environment variable");
      return res.status(500).json({ error: "Server configuration error: missing API key" });
    }

    const { prompt, beats } = req.body || {};

    // Validate required fields with helpful error messages
    if (!prompt) {
      return res.status(400).json({ error: "Missing required field: prompt" });
    }

    if (beats !== undefined && beats !== null && !Array.isArray(beats)) {
      return res.status(400).json({ error: "Invalid field: beats must be an array" });
    }

    const beatsArray = beats || [];

    if (beatsArray.length === 0) {
      return res.json({ frames: [] });
    }

    const frames = [];

    for (let i = 0; i < beatsArray.length; i++) {
      const beat = beatsArray[i];

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
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: "Generation failed" });
  }
}
