import express from "express";
import { openai } from "../utils/openaiClient.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { prompt, contentType, references } = req.body;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Create story beats for: ${prompt}. Return JSON with "frames":[{description:""}].`
        }
      ]
    });

    const text = completion.choices[0].message.content;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { frames: [{ description: text }] };
    }

    res.json(parsed);
  } catch (err) {
    res.status(500).send("Error generating beats");
  }
});

export default router;

