import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { openai } from "../utils/openaiClient.js";

function stripDataUrl(dataUrl) {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:(video\/\w+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], b64: m[2] };
}

function execFileAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { ...opts }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        err.stdout = stdout;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

async function getDurationSeconds(filePath) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const dur = Number(String(stdout).trim());
    return Number.isFinite(dur) ? dur : null;
  } catch {
    return null;
  }
}

function toTimecode(seconds, fps = 30) {
  const totalFrames = Math.max(0, Math.round(seconds * fps));
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(frames)}`;
}

async function extractFrame(videoPath, atSeconds, outPath) {
  // -y overwrite, -ss seek, -vframes 1 single frame
  await execFileAsync("ffmpeg", ["-y", "-ss", String(atSeconds), "-i", videoPath, "-vframes", "1", outPath]);
}

async function visionReadOverlayText(imagePath, hintText = "") {
  const b64 = fs.readFileSync(imagePath).toString("base64");
  const system =
    "Return ONLY valid JSON with this exact shape: {\n" +
    '  "shotDescription": "short visual description",\n' +
    '  "onScreenText": [ { "text": "...", "category": "lowerThird|title|location|date|caption|other" } ]\n' +
    "}\n" +
    "No markdown. No extra keys. If there is no text, return an empty onScreenText array.";

  const user =
    "Analyze this video frame.\n" +
    "1) Describe the shot in 1 sentence.\n" +
    "2) Extract any on-screen text overlays (titles/lower thirds/location/date).\n" +
    (hintText ? `Hint: ${hintText}\n` : "");

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: user },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ],
      },
    ],
  });

  const text = resp?.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(text);
  } catch {
    return { shotDescription: "", onScreenText: [] };
  }
}

export default async function videoShotlist(req, res) {
  try {
    const { videoBase64, video, filename, fpsHint } = req.body || {};
    // Accept either:
    // - videoBase64 (raw base64)
    // - video (dataURL)
    const parsed = stripDataUrl(video) || { mime: "video/mp4", b64: videoBase64 };

    if (!parsed?.b64) {
      return res.status(400).json({ error: "Missing videoBase64 (or video dataURL)" });
    }

    const buf = Buffer.from(parsed.b64, "base64");
    // Safety cap: keep server from exploding. JSON parser already caps at 80mb by default.
    if (buf.length > 85 * 1024 * 1024) {
      return res.status(413).json({
        error:
          "Video too large for this MVP upload path. Please upload a shorter clip (under ~80MB) or we can switch to multipart uploads.",
      });
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aran-shotlist-"));
    const ext = (filename && path.extname(filename)) || ".mp4";
    const videoPath = path.join(tmpDir, `input${ext}`);
    fs.writeFileSync(videoPath, buf);

    const fps = Number.isFinite(Number(fpsHint)) ? Number(fpsHint) : 30;
    const duration = await getDurationSeconds(videoPath);

    // If we can’t probe duration, still return a single segment.
    const shotCount = duration ? Math.min(12, Math.max(1, Math.round(duration / 6))) : 1;
    const segmentLen = duration ? duration / shotCount : null;

    const shots = [];
    for (let i = 0; i < shotCount; i++) {
      const t0 = segmentLen ? i * segmentLen : 0;
      const t1 = segmentLen ? Math.min(duration, (i + 1) * segmentLen) : 0;
      const mid = segmentLen ? (t0 + t1) / 2 : 0;

      let framePath = null;
      let vision = { shotDescription: "", onScreenText: [] };

      try {
        framePath = path.join(tmpDir, `frame_${String(i + 1).padStart(2, "0")}.jpg`);
        await extractFrame(videoPath, mid, framePath);
        vision = await visionReadOverlayText(framePath);
      } catch (e) {
        // If ffmpeg isn't available, we still return a structural shot list.
        vision = { shotDescription: "", onScreenText: [] };
      }

      shots.push({
        shot: i + 1,
        tcIn: toTimecode(t0, fps),
        tcOut: toTimecode(t1, fps),
        description: vision?.shotDescription || "",
        onScreenText: Array.isArray(vision?.onScreenText) ? vision.onScreenText : [],
      });
    }

    // Summarize categories for convenience
    const textAll = [];
    for (const s of shots) {
      for (const t of s.onScreenText || []) {
        const txt = String(t?.text || "").trim();
        if (!txt) continue;
        textAll.push({
          text: txt,
          category: String(t?.category || "other"),
          tcIn: s.tcIn,
          tcOut: s.tcOut,
          shot: s.shot,
        });
      }
    }

    const cleanup = () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    };
    cleanup();

    return res.json({
      filename: filename || "video",
      durationSeconds: duration,
      fps,
      shots,
      onScreenText: textAll,
      notes:
        "MVP: This endpoint accepts base64 video (best for short clips). For long footage, we should switch to multipart uploads + background processing.",
    });
  } catch (err) {
    console.error("video shotlist error:", err);
    return res.status(500).json({ error: err?.message || "Shotlist generation failed" });
  }
}
