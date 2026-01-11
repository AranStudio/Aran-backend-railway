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

function decorateShareMeta(row) {
  if (!row?.content) return row;
  const normalized = normalizeDeckPayload(row.content);
  const shareUrl = buildShareUrl(normalized.shareCode);
  const mailto = shareEmailTemplate({ title: normalized.title, shareUrl });
  return { ...row, shareUrl, mailto };
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

    const row = {
      ...(id ? { id } : {}),
      user_id: userId,
      title: normalized.title || "Untitled",
      prompt: normalized.prompt || "",
      export_pdf_url: src.export_pdf_url || body.export_pdf_url || null,
      content: { ...normalized },
    };

    // Prefer update-then-insert to avoid cross-user overwrite with service key
    if (id) {
      const { data: updated, error: updateError } = await db
        .from("decks")
        .update(row)
        .eq("user_id", userId)
        .eq("id", id)
        .select("id,title,content,created_at,export_pdf_url,prompt")
        .single();

      if (!updateError && updated)
        return res.json({ ok: true, deck: decorateShareMeta(updated) });
    }

    const { data, error } = await db
      .from("decks")
      .insert(row)
      .select("id,title,content,created_at,export_pdf_url,prompt")
      .single();

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
