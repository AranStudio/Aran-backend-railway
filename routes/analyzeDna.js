// routes/analyzeDna.js
/**
 * Story DNA — returns a simple "mixture" + a short textual read.
 * Uses heuristics by default, optionally OpenAI if available.
 */
import { chatCompletion } from "../utils/openaiClient.js";

function heuristicDNA({ storyType = "Any format", brief = "", beats = [] }) {
  const text = (storyType + "\n" + brief + "\n" + (beats || []).join("\n")).toLowerCase();

  const buckets = [
    ["introspective", /\b(introspect|memory|regret|lonely|grief|reflection|inner)\b/g],
    ["surreal", /\b(surreal|dream|hallucinat|absurd|uncanny|myth|symbol)\b/g],
    ["tension", /\b(threat|danger|race|deadline|chase|escape|stalk|weapon|mystery)\b/g],
    ["humor", /\b(funny|comedy|joke|awkward|silly|banter|satire)\b/g],
    ["romance", /\b(love|kiss|romance|crush|heart|date)\b/g],
    ["action", /\b(explode|fight|punch|kick|car|gun|heist|battle)\b/g],
    ["documentary", /\b(documentary|interview|archive|b-roll|narrator|subject)\b/g],
    ["marketing", /\b(product|brand|cta|buy|shop|download|subscribe|offer)\b/g],
  ];

  const scores = {};
  let total = 0;
  for (const [name, rx] of buckets) {
    const m = text.match(rx);
    const v = m ? m.length : 0;
    scores[name] = v;
    total += v;
  }

  // Add a small prior based on story type so "DNA" isn't empty.
  const prior = (k, v) => { scores[k] = (scores[k] || 0) + v; total += v; };
  if (/commercial|social|branded/i.test(storyType)) prior("marketing", 6);
  if (/documentary/i.test(storyType)) prior("documentary", 6);
  if (/feature|short|tv/i.test(storyType)) prior("tension", 2);
  if (/book|bedtime|poem/i.test(storyType)) prior("introspective", 3);

  const pct = {};
  const denom = total || 1;
  Object.keys(scores).forEach((k) => {
    pct[k] = Math.round((scores[k] / denom) * 100);
  });

  // Pick top 4 (non-zero preferred)
  const top = Object.entries(pct)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .filter(([, v]) => v > 0);

  const summary =
    top.length
      ? `This leans ${top.map(([k, v]) => `${v}% ${k}`).join(", ")}.`
      : "This feels broadly balanced — try adding stronger tone words to sharpen the DNA.";

  return {
    mixture: pct,
    top: top.map(([k, v]) => ({ trait: k, percent: v })),
    summary,
    source: "heuristic",
  };
}

export default async function analyzeDna(req, res) {
  const { storyType = "Any format", brief = "", beats = [] } = req.body || {};
  const payload = { storyType, brief, beats };

  try {
    const messages = [
      {
        role: "system",
        content:
          "You are a story analyst. Return JSON with keys: mixture (object of percentages that sum ~100), top (array of {trait, percent}), summary (1 sentence).",
      },
      { role: "user", content: "Analyze Story DNA for this project:\n" + JSON.stringify(payload).slice(0, 8000) },
    ];
    const out = await chatCompletion({
      messages,
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 260,
      responseFormat: { type: "json_object" },
    });
    const parsed = JSON.parse(out?.text || "{}");
    if (parsed && parsed.mixture) return res.json({ ...parsed, source: "openai" });
  } catch (e) {
    // fall back
  }

  return res.json(heuristicDNA(payload));
}
