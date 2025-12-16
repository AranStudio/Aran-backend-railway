import express from "express";
import cors from "cors";
import router from "./routes/router.js";

const app = express();

// 1) Hard allowlist (your real origins)
const allowedOrigins = new Set([
  "https://www.aran.studio",
  "https://aran.studio",
  "http://localhost:5173",
  "http://localhost:3000",
]);

// 2) Always respond to preflight successfully (this prevents 502/edge weirdness)
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }

  if (req.method === "OPTIONS") {
    // end preflight immediately
    return res.status(204).end();
  }

  next();
});

// 3) CORS middleware for normal requests
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    return cb(null, false);
  }
}));

app.use(express.json({ limit: "20mb" }));

app.get("/", (_req, res) => res.json({ ok: true }));

app.use("/api", router);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Listening on", PORT));
