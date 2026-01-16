import { openai } from "../utils/openaiClient.js";

function stripDataUrl(dataUrl) {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:(image\/\w+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], b64: m[2] };
}

export default async function whiteboardInterpret(req, res) {
  try {
    const { image, contentTypeHint, intent } = req.body || {};
    const parsed = stripDataUrl(image) || { mime: "image/png", b64: image };

    if (!parsed?.b64) {
      return res.status(400).json({ error: "Missing image (dataURL or base64)" });
    }

    const system =
      "You are Aran, a story engine. Return ONLY valid JSON with this exact shape: " +
      "{\n" +
      "  \"title\": \"short title\",\n" +
      "  \"contentType\": \"film|commercial|doc|music video|storybook|podcast|other\",\n" +
      "  \"prompt\": \"refined prompt/brief\",\n" +
      "  \"beats\": [\"beat 1\", \"beat 2\", \"...\"]\n" +
      "}\n" +
      "No markdown. No extra keys. Beats must be visual, filmable, ordered.";

    const userText =
      `Interpret this sketch and turn it into a strong creative brief and beats.\n` +
      `Optional content type hint: ${contentTypeHint || ""}\n` +
      `User intent: ${intent || ""}`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "image_url",
              image_url: { url: `data:${parsed.mime};base64,${parsed.b64}` },
            },
          ],
        },
      ],
    });

    const text = resp?.choices?.[0]?.message?.content || "{}";
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (!json) {
      return res.status(502).json({ error: "Model returned invalid JSON", raw: text });
    }

    const title = String(json.title || "Untitled").slice(0, 140);
    const contentType = String(json.contentType || "other").slice(0, 48);
    const prompt = String(json.prompt || "").trim();
    const beats = Array.isArray(json.beats)
      ? json.beats.map((b) => String(b).trim()).filter(Boolean).slice(0, 12)
      : [];

    if (!prompt || beats.length < 3) {
      return res.status(502).json({
        error: "Model returned an incomplete result",
        raw: json,
      });
    }

    return res.json({ title, contentType, prompt, beats });
  } catch (err) {
    console.error("whiteboard interpret error:", err);
    return res.status(500).json({ error: err?.message || "Whiteboard interpret failed" });
  }
}
