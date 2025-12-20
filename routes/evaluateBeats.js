import express from "express";
const router = express.Router();

/**
 * Lightweight structural evaluation.
 * This is intentionally conservative.
 */
router.post("/evaluate-beats", async (req, res) => {
  const { beats, mode } = req.body;

  if (!Array.isArray(beats)) {
    return res.status(400).json({ error: "Invalid beats array" });
  }

  const results = beats.map((beat, i) => {
    let status = "green";
    let suggestion = null;

    if (beat.length < 12) {
      status = "red";
      suggestion = "This beat may be too vague. Consider clarifying intent.";
    }

    if (mode === "commercial" && !beat.toLowerCase().includes("visual")) {
      status = "red";
      suggestion = "You may want to emphasize a visual action for a commercial.";
    }

    return {
      id: i,
      status,
      suggestion
    };
  });

  res.json({ nodes: results });
});

export default router;
