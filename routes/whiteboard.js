import express from "express";
import { interpretSketch } from "../services/visionInterpret.js";

const router = express.Router();

router.post("/interpret", async (req, res) => {
  try {
    const { image, contentTypeHint, intent } = req.body;

    if (!image) {
      return res.status(400).json({ error: "No image provided" });
    }

    const result = await interpretSketch({
      image,
      contentTypeHint,
      intent
    });

    res.json(result);
  } catch (err) {
    console.error("Whiteboard interpret error:", err);
    res.status(500).json({ error: "Failed to interpret sketch" });
  }
});

export default router;
