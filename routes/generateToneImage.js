// routes/generateToneImage.js
import { openai, asDataUrlFromB64 } from "../utils/openaiClient.js";

function toClientError(err, fallback = "Image request failed") {
  // openai SDK errors usually include: status, message, error
  const status = err?.status || err?.response?.status || 500;
  const msg =
    err?.error?.message ||
    err?.response?.data?.error?.message ||
    err?.message ||
    fallback;

  return { status, msg };
}

export default async function generateToneImage(req, res) {
  try {
    const { prompt, contentType, title, beats } = req.body || {};
    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const beatSnippet = Array.isArray(beats) ? beats.slice(0, 3).join(" / ") : "";
    const imgPrompt = [
      `Create one "tone frame" image for this story concept.`,
      `Cinematic, tasteful, professional.`,
      `NO text, NO typography, NO logos, NO watermarks.`,
      ``,
      `Story: ${prompt}`,
      `Title: ${title || ""}`,
      `Type: ${contentType || ""}`,
      `Key beats: ${beatSnippet}`,
    ].join("\n");

    const img = await openai.images.generate({
      model: "gpt-image-1",
      prompt: imgPrompt,
      size: "1024x1024",
      response_format: "b64_json", // IMPORTANT
    });

    const b64 = img?.data?.[0]?.b64_json;
    const dataUrl = b64 ? asDataUrlFromB64(b64) : null;

    return res.json({ images: dataUrl ? [{ dataUrl }] : [] });
  } catch (err) {
    console.error("generateToneImage error:", err);
    const { status, msg } = toClientError(err, "Tone image failed");
    // If it's a prompt/policy issue, don't lie with a 500.
    const safeStatus = status >= 400 && status < 600 ? status : 500;
    return res.status(safeStatus).json({ error: msg });
  }
}