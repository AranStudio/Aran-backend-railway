// routes/visualsForBeat.js
/**
 * Generate visual/frame for a single beat
 * POST /api/visuals/generate-for-beat
 * 
 * This endpoint generates a cinematic visual frame for a specific beat
 * without regenerating the entire deck.
 */

import { openai, asDataUrlFromB64 } from "../utils/openaiClient.js";

/**
 * Generate visual image for a single beat
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
 *   visualImageUrl: string (data URL)
 * }
 */
export async function generateVisualsForBeat(req, res) {
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

    // Build the prompt for visual generation
    const styleHint = style ? `Style: ${style}. ` : "";
    const imgPrompt = `
Create ONE cinematic frame for this story beat.
${styleHint}No text in the image.
Film still quality, professional composition.
Photoreal, high-end visual with beautiful lighting.

Beat description: ${beatText.trim()}
`.trim();

    console.log(`Generating visual for beat ${beatId}:`, imgPrompt.substring(0, 100));

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: imgPrompt,
      size,
    });

    const b64 = response?.data?.[0]?.b64_json;
    const url = response?.data?.[0]?.url;
    const dataUrl = asDataUrlFromB64(b64);

    const visualImageUrl = dataUrl || url || null;

    if (!visualImageUrl) {
      return res.status(502).json({
        success: false,
        error: "Failed to generate visual image",
      });
    }

    return res.json({
      success: true,
      beatId,
      storyId: storyId || null,
      deckId: deckId || null,
      visualImageUrl,
    });
  } catch (error) {
    console.error("generateVisualsForBeat error:", error);
    
    if (error.status === 400) {
      return res.status(400).json({
        success: false,
        error: error.message || "Invalid request",
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || "Visual generation failed",
    });
  }
}

export default generateVisualsForBeat;
