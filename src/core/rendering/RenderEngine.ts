import { Layer, MotionPath } from '../types';
import { DOC_WIDTH, DOC_HEIGHT, SHAPE_SIZE, buildFontString, getLayerBox } from '../layers/layerUtils';
import { buildPath2D } from './vectorPath';

export interface CompositeOptions {
  /** Pre-processed (chroma keyed / curve adjusted) canvases keyed by layer id. */
  processedCanvases?: Record<string, HTMLCanvasElement | ImageBitmap | undefined>;
  motionPaths?: MotionPath[];
  /** Solo layer id (renders only that layer and its children). */
  soloLayerId?: string | null;
  /** Fill the background before compositing. Default transparent. */
  background?: string | null;
  /** Skip a set of layer ids (e.g. layers currently used as masks). */
  skipIds?: Set<string>;
}

/** Sample a point along a polyline motion path at progress 0..1. */
export function getPointOnPath(points: { x: number; y: number }[], progress: number) {
  if (!points || points.length < 2) return { x: 0, y: 0 };
  const p = Math.max(0, Math.min(1, progress));
  const segCount = points.length - 1;
  const index = Math.min(Math.floor(p * segCount), segCount - 1);
  const local = p * segCount - index;
  const p1 = points[index];
  const p2 = points[index + 1];
  return { x: p1.x + (p2.x - p1.x) * local, y: p1.y + (p2.y - p1.y) * local };
}

function filterString(layer: Layer): string {
  const a = layer.adjustments;
  const parts: string[] = [];
  if (a) {
    if (a.brightness !== 100) parts.push(`brightness(${a.brightness}%)`);
    if (a.contrast !== 100) parts.push(`contrast(${a.contrast}%)`);
    if (a.saturation !== 100) parts.push(`saturate(${a.saturation}%)`);
    if (a.hue) parts.push(`hue-rotate(${a.hue}deg)`);
  }
  const glow = layer.layerStyles?.outerGlow;
  if (glow?.enabled) parts.push(`drop-shadow(0 0 ${glow.size}px ${glow.color})`);
  const blur = layer.calculatedMotionBlur?.blurPx;
  if (blur && blur > 0.5) parts.push(`blur(${blur.toFixed(1)}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

function hexWithAlpha(color: string, opacity: number): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color + Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0');
  }
  return color;
}

/**
 * Draws a single layer's content at the origin (layer-local coordinates), mirroring the DOM layout in Canvas.tsx:
 * raster bitmaps at (0,0), shapes as a 200x200 box, text with its top-left at (0,0), vectors in absolute doc coords.
 */
function drawLayerContent(ctx: CanvasRenderingContext2D, layer: Layer, opts: CompositeOptions) {
  switch (layer.type) {
    case 'raster': {
      if (layer.proceduralSettings?.type === 'particles') return; // procedural particles are drawn by ParticleCanvas only
      const src = opts.processedCanvases?.[layer.id] || layer.bitmap;
      if (src) ctx.drawImage(src, 0, 0);
      return;
    }
    case 'shape': {
      const ss = layer.shapeSettings;
      if (!ss) return;
      ctx.fillStyle = ss.fill;
      ctx.strokeStyle = ss.stroke;
      ctx.lineWidth = ss.strokeWidth;
      ctx.beginPath();
      if (ss.type === 'circle') {
        ctx.arc(SHAPE_SIZE / 2, SHAPE_SIZE / 2, SHAPE_SIZE / 2 - ss.strokeWidth / 2, 0, Math.PI * 2);
      } else {
        ctx.rect(ss.strokeWidth / 2, ss.strokeWidth / 2, SHAPE_SIZE - ss.strokeWidth, SHAPE_SIZE - ss.strokeWidth);
      }
      ctx.fill();
      if (ss.strokeWidth > 0) ctx.stroke();
      return;
    }
    case 'text':
    case '3d-text': {
      const fs = layer.fontSettings;
      const size = fs?.size || 48;
      const leading = fs?.leading || 1.2;
      const tracking = fs?.tracking || 0;
      ctx.font = buildFontString(fs);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      try { (ctx as any).letterSpacing = `${tracking}px`; } catch { /* unsupported */ }
      const lines = (layer.content || '').split('\n');
      const lineHeight = size * leading;
      const color = fs?.color || '#ffffff';
      const drawLines = (offsetX: number, offsetY: number, fill: string) => {
        ctx.fillStyle = fill;
        lines.forEach((line, i) => ctx.fillText(line, offsetX, offsetY + lineHeight * i + lineHeight / 2));
      };
      if (layer.type === '3d-text') {
        const depth = fs?.depth || 10;
        for (let i = depth - 1; i >= 1; i--) {
          drawLines(i, -i, `rgba(0,0,0,${Math.max(0.15, 1 - i / (depth * 1.5))})`);
        }
      }
      drawLines(0, 0, color);
      return;
    }
    case 'vector': {
      const vec = layer.vectorSettings;
      if (!vec || !vec.points?.length) return;
      const path = buildPath2D(vec.points, vec.closed);
      if (vec.fillEnabled && vec.fill) {
        ctx.fillStyle = vec.fill;
        ctx.fill(path);
      }
      if (vec.strokeEnabled && vec.strokeWidth > 0) {
        ctx.strokeStyle = vec.stroke;
        ctx.lineWidth = vec.strokeWidth;
        ctx.lineCap = vec.lineCap || 'round';
        ctx.lineJoin = vec.lineJoin || 'round';
        const progress = vec.pathProgress ?? 1;
        if (progress < 1) {
          // Approximate dash-based stroke progress using a generous path length estimate
          const est = estimatePathLength(vec.points, vec.closed);
          ctx.setLineDash([est * progress, est]);
        }
        ctx.stroke(path);
        ctx.setLineDash([]);
      }
      return;
    }
    default:
      return;
  }
}

function estimatePathLength(points: { x: number; y: number }[], closed: boolean) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  if (closed && points.length > 2) len += Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y);
  return len * 1.25 + 1;
}

/** Apply layer styles that translate to canvas shadows (drop shadow). */
function applyShadow(ctx: CanvasRenderingContext2D, layer: Layer) {
  const ds = layer.layerStyles?.dropShadow;
  if (ds?.enabled) {
    ctx.shadowColor = hexWithAlpha(ds.color, ds.opacity ?? 0.7);
    ctx.shadowBlur = ds.size;
    ctx.shadowOffsetX = ds.distance;
    ctx.shadowOffsetY = ds.distance;
  }
}

function drawLayerRecursive(ctx: CanvasRenderingContext2D, layer: Layer, allLayers: Layer[], opts: CompositeOptions) {
  if (!layer.visible) return;
  if (layer.isMask) return;
  if (opts.skipIds?.has(layer.id)) return;
  if (opts.soloLayerId && layer.id !== opts.soloLayerId && layer.parentId !== opts.soloLayerId) return;
  if (layer.type === 'audio') return;

  const t = layer.transform;
  const motionPath = layer.motionPathId ? opts.motionPaths?.find(p => p.id === layer.motionPathId) : null;
  const pathOffset = motionPath ? getPointOnPath(motionPath.points, layer.motionPathProgress || 0) : { x: 0, y: 0 };

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));
  ctx.globalCompositeOperation = layer.blendMode && layer.blendMode !== 'normal' ? (layer.blendMode as GlobalCompositeOperation) : 'source-over';
  const filter = filterString(layer);
  if (filter !== 'none' && 'filter' in ctx) ctx.filter = filter;
  applyShadow(ctx, layer);

  // Match CSS: translate to (x,y), then transform-origin is top-left of the box (Canvas uses origin 0 0 equivalent)
  ctx.translate(t.x + pathOffset.x, t.y + pathOffset.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scaleX, t.scaleY);
  const skX = Math.tan(((t.skewX || 0) * Math.PI) / 180);
  const skY = Math.tan(((t.skewY || 0) * Math.PI) / 180);
  if (skX || skY) ctx.transform(1, skY, skX, 1, 0, 0);

  if (layer.type === 'group') {
    const children = allLayers.filter(c => c.parentId === layer.id);
    for (const child of children) drawLayerRecursive(ctx, child, allLayers, opts);
    ctx.restore();
    return;
  }

  if (layer.type === 'adjustment') {
    // Adjustment layers apply their filter to everything drawn so far
    ctx.restore();
    applyAdjustmentLayer(ctx, layer);
    return;
  }

  if (layer.type === 'cloner' && layer.clonerSettings) {
    const { count, mode, offset, step } = layer.clonerSettings;
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    for (let i = 0; i < count; i++) {
      let cx = 0, cy = 0, rot = 0;
      if (mode === 'linear') { cx = i * offset.x; cy = i * offset.y; rot = i * offset.rotation; }
      else if (mode === 'radial') { const a = (i / count) * Math.PI * 2; cx = Math.cos(a) * step; cy = Math.sin(a) * step; rot = (a * 180) / Math.PI; }
      else { cx = (i % cols) * step; cy = Math.floor(i / cols) * step; }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((rot * Math.PI) / 180);
      drawLayerContent(ctx, { ...layer, type: 'shape' }, opts);
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  // Masked layer: draw into a temp canvas, then destination-in with the mask
  const maskLayer = layer.maskId ? allLayers.find(m => m.id === layer.maskId) : null;
  const maskSrc = maskLayer ? (opts.processedCanvases?.[maskLayer.id] || maskLayer.bitmap) : null;
  if (maskLayer && maskSrc) {
    ctx.restore();
    const tmp = document.createElement('canvas');
    tmp.width = DOC_WIDTH; tmp.height = DOC_HEIGHT;
    const tctx = tmp.getContext('2d');
    if (tctx) {
      drawLayerRecursive(tctx, { ...layer, maskId: undefined }, allLayers, opts);
      tctx.globalCompositeOperation = 'destination-in';
      const mt = maskLayer.transform;
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.translate(mt.x, mt.y);
      tctx.rotate((mt.rotation * Math.PI) / 180);
      tctx.scale(mt.scaleX, mt.scaleY);
      tctx.drawImage(maskSrc, 0, 0);
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.drawImage(tmp, 0, 0);
      ctx.restore();
    }
    return;
  }

  drawLayerContent(ctx, layer, opts);
  ctx.restore();
}

function applyAdjustmentLayer(ctx: CanvasRenderingContext2D, layer: Layer) {
  const filter = filterString({ ...layer, layerStyles: undefined, calculatedMotionBlur: undefined });
  if (filter === 'none' || !('filter' in ctx)) return;
  const snapshot = document.createElement('canvas');
  snapshot.width = ctx.canvas.width; snapshot.height = ctx.canvas.height;
  const sctx = snapshot.getContext('2d');
  if (!sctx) return;
  sctx.drawImage(ctx.canvas, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));
  ctx.filter = filter;
  ctx.drawImage(snapshot, 0, 0);
  ctx.restore();
}

/**
 * Composite a full document frame. `layers` should already be evaluated at the desired time
 * (see computeLayersAtTime). Draws layers bottom (index 0) to top.
 */
export function renderComposite(ctx: CanvasRenderingContext2D, layers: Layer[], opts: CompositeOptions = {}) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  ctx.restore();

  for (const layer of layers) {
    if (layer.parentId) continue; // children are drawn by their group
    drawLayerRecursive(ctx, layer, layers, opts);
  }
}

/** Convenience: render to a fresh offscreen canvas. */
export function renderToCanvas(layers: Layer[], opts: CompositeOptions = {}, width = DOC_WIDTH, height = DOC_HEIGHT): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) renderComposite(ctx, layers, opts);
  return canvas;
}

export { getLayerBox };
