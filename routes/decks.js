// routes/decks.js
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { normalizeDeckPayload } from "../utils/deckFormatter.js";
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
  "tool",
  "story_type",
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
  "tool",
  "story_type",
  "content",
  "created_at",
  "updated_at",
  "thumbnail_url",
  "export_pdf_url",
  "prompt",
].join(",");

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
  
  return { ...row, tool, story_type: storyType, shareUrl, mailto };
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
           error.message?.includes("story_type"))) {
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
      
      return {
        id: row.id,
        title: row.title || normalized.title,
        tool,
        story_type: normalized.contentType || null,
        created_at: row.created_at,
        updated_at: row.created_at, // Fallback: use created_at
        thumbnail_url: null,
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

    // Build the row with all columns
    const row = {
      ...(id ? { id } : {}),
      user_id: userId,
      title,
      tool: toolValue,
      story_type: storyType,
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

export default router;
