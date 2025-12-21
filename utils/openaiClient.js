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
              type: "input_text",
              text: String(prompt || ""),
            },
          ],
        },
      ],
      temperature,
    });

    return {
      text: r.output_text || "",
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

/* -------------------- IMAGE HELPERS -------------------- */
export function asDataUrlFromB64(b64) {
  if (!b64) return null;
  return `data:image/png;base64,${b64}`;
}

export default openai;