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

/**
 * Safely extract tool type from a deck row.
 * Falls back to deriving from content if tool column is missing.
 */
function safeGetTool(row) {
  // If tool column exists and has a valid value, use it
  if (row?.tool && typeof row.tool === "string") {
    return row.tool;
  }
  // Fall back to content.tool (set by normalizeDeckPayload)
  if (row?.content?.tool && typeof row.content.tool === "string") {
    return row.content.tool;
  }
  // Default fallback
  return "story_engine";
}

function decorateShareMeta(row) {
  if (!row?.content) return row;
  const normalized = normalizeDeckPayload(row.content);
  const shareUrl = buildShareUrl(normalized.shareCode);
  const mailto = shareEmailTemplate({ title: normalized.title, shareUrl });
  // Always include tool field, derived safely from content
  const tool = safeGetTool(row);
  return { ...row, tool, shareUrl, mailto };
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

router.get("/", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = dbForReq(req);

    // Note: We don't select 'tool' column directly to avoid schema cache errors
    // The tool is derived from content.tool via decorateShareMeta
    const { data, error } = await db
      .from("decks")
      .select("id,title,content,created_at,export_pdf_url,prompt")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    const decks = (data || []).map(decorateShareMeta);
    return res.json({ ok: true, decks });
  } catch (e) {
    console.error("list decks error:", e);
    return res.status(500).json({ error: e?.message || "Couldn't load decks" });
  }
});

router.get("/:id", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const deckId = req.params.id;
    const db = dbForReq(req);

    // Note: We don't select 'tool' column directly to avoid schema cache errors
    // The tool is derived from content.tool via decorateShareMeta
    const { data, error } = await db
      .from("decks")
      .select("id,title,content,created_at,export_pdf_url,prompt")
      .eq("user_id", userId)
      .eq("id", deckId)
      .single();

    if (error) throw error;
    return res.json({ ok: true, deck: decorateShareMeta(data) });
  } catch (e) {
    console.error("get deck error:", e);
    return res.status(404).json({ error: e?.message || "Deck not found" });
  }
});

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
      // Try to create a title from prompt or beats
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

    // Note: tool is stored in content.tool rather than a separate column
    // to avoid schema cache errors if the 'tool' column doesn't exist yet.
    // When the column exists, we can optionally set it for indexing.
    const toolValue = normalized.tool || "story_engine";
    const contentWithTitle = { ...normalized, title, tool: toolValue };
    
    const row = {
      ...(id ? { id } : {}),
      user_id: userId,
      title,
      prompt: normalized.prompt || "",
      export_pdf_url: src.export_pdf_url || body.export_pdf_url || null,
      content: contentWithTitle,
    };

    // Helper to try setting tool column if it exists
    async function saveWithOptionalToolColumn(operation) {
      // First try with tool column
      const rowWithTool = { ...row, tool: toolValue };
      const result = await operation(rowWithTool);
      
      // If error mentions 'tool' column not found, retry without it
      if (result.error?.message?.includes("tool") && result.error?.message?.includes("schema")) {
        console.warn("Tool column not found in schema, saving without it. Tool is stored in content.tool.");
        return operation(row);
      }
      return result;
    }

    // Prefer update-then-insert to avoid cross-user overwrite with service key
    if (id) {
      const { data: updated, error: updateError } = await saveWithOptionalToolColumn(
        (r) => db
          .from("decks")
          .update(r)
          .eq("user_id", userId)
          .eq("id", id)
          .select("id,title,content,created_at,export_pdf_url,prompt")
          .single()
      );

      if (!updateError && updated)
        return res.json({ ok: true, deck: decorateShareMeta(updated) });
    }

    const { data, error } = await saveWithOptionalToolColumn(
      (r) => db
        .from("decks")
        .insert(r)
        .select("id,title,content,created_at,export_pdf_url,prompt")
        .single()
    );

    if (error) throw error;
    return res.json({ ok: true, deck: decorateShareMeta(data) });
  } catch (e) {
    console.error("save deck error:", e);
    return res.status(500).json({ error: e?.message || "Save failed" });
  }
});

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

    // Note: We don't select 'tool' column directly to avoid schema cache errors
    // The tool is derived from content.tool via decorateShareMeta
    const { data, error } = await db
      .from("decks")
      .update({ content: updatedContent })
      .eq("user_id", userId)
      .eq("id", deckId)
      .select("id,title,content,created_at,export_pdf_url,prompt")
      .single();

    if (error) throw error;
    if (shareUrl) res.setHeader("X-Aran-Share-Url", shareUrl);
    return res.json({ ok: true, deck: decorateShareMeta(data), shareUrl, mailto });
  } catch (e) {
    console.error("share deck error:", e);
    return res.status(500).json({ error: e?.message || "Share failed" });
  }
});

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

export default router;
