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
const allowedOrigins = new Set([
  "https://www.aran.studio",
  "https://aran.studio",
  "http://localhost:5173",
  "http://localhost:3000",
  ...(process.env.WEB_ORIGINS ? process.env.WEB_ORIGINS.split(",").map(s => s.trim()).filter(Boolean) : [])
]);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser clients (curl/postman) that may not send Origin
    if (!origin) return callback(null, true);

    if (allowedOrigins.has(origin)) return callback(null, true);

    // Helpful log so you immediately see the blocked origin in Railway logs
    console.warn("CORS blocked origin:", origin);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
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
