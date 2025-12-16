const express = require("express");

const app = express();

// ---- PROVE DEPLOYMENT ----
app.get("/__version", (req, res) => {
  res.setHeader("X-ARAN-BACKEND", "cors-fix-v2");
  res.json({ ok: true, version: "cors-fix-v2" });
});

// ---- BULLETPROOF CORS ----
const allowed = new Set([
  "https://www.aran.studio",
  "https://aran.studio",
  "http://localhost:5173",
  "http://localhost:3000",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  // Allow headers/methods the browser preflight asks for
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  // If you're not using cookies across domains, keep this OFF.
  // res.setHeader("Access-Control-Allow-Credentials", "true");

  // Preflight: return immediately
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

app.use(express.json({ limit: "20mb" }));

// ---- HEALTH ----
app.get("/", (req, res) => res.json({ status: "ok" }));

// ---- YOUR ROUTES ----
// Keep your existing logic here. Example placeholder:
app.post("/api/generate", async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    // TODO: keep your existing generation code here
    return res.json({ text: "ok (wire your existing generate logic here)" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Generation failed" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Listening on", PORT));
