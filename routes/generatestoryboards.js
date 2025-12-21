// routes/generatestoryboards.js
import { openai, asDataUrlFromB64 } from "../utils/openaiClient.js";

function toClientError(err, fallback = "Storyboard request failed") {
  const status = err?.status || err?.response?.status || 500;
  const msg =
    err?.error?.message ||
    err?.response?.data?.error?.message ||
    err?.message ||
    fallback;

  return { status, msg };
}

// tiny concurrency limiter (no deps)
async function mapWithLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let i = 0;

  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await mapper(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.max(1, limit) }, worker);
  await Promise.all(workers);
  return results;
}

export default async function generateStoryboards(req, res) {
  try {
    const { prompt, contentType, beats } = req.body || {};
    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: "Missing prompt" });
    }
    if (!Array.isArray(beats) || beats.length === 0) {
      return res.json({ frames: [] });
    }

    const frames = await mapWithLimit(beats, 2, async (beat, i) => {
      const imgPrompt = [
        `Black-and-white storyboard frame, pencil/ink concept art.`,
        `High contrast. Simple composition. Professional storyboarding.`,
        `NO text, NO typography, NO logos, NO watermarks.`,
        ``,
        `Story: ${prompt}`,
        `Type: ${contentType || ""}`,
        `Beat ${i + 1}: ${beat}`,
      ].join("\n");

      const img = await openai.images.generate({
        model: "gpt-image-1",
        prompt: imgPrompt,
        size: "1024x1024",
        response_format: "b64_json", // IMPORTANT
      });

      const b64 = img?.data?.[0]?.b64_json;
      const dataUrl = b64 ? asDataUrlFromB64(b64) : null;

      return { beatIndex: i, dataUrl };
    });

    return res.json({ frames });
  } catch (err) {
    console.error("generateStoryboards error:", err);
    const { status, msg } = toClientError(err, "Storyboards failed");
    const safeStatus = status >= 400 && status < 600 ? status : 500;
    return res.status(safeStatus).json({ error: msg });
  }
}