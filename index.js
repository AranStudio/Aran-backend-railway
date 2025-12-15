// index.js - Express backend for ARAN (beats + boards + visuals)

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// --- OpenAI client ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Limit how many frames we generate images for per request
const MAX_IMAGE_FRAMES = 6;

// --- Middleware ---
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:4173",
      "https://www.aran.studio",
      "https://aran.studio",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// --- Health check ---
app.get("/api/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
//  /api/generate  → beats only (title + frames)
// ─────────────────────────────────────────────
app.post("/api/generate", async (req, res) => {
  try {
    const { prompt, contentType, references } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const typeText = contentType || "Any story – let Aran decide";
    const refsText =
      Array.isArray(references) && references.length
        ? references
            .map(
              (r) => `${r.title || "Untitled"} (${r.aspect || "general"})`
            )
            .join("; ")
        : "No explicit references.";

    const systemPrompt =
      "You are ARAN, a story engine that returns clean JSON only. " +
      'Return strictly valid JSON in this shape: ' +
      '{ "title": string, "style": string, "frames": [ { "description": string } ] }. ' +
      "Use around 8–16 beats. No extra text.";

    const userPrompt = `
Story type: ${typeText}
References: ${refsText}

User idea:
${prompt}
    `.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.9,
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("[ARAN] /api/generate JSON parse error:", err, raw);
      return res
        .status(500)
        .json({ error: "Failed to parse JSON from OpenAI." });
    }

    const title = parsed.title || "Untitled Story";
    const style =
      parsed.style ||
      `${typeText} shaped by ARAN with references: ${refsText}`;
    const frames =
      Array.isArray(parsed.frames) && parsed.frames.length
        ? parsed.frames.map((f) => ({
            description:
              typeof f === "string"
                ? f
                : (f && f.description) || "",
          }))
        : [];

    if (!frames.length) {
      return res
        .status(500)
        .json({ error: "No frames returned from OpenAI." });
    }

    console.log(
      `[ARAN] /api/generate returned ${frames.length} frames for "${title}"`
    );

    res.json({ title, style, frames });
  } catch (err) {
    console.error("[ARAN] /api/generate error:", err);
    res.status(500).json({ error: "Beat generation failed." });
  }
});

// ─────────────────────────────────────────────
//  /api/generate-storyboards  → B&W boards
// ─────────────────────────────────────────────
app.post("/api/generate-storyboards", async (req, res) => {
  try {
    const { frames } = req.body || {};

    if (!Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: "Missing frames" });
    }

    const limitedFrames = frames.slice(0, MAX_IMAGE_FRAMES);
    console.log(
      `[ARAN] /api/generate-storyboards generating B&W for ${limitedFrames.length} frame(s)`
    );

    const storyboardPromises = limitedFrames.map(async (frame, index) => {
      const desc =
        (frame && frame.description) ||
        "A cinematic black-and-white storyboard frame.";

   const img = await openai.images.generate({
  model: "gpt-image-1",
  prompt: `black and white pencil storyboard sketch... Beat description: ${desc}`,
  size: "1536x1024",
  n: 1,
  response_format: "b64_json",
});

const b64 = img.data?.[0]?.b64_json || null;
const url = b64 ? `data:image/png;base64,${b64}` : null;
return { url };


    const storyboards = await Promise.all(storyboardPromises);

    res.json({ storyboards });
  } catch (err) {
    console.error("[ARAN] /api/generate-storyboards error:", err);
    res.status(500).json({
      error: "Storyboard generation failed.",
      detail: err?.message || String(err),
    });
  }
});

// ─────────────────────────────────────────────
//  /api/generate-images  → Color visuals
// ─────────────────────────────────────────────
app.post("/api/generate-images", async (req, res) => {
  try {
    const { frames, style } = req.body || {};

    if (!Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: "Missing frames" });
    }

    const limitedFrames = frames.slice(0, MAX_IMAGE_FRAMES);
    console.log(
      `[ARAN] /api/generate-images generating color for ${limitedFrames.length} frame(s)`
    );

    const imagePromises = limitedFrames.map(async (frame, index) => {
      const desc =
        (frame && frame.description) ||
        "A cinematic color frame from the story.";

  const img = await openai.images.generate({
  model: "gpt-image-1",
  prompt: `cinematic color concept art: ${desc}`,
  size: "1536x1024",
  n: 1,
  response_format: "b64_json",
});

const b64 = img.data?.[0]?.b64_json || null;
const url = b64 ? `data:image/png;base64,${b64}` : null;
return { url };


    const images = await Promise.all(imagePromises);

    res.json({ images });
  } catch (err) {
    console.error("[ARAN] /api/generate-images error:", err);
    res.status(500).json({
      error: "Image generation failed.",
      detail: err?.message || String(err),
    });
  }
});

// ─────────────────────────────────────────────
//  (Placeholder auth routes so frontend doesn’t break)
// ─────────────────────────────────────────────
app.post("/api/auth/signup", (req, res) => {
  // Placeholder only – real auth can be added later.
  res.json({ ok: true, mode: "signup-placeholder" });
});

app.post("/api/auth/login", (req, res) => {
  // Placeholder only – real auth can be added later.
  res.json({ ok: true, mode: "login-placeholder" });
});

// ─────────────────────────────────────────────
//  Start server
// ─────────────────────────────────────────────
app.listen(port, () => {
  console.log(`[ARAN] API listening on port ${port}`);
});
