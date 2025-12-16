// index.js
import express from "express";
import cors from "cors";
import router from "./router.js";

const app = express();

/* =========================
   CORS (must be before routes)
   ========================= */
const allowedOrigins = new Set([
  "https://www.aran.studio",
  "https://aran.studio",
  "http://localhost:5173",
  "http://localhost:3000",
]);

const corsMiddleware = cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin}`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

app.use(corsMiddleware);
app.options("*", corsMiddleware);

app.use(express.json({ limit: "20mb" }));

// Health check
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "aran-api" });
});

// Mount all API routes at /api
app.use("/api", router);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Aran API listening on ${PORT}`);
});
