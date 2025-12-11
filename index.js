import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Route files (these should already exist in your /api folder)
import generateRoute from "./api/generate.js";
import visualsRoute from "./api/generate-visuals.js";
import loginRoute from "./api/auth-login.js";
import signupRoute from "./api/auth-signup.js";

dotenv.config();

const app = express();
app.use(express.json());

// CORS: allow your site + local dev
app.use(
  cors({
    origin: ["https://www.aran.studio", "http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: false,
  })
);

// --- ROUTES ---
// Story text + B&W storyboards
app.use("/api/generate", generateRoute);

// Color visuals
app.use("/api/generate-visuals", visualsRoute);

// Auth
app.use("/api/auth-login", loginRoute);
app.use("/api/auth-signup", signupRoute);

// Health check – for quick “is it up?” testing
app.get("/", (req, res) => {
  res.send("ARAN backend is running 🚀");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ARAN backend listening on port ${PORT}`);
});
