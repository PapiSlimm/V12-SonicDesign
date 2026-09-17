import { Layer, Transform, VectorPathSettings } from '../types';

/** Canvas document dimensions (single source of truth). */
export const DOC_WIDTH = 1920;
export const DOC_HEIGHT = 1080;

/** Default width/height used for shape layers. */
export const SHAPE_SIZE = 200;

export const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };

let idCounter = 0;
/** Collision-free id generator (Date.now() alone collides when several layers are created in the same ms). */
export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Deep-clone a layer list for history snapshots while sharing ImageBitmap references.
 * Bitmaps are treated as immutable (every brush stroke produces a new bitmap), so sharing
 * them avoids copying megabytes of pixel data for every undo step.
 */
export function snapshotLayers(layers: Layer[]): Layer[] {
  return layers.map((l) => {
    const { bitmap, ...rest } = l;
    let cloned: Omit<Layer, 'bitmap'>;
    try {
      cloned = structuredClone(rest);
    } catch {
      cloned = JSON.parse(JSON.stringify(rest));
    }
    return { ...cloned, bitmap } as Layer;
  });
}

/** Text measuring context shared across the app (avoids creating canvases in render loops). */
let measureCtx: CanvasRenderingContext2D | null = null;
export function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  measureCtx = c.getContext('2d');
  return measureCtx;
}

export function buildFontString(fs: Layer['fontSettings'] | undefined): string {
  const weight = fs?.weight || 'bold';
  const size = fs?.size || 48;
  const family = fs?.family || 'Inter';
  return `${weight} ${size}px "${family}", Inter, system-ui, sans-serif`;
}

/** Bounding box of a vector path (anchor points + handles). */
export function vectorBounds(vec: VectorPathSettings | undefined): { x: number; y: number; w: number; h: number } {
  if (!vec || !vec.points || vec.points.length === 0) return { x: 0, y: 0, w: 100, h: 100 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of vec.points) {
    const pts = [p, p.handleIn, p.handleOut].filter(Boolean) as { x: number; y: number }[];
    for (const q of pts) {
      minX = Math.min(minX, q.x); minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x); maxY = Math.max(maxY, q.y);
    }
  }
  const pad = (vec.strokeWidth || 0) / 2;
  return { x: minX - pad, y: minY - pad, w: Math.max(1, maxX - minX + pad * 2), h: Math.max(1, maxY - minY + pad * 2) };
}

/**
 * Natural (unscaled) size of a layer in document pixels, matching how Canvas.tsx lays it out.
 * The returned offset is where the layer's visual box starts relative to transform.x/y.
 */
export function getLayerBox(layer: Layer): { w: number; h: number; offsetX: number; offsetY: number } {
  switch (layer.type) {
    case 'shape':
      return { w: SHAPE_SIZE, h: SHAPE_SIZE, offsetX: 0, offsetY: 0 };
    case 'text':
    case '3d-text': {
      const content = layer.content || '';
      const lines = content.split('\n');
      const fs = layer.fontSettings;
      const size = fs?.size || 48;
      const tracking = fs?.tracking || 0;
      const leading = fs?.leading || 1.2;
      const ctx = getMeasureContext();
      let w = 0;
      if (ctx) {
        ctx.font = buildFontString(fs);
        for (const line of lines) w = Math.max(w, ctx.measureText(line).width + tracking * Math.max(0, line.length - 1));
      } else {
        for (const line of lines) w = Math.max(w, line.length * size * 0.55);
      }
      if (layer.textAnimatorSettings) w += 4 * Math.max(0, content.length - 1); // per-char gap in animator layout
      const depth = layer.type === '3d-text' ? (fs?.depth || 10) : 0;
      return { w: Math.max(20, Math.ceil(w) + depth), h: Math.max(20, Math.ceil(size * leading * lines.length) + depth), offsetX: 0, offsetY: 0 };
    }
    case 'vector': {
      const b = vectorBounds(layer.vectorSettings);
      // Vector points are absolute document coords; the box is offset from transform.x/y
      return { w: b.w, h: b.h, offsetX: b.x, offsetY: b.y };
    }
    case 'raster':
      if (layer.proceduralSettings?.type === 'particles') return { w: DOC_WIDTH, h: DOC_HEIGHT, offsetX: -DOC_WIDTH / 2, offsetY: -DOC_HEIGHT / 2 };
      if (layer.bitmap) return { w: layer.bitmap.width, h: layer.bitmap.height, offsetX: 0, offsetY: 0 };
      return { w: DOC_WIDTH, h: DOC_HEIGHT, offsetX: 0, offsetY: 0 };
    case 'adjustment':
    case 'group':
      return { w: DOC_WIDTH, h: DOC_HEIGHT, offsetX: -layer.transform.x, offsetY: -layer.transform.y };
    default:
      return { w: 300, h: 200, offsetX: 0, offsetY: 0 };
  }
}

/** Returns all descendant ids of a group (recursive). */
export function collectDescendants(layers: Layer[], groupId: string): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    for (const l of layers) {
      if (l.parentId === id) {
        out.push(l.id);
        if (l.type === 'group') walk(l.id);
      }
    }
  };
  walk(groupId);
  return out;
}

export const clampNumber = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Parse a numeric input safely: returns fallback for NaN / empty strings. */
export const safeNumber = (raw: string, fallback: number) => {
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : fallback;
};
