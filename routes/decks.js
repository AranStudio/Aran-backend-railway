// routes/decks.js
import express from "express";
import { createClient } from "@supabase/supabase-js";

import { normalizeDeckPayload } from "../utils/deckFormatter.js";

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const supabaseDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function requireUser(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing bearer token" });

    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Invalid session" });

    req.user = data.user;
    return next();
  } catch (e) {
    console.error("requireUser error:", e);
    return res.status(401).json({ error: "Unauthorized" });
  }
}

router.get("/", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabaseDb
      .from("decks")
      .select("id,title,content,created_at,export_pdf_url,prompt")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return res.json({ ok: true, decks: data || [] });
  } catch (e) {
    console.error("list decks error:", e);
    return res.status(500).json({ error: e?.message || "Couldn't load decks" });
  }
});

router.get("/:id", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const deckId = req.params.id;

    const { data, error } = await supabaseDb
      .from("decks")
      .select("id,title,content,created_at,export_pdf_url,prompt")
      .eq("user_id", userId)
      .eq("id", deckId)
      .single();

    if (error) throw error;
    return res.json({ ok: true, deck: data });
  } catch (e) {
    console.error("get deck error:", e);
    return res.status(404).json({ error: e?.message || "Deck not found" });
  }
});

router.post("/save", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const body = req.body || {};
    const src = body.deck && typeof body.deck === "object" ? body.deck : body;
    const normalized = normalizeDeckPayload(src);
    const { id } = normalized;

    const row = {
      ...(id ? { id } : {}),
      user_id: userId,
      title: normalized.title || "Untitled",
      prompt: normalized.prompt || "",
      export_pdf_url: src.export_pdf_url || null,
      content: { ...normalized },
    };

    if (id) {
      const { data, error } = await supabaseDb
        .from("decks")
        .upsert(row, { onConflict: "id" })
        .select("id,title,content,created_at,export_pdf_url,prompt")
        .single();
      if (error) throw error;
      return res.json({ ok: true, deck: data });
    }

    const { data, error } = await supabaseDb
      .from("decks")
      .insert(row)
      .select("id,title,content,created_at,export_pdf_url,prompt")
      .single();
    if (error) throw error;
    return res.json({ ok: true, deck: data });
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

    const { data: existing, error: fetchError } = await supabaseDb
      .from("decks")
      .select("content")
      .eq("user_id", userId)
      .eq("id", deckId)
      .single();

    if (fetchError) throw fetchError;

    const normalized = normalizeDeckPayload(existing?.content || { id: deckId });
    const updatedContent = { ...normalized, shared: Boolean(shared) };

    const { data, error } = await supabaseDb
      .from("decks")
      .update({ content: updatedContent })
      .eq("user_id", userId)
      .eq("id", deckId)
      .select("id,title,content,created_at,export_pdf_url,prompt")
      .single();

    if (error) throw error;

    return res.json({ ok: true, deck: data });
  } catch (e) {
    console.error("share deck error:", e);
    return res.status(500).json({ error: e?.message || "Share failed" });
  }
});

router.delete("/:id", requireUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const deckId = req.params.id;

    const { error } = await supabaseDb.from("decks").delete().eq("user_id", userId).eq("id", deckId);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (e) {
    console.error("delete deck error:", e);
    return res.status(500).json({ error: e?.message || "Delete failed" });
  }
});

export default router;
