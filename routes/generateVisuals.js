
import express from "express";
import { openai } from "../utils/openaiClient.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { frames } = req.body;

    const visuals = [];

    for (const frame of frames) {
      const img = await openai.images.generate({
        model: "gpt-image-1",
        prompt: `cinematic color concept art: ${frame.description}`,
        size: "1024x1024"
      });

      visuals.push({ url: img.data[0].url });
    }

    res.json({ visuals });
  } catch (err) {
    res.status(500).send("Error generating visuals");
  }
});

export default router;
