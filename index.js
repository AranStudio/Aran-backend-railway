import express from "express";
import cors from "cors";
import router from "./routes/router.js";

const app = express();

/* =========================
   HARD STOP CORS + PREFLIGHT
   ========================= */
const allowedOrigins = new Set([
  "https://www.aran.studio",
  "https://aran.studio",
  "http://localhost:5173",
  "http://localhost:3000",
]);

// Absolute first middleware: handle OPTIONS ourselves
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
  }

  // End preflight immediately so nothing downstream can 502
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

// Normal CORS for real requests
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      return cb(null, false);
    },
  })
);

/* =========================
   BODY PARSING
   ========================= */
app.use(express.json({ limit: "20mb" }));

/* =========================
   HEALTH CHECK
   ========================= */
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "aran-api" });
});

/* =========================
   ROUTES
   ========================= */
app.use("/api", router);

/* =========================
   START SERVER
   ========================= */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Aran API listening on ${PORT}`);
});
