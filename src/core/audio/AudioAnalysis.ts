/**
 * Browser side of audio analysis for Sonic Design. The math (FFT, bands, spectrum, onsets, beats,
 * BPM, keyframe baking) lives in the shared V12 media package (`@v12/media/analyze`) so the
 * worker's `analyze.audio` job and this in-browser path produce identical numbers.
 *
 * This file only adds what needs a browser: decoding via AudioContext, per-URL memoisation, and the
 * live microphone analyser.
 */
import { AudioAnalysis, BAND_COUNT, FFT_SIZE, SPECTRUM_BINS, analysePcm, binTables } from '@v12/media/analyze';

export { BAND_COUNT, BAND_NAMES, SPECTRUM_BINS, bandAt, rmsAt, spectrumAt, beatPulseAt, bakeKeyframes } from '@v12/media/analyze';
export type { AudioAnalysis, BakeOptions } from '@v12/media/analyze';

const cache = new Map<string, Promise<AudioAnalysis>>();
const settled = new Map<string, AudioAnalysis>();

/** Analyse an audio URL (blob: or http) once; results are memoised per URL. */
export function analyseAudio(src: string, fps = 60): Promise<AudioAnalysis> {
  const key = `${src}@${fps}`;
  let p = cache.get(key);
  if (!p) {
    p = analyseUncached(src, fps).catch((err) => { cache.delete(key); throw err; });
    cache.set(key, p);
  }
  return p;
}

export function getAnalysisSync(src: string, fps = 60): AudioAnalysis | null {
  return settled.get(`${src}@${fps}`) || null;
}

async function analyseUncached(src: string, fps: number): Promise<AudioAnalysis> {
  const res = await fetch(src);
  const buf = await res.arrayBuffer();
  const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  const ctx = new Ctx();
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(buf.slice(0));
  } finally {
    void ctx.close();
  }
  const analysis = analyseBuffer(audio, fps);
  settled.set(`${src}@${fps}`, analysis);
  return analysis;
}

/** Mix to mono without allocating per channel copies more than once. */
function toMono(audio: AudioBuffer): Float32Array {
  const n = audio.length;
  const out = new Float32Array(n);
  const ch = audio.numberOfChannels;
  for (let c = 0; c < ch; c++) {
    const data = audio.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i] / ch;
  }
  return out;
}

export function analyseBuffer(audio: AudioBuffer, fps = 60): AudioAnalysis {
  return analysePcm(toMono(audio), audio.sampleRate, fps);
}

/* ------------------------------------------------------------------ */
/* Live microphone analyser (preview only)                             */
/* ------------------------------------------------------------------ */

export class LiveAnalyser {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private freq: Uint8Array = new Uint8Array(FFT_SIZE / 2);
  readonly bands = new Float32Array(BAND_COUNT);
  readonly spectrum = new Float32Array(SPECTRUM_BINS);
  private specEdges: number[] = [];
  private bandBins: number[] = [];
  rms = 0;

  async start(): Promise<void> {
    if (this.ctx) return;
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    this.ctx = new Ctx();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0.6;
    this.source.connect(this.analyser);
    const t = binTables(this.ctx.sampleRate);
    this.bandBins = t.bandBins;
    this.specEdges = t.specEdges;
  }

  /** Update bands/spectrum/rms in place. Zero allocations. */
  update(): void {
    if (!this.analyser) return;
    this.analyser.getByteFrequencyData(this.freq);
    let total = 0;
    for (let b = 0; b < BAND_COUNT; b++) {
      let sum = 0;
      const lo = this.bandBins[b], hi = this.bandBins[b + 1];
      for (let k = lo; k < hi; k++) sum += this.freq[k];
      this.bands[b] = sum / Math.max(1, hi - lo) / 255;
    }
    for (let s = 0; s < SPECTRUM_BINS; s++) {
      let sum = 0;
      const lo = this.specEdges[s], hi = Math.max(lo + 1, this.specEdges[s + 1]);
      for (let k = lo; k < hi; k++) sum += this.freq[k];
      this.spectrum[s] = sum / (hi - lo) / 255;
    }
    for (let k = 0; k < this.freq.length; k++) total += this.freq[k];
    this.rms = total / this.freq.length / 255;
  }

  stop(): void {
    this.source?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    void this.ctx?.close();
    this.ctx = null; this.analyser = null; this.stream = null; this.source = null;
  }

  get active(): boolean { return !!this.analyser; }
}
