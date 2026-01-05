// routes/decks.js
import express from "express";
import { createClient } from "@supabase/supabase-js";

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
    const deck = body.deck && typeof body.deck === "object" ? body.deck : null;

    const src = deck || body;
    const { id, title, prompt, export_pdf_url, content } = src;

    const row = {
      ...(id ? { id } : {}),
      user_id: userId,
      title: title || content?.title || src?.title || "Untitled",
      prompt: prompt || content?.prompt || src?.prompt || "",
      export_pdf_url: export_pdf_url || null,
      content: content || src?.content || src || {},
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
