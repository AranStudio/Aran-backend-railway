// services/storyIntelligence/critic.js
/**
 * Story Critic
 * Analyzes generated beats for clichés, generic patterns, and brand fit.
 * Forces regeneration if quality thresholds are not met.
 */

import { chatCompletion } from "../../utils/openaiClient.js";

// Thresholds for triggering regeneration
export const CRITIQUE_THRESHOLDS = {
  genericScore: 55,
  similarityToCommonAds: 50,
  minBrandFitScore: 40,
};

// Common ad patterns that indicate generic thinking
const COMMON_AD_PATTERNS = [
  "problem-solution-smile",
  "before/after transformation",
  "celebrity endorsement",
  "family gathered around product",
  "slow-motion product hero shot",
  "voiceover explaining benefits",
  "customer testimonial",
  "limited time offer urgency",
  "aspirational lifestyle imagery",
  "emotional manipulation with children/pets",
  "sunrise/sunset symbolism",
  "breaking the fourth wall to camera",
  "product saves the day",
  "montage of happy users",
  "jingle or catchy tagline",
];

function safeJsonParse(str) {
  try {
    const cleaned = str.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Run critique analysis on generated beats
 * @param {Object} params - Critique parameters
 * @returns {Promise<Object>} - Critique results
 */
export async function critiqueBeats({
  beats,
  profile,
  prompt,
  brand,
  productCategory,
}) {
  const beatsText = beats
    .map((b) => `[${b.name}]: ${b.beatText}`)
    .join("\n\n");

  const systemPrompt = `You are a ruthlessly honest creative director who has seen thousands of ads. Your job is to critique story beats for originality and effectiveness.

EVALUATE THE BEATS AGAINST THESE CRITERIA:

1. GENERIC SCORE (0-100): How generic/predictable is this story?
   - 0 = Completely original, never seen before
   - 50 = Some fresh elements but familiar framework
   - 100 = Could be any brand's ad, completely generic

2. CLICHÉ FLAGS: List any specific clichés or overused elements you detect

3. SIMILARITY TO COMMON ADS (0-100): How similar to typical advertising?
   - Reference these common patterns: ${COMMON_AD_PATTERNS.slice(0, 8).join(", ")}

4. BRAND FIT SCORE (0-100): How well does the story serve this brand/product?
   - 0 = Story doesn't connect to brand at all
   - 50 = Generic brand integration
   - 100 = Perfect, unique brand story

5. FRESHNESS NOTES: What's working? What feels new?

6. FIXES: Specific, actionable suggestions to make it more original

Be HARSH but CONSTRUCTIVE. The goal is to catch mediocrity before it ships.

Respond with ONLY valid JSON:
{
  "genericScore": number,
  "clicheFlags": ["specific cliché 1", "specific cliché 2"],
  "similarityToCommonAds": number,
  "brandFitScore": number,
  "freshnessNotes": ["what's working", "what feels new"],
  "fixes": ["specific actionable fix 1", "specific actionable fix 2"]
}`;

  const userPrompt = `Critique these story beats:

ORIGINAL PROMPT: ${prompt}
${brand ? `BRAND: ${brand}` : ""}
${productCategory ? `PRODUCT CATEGORY: ${productCategory}` : ""}

STORY PROFILE:
- Structure: ${profile.structure}
- Arc: ${profile.arc}
- Tone: ${profile.tone}
- Brand Role: ${profile.brand_role}
- Creative Hooks: ${profile.creativeHooks.join(", ")}

BEATS TO CRITIQUE:
${beatsText}

Be specific in your critique. If a beat uses a tired trope, name it. If something feels fresh, call it out.`;

  const result = await chatCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    model: "gpt-4o",
    responseFormat: { type: "json_object" },
    temperature: 0.4, // Lower temperature for more consistent evaluation
    maxTokens: 1200,
  });

  const parsed = safeJsonParse(result.text);

  if (!parsed || typeof parsed !== "object") {
    // Return a neutral critique if parsing fails
    return {
      genericScore: 50,
      clicheFlags: [],
      similarityToCommonAds: 50,
      brandFitScore: 70,
      freshnessNotes: ["Unable to fully analyze"],
      fixes: [],
      needsRegeneration: false,
    };
  }

  const critique = {
    genericScore: Math.min(100, Math.max(0, Number(parsed.genericScore) || 50)),
    clicheFlags: Array.isArray(parsed.clicheFlags) ? parsed.clicheFlags : [],
    similarityToCommonAds: Math.min(
      100,
      Math.max(0, Number(parsed.similarityToCommonAds) || 50)
    ),
    brandFitScore: Math.min(100, Math.max(0, Number(parsed.brandFitScore) || 70)),
    freshnessNotes: Array.isArray(parsed.freshnessNotes)
      ? parsed.freshnessNotes
      : [],
    fixes: Array.isArray(parsed.fixes) ? parsed.fixes : [],
  };

  // Determine if regeneration is needed
  critique.needsRegeneration = shouldRegenerate(critique);

  return critique;
}

/**
 * Determine if beats need regeneration based on critique scores
 */
export function shouldRegenerate(critique) {
  return (
    critique.genericScore > CRITIQUE_THRESHOLDS.genericScore ||
    critique.similarityToCommonAds > CRITIQUE_THRESHOLDS.similarityToCommonAds ||
    critique.brandFitScore < CRITIQUE_THRESHOLDS.minBrandFitScore
  );
}

/**
 * Get regeneration strategy based on critique
 */
export function getRegenerationStrategy(critique) {
  const strategy = {
    changeProfile: false,
    elementsToChange: [],
    regenerateBeatsOnly: false,
    notes: [],
  };

  // High generic score - need to change creative hooks
  if (critique.genericScore > 70) {
    strategy.changeProfile = true;
    strategy.elementsToChange.push("creativeHooks", "referenceVibes");
    strategy.notes.push("Story is too generic - need fresh creative hooks");
  }

  // High similarity to common ads - change structure or arc
  if (critique.similarityToCommonAds > 65) {
    strategy.changeProfile = true;
    strategy.elementsToChange.push("structure", "arc");
    strategy.notes.push("Too similar to common ads - try different structure/arc");
  }

  // Many clichés detected - regenerate with specific avoidance
  if (critique.clicheFlags.length > 3) {
    strategy.regenerateBeatsOnly = true;
    strategy.notes.push(
      `Avoid these clichés: ${critique.clicheFlags.slice(0, 5).join(", ")}`
    );
  }

  // Low brand fit - adjust brand role
  if (critique.brandFitScore < 50) {
    strategy.changeProfile = true;
    strategy.elementsToChange.push("brand_role");
    strategy.notes.push("Brand integration needs rethinking");
  }

  // If no profile changes needed but still needs regen, just redo beats
  if (!strategy.changeProfile && !strategy.regenerateBeatsOnly) {
    strategy.regenerateBeatsOnly = true;
    strategy.notes = [...critique.fixes.slice(0, 3)];
  }

  return strategy;
}

/**
 * Generate alternative concepts that are structurally different
 */
export async function generateAltConcepts({ prompt, profile, beats, count = 3 }) {
  const mainConceptSummary = beats
    .slice(0, 3)
    .map((b) => b.beatText)
    .join(" | ");

  const systemPrompt = `You are generating alternative story concepts that are STRUCTURALLY DIFFERENT from the main concept.

MAIN CONCEPT USES:
- Structure: ${profile.structure}
- Arc: ${profile.arc}
- Tone: ${profile.tone}
- Approach: ${mainConceptSummary}

Your alternatives must:
1. Use DIFFERENT structures (not ${profile.structure})
2. Use DIFFERENT arcs (not ${profile.arc})
3. Use DIFFERENT tones or approaches
4. Still serve the same brief/prompt
5. Be one-line pitches that a creative director could green-light

Respond with ONLY valid JSON:
{
  "altConcepts": [
    "One-line pitch for alt concept 1 using [different structure/arc]",
    "One-line pitch for alt concept 2 using [different structure/arc]",
    "One-line pitch for alt concept 3 using [different structure/arc]"
  ]
}`;

  const userPrompt = `Generate ${count} alternative concepts for:

BRIEF: ${prompt}
DURATION: ${profile.constraints.durationSec} seconds
FORMAT: ${profile.format}

Each alternative should be a complete one-liner pitch that suggests a completely different approach to telling this story.`;

  const result = await chatCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    model: "gpt-4o",
    responseFormat: { type: "json_object" },
    temperature: 0.9, // High temperature for variety
    maxTokens: 600,
  });

  const parsed = safeJsonParse(result.text);

  if (!parsed || !Array.isArray(parsed.altConcepts)) {
    // Fallback alt concepts
    return [
      `Try a ${profile.structure === "three_act" ? "vignette" : "three_act"} structure with ${profile.arc === "positive_change" ? "ironic" : "positive_change"} arc`,
      `Consider a ${profile.tone === "comedic" ? "documentary" : "comedic"} approach with object POV`,
      `Explore a nonlinear structure with ${profile.ending === "resolved" ? "open" : "resolved"} ending`,
    ];
  }

  return parsed.altConcepts.slice(0, count);
}

export default {
  critiqueBeats,
  shouldRegenerate,
  getRegenerationStrategy,
  generateAltConcepts,
  CRITIQUE_THRESHOLDS,
};
