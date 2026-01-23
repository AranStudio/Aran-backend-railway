import multer from "multer";
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "ffprobe-static";
import { createWorker } from "tesseract.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 500 } });

function pad2(n) { return String(n).padStart(2, "0"); }
function secondsToTimecode(sec, fps = 30) {
  const totalFrames = Math.max(0, Math.round(sec * fps));
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}:${pad2(frames)}`;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { ...opts, maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        err.stdout = stdout;
        return reject(err);
      }
      resolve({ stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

async function probeMeta(videoPath) {
  const { stdout } = await run(ffprobePath.path, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]);
  const duration = parseFloat(stdout.trim()) || 0;
  return { duration };
}

function bucketText(lines) {
  const buckets = { titles: [], lowerThirds: [], locations: [], other: [] };
  for (const raw of lines) {
    const t = String(raw || "").trim();
    if (!t) continue;

    const cleaned = t.replace(/\s+/g, " ");
    const upper = cleaned.toUpperCase();

    const isLocation = /\b(AZ|CA|NY|TX|FL|WA|OR|NV|UT|CO|IL|MA|NJ|PA)\b/.test(upper) || /,\s*[A-Z]{2}\b/.test(upper);
    const isTitle = upper.includes("PRESENTS") || upper.includes("A FILM") || cleaned.length > 45;

    if (isTitle) buckets.titles.push(cleaned);
    else if (isLocation) buckets.locations.push(cleaned);
    else if (cleaned.split(" ").length <= 4) buckets.lowerThirds.push(cleaned);
    else buckets.other.push(cleaned);
  }

  // De-dupe
  for (const k of Object.keys(buckets)) {
    buckets[k] = Array.from(new Set(buckets[k])).slice(0, 50);
  }
  return buckets;
}

async function ocrImages(imagePaths) {
  const worker = await createWorker("eng");
  const results = [];
  try {
    for (const p of imagePaths) {
      const { data } = await worker.recognize(p);
      const text = (data?.text || "").trim();
      const lines = text
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => l && l.length >= 3)
        .slice(0, 8);
      results.push(lines);
    }
  } finally {
    try { await worker.terminate(); } catch {}
  }
  return results;
}

async function detectCutsAndFrames(videoPath, outDir, threshold) {
  // Extract frames on scene changes. showinfo prints pts_time.
  // We write frames as jpgs: frame_0001.jpg ...
  const framePattern = path.join(outDir, "frame_%04d.jpg");

  const vf = `select='gt(scene,${threshold})',showinfo`;

  const { stderr } = await run(ffmpegPath, [
    "-hide_banner",
    "-i", videoPath,
    "-vf", vf,
    "-vsync", "vfr",
    "-q:v", "3",
    framePattern,
  ]);

  // Parse pts_time from stderr
  const times = [];
  const re = /pts_time:([0-9]+\.?[0-9]*)/g;
  let m;
  while ((m = re.exec(stderr)) !== null) {
    times.push(parseFloat(m[1]));
  }

  // List extracted frames
  const frames = fs
    .readdirSync(outDir)
    .filter((f) => f.startsWith("frame_") && f.endsWith(".jpg"))
    .sort();

  const framePaths = frames.map((f) => path.join(outDir, f));

  return { cutTimes: Array.from(new Set(times)).sort((a, b) => a - b), framePaths };
}

async function detectCutsAdaptive(videoPath, outDir, threshold) {
  // Scene detection can be finicky depending on codec, motion blur, dissolves, etc.
  // If we detect too few cuts, progressively lower the threshold.
  const tries = Array.from(
    new Set([
      threshold,
      Math.max(0.05, threshold * 0.75),
      0.2,
      0.15,
      0.12,
      0.1,
    ].map((t) => Math.min(0.95, Math.max(0.05, t))))
  );

  let best = { cutTimes: [], framePaths: [] };
  for (const t of tries) {
    // Clear any previously extracted frames for a fresh run.
    for (const f of fs.readdirSync(outDir)) {
      if (f.startsWith("frame_") && f.endsWith(".jpg")) {
        try { fs.unlinkSync(path.join(outDir, f)); } catch {}
      }
    }
    const r = await detectCutsAndFrames(videoPath, outDir, t);
    if ((r.cutTimes?.length || 0) > (best.cutTimes?.length || 0)) best = r;
    // Once we have a reasonable number of cuts, stop.
    if ((r.cutTimes?.length || 0) >= 8) return { ...r, usedThreshold: t };
  }
  return { ...best, usedThreshold: tries[0] };
}

async function extractKeyframe(videoPath, outPath, atSeconds) {
  const ss = String(Math.max(0, atSeconds));
  // Extract a small still for UI display (keeps response sizes sane).
  await run(ffmpegPath, [
    "-hide_banner",
    "-ss", ss,
    "-i", videoPath,
    "-frames:v", "1",
    "-vf", "scale=360:-1",
    "-q:v", "6",
    outPath,
  ]);
  return outPath;
}

function fileToDataUrl(p) {
  try {
    const buf = fs.readFileSync(p);
    const b64 = buf.toString("base64");
    return `data:image/jpeg;base64,${b64}`;
  } catch {
    return null;
  }
}

async function extractKeyframesForShots(videoPath, outDir, cuts, maxShots) {
  const paths = [];
  for (let i = 0; i < maxShots; i++) {
    const start = cuts[i];
    const end = cuts[i + 1];
    const mid = start + Math.max(0.01, (end - start) * 0.5);
    const outPath = path.join(outDir, `shot_${String(i + 1).padStart(4, "0")}.jpg`);
    await extractKeyframe(videoPath, outPath, mid);
    paths.push(outPath);
  }
  return paths;
}

async function buildShotlist(videoPath, threshold) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aran-shotlist-"));
  try {
    const meta = await probeMeta(videoPath);
    const duration = meta.duration || 0;

    const { cutTimes, framePaths, usedThreshold } = await detectCutsAdaptive(videoPath, tmpDir, threshold);

    // Build shot intervals. Start at 0.
    const cuts = [0, ...cutTimes.filter((t) => t > 0.05 && t < duration - 0.05), duration];
    const fps = 30;

    // OCR a representative keyframe for every shot (midpoint), so we don't miss interior shots
    // even when scene detection extracted few frames.
    const maxShots = Math.min(cuts.length - 1, 220);
    const shotKeyframes = await extractKeyframesForShots(videoPath, tmpDir, cuts, maxShots);
    const ocrLines = await ocrImages(shotKeyframes);

    const shots = [];
    const allText = [];

    for (let i = 0; i < maxShots; i++) {
      const tcIn = secondsToTimecode(cuts[i], fps);
      const tcOut = secondsToTimecode(cuts[i + 1], fps);
      const lines = (ocrLines[i] || []).slice(0, 6);
      const still = fileToDataUrl(shotKeyframes[i]);
      for (const l of lines) allText.push(l);
      shots.push({ index: i + 1, tcIn, tcOut, text: lines, still });
    }

    return {
      title: "Shotlist",
      story_type: "shot_list", // Shot list always uses 'shot_list' story_type
      durationSeconds: duration,
      usedThreshold,
      shots,
      textBuckets: bucketText(allText),
    };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

export const videoShotlistUpload = upload.single("video");

export async function videoShotlistHandler(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No video uploaded" });
    const thresholdRaw = req.body?.sceneThreshold;
    const threshold = Math.min(0.95, Math.max(0.05, parseFloat(thresholdRaw || "0.35") || 0.35));

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aran-video-"));
    const videoPath = path.join(tmpDir, `upload_${Date.now()}_${req.file.originalname || "video.mp4"}`);
    fs.writeFileSync(videoPath, req.file.buffer);

    const onlyWithText = String(req.body?.onlyWithText || "").toLowerCase() === "true";
    const includeBucketsRaw = req.body?.includeBuckets;
    const includeBuckets = Array.isArray(includeBucketsRaw)
      ? includeBucketsRaw
      : typeof includeBucketsRaw === "string" && includeBucketsRaw.trim()
        ? includeBucketsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : null;

    const result = await buildShotlist(videoPath, threshold);

    if (onlyWithText) {
      const allowed = new Set((includeBuckets || ["titles", "lowerThirds", "locations", "other"]).map((s) => s.toLowerCase()));
      result.shots = result.shots.filter((shot) => {
        const buckets = bucketText(shot.text || []);
        const has = (k) => (buckets[k] || []).length > 0;
        return (
          (allowed.has("titles") && has("titles")) ||
          ((allowed.has("lowerthirds") || allowed.has("lowerthird") || allowed.has("lower_thirds") || allowed.has("lower-thirds")) && has("lowerThirds")) ||
          (allowed.has("locations") && has("locations")) ||
          (allowed.has("other") && has("other"))
        );
      });
    }

    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

    return res.json(result);
  } catch (err) {
    console.error("/video/shotlist error:", err);
    return res.status(500).json({ error: "Failed to generate shotlist" });
  }
}
