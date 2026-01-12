import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function generateToneImage(prompt) {
  try {
    const result = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
    });

    // Most common shape: hosted URL
    const url = result?.data?.[0]?.url;
    if (url) return url;

    // Fallback: some responses may return base64
    const b64 = result?.data?.[0]?.b64_json;
    if (b64) return `data:image/png;base64,${b64}`;

    throw new Error("Tone image generation returned no url or b64_json.");
  } catch (err) {
    console.error("generateToneImage error:", err);
    throw err;
  }
}
