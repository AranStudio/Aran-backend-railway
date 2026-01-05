import "dotenv/config";
import express from "express";
import cors from "cors";
import router from "./routes/router.js";

const app = express();

/**
 * ✅ CORS — must be FIRST, before json parsing + routes.
 * Supports:
 * - https://www.aran.studio
 * - https://aran.studio
 * - localhost dev
 * - optional extra origins via env (comma separated)
 */
const staticAllowedOrigins = [
  "https://www.aran.studio",
  "https://aran.studio",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080",
];

const allowedOrigins = new Set([
  ...staticAllowedOrigins,
  ...(process.env.WEB_ORIGINS
    ? process.env.WEB_ORIGINS.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : []),
]);

const parseOrigin = (origin) => {
  try {
    return new URL(origin);
  } catch {
    return null;
  }
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // allow server-to-server / curl
  const u = parseOrigin(origin);
  if (!u) return false;
  return allowedOrigins.has(`${u.protocol}//${u.host}`);
};

app.use(
  cors({
    origin: (origin, cb) => {
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  })
);

// Deck payloads can include base64 images (tone/visuals/storyboards) which can get large.
// 80mb keeps exports/saves reliable while still being a reasonable ceiling.
app.use(express.json({ limit: process.env.JSON_LIMIT || "80mb" }));

app.use("/api", router);

// Health check (nice for Railway)
app.get("/", (_req, res) => res.status(200).send("OK"));

// Error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Server error" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Aran API listening on", PORT);
});
