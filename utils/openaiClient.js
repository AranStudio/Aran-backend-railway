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
  model = "gpt-4o-mini",
  temperature = 0.7,
}) {
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: String(prompt || ""),
        },
      ],
      temperature,
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

  const message = completion.choices?.[0]?.message;
  if (typeof message?.content === "string" && message.content.trim()) {
    return message.content;
  }

  return "";
}

/* -------------------- IMAGE HELPERS -------------------- */
export function asDataUrlFromB64(b64) {
  if (!b64) return null;
  return `data:image/png;base64,${b64}`;
}

export default openai;
