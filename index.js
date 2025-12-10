import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(
  cors({
    origin: "*", // you can later lock this to https://aran.studio
  })
);
app.use(express.json());

// Simple health check
app.get("/", (req, res) => {
  res.send("Aran API is alive.");
});

// --------- /api/generate-deck  ----------------------------------
// Input:  { prompt, contentType, references }
// Output: { title, style, frames:[{ description }] }
app.post("/api/generate-deck", async (req, res) => {
  try {
    const { prompt, contentType, references } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing prompt." });
    }

    const systemPrompt = `
You are a story-deck generator for film, TV, commercials, campaigns, and music videos.
Given a short idea, you return PURE JSON with:
{
  "title": string,
  "style": string,
  "frames": [
    { "description": string },
    ...
  ]
}
"frames" should be 10 beats max. No extra text, no markdown – JSON ONLY.
`;

    const userPayload = {
      idea: prompt,
      contentType: contentType || "unspecified",
      references: references || [],
    };

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify(userPayload),
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    let deck;
    try {
      deck = JSON.parse(raw);
    } catch (err) {
      console.error("JSON parse error from model:", raw, err);
      return res
        .status(500)
        .json({ error: "Failed to parse deck JSON from model." });
    }

    if (!Array.isArray(deck.frames)) {
      deck.frames = [];
    }

    res.json({
      title: deck.title || "Untitled",
      style: deck.style || "",
      frames: deck.frames.map((f) => ({
        description: String(f.description || "").trim(),
      })),
    });
  } catch (err) {
    console.error("ERROR /api/generate-deck:", err);
    res
      .status(500)
      .json({ error: "Something went sideways while shaping your deck." });
  }
});

// --------- /api/generate-storyboards  ---------------------------
// Input:  { frames:[{ description }] }
// Output: { storyboards:[{ url }] }  (B&W images)
app.post("/api/generate-storyboards", async (req, res) => {
  try {
    const { frames } = req.body || {};
    if (!Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: "Missing frames." });
    }

    const prompts = frames.map(
      (f, idx) =>
        `black and white pencil storyboard sketch, cinematic composition, frame ${
          idx + 1
        }: ${f.description}`
    );

    const imageResp = await openai.images.generate({
      model: "gpt-image-1",
      prompt: prompts.join("\n"),
      n: frames.length,
      size: "1024x1024",
    });

    const urls = (imageResp.data || []).map((d) => d.url);

    res.json({
      storyboards: urls.map((url) => ({ url })),
    });
  } catch (err) {
    console.error("ERROR /api/generate-storyboards:", err);
    res.status(500).json({ error: "Storyboard generation failed." });
  }
});

// --------- /api/generate-images  -------------------------------
// Input:  { frames:[{ description }], style }
// Output: { images:[{ url }] }  (full color visuals)
app.post("/api/generate-images", async (req, res) => {
  try {
    const { frames, style } = req.body || {};
    if (!Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: "Missing frames." });
    }

    const prompts = frames.map(
      (f, idx) =>
        `highly detailed cinematic color concept art, ${style || ""}, frame ${
          idx + 1
        }: ${f.description}`
    );

    const imageResp = await openai.images.generate({
      model: "gpt-image-1",
      prompt: prompts.join("\n"),
      n: frames.length,
      size: "1024x1024",
    });

    const urls = (imageResp.data || []).map((d) => d.url);

    res.json({
      images: urls.map((url) => ({ url })),
    });
  } catch (err) {
    console.error("ERROR /api/generate-images:", err);
    res.status(500).json({ error: "Image generation failed." });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Aran backend listening on port ${PORT}`);
});