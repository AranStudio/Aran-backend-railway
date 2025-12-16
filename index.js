import express from "express";
import cors from "cors";

const app = express();

/* =========================
   CORS — MUST BE FIRST
   ========================= */
const allowedOrigins = [
  "https://www.aran.studio",
  "https://aran.studio",
  "http://localhost:5173",
  "http://localhost:3000",
];

const corsMiddleware = cors({
  origin(origin, cb) {
    // allow non-browser tools
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("CORS blocked: " + origin));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

// Apply CORS to *everything*
app.use(corsMiddleware);

// This line is critical: it prevents OPTIONS from 404ing
app.options("*", corsMiddleware);

/* =========================
   BODY PARSER
   ========================= */
app.use(express.json({ limit: "20mb" }));

/* =========================
   HEALTH CHECK
   ========================= */
app.get("/", (_req, res) => {
  res.json({ ok: true });
});

/* =========================
   GENERATE
   ========================= */
app.post("/api/generate", async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY missing" });
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      console.error("OpenAI error:", data);
      return res.status(500).json({ error: "OpenAI failed" });
    }

    res.json({
      text: data.choices?.[0]?.message?.content ?? "",
    });
  } catch (err) {
    console.error("Generate failed:", err);
    res.status(500).json({ error: "Generation failed" });
  }
});

/* =========================
   START SERVER
   ========================= */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Aran backend listening on", PORT);
});
