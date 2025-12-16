// utils/openaiClient.js
import OpenAI from "openai";

function requireKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is missing on the server");
  return key;
}

// Named export used by generatestoryboards.js
export const openai = new OpenAI({
  apiKey: requireKey(),
});

// Named export used by generate.js
export async function chatCompletion({ prompt, model = "gpt-4o-mini" }) {
  const resp = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
  });

  // Normalize to your likely expected shape
  return resp;
}

export default openai;
