// services/storyIntelligence/index.js
/**
 * Story Intelligence Engine - Main Orchestration
 * 
 * Orchestrates the complete SIE pipeline:
 * 1. Generate story profile
 * 2. Generate beats based on profile
 * 3. Run critique pass
 * 4. Regenerate if needed (max 2 loops)
 * 5. Generate alt concepts
 * 6. Generate title (if not provided)
 * 7. Return complete response
 */

import { generateProfile, regenerateProfileElements } from "./profile.js";
import { generateBeats, regenerateBeats, regenerateSingleBeat } from "./beatGenerator.js";
import {
  critiqueBeats,
  getRegenerationStrategy,
  generateAltConcepts,
  CRITIQUE_THRESHOLDS,
} from "./critic.js";
import { chatCompletion } from "../../utils/openaiClient.js";

// Maximum regeneration attempts to avoid latency
const MAX_REGENERATION_LOOPS = 2;

// Dev logging helper
const isDev = () => process.env.NODE_ENV !== "production";

/**
 * Generate a unique, memorable title for a story
 * @param {Object} params - Generation parameters
 * @returns {Promise<string>} - Generated title
 */
export async function generateTitle({ prompt, storyProfile, beats, brand }) {
  const beatSummary = beats
    .slice(0, 3)
    .map((b) => b.name || b.beatText?.substring(0, 50))
    .filter(Boolean)
    .join(", ");

  const systemPrompt = `You are a creative title generator for film/advertising projects.
Generate a SHORT, MEMORABLE title (2-5 words) that:
1. Captures the essence of the story
2. Is unique and not generic
3. Works as a project name
4. Avoids clichés like "The Journey" or "A Story of..."

Respond with ONLY valid JSON:
{
  "title": "The Generated Title"
}`;

  const userPrompt = `Generate a title for:
PROMPT: ${prompt}
${brand ? `BRAND: ${brand}` : ""}
TONE: ${storyProfile?.tone || ""}
STRUCTURE: ${storyProfile?.structure || ""}
KEY BEATS: ${beatSummary}

Create a distinctive, memorable title.`;

  try {
    const result = await chatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: "gpt-4o-mini",
      responseFormat: { type: "json_object" },
      temperature: 0.8,
      maxTokens: 100,
    });

    const parsed = JSON.parse(result.text);
    if (parsed?.title && typeof parsed.title === "string" && parsed.title.trim()) {
      return parsed.title.trim();
    }
  } catch (e) {
    console.warn("Title generation failed, using fallback:", e.message);
  }

  // Deterministic fallback: extract key words from prompt
  return generateFallbackTitle(prompt, brand);
}

/**
 * Generate a deterministic fallback title when LLM fails
 */
function generateFallbackTitle(prompt, brand) {
  const words = prompt
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 3);

  if (words.length >= 2) {
    return words.slice(0, 2).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }

  if (brand) {
    return `${brand} Story`;
  }

  return `Story ${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

/**
 * Main entry point for the Story Intelligence Engine
 * @param {Object} params - Input parameters
 * @returns {Promise<Object>} - Complete SIE response
 */
export async function generateStoryIntelligence({
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
  const startTime = Date.now();
  const metadata = {
    regenerationAttempts: 0,
    profileRegenerations: 0,
    beatRegenerations: 0,
    totalDurationMs: 0,
    model: "gpt-4o",
  };

  try {
    // ============================================
    // STEP 1: Generate Story Profile
    // ============================================
    if (isDev()) {
      console.log("[DEV] generateStoryIntelligence: Starting profile generation...");
    }
    
    let storyProfile = await generateProfile({
      prompt,
      storyType,
      brand,
      audience,
      durationSec,
      constraints,
      risk,
      style,
      ending,
    });

    if (isDev()) {
      console.log("[DEV] generateStoryIntelligence: Profile generated. Structure:", storyProfile?.structure);
    }

    // ============================================
    // STEP 2: Generate Beats (ALWAYS - CRITICAL)
    // ============================================
    if (isDev()) {
      console.log("[DEV] generateStoryIntelligence: Starting beat generation...");
    }
    
    let beats = await generateBeats({
      profile: storyProfile,
      prompt,
      brand,
    });

    // CRITICAL: Validate beats were generated
    if (!beats || !Array.isArray(beats) || beats.length === 0) {
      throw new Error("Beat generation failed: No beats returned");
    }

    if (isDev()) {
      console.log("[DEV] generateStoryIntelligence: Beats generated. Count:", beats.length);
    }

    // ============================================
    // STEP 3: Critique Pass
    // ============================================
    let critique = await critiqueBeats({
      beats,
      profile: storyProfile,
      prompt,
      brand,
      productCategory: constraints.productCategory,
    });

    // ============================================
    // STEP 4: Regeneration Loop (if needed)
    // ============================================
    let regenerationLoop = 0;

    while (critique.needsRegeneration && regenerationLoop < MAX_REGENERATION_LOOPS) {
      regenerationLoop++;
      metadata.regenerationAttempts++;

      const strategy = getRegenerationStrategy(critique);

      if (strategy.changeProfile) {
        // Regenerate profile elements
        storyProfile = await regenerateProfileElements({
          existingProfile: storyProfile,
          elementsToChange: strategy.elementsToChange,
          critiqueNotes: [...critique.fixes, ...strategy.notes],
        });
        metadata.profileRegenerations++;

        // Regenerate beats with new profile
        beats = await generateBeats({
          profile: storyProfile,
          prompt,
          brand,
        });
        metadata.beatRegenerations++;
      } else {
        // Just regenerate beats with critique feedback
        beats = await regenerateBeats({
          profile: storyProfile,
          prompt,
          brand,
          critiqueNotes: [...critique.fixes, ...strategy.notes],
        });
        metadata.beatRegenerations++;
      }

      // Re-critique the new beats
      critique = await critiqueBeats({
        beats,
        profile: storyProfile,
        prompt,
        brand,
        productCategory: constraints.productCategory,
      });
    }

    // ============================================
    // STEP 5: Generate Alternative Concepts
    // ============================================
    const altConcepts = await generateAltConcepts({
      prompt,
      profile: storyProfile,
      beats,
      count: 3,
    });

    // ============================================
    // STEP 6: Generate Title
    // ============================================
    const title = await generateTitle({
      prompt,
      storyProfile,
      beats,
      brand,
    });

    // ============================================
    // STEP 7: Prepare Response
    // ============================================
    metadata.totalDurationMs = Date.now() - startTime;

    // Add quality indicators to critique
    const finalCritique = {
      ...critique,
      passedThresholds: !critique.needsRegeneration,
      thresholds: CRITIQUE_THRESHOLDS,
    };

    return {
      success: true,
      title,
      storyProfile,
      beats,
      altConcepts,
      critique: finalCritique,
      metadata,
    };
  } catch (error) {
    metadata.totalDurationMs = Date.now() - startTime;

    return {
      success: false,
      error: error.message || "Story Intelligence Engine failed",
      storyProfile: null,
      beats: [],
      altConcepts: [],
      critique: null,
      metadata,
    };
  }
}

/**
 * Validate input parameters
 * @param {Object} params - Input parameters
 * @returns {Object} - Validated and normalized parameters
 */
export function validateInput(params) {
  const errors = [];

  // Prompt is required
  if (!params.prompt || typeof params.prompt !== "string" || !params.prompt.trim()) {
    errors.push("prompt is required and must be a non-empty string");
  }

  // Validate storyType if provided
  const validStoryTypes = [
    "commercial",
    "documentary",
    "narrative",
    "social",
    "music_video",
    "trailer",
    "short_film",
  ];
  const storyType = params.storyType || "commercial";
  if (!validStoryTypes.includes(storyType.toLowerCase())) {
    // Don't error, just default
  }

  // Validate duration
  let durationSec = 30;
  if (params.durationSec !== undefined) {
    durationSec = Number(params.durationSec);
    if (isNaN(durationSec) || durationSec < 5 || durationSec > 300) {
      durationSec = 30; // Default to 30 seconds
    }
  }

  // Validate risk level
  const validRiskLevels = ["safe", "interesting", "bold", "unusual", "experimental"];
  const risk = validRiskLevels.includes(params.risk) ? params.risk : "interesting";

  // Validate ending type
  const validEndings = ["resolved", "twist", "open", "bittersweet", "no_ending_button"];
  const ending = validEndings.includes(params.ending) ? params.ending : undefined;

  // Normalize constraints
  const constraints = {
    productCategory: params.constraints?.productCategory || "",
    brandVoice: params.constraints?.brandVoice || "",
    mustInclude: Array.isArray(params.constraints?.mustInclude)
      ? params.constraints.mustInclude.filter((i) => typeof i === "string")
      : [],
    mustAvoid: Array.isArray(params.constraints?.mustAvoid)
      ? params.constraints.mustAvoid.filter((i) => typeof i === "string")
      : [],
  };

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
    };
  }

  return {
    valid: true,
    params: {
      prompt: params.prompt.trim(),
      storyType: storyType.toLowerCase(),
      brand: params.brand || null,
      audience: params.audience || null,
      durationSec,
      constraints,
      risk,
      style: params.style || null,
      ending,
    },
  };
}

/**
 * Quick generation without critique loop (for testing/speed)
 */
export async function generateQuick({
  prompt,
  storyType = "commercial",
  brand,
  durationSec = 30,
}) {
  const profile = await generateProfile({
    prompt,
    storyType,
    brand,
    durationSec,
    risk: "interesting",
  });

  const beats = await generateBeats({
    profile,
    prompt,
    brand,
  });

  return { profile, beats };
}

/**
 * Apply a selected alternative concept and regenerate beats
 * @param {Object} params - Apply concept parameters
 * @returns {Promise<Object>} - Updated story with regenerated beats
 */
export async function applyConceptAndRegenerate({
  prompt,
  storyType = "commercial",
  brand,
  audience,
  durationSec = 30,
  constraints = {},
  selectedConcept,
  currentProfile,
  controls = {},
}) {
  const startTime = Date.now();
  const metadata = {
    appliedConcept: selectedConcept?.id || null,
    appliedConceptName: selectedConcept?.name || null,
    appliedConceptOneLiner: selectedConcept?.oneLiner || null,
    regenerationAttempts: 0,
    totalDurationMs: 0,
    model: "gpt-4o",
  };

  if (isDev()) {
    console.log("[DEV] applyConceptAndRegenerate called with selectedConcept:", {
      id: selectedConcept?.id,
      name: selectedConcept?.name,
      oneLiner: selectedConcept?.oneLiner,
      hasProfilePatch: !!selectedConcept?.profilePatch,
    });
  }

  try {
    // ============================================
    // STEP 1: Build profile with concept as hard constraint
    // ============================================
    let storyProfile = currentProfile ? { ...currentProfile } : await generateProfile({
      prompt,
      storyType,
      brand,
      audience,
      durationSec,
      constraints,
      risk: controls.risk || "interesting",
    });

    // Apply the selected concept's profilePatch (tone/structure/risk/ending/etc)
    if (selectedConcept?.profilePatch) {
      if (isDev()) {
        console.log("[DEV] Applying profilePatch:", selectedConcept.profilePatch);
      }
      storyProfile = {
        ...storyProfile,
        ...selectedConcept.profilePatch,
      };
    }

    // CRITICAL: Inject concept as a HARD CONSTRAINT
    // The concept's oneLiner becomes the guiding principle for all beats
    if (selectedConcept?.oneLiner) {
      storyProfile.conceptNorthStar = selectedConcept.oneLiner;
      storyProfile.creativeHooks = [
        selectedConcept.oneLiner,
        ...(storyProfile.creativeHooks || []).filter(h => h !== selectedConcept.oneLiner),
      ].slice(0, 6);
      
      if (isDev()) {
        console.log("[DEV] Set conceptNorthStar:", selectedConcept.oneLiner);
      }
    }

    // ============================================
    // STEP 2: REGENERATE BEATS with concept as hard constraint
    // This is the CRITICAL step - beats MUST reflect the selected concept
    // ============================================
    if (isDev()) {
      console.log("[DEV] Regenerating beats with concept constraint...");
    }

    const beats = await generateBeats({
      profile: storyProfile,
      prompt,
      brand,
      conceptNorthStar: selectedConcept?.oneLiner || null, // Pass concept directly to beat generator
    });

    // CRITICAL: Validate beats were generated
    if (!beats || !Array.isArray(beats) || beats.length === 0) {
      throw new Error("Apply concept failed: No beats generated");
    }

    if (isDev()) {
      console.log("[DEV] applyConceptAndRegenerate: Beats regenerated. Count:", beats.length);
      console.log("[DEV] Beat names:", beats.map(b => b.name).join(", "));
    }

    // ============================================
    // STEP 3: Run critique pass
    // ============================================
    const critique = await critiqueBeats({
      beats,
      profile: storyProfile,
      prompt,
      brand,
      productCategory: constraints.productCategory,
    });

    // ============================================
    // STEP 4: Generate new alternative concepts
    // ============================================
    const altConcepts = await generateAltConcepts({
      prompt,
      profile: storyProfile,
      beats,
      count: 3,
    });

    // ============================================
    // STEP 5: Optionally regenerate title
    // ============================================
    const title = await generateTitle({
      prompt,
      storyProfile,
      beats,
      brand,
    });

    // ============================================
    // STEP 6: Prepare Response
    // ============================================
    metadata.totalDurationMs = Date.now() - startTime;

    const finalCritique = {
      ...critique,
      passedThresholds: !critique.needsRegeneration,
      thresholds: CRITIQUE_THRESHOLDS,
    };

    return {
      success: true,
      title,
      storyProfile,
      beats,
      altConcepts,
      critique: finalCritique,
      metadata,
    };
  } catch (error) {
    metadata.totalDurationMs = Date.now() - startTime;

    return {
      success: false,
      error: error.message || "Apply concept failed",
      title: null,
      storyProfile: currentProfile || null,
      beats: [],
      altConcepts: [],
      critique: null,
      metadata,
    };
  }
}

// Export all submodules for direct access if needed
export { generateProfile, regenerateProfileElements } from "./profile.js";
export { generateBeats, regenerateBeats, regenerateSingleBeat } from "./beatGenerator.js";
export {
  critiqueBeats,
  shouldRegenerate,
  getRegenerationStrategy,
  generateAltConcepts,
} from "./critic.js";

export default {
  generateStoryIntelligence,
  applyConceptAndRegenerate,
  generateTitle,
  validateInput,
  generateQuick,
};
