// routes/router.js
import express from "express";

import authLogin from "./authLogin.js";
import authSignup from "./authSignup.js";

import generate from "./generate.js";
import generateVisuals from "./generateVisuals.js";
import generateStoryboards from "./generatestoryboards.js"; // <-- matches your file
import generateToneImage from "./generateToneImage.js";
import exportProject from "./export.js";
import exportPdf from "./exportPdf.js";
import decksRouter from "./decks.js";

import createCheckoutSession from "./createCheckoutSession.js";
import evaluateBeats from "./evaluateBeats.js";

const router = express.Router();

// Auth
router.post("/auth/login", authLogin);
router.post("/auth/signup", authSignup);

// Decks
router.use("/decks", decksRouter);

// Billing
router.post("/create-checkout-session", createCheckoutSession);

// Generation
router.post("/generate", generate);
router.post("/generate-visuals", generateVisuals);
router.post("/generate-storyboards", generateStoryboards);
router.post("/generate-tone-image", generateToneImage);
router.post("/export", exportProject);
router.post("/export/pdf", exportPdf);

// Beat evaluation (node tree)
router.post("/evaluate-beats", evaluateBeats);

export default router;
