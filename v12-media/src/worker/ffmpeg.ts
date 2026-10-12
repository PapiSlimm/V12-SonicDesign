/** Thin, safe wrappers around ffmpeg/ffprobe. One child process per job; no shell. */
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

export interface ProbeInfo {
  durationS: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  sampleRate: number | null;
  channels: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  bitrateKbps: number | null;
}

export async function probe(file: string): Promise<ProbeInfo> {
  const { stdout } = await execFileP(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { maxBuffer: 4 << 20 });
  const j = JSON.parse(stdout) as { format?: { duration?: string; bit_rate?: string }; streams?: Array<Record<string, string>> };
  const v = j.streams?.find(s => s.codec_type === 'video' && !/png|mjpeg/.test(s.codec_name ?? '') || (s.codec_type === 'video' && (j.streams?.length ?? 0) === 1));
  const a = j.streams?.find(s => s.codec_type === 'audio');
  const fpsOf = (r?: string) => { if (!r) return null; const [n, d] = r.split('/').map(Number); return d ? n / d : n || null; };
  return {
    durationS: Number(j.format?.duration ?? v?.duration ?? a?.duration ?? 0) || 0,
    width: v ? Number(v.width) || null : null,
    height: v ? Number(v.height) || null : null,
    fps: v ? fpsOf(v.avg_frame_rate) || fpsOf(v.r_frame_rate) : null,
    hasVideo: !!v, hasAudio: !!a,
    sampleRate: a ? Number(a.sample_rate) || null : null,
    channels: a ? Number(a.channels) || null : null,
    videoCodec: v?.codec_name ?? null, audioCodec: a?.codec_name ?? null,
    bitrateKbps: j.format?.bit_rate ? Math.round(Number(j.format.bit_rate) / 1000) : null
  };
}

let encoderCache: Set<string> | null = null;
/** Which encoders this ffmpeg build has (libsvtav1, libx264, libopus, aac, libmp3lame…). */
export async function encoders(): Promise<Set<string>> {
  if (encoderCache) return encoderCache;
  try {
    const { stdout } = await execFileP(FFMPEG, ['-hide_banner', '-encoders']);
    encoderCache = new Set(stdout.split('\n').map(l => l.trim().split(/\s+/)[1]).filter(Boolean));
  } catch { encoderCache = new Set(); }
  return encoderCache;
}

export async function ffmpegVersion(): Promise<string | null> {
  try { return (await execFileP(FFMPEG, ['-version'])).stdout.split('\n')[0]; } catch { return null; }
}

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  /** total duration in seconds — enables progress callbacks via -progress pipe */
  durationS?: number;
  onProgress?: (fraction: number) => void;
  /** feed raw PCM out on stdout (used by the analyser) */
  stdout?: (chunk: Buffer) => void;
}

/** Run ffmpeg with args. Rejects with the last stderr lines on non-zero exit. Hard-kills on timeout. */
export function run(args: string[], opts: RunOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const full = ['-hide_banner', '-nostdin', '-y', ...(opts.onProgress ? ['-progress', 'pipe:2', '-nostats'] : []), ...args];
    const proc = spawn(FFMPEG, full, { cwd: opts.cwd, stdio: ['ignore', opts.stdout ? 'pipe' : 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error(`ffmpeg timed out after ${opts.timeoutMs} ms`)); }, opts.timeoutMs ?? 20 * 60 * 1000);
    if (opts.stdout) proc.stdout!.on('data', opts.stdout);
    proc.stderr!.on('data', (d: Buffer) => {
      const s = d.toString();
      stderr += s; if (stderr.length > 65536) stderr = stderr.slice(-32768);
      if (opts.onProgress && opts.durationS) {
        const m = /out_time_ms=(\d+)/g; let last: RegExpExecArray | null = null, mm: RegExpExecArray | null;
        while ((mm = m.exec(s))) last = mm;
        if (last) opts.onProgress(Math.min(0.999, Number(last[1]) / 1e6 / opts.durationS));
      }
    });
    proc.on('error', err => { clearTimeout(timer); reject(err); });
    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.split('\n').filter(l => !/^(frame|fps|bitrate|total_size|out_time|dup_frames|drop_frames|speed|progress|stream_)/.test(l)).slice(-6).join(' | ')}`));
    });
  });
}

/** Video filter that forces even dimensions + yuv420p (every phone/browser decodes it). */
export const safeVf = (fps: number, height?: number) =>
  `${height ? `scale=-2:${height},` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2,'}fps=${fps},format=yuv420p`;

export const x264Args = (crf: number, preset: string, fps: number, gopSeconds = 2) => [
  '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
  '-x264-params', `keyint=${Math.round(fps * gopSeconds)}:min-keyint=${Math.round(fps * gopSeconds)}:scenecut=0`, '-fps_mode', 'cfr'
];

export const aacArgs = (kbps = 160) => ['-c:a', 'aac', '-b:a', `${kbps}k`, '-ac', '2', '-ar', '48000', '-af', 'aresample=async=1:first_pts=0'];
