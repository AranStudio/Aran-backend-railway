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
  "http://localhost:3000"
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
  const parsed = parseOrigin(origin);
  if (!parsed) return false;

  // Normalize to protocol + host (includes port if present)
  const normalizedOrigin = `${parsed.protocol}//${parsed.host}`;

  // Explicit allow-list entries (including env-provided values)
  if (allowedOrigins.has(normalizedOrigin)) return true;

  // Allow any aran.studio subdomain (covers preview URLs, custom ports, etc.)
  if (parsed.hostname === "aran.studio" || parsed.hostname.endsWith(".aran.studio")) return true;

  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser clients (curl/postman) that may not send Origin
    if (!origin) return callback(null, true);

    if (isAllowedOrigin(origin)) return callback(null, true);

    // Helpful log so you immediately see the blocked origin in Railway logs
    console.warn("CORS blocked origin:", origin);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  // Allow any request headers so preflight succeeds even if the frontend adds more
  // (e.g., Supabase, Stripe, or future auth headers)
  allowedHeaders: "*",
  maxAge: 86400
};

// ✅ Apply CORS BEFORE everything else
app.use(cors(corsOptions));

// ✅ Explicitly handle ALL preflight requests
app.options("*", cors(corsOptions));

// Body parsing
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Routes
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
