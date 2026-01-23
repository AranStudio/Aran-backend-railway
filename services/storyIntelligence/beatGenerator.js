// services/storyIntelligence/beatGenerator.js
/**
 * Beat Generator
 * Generates story beats strictly driven by the story profile.
 * Beats are story-type aware with varied naming conventions.
 */

import { chatCompletion } from "../../utils/openaiClient.js";

// Beat naming templates by structure type
const BEAT_NAME_TEMPLATES = {
  three_act: [
    "The World Before",
    "The Inciting Moment",
    "Rising Action",
    "The Turning Point",
    "Climax",
    "Resolution",
    "New Equilibrium",
  ],
  heros_journey: [
    "Ordinary World",
    "Call to Adventure",
    "Crossing the Threshold",
    "Tests & Allies",
    "The Ordeal",
    "The Reward",
    "Return Transformed",
  ],
  kishotenketsu: [
    "Introduction (Ki)",
    "Development (Shō)",
    "Twist (Ten)",
    "Conclusion (Ketsu)",
  ],
  vignette: [
    "The Glimpse",
    "A Moment Captured",
    "Texture & Detail",
    "The Lingering Feeling",
  ],
  montage: [
    "Opening Frame",
    "Building Rhythm",
    "Acceleration",
    "Peak Energy",
    "The Breath",
    "Landing",
  ],
  episodic: [
    "Episode One",
    "Episode Two",
    "Episode Three",
    "The Thread",
    "Convergence",
  ],
  nonlinear: [
    "Fragment A",
    "Fragment B",
    "The Connection",
    "Recontextualization",
    "The Full Picture",
  ],
  fragmented: [
    "Shard",
    "Echo",
    "Glimpse",
    "Memory",
    "Revelation",
  ],
  single_scene: [
    "Setup",
    "The Unfolding",
    "The Core",
    "The Turn",
    "Landing",
  ],
};

// Format-specific beat considerations
const FORMAT_GUIDANCE = {
  commercial: "Keep beats tight and visual. Each beat should be filmable in 3-8 seconds. Product/brand integration should feel organic.",
  short_film: "Allow beats to breathe. Emotional beats can extend. Character development matters.",
  docu: "Ground beats in authenticity. Mix observational moments with intentional reveals.",
  trailer: "Front-load intrigue. Each beat should raise a question or promise something compelling.",
  music_video: "Beats should sync with musical phrases. Visual rhythm is paramount. Abstract is okay.",
  social_cutdown: "Hook immediately. First beat must grab in 1-2 seconds. Optimize for thumb-stopping.",
};

function safeJsonParse(str) {
  try {
    const cleaned = str.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Calculate optimal beat count based on duration and format
 */
function calculateBeatCount(durationSec, format, structure) {
  // Base calculation: roughly one beat per 5-8 seconds for most formats
  let baseBeatCount = Math.max(3, Math.min(12, Math.ceil(durationSec / 6)));

  // Adjust for structure
  if (structure === "kishotenketsu") {
    baseBeatCount = 4; // Fixed 4-beat structure
  } else if (structure === "single_scene") {
    baseBeatCount = Math.max(3, Math.min(5, baseBeatCount));
  } else if (structure === "vignette") {
    baseBeatCount = Math.max(3, Math.min(4, baseBeatCount));
  }

  // Adjust for format
  if (format === "social_cutdown" && durationSec <= 15) {
    baseBeatCount = Math.min(4, baseBeatCount);
  } else if (format === "trailer") {
    baseBeatCount = Math.max(5, baseBeatCount);
  }

  return baseBeatCount;
}

/**
 * Generate beat names based on structure
 */
function getBeatNames(structure, count) {
  const templates = BEAT_NAME_TEMPLATES[structure] || BEAT_NAME_TEMPLATES.three_act;
  const names = [];

  for (let i = 0; i < count; i++) {
    if (i < templates.length) {
      names.push(templates[i]);
    } else {
      // Fallback for additional beats
      names.push(`Movement ${i + 1}`);
    }
  }

  return names;
}

/**
 * Generate story beats based on the story profile
 * @param {Object} profile - The story profile
 * @param {string} prompt - Original user prompt
 * @param {string} brand - Brand name (optional)
 * @returns {Promise<Array>} - Array of beat objects
 */
export async function generateBeats({ profile, prompt, brand }) {
  const beatCount = calculateBeatCount(
    profile.constraints.durationSec,
    profile.format,
    profile.structure
  );

  const beatNames = getBeatNames(profile.structure, beatCount);
  const formatGuidance = FORMAT_GUIDANCE[profile.format] || FORMAT_GUIDANCE.commercial;

  const systemPrompt = `You are an expert story architect. Generate story beats that STRICTLY follow the provided story profile.

CRITICAL REQUIREMENTS:
1. Each beat must serve the overall ${profile.structure} structure
2. The emotional arc must follow: ${profile.arc}
3. Tone must remain: ${profile.tone}
4. POV must be: ${profile.pov}
5. Rhythm/pacing: ${profile.rhythm}
6. Brand integration: ${profile.brand_role}
7. Ending type: ${profile.ending}

FORMAT GUIDANCE: ${formatGuidance}

CREATIVE HOOKS TO INCORPORATE:
${profile.creativeHooks.map((h, i) => `${i + 1}. ${h}`).join("\n")}

REFERENCE VIBES:
${profile.referenceVibes.join(", ")}

MUST INCLUDE: ${JSON.stringify(profile.constraints.mustInclude)}
MUST AVOID: ${JSON.stringify(profile.constraints.mustAvoid.slice(0, 10))}

Beat names should be: ${beatNames.join(", ")}

Respond with ONLY valid JSON in this format:
{
  "beats": [
    {
      "id": 1,
      "name": "beat name from the list",
      "intent": "what this beat accomplishes emotionally/narratively",
      "beatText": "detailed beat description - what happens, what we see, what we feel",
      "cameraNotes": "optional camera/visual direction",
      "audioNotes": "optional sound/music direction",
      "onScreenText": "optional text/super that appears",
      "brandIntegration": "how brand appears in this beat (if applicable)"
    }
  ]
}`;

  const userPrompt = `Generate ${beatCount} story beats for:

STORY PROMPT: ${prompt}
${brand ? `BRAND: ${brand}` : ""}
DURATION: ${profile.constraints.durationSec} seconds
FORMAT: ${profile.format}

Create beats that:
1. Follow the ${profile.structure} structure exactly
2. Build toward a ${profile.ending} ending
3. Maintain ${profile.tone} tone throughout
4. Use ${profile.rhythm} pacing
5. Integrate the brand with ${profile.brand_role} approach
6. Incorporate at least 2 of the creative hooks

Remember: Beat names should be varied and story-type aware, NOT generic "Beat 1", "Beat 2" etc.`;

  const result = await chatCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    model: "gpt-4o",
    responseFormat: { type: "json_object" },
    temperature: 0.75,
    maxTokens: 3000,
  });

  const parsed = safeJsonParse(result.text);

  if (!parsed || !Array.isArray(parsed.beats)) {
    throw new Error("Failed to parse beats from LLM response");
  }

  // Validate and normalize beats
  const beats = parsed.beats.map((beat, index) => ({
    id: beat.id || index + 1,
    name: beat.name || beatNames[index] || `Beat ${index + 1}`,
    intent: beat.intent || "",
    beatText: beat.beatText || "",
    cameraNotes: beat.cameraNotes || null,
    audioNotes: beat.audioNotes || null,
    onScreenText: beat.onScreenText || null,
    brandIntegration: beat.brandIntegration || null,
  }));

  // Ensure we have at least 3 beats
  if (beats.length < 3) {
    throw new Error("Generated too few beats");
  }

  return beats;
}

/**
 * Regenerate beats with modified profile (used in critique loop)
 */
export async function regenerateBeats({ profile, prompt, brand, critiqueNotes = [] }) {
  const systemPrompt = `You are regenerating story beats because the previous version was flagged as too generic or cliché.

CRITIQUE NOTES TO ADDRESS:
${critiqueNotes.map((n) => `- ${n}`).join("\n")}

You MUST make the new beats:
1. More specific and vivid
2. Less predictable
3. More aligned with the creative hooks
4. Fresh and original

Follow all other profile requirements strictly.`;

  // Inject critique awareness into the generation
  const modifiedProfile = {
    ...profile,
    creativeHooks: [
      ...profile.creativeHooks,
      "subvert the expected",
      "find the unexpected angle",
    ].slice(0, 6),
  };

  return generateBeats({
    profile: modifiedProfile,
    prompt: `${prompt}\n\nIMPORTANT: Avoid generic approaches. ${critiqueNotes.join(". ")}`,
    brand,
  });
}

export default { generateBeats, regenerateBeats };
