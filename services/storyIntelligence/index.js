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
 * 6. Return complete response
 */

import { generateProfile, regenerateProfileElements } from "./profile.js";
import { generateBeats, regenerateBeats } from "./beatGenerator.js";
import {
  critiqueBeats,
  getRegenerationStrategy,
  generateAltConcepts,
  CRITIQUE_THRESHOLDS,
} from "./critic.js";

// Maximum regeneration attempts to avoid latency
const MAX_REGENERATION_LOOPS = 2;

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

    // ============================================
    // STEP 2: Generate Beats
    // ============================================
    let beats = await generateBeats({
      profile: storyProfile,
      prompt,
      brand,
    });

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
    // STEP 6: Prepare Response
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

// Export all submodules for direct access if needed
export { generateProfile, regenerateProfileElements } from "./profile.js";
export { generateBeats, regenerateBeats } from "./beatGenerator.js";
export {
  critiqueBeats,
  shouldRegenerate,
  getRegenerationStrategy,
  generateAltConcepts,
} from "./critic.js";

export default {
  generateStoryIntelligence,
  validateInput,
  generateQuick,
};
