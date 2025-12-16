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
`;

      const img = await openai.images.generate({
        model: "gpt-image-1",
        prompt: imgPrompt,
        size: "1024x1024",
      });

      const b64 = img?.data?.[0]?.b64_json;
      const dataUrl = b64 ? asDataUrlFromB64(b64) : null;

      frames.push({ beatIndex: i, dataUrl });
    }

    return res.json({ frames });
  } catch (err) {
    console.error("generateStoryboards error:", err);
    return res.status(500).json({ error: "Storyboards failed" });
  }
}
