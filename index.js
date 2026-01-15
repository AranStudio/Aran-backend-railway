import "dotenv/config";
import express from "express";
import router from "./routes/router.js";
import stripeWebhook from "./routes/stripeWebhook.js";

/**
 * Aran API — hardened CORS + preflight
 * Fixes: browser preflight failing with missing Access-Control-Allow-Origin
 */

const app = express();

/* -------------------- CORS -------------------- */
const staticAllowedOrigins = [
  "https://www.aran.studio",
  "https://aran.studio",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080",
];

const extraOrigins = (process.env.WEB_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = new Set([...staticAllowedOrigins, ...extraOrigins]);

const allowAllOrigins =
  String(process.env.CORS_ALLOW_ALL || "").toLowerCase() === "true";

function normalizeOrigin(origin) {
  try {
    const u = new URL(origin);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Allow Vercel preview deploys if needed (optional):
 * Set CORS_ALLOW_VERCEL_PREVIEWS=true
 */
const allowVercelPreviews =
  String(process.env.CORS_ALLOW_VERCEL_PREVIEWS || "").toLowerCase() === "true";

function isVercelPreview(normOrigin) {
  // e.g. https://aran-frontend-git-branch-username.vercel.app
  return allowVercelPreviews && /\.vercel\.app$/i.test(normOrigin);
}

function isAllowedOrigin(origin) {
  if (allowAllOrigins) return true;
  if (!origin) return true; // curl/server-to-server
  const norm = normalizeOrigin(origin);
  if (!norm) return false;
  if (allowedOrigins.has(norm)) return true;
  if (/\.aran\.studio$/i.test(new URL(norm).hostname)) return true;
  if (isVercelPreview(norm)) return true;
  return false;
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;

  const norm = normalizeOrigin(origin) || origin;

  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", norm);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );

    // Echo requested headers if present (covers Authorization + any custom headers)
    const reqHeaders = req.headers["access-control-request-headers"];
    res.setHeader(
      "Access-Control-Allow-Headers",
      reqHeaders || "Content-Type, Authorization"
    );

    // Cache preflight for a day
    res.setHeader("Access-Control-Max-Age", "86400");
  }
}

// CORS + preflight must be first (before body parsing + routes)
app.use((req, res, next) => {
  applyCors(req, res);

  // Always answer preflight quickly.
  if (req.method === "OPTIONS") {
    // If origin is not allowed, still respond 204 without CORS headers.
    // Browser will block it, but this avoids noisy 404/500s.
    return res.status(204).send("");
  }
  return next();
});

/* -------------------- Stripe webhook (RAW body) -------------------- */
app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhook);

/* -------------------- Body parsing -------------------- */
// Large payload support (base64 images can be big)
app.use(express.json({ limit: process.env.JSON_LIMIT || "80mb" }));

/* -------------------- Routes -------------------- */
app.use("/api", router);

// Health check (nice for Railway)
app.get("/", (_req, res) => res.status(200).send("OK"));

/* -------------------- Error handler -------------------- */
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err);

  // Ensure CORS headers exist on error responses too
  applyCors(req, res);

  const msg = err?.message || "Server error";
  const lower = String(msg).toLowerCase();

  if (lower.includes("cors") && lower.includes("origin")) {
    return res.status(403).json({ error: msg });
  }

  return res.status(err?.status || 500).json({ error: msg });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Aran API listening on", PORT);
});
