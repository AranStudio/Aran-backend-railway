// routes/sharedDeck.js
// Public endpoint to retrieve a shared deck by share code.

import { createClient } from "@supabase/supabase-js";
import { normalizeDeckPayload } from "../utils/deckFormatter.js";
import { buildShareUrl } from "../utils/shareLink.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("Missing SUPABASE_URL or SUPABASE_ANON_KEY in env.");
}

const supabasePublic = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export default async function sharedDeck(req, res) {
  try {
    const code = req.params.code;
    if (!code) return res.status(400).json({ error: "Missing share code" });

    const { data, error } = await supabasePublic
      .from("decks")
      .select("id,title,content,created_at,export_pdf_url,prompt")
      .eq("content->>shareCode", code)
      .eq("content->>shared", "true")
      .single();

    if (error || !data) return res.status(404).json({ error: "Deck not found or not shared" });

    const normalized = normalizeDeckPayload(data.content || {});
    const shareUrl = buildShareUrl(normalized.shareCode);

    // Determine story_type - NEVER allow undefined
    // Priority: normalized.contentType > derive from tool > 'general'
    const storyType = normalized.contentType || (normalized.tool === "shot_list" ? "shot_list" : normalized.tool === "canvas" ? "canvas" : "general");

    return res.json({
      ok: true,
      deck: {
        ...normalized,
        id: data.id,
        title: data.title || normalized.title,
        prompt: data.prompt || normalized.prompt,
        story_type: storyType, // REQUIRED - never undefined
        export_pdf_url: data.export_pdf_url || null,
      },
      shareUrl,
    });
  } catch (e) {
    console.error("shared deck fetch error:", e);
    return res.status(500).json({ error: e?.message || "Unable to load shared deck" });
  }
}
