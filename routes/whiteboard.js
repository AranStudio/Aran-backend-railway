import { openai } from "../utils/openaiClient.js";

function extractB64(img) {
  if (!img) return "";
  if (img.includes("base64,")) return img.split("base64,")[1] || "";
  return img;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default async function whiteboardInterpret(req, res) {
  try {
    const { image, contentTypeHint, intent } = req.body || {};

    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "Missing image" });
    }

    const b64 = extractB64(image);

    const system =
      "You are Aran, a story engine for filmmakers and creatives. " +
      "Interpret a user sketch and turn it into a concise, usable story brief.";

    const userText =
      `Content type hint: ${contentTypeHint || "(none)"}\n` +
      `User intent: ${intent || "Turn this sketch into a story prompt and beats."}\n\n` +
      "Return ONLY valid JSON with keys: title, contentType, prompt, beats (array of 6-12 strings).";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
          ],
        },
      ],
    });

    const content = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(content);

    if (!parsed) {
      return res.json({ raw: content });
    }

    // Normalize
    const beats = Array.isArray(parsed.beats) ? parsed.beats.filter(Boolean).slice(0, 16) : [];

    return res.json({
      title: parsed.title || "",
      contentType: parsed.contentType || "",
      story_type: "canvas", // Canvas/whiteboard always uses 'canvas' story_type
      prompt: parsed.prompt || "",
      beats,
    });
  } catch (err) {
    console.error("/whiteboard/interpret error:", err);
    return res.status(500).json({ error: "Failed to interpret sketch" });
  }
}
