import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use(cors({ origin: true }));

const PORT = process.env.PORT || 8080;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function clampBeats(arr, min = 4, max = 6) {
  const beats = (arr || []).filter(Boolean).map(String);
  if (beats.length < min) {
    const pad = [
      "Opening image and premise",
      "Inciting turn",
      "Rising complication",
      "Key reveal or emotional shift",
      "Climax",
      "Button / resolution",
    ];
    while (beats.length < min) beats.push(pad[beats.length] || "Next beat");
  }
  return beats.slice(0, max);
}

function safeJsonFromText(text) {
  if (!text) return null;
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  const maybe = text.slice(first, last + 1);
  try {
    return JSON.parse(maybe);
  } catch {
    return null;
  }
}

app.get("/", (_req, res) => res.json({ ok: true }));
app.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * POST /api/generate
 * Returns:
 * - title (string): short, premium, title-like phrase influenced by story type
 * - beats (4–6)
 */
app.post("/api/generate", async (req, res) => {
  try {
    const { prompt, contentType, styleHint, reimagine } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const type = contentType || "Any format";
    const hint = styleHint || "";
    const remix = reimagine ? "Yes" : "No";

    const system = [
      "You are ARAN, a professional story development assistant for film, commercials, and branded content.",
      "Return concise, industry-appropriate language.",
      "You must output valid JSON only (no markdown).",
      "Beats must be 4 to 6 items.",
      "Avoid cheesy phrasing and generic student-script language.",
    ].join(" ");

    const user = [
      `STORY TYPE: ${type}`,
      hint ? `STYLE NOTE: ${hint}` : "",
      `REIMAGINE: ${remix}`,
      "",
      `BRIEF: ${prompt}`,
      "",
      "Return JSON with keys:",
      "- title: a short, premium, title-like phrase (3–7 words) that fits the story type",
      "- beats: array of 4–6 beats, each 1–2 lines max, tailored to the story type",
      "",
      "If story type is a commercial, beats should include hook, product/hero moments, escalation, and a final button.",
      "If documentary, beats should feel grounded and observational.",
      "If music video, beats should be visual motifs and rhythm-driven.",
    ]
      .filter(Boolean)
      .join("\n");

    const r = await client.chat.completions.create({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini",
      temperature: reimagine ? 0.9 : 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const text = r?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonFromText(text) || {};

    const title = parsed?.title || parsed?.concept || "Untitled";
    const beats = clampBeats(parsed?.beats, 4, 6);

    return res.json({ title, beats });
  } catch (err) {
    console.error("generate error:", err);
    return res.status(500).json({
      error: "Generate failed",
      detail: err?.message || String(err),
    });
  }
});

/**
 * POST /api/generate-tone-image
 * Generates ONE B&W tone frame (base64 data URL).
 */
app.post("/api/generate-tone-image", async (req, res) => {
  try {
    const { prompt, contentType, title, beats } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const type = contentType || "Any format";
    const beatSummary = Array.isArray(beats) ? beats.join(" | ") : "";

    const imagePrompt = [
      `Black-and-white tone frame for a ${type}.`,
      title ? `Title: ${title}` : "",
      `Brief: ${prompt}`,
      beatSummary ? `Beats: ${beatSummary}` : "",
      "",
      "Style: cinematic still, high contrast monochrome, premium lighting, clean composition.",
      "No text, no logos, no watermarks.",
    ]
      .filter(Boolean)
      .join("\n");

    const img = await client.images.generate({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt: imagePrompt,
      size: "1024x1024",
    });

    const b64 = img?.data?.[0]?.b64_json || null;

    return res.json({
      images: [{ url: null, dataUrl: b64 ? `data:image/png;base64,${b64}` : null }],
    });
  } catch (err) {
    console.error("tone image error:", err);
    return res.status(500).json({
      error: "Tone image failed",
      detail: err?.message || String(err),
    });
  }
});

app.post("/api/generate-storyboards", async (req, res) => {
  try {
    const { prompt, contentType, beats } = req.body || {};
    if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "Missing prompt" });
    if (!Array.isArray(beats) || beats.length === 0) return res.status(400).json({ error: "Missing beats" });

    const type = contentType || "Any format";
    const results = [];

    for (let i = 0; i < beats.length; i++) {
      const beat = String(beats[i] || "").trim();
      const p = [
        `Black-and-white storyboard frame for a ${type}.`,
        `Brief: ${prompt}`,
        `Beat ${i + 1}: ${beat}`,
        "",
        "Style: pencil/ink storyboard, clean readable composition, high contrast, no text.",
      ].join("\n");

      const img = await client.images.generate({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
        prompt: p,
        size: "1024x1024",
      });

      const b64 = img?.data?.[0]?.b64_json || null;
      results.push({ beatIndex: i, dataUrl: b64 ? `data:image/png;base64,${b64}` : null });
    }

    return res.json({ ok: true, frames: results });
  } catch (err) {
    console.error("storyboards error:", err);
    return res.status(500).json({
      error: "Storyboards failed",
      detail: err?.message || String(err),
    });
  }
});

app.post("/api/generate-visuals", async (req, res) => {
  try {
    const { prompt, contentType, beats } = req.body || {};
    if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "Missing prompt" });
    if (!Array.isArray(beats) || beats.length === 0) return res.status(400).json({ error: "Missing beats" });

    const type = contentType || "Any format";
    const results = [];

    for (let i = 0; i < beats.length; i++) {
      const beat = String(beats[i] || "").trim();
      const p = [
        `Color cinematic frame for a ${type}.`,
        `Brief: ${prompt}`,
        `Beat ${i + 1}: ${beat}`,
        "",
        "Style: premium film still, modern color grade, clean composition, no text.",
      ].join("\n");

      const img = await client.images.generate({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
        prompt: p,
        size: "1024x1024",
      });

      const b64 = img?.data?.[0]?.b64_json || null;
      results.push({ beatIndex: i, dataUrl: b64 ? `data:image/png;base64,${b64}` : null });
    }

    return res.json({ ok: true, frames: results });
  } catch (err) {
    console.error("visuals error:", err);
    return res.status(500).json({
      error: "Visuals failed",
      detail: err?.message || String(err),
    });
  }
});

app.listen(PORT, () => console.log(`ARAN backend listening on :${PORT}`));
