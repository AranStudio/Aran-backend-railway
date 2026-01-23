// routes/visualsForBeat.js
/**
 * Generate visual/frame for a single beat
 * POST /api/visuals/generate-for-beat
 * 
 * This endpoint generates a cinematic visual frame for a specific beat
 * without regenerating the entire deck.
 * 
 * UPDATED: Now persists generated images to Supabase Storage and updates
 * the beat's visual_url in the database.
 */

import { createClient } from "@supabase/supabase-js";
import { openai, asDataUrlFromB64 } from "../utils/openaiClient.js";
import {
  uploadBeatVisual,
  updateBeatMediaUrls,
  updateDeckThumbnail,
} from "../utils/supabaseStorage.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

/**
 * Get Supabase client for database operations
 */
function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Generate visual image for a single beat
 * 
 * Request body:
 * {
 *   storyId?: string,
 *   deckId?: string,
 *   beatId: number|string (required) - Can be beat ID or beat index
 *   beatIndex?: number - Explicit beat index (0-based)
 *   beatText: string (required),
 *   style?: string,
 *   aspectRatio?: string ("1:1" | "16:9" | "3:2"),
 *   persist?: boolean (default: true) - Whether to persist to storage/DB
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   beatId: number|string,
 *   beatIndex: number,
 *   visual_url: string (public URL if persisted, data URL otherwise),
 *   visualImageUrl: string (alias for backward compatibility),
 *   thumbnail_url: string (same as visual_url),
 *   persisted: boolean
 * }
 */
export async function generateVisualsForBeat(req, res) {
  try {
    const { 
      storyId, 
      deckId, 
      beatId, 
      beatIndex: explicitBeatIndex,
      beatText, 
      style, 
      aspectRatio,
      persist = true,
    } = req.body || {};

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

    // Determine beat index (0-based) for storage path and DB update
    // Priority: explicit beatIndex > beatId if numeric
    const beatIndex = explicitBeatIndex !== undefined 
      ? Number(explicitBeatIndex) 
      : (typeof beatId === "number" ? beatId : parseInt(beatId, 10) || 0);

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

    console.log(`Generating visual for beat ${beatId} (index: ${beatIndex}):`, imgPrompt.substring(0, 100));

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: imgPrompt,
      size,
    });

    const b64 = response?.data?.[0]?.b64_json;
    const url = response?.data?.[0]?.url;
    const dataUrl = asDataUrlFromB64(b64);

    const generatedImageUrl = dataUrl || url || null;

    if (!generatedImageUrl) {
      return res.status(502).json({
        success: false,
        error: "Failed to generate visual image",
      });
    }

    // =========================================================================
    // PERSIST TO STORAGE AND DATABASE (if deckId provided and persist=true)
    // =========================================================================
    let visual_url = generatedImageUrl;
    let persisted = false;

    if (persist && deckId && generatedImageUrl) {
      try {
        // Upload to Supabase Storage
        const publicUrl = await uploadBeatVisual(generatedImageUrl, deckId, beatIndex);
        
        if (publicUrl) {
          visual_url = publicUrl;
          
          // Get Supabase client for DB updates
          const supabase = getSupabaseClient();
          
          if (supabase) {
            // Update beat in deck content with the new URL
            const updated = await updateBeatMediaUrls(supabase, deckId, beatIndex, {
              visual_url: publicUrl,
              thumbnail_url: publicUrl,
            });
            
            if (updated) {
              persisted = true;
              
              // Also update deck thumbnail if this is the first beat or deck has no thumbnail
              if (beatIndex === 0) {
                await updateDeckThumbnail(supabase, deckId, publicUrl, true);
              }
            }
          }
        }
      } catch (persistError) {
        // Log but don't fail the request - still return the generated image
        console.error("Failed to persist visual to storage:", persistError.message);
      }
    }

    // Return response with consistent field names
    return res.json({
      success: true,
      beatId,
      beatIndex,
      storyId: storyId || null,
      deckId: deckId || null,
      // Canonical fields (snake_case)
      visual_url,
      thumbnail_url: visual_url,
      // Backward compatibility (camelCase)
      visualImageUrl: visual_url,
      visualUrl: visual_url,
      thumbnailUrl: visual_url,
      // Metadata
      persisted,
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
