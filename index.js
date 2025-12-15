import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const MIN_BEATS = 4;
const MAX_BEATS = 6;
const MAX_IMAGE_FRAMES = 6;

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "12mb" }));

// ✅ Signature header so you can prove responses come from the API
app.use((req, res, next) => {
  res.setHeader("x-aran-api", "true");
  next();
});

const safeString = (x) => (typeof x === "string" ? x : "");

function referencesToText(references) {
  if (!Array.isArray(references) || !references.length) return "None.";
  return references
    .map((r) => `${safeString(r.title).trim() || "Untitled"} (${safeString(r.aspect).trim() || "general"})`)
    .join("; ");
}

function normalizeFrames(frames) {
  if (!Array.isArray(frames)) return [];
  const cleaned = frames
    .map((f) => {
      if (typeof f === "string") return { description: f.trim() };
      if (f && typeof f === "object") return { description: safeString(f.description).trim() };
      return { description: "" };
    })
    .filter((f) => f.description.length > 0);
  return cleaned.slice(0, MAX_BEATS);
}

function dataUrlFromB64(b64) {
  return b64 ? `data:image/png;base64,${b64}` : null;
}

async function generateSingleImageDataUrl(prompt, size = "1536x1024") {
  const img = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size,
    n: 1,
    response_format: "b64_json",
  });

  const b64 = img?.data?.[0]?.b64_json || null;
  return dataUrlFromB64(b64);
}

// Health
app.get("/", (req, res) => res.json({ ok: true, service: "aran-api" }));
app.get("/health", (req, res) => res.json({ ok: true }));

// ✅ Ping routes so testing in browser doesn’t show “Cannot GET …”
app.get("/api/generate-images", (req, res) => {
  res.json({ ok: true, method: "GET", hint: "Use POST with { frames: [{description}], style? }" });
});
app.get("/api/generate-storyboards", (req, res) => {
  res.json({ ok: true, method: "GET", hint: "Use POST with { frames: [{description}] }" });
});
app.get("/api/generate", (req, res) => {
  res.json({ ok: true, method: "GET", hint: "Use POST with { prompt, contentType, references }" });
});

// Beats: 4–6
app.post("/api/generate", async (req, res) => {
  try {
    const { prompt, contentType, references } = req.body || {};
    const userPrompt = safeString(prompt).trim();
    if (!userPrompt) return res.status(400).json({ error: "Missing prompt" });

    const typeText = safeString(contentType).trim() || "Any story – let Aran decide";
    const refsText = referencesToText(references);

    const system = `
You are ARAN, a creative development assistant.

Return STRICT JSON ONLY matching:
{
  "title": "string",
  "style": "string",
  "frames": [{ "description": "string" }]
}

Rules:
- Return ${MIN_BEATS} to ${MAX_BEATS} beats (MAX ${MAX_BEATS}).
- Beats are professional treatment beats (no dialogue, no screenplay formatting).
- One short paragraph per beat max. No filler.
- "style" is concise visual direction.
`.trim();

    const user = `
Story type: ${typeText}
References: ${refsText}

Concept:
${userPrompt}

Output JSON now.
`.trim();

    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.8,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) parsed = JSON.parse(raw.slice(start, end + 1));
      else return res.status(500).json({ error: "Model did not return valid JSON", raw });
    }

    const title = safeString(parsed.title).trim() || "Untitled Story";
    const style = safeString(parsed.style).trim() || "";
    const frames = normalizeFrames(parsed.frames);

    if (!frames.length) return res.status(500).json({ error: "No beats returned" });

    res.json({ title, style, frames });
  } catch (err) {
    console.error("[ARAN] /api/generate error:", err);
    res.status(500).json({ error: "Generate failed" });
  }
});

// Color images (hero or per-beat visuals)
app.post("/api/generate-images", async (req, res) => {
  try {
    const { frames, style } = req.body || {};
    if (!Array.isArray(frames) || !frames.length) return res.status(400).json({ error: "Missing frames" });

    const limited = frames.slice(0, MAX_IMAGE_FRAMES);
    const styleText = safeString(style).trim();

    const images = [];
    for (const f of limited) {
      const desc = typeof f === "string" ? f : safeString(f?.description);
      const prompt = `
Create a single cinematic color frame.
${styleText ? `Style: ${styleText}` : ""}
Rules:
- No text.
- Premium film/commercial composition.
Scene:
${desc}
`.trim();

      const url = await generateSingleImageDataUrl(prompt);
      images.push({ url });
    }

    res.json({ images });
  } catch (err) {
    console.error("[ARAN] /api/generate-images error:", err);
    res.status(500).json({ error: "Image generation failed" });
  }
});

// B&W storyboards
app.post("/api/generate-storyboards", async (req, res) => {
  try {
    const { frames } = req.body || {};
    if (!Array.isArray(frames) || !frames.length) return res.status(400).json({ error: "Missing frames" });

    const limited = frames.slice(0, MAX_IMAGE_FRAMES);
    const storyboards = [];

    for (const f of limited) {
      const desc = typeof f === "string" ? f : safeString(f?.description);
      const prompt = `
RUDIMENTARY BLACK-AND-WHITE STORYBOARD SKETCH.
Quick director-style pencil drawing. Minimal detail. No text.

Scene:
${desc}
`.trim();

      const url = await generateSingleImageDataUrl(prompt);
      storyboards.push({ url });
    }

    res.json({ storyboards });
  } catch (err) {
    console.error("[ARAN] /api/generate-storyboards error:", err);
    res.status(500).json({ error: "Storyboard generation failed" });
  }
});

app.listen(port, () => console.log(`[ARAN] API listening on ${port}`));
