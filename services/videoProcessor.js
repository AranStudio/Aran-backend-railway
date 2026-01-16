import fs from "fs";
import path from "path";
import { exec } from "child_process";
import Tesseract from "tesseract.js";

export async function processVideo(file) {
  const tempDir = `./temp_${Date.now()}`;
  fs.mkdirSync(tempDir);

  const videoPath = path.join(tempDir, file.originalname);
  fs.writeFileSync(videoPath, file.buffer);

  // Extract frames every 2 seconds
  const framePattern = path.join(tempDir, "frame_%03d.jpg");

  await new Promise((resolve, reject) => {
    exec(
      `ffmpeg -i "${videoPath}" -vf fps=0.5 "${framePattern}"`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  const frames = fs.readdirSync(tempDir).filter(f => f.endsWith(".jpg"));

  const shots = [];

  for (let i = 0; i < frames.length; i++) {
    const framePath = path.join(tempDir, frames[i]);

    const result = await Tesseract.recognize(framePath, "eng");
    const text = result.data.text.trim();

    shots.push({
      shot: i + 1,
      tcIn: `00:00:${String(i * 2).padStart(2, "0")}:00`,
      tcOut: `00:00:${String(i * 2 + 2).padStart(2, "0")}:00`,
      detectedText: text || null
    });
  }

  fs.rmSync(tempDir, { recursive: true, force: true });

  return {
    totalShots: shots.length,
    shots
  };
}
