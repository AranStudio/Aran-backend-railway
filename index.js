// index.js - super simple Express backend for Aran

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// --- BODY PARSER (CRITICAL) ---
app.use(express.json());

// --- CORS (ALLOW FRONTEND DOMAINS) ---
app.use(
  cors({
    origin: [
      "https://aran.studio",
      "https://www.aran.studio",
      "https://aran-frontend-service.vercel.app",
      "http://localhost:5173"
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// Preflight
app.options("*", cors());

// --- OPENAI CLIENT ---
if (!process.env.OPENAI_API_KEY) {
  console.warn("[ARAN] WARNING: No OPENAI_API_KEY found in environment.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// --- HEALTH CHECK ---
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "aran-api-service" });
});

// --- /api/generate ---
app.post("/api/generate", async (req, res) => {
  try {
    const { prompt, contentType, references } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const refs = Array.isArray(references) ? references : [];
    const refText =
      refs.length > 0
        ? "Take inspiration from these references: " +
          refs
            .map((r) => `${r.title || "Untitled"} (${r.aspect || "general"})`)
            .join(", ") +
          "."
        : "";

    const typeText = contentType
      ? `The content type is: ${contentType}.`
      : "The content type is flexible.";

  const systemPrompt =
  'You are "Aran", a story-deck engine. You MUST respond with STRICT JSON ONLY, with this shape: ' +
  `{
    "title": string,
    "style": string,
    "story": string,
    "frames": [
      { "description": string }
    ]
  } ` +
  'Use 8–12 frames. The "story" field should be a short 1–3 paragraph narrative that ties all the frames together. No extra fields, no commentary, JSON only.';


    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `User prompt: ${prompt}\n${typeText}\n${refText}`.trim()
        }
      ]
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("[ARAN] Failed to parse JSON from model:", raw);
      return res
        .status(500)
        .json({ error: "Model returned invalid JSON for deck." });
    }

    if (!Array.isArray(parsed.frames)) {
      parsed.frames = [];
    }

    res.json(parsed);
  } catch (err) {
    console.error("[ARAN] /api/generate error:", err);
    res.status(500).json({ error: "Deck generation failed." });
  }
});

// --- /api/generate-storyboards ---
app.post("/api/generate-storyboards", async (req, res) => {
  try {
    const { frames } = req.body || {};
    if (!Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: "Missing frames" });
    }

    const storyboards = [];

    for (const frame of frames) {
      const desc = frame.description || "A cinematic moment.";

      const img = await openai.images.generate({
        model: "gpt-image-1",
        prompt: `black and white pencil storyboard sketch, cinematic, 16:9, no text, for this beat: ${desc}`,
        size: "1024x576",
        n: 1
      });

      const url = img.data?.[0]?.url || null;
      storyboards.push({ url });
    }

    res.json({ storyboards });
  } catch (err) {
    console.error("[ARAN] /api/generate-storyboards error:", err);
    res.status(500).json({ error: "Storyboard generation failed." });
  }
});

// --- /api/generate-images ---
app.post("/api/generate-images", async (req, res) => {
  try {
    const { frames, style } = req.body || {};
    if (!Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: "Missing frames" });
    }

    const images = [];

    for (const frame of frames) {
      const desc = frame.description || "A cinematic shot.";

      const styleText = style
        ? `The visual style should follow: ${style}.`
        : "Cinematic color concept art.";

      const img = await openai.images.generate({
        model: "gpt-image-1",
        prompt: `${styleText} Create a color frame for this beat: ${desc}`,
        size: "1024x576",
        n: 1
      });

      const url = img.data?.[0]?.url || null;
      images.push({ url });
    }

    res.json({ images });
  } catch (err) {
    console.error("[ARAN] /api/generate-images error:", err);
    res.status(500).json({ error: "Image generation failed." });
  }
});

// --- START SERVER ---
app.listen(port, () => {
  console.log(`[ARAN] API listening on port ${port}`);
});
