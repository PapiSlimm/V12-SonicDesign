/**
 * Offline + live audio analysis for audio-reactive layers and audio → keyframe baking.
 *
 * Offline analysis (primary): the whole clip is decoded once with an AudioContext, then an FFT
 * is run per frame (default 60 fps) and reduced to 4 band energies. Lookups by time are O(1)
 * and deterministic, so playback, scrubbing and the frame-by-frame exporter all see identical
 * values — a live AnalyserNode can't give you that.
 *
 * Live analysis (microphone preview): AnalyserNode wrapper with preallocated buffers, no
 * per-frame allocations.
 */

export const BAND_COUNT = 4;
export const BAND_NAMES = ['Sub-bass', 'Bass', 'Mids', 'Highs'] as const;
/** Hz boundaries: [sub 20–60] [bass 60–250] [mids 250–4k] [highs 4k–16k] */
const BAND_EDGES_HZ = [20, 60, 250, 4000, 16000];

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

export const SPECTRUM_BINS = 64;
const FFT_SIZE = 2048;

const cache = new Map<string, Promise<AudioAnalysis>>();

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

const settled = new Map<string, AudioAnalysis>();
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

/** In-place iterative radix-2 FFT (real input, magnitude output). */
function fftMagnitudes(re: Float32Array, im: Float32Array, out: Float32Array) {
  const n = re.length;
  // bit reversal
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

export function analyseBuffer(audio: AudioBuffer, fps = 60): AudioAnalysis {
  const sr = audio.sampleRate;
  const mono = toMono(audio);
  const duration = audio.duration;
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

  const hzPerBin = sr / FFT_SIZE;
  const bandBins = BAND_EDGES_HZ.map(hz => Math.min(FFT_SIZE / 2 - 1, Math.max(1, Math.round(hz / hzPerBin))));
  // log-spaced spectrum bins 30Hz..16kHz
  const specEdges: number[] = [];
  for (let i = 0; i <= SPECTRUM_BINS; i++) {
    const hz = 30 * Math.pow(16000 / 30, i / SPECTRUM_BINS);
    specEdges.push(Math.min(FFT_SIZE / 2 - 1, Math.max(1, Math.round(hz / hzPerBin))));
  }

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
    // spectral flux (positive differences only) → onset strength
    let flux = 0;
    for (let k = 1; k < mag.length; k++) { const d = mag[k] - prevMag[k]; if (d > 0) flux += d; }
    onset[f] = flux;
    maxOnset = Math.max(maxOnset, flux);
    prevMag.set(mag);
  }

  // normalise with soft knee so quiet tracks still move
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
function detectBeats(onset: Float32Array, fps: number): number[] {
  const beats: number[] = [];
  const win = Math.round(fps * 0.5); // 0.5 s local window
  const minGap = Math.round(fps * 0.25); // max ~240 bpm
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

function estimateBpm(beats: number[]): number {
  if (beats.length < 4) return 0;
  const intervals: number[] = [];
  for (let i = 1; i < beats.length; i++) intervals.push(beats[i] - beats[i - 1]);
  intervals.sort((a, b) => a - b);
  let median = intervals[Math.floor(intervals.length / 2)];
  // fold into 70–180 BPM range
  while (60 / median < 70) median /= 2;
  while (60 / median > 180) median *= 2;
  return Math.round(60 / median);
}

/** Band energy at a time, with linear interpolation between frames. */
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
export function spectrumAt(a: AudioAnalysis, time: number, out: Float32Array) {
  const i = Math.max(0, Math.min(a.frameCount - 1, Math.round(time * a.fps)));
  out.set(a.spectrum.subarray(i * SPECTRUM_BINS, (i + 1) * SPECTRUM_BINS));
}

/** 0..1 pulse that decays over `decaySec` after each beat. */
export function beatPulseAt(a: AudioAnalysis, time: number, decaySec = 0.25): number {
  // binary search last beat <= time
  let lo = 0, hi = a.beats.length - 1, idx = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (a.beats[mid] <= time) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
  if (idx < 0) return 0;
  const dt = time - a.beats[idx];
  return dt < decaySec ? 1 - dt / decaySec : 0;
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
    const hzPerBin = this.ctx.sampleRate / FFT_SIZE;
    this.bandBins = BAND_EDGES_HZ.map(hz => Math.min(FFT_SIZE / 2 - 1, Math.max(1, Math.round(hz / hzPerBin))));
    this.specEdges = [];
    for (let i = 0; i <= SPECTRUM_BINS; i++) {
      const hz = 30 * Math.pow(16000 / 30, i / SPECTRUM_BINS);
      this.specEdges.push(Math.min(FFT_SIZE / 2 - 1, Math.max(1, Math.round(hz / hzPerBin))));
    }
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

/* ------------------------------------------------------------------ */
/* Audio → keyframes baking                                            */
/* ------------------------------------------------------------------ */

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
  /** Beat-pulse decay in seconds when source === 'beat' */
  decay?: number;
}

export function bakeKeyframes(a: AudioAnalysis, o: BakeOptions): { time: number; value: number; easing: 'linear' }[] {
  const out: { time: number; value: number; easing: 'linear' }[] = [];
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
