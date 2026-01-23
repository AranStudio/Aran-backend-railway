// utils/openaiClient.js
import OpenAI from "openai";

/* -------------------- ENV -------------------- */
function requireKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is missing on the server");
  }
  return key;
}

/* -------------------- CLIENT -------------------- */
export const openai = new OpenAI({
  apiKey: requireKey(),
});

/* -------------------- CHAT HELPERS -------------------- */
/**
 * Basic chat completion without response_format (which can cause 400 errors).
 * Use generateJson() for JSON responses instead.
 */
export async function chatCompletion({
  messages = [],
  model = "gpt-4o-mini",
  temperature = 0.7,
  maxTokens = 256,
} = {}) {
  const response = await openai.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  const content = response?.choices?.[0]?.message?.content;
  return { text: content ?? "" };
}

/* -------------------- JSON GENERATION HELPER -------------------- */
/**
 * Extracts the first JSON object or array from a string.
 * Handles cases where the model includes markdown or extra text.
 */
function extractJsonFromText(text) {
  if (!text || typeof text !== "string") return null;

  // Try to find JSON object {...}
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      // Continue to try array
    }
  }

  // Try to find JSON array [...]
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {
      // Fall through
    }
  }

  return null;
}

/**
 * Safe JSON parse with fallback extraction.
 * First tries direct parse, then attempts to extract JSON from text.
 */
function safeJsonParse(text) {
  if (!text || typeof text !== "string") return null;

  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch {
    // Try extraction as fallback
    return extractJsonFromText(text);
  }
}

/**
 * Generate JSON from OpenAI with robust parsing.
 * 
 * @param {Object} options
 * @param {string} options.system - System prompt (will have JSON instruction appended)
 * @param {string} options.user - User prompt
 * @param {string} [options.model="gpt-4o-mini"] - Model to use
 * @param {number} [options.temperature=0.4] - Temperature (lower = more deterministic)
 * @param {number} [options.maxTokens=1024] - Max tokens
 * @param {string} [options.requestId] - Optional request ID for logging
 * @returns {Promise<Object>} Parsed JSON object
 * @throws {Error} If JSON parsing fails
 */
export async function generateJson({
  system,
  user,
  model = "gpt-4o-mini",
  temperature = 0.4,
  maxTokens = 1024,
  requestId = null,
} = {}) {
  const startTime = Date.now();
  const reqId = requestId || `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Enforce JSON output via system prompt
  const jsonSystemPrompt = `${system}

CRITICAL: Return ONLY valid JSON. No markdown code fences. No explanations before or after. Just the raw JSON object.`;

  const messages = [
    { role: "system", content: jsonSystemPrompt },
    { role: "user", content: user },
  ];

  let rawContent = "";
  
  try {
    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    });

    rawContent = response?.choices?.[0]?.message?.content ?? "";
    const elapsed = Date.now() - startTime;

    console.log(`[generateJson] reqId=${reqId} model=${model} elapsed=${elapsed}ms contentLen=${rawContent.length}`);

    if (!rawContent.trim()) {
      const err = new Error("OpenAI returned empty content");
      err.code = "EMPTY_RESPONSE";
      err.requestId = reqId;
      throw err;
    }

    const parsed = safeJsonParse(rawContent);

    if (!parsed || typeof parsed !== "object") {
      const snippet = rawContent.slice(0, 500);
      console.error(`[generateJson] PARSE_FAILED reqId=${reqId} snippet="${snippet}"`);
      
      const err = new Error("Failed to parse JSON from model response");
      err.code = "JSON_PARSE_FAILED";
      err.requestId = reqId;
      err.snippet = snippet;
      throw err;
    }

    return parsed;
  } catch (err) {
    // If it's our custom error, re-throw
    if (err.code === "EMPTY_RESPONSE" || err.code === "JSON_PARSE_FAILED") {
      throw err;
    }

    // OpenAI API error
    console.error(`[generateJson] API_ERROR reqId=${reqId} error=${err.message}`);
    
    const apiError = new Error(`OpenAI API error: ${err.message}`);
    apiError.code = "OPENAI_API_ERROR";
    apiError.requestId = reqId;
    apiError.originalError = err;
    throw apiError;
  }
}

/* -------------------- IMAGE HELPERS -------------------- */
export function asDataUrlFromB64(b64) {
  if (!b64) return null;
  return `data:image/png;base64,${b64}`;
}
