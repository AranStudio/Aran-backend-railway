import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateToneImage(prompt) {
  try {
    const result = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024"
    });

    // OpenAI now returns this shape:
    // result.data[0].url
    return result.data[0].url;

  } catch (err) {
    console.error("generateToneImage error:", err);
    throw err;
  }
}
