// services/storyIntelligence/profile.js
/**
 * Story Profile Generator
 * Generates a comprehensive story profile based on input parameters
 * using LLM to create deliberate structure, arc, tone, and creative hooks.
 */

import { chatCompletion } from "../../utils/openaiClient.js";

// Valid enum values for profile fields
export const PROFILE_ENUMS = {
  structure: [
    "three_act",
    "heros_journey",
    "kishotenketsu",
    "vignette",
    "montage",
    "episodic",
    "nonlinear",
    "fragmented",
    "single_scene",
  ],
  arc: [
    "positive_change",
    "negative_descent",
    "flat_arc",
    "bittersweet",
    "ambiguous",
    "unresolved",
    "tragic",
    "ironic",
  ],
  tone: [
    "intimate",
    "comedic",
    "ironic",
    "hopeful",
    "unsettling",
    "nostalgic",
    "surreal",
    "documentary",
    "editorial",
    "gritty",
    "whimsical",
  ],
  pov: [
    "observer",
    "first_person",
    "brand_as_character",
    "object_pov",
    "ensemble",
    "no_narrator",
  ],
  rhythm: [
    "fast_montage",
    "slow_observational",
    "punchy_cuts",
    "one_take_illusion",
    "split_screen",
  ],
  risk: ["safe", "interesting", "bold", "unusual", "experimental"],
  ending: ["resolved", "twist", "open", "bittersweet", "no_ending_button"],
  brand_role: [
    "foreground",
    "background_presence",
    "reveal_late",
    "implied_only",
    "anti_ad",
  ],
  format: [
    "commercial",
    "short_film",
    "docu",
    "trailer",
    "music_video",
    "social_cutdown",
  ],
};

// Common clichés by product category to avoid
const CATEGORY_CLICHES = {
  beverage: [
    "slow-mo pour with droplets",
    "refreshing sigh after sip",
    "gathering of friends laughing",
    "beach sunset scene",
    "thirst-quenching zoom",
  ],
  automotive: [
    "winding mountain road",
    "parking in front of mansion",
    "drone shot over landscape",
    "family road trip montage",
    "leather interior close-up",
  ],
  tech: [
    "unboxing reveal",
    "minimalist white background",
    "tap-swipe-scroll montage",
    "productivity transformation",
    "sleek product rotation",
  ],
  fashion: [
    "runway walk",
    "mirror pose",
    "slow-mo fabric flow",
    "celebrity endorsement reveal",
    "before/after transformation",
  ],
  food: [
    "cheese pull",
    "steam rising",
    "fork lift in slow motion",
    "family dinner table",
    "crispy crunch sound",
  ],
  finance: [
    "piggy bank metaphor",
    "growing graph animation",
    "retirement beach scene",
    "worried to relieved face",
    "family protection shield",
  ],
  beauty: [
    "mirror confidence moment",
    "close-up product application",
    "hair flip slow motion",
    "before/after split screen",
    "morning routine montage",
  ],
  default: [
    "happy ending smile",
    "product hero shot",
    "testimonial talking head",
    "price/offer super",
    "logo fade to black",
  ],
};

// Story type aware clichés
const STORY_TYPE_CLICHES = {
  commercial: [
    "problem-solution-happy ending",
    "celebrity spokesperson",
    "limited time offer urgency",
    "customer testimonial",
  ],
  documentary: [
    "talking head interview",
    "archival footage montage",
    "dramatic revelation moment",
    "emotional music swell",
  ],
  narrative: [
    "meet cute opening",
    "ticking clock tension",
    "last minute save",
    "lessons learned voiceover",
  ],
  social: [
    "hook in first 3 seconds",
    "trending audio format",
    "duet reaction",
    "call to action ending",
  ],
};

function getClichesToAvoid(productCategory, storyType) {
  const categoryCliches =
    CATEGORY_CLICHES[productCategory?.toLowerCase()] || CATEGORY_CLICHES.default;
  const typeCliches =
    STORY_TYPE_CLICHES[storyType?.toLowerCase()] || STORY_TYPE_CLICHES.commercial;
  return [...new Set([...categoryCliches, ...typeCliches])];
}

function safeJsonParse(str) {
  try {
    // Handle potential markdown code blocks
    const cleaned = str.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Generate a story profile based on input parameters
 * @param {Object} params - Generation parameters
 * @returns {Promise<Object>} - Generated story profile
 */
export async function generateProfile({
  prompt,
  storyType = "commercial",
  brand,
  audience,
  durationSec = 30,
  constraints = {},
  risk = "interesting",
  style,
  ending,
}) {
  const clichesToAvoid = getClichesToAvoid(constraints.productCategory, storyType);

  const systemPrompt = `You are an elite creative director specializing in unconventional storytelling for advertising and branded content. Your job is to generate a STORY PROFILE that breaks conventions while remaining effective.

CRITICAL RULES:
1. DO NOT default to happy endings or positive arcs every time - vary the emotional trajectory
2. Choose structures that serve the story, not just "three_act" by default
3. Generate 3-6 creative hooks that are genuinely unexpected and "out of left field"
4. Consider how the brand can be integrated in non-obvious ways
5. The tone and rhythm should complement the story type and audience
6. Include non-copyrighted reference vibes (e.g., "dreamy handheld", "deadpan absurd", "Wes Anderson symmetry without the copyright")

You MUST respond with ONLY valid JSON matching this exact schema:
{
  "structure": "three_act | heros_journey | kishotenketsu | vignette | montage | episodic | nonlinear | fragmented | single_scene",
  "arc": "positive_change | negative_descent | flat_arc | bittersweet | ambiguous | unresolved | tragic | ironic",
  "tone": "intimate | comedic | ironic | hopeful | unsettling | nostalgic | surreal | documentary | editorial | gritty | whimsical",
  "pov": "observer | first_person | brand_as_character | object_pov | ensemble | no_narrator",
  "rhythm": "fast_montage | slow_observational | punchy_cuts | one_take_illusion | split_screen",
  "risk": "safe | interesting | bold | unusual | experimental",
  "ending": "resolved | twist | open | bittersweet | no_ending_button",
  "brand_role": "foreground | background_presence | reveal_late | implied_only | anti_ad",
  "format": "commercial | short_film | docu | trailer | music_video | social_cutdown",
  "constraints": {
    "durationSec": number,
    "mustInclude": string[],
    "mustAvoid": string[],
    "productCategory": string,
    "brandVoice": string
  },
  "creativeHooks": ["3-6 unexpected, fresh creative hooks"],
  "referenceVibes": ["non-copyright visual/tonal references like 'dreamy handheld', 'deadpan absurd'"]
}`;

  const userPrompt = `Generate a story profile for the following:

PROMPT: ${prompt}
STORY TYPE: ${storyType}
${brand ? `BRAND: ${brand}` : "BRAND: (not specified - use background_presence role)"}
${audience ? `TARGET AUDIENCE: ${audience}` : ""}
DURATION: ${durationSec} seconds
${style ? `STYLE HINT: ${style}` : ""}
${ending ? `PREFERRED ENDING TYPE: ${ending}` : ""}
RISK TOLERANCE: ${risk}

EXISTING CONSTRAINTS:
- Product Category: ${constraints.productCategory || "general"}
- Brand Voice: ${constraints.brandVoice || "not specified"}
- Must Include: ${JSON.stringify(constraints.mustInclude || [])}
- Must Avoid (user specified): ${JSON.stringify(constraints.mustAvoid || [])}

CLICHÉS TO AUTOMATICALLY AVOID (add these to mustAvoid):
${clichesToAvoid.map((c) => `- ${c}`).join("\n")}

Generate a profile that:
1. Uses an unexpected but appropriate structure for this ${durationSec}-second ${storyType}
2. Chooses an arc that isn't the obvious choice
3. Includes 3-6 creative hooks that would make a creative director say "I haven't seen that before"
4. Considers how ${brand || "the brand"} can appear in a non-traditional way
5. Adds appropriate reference vibes (without copyrighted references)`;

  const result = await chatCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    model: "gpt-4o",
    responseFormat: { type: "json_object" },
    temperature: 0.85,
    maxTokens: 1500,
  });

  const parsed = safeJsonParse(result.text);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Failed to parse story profile from LLM response");
  }

  // Validate and normalize the profile
  const profile = normalizeProfile(parsed, {
    durationSec,
    productCategory: constraints.productCategory,
    brandVoice: constraints.brandVoice,
    mustInclude: constraints.mustInclude,
    mustAvoid: [...(constraints.mustAvoid || []), ...clichesToAvoid],
    risk,
    ending,
  });

  return profile;
}

/**
 * Normalize and validate profile against schema
 */
function normalizeProfile(raw, defaults) {
  const validated = {
    structure: PROFILE_ENUMS.structure.includes(raw.structure)
      ? raw.structure
      : "three_act",
    arc: PROFILE_ENUMS.arc.includes(raw.arc) ? raw.arc : "positive_change",
    tone: PROFILE_ENUMS.tone.includes(raw.tone) ? raw.tone : "hopeful",
    pov: PROFILE_ENUMS.pov.includes(raw.pov) ? raw.pov : "observer",
    rhythm: PROFILE_ENUMS.rhythm.includes(raw.rhythm)
      ? raw.rhythm
      : "punchy_cuts",
    risk: PROFILE_ENUMS.risk.includes(raw.risk) ? raw.risk : defaults.risk || "interesting",
    ending: defaults.ending && PROFILE_ENUMS.ending.includes(defaults.ending)
      ? defaults.ending
      : PROFILE_ENUMS.ending.includes(raw.ending)
      ? raw.ending
      : "resolved",
    brand_role: PROFILE_ENUMS.brand_role.includes(raw.brand_role)
      ? raw.brand_role
      : "background_presence",
    format: PROFILE_ENUMS.format.includes(raw.format) ? raw.format : "commercial",
    constraints: {
      durationSec: defaults.durationSec || raw.constraints?.durationSec || 30,
      mustInclude: Array.isArray(raw.constraints?.mustInclude)
        ? raw.constraints.mustInclude
        : defaults.mustInclude || [],
      mustAvoid: [
        ...new Set([
          ...(Array.isArray(raw.constraints?.mustAvoid)
            ? raw.constraints.mustAvoid
            : []),
          ...(defaults.mustAvoid || []),
        ]),
      ],
      productCategory:
        raw.constraints?.productCategory || defaults.productCategory || "",
      brandVoice: raw.constraints?.brandVoice || defaults.brandVoice || "",
    },
    creativeHooks: Array.isArray(raw.creativeHooks)
      ? raw.creativeHooks.slice(0, 6)
      : [],
    referenceVibes: Array.isArray(raw.referenceVibes)
      ? raw.referenceVibes.slice(0, 5)
      : [],
  };

  // Ensure we have at least 3 creative hooks
  if (validated.creativeHooks.length < 3) {
    validated.creativeHooks = [
      ...validated.creativeHooks,
      "unexpected visual metaphor",
      "subverted audience expectations",
      "unconventional pacing choice",
    ].slice(0, 6);
  }

  return validated;
}

/**
 * Regenerate specific profile elements (used during critique loop)
 */
export async function regenerateProfileElements({
  existingProfile,
  elementsToChange = ["creativeHooks", "structure", "arc"],
  critiqueNotes = [],
}) {
  const systemPrompt = `You are revising a story profile based on critique feedback. The current profile was flagged as too generic or cliché.

Your task: Generate NEW values for the specified elements that are MORE ORIGINAL and LESS PREDICTABLE.

Current profile for context:
${JSON.stringify(existingProfile, null, 2)}

Critique notes:
${critiqueNotes.map((n) => `- ${n}`).join("\n")}

Elements to regenerate: ${elementsToChange.join(", ")}

Respond with ONLY valid JSON containing the new values for the specified elements.`;

  const result = await chatCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate fresh alternatives for: ${elementsToChange.join(", ")}` },
    ],
    model: "gpt-4o",
    responseFormat: { type: "json_object" },
    temperature: 0.95, // Higher temperature for more creative alternatives
    maxTokens: 800,
  });

  const parsed = safeJsonParse(result.text);
  if (!parsed) {
    return existingProfile;
  }

  // Merge new elements with existing profile
  const updated = { ...existingProfile };

  if (elementsToChange.includes("creativeHooks") && Array.isArray(parsed.creativeHooks)) {
    updated.creativeHooks = parsed.creativeHooks.slice(0, 6);
  }
  if (elementsToChange.includes("structure") && PROFILE_ENUMS.structure.includes(parsed.structure)) {
    updated.structure = parsed.structure;
  }
  if (elementsToChange.includes("arc") && PROFILE_ENUMS.arc.includes(parsed.arc)) {
    updated.arc = parsed.arc;
  }
  if (elementsToChange.includes("tone") && PROFILE_ENUMS.tone.includes(parsed.tone)) {
    updated.tone = parsed.tone;
  }
  if (elementsToChange.includes("referenceVibes") && Array.isArray(parsed.referenceVibes)) {
    updated.referenceVibes = parsed.referenceVibes.slice(0, 5);
  }

  return updated;
}

export default { generateProfile, regenerateProfileElements, PROFILE_ENUMS };
