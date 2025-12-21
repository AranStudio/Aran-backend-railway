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
 * Unified text completion helper
 * (safe for outlines, beats, analysis)
 */
export async function chatCompletion({
  prompt,
  model = "gpt-4o-mini",
  temperature = 0.7,
}) {
  try {
    const res = await openai.responses.create({
      model,
      input: [
        {
          role: "user",
          content: [{ type: "text", text: prompt }],
        },
      ],
      temperature,
    });

    return {
      choices: [
        {
          message: {
            content: res.output_text,
          },
        },
      ],
    };
  } catch (err) {
    console.error("[OpenAI text error]", err);
    throw normalizeOpenAIError(err, "Text generation failed");
  }
}

/* -------------------- IMAGE HELPERS -------------------- */
export function asDataUrlFromB64(b64) {
  if (!b64) return null;
  return `data:image/png;base64,${b64}`;
}

/* -------------------- ERROR NORMALIZATION -------------------- */
function normalizeOpenAIError(err, fallback) {
  const status =
    err?.status ||
    err?.response?.status ||
    err?.error?.status ||
    500;

  const message =
    err?.error?.message ||
    err?.response?.data?.error?.message ||
    err?.message ||
    fallback ||
    "OpenAI request failed";

  const e = new Error(message);
  e.status = status;
  return e;
}

export default openai;