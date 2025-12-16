import { chatCompletion } from "../utils/openaiClient.js";

export default async function generate(req, res) {
  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    const result = await chatCompletion({ prompt });

    // Keep the response shape simple + consistent
    return res.json({ text: result.text });
  } catch (err) {
    console.error("Generate error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Generation failed",
      details: err.details || undefined
    });
  }
}
