import express from "express";

import generate from "./generate.js";
import generateVisuals from "./generateVisuals.js";
import generateStoryboards from "./generatestoryboards.js";
import generateToneImage from "./generateToneImage.js";

const router = express.Router();

/**
 * Auth routes temporarily disabled to prevent server crash.
 * Your current issue is missing authLogin.js on Railway.
 * We can re-enable once file paths are confirmed.
 */
router.post("/auth/login", (_req, res) => {
  res.status(501).json({ error: "Auth route not wired on backend yet" });
});

router.post("/auth/signup", (_req, res) => {
  res.status(501).json({ error: "Auth route not wired on backend yet" });
});

// Generation
router.post("/generate", generate);
router.post("/generate-visuals", generateVisuals);
router.post("/generate-storyboards", generateStoryboards);
router.post("/generate-tone-image", generateToneImage);

export default router;
