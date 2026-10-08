/**
 * V12 render worker — turns browser exports into universally playable MP4.
 *
 *  POST /transcode   multipart: video=<webm>  [audio=<mp3|wav|ogg>] [fps=30] [crf=18] [preset=medium]
 *  POST /sequence    multipart: frames=<zip of PNG/JPG> [audio=...] fps=30
 *  GET  /health
 *
 * Design: ffmpeg is spawned per job (one process = one job, no shared state), input is streamed to
 * a tmp dir, output is streamed back and the tmp dir is deleted in `finally`. Concurrency is capped
 * by MAX_JOBS; extra requests get 429 so the box never swaps. Runs on Render as a Docker web service.
 */
import express from 'express';
import multer from 'multer';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.env.PORT || 10000;
const MAX_JOBS = parseInt(process.env.MAX_JOBS || '2', 10);
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '500', 10);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const JOB_TIMEOUT_MS = parseInt(process.env.JOB_TIMEOUT_MS || String(15 * 60 * 1000), 10);

let active = 0;
const app = express();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 } });

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (_req, res) => {
  let ffmpeg = 'missing';
  try { ffmpeg = execFileSync('ffmpeg', ['-version']).toString().split('\n')[0]; } catch { /* no ffmpeg */ }
  res.json({ ok: ffmpeg !== 'missing', ffmpeg, active, maxJobs: MAX_JOBS });
});

function runFfmpeg(args, cwd, log) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args], { cwd });
    let stderr = '';
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('ffmpeg timed out')); }, JOB_TIMEOUT_MS);
    proc.stderr.on('data', d => { stderr += d; if (stderr.length > 65536) stderr = stderr.slice(-32768); });
    proc.on('error', err => { clearTimeout(timer); reject(err); });
    proc.on('close', code => { clearTimeout(timer); if (code === 0) resolve(); else { log(stderr); reject(new Error(`ffmpeg exited ${code}: ${stderr.split('\n').slice(-6).join(' | ')}`)); } });
  });
}

function clampInt(v, lo, hi, d) { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; }
const PRESETS = new Set(['ultrafast', 'veryfast', 'fast', 'medium', 'slow']);

async function withJob(res, fn) {
  if (active >= MAX_JOBS) { res.status(429).json({ error: 'Render queue full — try again in a minute' }); return; }
  active++;
  try { await fn(); } finally { active--; }
}

function sendFile(res, file, name) {
  return stat(file).then(st => new Promise((resolve, reject) => {
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', st.size);
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    const stream = createReadStream(file);
    stream.on('error', reject);
    stream.on('close', resolve);
    stream.pipe(res);
  }));
}

/** Common H.264/AAC encode: yuv420p + even dimensions + faststart so every player/phone decodes it. */
function h264Args(fps, crf, preset, hasAudio) {
  return [
    '-vf', `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`,
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-profile:v', 'high', '-level', '4.2',
    '-x264-params', `keyint=${fps * 2}:min-keyint=${fps * 2}:scenecut=0`,
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-af', 'aresample=async=1:first_pts=0', '-shortest'] : ['-an']),
    '-fps_mode', 'cfr', '-movflags', '+faststart'
  ];
}

app.post('/transcode', upload.fields([{ name: 'video', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), (req, res) => withJob(res, async () => {
  const video = req.files?.video?.[0];
  const audio = req.files?.audio?.[0];
  if (!video) return res.status(400).json({ error: 'video file required' });
  const fps = clampInt(req.body.fps, 1, 120, 30);
  const crf = clampInt(req.body.crf, 10, 35, 18);
  const preset = PRESETS.has(req.body.preset) ? req.body.preset : 'medium';
  const dir = await mkdtemp(path.join(os.tmpdir(), 'v12-'));
  try {
    const out = path.join(dir, 'out.mp4');
    const inputs = ['-i', video.path, ...(audio ? ['-i', audio.path, '-map', '0:v:0', '-map', '1:a:0'] : [])];
    await runFfmpeg([...inputs, ...h264Args(fps, crf, preset, !!audio), out], dir, console.error);
    await sendFile(res, out, (req.body.name || 'export') + '.mp4');
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: String(err.message || err) });
  } finally {
    await rm(dir, { recursive: true, force: true });
    await Promise.all([video, audio].filter(Boolean).map(f => rm(f.path, { force: true })));
  }
}));

app.post('/sequence', upload.fields([{ name: 'frames', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), (req, res) => withJob(res, async () => {
  const frames = req.files?.frames?.[0];
  const audio = req.files?.audio?.[0];
  if (!frames) return res.status(400).json({ error: 'frames zip required' });
  const fps = clampInt(req.body.fps, 1, 120, 30);
  const crf = clampInt(req.body.crf, 10, 35, 18);
  const preset = PRESETS.has(req.body.preset) ? req.body.preset : 'medium';
  const dir = await mkdtemp(path.join(os.tmpdir(), 'v12-'));
  try {
    execFileSync('unzip', ['-qq', '-o', frames.path, '-d', dir]);
    // ffmpeg glob demuxer accepts any zero-padded sequence; sort order = filename order
    const out = path.join(dir, 'out.mp4');
    const inputs = ['-framerate', String(fps), '-pattern_type', 'glob', '-i', path.join(dir, '*.png'), ...(audio ? ['-i', audio.path, '-map', '0:v:0', '-map', '1:a:0'] : [])];
    await runFfmpeg([...inputs, ...h264Args(fps, crf, preset, !!audio), out], dir, console.error);
    await sendFile(res, out, (req.body.name || 'export') + '.mp4');
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: String(err.message || err) });
  } finally {
    await rm(dir, { recursive: true, force: true });
    await Promise.all([frames, audio].filter(Boolean).map(f => rm(f.path, { force: true })));
  }
}));

app.listen(PORT, () => console.log(`render-worker listening on :${PORT} (max ${MAX_JOBS} jobs)`));
