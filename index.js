import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import router from "./api/router.js";

dotenv.config();

const app = express();
app.use(express.json());

// CORS for your real domain
app.use(
  cors({
    origin: [
      "https://www.aran.studio",
      "https://aran.studio",
      "http://localhost:5173"
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// API ROUTES
app.use("/api", router);

// Health check
app.get("/", (req, res) => {
  res.send("Aran backend is online.");
});

// USE RAILWAY PORT
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Aran backend running on port ${PORT}`);
});
