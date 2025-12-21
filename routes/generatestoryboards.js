// routes/generatestoryboards.js
import { openai, asDataUrlFromB64 } from "../utils/openaiClient.js";

export default async function generateStoryboards(req, res) {
  try {
    const { prompt, contentType, beats } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });
    if (!Array.isArray(beats) || beats.length === 0) return res.json({ frames: [] });

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
        // IMPORTANT: DO NOT pass response_format here.
      });

      const b64 = img?.data?.[0]?.b64_json || null;
      const dataUrl = b64 ? asDataUrlFromB64(b64) : null;

      frames.push({ beatIndex: i, dataUrl });
    }

    return res.json({ frames });
  } catch (err) {
    console.error("generateStoryboards error:", err?.error || err);

    const msg =
      err?.error?.message ||
      err?.message ||
      "Storyboards failed";

    return res.status(err?.status || 500).json({ error: msg });
  }
}