/**
 * WebGL2 audio-reactive visualizer (shared by every V12 app). No Three.js — one fullscreen triangle,
 * one fragment shader, five styles selected by a uniform. The spectrum is uploaded as a 64x1 R8
 * texture (one texSubImage2D per frame, no allocations), band energies as a vec4 uniform.
 *
 * Deterministic: pass a time and a signal sampled from the offline analysis and the renderer draws
 * that exact frame, so exports match playback. Browser-only module (needs a DOM canvas).
 */
import { AudioAnalysis, SPECTRUM_BINS, bandAt, beatPulseAt, rmsAt, spectrumAt } from '../analyze/core.js';

export type VisualizerStyle = 'bars' | 'ring' | 'wave' | 'blob' | 'grid';
export const VisualizerStyleIndex: Record<VisualizerStyle, number> = { bars: 0, ring: 1, wave: 2, blob: 3, grid: 4 };

/** Rendering settings (apps may extend this with their own source/mic fields). */
export interface VisualizerSettings {
  style: VisualizerStyle;
  primaryColor: string;
  secondaryColor: string;
  /** 0.1..4 — multiplies the drive band energy */
  sensitivity: number;
  /** 0..0.95 temporal smoothing */
  smoothing: number;
  /** bars / spokes / cells (4..128) */
  detail: number;
  mirror: boolean;
  transparent: boolean;
  /** which band drives size/intensity: 0 sub, 1 bass, 2 mids, 3 highs */
  driveBand: number;
}

export const DEFAULT_VISUALIZER: VisualizerSettings = {
  style: 'bars', primaryColor: '#3b82f6', secondaryColor: '#a855f7', sensitivity: 1.2, smoothing: 0.6,
  detail: 48, mirror: true, transparent: true, driveBand: 1
};

const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  // fullscreen triangle: ids 0,1,2 → covers clip space without a vertex buffer
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSpectrum;   // 64x1, R channel 0..1
uniform vec4  uBands;          // sub, bass, mid, high (0..1, smoothed)
uniform float uRms;
uniform float uBeat;           // 0..1 pulse
uniform float uTime;
uniform float uDrive;          // selected band energy * sensitivity
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform float uDetail;         // bars / spokes / cells
uniform float uMirror;         // 0/1
uniform float uTransparent;    // 0/1
uniform float uAspect;
uniform int   uStyle;          // 0 bars, 1 ring, 2 wave, 3 blob, 4 grid

float spec(float x) { // x in 0..1 across spectrum, with optional mirroring
  float u = uMirror > 0.5 ? abs(x * 2.0 - 1.0) : x;
  return texture(uSpectrum, vec2(u * (1.0 - 1.0/64.0) + 0.5/64.0, 0.5)).r;
}

vec3 palette(float t) { return mix(uColorA, uColorB, clamp(t, 0.0, 1.0)); }

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  float a = 0.0;
  vec3 col = uColorA;

  if (uStyle == 0) { // BARS
    float n = max(4.0, uDetail);
    float cell = floor(uv.x * n) / n;
    float gap = smoothstep(0.0, 0.12, fract(uv.x * n)) * smoothstep(1.0, 0.88, fract(uv.x * n));
    float h = spec(cell + 0.5 / n) * (0.35 + uDrive * 0.9);
    float bar = step(uv.y, h) * gap;
    float cap = smoothstep(h - 0.012, h, uv.y) * step(uv.y, h + 0.004) * gap;
    a = max(bar * 0.85, cap);
    col = palette(uv.y / max(h, 0.001)) + cap * 0.6;
  } else if (uStyle == 1) { // RING
    float r = length(p);
    float ang = atan(p.y, p.x) / 6.28318 + 0.5;
    float n = max(8.0, uDetail);
    float spoke = floor(ang * n) / n;
    float e = spec(spoke + 0.5 / n);
    float inner = 0.16 + uDrive * 0.08 + uBeat * 0.03;
    float outer = inner + 0.04 + e * (0.18 + uDrive * 0.25);
    float ringMask = smoothstep(inner - 0.004, inner, r) * (1.0 - smoothstep(outer, outer + 0.004, r));
    float gap = smoothstep(0.0, 0.08, fract(ang * n)) * smoothstep(1.0, 0.92, fract(ang * n));
    float core = 1.0 - smoothstep(inner - 0.03, inner - 0.002, r);
    a = max(ringMask * gap, core * (0.25 + uBeat * 0.5));
    col = mix(palette(e), uColorB, core);
  } else if (uStyle == 2) { // WAVE
    float x = uv.x;
    float e = spec(x);
    float y = 0.5 + (e - 0.5 * uRms) * (0.25 + uDrive * 0.35) * sin(x * 24.0 + uTime * 3.0) + (e - 0.3) * 0.25 * uDrive;
    float d = abs(uv.y - y);
    float thick = 0.006 + e * 0.02;
    a = 1.0 - smoothstep(thick, thick + 0.01, d);
    float glow = exp(-d * 18.0) * 0.5;
    a = max(a, glow);
    col = palette(e);
  } else if (uStyle == 3) { // BLOB (metaball-ish deformed disc)
    float r = length(p);
    float ang = atan(p.y, p.x);
    float deform = 0.0;
    for (int i = 1; i <= 6; i++) {
      float fi = float(i);
      deform += spec(fi / 7.0) * sin(ang * fi * 1.0 + uTime * (0.6 + fi * 0.15)) / fi;
    }
    float radius = 0.18 + uDrive * 0.14 + uBeat * 0.05 + deform * (0.08 + uDrive * 0.12);
    float edge = 1.0 - smoothstep(radius - 0.006, radius + 0.006, r);
    float rim = smoothstep(radius - 0.03, radius, r) * edge;
    a = max(edge * 0.9, rim);
    col = mix(palette(r / max(radius, 0.001)), uColorB, rim);
  } else { // GRID (equalizer cells)
    float n = max(4.0, uDetail);
    vec2 cell = floor(uv * vec2(n, n * 0.5625)); // 16:9 cells
    float cx = cell.x / n;
    float e = spec(cx + 0.5 / n);
    float rows = n * 0.5625;
    float lit = step(cell.y / rows, e * (0.5 + uDrive * 0.7));
    vec2 f = fract(uv * vec2(n, rows));
    float pad = smoothstep(0.0, 0.15, f.x) * smoothstep(1.0, 0.85, f.x) * smoothstep(0.0, 0.15, f.y) * smoothstep(1.0, 0.85, f.y);
    a = lit * pad;
    col = palette(cell.y / rows);
  }

  vec3 bg = uColorB * 0.08;
  float bgA = (1.0 - uTransparent) * 0.6;
  vec3 rgb = mix(bg, col, a);
  float alpha = max(a, bgA);
  outColor = vec4(rgb * alpha, alpha); // premultiplied
}`;

function hexToVec3(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map(ch => ch + ch).join('') : c.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [0.23, 0.51, 0.96];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export interface FrameSignal {
  bands: Float32Array;     // length 4
  spectrum: Float32Array;  // length SPECTRUM_BINS
  rms: number;
  beat: number;
}

export class AudioReactiveRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null;
  private program: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private specBytes = new Uint8Array(SPECTRUM_BINS);
  private smoothed = new Float32Array(4);
  private smoothedSpec = new Float32Array(SPECTRUM_BINS);
  private lastTime = -1;
  readonly ok: boolean;

  constructor(width = 960, height = 540) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
    this.ok = !!this.gl && this.init();
  }

  private init(): boolean {
    const gl = this.gl!;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(sh)); return null; }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return false; }
    this.program = prog;
    gl.useProgram(prog);
    ['uSpectrum', 'uBands', 'uRms', 'uBeat', 'uTime', 'uDrive', 'uColorA', 'uColorB', 'uDetail', 'uMirror', 'uTransparent', 'uAspect', 'uStyle']
      .forEach(n => { this.u[n] = gl.getUniformLocation(prog, n); });
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, SPECTRUM_BINS, 1, 0, gl.RED, gl.UNSIGNED_BYTE, this.specBytes);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.u.uSpectrum, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  }

  /** Fill `signal` from offline analysis at `time` (no allocation). */
  static sample(a: AudioAnalysis, time: number, signal: FrameSignal) {
    for (let b = 0; b < 4; b++) signal.bands[b] = bandAt(a, time, b);
    spectrumAt(a, time, signal.spectrum);
    signal.rms = rmsAt(a, time);
    signal.beat = beatPulseAt(a, time);
  }

  /** Draw one frame. `time` drives shader motion; `signal` drives energy. Deterministic for a given (time, signal). */
  render(signal: FrameSignal, settings: VisualizerSettings, time: number) {
    const gl = this.gl;
    if (!gl || !this.program) return;
    // Temporal smoothing: reset when scrubbing backwards or jumping so exports stay deterministic
    const k = Math.max(0, Math.min(0.95, settings.smoothing));
    const jump = this.lastTime < 0 || time < this.lastTime || time - this.lastTime > 0.5;
    for (let b = 0; b < 4; b++) this.smoothed[b] = jump ? signal.bands[b] : this.smoothed[b] * k + signal.bands[b] * (1 - k);
    for (let s = 0; s < SPECTRUM_BINS; s++) {
      const v = jump ? signal.spectrum[s] : this.smoothedSpec[s] * k + signal.spectrum[s] * (1 - k);
      this.smoothedSpec[s] = v;
      this.specBytes[s] = Math.max(0, Math.min(255, Math.round(v * 255)));
    }
    this.lastTime = time;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SPECTRUM_BINS, 1, gl.RED, gl.UNSIGNED_BYTE, this.specBytes);

    const sens = Math.max(0.1, Math.min(4, settings.sensitivity));
    const drive = Math.min(1.5, this.smoothed[settings.driveBand] * sens);
    const [ar, ag, ab] = hexToVec3(settings.primaryColor);
    const [br, bg, bb] = hexToVec3(settings.secondaryColor);
    gl.uniform4f(this.u.uBands, this.smoothed[0], this.smoothed[1], this.smoothed[2], this.smoothed[3]);
    gl.uniform1f(this.u.uRms, signal.rms);
    gl.uniform1f(this.u.uBeat, signal.beat);
    gl.uniform1f(this.u.uTime, time);
    gl.uniform1f(this.u.uDrive, drive);
    gl.uniform3f(this.u.uColorA, ar, ag, ab);
    gl.uniform3f(this.u.uColorB, br, bg, bb);
    gl.uniform1f(this.u.uDetail, Math.max(4, Math.min(128, settings.detail)));
    gl.uniform1f(this.u.uMirror, settings.mirror ? 1 : 0);
    gl.uniform1f(this.u.uTransparent, settings.transparent ? 1 : 0);
    gl.uniform1f(this.u.uAspect, this.canvas.width / this.canvas.height);
    gl.uniform1i(this.u.uStyle, VisualizerStyleIndex[settings.style] ?? 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  resetSmoothing() { this.lastTime = -1; }

  dispose() {
    const gl = this.gl;
    if (!gl) return;
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.program) gl.deleteProgram(this.program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }
}

/** Canvas-2D fallback used when WebGL2 is unavailable (bars only). */
export function render2DFallback(ctx: CanvasRenderingContext2D, signal: FrameSignal, settings: VisualizerSettings) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  if (!settings.transparent) { ctx.fillStyle = settings.secondaryColor + '22'; ctx.fillRect(0, 0, w, h); }
  const n = Math.max(4, Math.min(128, Math.round(settings.detail)));
  const bw = w / n;
  const drive = Math.min(1.5, signal.bands[settings.driveBand] * settings.sensitivity);
  const grad = ctx.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, settings.primaryColor);
  grad.addColorStop(1, settings.secondaryColor);
  ctx.fillStyle = grad;
  for (let i = 0; i < n; i++) {
    const x = settings.mirror ? Math.abs((i / n) * 2 - 1) : i / n;
    const e = signal.spectrum[Math.min(SPECTRUM_BINS - 1, Math.floor(x * SPECTRUM_BINS))];
    const bh = e * (0.35 + drive * 0.9) * h;
    ctx.fillRect(i * bw + bw * 0.1, h - bh, bw * 0.8, bh);
  }
}

/** Shared offscreen renderer for the exporter / compositor (one GL context for all layers). */
let shared: AudioReactiveRenderer | null = null;
export function getSharedRenderer(width = 1920, height = 1080): AudioReactiveRenderer | null {
  if (shared && (shared.canvas.width !== width || shared.canvas.height !== height)) { shared.dispose(); shared = null; }
  if (!shared) {
    shared = new AudioReactiveRenderer(width, height);
    if (!shared.ok) { shared = null; }
  }
  return shared;
}

export function newSignal(): FrameSignal {
  return { bands: new Float32Array(4), spectrum: new Float32Array(SPECTRUM_BINS), rms: 0, beat: 0 };
}
