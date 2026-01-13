// routes/dailySpark.js
/**
 * Daily Spark — lightweight prompt-of-the-day.
 * - If OPENAI_API_KEY is present, we generate a tailored spark with JSON.
 * - Otherwise we fall back to a deterministic "good enough" spark.
 */
import { chatCompletion } from "../utils/openaiClient.js";

const FALLBACK_SPARKS = [
  "Write a scene where two people lie about the same thing for opposite reasons.",
  "A story that takes place entirely inside a stalled elevator.",
  "Write a moment of triumph that feels undeserved.",
  "A character realizes the villain is right — and it scares them.",
  "A love story told through unanswered voicemails.",
  "A commercial where the product is never shown, but everyone can feel it.",
  "A documentary opening that makes a mundane subject feel life-or-death."
];

function pick(seed = "") {
  const s = String(seed || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return FALLBACK_SPARKS[h % FALLBACK_SPARKS.length];
}

export default async function dailySpark(req, res) {
  const { profile = {}, storyType = "Any format" } = req.body || {};
  const userSeed = profile?.userId || profile?.email || req.ip || "anon";
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Try OpenAI — but never fail the request if key is missing.
  try {
    const messages = [
      { role: "system", content: "You create one short, high-quality creative prompt (1–2 sentences). Output JSON." },
      {
        role: "user",
        content:
          "Create a daily creative spark prompt tailored to this user profile.\n" +
          "StoryType: " + storyType + "\n" +
          "Profile: " + JSON.stringify(profile).slice(0, 1500)
      },
    ];

    const out = await chatCompletion({
      messages,
      model: "gpt-4o-mini",
      temperature: 0.9,
      maxTokens: 140,
      responseFormat: { type: "json_object" },
    });

    const parsed = JSON.parse(out?.text || "{}");
    const prompt = String(parsed.prompt || parsed.spark || "").trim();
    if (prompt) {
      return res.json({
        date,
        prompt,
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6) : [],
        modeHint: parsed.modeHint || null,
        source: "openai",
      });
    }
  } catch (e) {
    // ignore — fall back
  }

  const prompt = pick(userSeed + "|" + date + "|" + storyType);
  return res.json({
    date,
    prompt,
    tags: ["daily", "spark"],
    modeHint: "Muse",
    source: "fallback",
  });
}
