import express from "express";
import { openai } from "../utils/openaiClient.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { frames } = req.body;

    const images = [];

    for (const frame of frames) {
      const img = await openai.images.generate({
        model: "gpt-image-1",
        prompt: `black and white storyboard, cinematic, pencil-drawn: ${frame.description}`,
        size: "1024x1024"
      });

      images.push({ url: img.data[0].url });
    }

    res.json({ images });
  } catch (err) {
    res.status(500).send("Error generating storyboards");
  }
});

export default router;

