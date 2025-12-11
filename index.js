// index.js  (Railway backend entry)

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import generateHandler from "./api/generate.js";
import generateStoryboardsHandler from "./api/generate-storyboards.js";
import generateImagesHandler from "./api/generate-images.js";
import authLoginHandler from "./api/auth-login.js";
import authSignupHandler from "./api/auth-signup.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- CORS SETUP -------------------------------------------------

const allowedOrigins = [
  "https://www.aran.studio",
  "https://aran.studio",
  "https://aran-frontend-service.vercel.app",
  "http://localhost:5173",
];

app.use(
  cors({
    origin(origin, callback) {
      // allow server-to-server / curl (no origin) and our whitelisted origins
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
  })
);

// handle preflight nicely
app.options("*", cors());

// --- BODY PARSING -----------------------------------------------

app.use(express.json());

// --- SIMPLE HEALTH CHECK ----------------------------------------

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "aran-backend-railway" });
});

// --- API ROUTES -------------------------------------------------

app.post("/api/generate", generateHandler);
app.post("/api/generate-storyboards", generateStoryboardsHandler);
app.post("/api/generate-images", generateImagesHandler);

app.post("/api/auth-login", authLoginHandler);
app.post("/api/auth-signup", authSignupHandler);

// --- START SERVER -----------------------------------------------

app.listen(PORT, () => {
  console.log(`ARAN backend listening on port ${PORT}`);
});
