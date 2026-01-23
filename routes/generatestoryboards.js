// routes/generatestoryboards.js
/**
 * Generate storyboard frames for multiple beats
 * POST /api/generate-storyboards
 * 
 * UPDATED: Now supports persisting generated images to Supabase Storage
 * and updating beat storyboard_url fields in the database.
 */

import { createClient } from "@supabase/supabase-js";
import { openai, asDataUrlFromB64 } from "../utils/openaiClient.js";
import {
  uploadBeatStoryboard,
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
 * Generate storyboard frames for multiple beats
 * 
 * Request body:
 * {
 *   prompt: string (required) - Overall story/project prompt
 *   beats: string[] (required) - Array of beat descriptions
 *   contentType?: string - Story/content type
 *   deckId?: string - Deck ID for persisting to database
 *   persist?: boolean (default: true) - Whether to persist to storage/DB
 *   style?: string - Style hint for storyboards
 *   aspectRatio?: string ("1:1" | "16:9" | "3:2")
 * }
 * 
 * Response:
 * {
 *   frames: [
 *     {
 *       beatIndex: number,
 *       storyboard_url: string (public URL if persisted, data URL otherwise),
 *       dataUrl: string (alias for backward compatibility),
 *       thumbnail_url: string,
 *       persisted: boolean
 *     }
 *   ],
 *   deckThumbnailUpdated: boolean
 * }
 */
export default async function generateStoryboards(req, res) {
  try {
    // Log incoming payload for debugging
    console.log("generate-storyboards payload:", JSON.stringify(req.body, null, 2));

    const { 
      prompt, 
      contentType, 
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

    if (beats === undefined || beats === null) {
      return res.status(400).json({ error: "Missing required field: beats" });
    }

    if (!Array.isArray(beats)) {
      return res.status(400).json({ error: "Invalid field: beats must be an array" });
    }

    if (beats.length === 0) {
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

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      // Extract beat text - handle both string and object formats
      const beatText = typeof beat === "string" 
        ? beat 
        : (beat?.text || beat?.beatText || beat?.description || String(beat));

      const styleHint = style ? `Style: ${style}. ` : "";
      const imgPrompt = `
Black-and-white storyboard frame, pencil/ink concept art.
${styleHint}No text. High contrast. Simple composition.
Story: ${prompt}
Type: ${contentType || ""}
Beat ${i + 1}: ${beatText}
`.trim();

      const img = await openai.images.generate({
        model: "gpt-image-1",
        prompt: imgPrompt,
        size,
      });

      const b64 = img?.data?.[0]?.b64_json;
      const dataUrl = asDataUrlFromB64(b64);

      if (dataUrl) {
        let storyboard_url = dataUrl;
        let persisted = false;

        // Persist to storage if deckId provided
        if (persist && deckId && supabase) {
          try {
            const publicUrl = await uploadBeatStoryboard(dataUrl, deckId, i);
            
            if (publicUrl) {
              storyboard_url = publicUrl;
              
              // Update beat in deck content
              const updated = await updateBeatMediaUrls(supabase, deckId, i, {
                storyboard_url: publicUrl,
                thumbnail_url: publicUrl, // Use storyboard as thumbnail if no visual
              });
              
              if (updated) {
                persisted = true;
                
                // Update deck thumbnail with first beat's storyboard
                if (i === 0 && !deckThumbnailUpdated) {
                  const thumbnailUpdated = await updateDeckThumbnail(supabase, deckId, publicUrl, true);
                  if (thumbnailUpdated) {
                    deckThumbnailUpdated = true;
                  }
                }
              }
            }
          } catch (persistError) {
            console.error(`Failed to persist storyboard for beat ${i}:`, persistError.message);
          }
        }

        frames.push({ 
          beatIndex: i,
          // Canonical fields (snake_case)
          storyboard_url,
          thumbnail_url: storyboard_url,
          // Backward compatibility
          dataUrl: storyboard_url,
          storyboardUrl: storyboard_url,
          // Metadata
          persisted,
        });
      }
    }

    return res.json({ frames, deckThumbnailUpdated });
  } catch (err) {
    console.error("generateStoryboards error:", err);
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: "Generation failed" });
  }
}