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

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.use(cors());
app.use(express.json({ limit: "20mb" }));

// Always respond quickly on root
app.get("/", (_req, res) => {
  res.status(200).json({ ok: true, service: "aran-api", ts: Date.now() });
});

// Mount API
app.use("/api", router);

// Basic error handler (so crashes show up cleanly)
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Server error" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("listening", PORT));
});
