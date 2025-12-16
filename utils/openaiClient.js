// utils/openaiClient.js
import OpenAI from "openai";

function requireKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is missing on the server");
  return key;
}

export const openai = new OpenAI({ apiKey: requireKey() });

export async function chatCompletion({ prompt, model = "gpt-4o-mini" }) {
  return await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });
}

export function asDataUrlFromB64(b64) {
  return `data:image/png;base64,${b64}`;
}

export default openai;
