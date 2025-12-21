import express from "express";

/* -------------------- AUTH -------------------- */
import authLogin from "./authLogin.js";
import authSignup from "./authSignup.js";

/* -------------------- GENERATION -------------------- */
import generate from "./generate.js";
import generateToneImage from "./generateToneImage.js";
import generateStoryboards from "./generateStoryboards.js"; // ⚠️ CASE FIXED
import generateVisuals from "./generateVisuals.js";
import evaluateBeats from "./evaluateBeats.js";

/* -------------------- BILLING -------------------- */
import createCheckoutSession from "./createCheckoutSession.js";

const router = express.Router();

/* -------------------- HEALTH CHECK -------------------- */
/* lets you hit /api/health and know the router is alive */
router.get("/health", (req, res) => {
  res.json({ ok: true, service: "aran-api", time: new Date().toISOString() });
});

/* -------------------- AUTH -------------------- */
router.post("/auth/login", authLogin);
router.post("/auth/signup", authSignup);

/* -------------------- BILLING -------------------- */
router.post("/create-checkout-session", createCheckoutSession);

/* -------------------- GENERATION -------------------- */
router.post("/generate", generate);
router.post("/generate-tone-image", generateToneImage);
router.post("/generate-storyboards", generateStoryboards);
router.post("/generate-visuals", generateVisuals);

/* -------------------- ANALYSIS -------------------- */
router.post("/evaluate-beats", evaluateBeats);

export default router;