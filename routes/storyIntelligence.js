// routes/storyIntelligence.js
/**
 * Story Intelligence Engine API Routes
 * 
 * POST /api/story/intelligence/generate
 * POST /api/story/intelligence/apply-concept
 * POST /api/story/intelligence/regenerate-beat
 * 
 * Generates a complete story package including:
 * - Title (auto-generated, unique)
 * - Story Profile (structure, arc, tone, POV, rhythm, risk, brand role, constraints)
 * - Story Beats (driven by profile, with meaningful names)
 * - Critique Analysis (anti-generic checking)
 * - Alternative Concepts (structured objects with name + tagline)
 */

import {
  generateStoryIntelligence,
  applyConceptAndRegenerate,
  generateTitle,
  validateInput,
} from "../services/storyIntelligence/index.js";
import { regenerateSingleBeat } from "../services/storyIntelligence/beatGenerator.js";
import { critiqueBeats } from "../services/storyIntelligence/critic.js";

/**
 * Normalizes a generation result for frontend compatibility.
 * Critical: adds `text` alias for `beatText` (required by frontend)
 * and `title` alias for `name` in altConcepts.
 * 
 * @param {Object} result - The raw generation result
 * @returns {Object} - Normalized result with both beatText and text fields
 */
function normalizeGenerationOutput(result) {
  const out = {
    ...result,
    beats: Array.isArray(result?.beats)
      ? result.beats.map((b, i) => ({
          ...b,
          // ✅ add `text` alias required by frontend (keep beatText for backwards compat)
          text: b.text ?? b.beatText ?? "",
          id: b.id ?? i + 1,
        }))
      : [],
    altConcepts: Array.isArray(result?.altConcepts)
      ? result.altConcepts.map((c) => ({
          ...c,
          // optional alias for frontend
          title: c.title ?? c.name ?? "",
        }))
      : [],
  };
  return out;
}

/**
 * Validates a normalized generation output and returns error info if invalid.
 * @param {Object} out - Normalized output from normalizeGenerationOutput
 * @returns {{ valid: boolean, errorInfo?: Object }}
 */
function validateGenerationOutput(out) {
  if (!out.title || !Array.isArray(out.beats) || out.beats.length === 0 || !out.beats[0].text) {
    return {
      valid: false,
      errorInfo: {
        hasTitle: !!out.title,
        beatsLen: out.beats?.length,
        firstBeatKeys: out.beats?.[0] ? Object.keys(out.beats[0]) : null,
      },
    };
  }
  return { valid: true };
}

/**
 * Main handler for story intelligence generation
 * 
 * Request body:
 * {
 *   prompt: string (required) - The story/creative brief
 *   storyType?: string - commercial|documentary|narrative|social|music_video|trailer|short_film
 *   brand?: string - Brand name
 *   audience?: string - Target audience description
 *   durationSec?: number - Duration in seconds (5-300, default 30)
 *   constraints?: {
 *     productCategory?: string,
 *     brandVoice?: string,
 *     mustInclude?: string[],
 *     mustAvoid?: string[]
 *   }
 *   risk?: string - safe|interesting|bold|unusual|experimental
 *   style?: string - Style hints
 *   ending?: string - resolved|twist|open|bittersweet|no_ending_button
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   storyProfile: Object,
 *   beats: Array,
 *   altConcepts: string[],
 *   critique: Object,
 *   metadata: Object
 * }
 */
export async function storyIntelligenceGenerate(req, res) {
  const isDev = process.env.NODE_ENV !== "production";
  
  try {
    const body = req.body || {};

    if (isDev) {
      console.log("[DEV] /story/intelligence/generate called with prompt:", body.prompt?.substring(0, 100));
    }

    // Validate input
    const validation = validateInput(body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: "Invalid input",
        details: validation.errors,
      });
    }

    const {
      prompt,
      storyType,
      brand,
      audience,
      durationSec,
      constraints,
      risk,
      style,
      ending,
    } = validation.params;

    // Generate story intelligence
    const result = await generateStoryIntelligence({
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

    if (!result.success) {
      console.error("[ERROR] generateStoryIntelligence failed:", result.error);
      return res.status(502).json({
        success: false,
        error: result.error || "Story Intelligence Engine failed",
        metadata: result.metadata,
      });
    }

    // CRITICAL: Validate beats are present and non-empty
    if (!result.beats || !Array.isArray(result.beats) || result.beats.length === 0) {
      console.error("[ERROR] Story Intelligence Engine returned empty beats");
      return res.status(500).json({
        success: false,
        error: "Story Intelligence Engine failed to generate beats - beats array is empty or undefined",
        metadata: result.metadata,
      });
    }

    // Format response - always include title, beats, and all required fields
    const response = {
      success: true,
      title: result.title || "Untitled Story",
      story_type: storyType || "general", // REQUIRED - never undefined
      storyProfile: result.storyProfile,
      beats: result.beats, // REQUIRED - must be non-empty array
      altConcepts: result.altConcepts || [],
      critique: result.critique,
      metadata: result.metadata,
    };

    // ✅ Normalize output for frontend compatibility (adds text alias for beatText)
    const out = normalizeGenerationOutput(response);

    // ✅ Validate output - return 502 if missing title/beats/text
    const outputValidation = validateGenerationOutput(out);
    if (!outputValidation.valid) {
      console.error("INVALID_GENERATION_OUTPUT", outputValidation.errorInfo);
      return res.status(502).json({
        success: false,
        error: "Invalid generation output (missing beats/text)",
      });
    }

    // Log to confirm deploy is live
    console.log("GENERATE_RESPONSE_KEYS", {
      beat0Keys: out.beats?.[0] ? Object.keys(out.beats[0]) : [],
    });

    if (isDev) {
      console.log("[DEV] /story/intelligence/generate SUCCESS - returning", out.beats.length, "beats");
    }

    return res.status(200).json(out);
  } catch (error) {
    console.error("Story Intelligence error:", error);

    // Handle specific error types
    if (error.message?.includes("OPENAI_API_KEY")) {
      return res.status(500).json({
        success: false,
        error: "OpenAI API key not configured",
      });
    }

    if (error.message?.includes("rate limit")) {
      return res.status(429).json({
        success: false,
        error: "Rate limit exceeded. Please try again later.",
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}

/**
 * Apply a selected alternative concept and regenerate beats
 * POST /api/story/intelligence/apply-concept
 * 
 * CRITICAL: This endpoint MUST regenerate beats using the selected concept.
 * It must NOT just return refreshed altConcepts without new beats.
 * 
 * Request body:
 * {
 *   prompt: string (required),
 *   storyType?: string,
 *   selectedConcept: { id, name, tagline, oneLiner, profilePatch? } (required),
 *   currentProfile?: Object,
 *   controls?: { risk?, creativityLevel? }
 * }
 * 
 * Response MUST include:
 * - beats: Array of regenerated beats reflecting the selected concept
 * - storyProfile: Updated profile with concept applied
 */
export async function storyIntelligenceApplyConcept(req, res) {
  const isDev = process.env.NODE_ENV !== "production";
  
  try {
    const body = req.body || {};

    if (isDev) {
      console.log("[DEV] /story/intelligence/apply-concept called with:", {
        prompt: body.prompt?.substring(0, 50),
        selectedConceptId: body.selectedConcept?.id,
        selectedConceptName: body.selectedConcept?.name,
        selectedConceptOneLiner: body.selectedConcept?.oneLiner,
      });
    }

    if (!body.prompt || typeof body.prompt !== "string" || !body.prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: prompt",
      });
    }

    if (!body.selectedConcept || typeof body.selectedConcept !== "object") {
      return res.status(400).json({
        success: false,
        error: "Missing required field: selectedConcept",
      });
    }

    // Validate selectedConcept has required fields
    if (!body.selectedConcept.oneLiner && !body.selectedConcept.name) {
      return res.status(400).json({
        success: false,
        error: "selectedConcept must have at least name or oneLiner field",
      });
    }

    const result = await applyConceptAndRegenerate({
      prompt: body.prompt.trim(),
      storyType: body.storyType || "commercial",
      brand: body.brand || null,
      audience: body.audience || null,
      durationSec: body.durationSec || 30,
      constraints: body.constraints || {},
      selectedConcept: body.selectedConcept,
      currentProfile: body.currentProfile || null,
      controls: body.controls || {},
    });

    if (!result.success) {
      console.error("[ERROR] applyConceptAndRegenerate failed:", result.error);
      return res.status(502).json({
        success: false,
        error: result.error || "Apply concept failed",
        metadata: result.metadata,
      });
    }

    // CRITICAL: Validate beats are present and non-empty
    // apply-concept MUST return regenerated beats, not just altConcepts
    if (!result.beats || !Array.isArray(result.beats) || result.beats.length === 0) {
      console.error("[ERROR] apply-concept returned empty beats - this is a critical failure");
      return res.status(500).json({
        success: false,
        error: "Apply concept failed to regenerate beats - beats array is empty or undefined",
        metadata: result.metadata,
      });
    }

    if (isDev) {
      console.log("[DEV] /story/intelligence/apply-concept SUCCESS");
      console.log("[DEV] Beats regenerated:", result.beats.length);
      console.log("[DEV] Beat names:", result.beats.map(b => b.name).join(", "));
    }

    // Format response
    const response = {
      success: true,
      title: result.title,
      story_type: body.storyType || "general", // REQUIRED - never undefined
      storyProfile: result.storyProfile,
      beats: result.beats, // REQUIRED - regenerated beats reflecting selected concept
      altConcepts: result.altConcepts, // Optional - new alt concepts (but not primary output)
      critique: result.critique,
      metadata: result.metadata,
    };

    // ✅ Normalize output for frontend compatibility (adds text alias for beatText)
    const out = normalizeGenerationOutput(response);

    // ✅ Validate output - return 502 if missing title/beats/text
    const outputValidation = validateGenerationOutput(out);
    if (!outputValidation.valid) {
      console.error("INVALID_GENERATION_OUTPUT (apply-concept)", outputValidation.errorInfo);
      return res.status(502).json({
        success: false,
        error: "Invalid generation output (missing beats/text)",
      });
    }

    // Log to confirm deploy is live
    console.log("APPLY_CONCEPT_RESPONSE_KEYS", {
      beat0Keys: out.beats?.[0] ? Object.keys(out.beats[0]) : [],
    });

    return res.status(200).json(out);
  } catch (error) {
    console.error("Apply concept error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}

/**
 * Regenerate a single beat without regenerating the entire story
 * POST /api/story/intelligence/regenerate-beat
 * 
 * Request body:
 * {
 *   storyId?: string,
 *   deckId?: string,
 *   beatId: number|string (required),
 *   currentBeat?: Object,
 *   storyProfile: Object (required),
 *   prompt: string (required),
 *   allBeats?: Beat[],
 *   beatContext?: { instructions? },
 *   controls?: { temperature?, creativityLevel? }
 * }
 */
export async function storyIntelligenceRegenerateBeat(req, res) {
  try {
    const body = req.body || {};

    if (body.beatId === undefined || body.beatId === null) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: beatId",
      });
    }

    if (!body.prompt || typeof body.prompt !== "string" || !body.prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: prompt",
      });
    }

    if (!body.storyProfile || typeof body.storyProfile !== "object") {
      return res.status(400).json({
        success: false,
        error: "Missing required field: storyProfile",
      });
    }

    const updatedBeat = await regenerateSingleBeat({
      beatId: body.beatId,
      currentBeat: body.currentBeat || null,
      profile: body.storyProfile,
      prompt: body.prompt.trim(),
      brand: body.brand || null,
      allBeats: body.allBeats || [],
      beatContext: body.beatContext || {},
      controls: body.controls || {},
    });

    // Optionally run a mini-critique on the updated beat
    let critique = null;
    if (body.includeCritique !== false) {
      try {
        critique = await critiqueBeats({
          beats: [updatedBeat],
          profile: body.storyProfile,
          prompt: body.prompt,
          brand: body.brand,
          productCategory: body.storyProfile?.constraints?.productCategory,
        });
      } catch (critiqueError) {
        console.warn("Beat critique failed:", critiqueError.message);
      }
    }

    // ✅ Normalize updatedBeat to add text alias for frontend compatibility
    const normalizedBeat = {
      ...updatedBeat,
      text: updatedBeat.text ?? updatedBeat.beatText ?? "",
    };

    // Log to confirm deploy is live
    console.log("REGENERATE_BEAT_RESPONSE_KEYS", {
      beatKeys: Object.keys(normalizedBeat),
    });

    return res.json({
      success: true,
      story_type: body.storyType || "general", // REQUIRED - never undefined
      updatedBeat: normalizedBeat,
      critique,
    });
  } catch (error) {
    console.error("Regenerate beat error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}

/**
 * Health check / test endpoint for story intelligence
 * GET /api/story/intelligence/health
 */
export async function storyIntelligenceHealth(req, res) {
  return res.json({
    status: "ok",
    service: "Story Intelligence Engine",
    version: "2.0.0",
    endpoints: {
      generate: "POST /api/story/intelligence/generate",
      applyConcept: "POST /api/story/intelligence/apply-concept",
      regenerateBeat: "POST /api/story/intelligence/regenerate-beat",
      health: "GET /api/story/intelligence/health",
    },
    inputSchema: {
      generate: {
        prompt: "string (required)",
        storyType: "commercial|documentary|narrative|social|music_video|trailer|short_film",
        brand: "string",
        audience: "string",
        durationSec: "number (5-300)",
        constraints: {
          productCategory: "string",
          brandVoice: "string",
          mustInclude: "string[]",
          mustAvoid: "string[]",
        },
        risk: "safe|interesting|bold|unusual|experimental",
        style: "string",
        ending: "resolved|twist|open|bittersweet|no_ending_button",
      },
      applyConcept: {
        prompt: "string (required)",
        selectedConcept: "{ id, name, tagline, oneLiner, profilePatch? } (required)",
        currentProfile: "StoryProfile object",
        controls: "{ risk?, creativityLevel? }",
      },
      regenerateBeat: {
        beatId: "number|string (required)",
        prompt: "string (required)",
        storyProfile: "StoryProfile object (required)",
        currentBeat: "Beat object",
        allBeats: "Beat[]",
        beatContext: "{ instructions? }",
        controls: "{ temperature? }",
      },
    },
    outputSchema: {
      generate: {
        success: "boolean",
        title: "string",
        storyProfile: "StoryProfile object",
        beats: "Beat[] (with id, name, intent, beatText, etc.)",
        altConcepts: "AltConcept[] (with id, name, tagline, oneLiner, profilePatch)",
        critique: "Critique object",
        metadata: "Metadata object",
      },
      applyConcept: "Same as generate",
      regenerateBeat: {
        success: "boolean",
        updatedBeat: "Beat object",
        critique: "Critique object (optional)",
      },
    },
  });
}

export default storyIntelligenceGenerate;
