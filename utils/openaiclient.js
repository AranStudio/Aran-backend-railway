// utils/openaiClient.js
// Minimal OpenAI helper using native fetch (no SDK required).
// Works in Node 18+ / 20+ / 22+.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export async function chatCompletion({ prompt, model = "gpt-4o-mini" }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const err = new Error("Missing OPENAI_API_KEY environment variable");
    err.status = 500;
    throw err;
  }

  const r = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: String(prompt ?? "") }]
    })
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    const err = new Error("OpenAI request failed");
    err.status = r.status;
    err.details = data;
    throw err;
  }

  return {
    text: data?.choices?.[0]?.message?.content ?? "",
    raw: data
  };
}
