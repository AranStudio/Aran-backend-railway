import express from "express";
import cors from "cors";
import routes from "./routes/index.js";

const app = express();

// ⭐ FIX CORS
app.use(
  cors({
    origin: [
      "https://www.aran.studio",
      "https://aran.studio",
      "http://localhost:5173"
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ⭐ Required for preflight
app.options("*", cors());

app.use(express.json());
app.use("/api", routes);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`ARAN backend running on port ${port}`));
