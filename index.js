import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use(cors({ origin: true }));

const PORT = process.env.PORT || 8080;

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY in environment.");
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Helpers
 */
function clampBeats(arr, min = 4, max = 6) {
  const beats = (arr || []).filter(Boolean).map(String);
  if (beats.length < min) {
    // pad with generic beats if the model under-delivers
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
  // Try to find a JSON object in a messy response (because models love vibes).
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

function requireFields(obj, fields) {
  for (const f of fields) {
    if (obj?.[f] === undefined || obj?.[f] === null) return false;
  }
  return true;
}

/**
 * Health
 */
app.get("/", (_req, res) => res.json({ ok: true }));
app.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * POST /api/generate
 * Returns 4–6 beats + a cleaned-up one-line concept.
 */
app.post("/api/generate", async (req, res) => {
  try {
    const { prompt, contentType } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const type = contentType || "Any format";

    const system = [
      "You are ARAN, a professional story development assistant for film, commercials, and branded content.",
      "Return concise, industry-appropriate language.",
      "You must output valid JSON only (no markdown).",
      "Beats must be 4 to 6 items.",
    ].join(" ");

    const user = [
      `FORMAT: ${type}`,
      `BRIEF: ${prompt}`,
      "",
      "Return JSON with keys:",
      `- concept (string, one line, not cheesy)`,
      `- beats (array of 4-6 short beats, each 1-2 lines max)`,
    ].join("\n");

    // NOTE: NO response_format here. That’s what broke you.
    const r = await client.chat.completions.create({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const text = r?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonFromText(text) || null;

    const concept = parsed?.concept || "";
    const beats = clampBeats(parsed?.beats, 4, 6);

    if (!concept || !Array.isArray(beats)) {
      // fallback: brutally simple parse attempt
      return res.json({
        concept: concept || "Concept",
        beats,
        raw: text,
      });
    }

    return res.json({ concept, beats });
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
    const { prompt, contentType, concept, beats } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const type = contentType || "Any format";
    const beatSummary = Array.isArray(beats) ? beats.join(" | ") : "";

    const imagePrompt = [
      `Black-and-white tone frame for a ${type}.`,
      `Concept: ${concept || ""}`,
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

    // Return both fields to be compatible with earlier frontend expectations.
    return res.json({
      images: [
        {
          url: null,
          dataUrl: b64 ? `data:image/png;base64,${b64}` : null,
        },
      ],
    });
  } catch (err) {
    console.error("tone image error:", err);
    return res.status(500).json({
      error: "Tone image failed",
      detail: err?.message || String(err),
    });
  }
});

/**
 * POST /api/generate-storyboards
 * B&W storyboard per beat (array of images aligned with beats).
 */
app.post("/api/generate-storyboards", async (req, res) => {
  try {
    const { prompt, contentType, beats } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing prompt" });
    }
    if (!Array.isArray(beats) || beats.length === 0) {
      return res.status(400).json({ error: "Missing beats" });
    }

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
      results.push({
        beatIndex: i,
        dataUrl: b64 ? `data:image/png;base64,${b64}` : null,
      });
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

/**
 * POST /api/generate-visuals
 * Color cinematic frames per beat.
 */
app.post("/api/generate-visuals", async (req, res) => {
  try {
    const { prompt, contentType, beats } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing prompt" });
    }
    if (!Array.isArray(beats) || beats.length === 0) {
      return res.status(400).json({ error: "Missing beats" });
    }

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
      results.push({
        beatIndex: i,
        dataUrl: b64 ? `data:image/png;base64,${b64}` : null,
      });
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

app.listen(PORT, () => {
  console.log(`ARAN backend listening on :${PORT}`);
});
