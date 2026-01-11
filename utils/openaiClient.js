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

export const openai = new OpenAI({
  apiKey: requireKey(),
});

/* -------------------- TEXT GENERATION -------------------- */
/**
 * Uses standard chat completions and returns a plain text string.
 */
export async function chatCompletion({
  prompt,
  system,
  messages,
  model = "gpt-4o-mini",
  temperature = 0.7,
  responseFormat,
  maxTokens,
}) {
  try {
    const finalMessages = Array.isArray(messages) && messages.length
      ? messages
      : [
          system
            ? {
                role: "system",
                content: String(system || ""),
              }
            : null,
          {
            role: "user",
            content: String(prompt || ""),
          },
        ].filter(Boolean);

    const completion = await openai.chat.completions.create({
      model,
      messages: finalMessages,
      temperature,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
    });

    return {
      text: getTextFromChatCompletion(completion),
      raw: completion,
    };
  } catch (err) {
    console.error("[OpenAI TEXT ERROR]", err);
    const e = new Error(
      err?.error?.message ||
      err?.message ||
      "Text generation failed"
    );
    e.status = err?.status || 500;
    throw e;
  }
}

function getTextFromChatCompletion(completion) {
  if (!completion) return "";

  const content = completion.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim()) return content;

  const partToText = (part) => {
    if (typeof part?.text === "string") return part.text;
    if (typeof part?.text?.value === "string") return part.text.value;
    if (typeof part === "string") return part;
    return "";
  };

  if (Array.isArray(content))
    return content.map(partToText).filter(Boolean).join("");

  // Some responses may return a single content part object instead of an array
  const fallback = partToText(content);
  if (fallback.trim()) return fallback;

  return "";
}

/* -------------------- IMAGE HELPERS -------------------- */
export function asDataUrlFromB64(b64) {
  if (!b64) return null;
  return `data:image/png;base64,${b64}`;
}

export default openai;
