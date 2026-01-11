// routes/generateToneImage.js
import { openai, asDataUrlFromB64 } from "../utils/openaiClient.js";

export default async function generateToneImage(req, res) {
  try {
    const { prompt, contentType, title, beats } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    const beatSnippet = Array.isArray(beats) ? beats.slice(0, 3).join(" / ") : "";
    const imgPrompt = `
Create ONE tone frame image.
Cinematic, tasteful, professional. No text in the image.
Prompt: ${prompt}
Title: ${title || ""}
Type: ${contentType || ""}
Key beats: ${beatSnippet}
`.trim();

    const img = await openai.images.generate({
      model: "gpt-image-1",
      prompt: imgPrompt,
      size: "1024x1024",
      // IMPORTANT: DO NOT pass response_format here.
    });

    const b64 = img?.data?.[0]?.b64_json || null;
    const dataUrl = b64 ? asDataUrlFromB64(b64) : null;

    return res.json({ images: dataUrl ? [{ dataUrl }] : [] });
  } catch (err) {
    console.error("generateToneImage error:", err?.error || err);

    const msg =
      err?.error?.message ||
      err?.message ||
      "Tone image failed";

    return res.status(err?.status || 500).json({ error: msg });
  }
}