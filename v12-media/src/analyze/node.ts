/** Node side of the analyser: decode any audio/video file with ffmpeg to mono Float32 PCM, then run the shared core. */
import { run } from '../worker/ffmpeg.js';
import { AudioAnalysis, analysePcm } from './core.js';

export const ANALYSIS_SAMPLE_RATE = 44100;

export async function decodeMono(file: string, sampleRate = ANALYSIS_SAMPLE_RATE): Promise<Float32Array> {
  const chunks: Buffer[] = [];
  await run(['-i', file, '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1'],
    { stdout: c => chunks.push(c), timeoutMs: 10 * 60 * 1000 });
  const buf = Buffer.concat(chunks);
  const aligned = buf.byteLength - (buf.byteLength % 4);
  const out = new Float32Array(aligned / 4);
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

export async function analyseFile(file: string, fps = 60): Promise<AudioAnalysis> {
  const mono = await decodeMono(file);
  return analysePcm(mono, ANALYSIS_SAMPLE_RATE, fps);
}

/** Waveform peaks for UI (min/max per bucket, -1..1), as the DAW/stream players expect. */
export function waveformPeaks(mono: Float32Array, points = 1024): { min: number[]; max: number[] } {
  const min: number[] = [], max: number[] = [];
  const per = Math.max(1, Math.floor(mono.length / points));
  for (let p = 0; p < points; p++) {
    let lo = 0, hi = 0;
    const s = p * per, e = Math.min(mono.length, s + per);
    for (let i = s; i < e; i++) { const v = mono[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    min.push(Math.round(lo * 1000) / 1000); max.push(Math.round(hi * 1000) / 1000);
  }
  return { min, max };
}
