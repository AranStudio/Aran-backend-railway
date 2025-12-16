import express from "express";
import cors from "cors";

const app = express();

/* =========================
   CORS (must come before routes)
   ========================= */
const allowedOrigins = new Set([
  "https://www.aran.studio",
  "https://aran.studio",
  "http://localhost:5173",
  "http://localhost:3000",
]);

app.use(
  cors({
    origin(origin, cb) {
      // allow server-to-server and tools with no Origin header
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked origin: ${origin}`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Explicitly handle preflight
app.options("*", cors());

/* =========================
   JSON parsing
   ========================= */
app.use(express.json({ limit: "20mb" }));

/* =========================
   Health check
   ========================= */
app.get("/", (req, res) => {
  res.json({ ok: true, service: "aran-backend" });
});

/* =========================
   Generate endpoint (keeps your route)
   ========================= */
app.post("/api/generate", async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });
    if (!process.env.OPENAI_API_KEY)
      return res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });

    // Node 22 has global fetch
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
      return res.status(r.status).json({ error: "OpenAI request failed", details: data });
    }

    res.json({ text: data?.choices?.[0]?.message?.content ?? "" });
  } catch (err) {
    console.error("Generate error:", err);
    res.status(500).json({ error: "Generation failed" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Listening on", PORT));
