// routes/analyzeEmotions.js
/**
 * Emotional Arc — returns per-beat scores for: tension, hope, intimacy, chaos, stakes.
 * Heuristic baseline; optionally OpenAI to refine.
 */
import { chat } from "../utils/openaiClient.js";

const LEX = {
  tension: /\b(threat|danger|fear|risk|deadline|chase|escape|hunt|weapon|mystery|suspense|pressure)\b/g,
  hope: /\b(hope|relief|promise|dream|save|win|heal|believe|light|tomorrow|together)\b/g,
  intimacy: /\b(confess|kiss|touch|secret|vulnerable|truth|apolog|forgive|heart|love|close)\b/g,
  chaos: /\b(chaos|panic|crash|storm|riot|spiral|explode|glitch|breakdown|mess)\b/g,
  stakes: /\b(life|death|lose|ruin|forever|everything|family|career|war|fate)\b/g,
};

function scoreLine(s) {
  const t = String(s || "").toLowerCase();
  const out = {};
  for (const [k, rx] of Object.entries(LEX)) {
    const m = t.match(rx);
    out[k] = m ? m.length : 0;
  }
  return out;
}

function normalize(series) {
  const keys = Object.keys(LEX);
  const maxBy = {};
  keys.forEach((k) => maxBy[k] = 1);
  for (const pt of series) keys.forEach((k) => { maxBy[k] = Math.max(maxBy[k], pt[k] || 0); });

  return series.map((pt) => {
    const n = {};
    keys.forEach((k) => {
      const v = pt[k] || 0;
      // map to 0..10
      n[k] = Math.round((v / maxBy[k]) * 10);
    });
    return n;
  });
}

export default async function analyzeEmotions(req, res) {
  const { beats = [], brief = "", storyType = "Any format" } = req.body || {};
  const baseSeries = normalize((beats || []).map(scoreLine));

  // Optional OpenAI smoothing
  try {
    const messages = [
      {
        role: "system",
        content:
          "You output JSON with key 'series' = array of objects with tension, hope, intimacy, chaos, stakes as integers 0-10 per beat. Also key 'notes' = 1-2 sentences.",
      },
      {
        role: "user",
        content:
          "Given this brief + beats, estimate emotional arc per beat.\n" +
          "StoryType: " + storyType + "\n" +
          "Brief: " + String(brief).slice(0, 1200) + "\n" +
          "Beats: " + JSON.stringify(beats).slice(0, 7000) + "\n" +
          "Heuristic baseline: " + JSON.stringify(baseSeries),
      },
    ];
    const out = await chat({
      messages,
      temperature: 0.2,
      maxTokens: 320,
      responseFormat: { type: "json_object" },
    });
    const parsed = JSON.parse(out || "{}");
    if (Array.isArray(parsed.series)) {
      return res.json({ series: parsed.series.slice(0, beats.length), notes: parsed.notes || "", source: "openai" });
    }
  } catch (e) {
    // ignore
  }

  return res.json({
    series: baseSeries,
    notes: "Heuristic arc (keyword-based). Add stronger tone words in beats to sharpen results.",
    source: "heuristic",
  });
}
