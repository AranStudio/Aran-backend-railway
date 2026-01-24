// routes/decks.js
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { normalizeDeckPayload, normalizeBeatsForResponse } from "../utils/deckFormatter.js";
import { buildShareUrl, shareEmailTemplate } from "../utils/shareLink.js";

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("Missing SUPABASE_URL or SUPABASE_ANON_KEY in env.");
}

// Auth client (verify bearer token)
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// Service client (bypass RLS) if available
const supabaseService = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;

// Token-scoped client (respects RLS, uses auth.uid())
function supabaseUserDb(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function dbForReq(req) {
  return supabaseService || supabaseUserDb(req.accessToken);
}

// =============================================================================
// VALID TOOL VALUES
// =============================================================================
const VALID_TOOLS = ["story_engine", "shot_list", "canvas"];
const DEFAULT_TOOL = "story_engine";

/**
 * Validate and normalize tool value
 * @param {string} tool - The tool value to validate
 * @returns {string} - Valid tool value or default
 */
function validateTool(tool) {
  if (tool && typeof tool === "string") {
    const normalized = tool.toLowerCase().trim();
    if (VALID_TOOLS.includes(normalized)) {
      return normalized;
    }
  }
  return DEFAULT_TOOL;
}

// =============================================================================
// LIGHTWEIGHT COLUMNS FOR LIST VIEWS
// These columns are fast to query and don't include the heavy content/deck_json
// =============================================================================
const LIGHTWEIGHT_COLUMNS = [
  "id",
  "user_id",
  "title",
  "tagline",
  "tool",
  "story_type",
  "tone_image_url",
  "beats_count",
  "beats_preview",
  "created_at",
  "updated_at",
  "thumbnail_url",
  "export_pdf_url",
  "prompt",
].join(",");

// Full columns for single deck retrieval (includes content)
const FULL_COLUMNS = [
  "id",
  "user_id",
  "title",
  "tagline",
  "tool",
  "story_type",
  "content",
  "tone_image_url",
  "beats_count",
  "beats_preview",
  "created_at",
  "updated_at",
  "thumbnail_url",
  "export_pdf_url",
  "prompt",
].join(",");

function extractBeatTitle(beat, index) {
  if (!beat) return `Beat ${index + 1}`;
  if (typeof beat === "string") return beat.trim();
  const candidate =
    beat.title || beat.name || beat.intent || beat.text || beat.beatText || `Beat ${index + 1}`;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : `Beat ${index + 1}`;
}

function buildBeatsPreview(beats) {
  if (!Array.isArray(beats)) return "";
  const titles = beats
    .map((beat, index) => extractBeatTitle(beat, index))
    .filter((title) => title && title.trim())
    .slice(0, 3);
  return titles.join("\n");
}

function buildPreviewFields(content) {
  const beats = Array.isArray(content?.beats) ? content.beats : [];
  return {
    beats_count: beats.length,
    beats_preview: buildBeatsPreview(beats),
    tone_image_url: content?.toneImage || content?.tone_image || content?.tone_image_url || null,
  };
}

/**
 * Build share metadata for a deck (for list view - without full content)
 */
function buildShareMetaForList(row) {
  if (!row) return row;
  
  const tool = validateTool(row.tool);
  
  // Ensure story_type is NEVER undefined - use fallback based on tool
  const storyType = row.story_type || (tool === "shot_list" ? "shot_list" : tool === "canvas" ? "canvas" : "general");
  
  return {
    ...row,
    tool,
    story_type: storyType, // REQUIRED - never undefined
    // Share URL can be built if we have the share_code from the view
    // For now, return null since we don't have content in list view
    shareUrl: null,
    mailto: null,
  };
}

/**
 * Build share metadata for a deck (for detail view - with full content)
 * Also normalizes beat media URLs for consistent frontend access
 */
function decorateShareMeta(row) {
  if (!row?.content) return row;
  
  const normalized = normalizeDeckPayload(row.content);
  const shareUrl = buildShareUrl(normalized.shareCode);
  const mailto = shareEmailTemplate({ title: normalized.title, shareUrl });
  
  // Use the database tool column if available, otherwise derive from content
  const tool = validateTool(row.tool || normalized.tool);
  
  // Ensure story_type is NEVER undefined - use fallback based on tool
  const storyType = row.story_type || normalized.contentType || (tool === "shot_list" ? "shot_list" : tool === "canvas" ? "canvas" : "general");
  
  // Normalize beats with media URLs for consistent frontend access
  const beatsWithMedia = normalizeBeatsForResponse(
    normalized.beats,
    normalized.visuals,
    normalized.storyboards
  );
  
  // Build deck thumbnail from first beat if not set at row level
  const deckThumbnail = row.thumbnail_url || 
                        normalized.thumbnail_url ||
                        beatsWithMedia[0]?.visual_url || 
                        beatsWithMedia[0]?.storyboard_url ||
                        null;
  
  // Return with normalized content including beats with media URLs
  return { 
    ...row, 
    tool, 
    story_type: storyType, 
    shareUrl, 
    mailto,
    // Deck-level thumbnail
    thumbnail_url: deckThumbnail,
    thumbnailUrl: deckThumbnail,
    // Include normalized content with beats that have media URLs
    content: {
      ...normalized,
      beats: beatsWithMedia,
      thumbnail_url: deckThumbnail,
      thumbnailUrl: deckThumbnail,
    },
  };
}

async function requireUser(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing bearer token" });

    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Invalid session" });

    req.user = data.user;
    req.accessToken = token;
    return next();
  } catch (e) {
    console.error("requireUser error:", e);
    return res.status(401).json({ error: "Unauthorized" });
  }
}

// =============================================================================
// GET /decks - List all decks for the authenticated user
// OPTIMIZED: Only selects lightweight columns, excludes heavy content
// Supports filtering by tool (story_engine, shot_list, canvas)
// =============================================================================
router.get("/", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = dbForReq(req);
    
    // Optional tool filter from query parameter
    const toolFilter = req.query.tool;
    const validatedTool = toolFilter ? validateTool(toolFilter) : null;
    
    // Pagination parameters (with sensible defaults)
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    // Build query with LIGHTWEIGHT columns only (no content!)
    let query = db
      .from("decks")
      .select(LIGHTWEIGHT_COLUMNS)
      .eq("user_id", userId);
    
    // Apply tool filter if specified
    if (validatedTool) {
      query = query.eq("tool", validatedTool);
    }
    
    // Order by updated_at (most recent first), fallback to created_at
    query = query
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      // If error mentions missing columns, try fallback query
      if (error.message?.includes("column") && 
          (error.message?.includes("tool") || 
           error.message?.includes("updated_at") ||
           error.message?.includes("story_type") ||
           error.message?.includes("tagline") ||
           error.message?.includes("tone_image_url") ||
           error.message?.includes("beats_count") ||
           error.message?.includes("beats_preview"))) {
        console.warn("Some columns may be missing, using fallback query");
        return await listDecksFallback(req, res, userId, db, validatedTool, limit, offset);
      }
      throw error;
    }
    
    const decks = (data || []).map(buildShareMetaForList);
    
    return res.json({ 
      ok: true, 
      decks,
      pagination: {
        limit,
        offset,
        count: decks.length,
        hasMore: decks.length === limit,
      },
      filter: validatedTool ? { tool: validatedTool } : null,
    });
  } catch (e) {
    console.error("list decks error:", e);
    return res.status(500).json({ error: e?.message || "Couldn't load decks" });
  }
});

/**
 * Fallback list query for databases that haven't run migrations yet
 * Still optimized to not transfer content in list responses
 */
async function listDecksFallback(req, res, userId, db, toolFilter, limit, offset) {
  try {
    // Minimal columns that should exist in all schemas
    let query = db
      .from("decks")
      .select("id,title,content,created_at,export_pdf_url,prompt")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw error;

    // Transform and filter in memory if tool filter specified
    let decks = (data || []).map((row) => {
      const normalized = row.content ? normalizeDeckPayload(row.content) : {};
      const tool = validateTool(normalized.tool);
      const previewFields = buildPreviewFields(normalized);
      
      return {
        id: row.id,
        title: row.title || normalized.title,
        tagline: normalized.tagline || null,
        tool,
        story_type: normalized.contentType || null,
        created_at: row.created_at,
        updated_at: row.created_at, // Fallback: use created_at
        thumbnail_url: null,
        ...previewFields,
        export_pdf_url: row.export_pdf_url,
        prompt: row.prompt || normalized.prompt,
        shareUrl: buildShareUrl(normalized.shareCode),
        mailto: shareEmailTemplate({ title: normalized.title, shareUrl: buildShareUrl(normalized.shareCode) }),
      };
    });

    // Apply tool filter in memory if specified
    if (toolFilter) {
      decks = decks.filter((d) => d.tool === toolFilter);
    }

    return res.json({ 
      ok: true, 
      decks,
      pagination: {
        limit,
        offset,
        count: decks.length,
        hasMore: decks.length === limit,
      },
      filter: toolFilter ? { tool: toolFilter } : null,
      _fallback: true, // Indicator that migrations may be needed
    });
  } catch (e) {
    console.error("fallback list decks error:", e);
    return res.status(500).json({ error: e?.message || "Couldn't load decks" });
  }
}

// =============================================================================
// GET /decks/counts - Get deck counts by tool (for tab badges)
// =============================================================================
router.get("/counts", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = dbForReq(req);

    // Try using the RPC function first
    const { data: rpcData, error: rpcError } = await db.rpc("get_user_deck_counts", {
      p_user_id: userId,
    });

    if (!rpcError && rpcData) {
      const counts = {};
      for (const row of rpcData) {
        counts[row.tool] = row.count;
      }
      return res.json({ ok: true, counts });
    }

    // Fallback: manual count query
    const { data, error } = await db
      .from("decks")
      .select("tool")
      .eq("user_id", userId);

    if (error) throw error;

    // Count in memory
    const counts = { story_engine: 0, shot_list: 0, canvas: 0 };
    for (const row of data || []) {
      const tool = validateTool(row.tool);
      counts[tool] = (counts[tool] || 0) + 1;
    }

    return res.json({ ok: true, counts });
  } catch (e) {
    console.error("deck counts error:", e);
    return res.status(500).json({ error: e?.message || "Couldn't get deck counts" });
  }
});

// =============================================================================
// GET /decks/:id - Get a single deck by ID (includes full content)
// =============================================================================
router.get("/:id", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const deckId = req.params.id;
    const db = dbForReq(req);

    // For single deck retrieval, include full content
    const { data, error } = await db
      .from("decks")
      .select(FULL_COLUMNS)
      .eq("user_id", userId)
      .eq("id", deckId)
      .single();

    if (error) {
      // Fallback for missing columns
      if (error.message?.includes("column")) {
        const { data: fallback, error: fallbackError } = await db
          .from("decks")
          .select("id,title,content,created_at,export_pdf_url,prompt")
          .eq("user_id", userId)
          .eq("id", deckId)
          .single();
        
        if (fallbackError) throw fallbackError;
        return res.json({ ok: true, deck: decorateShareMeta(fallback) });
      }
      throw error;
    }
    
    return res.json({ ok: true, deck: decorateShareMeta(data) });
  } catch (e) {
    console.error("get deck error:", e);
    return res.status(404).json({ error: e?.message || "Deck not found" });
  }
});

// =============================================================================
// POST /decks/save - Create or update a deck
// Ensures tool is properly set from request or derived from content
// =============================================================================
router.post("/save", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = dbForReq(req);

    const body = req.body || {};
    const src = body.deck && typeof body.deck === "object" ? body.deck : body;
    const normalized = normalizeDeckPayload(src);
    const { id } = normalized;

    // Generate a title if missing (prevent "Untitled" stories)
    let title = normalized.title;
    if (!title || title.toLowerCase() === "untitled") {
      if (normalized.prompt) {
        const words = normalized.prompt
          .replace(/[^a-zA-Z0-9\s]/g, "")
          .split(/\s+/)
          .filter((w) => w.length > 3)
          .slice(0, 3);
        if (words.length >= 2) {
          title = words.slice(0, 2).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
        } else {
          title = `Story ${Date.now().toString(36).slice(-4).toUpperCase()}`;
        }
      } else {
        title = `Story ${Date.now().toString(36).slice(-4).toUpperCase()}`;
      }
    }

    // CRITICAL: Determine and validate tool value
    // Priority: explicit body.tool > normalized.tool (from content analysis) > default
    const toolValue = validateTool(body.tool || normalized.tool);
    
    // Store tool in content as well for consistency
    const contentWithTitle = { ...normalized, title, tool: toolValue };
    
    // Extract story_type for indexing - NEVER allow undefined/null
    // Priority: explicit body.story_type > normalized.contentType > fallback based on tool
    const storyType = body.story_type || normalized.contentType || (toolValue === "shot_list" ? "shot_list" : toolValue === "canvas" ? "canvas" : "general");
    const previewFields = buildPreviewFields(contentWithTitle);

    // Build the row with all columns
    const row = {
      ...(id ? { id } : {}),
      user_id: userId,
      title,
      tagline: normalized.tagline || body.tagline || null,
      tool: toolValue,
      story_type: storyType,
      ...previewFields,
      prompt: normalized.prompt || "",
      export_pdf_url: src.export_pdf_url || body.export_pdf_url || null,
      content: contentWithTitle,
      // updated_at will be set by database trigger, or we set it manually
      updated_at: new Date().toISOString(),
    };

    // Helper to try with full columns, fallback to minimal if columns don't exist
    async function saveWithFallback(operation, rowData) {
      const result = await operation(rowData);
      
      // If error mentions missing columns, retry without them
      if (result.error?.message?.includes("column")) {
        console.warn("Some columns not in schema, using fallback save:", result.error.message);
        const minimalRow = {
          ...(rowData.id ? { id: rowData.id } : {}),
          user_id: rowData.user_id,
          title: rowData.title,
          prompt: rowData.prompt,
          export_pdf_url: rowData.export_pdf_url,
          content: rowData.content,
        };
        return operation(minimalRow);
      }
      return result;
    }

    // Prefer update-then-insert to avoid cross-user overwrite with service key
    if (id) {
      const { data: updated, error: updateError } = await saveWithFallback(
        (r) => db
          .from("decks")
          .update(r)
          .eq("user_id", userId)
          .eq("id", id)
          .select(FULL_COLUMNS)
          .single(),
        row
      );

      if (!updateError && updated) {
        return res.json({ ok: true, deck: decorateShareMeta(updated) });
      }
    }

    const { data, error } = await saveWithFallback(
      (r) => db
        .from("decks")
        .insert(r)
        .select(FULL_COLUMNS)
        .single(),
      row
    );

    if (error) throw error;
    return res.json({ ok: true, deck: decorateShareMeta(data) });
  } catch (e) {
    console.error("save deck error:", e);
    return res.status(500).json({ error: e?.message || "Save failed" });
  }
});

// =============================================================================
// POST /decks/:id/share - Toggle sharing for a deck
// =============================================================================
router.post("/:id/share", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const deckId = req.params.id;
    const { shared = true } = req.body || {};
    const db = dbForReq(req);

    const { data: existing, error: fetchError } = await db
      .from("decks")
      .select("content")
      .eq("user_id", userId)
      .eq("id", deckId)
      .single();

    if (fetchError) throw fetchError;

    const normalized = normalizeDeckPayload(existing?.content || { id: deckId });
    const updatedContent = { ...normalized, shared: Boolean(shared) };
    const shareUrl = buildShareUrl(updatedContent.shareCode);
    const mailto = shareEmailTemplate({ title: updatedContent.title, shareUrl });

    const { data, error } = await db
      .from("decks")
      .update({ 
        content: updatedContent,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("id", deckId)
      .select(FULL_COLUMNS)
      .single();

    if (error) {
      // Fallback if updated_at column doesn't exist
      if (error.message?.includes("column") && error.message?.includes("updated_at")) {
        const { data: fallback, error: fallbackError } = await db
          .from("decks")
          .update({ content: updatedContent })
          .eq("user_id", userId)
          .eq("id", deckId)
          .select("id,title,content,created_at,export_pdf_url,prompt")
          .single();
        
        if (fallbackError) throw fallbackError;
        if (shareUrl) res.setHeader("X-Aran-Share-Url", shareUrl);
        return res.json({ ok: true, deck: decorateShareMeta(fallback), shareUrl, mailto });
      }
      throw error;
    }
    
    if (shareUrl) res.setHeader("X-Aran-Share-Url", shareUrl);
    return res.json({ ok: true, deck: decorateShareMeta(data), shareUrl, mailto });
  } catch (e) {
    console.error("share deck error:", e);
    return res.status(500).json({ error: e?.message || "Share failed" });
  }
});

// =============================================================================
// DELETE /decks/:id - Delete a deck
// =============================================================================
router.delete("/:id", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const deckId = req.params.id;
    const db = dbForReq(req);

    const { error } = await db.from("decks").delete().eq("user_id", userId).eq("id", deckId);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (e) {
    console.error("delete deck error:", e);
    return res.status(500).json({ error: e?.message || "Delete failed" });
  }
});

// =============================================================================
// PATCH /decks/:id/tool - Update only the tool field for a deck
// Useful for moving decks between tabs/categories
// =============================================================================
router.patch("/:id/tool", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const deckId = req.params.id;
    const { tool } = req.body || {};
    const db = dbForReq(req);

    const validatedTool = validateTool(tool);
    
    if (!tool || validatedTool !== tool?.toLowerCase()?.trim()) {
      return res.status(400).json({ 
        error: "Invalid tool value",
        validValues: VALID_TOOLS,
      });
    }

    // Update both the tool column and the tool in content
    const { data: existing, error: fetchError } = await db
      .from("decks")
      .select("content")
      .eq("user_id", userId)
      .eq("id", deckId)
      .single();

    if (fetchError) throw fetchError;

    const updatedContent = { 
      ...(existing?.content || {}), 
      tool: validatedTool,
    };

    const { data, error } = await db
      .from("decks")
      .update({ 
        tool: validatedTool,
        content: updatedContent,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("id", deckId)
      .select("id,title,tool,updated_at")
      .single();

    if (error) throw error;
    return res.json({ ok: true, deck: data });
  } catch (e) {
    console.error("update deck tool error:", e);
    return res.status(500).json({ error: e?.message || "Update failed" });
  }
});

// =============================================================================
// BEAT CRUD ENDPOINTS
// These endpoints allow adding, updating, removing, and reordering beats
// =============================================================================

// =============================================================================
// POST /decks/:id/beats - Add a new beat to a deck
// =============================================================================
router.post("/:id/beats", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const deckId = req.params.id;
    const { beat, index } = req.body || {};
    const db = dbForReq(req);

    if (!beat) {
      return res.status(400).json({ error: "Missing required field: beat" });
    }

    // Fetch existing deck
    const { data: existing, error: fetchError } = await db
      .from("decks")
      .select("content")
      .eq("user_id", userId)
      .eq("id", deckId)
      .single();

    if (fetchError) throw fetchError;

    const content = existing?.content || {};
    const beats = Array.isArray(content.beats) ? [...content.beats] : [];

    // Normalize the new beat
    const newBeat = typeof beat === "string" 
      ? { title: `Beat ${beats.length + 1}`, text: beat }
      : {
          title: beat.title || `Beat ${beats.length + 1}`,
          text: beat.text || beat.beatText || "",
          name: beat.name || null,
          intent: beat.intent || null,
          visual_url: beat.visual_url || beat.visualUrl || null,
          storyboard_url: beat.storyboard_url || beat.storyboardUrl || null,
          thumbnail_url: beat.thumbnail_url || beat.thumbnailUrl || null,
        };

    // Insert at specified index or append to end
    const insertIndex = typeof index === "number" && index >= 0 && index <= beats.length 
      ? index 
      : beats.length;
    
    beats.splice(insertIndex, 0, newBeat);

    // Update titles to maintain sequence
    beats.forEach((b, i) => {
      if (b.title?.match(/^Beat \d+$/)) {
        b.title = `Beat ${i + 1}`;
      }
    });

    const updatedContent = { ...content, beats };
    const previewFields = buildPreviewFields(updatedContent);

    const { data, error } = await db
      .from("decks")
      .update({ 
        content: updatedContent,
        ...previewFields,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("id", deckId)
      .select(FULL_COLUMNS)
      .single();

    if (error) throw error;

    return res.json({ 
      ok: true, 
      deck: decorateShareMeta(data),
      addedBeat: newBeat,
      beatIndex: insertIndex,
      totalBeats: beats.length,
    });
  } catch (e) {
    console.error("add beat error:", e);
    return res.status(500).json({ error: e?.message || "Failed to add beat" });
  }
});

// =============================================================================
// PATCH /decks/:id/beats/:beatIndex - Update a specific beat
// =============================================================================
router.patch("/:id/beats/:beatIndex", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const deckId = req.params.id;
    const beatIndex = parseInt(req.params.beatIndex, 10);
    const updates = req.body || {};
    const db = dbForReq(req);

    if (isNaN(beatIndex) || beatIndex < 0) {
      return res.status(400).json({ error: "Invalid beat index" });
    }

    // Fetch existing deck
    const { data: existing, error: fetchError } = await db
      .from("decks")
      .select("content")
      .eq("user_id", userId)
      .eq("id", deckId)
      .single();

    if (fetchError) throw fetchError;

    const content = existing?.content || {};
    const beats = Array.isArray(content.beats) ? [...content.beats] : [];

    if (beatIndex >= beats.length) {
      return res.status(404).json({ error: "Beat not found at specified index" });
    }

    // Update the beat with provided fields
    const currentBeat = beats[beatIndex] || {};
    beats[beatIndex] = {
      ...currentBeat,
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.text !== undefined && { text: updates.text }),
      ...(updates.beatText !== undefined && { beatText: updates.beatText, text: updates.beatText }),
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.intent !== undefined && { intent: updates.intent }),
      ...(updates.visual_url !== undefined && { visual_url: updates.visual_url, visualUrl: updates.visual_url }),
      ...(updates.storyboard_url !== undefined && { storyboard_url: updates.storyboard_url, storyboardUrl: updates.storyboard_url }),
      ...(updates.thumbnail_url !== undefined && { thumbnail_url: updates.thumbnail_url, thumbnailUrl: updates.thumbnail_url }),
    };

    const updatedContent = { ...content, beats };
    const previewFields = buildPreviewFields(updatedContent);

    const { data, error } = await db
      .from("decks")
      .update({ 
        content: updatedContent,
        ...previewFields,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("id", deckId)
      .select(FULL_COLUMNS)
      .single();

    if (error) throw error;

    return res.json({ 
      ok: true, 
      deck: decorateShareMeta(data),
      updatedBeat: beats[beatIndex],
      beatIndex,
    });
  } catch (e) {
    console.error("update beat error:", e);
    return res.status(500).json({ error: e?.message || "Failed to update beat" });
  }
});

// =============================================================================
// DELETE /decks/:id/beats/:beatIndex - Remove a specific beat
// =============================================================================
router.delete("/:id/beats/:beatIndex", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const deckId = req.params.id;
    const beatIndex = parseInt(req.params.beatIndex, 10);
    const db = dbForReq(req);

    if (isNaN(beatIndex) || beatIndex < 0) {
      return res.status(400).json({ error: "Invalid beat index" });
    }

    // Fetch existing deck
    const { data: existing, error: fetchError } = await db
      .from("decks")
      .select("content")
      .eq("user_id", userId)
      .eq("id", deckId)
      .single();

    if (fetchError) throw fetchError;

    const content = existing?.content || {};
    const beats = Array.isArray(content.beats) ? [...content.beats] : [];

    if (beatIndex >= beats.length) {
      return res.status(404).json({ error: "Beat not found at specified index" });
    }

    // Remove the beat
    const removedBeat = beats.splice(beatIndex, 1)[0];

    // Update titles to maintain sequence
    beats.forEach((b, i) => {
      if (b.title?.match(/^Beat \d+$/)) {
        b.title = `Beat ${i + 1}`;
      }
    });

    const updatedContent = { ...content, beats };
    const previewFields = buildPreviewFields(updatedContent);

    const { data, error } = await db
      .from("decks")
      .update({ 
        content: updatedContent,
        ...previewFields,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("id", deckId)
      .select(FULL_COLUMNS)
      .single();

    if (error) throw error;

    return res.json({ 
      ok: true, 
      deck: decorateShareMeta(data),
      removedBeat,
      removedIndex: beatIndex,
      totalBeats: beats.length,
    });
  } catch (e) {
    console.error("delete beat error:", e);
    return res.status(500).json({ error: e?.message || "Failed to delete beat" });
  }
});

// =============================================================================
// PUT /decks/:id/beats - Replace all beats (bulk update/reorder)
// =============================================================================
router.put("/:id/beats", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const deckId = req.params.id;
    const { beats } = req.body || {};
    const db = dbForReq(req);

    if (!Array.isArray(beats)) {
      return res.status(400).json({ error: "beats must be an array" });
    }

    // Fetch existing deck
    const { data: existing, error: fetchError } = await db
      .from("decks")
      .select("content")
      .eq("user_id", userId)
      .eq("id", deckId)
      .single();

    if (fetchError) throw fetchError;

    const content = existing?.content || {};

    // Normalize all beats
    const normalizedBeats = beats.map((beat, i) => {
      if (typeof beat === "string") {
        return { title: `Beat ${i + 1}`, text: beat };
      }
      return {
        title: beat.title || `Beat ${i + 1}`,
        text: beat.text || beat.beatText || "",
        name: beat.name || null,
        intent: beat.intent || null,
        visual_url: beat.visual_url || beat.visualUrl || null,
        storyboard_url: beat.storyboard_url || beat.storyboardUrl || null,
        thumbnail_url: beat.thumbnail_url || beat.thumbnailUrl || null,
        // Preserve camelCase aliases
        visualUrl: beat.visual_url || beat.visualUrl || null,
        storyboardUrl: beat.storyboard_url || beat.storyboardUrl || null,
        thumbnailUrl: beat.thumbnail_url || beat.thumbnailUrl || null,
      };
    });

    const updatedContent = { ...content, beats: normalizedBeats };
    const previewFields = buildPreviewFields(updatedContent);

    // Update deck thumbnail if it's null and first beat has media
    const firstBeatThumbnail = normalizedBeats[0]?.visual_url || normalizedBeats[0]?.storyboard_url;
    const updatePayload = {
      content: updatedContent,
      ...previewFields,
      updated_at: new Date().toISOString(),
    };
    
    if (firstBeatThumbnail && !existing?.thumbnail_url) {
      updatePayload.thumbnail_url = firstBeatThumbnail;
    }

    const { data, error } = await db
      .from("decks")
      .update(updatePayload)
      .eq("user_id", userId)
      .eq("id", deckId)
      .select(FULL_COLUMNS)
      .single();

    if (error) throw error;

    return res.json({ 
      ok: true, 
      deck: decorateShareMeta(data),
      totalBeats: normalizedBeats.length,
    });
  } catch (e) {
    console.error("replace beats error:", e);
    return res.status(500).json({ error: e?.message || "Failed to replace beats" });
  }
});

// =============================================================================
// POST /decks/:id/beats/reorder - Reorder beats by providing new order
// =============================================================================
router.post("/:id/beats/reorder", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const deckId = req.params.id;
    const { order } = req.body || {};
    const db = dbForReq(req);

    if (!Array.isArray(order)) {
      return res.status(400).json({ error: "order must be an array of beat indices" });
    }

    // Fetch existing deck
    const { data: existing, error: fetchError } = await db
      .from("decks")
      .select("content")
      .eq("user_id", userId)
      .eq("id", deckId)
      .single();

    if (fetchError) throw fetchError;

    const content = existing?.content || {};
    const beats = Array.isArray(content.beats) ? content.beats : [];

    // Validate order array
    if (order.length !== beats.length) {
      return res.status(400).json({ 
        error: "order array length must match number of beats",
        expected: beats.length,
        received: order.length,
      });
    }

    // Validate all indices are valid
    const validIndices = order.every(i => typeof i === "number" && i >= 0 && i < beats.length);
    if (!validIndices) {
      return res.status(400).json({ error: "Invalid index in order array" });
    }

    // Check for duplicates
    const uniqueIndices = new Set(order);
    if (uniqueIndices.size !== order.length) {
      return res.status(400).json({ error: "Duplicate indices in order array" });
    }

    // Reorder beats
    const reorderedBeats = order.map(i => beats[i]);

    // Update titles to maintain sequence
    reorderedBeats.forEach((b, i) => {
      if (b.title?.match(/^Beat \d+$/)) {
        b.title = `Beat ${i + 1}`;
      }
    });

    const updatedContent = { ...content, beats: reorderedBeats };
    const previewFields = buildPreviewFields(updatedContent);

    const { data, error } = await db
      .from("decks")
      .update({ 
        content: updatedContent,
        ...previewFields,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("id", deckId)
      .select(FULL_COLUMNS)
      .single();

    if (error) throw error;

    return res.json({ 
      ok: true, 
      deck: decorateShareMeta(data),
      newOrder: order,
      totalBeats: reorderedBeats.length,
    });
  } catch (e) {
    console.error("reorder beats error:", e);
    return res.status(500).json({ error: e?.message || "Failed to reorder beats" });
  }
});

export default router;
