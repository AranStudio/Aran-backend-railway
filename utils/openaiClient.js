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
export async function chatCompletion({
  messages = [],
  model = "gpt-4o-mini",
  responseFormat,
  temperature = 0.7,
  maxTokens = 256,
} = {}) {
  const response = await openai.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    response_format: responseFormat,
  });

  const content = response?.choices?.[0]?.message?.content;
  return { text: content ?? "" };
}

/* -------------------- IMAGE HELPERS -------------------- */
export function asDataUrlFromB64(b64) {
  if (!b64) return null;
  return `data:image/png;base64,${b64}`;
}
