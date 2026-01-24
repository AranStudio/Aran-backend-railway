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

/**
 * Normalize a beat entry with media URL fields
 * Ensures consistent field names for visual_url, storyboard_url, thumbnail_url
 * 
 * @param {Object|string} entry - Beat entry (can be string or object)
 * @param {string} fallbackLabel - Fallback label for the beat
 * @param {number} index - Beat index (for looking up visuals/storyboards from arrays)
 * @param {Array} visuals - Optional visuals array to pull image from
 * @param {Array} storyboards - Optional storyboards array to pull image from
 * @returns {Object} Normalized beat with media URLs
 */
function normalizeBeatEntry(entry, fallbackLabel, index = 0, visuals = [], storyboards = []) {
  // Start with basic labeled entry normalization
  const basic = normalizeLabeledEntry(entry, fallbackLabel);
  
  if (typeof entry === "string") {
    // For string entries, try to get media from visuals/storyboards arrays
    const visualFromArray = visuals[index];
    const storyboardFromArray = storyboards[index];
    
    return {
      ...basic,
      // Canonical snake_case fields
      visual_url: visualFromArray?.image || visualFromArray?.url || visualFromArray?.dataUrl || null,
      storyboard_url: storyboardFromArray?.image || storyboardFromArray?.url || storyboardFromArray?.dataUrl || null,
      thumbnail_url: visualFromArray?.image || visualFromArray?.url || storyboardFromArray?.image || null,
      // camelCase aliases for backward compatibility
      visualUrl: visualFromArray?.image || visualFromArray?.url || visualFromArray?.dataUrl || null,
      storyboardUrl: storyboardFromArray?.image || storyboardFromArray?.url || storyboardFromArray?.dataUrl || null,
      thumbnailUrl: visualFromArray?.image || visualFromArray?.url || storyboardFromArray?.image || null,
    };
  }
  
  // For object entries, extract media URLs with fallbacks
  // Priority: explicit field > snake_case > camelCase > array lookup
  const visual_url = entry.visual_url || entry.visualUrl || entry.image || entry.dataUrl ||
                     visuals[index]?.image || visuals[index]?.url || visuals[index]?.dataUrl || null;
  
  const storyboard_url = entry.storyboard_url || entry.storyboardUrl || entry.storyboardImage ||
                         storyboards[index]?.image || storyboards[index]?.url || storyboards[index]?.dataUrl || null;
  
  // Thumbnail priority: explicit > visual > storyboard
  const thumbnail_url = entry.thumbnail_url || entry.thumbnailUrl || 
                        visual_url || storyboard_url || null;
  
  return {
    ...basic,
    // Preserve original beat-specific fields
    name: entry.name || null,
    intent: entry.intent || null,
    beatText: entry.beatText || entry.text || basic.text || "",
    // Canonical snake_case fields
    visual_url,
    storyboard_url,
    thumbnail_url,
    // camelCase aliases for backward compatibility
    visualUrl: visual_url,
    storyboardUrl: storyboard_url,
    thumbnailUrl: thumbnail_url,
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

// =============================================================================
// TOOL TYPE CONSTANTS AND VALIDATION
// =============================================================================
const VALID_TOOLS = ["story_engine", "shot_list", "canvas"];
const DEFAULT_TOOL = "story_engine";

/**
 * Validate a tool value
 * @param {string} tool - The tool value to validate
 * @returns {string|null} - Valid tool value or null if invalid
 */
export function validateToolValue(tool) {
  if (tool && typeof tool === "string") {
    const normalized = tool.toLowerCase().trim();
    if (VALID_TOOLS.includes(normalized)) {
      return normalized;
    }
  }
  return null;
}

/**
 * Determine the tool type based on deck content
 * Uses multiple heuristics to correctly categorize decks
 * 
 * @param {Object} src - Source deck data
 * @returns {string} - Tool type: "story_engine" | "shot_list" | "canvas"
 */
function determineToolType(src) {
  // ==========================================================================
  // PRIORITY 1: Explicit tool value (if valid)
  // ==========================================================================
  const explicitTool = validateToolValue(src.tool) || 
                       validateToolValue(src?.content?.tool);
  if (explicitTool) {
    return explicitTool;
  }

  // ==========================================================================
  // PRIORITY 2: Canvas/Whiteboard detection
  // Canvas decks have unique markers that distinguish them clearly
  // ==========================================================================
  const hasCanvasData = !!(src.canvasData || src?.content?.canvasData);
  const hasWhiteboardData = !!(src.whiteboard || src?.content?.whiteboard);
  const hasCanvasElements = !!(src.canvasElements || src?.content?.canvasElements);
  const hasDrawingData = !!(src.drawingData || src?.content?.drawingData);
  
  if (hasCanvasData || hasWhiteboardData || hasCanvasElements || hasDrawingData) {
    return "canvas";
  }

  // ==========================================================================
  // PRIORITY 3: Story Engine detection
  // Story Engine decks have distinctive structure from the intelligence engine
  // ==========================================================================
  const hasStoryProfile = !!(src.storyProfile || src?.content?.storyProfile);
  const hasCritique = !!(src.critique || src?.content?.critique);
  const hasAltConcepts = Array.isArray(src.altConcepts) || Array.isArray(src?.content?.altConcepts);
  
  // Definitive Story Engine markers
  if (hasStoryProfile || hasCritique || hasAltConcepts) {
    return "story_engine";
  }

  // Check for structured beats (Story Engine uses objects with name/intent/beatText)
  const beats = src.beats || src?.content?.beats;
  if (Array.isArray(beats) && beats.length > 0) {
    const firstBeat = beats[0];
    // Story Engine beats have structured objects with 'name' or 'intent' fields
    const hasStructuredBeats = firstBeat && typeof firstBeat === "object" && 
                               (firstBeat.name || firstBeat.intent || firstBeat.beatText);
    if (hasStructuredBeats) {
      return "story_engine";
    }
  }

  // Check for tone image (Story Engine feature)
  const hasToneImage = !!(src.toneImage || src.tone_image || src?.content?.toneImage);
  if (hasToneImage) {
    return "story_engine";
  }

  // ==========================================================================
  // PRIORITY 4: Shot List detection
  // Shot lists have shots with timecodes (tcIn/tcOut) from video analysis
  // ==========================================================================
  const shots = src.shots || src?.content?.shots;
  const hasShots = Array.isArray(shots) && shots.length > 0;
  
  if (hasShots) {
    const firstShot = shots[0];
    // Shot list shots have timecode fields (tcIn, tcOut)
    const hasTimecodes = firstShot && typeof firstShot === "object" && 
                         (firstShot.tcIn || firstShot.tcOut || firstShot.timecode);
    // Shot list shots may have 'still' (keyframe image) field
    const hasStillFrames = firstShot && typeof firstShot === "object" && firstShot.still;
    
    if (hasTimecodes || hasStillFrames) {
      return "shot_list";
    }
    
    // If there are shots but no beats, it's likely a shot list
    const hasBeats = Array.isArray(beats) && beats.length > 0;
    if (!hasBeats) {
      return "shot_list";
    }
  }

  // ==========================================================================
  // PRIORITY 5: Default to story_engine
  // Most decks with beats are Story Engine decks
  // ==========================================================================
  const hasAnyBeats = Array.isArray(beats) && beats.length > 0;
  if (hasAnyBeats) {
    return "story_engine";
  }

  // Check for prompt (indicates story generation attempt)
  const hasPrompt = !!(src.prompt || src?.content?.prompt);
  if (hasPrompt) {
    return "story_engine";
  }

  // ==========================================================================
  // FALLBACK: Default to story_engine
  // ==========================================================================
  return DEFAULT_TOOL;
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

  // Extract contentType for story categorization
  const contentType = coerceString(src.contentType || src.type || src?.content?.type || src.story_type || src?.content?.story_type || "").trim();
  
  // Determine story_type - NEVER allow undefined
  // Priority: explicit story_type > contentType > derive from tool > 'general'
  const storyType = coerceString(src.story_type || src?.content?.story_type || contentType || "").trim() || 
                    (tool === "shot_list" ? "shot_list" : tool === "canvas" ? "canvas" : "general");

  // Normalize beats with media URLs - use the new normalizeBeatEntry function
  // This ensures beats have visual_url, storyboard_url, thumbnail_url fields
  const normalizedBeats = beats.map((b, i) => 
    normalizeBeatEntry(b, beatTitles[i] || `Beat ${i + 1}`, i, visuals, storyboards)
  );

  // Determine deck thumbnail_url from first beat or explicit source
  const thumbnail_url = src.thumbnail_url || src.thumbnailUrl ||
                        normalizedBeats[0]?.visual_url || 
                        normalizedBeats[0]?.storyboard_url ||
                        visuals[0]?.image || visuals[0]?.url ||
                        storyboards[0]?.image || storyboards[0]?.url ||
                        null;

  const normalized = {
    id: src.id,
    title: coerceString(src.title || src?.content?.title || "").trim() || null,
    tagline: coerceString(src.tagline || src?.content?.tagline || "").trim() || null,
    prompt: coerceString(src.prompt || src?.content?.prompt || "").trim(),
    brief: normalizeTextBlock(src.brief || src?.content?.brief || ""),
    contentType: contentType, // Keep for backward compatibility
    story_type: storyType, // REQUIRED - never undefined, for frontend rendering
    tool, // ✅ Include tool field for categorization
    toneImage: src.toneImage || src.tone_image || src?.content?.toneImage || null,
    // Deck-level thumbnail (snake_case canonical, camelCase for compatibility)
    thumbnail_url,
    thumbnailUrl: thumbnail_url,
    beatTitles,
    // Use normalized beats with media URLs
    beats: normalizedBeats,
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

/**
 * Normalize beats array for API response
 * Ensures each beat has consistent visual_url, storyboard_url, thumbnail_url fields
 * 
 * @param {Array} beats - Beats array from database
 * @param {Array} visuals - Optional visuals array
 * @param {Array} storyboards - Optional storyboards array
 * @returns {Array} Normalized beats array
 */
export function normalizeBeatsForResponse(beats, visuals = [], storyboards = []) {
  if (!Array.isArray(beats)) return [];
  
  return beats.map((beat, index) => {
    // If beat is a string, convert to object
    if (typeof beat === "string") {
      return normalizeBeatEntry(beat, `Beat ${index + 1}`, index, visuals, storyboards);
    }
    
    // Extract media URLs with fallbacks
    const visual_url = beat.visual_url || beat.visualUrl || beat.image || beat.dataUrl ||
                       visuals[index]?.image || visuals[index]?.url || visuals[index]?.dataUrl || null;
    
    const storyboard_url = beat.storyboard_url || beat.storyboardUrl || beat.storyboardImage ||
                           storyboards[index]?.image || storyboards[index]?.url || storyboards[index]?.dataUrl || null;
    
    const thumbnail_url = beat.thumbnail_url || beat.thumbnailUrl || 
                          visual_url || storyboard_url || null;
    
    return {
      ...beat,
      // Ensure text field exists
      text: beat.text ?? beat.beatText ?? "",
      // Canonical snake_case fields
      visual_url,
      storyboard_url,
      thumbnail_url,
      // camelCase aliases for backward compatibility
      visualUrl: visual_url,
      storyboardUrl: storyboard_url,
      thumbnailUrl: thumbnail_url,
    };
  });
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
    story_type: deck.story_type || deck.contentType || "general", // REQUIRED - never undefined
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
