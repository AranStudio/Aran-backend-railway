import express from "express";

import authLogin from "./authLogin.js";
import authSignup from "./authSignup.js";

import generate from "./generate.js";
import generateVisuals from "./generateVisuals.js";
import generateStoryboards from "./generatestoryboards.js";
import generateToneImage from "./generateToneImage.js";
import createCheckoutSession from "./createCheckoutSession.js";
import evaluateBeats from "./evaluateBeats.js";

const router = express.Router();

// Auth
router.post("/auth/login", authLogin);
router.post("/auth/signup", authSignup);

// Billing
router.post("/create-checkout-session", createCheckoutSession);

// Generation
router.post("/generate", generate);
router.post("/generate-visuals", generateVisuals);
router.post("/generate-storyboards", generateStoryboards);
router.post("/generate-tone-image", generateToneImage);

// Beat evaluation (node tree)
router.post("/evaluate-beats", evaluateBeats);

export default router;
