// routes/generatestoryboards.js
import { openai, asDataUrlFromB64 } from "../utils/openaiClient.js";

export default async function generateStoryboards(req, res) {
  try {
    // Log incoming payload for debugging
    console.log("generate-storyboards payload:", JSON.stringify(req.body, null, 2));

    const { prompt, contentType, beats } = req.body || {};

    // Validate required fields with helpful error messages
    if (!prompt) {
      return res.status(400).json({ error: "Missing required field: prompt" });
    }

    if (beats === undefined || beats === null) {
      return res.status(400).json({ error: "Missing required field: beats" });
    }

    if (!Array.isArray(beats)) {
      return res.status(400).json({ error: "Invalid field: beats must be an array" });
    }

    if (beats.length === 0) {
      return res.json({ frames: [] });
    }

    const frames = [];

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];

      const imgPrompt = `
Black-and-white storyboard frame, pencil/ink concept art.
No text. High contrast. Simple composition.
Story: ${prompt}
Type: ${contentType || ""}
Beat ${i + 1}: ${beat}
`.trim();

      const img = await openai.images.generate({
        model: "gpt-image-1",
        prompt: imgPrompt,
        size: "1024x1024",
      });

      const b64 = img?.data?.[0]?.b64_json;
      const dataUrl = asDataUrlFromB64(b64);

      if (dataUrl) {
        frames.push({ beatIndex: i, dataUrl });
      }
    }

    return res.json({ frames });
  } catch (err) {
    console.error("generateStoryboards error:", err);
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: "Generation failed" });
  }
}