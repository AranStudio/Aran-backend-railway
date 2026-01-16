import express from "express";
import multer from "multer";
import { processVideo } from "../services/videoProcessor.js";

const router = express.Router();

const upload = multer({
  limits: { fileSize: 1024 * 1024 * 500 } // 500MB cap
});

router.post("/shotlist", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No video uploaded" });
    }

    const result = await processVideo(req.file);

    res.json(result);
  } catch (err) {
    console.error("Video shotlist error:", err);
    res.status(500).json({ error: "Failed to process video" });
  }
});

export default router;
