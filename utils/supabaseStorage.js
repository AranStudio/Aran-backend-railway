// utils/supabaseStorage.js
/**
 * Supabase Storage utility for uploading and managing images
 * 
 * Handles uploading images (base64 data URLs or buffers) to Supabase Storage
 * and returns public URLs for use in the database.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

// Storage bucket name for beat/deck images
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "deck-images";

/**
 * Get a Supabase client for storage operations
 * Uses service role key to bypass RLS for storage uploads
 */
function getStorageClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY - storage operations will fail");
    return null;
  }
  
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Decode a base64 data URL into a buffer and mime type
 * @param {string} dataUrl - Data URL (e.g., "data:image/png;base64,...")
 * @returns {{ buffer: Buffer, mime: string, extension: string } | null}
 */
export function decodeDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  
  // Match data URL format: data:image/(png|jpeg|jpg|webp|gif);base64,<data>
  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i);
  if (!match) return null;
  
  try {
    const imageType = match[1].toLowerCase();
    const extension = imageType === "jpeg" ? "jpg" : imageType;
    const buffer = Buffer.from(match[2], "base64");
    
    return {
      buffer,
      mime: `image/${imageType}`,
      extension,
    };
  } catch (err) {
    console.error("Failed to decode data URL:", err.message);
    return null;
  }
}

/**
 * Generate a unique storage path for an image
 * @param {string} type - Image type: "visual" | "storyboard" | "thumbnail" | "tone"
 * @param {string} deckId - Deck ID
 * @param {string|number} beatIndex - Beat index or ID (optional for deck-level images)
 * @param {string} extension - File extension (default: "png")
 * @returns {string} Storage path
 */
export function generateStoragePath(type, deckId, beatIndex = null, extension = "png") {
  const timestamp = Date.now();
  const uuid = randomUUID().slice(0, 8);
  
  if (beatIndex !== null && beatIndex !== undefined) {
    // Beat-level image: decks/{deckId}/beats/{beatIndex}/{type}_{timestamp}_{uuid}.{ext}
    return `decks/${deckId}/beats/${beatIndex}/${type}_${timestamp}_${uuid}.${extension}`;
  } else {
    // Deck-level image: decks/{deckId}/{type}_{timestamp}_{uuid}.{ext}
    return `decks/${deckId}/${type}_${timestamp}_${uuid}.${extension}`;
  }
}

/**
 * Upload an image to Supabase Storage
 * 
 * @param {Object} options
 * @param {string|Buffer} options.image - Base64 data URL or Buffer
 * @param {string} options.path - Storage path (use generateStoragePath)
 * @param {string} [options.contentType] - MIME type (auto-detected for data URLs)
 * @param {string} [options.bucket] - Storage bucket name
 * @returns {Promise<{ publicUrl: string, path: string } | null>}
 */
export async function uploadImage({ image, path, contentType, bucket = STORAGE_BUCKET }) {
  const supabase = getStorageClient();
  if (!supabase) {
    console.error("uploadImage: No Supabase client available");
    return null;
  }
  
  let buffer;
  let mime = contentType;
  
  // Handle data URL input
  if (typeof image === "string" && image.startsWith("data:")) {
    const decoded = decodeDataUrl(image);
    if (!decoded) {
      console.error("uploadImage: Failed to decode data URL");
      return null;
    }
    buffer = decoded.buffer;
    mime = decoded.mime;
  } else if (Buffer.isBuffer(image)) {
    buffer = image;
    mime = contentType || "image/png";
  } else {
    console.error("uploadImage: Invalid image input - expected data URL or Buffer");
    return null;
  }
  
  try {
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: mime,
        upsert: true, // Overwrite if exists
      });
    
    if (error) {
      // If bucket doesn't exist, try to create it
      if (error.message?.includes("not found") || error.statusCode === "404") {
        console.warn(`Storage bucket "${bucket}" may not exist. Attempting to create...`);
        
        const { error: createError } = await supabase.storage.createBucket(bucket, {
          public: true,
          fileSizeLimit: 52428800, // 50MB
        });
        
        if (createError && !createError.message?.includes("already exists")) {
          console.error("Failed to create storage bucket:", createError.message);
          return null;
        }
        
        // Retry upload
        const { data: retryData, error: retryError } = await supabase.storage
          .from(bucket)
          .upload(path, buffer, {
            contentType: mime,
            upsert: true,
          });
        
        if (retryError) {
          console.error("uploadImage retry failed:", retryError.message);
          return null;
        }
      } else {
        console.error("uploadImage failed:", error.message);
        return null;
      }
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);
    
    const publicUrl = urlData?.publicUrl;
    
    if (!publicUrl) {
      console.error("uploadImage: Failed to get public URL");
      return null;
    }
    
    console.log(`uploadImage: Successfully uploaded to ${path}`);
    return { publicUrl, path };
  } catch (err) {
    console.error("uploadImage error:", err.message);
    return null;
  }
}

/**
 * Upload a beat visual image and return the public URL
 * 
 * @param {string} dataUrl - Base64 data URL of the image
 * @param {string} deckId - Deck ID
 * @param {string|number} beatIndex - Beat index
 * @returns {Promise<string|null>} Public URL or null on failure
 */
export async function uploadBeatVisual(dataUrl, deckId, beatIndex) {
  if (!dataUrl || !deckId) {
    console.warn("uploadBeatVisual: Missing required parameters");
    return null;
  }
  
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) {
    // If it's already a URL, just return it
    if (typeof dataUrl === "string" && dataUrl.startsWith("http")) {
      return dataUrl;
    }
    console.warn("uploadBeatVisual: Invalid data URL");
    return null;
  }
  
  const path = generateStoragePath("visual", deckId, beatIndex, decoded.extension);
  const result = await uploadImage({ image: dataUrl, path });
  
  return result?.publicUrl || null;
}

/**
 * Upload a beat storyboard image and return the public URL
 * 
 * @param {string} dataUrl - Base64 data URL of the image
 * @param {string} deckId - Deck ID
 * @param {string|number} beatIndex - Beat index
 * @returns {Promise<string|null>} Public URL or null on failure
 */
export async function uploadBeatStoryboard(dataUrl, deckId, beatIndex) {
  if (!dataUrl || !deckId) {
    console.warn("uploadBeatStoryboard: Missing required parameters");
    return null;
  }
  
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) {
    // If it's already a URL, just return it
    if (typeof dataUrl === "string" && dataUrl.startsWith("http")) {
      return dataUrl;
    }
    console.warn("uploadBeatStoryboard: Invalid data URL");
    return null;
  }
  
  const path = generateStoragePath("storyboard", deckId, beatIndex, decoded.extension);
  const result = await uploadImage({ image: dataUrl, path });
  
  return result?.publicUrl || null;
}

/**
 * Upload a deck thumbnail image and return the public URL
 * 
 * @param {string} dataUrl - Base64 data URL of the image
 * @param {string} deckId - Deck ID
 * @returns {Promise<string|null>} Public URL or null on failure
 */
export async function uploadDeckThumbnail(dataUrl, deckId) {
  if (!dataUrl || !deckId) {
    console.warn("uploadDeckThumbnail: Missing required parameters");
    return null;
  }
  
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) {
    // If it's already a URL, just return it
    if (typeof dataUrl === "string" && dataUrl.startsWith("http")) {
      return dataUrl;
    }
    console.warn("uploadDeckThumbnail: Invalid data URL");
    return null;
  }
  
  const path = generateStoragePath("thumbnail", deckId, null, decoded.extension);
  const result = await uploadImage({ image: dataUrl, path });
  
  return result?.publicUrl || null;
}

/**
 * Update beat media URLs in the database
 * Updates the deck's content.beats array with new URLs for a specific beat
 * 
 * @param {Object} supabaseClient - Supabase client (with user auth or service key)
 * @param {string} deckId - Deck ID
 * @param {number} beatIndex - Beat index (0-based)
 * @param {Object} urls - URLs to update
 * @param {string} [urls.visual_url] - Visual image URL
 * @param {string} [urls.storyboard_url] - Storyboard image URL
 * @param {string} [urls.thumbnail_url] - Thumbnail URL
 * @returns {Promise<boolean>} Success status
 */
export async function updateBeatMediaUrls(supabaseClient, deckId, beatIndex, urls) {
  try {
    // First, fetch the current deck content
    const { data: deck, error: fetchError } = await supabaseClient
      .from("decks")
      .select("content, thumbnail_url")
      .eq("id", deckId)
      .single();
    
    if (fetchError || !deck) {
      console.error("updateBeatMediaUrls: Failed to fetch deck:", fetchError?.message);
      return false;
    }
    
    const content = deck.content || {};
    const beats = Array.isArray(content.beats) ? [...content.beats] : [];
    
    // Ensure beat exists at index
    while (beats.length <= beatIndex) {
      beats.push({});
    }
    
    // Update the beat with new URLs
    beats[beatIndex] = {
      ...beats[beatIndex],
      ...(urls.visual_url && { visual_url: urls.visual_url, visualUrl: urls.visual_url }),
      ...(urls.storyboard_url && { storyboard_url: urls.storyboard_url, storyboardUrl: urls.storyboard_url }),
      ...(urls.thumbnail_url && { thumbnail_url: urls.thumbnail_url, thumbnailUrl: urls.thumbnail_url }),
    };
    
    // If this beat doesn't have a thumbnail, use visual as thumbnail
    if (!beats[beatIndex].thumbnail_url && urls.visual_url) {
      beats[beatIndex].thumbnail_url = urls.visual_url;
      beats[beatIndex].thumbnailUrl = urls.visual_url;
    }
    
    const updatedContent = { ...content, beats };
    
    // Prepare update payload
    const updatePayload = {
      content: updatedContent,
      updated_at: new Date().toISOString(),
    };
    
    // Update deck thumbnail if it's null and we have a visual URL (first beat visual)
    if (!deck.thumbnail_url && (urls.visual_url || urls.storyboard_url)) {
      updatePayload.thumbnail_url = urls.visual_url || urls.storyboard_url;
    }
    
    // Update the deck
    const { error: updateError } = await supabaseClient
      .from("decks")
      .update(updatePayload)
      .eq("id", deckId);
    
    if (updateError) {
      // Try without updated_at if column doesn't exist
      if (updateError.message?.includes("column") && updateError.message?.includes("updated_at")) {
        delete updatePayload.updated_at;
        const { error: retryError } = await supabaseClient
          .from("decks")
          .update(updatePayload)
          .eq("id", deckId);
        
        if (retryError) {
          console.error("updateBeatMediaUrls: Update failed:", retryError.message);
          return false;
        }
      } else {
        console.error("updateBeatMediaUrls: Update failed:", updateError.message);
        return false;
      }
    }
    
    console.log(`updateBeatMediaUrls: Updated beat ${beatIndex} in deck ${deckId}`);
    return true;
  } catch (err) {
    console.error("updateBeatMediaUrls error:", err.message);
    return false;
  }
}

/**
 * Update deck thumbnail URL in the database
 * 
 * @param {Object} supabaseClient - Supabase client
 * @param {string} deckId - Deck ID
 * @param {string} thumbnailUrl - Thumbnail URL
 * @param {boolean} [onlyIfNull=true] - Only update if current thumbnail is null
 * @returns {Promise<boolean>} Success status
 */
export async function updateDeckThumbnail(supabaseClient, deckId, thumbnailUrl, onlyIfNull = true) {
  try {
    let query = supabaseClient
      .from("decks")
      .update({
        thumbnail_url: thumbnailUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", deckId);
    
    if (onlyIfNull) {
      query = query.is("thumbnail_url", null);
    }
    
    const { error } = await query;
    
    if (error) {
      // Try without updated_at if column doesn't exist
      if (error.message?.includes("column") && error.message?.includes("updated_at")) {
        const { error: retryError } = await supabaseClient
          .from("decks")
          .update({ thumbnail_url: thumbnailUrl })
          .eq("id", deckId)
          .is("thumbnail_url", null);
        
        if (retryError && !retryError.message?.includes("0 rows")) {
          console.error("updateDeckThumbnail: Update failed:", retryError.message);
          return false;
        }
      } else if (!error.message?.includes("0 rows")) {
        console.error("updateDeckThumbnail: Update failed:", error.message);
        return false;
      }
    }
    
    console.log(`updateDeckThumbnail: Updated thumbnail for deck ${deckId}`);
    return true;
  } catch (err) {
    console.error("updateDeckThumbnail error:", err.message);
    return false;
  }
}

export default {
  decodeDataUrl,
  generateStoragePath,
  uploadImage,
  uploadBeatVisual,
  uploadBeatStoryboard,
  uploadDeckThumbnail,
  updateBeatMediaUrls,
  updateDeckThumbnail,
};
