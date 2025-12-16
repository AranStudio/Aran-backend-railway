// router.js
import express from "express";

import authLogin from "./authLogin.js";
import authSignup from "./authSignup.js";

import generate from "./generate.js";
import generateVisuals from "./generateVisuals.js";
import generateStoryboards from "./generatestoryboards.js";

// NEW alias route
import generateToneImage from "./generateToneImage.js";

const router = express.Router();

// Auth
router.post("/auth/login", authLogin);
router.post("/auth/signup", authSignup);

// Generation
router.post("/generate", generate);
router.post("/generate-visuals", generateVisuals);
router.post("/generate-storyboards", generateStoryboards);

// ✅ This fixes your "Cannot POST /api/generate-tone-image"
router.post("/generate-tone-image", generateToneImage);

export default router;

