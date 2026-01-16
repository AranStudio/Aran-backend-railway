import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function interpretSketch({ image, contentTypeHint, intent }) {
  const prompt = `
You are Aran, a story engine for filmmakers and creatives.

A user has drawn a sketch on a whiteboard. Interpret the sketch and convert it into:
- title
- contentType (film, commercial, documentary, story, etc)
- refined prompt
- 6–10 beats (short but cinematic)

If unsure, infer creatively but grounded.

Optional hint: ${contentTypeHint || "none"}
User intent: ${intent || "general story"}
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_base64: image.replace(/^data:image\/\w+;base64,/, "") }
        ]
      }
    ]
  });

  const text = response.output[0].content[0].text;

  // Attempt to parse structured output
  return {
    raw: text
  };
}
