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

export function normalizeDeckPayload(input = {}) {
  const src = input.deck && typeof input.deck === "object" ? input.deck : input;

  const beats = Array.isArray(src.beats) ? src.beats : [];
  const beatTitles = Array.isArray(src.beatTitles) ? src.beatTitles : [];
  const scenes = Array.isArray(src.scenes) ? src.scenes : [];
  const shots = Array.isArray(src.shots) ? src.shots : [];
  const visuals = Array.isArray(src.visuals) ? src.visuals : [];
  const storyboards = Array.isArray(src.storyboards) ? src.storyboards : [];
  const suggestions = Array.isArray(src.suggestions) ? src.suggestions : [];

  const normalized = {
    id: src.id,
    title: coerceString(src.title || src?.content?.title || "Untitled").trim(),
    prompt: coerceString(src.prompt || src?.content?.prompt || "").trim(),
    brief: normalizeTextBlock(src.brief || src?.content?.brief || ""),
    contentType: coerceString(src.contentType || src.type || src?.content?.type || "").trim(),
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
