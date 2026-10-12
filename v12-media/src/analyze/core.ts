/**
 * Audio analysis core — pure math, no DOM, no Node APIs. Runs identically in the browser
 * (SonicDesign visualizer / keyframe baking) and in the worker (`analyze.audio` jobs), so every
 * V12 app sees the same band energies, spectrum, onsets, beats and BPM for the same file.
 *
 * Input: mono PCM Float32 in -1..1 at any sample rate. Output: per-frame typed arrays.
 */

export const ANALYSIS_VERSION = 1;
export const BAND_COUNT = 4;
export const BAND_NAMES = ['Sub-bass', 'Bass', 'Mids', 'Highs'] as const;
/** Hz boundaries: [sub 20–60] [bass 60–250] [mids 250–4k] [highs 4k–16k] */
export const BAND_EDGES_HZ = [20, 60, 250, 4000, 16000];
export const SPECTRUM_BINS = 64;
export const FFT_SIZE = 2048;

export interface AudioAnalysis {
  fps: number;
  frameCount: number;
  duration: number;
  /** Row-major: bands[frame * BAND_COUNT + band] in 0..1 */
  bands: Float32Array;
  /** Per-frame RMS loudness 0..1 */
  rms: Float32Array;
  /** Per-frame onset strength 0..1 (spectral-flux based) — peaks are beats */
  onset: Float32Array;
  /** Coarse spectrum per frame (SPECTRUM_BINS log-spaced bins, 0..1) for bar visualizers */
  spectrum: Float32Array;
  /** Detected beat times in seconds */
  beats: number[];
  /** Estimated tempo in BPM (0 if unknown) */
  bpm: number;
}

/** Bin index table for a sample rate (shared by offline and live analysers). */
export function binTables(sampleRate: number): { bandBins: number[]; specEdges: number[] } {
  const hzPerBin = sampleRate / FFT_SIZE;
  const clamp = (hz: number) => Math.min(FFT_SIZE / 2 - 1, Math.max(1, Math.round(hz / hzPerBin)));
  const bandBins = BAND_EDGES_HZ.map(clamp);
  const specEdges: number[] = [];
  for (let i = 0; i <= SPECTRUM_BINS; i++) specEdges.push(clamp(30 * Math.pow(16000 / 30, i / SPECTRUM_BINS)));
  return { bandBins, specEdges };
}

/** In-place iterative radix-2 FFT (real input, magnitude output). */
export function fftMagnitudes(re: Float32Array, im: Float32Array, out: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = i + j + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  const half = n / 2;
  for (let i = 0; i < half; i++) out[i] = Math.hypot(re[i], im[i]) / half;
}

/** Analyse mono PCM. `fps` = analysis frames per second (60 matches a 60 fps timeline). */
export function analysePcm(mono: Float32Array, sampleRate: number, fps = 60): AudioAnalysis {
  const sr = sampleRate;
  const duration = mono.length / sr;
  const frameCount = Math.max(1, Math.ceil(duration * fps));
  const bands = new Float32Array(frameCount * BAND_COUNT);
  const rms = new Float32Array(frameCount);
  const onset = new Float32Array(frameCount);
  const spectrum = new Float32Array(frameCount * SPECTRUM_BINS);

  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const mag = new Float32Array(FFT_SIZE / 2);
  const prevMag = new Float32Array(FFT_SIZE / 2);
  const window = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)); // Hann
  const { bandBins, specEdges } = binTables(sr);

  let maxBand = 1e-6, maxRms = 1e-6, maxOnset = 1e-6, maxSpec = 1e-6;

  for (let f = 0; f < frameCount; f++) {
    const center = Math.floor((f / fps) * sr);
    const start = center - FFT_SIZE / 2;
    let sumSq = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = start + i;
      const v = idx >= 0 && idx < mono.length ? mono[idx] : 0;
      re[i] = v * window[i];
      im[i] = 0;
      sumSq += v * v;
    }
    rms[f] = Math.sqrt(sumSq / FFT_SIZE);
    maxRms = Math.max(maxRms, rms[f]);
    fftMagnitudes(re, im, mag);

    for (let b = 0; b < BAND_COUNT; b++) {
      let sum = 0;
      const lo = bandBins[b], hi = bandBins[b + 1];
      for (let k = lo; k < hi; k++) sum += mag[k];
      const e = sum / Math.max(1, hi - lo);
      bands[f * BAND_COUNT + b] = e;
      maxBand = Math.max(maxBand, e);
    }
    for (let s = 0; s < SPECTRUM_BINS; s++) {
      let sum = 0;
      const lo = specEdges[s], hi = Math.max(lo + 1, specEdges[s + 1]);
      for (let k = lo; k < hi; k++) sum += mag[k];
      const e = sum / (hi - lo);
      spectrum[f * SPECTRUM_BINS + s] = e;
      maxSpec = Math.max(maxSpec, e);
    }
    let flux = 0;
    for (let k = 1; k < mag.length; k++) { const d = mag[k] - prevMag[k]; if (d > 0) flux += d; }
    onset[f] = flux;
    maxOnset = Math.max(maxOnset, flux);
    prevMag.set(mag);
  }

  const norm = (arr: Float32Array, max: number, gamma = 0.6) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.pow(Math.min(1, arr[i] / max), gamma); };
  norm(bands, maxBand);
  norm(rms, maxRms, 0.8);
  norm(spectrum, maxSpec);
  norm(onset, maxOnset, 1);

  const beats = detectBeats(onset, fps);
  const bpm = estimateBpm(beats);
  return { fps, frameCount, duration, bands, rms, onset, spectrum, beats, bpm };
}

/** Adaptive-threshold peak picking on the onset envelope. */
export function detectBeats(onset: Float32Array, fps: number): number[] {
  const beats: number[] = [];
  const win = Math.round(fps * 0.5);
  const minGap = Math.round(fps * 0.25);
  let last = -minGap;
  for (let i = 1; i < onset.length - 1; i++) {
    let mean = 0, n = 0;
    for (let k = Math.max(0, i - win); k < Math.min(onset.length, i + win); k++) { mean += onset[k]; n++; }
    mean /= Math.max(1, n);
    const threshold = mean * 1.5 + 0.05;
    if (onset[i] > threshold && onset[i] >= onset[i - 1] && onset[i] >= onset[i + 1] && i - last >= minGap) {
      beats.push(i / fps);
      last = i;
    }
  }
  return beats;
}

export function estimateBpm(beats: number[]): number {
  if (beats.length < 4) return 0;
  const intervals: number[] = [];
  for (let i = 1; i < beats.length; i++) intervals.push(beats[i] - beats[i - 1]);
  intervals.sort((a, b) => a - b);
  let median = intervals[Math.floor(intervals.length / 2)];
  while (60 / median < 70) median /= 2;
  while (60 / median > 180) median *= 2;
  return Math.round(60 / median);
}

/* ---------------- O(1) lookups ---------------- */

export function bandAt(a: AudioAnalysis, time: number, band: number): number {
  const pos = Math.max(0, Math.min(a.frameCount - 1, time * a.fps));
  const i = Math.floor(pos), t = pos - i, j = Math.min(a.frameCount - 1, i + 1);
  return a.bands[i * BAND_COUNT + band] * (1 - t) + a.bands[j * BAND_COUNT + band] * t;
}

export function rmsAt(a: AudioAnalysis, time: number): number {
  const i = Math.max(0, Math.min(a.frameCount - 1, Math.round(time * a.fps)));
  return a.rms[i];
}

/** Copies the SPECTRUM_BINS spectrum for `time` into `out` (no allocation). */
export function spectrumAt(a: AudioAnalysis, time: number, out: Float32Array): void {
  const i = Math.max(0, Math.min(a.frameCount - 1, Math.round(time * a.fps)));
  out.set(a.spectrum.subarray(i * SPECTRUM_BINS, (i + 1) * SPECTRUM_BINS));
}

/** 0..1 pulse that decays over `decaySec` after each beat. */
export function beatPulseAt(a: AudioAnalysis, time: number, decaySec = 0.25): number {
  let lo = 0, hi = a.beats.length - 1, idx = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (a.beats[mid] <= time) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
  if (idx < 0) return 0;
  const dt = time - a.beats[idx];
  return dt < decaySec ? 1 - dt / decaySec : 0;
}

/* ---------------- Audio → keyframes ---------------- */

export interface BakeOptions {
  property: 'scaleX' | 'scaleY' | 'opacity' | 'rotation' | 'x' | 'y';
  /** Which signal: band index 0-3, 'rms', or 'beat' */
  source: 0 | 1 | 2 | 3 | 'rms' | 'beat';
  base: number;
  amount: number;
  /** keyframes per second written (lower = lighter project, 12–30 typical) */
  rate: number;
  startTime: number;
  endTime: number;
  decay?: number;
}

export interface BakedKeyframe { time: number; value: number; easing: 'linear' }

export function bakeKeyframes(a: AudioAnalysis, o: BakeOptions): BakedKeyframe[] {
  const out: BakedKeyframe[] = [];
  const step = 1 / Math.max(1, o.rate);
  const end = Math.min(o.endTime, a.duration + o.startTime);
  for (let t = o.startTime; t <= end + 1e-6; t += step) {
    const local = t - o.startTime;
    let v: number;
    if (o.source === 'rms') v = rmsAt(a, local);
    else if (o.source === 'beat') v = beatPulseAt(a, local, o.decay ?? 0.25);
    else v = bandAt(a, local, o.source);
    out.push({ time: Math.round(t * 1000) / 1000, value: Math.round((o.base + v * o.amount) * 1000) / 1000, easing: 'linear' });
  }
  return out;
}

/* ---------------- (de)serialisation for the DB row / JSON transport ---------------- */

export interface AnalysisRow {
  version: number; fps: number; frame_count: number; duration_s: number; bpm: number; beats: number[];
  bands: Uint8Array; rms: Uint8Array; onset: Uint8Array; spectrum: Uint8Array;
}

function f32ToBytes(a: Float32Array): Uint8Array { return new Uint8Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength)); }
function bytesToF32(b: Uint8Array): Float32Array { const c = new Uint8Array(b); return new Float32Array(c.buffer, 0, c.byteLength >> 2); }

export function analysisToRow(a: AudioAnalysis): AnalysisRow {
  return { version: ANALYSIS_VERSION, fps: a.fps, frame_count: a.frameCount, duration_s: a.duration, bpm: a.bpm, beats: a.beats,
    bands: f32ToBytes(a.bands), rms: f32ToBytes(a.rms), onset: f32ToBytes(a.onset), spectrum: f32ToBytes(a.spectrum) };
}

export function rowToAnalysis(r: AnalysisRow): AudioAnalysis {
  return { fps: r.fps, frameCount: r.frame_count, duration: r.duration_s, bpm: r.bpm, beats: Array.from(r.beats),
    bands: bytesToF32(r.bands), rms: bytesToF32(r.rms), onset: bytesToF32(r.onset), spectrum: bytesToF32(r.spectrum) };
}
