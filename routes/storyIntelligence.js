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
  try {
    const body = req.body || {};

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
      return res.status(502).json({
        success: false,
        error: result.error || "Story Intelligence Engine failed",
        metadata: result.metadata,
      });
    }

    // Format response - always include title, beats, and all required fields
    const response = {
      success: true,
      title: result.title || "Untitled Story",
      storyProfile: result.storyProfile,
      beats: result.beats || [],
      altConcepts: result.altConcepts || [],
      critique: result.critique,
      metadata: result.metadata,
    };

    // Ensure beats are never empty (critical requirement)
    if (!response.beats || response.beats.length === 0) {
      return res.status(502).json({
        success: false,
        error: "Story Intelligence Engine failed to generate beats",
        metadata: result.metadata,
      });
    }

    return res.json(response);
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
 * Request body:
 * {
 *   prompt: string (required),
 *   storyType?: string,
 *   selectedConcept: { id, name, tagline, oneLiner, profilePatch? },
 *   currentProfile?: Object,
 *   controls?: { risk?, creativityLevel? }
 * }
 */
export async function storyIntelligenceApplyConcept(req, res) {
  try {
    const body = req.body || {};

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
      return res.status(502).json({
        success: false,
        error: result.error || "Apply concept failed",
        metadata: result.metadata,
      });
    }

    return res.json({
      success: true,
      title: result.title,
      storyProfile: result.storyProfile,
      beats: result.beats,
      altConcepts: result.altConcepts,
      critique: result.critique,
      metadata: result.metadata,
    });
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

    return res.json({
      success: true,
      updatedBeat,
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
