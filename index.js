import "dotenv/config";
import express from "express";
import cors from "cors";
import router from "./routes/router.js";

const app = express();

/**
 * ✅ CORS — must be FIRST, before json parsing + routes.
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
    ? process.env.WEB_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : []),
]);

const parseOrigin = (origin) => {
  try {
    return new URL(origin);
  } catch {
    return null;
  }
};

const normalizeOrigin = (origin) => {
  const u = parseOrigin(origin);
  if (!u) return null;
  return `${u.protocol}//${u.host}`;
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // allow curl / server-to-server
  const norm = normalizeOrigin(origin);
  if (!norm) return false;
  return allowedOrigins.has(norm);
};

const corsOptions = {
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked origin: ${origin}`));
  },
  // IMPORTANT: If you are NOT using cookies/sessions, set this to false.
  // Keeping true can cause stricter browser behavior.
  credentials: false,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

// Apply CORS to ALL requests
app.use(cors(corsOptions));

// Guarantee preflight always works for ALL paths
app.options("*", cors(corsOptions));

// Large payload support (base64 images can be big)
app.use(express.json({ limit: process.env.JSON_LIMIT || "80mb" }));

app.use("/api", router);

// Health check (nice for Railway)
app.get("/", (_req, res) => res.status(200).send("OK"));

// Error handler — also ensure allowed origins still get CORS headers even on errors
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err);

  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    // Ensure CORS headers exist on error responses too
    res.setHeader("Access-Control-Allow-Origin", normalizeOrigin(origin) || origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", corsOptions.methods.join(","));
    res.setHeader("Access-Control-Allow-Headers", corsOptions.allowedHeaders.join(","));
  }

  // If it's a CORS block, respond 403 (clearer than 500)
  if (String(err?.message || "").toLowerCase().includes("cors blocked")) {
    return res.status(403).json({ error: err.message });
  }

  return res.status(500).json({ error: "Server error" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Aran API listening on", PORT);
});
