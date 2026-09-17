import { Adjustments, ChromaKeySettings, ColorPoint, CurvesAdjustment } from '../types';

export const DEFAULT_CHROMA_KEY: ChromaKeySettings = {
  enabled: false,
  targetColor: '#00ff00',
  similarity: 30,
  smoothness: 10,
  spillSuppression: 20,
  edgeFeather: 0
};

const IDENTITY_CURVE: ColorPoint[] = [{ x: 0, y: 0 }, { x: 255, y: 255 }];

function isIdentityCurve(points?: ColorPoint[]): boolean {
  if (!points || points.length === 0) return true;
  if (points.length !== 2) return false;
  return points[0].x === 0 && points[0].y === 0 && points[1].x === 255 && points[1].y === 255;
}

export function curvesAreIdentity(curves?: CurvesAdjustment): boolean {
  if (!curves) return true;
  return isIdentityCurve(curves.rgb) && isIdentityCurve(curves.red) && isIdentityCurve(curves.green) && isIdentityCurve(curves.blue);
}

/**
 * Build a 256-entry lookup table from curve control points using monotone cubic (Fritsch–Carlson)
 * interpolation, which is what image editors use to keep curves smooth without overshoot.
 */
export function buildCurveLUT(points?: ColorPoint[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const pts = [...(points && points.length ? points : IDENTITY_CURVE)].sort((a, b) => a.x - b.x);
  if (pts.length === 1) { lut.fill(pts[0].y); return lut; }

  const n = pts.length;
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const d: number[] = [];
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i] || 1e-6;
    d.push((ys[i + 1] - ys[i]) / dx);
  }
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }

  for (let x = 0; x < 256; x++) {
    if (x <= xs[0]) { lut[x] = ys[0]; continue; }
    if (x >= xs[n - 1]) { lut[x] = ys[n - 1]; continue; }
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i] || 1e-6;
    const t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    lut[x] = h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1];
  }
  return lut;
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map(ch => ch + ch).join('') : c;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 255, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function applyChromaKey(data: Uint8ClampedArray, settings: ChromaKeySettings) {
  const [rKey, gKey, bKey] = hexToRgbTuple(settings.targetColor);
  const similarity = (settings.similarity / 100) * 255;
  const smoothness = Math.max(1, (settings.smoothness / 100) * 255);
  const spill = settings.spillSuppression / 100;
  const keyChannel = gKey >= rKey && gKey >= bKey ? 1 : rKey >= gKey && rKey >= bKey ? 0 : 2;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dist = Math.sqrt((r - rKey) ** 2 + (g - gKey) ** 2 + (b - bKey) ** 2);
    if (dist < similarity) {
      data[i + 3] = 0;
      continue;
    }
    if (dist < similarity + smoothness) {
      const alpha = (dist - similarity) / smoothness;
      data[i + 3] = Math.min(data[i + 3], alpha * 255);
    }
    if (spill > 0 && data[i + 3] > 0) {
      const others = keyChannel === 0 ? (g + b) / 2 : keyChannel === 1 ? (r + b) / 2 : (r + g) / 2;
      const limit = others * (1 + (1 - spill) * 0.5);
      if (data[i + keyChannel] > limit) data[i + keyChannel] = data[i + keyChannel] * (1 - spill) + limit * spill;
    }
  }
}

/** Blur only the alpha channel (box blur), used for edge feathering after keying. */
function featherAlpha(data: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (radius <= 0) return;
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) alpha[i] = data[i * 4 + 3];
  const tmp = new Float32Array(width * height);
  const r = Math.round(radius);
  const w = r * 2 + 1;
  // horizontal
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += alpha[y * width + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = sum / w;
      const out = Math.max(0, x - r), inn = Math.min(width - 1, x + r + 1);
      sum += alpha[y * width + inn] - alpha[y * width + out];
    }
  }
  // vertical
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      data[(y * width + x) * 4 + 3] = sum / w;
      const out = Math.max(0, y - r), inn = Math.min(height - 1, y + r + 1);
      sum += tmp[inn * width + x] - tmp[out * width + x];
    }
  }
}

export function applyCurves(data: Uint8ClampedArray, curves: CurvesAdjustment) {
  const master = buildCurveLUT(curves.rgb);
  const red = buildCurveLUT(curves.red);
  const green = buildCurveLUT(curves.green);
  const blue = buildCurveLUT(curves.blue);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = master[red[data[i]]];
    data[i + 1] = master[green[data[i + 1]]];
    data[i + 2] = master[blue[data[i + 2]]];
  }
}

export function needsPixelProcessing(adj: Adjustments | undefined): boolean {
  if (!adj) return false;
  return !!adj.chromaKey?.enabled || !curvesAreIdentity(adj.curves);
}

/**
 * Produce a processed canvas for a raster source (chroma key + curves).
 * Returns the source drawn 1:1 when no pixel processing is needed.
 */
export function processLayerPixels(
  source: ImageBitmap | HTMLCanvasElement | HTMLImageElement,
  adjustments: Adjustments | undefined,
  target?: HTMLCanvasElement
): HTMLCanvasElement {
  const width = (source as any).width || 1920;
  const height = (source as any).height || 1080;
  const canvas = target || document.createElement('canvas');
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);

  if (!needsPixelProcessing(adjustments)) return canvas;

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const key = adjustments?.chromaKey;
  if (key?.enabled) {
    applyChromaKey(data, key);
    if (key.edgeFeather > 0) featherAlpha(data, width, height, Math.min(25, key.edgeFeather / 2));
  }
  if (adjustments?.curves && !curvesAreIdentity(adjustments.curves)) applyCurves(data, adjustments.curves);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Stable string key describing everything that influences pixel processing. */
export function pixelProcessingKey(adj: Adjustments | undefined): string {
  if (!adj) return 'none';
  return JSON.stringify({ c: adj.chromaKey, k: adj.curves });
}
