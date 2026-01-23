// routes/generateVisuals.js
/**
 * Generate visual frames for multiple beats
 * POST /api/generate-visuals
 * 
 * UPDATED: Now supports persisting generated images to Supabase Storage
 * and updating beat visual_url fields in the database.
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
 * Generate visual frames for multiple beats
 * 
 * Request body:
 * {
 *   prompt: string (required) - Overall story/project prompt
 *   beats: string[] (required) - Array of beat descriptions
 *   deckId?: string - Deck ID for persisting to database
 *   persist?: boolean (default: true) - Whether to persist to storage/DB
 *   style?: string - Style hint for visuals
 *   aspectRatio?: string ("1:1" | "16:9" | "3:2")
 * }
 * 
 * Response:
 * {
 *   frames: [
 *     {
 *       beatIndex: number,
 *       visual_url: string (public URL if persisted, data URL otherwise),
 *       dataUrl: string (alias for backward compatibility),
 *       thumbnail_url: string,
 *       persisted: boolean
 *     }
 *   ],
 *   deckThumbnailUpdated: boolean
 * }
 */
export default async function generateVisuals(req, res) {
  try {
    // Log incoming payload for debugging
    console.log("generate-visuals payload:", JSON.stringify(req.body, null, 2));

    // Validate environment variables before processing
    if (!process.env.OPENAI_API_KEY) {
      console.error("generate-visuals error: Missing OPENAI_API_KEY environment variable");
      return res.status(500).json({ error: "Server configuration error: missing API key" });
    }

    const { 
      prompt, 
      beats, 
      deckId, 
      persist = true,
      style,
      aspectRatio,
    } = req.body || {};

    // Validate required fields with helpful error messages
    if (!prompt) {
      return res.status(400).json({ error: "Missing required field: prompt" });
    }

    if (beats !== undefined && beats !== null && !Array.isArray(beats)) {
      return res.status(400).json({ error: "Invalid field: beats must be an array" });
    }

    const beatsArray = beats || [];

    if (beatsArray.length === 0) {
      return res.json({ frames: [], deckThumbnailUpdated: false });
    }

    // Determine image size based on aspect ratio
    let size = "1024x1024"; // Default square
    if (aspectRatio === "16:9") {
      size = "1792x1024";
    } else if (aspectRatio === "3:2") {
      size = "1536x1024";
    }

    const frames = [];
    const supabase = persist && deckId ? getSupabaseClient() : null;
    let deckThumbnailUpdated = false;

    for (let i = 0; i < beatsArray.length; i++) {
      const beat = beatsArray[i];
      // Extract beat text - handle both string and object formats
      const beatText = typeof beat === "string" 
        ? beat 
        : (beat?.text || beat?.beatText || beat?.description || String(beat));

      const styleHint = style ? `Style: ${style}. ` : "";
      const framePrompt = `
Create ONE cinematic storyboard frame.
${styleHint}No text in the image.
Film still quality, professional composition.

Overall prompt: ${prompt}
This specific beat: ${beatText}
`;

      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt: framePrompt,
        size,
      });

      const b64 = response?.data?.[0]?.b64_json;
      const dataUrl = asDataUrlFromB64(b64);

      if (dataUrl) {
        let visual_url = dataUrl;
        let persisted = false;

        // Persist to storage if deckId provided
        if (persist && deckId && supabase) {
          try {
            const publicUrl = await uploadBeatVisual(dataUrl, deckId, i);
            
            if (publicUrl) {
              visual_url = publicUrl;
              
              // Update beat in deck content
              const updated = await updateBeatMediaUrls(supabase, deckId, i, {
                visual_url: publicUrl,
                thumbnail_url: publicUrl,
              });
              
              if (updated) {
                persisted = true;
                
                // Update deck thumbnail with first beat's visual
                if (i === 0 && !deckThumbnailUpdated) {
                  const thumbnailUpdated = await updateDeckThumbnail(supabase, deckId, publicUrl, true);
                  if (thumbnailUpdated) {
                    deckThumbnailUpdated = true;
                  }
                }
              }
            }
          } catch (persistError) {
            console.error(`Failed to persist visual for beat ${i}:`, persistError.message);
          }
        }

        frames.push({ 
          beatIndex: i,
          // Canonical fields (snake_case)
          visual_url,
          thumbnail_url: visual_url,
          // Backward compatibility
          dataUrl: visual_url,
          visualUrl: visual_url,
          // Metadata
          persisted,
        });
      }
    }

    return res.json({ frames, deckThumbnailUpdated });
  } catch (err) {
    console.error("generateVisuals error:", err);
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: "Generation failed" });
  }
}
