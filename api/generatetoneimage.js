// generateToneImage.js
import generate from "./generate.js";

// Alias route: reuse the exact same behavior as /api/generate
export default async function generateToneImage(req, res) {
  return generate(req, res);
}
