// routes/storyIntelligence.js
/**
 * Story Intelligence Engine API Route
 * 
 * POST /api/story/intelligence/generate
 * 
 * Generates a complete story package including:
 * - Story Profile (structure, arc, tone, POV, rhythm, risk, brand role, constraints)
 * - Story Beats (driven by profile)
 * - Critique Analysis (anti-generic checking)
 * - Alternative Concepts (3 structurally different options)
 */

import {
  generateStoryIntelligence,
  validateInput,
} from "../services/storyIntelligence/index.js";

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

    // Format response
    const response = {
      success: true,
      storyProfile: result.storyProfile,
      beats: result.beats,
      altConcepts: result.altConcepts,
      critique: result.critique,
      metadata: result.metadata,
    };

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
 * Health check / test endpoint for story intelligence
 * GET /api/story/intelligence/health
 */
export async function storyIntelligenceHealth(req, res) {
  return res.json({
    status: "ok",
    service: "Story Intelligence Engine",
    version: "1.0.0",
    endpoints: {
      generate: "POST /api/story/intelligence/generate",
    },
    inputSchema: {
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
    outputSchema: {
      success: "boolean",
      storyProfile: "StoryProfile object",
      beats: "Beat[]",
      altConcepts: "string[]",
      critique: "Critique object",
      metadata: "Metadata object",
    },
  });
}

export default storyIntelligenceGenerate;
