import express from "express";
import cors from "cors";
import router from "./routes/router.js";

const app = express();

/**
 * Bulletproof CORS:
 * - allow aran.studio + www.aran.studio
 * - allow localhost for dev
 * - always reply to OPTIONS
 */
const allowedOrigins = new Set([
  "https://www.aran.studio",
  "https://aran.studio",
  "http://localhost:5173",
  "http://localhost:3000",
]);

const corsOptionsDelegate = (req, cb) => {
  const origin = req.header("Origin");

  // No Origin header (server-to-server, curl, etc.)
  if (!origin) return cb(null, { origin: false });

  if (allowedOrigins.has(origin)) {
    return cb(null, {
      origin: true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    });
  }

  // Explicitly deny unknown origins
  return cb(null, { origin: false });
};

// Force CORS middleware to run for all requests
app.use(cors(corsOptionsDelegate));

// Force-set headers as an extra failsafe (covers weird edge cases)
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }

  // Always end preflight cleanly
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({ limit: "20mb" }));

app.get("/", (_req, res) => res.json({ ok: true, service: "aran-api" }));

app.use("/api", router);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Aran API listening on ${PORT}`));
