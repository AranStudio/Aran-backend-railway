import express from "express";
import cors from "cors";
import router from "./routes/router.js";

const app = express();

const allowedOrigins = new Set([
  "https://www.aran.studio",
  "https://aran.studio",
  "http://localhost:5173",
  "http://localhost:3000",
]);

// Handle CORS + preflight early and safely
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

// Standard CORS middleware (fine to keep)
app.use(cors());

// Body parsing
app.use(express.json({ limit: "20mb" }));

// Health check
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "aran-api" });
});

// Routes
app.use("/api", router);

// Error handler (helps logs be readable)
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Server error" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Aran API listening on", PORT);
});
