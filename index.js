import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import generate from "./routes/generate.js";
import generateStoryboards from "./routes/generateStoryboards.js";
import generateVisuals from "./routes/generateVisuals.js";
import authSignup from "./routes/authSignup.js";
import authLogin from "./routes/authLogin.js";

dotenv.config();

const app = express();
app.use(express.json());

// --------------------
// CORS FIX (THE ONE YOU NEED)
// --------------------
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://aran-frontend-service.vercel.app",
      "https://www.aran.studio"
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// --------------------
// ROUTES
// --------------------
app.use("/api/generate", generate);
app.use("/api/generate-storyboards", generateStoryboards);
app.use("/api/generate-visuals", generateVisuals);
app.use("/api/auth-signup", authSignup);
app.use("/api/auth-login", authLogin);

// --------------------
// PORT
// --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ARAN backend running on port ${PORT}`);
});
