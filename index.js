import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();

/* =========================
   CORS — THIS IS THE FIX
   ========================= */
const allowedOrigins = [
  "https://www.aran.studio",
  "https://aran.studio",
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow server-to-server and tools with no Origin header
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("CORS blocked origin: " + origin));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// IMPORTANT: handle preflight requests explicitly
app.options("*", cors());

/* =========================
   BODY PARSING
   ========================= */
app.use(express.json({ limit: "20mb" }));

/* =========================
   HEALTH CHECK
   ========================= */
app.get("/", (req, res) => {
  res.json({ status: "aran backend alive" });
});

/* =========================
   GENERATE ENDPOINT
   ========================= */
app.post("/api/generate", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await openaiRes.json();

    res.json({
      text: data.choices?.[0]?.message?.content ?? "",
    });

  } catch (err) {
    console.error("Generate error:", err);
    res.status(500).json({ error: "Generation failed" });
  }
});

/* =========================
   SERVER START
   ========================= */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Aran backend listening on port", PORT);
});
