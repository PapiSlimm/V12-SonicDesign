/**
 * Job handlers. Each receives a workspace dir with the source already downloaded, does its ffmpeg work,
 * uploads outputs through `Storage`, and returns rendition rows + a result blob. No handler touches HTTP.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Asset, AnalyzeAudioParams, AudioMasterParams, Job, LadderRung, StreamParams, ThumbnailParams, TranscodeMp4Params, RenditionKind } from '../types.js';
import { aacArgs, encoders, probe, run, safeVf, x264Args, ProbeInfo } from './ffmpeg.js';
import { mimeFor, Storage } from './storage.js';
import { analysePcm, analysisToRow, AnalysisRow } from '../analyze/core.js';
import { ANALYSIS_SAMPLE_RATE, decodeMono, waveformPeaks } from '../analyze/node.js';

const execFileP = promisify(execFile);

export interface RenditionOut {
  kind: RenditionKind; url: string; storage_key: string; mime: string; bytes: number;
  width?: number | null; height?: number | null; bitrate_kbps?: number | null; codec?: string | null; meta?: Record<string, unknown>;
}

export interface HandlerContext {
  job: Job; asset: Asset; dir: string; source: string; info: ProbeInfo; storage: Storage;
  /** resolve another asset's local file (e.g. audio to mux) */
  fetchAsset: (assetId: string) => Promise<string>;
  fetchUrl: (url: string) => Promise<string>;
  progress: (fraction: number) => void;
  log: (msg: string) => void;
}

export interface HandlerResult { renditions: RenditionOut[]; analysis?: AnalysisRow; result?: Record<string, unknown> }

const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) && n !== 0 ? Math.min(hi, Math.max(lo, n)) : d; };
const PRESETS = new Set(['ultrafast', 'veryfast', 'fast', 'medium', 'slow']);
const keyFor = (asset: Asset, job: Job, file: string) => `${asset.app}/${asset.id}/${job.kind.replace('.', '-')}-${job.id.slice(0, 8)}/${file}`;

/** Is the source a zip of frames (PNG sequence from the browser exporter)? */
async function unzipFrames(ctx: HandlerContext): Promise<string> {
  const framesDir = path.join(ctx.dir, 'frames');
  await mkdir(framesDir, { recursive: true });
  await execFileP('unzip', ['-qq', '-o', ctx.source, '-d', framesDir]);
  return framesDir;
}

async function videoInput(ctx: HandlerContext, fps: number): Promise<{ args: string[]; info: ProbeInfo }> {
  if (ctx.asset.kind === 'frames' || /\.zip$/i.test(ctx.source)) {
    const framesDir = await unzipFrames(ctx);
    const first = (await (await import('node:fs/promises')).readdir(framesDir)).filter(f => /\.(png|jpe?g)$/i.test(f)).sort()[0];
    if (!first) throw new Error('frames zip contains no PNG/JPG files');
    const ext = path.extname(first);
    const info = await probe(path.join(framesDir, first));
    const count = (await (await import('node:fs/promises')).readdir(framesDir)).filter(f => f.endsWith(ext)).length;
    return { args: ['-framerate', String(fps), '-pattern_type', 'glob', '-i', path.join(framesDir, `*${ext}`)], info: { ...info, durationS: count / fps, fps, hasVideo: true } };
  }
  return { args: ['-i', ctx.source], info: ctx.info };
}

/* ---------------- transcode.mp4 ---------------- */
export async function transcodeMp4(ctx: HandlerContext): Promise<HandlerResult> {
  const p = (ctx.job.params ?? {}) as TranscodeMp4Params;
  const fps = clamp(p.fps, 1, 120, Math.round(ctx.info.fps || 30));
  const crf = clamp(p.crf, 10, 35, 18);
  const preset = PRESETS.has(p.preset ?? '') ? p.preset! : 'medium';
  const { args: vin, info } = await videoInput(ctx, fps);
  let audioFile: string | null = null;
  if (p.audioAssetId) audioFile = await ctx.fetchAsset(p.audioAssetId);
  else if (p.audioUrl) audioFile = await ctx.fetchUrl(p.audioUrl);
  const hasAudio = !!audioFile || info.hasAudio;
  const out = path.join(ctx.dir, `${(p.name || 'export').replace(/[^\w.-]+/g, '_')}.mp4`);
  const args = [
    ...vin, ...(audioFile ? ['-i', audioFile, '-map', '0:v:0', '-map', '1:a:0'] : []),
    '-vf', safeVf(fps), ...x264Args(crf, preset, fps),
    ...(hasAudio ? [...aacArgs(160), '-shortest'] : ['-an']),
    '-movflags', '+faststart', out
  ];
  await run(args, { cwd: ctx.dir, durationS: info.durationS, onProgress: ctx.progress });
  const outInfo = await probe(out);
  const up = await ctx.storage.putFile(out, keyFor(ctx.asset, ctx.job, path.basename(out)));
  return { renditions: [{ kind: 'mp4', url: up.url, storage_key: up.key, mime: 'video/mp4', bytes: up.bytes, width: outInfo.width, height: outInfo.height, bitrate_kbps: outInfo.bitrateKbps, codec: 'h264/aac', meta: { fps, crf, preset } }] };
}

/* ---------------- stream.hls / stream.dash ---------------- */
const DEFAULT_RUNGS: LadderRung[] = [
  { height: 1080, videoKbps: 5000, audioKbps: 160 },
  { height: 720, videoKbps: 2800, audioKbps: 128 },
  { height: 480, videoKbps: 1200, audioKbps: 96 },
  { height: 360, videoKbps: 700, audioKbps: 64 }
];

function pickRungs(p: StreamParams, srcHeight: number | null): LadderRung[] {
  const rungs = (p.rungs?.length ? p.rungs : DEFAULT_RUNGS).filter(r => r.height > 0 && r.videoKbps > 0).sort((a, b) => b.height - a.height);
  const fit = srcHeight ? rungs.filter(r => r.height <= srcHeight) : rungs;
  return fit.length ? fit : [rungs[rungs.length - 1]];
}

export async function streamHls(ctx: HandlerContext): Promise<HandlerResult> {
  const p = (ctx.job.params ?? {}) as StreamParams;
  const fps = clamp(p.fps, 1, 120, Math.round(ctx.info.fps || 30));
  const seg = clamp(p.segmentSeconds, 2, 10, 4);
  const { args: vin, info } = await videoInput(ctx, fps);
  const rungs = pickRungs(p, info.height);
  const outDir = path.join(ctx.dir, 'hls');
  await mkdir(outDir, { recursive: true });
  // One ffmpeg process, one decode, N encodes, var_stream_map → master.m3u8 + per-rung playlists.
  const filter = `[0:v]split=${rungs.length}${rungs.map((_, i) => `[v${i}]`).join('')};` + rungs.map((r, i) => `[v${i}]scale=-2:${r.height},fps=${fps},format=yuv420p[o${i}]`).join(';');
  const args: string[] = [...vin, '-filter_complex', filter];
  rungs.forEach((r, i) => {
    args.push('-map', `[o${i}]`, `-c:v:${i}`, 'libx264', `-b:v:${i}`, `${r.videoKbps}k`, `-maxrate:v:${i}`, `${Math.round(r.videoKbps * 1.07)}k`, `-bufsize:v:${i}`, `${r.videoKbps * 2}k`,
      `-preset:v:${i}`, 'medium', `-profile:v:${i}`, 'high', `-x264-params:v:${i}`, `keyint=${fps * seg}:min-keyint=${fps * seg}:scenecut=0`);
    if (info.hasAudio) args.push('-map', '0:a:0', `-c:a:${i}`, 'aac', `-b:a:${i}`, `${r.audioKbps ?? 128}k`, `-ac:a:${i}`, '2');
  });
  const vsm = rungs.map((r, i) => info.hasAudio ? `v:${i},a:${i},name:${r.height}p` : `v:${i},name:${r.height}p`).join(' ');
  args.push('-fps_mode', 'cfr', '-f', 'hls', '-hls_time', String(seg), '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
    '-hls_segment_type', 'mpegts', '-hls_segment_filename', path.join(outDir, '%v_%04d.ts'), '-master_pl_name', 'master.m3u8', '-var_stream_map', vsm, path.join(outDir, '%v.m3u8'));
  await run(args, { cwd: ctx.dir, durationS: info.durationS, onProgress: ctx.progress });
  const up = await ctx.storage.putDir(outDir, keyFor(ctx.asset, ctx.job, 'hls'), 'master.m3u8');
  return { renditions: [{ kind: 'hls', url: up.url, storage_key: up.key, mime: 'application/vnd.apple.mpegurl', bytes: up.bytes, height: rungs[0].height, width: null, codec: 'h264/aac', meta: { rungs, segmentSeconds: seg, fps } }] };
}

export async function streamDash(ctx: HandlerContext): Promise<HandlerResult> {
  const p = (ctx.job.params ?? {}) as StreamParams;
  const fps = clamp(p.fps, 1, 120, Math.round(ctx.info.fps || 30));
  const seg = clamp(p.segmentSeconds, 2, 10, 4);
  const { args: vin, info } = await videoInput(ctx, fps);
  const rungs = pickRungs(p, info.height);
  const enc = await encoders();
  const av1 = enc.has('libsvtav1') && enc.has('libopus');
  const outDir = path.join(ctx.dir, 'dash');
  await mkdir(outDir, { recursive: true });
  const filter = `[0:v]split=${rungs.length}${rungs.map((_, i) => `[v${i}]`).join('')};` + rungs.map((r, i) => `[v${i}]scale=-2:${r.height},fps=${fps},format=yuv420p[o${i}]`).join(';');
  const args: string[] = [...vin, '-filter_complex', filter];
  rungs.forEach((r, i) => {
    args.push('-map', `[o${i}]`);
    if (av1) args.push(`-c:v:${i}`, 'libsvtav1', `-crf:v:${i}`, String(30 + i * 2), `-preset:v:${i}`, '8', `-svtav1-params:v:${i}`, `keyint=${fps * seg}:tune=0`, `-b:v:${i}`, '0');
    else args.push(`-c:v:${i}`, 'libx264', `-b:v:${i}`, `${r.videoKbps}k`, `-preset:v:${i}`, 'medium', `-x264-params:v:${i}`, `keyint=${fps * seg}:min-keyint=${fps * seg}:scenecut=0`);
  });
  if (info.hasAudio) args.push('-map', '0:a:0', ...(av1 ? ['-c:a', 'libopus', '-b:a', '128k'] : ['-c:a', 'aac', '-b:a', '128k']), '-ac', '2');
  args.push('-fps_mode', 'cfr', '-f', 'dash', '-seg_duration', String(seg), '-use_template', '1', '-use_timeline', '1', '-adaptation_sets', info.hasAudio ? 'id=0,streams=v id=1,streams=a' : 'id=0,streams=v',
    '-init_seg_name', 'init_$RepresentationID$.m4s', '-media_seg_name', 'seg_$RepresentationID$_$Number%05d$.m4s', path.join(outDir, 'manifest.mpd'));
  await run(args, { cwd: ctx.dir, durationS: info.durationS, onProgress: ctx.progress });
  const up = await ctx.storage.putDir(outDir, keyFor(ctx.asset, ctx.job, 'dash'), 'manifest.mpd');
  return { renditions: [{ kind: 'dash', url: up.url, storage_key: up.key, mime: 'application/dash+xml', bytes: up.bytes, height: rungs[0].height, width: null, codec: av1 ? 'av1/opus' : 'h264/aac', meta: { rungs, segmentSeconds: seg, fps, av1 } }] };
}

/* ---------------- audio.master ---------------- */
export async function audioMaster(ctx: HandlerContext): Promise<HandlerResult> {
  const p = (ctx.job.params ?? {}) as AudioMasterParams;
  const lufs = clamp(p.targetLufs, -24, -8, -14);
  const tp = clamp(p.truePeakDb, -3, -0.1, -1);
  const formats = p.formats?.length ? p.formats : (['opus', 'aac', 'mp3'] as const);
  const enc = await encoders();
  // Pass 1: measure (R128). ffmpeg prints the measurement JSON on stderr.
  let measured: Record<string, string> | null = null;
  const { stderr } = await execFileP(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-nostdin', '-i', ctx.source, '-vn', '-af', `loudnorm=I=${lufs}:TP=${tp}:LRA=11:print_format=json`, '-f', 'null', '-'], { maxBuffer: 8 << 20 }).catch(e => ({ stderr: String(e.stderr || '') }));
  const m = /\{[\s\S]*?\}/.exec(stderr.slice(stderr.lastIndexOf('{') - 1));
  if (m) { try { measured = JSON.parse(m[0]); } catch { measured = null; } }
  const norm = measured && measured.input_i
    ? `loudnorm=I=${lufs}:TP=${tp}:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=summary`
    : `loudnorm=I=${lufs}:TP=${tp}:LRA=11`;
  ctx.progress(0.2);
  // Pass 2: one normalised 48 kHz float intermediate, then every format from it (one loudnorm, not three)
  const master = path.join(ctx.dir, 'master.wav');
  await run(['-i', ctx.source, '-vn', '-af', `${norm},aresample=48000:resampler=soxr`, '-c:a', 'pcm_f32le', master], { cwd: ctx.dir, timeoutMs: 10 * 60 * 1000 });
  ctx.progress(0.5);
  const outs: RenditionOut[] = [];
  const stem = (ctx.asset.meta?.name as string | undefined)?.replace(/[^\w.-]+/g, '_') || 'master';
  const jobsOut: Array<[RenditionKind, string, string[]]> = [];
  if (formats.includes('opus') && enc.has('libopus')) jobsOut.push(['opus', `${stem}.opus`, ['-c:a', 'libopus', '-b:a', '128k', '-vbr', 'on', '-application', 'audio']]);
  if (formats.includes('aac')) jobsOut.push(['aac', `${stem}.m4a`, ['-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart']]);
  if (formats.includes('mp3') && enc.has('libmp3lame')) jobsOut.push(['mp3', `${stem}.mp3`, ['-c:a', 'libmp3lame', '-q:a', '2']]);
  for (const [i, [kind, file, args]] of jobsOut.entries()) {
    const out = path.join(ctx.dir, file);
    await run(['-i', master, ...args, out], { cwd: ctx.dir });
    const up = await ctx.storage.putFile(out, keyFor(ctx.asset, ctx.job, file));
    const info = await probe(out);
    outs.push({ kind, url: up.url, storage_key: up.key, mime: mimeFor(file), bytes: up.bytes, bitrate_kbps: info.bitrateKbps, codec: kind, meta: { lufs, truePeakDb: tp, measured } });
    ctx.progress(0.5 + 0.4 * ((i + 1) / jobsOut.length));
  }
  const points = p.peaks === 0 ? 0 : clamp(p.peaks, 64, 8192, 1024);
  if (points) {
    const mono = await decodeMono(master, 8000);
    const peaksFile = path.join(ctx.dir, 'peaks.json');
    await writeFile(peaksFile, JSON.stringify({ points, ...waveformPeaks(mono, points) }));
    const up = await ctx.storage.putFile(peaksFile, keyFor(ctx.asset, ctx.job, 'peaks.json'), 'application/json');
    outs.push({ kind: 'peaks', url: up.url, storage_key: up.key, mime: 'application/json', bytes: up.bytes, meta: { points } });
  }
  return { renditions: outs, result: { lufs, measured } };
}

/* ---------------- analyze.audio ---------------- */
export async function analyzeAudio(ctx: HandlerContext): Promise<HandlerResult> {
  const p = (ctx.job.params ?? {}) as AnalyzeAudioParams;
  const fps = clamp(p.fps, 10, 120, 60);
  const mono = await decodeMono(ctx.source, ANALYSIS_SAMPLE_RATE);
  ctx.progress(0.4);
  const a = analysePcm(mono, ANALYSIS_SAMPLE_RATE, fps);
  return { renditions: [], analysis: analysisToRow(a), result: { analysis: { fps, frameCount: a.frameCount, bpm: a.bpm, beats: a.beats.length } } };
}

/* ---------------- video.thumbnail ---------------- */
export async function videoThumbnail(ctx: HandlerContext): Promise<HandlerResult> {
  const p = (ctx.job.params ?? {}) as ThumbnailParams;
  const width = clamp(p.width, 64, 3840, 640);
  const { args: vin, info } = await videoInput(ctx, Math.round(ctx.info.fps || 30));
  const at = p.atSeconds != null ? Math.max(0, Math.min(info.durationS, p.atSeconds)) : info.durationS * 0.1;
  const out = path.join(ctx.dir, 'poster.jpg');
  await run([...(ctx.asset.kind === 'frames' ? [] : ['-ss', at.toFixed(3)]), ...vin, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '3', out], { cwd: ctx.dir });
  const up = await ctx.storage.putFile(out, keyFor(ctx.asset, ctx.job, 'poster.jpg'), 'image/jpeg');
  const oi = await probe(out);
  return { renditions: [{ kind: 'thumbnail', url: up.url, storage_key: up.key, mime: 'image/jpeg', bytes: up.bytes, width: oi.width, height: oi.height, meta: { atSeconds: at } }] };
}

export const HANDLERS: Record<string, (ctx: HandlerContext) => Promise<HandlerResult>> = {
  'transcode.mp4': transcodeMp4,
  'stream.hls': streamHls,
  'stream.dash': streamDash,
  'audio.master': audioMaster,
  'analyze.audio': analyzeAudio,
  'video.thumbnail': videoThumbnail
};

export async function readJson<T>(file: string): Promise<T> { return JSON.parse(await readFile(file, 'utf8')) as T; }
