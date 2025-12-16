import generate from "./generate.js";

export default async function generateToneImage(req, res) {
  return generate(req, res);
}
