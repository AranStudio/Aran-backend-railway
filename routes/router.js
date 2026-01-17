// routes/router.js
import express from "express";

import authLogin from "./authLogin.js";
import authSignup from "./authSignup.js";

import generate from "./generate.js";
import generateVisuals from "./generateVisuals.js";
import generateStoryboards from "./generatestoryboards.js";
import generateToneImage from "./generateToneImage.js";

import exportProject from "./export.js";
import exportPdf from "./exportPdf.js";
import exportImage from "./exportImage.js";
import exportOptions from "./exportOptions.js";
import sharedDeck from "./sharedDeck.js";
import dailySpark from "./dailySpark.js";
import analyzeDna from "./analyzeDna.js";
import analyzeEmotions from "./analyzeEmotions.js";

import decksRouter from "./decks.js";

import createCheckoutSession from "./createCheckoutSession.js";
import billingPortal from "./billingPortal.js";
import billingHistory from "./billingHistory.js";
import evaluateBeats from "./evaluateBeats.js";

import whiteboardInterpret from "./whiteboard.js";
import { videoShotlistUpload, videoShotlistHandler } from "./videoShotlist.js";

const router = express.Router();

// Auth
router.post("/auth/login", authLogin);
router.post("/auth/signup", authSignup);

// ✅ Decks (SAVE/LOAD/DELETE)
router.use("/decks", decksRouter);

// Billing
router.post("/create-checkout-session", createCheckoutSession);
router.post("/billing/portal", billingPortal);
router.post("/billing/history", billingHistory);

// Generation
router.post("/generate", generate);
router.post("/generate-visuals", generateVisuals);
router.post("/generate-storyboards", generateStoryboards);
router.post("/generate-tone-image", generateToneImage);

// Export
router.get("/export/options", exportOptions);
router.post("/export", exportProject);
router.post("/export/pdf", exportPdf);
router.post("/export/image", exportImage);
router.get("/share/:code", sharedDeck);

// Beat evaluation (node tree)
router.post("/evaluate-beats", evaluateBeats);

// NEW: Whiteboard + video tools
router.post("/whiteboard/interpret", whiteboardInterpret);
router.post("/video/shotlist", videoShotlistUpload, videoShotlistHandler);

// Studio / "Aran OS" utilities
router.post("/daily-spark", dailySpark);
router.post("/analyze/dna", analyzeDna);
router.post("/analyze/emotions", analyzeEmotions);

export default router;
