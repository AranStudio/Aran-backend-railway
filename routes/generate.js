// routes/generate.js
import { generateJson } from "../utils/openaiClient.js";

/**
 * Normalizes the generation response to ensure consistent field naming
 * for frontend compatibility. Critical: maps beatText → text
 */
function normalizeGenerateResponse(payload) {
  const beatsIn = Array.isArray(payload?.beats) ? payload.beats : [];

  const beats = beatsIn.map((b, i) => ({
    id: b.id ?? i + 1,
    name: b.name ?? `Beat ${i + 1}`,
    intent: b.intent ?? "",
    // ✅ critical mapping for frontend compatibility
    text: b.text ?? b.beatText ?? "",
    cameraNotes: b.cameraNotes ?? "",
    audioNotes: b.audioNotes ?? "",
    onScreenText: b.onScreenText ?? null,
    brandIntegration: b.brandIntegration ?? "",
  }));

  const altConceptsIn = Array.isArray(payload?.altConcepts) ? payload.altConcepts : [];
  const altConcepts = altConceptsIn.map((c) => ({
    id: c.id,
    // normalize name → title
    title: c.title ?? c.name ?? "",
    tagline: c.tagline ?? "",
    oneLiner: c.oneLiner ?? c.description ?? "",
    profilePatch: c.profilePatch ?? {},
  }));

  return {
    success: true,
    title: payload?.title ?? "",
    story_type: payload?.story_type ?? payload?.storyType ?? "general",
    storyProfile: payload?.storyProfile ?? null,
    beats,
    altConcepts,
    critique: payload?.critique ?? null,
    metadata: payload?.metadata ?? null,
  };
}

/**
 * POST /api/generate
 * 
 * Generates a story brief with title, tagline, beats, and optional tone image prompt.
 * 
 * Request body:
 *   - prompt (required): The story concept/idea
 *   - storyType (optional): Type of story (default: "general")
 *   - contentType (optional): Content format hint
 *   - styleHint (optional): Style guidance
 *   - reimagine (optional): Whether to reimagine existing content
 * 
 * Response:
 *   {
 *     "title": "string",
 *     "tagline": "string", 
 *     "beats": [{ "order": 1, "title": "string", "text": "string" }, ...],
 *     "toneImagePrompt": "string",
 *     "story_type": "string"
 *   }
 */
export default async function generate(req, res) {
  const requestId = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();

  try {
    // ---- Input validation ----
    const body = req.body || {};
    const prompt = body.prompt;
    const storyType = body.storyType || body.contentType || "general";
    const styleHint = body.styleHint || "";
    const reimagine = Boolean(body.reimagine);

    console.log(`[generate] START reqId=${requestId} storyType=${storyType} reimagine=${reimagine}`);

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      console.log(`[generate] VALIDATION_FAILED reqId=${requestId} reason=missing_prompt`);
      return res.status(400).json({ 
        error: "Missing or invalid 'prompt' field",
        code: "MISSING_PROMPT"
      });
    }

    const trimmedPrompt = prompt.trim();

    // ---- Build prompts for OpenAI ----
    const systemPrompt = `You are Aran, a professional story engine for filmmakers and creatives.

Your task is to generate a complete story brief from a user's concept.

REQUIREMENTS:
1. Generate a compelling title (short, memorable)
2. Generate a tagline (1 sentence that captures the essence)
3. Generate exactly 8 story beats - these are key narrative moments
4. Each beat must have: order (1-8), title (short name), text (description)
5. Generate a tone image prompt (a visual description for AI image generation that captures the story's mood)

OUTPUT FORMAT - Return ONLY this exact JSON structure:
{
  "title": "The Story Title",
  "tagline": "A one-sentence hook that captures the story.",
  "beats": [
    { "order": 1, "title": "Opening", "text": "Description of the opening moment..." },
    { "order": 2, "title": "Setup", "text": "Description of the setup..." },
    { "order": 3, "title": "Catalyst", "text": "Description of the catalyst..." },
    { "order": 4, "title": "Rising Action", "text": "Description of rising action..." },
    { "order": 5, "title": "Midpoint", "text": "Description of the midpoint..." },
    { "order": 6, "title": "Complications", "text": "Description of complications..." },
    { "order": 7, "title": "Climax", "text": "Description of the climax..." },
    { "order": 8, "title": "Resolution", "text": "Description of the resolution..." }
  ],
  "toneImagePrompt": "Cinematic description for image generation..."
}

Beats should be visual, concrete, and action-oriented. Think like a director.`;

    const userPrompt = `Story concept: ${trimmedPrompt}
Story type: ${storyType}
${styleHint ? `Style hint: ${styleHint}` : ""}
${reimagine ? "Note: This is a reimagining of existing content - add fresh creative twists." : ""}

Generate the complete story brief now.`;

    // ---- Call OpenAI via generateJson helper ----
    const result = await generateJson({
      system: systemPrompt,
      user: userPrompt,
      model: "gpt-4o-mini",
      temperature: 0.5,
      maxTokens: 1500,
      requestId,
    });

    // ---- Normalize the response using helper for frontend compatibility ----
    const out = normalizeGenerateResponse(result);

    // Also extract additional fields from result that aren't in the normalizer
    const tagline = typeof result.tagline === "string" && result.tagline.trim()
      ? result.tagline.trim()
      : "";

    const toneImagePrompt = typeof result.toneImagePrompt === "string" && result.toneImagePrompt.trim()
      ? result.toneImagePrompt.trim()
      : "";

    // Do NOT return 200 for invalid generations
    if (!out.title || !Array.isArray(out.beats) || out.beats.length === 0 || !out.beats[0].text) {
      console.error("INVALID_GENERATION_OUTPUT", {
        title: out.title,
        beatsLen: out.beats?.length,
        firstBeat: out.beats?.[0],
        rawKeys: Object.keys(result || {}),
      });
      return res.status(502).json({
        success: false,
        error: "Generation returned invalid structure (missing title/beats/text)",
      });
    }

    const elapsed = Date.now() - startTime;
    console.log(`[generate] SUCCESS reqId=${requestId} elapsed=${elapsed}ms beats=${out.beats.length} title="${out.title.slice(0, 50)}"`);

    // ---- Return the complete normalized brief ----
    return res.status(200).json({
      ...out,
      tagline,
      toneImagePrompt,
    });

  } catch (err) {
    const elapsed = Date.now() - startTime;
    
    // Log error details
    if (err.code === "JSON_PARSE_FAILED") {
      console.error(`[generate] JSON_PARSE_FAILED reqId=${requestId} elapsed=${elapsed}ms snippet="${err.snippet?.slice(0, 500)}"`);
      return res.status(502).json({
        error: "Model returned invalid JSON",
        code: "JSON_PARSE_FAILED",
        debug: process.env.NODE_ENV !== "production" ? err.snippet?.slice(0, 200) : undefined,
      });
    }

    if (err.code === "EMPTY_RESPONSE") {
      console.error(`[generate] EMPTY_RESPONSE reqId=${requestId} elapsed=${elapsed}ms`);
      return res.status(502).json({
        error: "Model returned empty response",
        code: "EMPTY_RESPONSE",
      });
    }

    if (err.code === "OPENAI_API_ERROR") {
      console.error(`[generate] OPENAI_API_ERROR reqId=${requestId} elapsed=${elapsed}ms error=${err.message}`);
      return res.status(502).json({
        error: "AI service error",
        code: "AI_SERVICE_ERROR",
        message: err.message,
      });
    }

    // Unknown error
    console.error(`[generate] UNKNOWN_ERROR reqId=${requestId} elapsed=${elapsed}ms error=`, err);
    return res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
}
