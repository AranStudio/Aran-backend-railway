// utils/openaiClient.js
import OpenAI from "openai";

// Named export your routes expect:
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Optional helper if other files want a guard:
export function assertOpenAIKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing on the server environment");
  }
}

export default openai;
