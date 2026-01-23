// routes/storyboardForBeat.js
/**
 * Generate storyboard for a single beat
 * POST /api/storyboard/generate-for-beat
 * 
 * This endpoint generates a storyboard image for a specific beat
 * without regenerating the entire deck.
 */

import { openai, asDataUrlFromB64 } from "../utils/openaiClient.js";

/**
 * Generate storyboard image for a single beat
 * 
 * Request body:
 * {
 *   storyId?: string,
 *   deckId?: string,
 *   beatId: number|string (required),
 *   beatText: string (required),
 *   style?: string,
 *   aspectRatio?: string ("1:1" | "16:9" | "3:2")
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   beatId: number|string,
 *   storyboardImageUrl: string (data URL)
 * }
 */
export async function generateStoryboardForBeat(req, res) {
  try {
    const { storyId, deckId, beatId, beatText, style, aspectRatio } = req.body || {};

    // Validate required fields
    if (beatId === undefined || beatId === null) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: beatId",
      });
    }

    if (!beatText || typeof beatText !== "string" || !beatText.trim()) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: beatText",
      });
    }

    // Determine image size based on aspect ratio
    let size = "1024x1024"; // Default square
    if (aspectRatio === "16:9") {
      size = "1792x1024";
    } else if (aspectRatio === "3:2") {
      size = "1536x1024";
    }

    // Build the prompt for storyboard generation
    const styleHint = style ? `Style: ${style}. ` : "";
    const imgPrompt = `
Black-and-white storyboard frame, pencil/ink concept art.
${styleHint}No text in image. High contrast. Simple composition.
Professional storyboard quality.

Beat description: ${beatText.trim()}
`.trim();

    console.log(`Generating storyboard for beat ${beatId}:`, imgPrompt.substring(0, 100));

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: imgPrompt,
      size,
    });

    const b64 = response?.data?.[0]?.b64_json;
    const url = response?.data?.[0]?.url;
    const dataUrl = asDataUrlFromB64(b64);

    const storyboardImageUrl = dataUrl || url || null;

    if (!storyboardImageUrl) {
      return res.status(502).json({
        success: false,
        error: "Failed to generate storyboard image",
      });
    }

    return res.json({
      success: true,
      beatId,
      storyId: storyId || null,
      deckId: deckId || null,
      storyboardImageUrl,
    });
  } catch (error) {
    console.error("generateStoryboardForBeat error:", error);
    
    if (error.status === 400) {
      return res.status(400).json({
        success: false,
        error: error.message || "Invalid request",
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || "Storyboard generation failed",
    });
  }
}

export default generateStoryboardForBeat;
