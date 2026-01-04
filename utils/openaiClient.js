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
 * Uses the modern Responses API correctly.
 * Returns a plain text string.
 */
export async function chatCompletion({
  prompt,
  model = "gpt-4o-mini",
  temperature = 0.7,
}) {
  try {
    const r = await openai.responses.create({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: String(prompt || ""),
            },
          ],
        },
      ],
      temperature,
    });

    return {
      text: getTextFromResponse(r),
      raw: r,
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

function getTextFromResponse(r) {
  if (!r) return "";
  if (r.output_text) return String(r.output_text);

  const content = r.output?.[0]?.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }

  return "";
}

/* -------------------- IMAGE HELPERS -------------------- */
export function asDataUrlFromB64(b64) {
  if (!b64) return null;
  return `data:image/png;base64,${b64}`;
}

export default openai;