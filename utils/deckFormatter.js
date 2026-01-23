import { randomUUID } from "crypto";

function coerceString(value) {
  return value === undefined || value === null ? "" : String(value);
}

function normalizeTextBlock(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && value.text) return coerceString(value.text).trim();
  return coerceString(value).trim();
}

function normalizeLabeledEntry(entry, fallbackLabel) {
  if (!entry) return { title: fallbackLabel, text: "" };
  if (typeof entry === "string") {
    return { title: fallbackLabel, text: entry.trim() };
  }
  return {
    title: coerceString(entry.title || entry.label || fallbackLabel).trim(),
    text: normalizeTextBlock(entry.text || entry.body || entry.description || entry.summary),
  };
}

function normalizeVisualEntry(entry, index, prefix = "Visual") {
  if (!entry) return { title: `${prefix} ${index + 1}`, image: null, caption: "" };
  if (typeof entry === "string") {
    return { title: `${prefix} ${index + 1}`, image: entry, caption: entry };
  }
  return {
    title: coerceString(entry.title || entry.caption || `${prefix} ${index + 1}`).trim(),
    caption: normalizeTextBlock(entry.caption || entry.prompt || entry.description),
    image: entry.image || entry.dataUrl || entry.url || null,
  };
}

function normalizeKeyedImagesMap(map, prefix) {
  // Frontend currently stores visuals/storyboards as an object keyed by beat index:
  //   { 0: "data:image/...", 1: "data:image/..." }
  // Convert that into a stable array for exports + DB normalization.
  if (!map || typeof map !== "object" || Array.isArray(map)) return [];

  const keys = Object.keys(map)
    .map((k) => ({ k, n: Number(k) }))
    .sort((a, b) =>
      Number.isFinite(a.n) && Number.isFinite(b.n) ? a.n - b.n : a.k.localeCompare(b.k)
    );

  const out = [];
  for (let i = 0; i < keys.length; i++) {
    const { k, n } = keys[i];
    const v = map[k];
    const idx = Number.isFinite(n) ? n : i;
    out.push(normalizeVisualEntry(v, idx, prefix));
  }
  return out;
}

function normalizeSuggestion(entry) {
  if (!entry) return null;
  if (typeof entry === "string") return { text: entry.trim() };
  const text = normalizeTextBlock(entry.text || entry.suggestion || entry.tip || "");
  return { text };
}

export function safeFilename(name, fallback = "aran-deck") {
  return (name || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9-_\.]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || fallback;
}

export function decodeDataUrlImage(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!m) return null;
  try {
    return { buffer: Buffer.from(m[2], "base64"), mime: `image/${m[1].toLowerCase()}` };
  } catch {
    return null;
  }
}

/**
 * Determine the tool type based on deck content
 * @param {Object} src - Source deck data
 * @returns {string} - Tool type: "story_engine" | "shot_list" | "canvas"
 */
function determineToolType(src) {
  // If tool is explicitly set, use it
  if (src.tool && typeof src.tool === "string") {
    const tool = src.tool.toLowerCase();
    if (["story_engine", "shot_list", "canvas"].includes(tool)) {
      return tool;
    }
  }

  // Check content.tool as well
  if (src?.content?.tool && typeof src.content.tool === "string") {
    const tool = src.content.tool.toLowerCase();
    if (["story_engine", "shot_list", "canvas"].includes(tool)) {
      return tool;
    }
  }

  // Infer from content
  const hasStoryProfile = !!(src.storyProfile || src?.content?.storyProfile);
  const hasCritique = !!(src.critique || src?.content?.critique);
  const hasAltConcepts = Array.isArray(src.altConcepts) || Array.isArray(src?.content?.altConcepts);
  
  // Story engine has these unique fields
  if (hasStoryProfile || hasCritique || hasAltConcepts) {
    return "story_engine";
  }

  // Check for shots array (shot_list specific)
  const hasShots = Array.isArray(src.shots) && src.shots.length > 0;
  const hasScenes = Array.isArray(src.scenes) && src.scenes.length > 0;
  
  if (hasShots && !hasScenes) {
    return "shot_list";
  }

  // Check for canvas-specific markers
  const hasCanvasData = !!(src.canvasData || src?.content?.canvasData);
  const hasWhiteboardData = !!(src.whiteboard || src?.content?.whiteboard);
  
  if (hasCanvasData || hasWhiteboardData) {
    return "canvas";
  }

  // Default to story_engine for new decks with beats
  const hasBeats = Array.isArray(src.beats) && src.beats.length > 0;
  if (hasBeats) {
    return "story_engine";
  }

  // Fallback
  return "story_engine";
}

export function normalizeDeckPayload(input = {}) {
  const src = input.deck && typeof input.deck === "object" ? input.deck : input;

  const beats = Array.isArray(src.beats) ? src.beats : [];
  const beatTitles = Array.isArray(src.beatTitles) ? src.beatTitles : [];
  const scenes = Array.isArray(src.scenes) ? src.scenes : [];
  const shots = Array.isArray(src.shots) ? src.shots : [];

  // ✅ Handle both array AND object-map forms
  const visuals = Array.isArray(src.visuals) ? src.visuals : normalizeKeyedImagesMap(src.visuals, "Visual");
  const storyboards = Array.isArray(src.storyboards)
    ? src.storyboards
    : normalizeKeyedImagesMap(src.storyboards, "Storyboard");

  const suggestions = Array.isArray(src.suggestions) ? src.suggestions : [];

  // Determine tool type for proper categorization
  const tool = determineToolType(src);

  const normalized = {
    id: src.id,
    title: coerceString(src.title || src?.content?.title || "").trim() || null,
    prompt: coerceString(src.prompt || src?.content?.prompt || "").trim(),
    brief: normalizeTextBlock(src.brief || src?.content?.brief || ""),
    contentType: coerceString(src.contentType || src.type || src?.content?.type || "").trim(),
    tool, // ✅ Include tool field for categorization
    toneImage: src.toneImage || src.tone_image || src?.content?.toneImage || null,
    beatTitles,
    beats: beats.map((b, i) => normalizeLabeledEntry(b, beatTitles[i] || `Beat ${i + 1}`)),
    scenes: scenes.map((s, i) => normalizeLabeledEntry(s, `Scene ${i + 1}`)),
    shots: shots.map((s, i) => normalizeLabeledEntry(s, `Shot ${i + 1}`)),
    visuals: visuals.map((v, i) => normalizeVisualEntry(v, i, "Visual")),
    storyboards: storyboards.map((v, i) => normalizeVisualEntry(v, i, "Storyboard")),
    suggestions: suggestions.map((s) => normalizeSuggestion(s)).filter(Boolean),
    meta: typeof src.meta === "object" && src.meta !== null ? src.meta : {},
    shareCode: src.shareCode || src?.content?.shareCode || randomUUID(),
    // Preserve story intelligence specific fields
    storyProfile: src.storyProfile || src?.content?.storyProfile || null,
    critique: src.critique || src?.content?.critique || null,
    altConcepts: src.altConcepts || src?.content?.altConcepts || null,
  };

  return normalized;
}

export function buildExportPayload(deck, includeSections) {
  const includeSet = Array.isArray(includeSections)
    ? new Set(includeSections.map((s) => String(s).toLowerCase()))
    : null;

  const payload = {
    exportedAt: new Date().toISOString(),
    id: deck.id,
    title: deck.title,
    prompt: deck.prompt,
    brief: deck.brief,
    contentType: deck.contentType,
    toneImage: deck.toneImage,
    shareCode: deck.shareCode,
    meta: deck.meta || {},
  };

  const sections = {
    beats: deck.beats || [],
    scenes: deck.scenes || [],
    shots: deck.shots || [],
    visuals: deck.visuals || [],
    storyboards: deck.storyboards || [],
    suggestions: deck.suggestions || [],
  };

  for (const [key, value] of Object.entries(sections)) {
    if (!includeSet || includeSet.has(key)) {
      payload[key] = value;
    }
  }

  return payload;
}
