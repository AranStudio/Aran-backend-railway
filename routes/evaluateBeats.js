/**
 * Beat evaluation route
 *
 * Purpose:
 * - Provide lightweight, deterministic guidance for a beat "node tree"
 * - NO external API calls (keeps latency + cost down, avoids prompt rejections)
 *
 * Request:
 *   POST /api/evaluate-beats
 *   { beats: string[], contentType?: string }
 *
 * Response:
 *   {
 *     nodes: Array<{
 *       id: number,
 *       status: 'green' | 'red',
 *       suggestion: string | null,
 *       tags: string[]
 *     }>
 *   }
 */

// Note: other routes in this codebase export a single handler function.
// We match that pattern so routes/router.js can do router.post(..., handler).

function normalizeType(t) {
  const s = String(t || "").toLowerCase();
  if (s.includes("commercial") || s.includes("ad") || s.includes("marketing")) return "commercial";
  if (s.includes("music") || s.includes("album") || s.includes("song") || s.includes("lyric")) return "music";
  if (s.includes("bedtime") || s.includes("storybook") || s.includes("kids")) return "bedtime";
  if (s.includes("poem")) return "poem";
  return "story";
}

function evaluateBeat({ beat, idx, prevBeat, nextBeat, type }) {
  const b = String(beat || "").trim();
  const tags = [];
  let status = "green";
  let suggestion = null;

  // Too short / too vague
  if (b.length < 18) {
    status = "red";
    tags.push("vague");
    suggestion = "This beat is pretty vague. Add a concrete action, setting detail, or outcome.";
  }

  // Overly long (hard to visualize)
  if (b.length > 220) {
    status = "red";
    tags.push("too_long");
    suggestion = "This beat is doing a lot. Consider splitting into two clearer moments.";
  }

  // Weak visuality for commercial
  if (type === "commercial") {
    const hasActionVerb = /(see|show|hold|walk|run|open|close|cut to|reveal|hands|close-up|wide|camera|shot|product|logo|packaging|pour|sip|bite)/i.test(
      b
    );
    if (!hasActionVerb) {
      status = "red";
      tags.push("needs_visual_action");
      suggestion =
        suggestion ||
        "For a commercial/storyboard, make the beat more visual (a clear action, camera moment, or product reveal).";
    }
  }

  // Bedtime: too intense keywords
  if (type === "bedtime") {
    const intense = /(blood|kill|murder|gun|shoot|terror|drug|dead)/i.test(b);
    if (intense) {
      status = "red";
      tags.push("tone");
      suggestion = suggestion || "For bedtime, soften the tone. Swap danger for curiosity or cozy stakes.";
    }
  }

  // Rhythm/continuity: abrupt shift (very simple heuristic)
  if (prevBeat && nextBeat && b.length < 35) {
    const prevLen = String(prevBeat).length;
    const nextLen = String(nextBeat).length;
    if (prevLen > 140 && nextLen > 140) {
      status = "red";
      tags.push("continuity");
      suggestion = suggestion || "This beat feels like a jump cut. Add a bridge or clarify the transition.";
    }
  }

  return { id: idx, status, suggestion, tags };
}

export default async function evaluateBeats(req, res) {
  try {
    const beats = Array.isArray(req.body?.beats) ? req.body.beats : null;
    if (!beats) return res.status(400).json({ error: "beats must be an array" });

    const type = normalizeType(req.body?.contentType);

    const nodes = beats.map((beat, idx) =>
      evaluateBeat({
        beat,
        idx,
        prevBeat: idx > 0 ? beats[idx - 1] : "",
        nextBeat: idx < beats.length - 1 ? beats[idx + 1] : "",
        type,
      })
    );

    return res.json({ nodes });
  } catch (err) {
    console.error("evaluate-beats error:", err);
    return res.status(500).json({ error: "Failed to evaluate beats" });
  }
}
