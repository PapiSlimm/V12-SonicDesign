import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useMemo, useCallback } from 'react';
import { Tool, Layer, MotionPath } from '../core/types';
import { ChromaKeyProcessor } from './ChromaKeyProcessor';
import { ParticleCanvas } from './ParticleCanvas';
import { VectorCanvas } from './VectorCanvas';
import { useStore } from '../store/index';
import { computeLayersAtTime } from '../hooks/useDerivedLayers';
import { DOC_WIDTH, DOC_HEIGHT, SHAPE_SIZE, getLayerBox, buildFontString } from '../core/layers/layerUtils';
import { renderComposite, getPointOnPath } from '../core/rendering/RenderEngine';
import { LayerFactory } from '../core/layers/LayerFactory';
import { importImageFiles } from '../services/fileService';

interface CanvasProps {
  onCanvasUpdate?: () => void;
  layers: Layer[];
  motionPaths: MotionPath[];
  selectedLayerId: string | null;
  tool: Tool;
  zoom: number;
  pan: { x: number; y: number };
  brushSize: number;
  brushOpacity: number;
  selection: any;
  gradientOptions: any;
  setPan: (pan: { x: number; y: number }) => void;
  setZoom: (zoom: number) => void;
}

export interface CanvasHandle {
  toDataURL: () => string;
  getCanvas: () => HTMLCanvasElement | null;
  exportComposite: (time?: number) => Promise<string>;
  renderCompositeCanvas: (time?: number, background?: string | null) => HTMLCanvasElement;
  getActiveLayer: () => Layer | null;
  getPixelData: (x: number, y: number, w: number, h: number) => ImageData | null;
  renderFrame: (time: number) => Promise<void>;
  fitToScreen: () => void;
}

type Point = { x: number; y: number };

interface TransformStart {
  x: number;
  y: number;
  layerX: number;
  layerY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  skewX: number;
  skewY: number;
}

const HANDLE_CORNERS = [
  { pos: 'tl', cursor: 'cursor-nwse-resize', title: 'Scale Top-Left' },
  { pos: 'tr', cursor: 'cursor-nesw-resize', title: 'Scale Top-Right' },
  { pos: 'bl', cursor: 'cursor-nesw-resize', title: 'Scale Bottom-Left' },
  { pos: 'br', cursor: 'cursor-nwse-resize', title: 'Scale Bottom-Right' }
];

const HANDLE_EDGES = [
  { pos: 'tm', style: { top: -6, left: '50%', transform: 'translateX(-50%)' }, cursor: 'cursor-ns-resize', title: 'Scale Height (Top)' },
  { pos: 'bm', style: { bottom: -6, left: '50%', transform: 'translateX(-50%)' }, cursor: 'cursor-ns-resize', title: 'Scale Height (Bottom)' },
  { pos: 'ml', style: { left: -6, top: '50%', transform: 'translateY(-50%)' }, cursor: 'cursor-ew-resize', title: 'Scale Width (Left)' },
  { pos: 'mr', style: { right: -6, top: '50%', transform: 'translateY(-50%)' }, cursor: 'cursor-ew-resize', title: 'Scale Width (Right)' }
];

const TOOL_CURSORS: Partial<Record<Tool, string>> = {
  hand: 'cursor-grab active:cursor-grabbing',
  move: 'cursor-default',
  zoom: 'cursor-zoom-in',
  text: 'cursor-text',
  'text-animator': 'cursor-text',
  eyedropper: 'cursor-crosshair',
  'color-picker': 'cursor-crosshair'
};

/** Convert a document-space point into a layer's local (unscaled, unrotated) space. */
function docToLayerLocal(p: Point, layer: Layer): Point {
  const t = layer.transform;
  const dx = p.x - t.x;
  const dy = p.y - t.y;
  const rad = (-t.rotation * Math.PI) / 180;
  const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
  return { x: rx / (t.scaleX || 1), y: ry / (t.scaleY || 1) };
}

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map(ch => ch + ch).join('') : c.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function isPaintable(layer: Layer | undefined | null): layer is Layer {
  return !!layer && layer.type === 'raster' && !layer.proceduralSettings && !layer.locked;
}

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(({
  onCanvasUpdate,
  layers,
  motionPaths,
  selectedLayerId,
  tool,
  zoom,
  pan,
  brushSize,
  brushOpacity,
  selection,
  gradientOptions,
  setPan,
  setZoom
}, ref) => {
  const [isTransforming, setIsTransforming] = useState<string | null>(null);
  const [transformStart, setTransformStart] = useState<TransformStart | null>(null);
  const [gradientStart, setGradientStart] = useState<Point | null>(null);
  const [gradientEnd, setGradientEnd] = useState<Point | null>(null);
  const [activeSmartGuides, setActiveSmartGuides] = useState<Array<{ type: 'v' | 'h'; pos: number; label: string }>>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [hoverLayerId, setHoverLayerId] = useState<string | null>(null);

  const updateLayer = useStore(s => s.updateLayer);
  const updateLayerCommitted = useStore(s => s.updateLayerCommitted);
  const addLayer = useStore(s => s.addLayer);
  const addTextLayer = useStore(s => s.addTextLayer);
  const addTextAnimatorLayer = useStore(s => s.addTextAnimatorLayer);
  const addVectorLayer = useStore(s => s.addVectorLayer);
  const addMotionPath = useStore(s => s.addMotionPath);
  const selectLayer = useStore(s => s.selectLayer);
  const setSelectedTool = useStore(s => s.setSelectedTool);
  const setSelection = useStore(s => s.setSelection);
  const setBrushColor = useStore(s => s.setBrushColor);
  const brushColor = useStore(s => s.brushColor);
  const onionSkinEnabled = useStore(s => s.onionSkinEnabled);
  const onionSkinSettings = useStore(s => s.onionSkinSettings);
  const currentTime = useStore(s => s.currentTime);
  const duration = useStore(s => s.duration);
  const smartGuidesEnabled = useStore(s => s.smartGuidesEnabled);
  const setSmartGuidesEnabled = useStore(s => s.setSmartGuidesEnabled);
  const rawLayers = useStore(s => s.layers);
  const soloLayerId = useStore(s => s.soloLayerId);
  const startHistoryTransaction = useStore(s => s.startHistoryTransaction);
  const endHistoryTransaction = useStore(s => s.endHistoryTransaction);
  const setStatusMessage = useStore(s => s.setStatusMessage);
  const setActiveSidebarTab = useStore(s => s.setActiveSidebarTab);

  const prevOnionLayers = useMemo(() => {
    if (!onionSkinEnabled) return [];
    const prevTime = Math.max(0, currentTime - onionSkinSettings.prevOffset);
    return computeLayersAtTime(rawLayers, prevTime);
  }, [onionSkinEnabled, currentTime, onionSkinSettings.prevOffset, rawLayers]);

  const nextOnionLayers = useMemo(() => {
    if (!onionSkinEnabled) return [];
    const nextTime = Math.min(duration, currentTime + onionSkinSettings.nextOffset);
    return computeLayersAtTime(rawLayers, nextTime);
  }, [onionSkinEnabled, currentTime, duration, onionSkinSettings.nextOffset, rawLayers]);

  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const layerCanvasEls = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const paintBufferRef = useRef<HTMLCanvasElement | null>(null);
  const paintTargetIdRef = useRef<string | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState<Point | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState<Point | null>(null);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Map of processed canvases (chroma key / curves applied) for each raster layer
  const [processedCanvases, setProcessedCanvases] = useState<Record<string, HTMLCanvasElement>>({});
  const [processedVersion, setProcessedVersion] = useState(0);

  const handleProcessed = useCallback((layerId: string, canvas: HTMLCanvasElement) => {
    setProcessedCanvases(prev => (prev[layerId] === canvas ? prev : { ...prev, [layerId]: canvas }));
    setProcessedVersion(v => v + 1);
  }, []);

  // Drop processed canvases for layers that no longer exist
  useEffect(() => {
    const ids = new Set(layers.map(l => l.id));
    setProcessedCanvases(prev => {
      const stale = Object.keys(prev).filter(id => !ids.has(id));
      if (stale.length === 0) return prev;
      const next = { ...prev };
      stale.forEach(id => delete next[id]);
      return next;
    });
  }, [layers]);

  const currentLayer = useMemo(() => layers.find(l => l.id === selectedLayerId) || null, [layers, selectedLayerId]);
  const rawCurrentLayer = useMemo(() => rawLayers.find(l => l.id === selectedLayerId) || null, [rawLayers, selectedLayerId]);

  // Mask data URLs are expensive (toDataURL on 1920x1080) — compute once per processed canvas, only for layers used as masks.
  const maskUrls = useMemo(() => {
    const urls: Record<string, string> = {};
    const maskIds = new Set(layers.map(l => l.maskId).filter(Boolean) as string[]);
    maskIds.forEach(id => {
      const c = processedCanvases[id];
      if (c) {
        try { urls[id] = c.toDataURL(); } catch { /* tainted canvas */ }
      }
    });
    return urls;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedCanvases, processedVersion, layers]);

  /** Pointer position in document (1920x1080) coordinates. */
  const getDocCoords = useCallback((clientX: number, clientY: number): Point => {
    const world = worldRef.current;
    if (!world) return { x: 0, y: 0 };
    const rect = world.getBoundingClientRect();
    const scaleX = rect.width / DOC_WIDTH || 1;
    const scaleY = rect.height / DOC_HEIGHT || 1;
    return { x: (clientX - rect.left) / scaleX, y: (clientY - rect.top) / scaleY };
  }, []);

  const getCanvasCoords = (e: React.MouseEvent | MouseEvent) => getDocCoords(e.clientX, e.clientY);

  const compositeAtTime = useCallback((time?: number, background: string | null = null) => {
    const source = time === undefined ? layers : computeLayersAtTime(rawLayers, time);
    const canvas = document.createElement('canvas');
    canvas.width = DOC_WIDTH;
    canvas.height = DOC_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (ctx) renderComposite(ctx, source, { processedCanvases, motionPaths, soloLayerId, background });
    return canvas;
  }, [layers, rawLayers, processedCanvases, motionPaths, soloLayerId]);

  useImperativeHandle(ref, () => ({
    toDataURL: () => compositeAtTime().toDataURL(),
    getCanvas: () => (selectedLayerId ? layerCanvasEls.current.get(selectedLayerId) || null : null),
    exportComposite: async (time?: number) => compositeAtTime(time).toDataURL(),
    renderCompositeCanvas: (time?: number, background?: string | null) => compositeAtTime(time, background ?? null),
    getActiveLayer: () => currentLayer,
    getPixelData: (x, y, w, h) => {
      const ctx = compositeAtTime().getContext('2d', { willReadFrequently: true });
      return ctx ? ctx.getImageData(x, y, w, h) : null;
    },
    renderFrame: async () => { /* rendering is declarative; frames are derived from store time */ },
    fitToScreen: () => fitToScreen()
  }));

  const fitToScreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const margin = 48;
    const z = Math.min((rect.width - margin * 2) / DOC_WIDTH, (rect.height - margin * 2) / DOC_HEIGHT);
    const clamped = Math.max(0.05, Math.min(20, z));
    setZoom(clamped);
    setPan({ x: (rect.width - DOC_WIDTH * clamped) / 2, y: (rect.height - DOC_HEIGHT * clamped) / 2 });
  }, [setPan, setZoom]);

  // Fit the document to the viewport on first mount
  useEffect(() => {
    fitToScreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Native (non-passive) wheel listener so preventDefault actually blocks browser zoom/scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const state = useStore.getState();
      const z = state.zoom;
      const p = state.pan;
      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = Math.exp(-e.deltaY * 0.0015);
        const newZoom = Math.min(Math.max(0.05, z * zoomFactor), 20);
        const rect = el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - p.x) / z;
        const worldY = (mouseY - p.y) / z;
        state.setPan({ x: mouseX - worldX * newZoom, y: mouseY - worldY * newZoom });
        state.setZoom(newZoom);
      } else if (e.shiftKey && e.deltaX === 0) {
        state.setPan({ x: p.x - e.deltaY, y: p.y });
      } else {
        state.setPan({ x: p.x - e.deltaX, y: p.y - e.deltaY });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /** Keep every raster layer's on-screen canvas in sync with its processed pixels. */
  const drawLayerCanvas = useCallback((layerId: string, el: HTMLCanvasElement | null) => {
    if (!el) return;
    const layer = rawLayers.find(l => l.id === layerId);
    const src = processedCanvases[layerId] || layer?.bitmap || null;
    const w = src ? src.width : DOC_WIDTH;
    const h = src ? src.height : DOC_HEIGHT;
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    if (src) ctx.drawImage(src, 0, 0);
  }, [rawLayers, processedCanvases]);

  useEffect(() => {
    if (isDrawing) return; // don't clobber an in-progress stroke
    layerCanvasEls.current.forEach((el, id) => drawLayerCanvas(id, el));
  }, [drawLayerCanvas, processedVersion, isDrawing]);

  const registerLayerCanvas = useCallback((layerId: string) => (el: HTMLCanvasElement | null) => {
    if (el) {
      layerCanvasEls.current.set(layerId, el);
      drawLayerCanvas(layerId, el);
    } else {
      layerCanvasEls.current.delete(layerId);
    }
  }, [drawLayerCanvas]);

  const sampleColorAtCoords = (x: number, y: number) => {
    try {
      const canvas = compositeAtTime();
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return '#3b82f6';
      const px = Math.min(DOC_WIDTH - 1, Math.max(0, Math.round(x)));
      const py = Math.min(DOC_HEIGHT - 1, Math.max(0, Math.round(y)));
      const pixel = ctx.getImageData(px, py, 1, 1).data;
      if (pixel[3] === 0) return null;
      return '#' + [pixel[0], pixel[1], pixel[2]].map(v => v.toString(16).padStart(2, '0')).join('');
    } catch {
      return null;
    }
  };

  /** Axis-aligned bounds of a layer in document space (ignores rotation for hit-testing simplicity). */
  const getLayerDocBounds = (l: Layer) => {
    const box = getLayerBox(l);
    const t = l.transform;
    const motionPath = l.motionPathId ? motionPaths.find(p => p.id === l.motionPathId) : null;
    const off = motionPath ? getPointOnPath(motionPath.points, l.motionPathProgress || 0) : { x: 0, y: 0 };
    return {
      x: t.x + off.x + box.offsetX * t.scaleX,
      y: t.y + off.y + box.offsetY * t.scaleY,
      w: box.w * t.scaleX,
      h: box.h * t.scaleY
    };
  };

  const hitTest = (p: Point): Layer | null => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (!l.visible || l.locked || l.type === 'group' || l.type === 'adjustment' || l.type === 'audio' || l.isMask) continue;
      if (soloLayerId && l.id !== soloLayerId && l.parentId !== soloLayerId) continue;
      // Respect parent group visibility
      const parent = l.parentId ? layers.find(g => g.id === l.parentId) : null;
      if (parent && (!parent.visible || parent.locked)) continue;
      if (l.type === 'raster' && !l.bitmap && !l.proceduralSettings) continue; // empty raster — don't block clicks
      const b = getLayerDocBounds(l);
      const local = docToLayerLocal(p, l);
      const box = getLayerBox(l);
      const inside = local.x >= box.offsetX && local.x <= box.offsetX + box.w && local.y >= box.offsetY && local.y <= box.offsetY + box.h;
      if (inside || (l.transform.rotation === 0 && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)) return l;
    }
    return null;
  };

  const calculateSmartGuides = (rawX: number, rawY: number, w: number, h: number, currentLayerId: string, allLayers: Layer[]) => {
    const left = rawX, centerX = rawX + w / 2, right = rawX + w;
    const top = rawY, centerY = rawY + h / 2, bottom = rawY + h;

    const vTargets: { pos: number; label: string }[] = [
      { pos: 0, label: 'Canvas Left Edge' },
      { pos: DOC_WIDTH / 2, label: 'Canvas Center X' },
      { pos: DOC_WIDTH, label: 'Canvas Right Edge' },
    ];
    const hTargets: { pos: number; label: string }[] = [
      { pos: 0, label: 'Canvas Top Edge' },
      { pos: DOC_HEIGHT / 2, label: 'Canvas Center Y' },
      { pos: DOC_HEIGHT, label: 'Canvas Bottom Edge' },
    ];

    allLayers.forEach(l => {
      if (l.id === currentLayerId || !l.visible || l.type === 'adjustment' || l.type === 'audio' || l.type === 'group') return;
      if (l.type === 'raster' && !l.bitmap) return;
      const b = getLayerDocBounds(l);
      vTargets.push({ pos: b.x, label: `Left (${l.name})` }, { pos: b.x + b.w / 2, label: `Center X (${l.name})` }, { pos: b.x + b.w, label: `Right (${l.name})` });
      hTargets.push({ pos: b.y, label: `Top (${l.name})` }, { pos: b.y + b.h / 2, label: `Center Y (${l.name})` }, { pos: b.y + b.h, label: `Bottom (${l.name})` });
    });

    const threshold = 8 / Math.max(0.2, zoom);
    let snappedX = rawX, snappedY = rawY;
    const guides: { type: 'v' | 'h'; pos: number; label: string }[] = [];

    const snapAxis = (targets: { pos: number; label: string }[], edges: number[]) => {
      let best: { dist: number; correction: number; target: { pos: number; label: string } } | null = null;
      targets.forEach(target => {
        edges.forEach(edge => {
          const dist = Math.abs(edge - target.pos);
          if (dist < threshold && (!best || dist < best.dist)) best = { dist, correction: target.pos - edge, target };
        });
      });
      return best as { dist: number; correction: number; target: { pos: number; label: string } } | null;
    };

    const bestV = snapAxis(vTargets, [left, centerX, right]);
    if (bestV) { snappedX = rawX + bestV.correction; guides.push({ type: 'v', pos: bestV.target.pos, label: bestV.target.label }); }
    const bestH = snapAxis(hTargets, [top, centerY, bottom]);
    if (bestH) { snappedY = rawY + bestH.correction; guides.push({ type: 'h', pos: bestH.target.pos, label: bestH.target.label }); }

    return { snappedX, snappedY, guides };
  };

  const beginTransform = (mode: string, e: React.MouseEvent, layer: Layer) => {
    e.stopPropagation();
    const p = getCanvasCoords(e);
    startHistoryTransaction();
    setIsTransforming(mode);
    setTransformStart({
      x: p.x,
      y: p.y,
      layerX: layer.transform.x,
      layerY: layer.transform.y,
      scaleX: layer.transform.scaleX,
      scaleY: layer.transform.scaleY,
      rotation: layer.transform.rotation,
      skewX: layer.transform.skewX || 0,
      skewY: layer.transform.skewY || 0
    });
  };

  /** Prepare an offscreen paint buffer seeded with the target raster layer's current pixels. */
  const beginPaintStroke = (): Layer | null => {
    let target: Layer | null = rawCurrentLayer;
    if (!isPaintable(target)) {
      if (target && (target as Layer).locked) {
        setStatusMessage(`"${(target as Layer).name}" is locked — unlock it to paint`);
        return null;
      }
      const paintLayer = LayerFactory.createRasterLayer(`Paint Layer ${rawLayers.length + 1}`);
      addLayer(paintLayer, 'Add Paint Layer');
      target = paintLayer;
    }
    const buffer = paintBufferRef.current || document.createElement('canvas');
    paintBufferRef.current = buffer;
    const w = target.bitmap ? target.bitmap.width : DOC_WIDTH;
    const h = target.bitmap ? target.bitmap.height : DOC_HEIGHT;
    buffer.width = w;
    buffer.height = h;
    const ctx = buffer.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, w, h);
      if (target.bitmap) ctx.drawImage(target.bitmap, 0, 0);
    }
    paintTargetIdRef.current = target.id;
    return target;
  };

  /** Clip a context to the active pixel selection (in document space, converted to layer-local). */
  const applySelectionClip = (ctx: CanvasRenderingContext2D, layer: Layer) => {
    if (!selection?.active || !selection.points?.length) return;
    const pts: Point[] = selection.points.map((p: Point) => docToLayerLocal(p, layer));
    ctx.beginPath();
    if (selection.type === 'marquee' && pts.length >= 2) {
      const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
      ctx.rect(x, y, Math.abs(pts[1].x - pts[0].x), Math.abs(pts[1].y - pts[0].y));
    } else {
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
    }
    ctx.clip();
  };

  const strokeSegment = (from: Point, to: Point, layer: Layer) => {
    const buffer = paintBufferRef.current;
    const el = layerCanvasEls.current.get(layer.id);
    if (!buffer) return;
    const a = docToLayerLocal(from, layer);
    const b = docToLayerLocal(to, layer);
    const scale = (Math.abs(layer.transform.scaleX) + Math.abs(layer.transform.scaleY)) / 2 || 1;
    const targets = [buffer.getContext('2d'), el?.getContext('2d')].filter(Boolean) as CanvasRenderingContext2D[];
    for (const ctx of targets) {
      ctx.save();
      applySelectionClip(ctx, layer);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = brushSize / scale;
      if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = `rgba(0,0,0,${brushOpacity})`;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = hexToRgba(brushColor, brushOpacity);
      }
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
  };

  const commitPaintBuffer = async (label: string) => {
    const buffer = paintBufferRef.current;
    const targetId = paintTargetIdRef.current;
    if (!buffer || !targetId) return;
    const bitmap = await createImageBitmap(buffer);
    updateLayerCommitted(targetId, { bitmap }, label);
    onCanvasUpdate?.();
  };

  const applyGradientFill = async (start: Point, end: Point) => {
    const target = beginPaintStroke();
    const buffer = paintBufferRef.current;
    if (!target || !buffer) return;
    const ctx = buffer.getContext('2d');
    if (!ctx) return;
    const a = docToLayerLocal(start, target);
    const b = docToLayerLocal(end, target);
    const colors: string[] = gradientOptions?.colors?.length ? gradientOptions.colors : ['#000000', '#ffffff'];
    let grad: CanvasGradient;
    const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    if (gradientOptions?.type === 'radial') {
      grad = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, dist);
    } else if (gradientOptions?.type === 'conic' && 'createConicGradient' in ctx) {
      grad = (ctx as any).createConicGradient(Math.atan2(b.y - a.y, b.x - a.x), a.x, a.y);
    } else {
      grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    }
    colors.forEach((c, i) => grad.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c));
    ctx.save();
    applySelectionClip(ctx, target);
    ctx.globalAlpha = brushOpacity;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, buffer.width, buffer.height);
    ctx.restore();
    await commitPaintBuffer('Gradient Fill');
    setStatusMessage(`Applied ${gradientOptions?.type || 'linear'} gradient to "${target.name}"`);
  };

  const applyCrop = async (rect: { x: number; y: number; w: number; h: number }) => {
    const target = rawCurrentLayer;
    if (!isPaintable(target) || !target.bitmap) {
      setStatusMessage('Crop: select an unlocked image layer first');
      return;
    }
    const a = docToLayerLocal({ x: rect.x, y: rect.y }, target);
    const b = docToLayerLocal({ x: rect.x + rect.w, y: rect.y + rect.h }, target);
    const sx = Math.max(0, Math.floor(Math.min(a.x, b.x)));
    const sy = Math.max(0, Math.floor(Math.min(a.y, b.y)));
    const ex = Math.min(target.bitmap.width, Math.ceil(Math.max(a.x, b.x)));
    const ey = Math.min(target.bitmap.height, Math.ceil(Math.max(a.y, b.y)));
    const w = ex - sx, h = ey - sy;
    if (w < 2 || h < 2) return;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')?.drawImage(target.bitmap, sx, sy, w, h, 0, 0, w, h);
    const bitmap = await createImageBitmap(c);
    // Shift the layer so the cropped region stays where it was on screen
    const rad = (target.transform.rotation * Math.PI) / 180;
    const dx = sx * target.transform.scaleX, dy = sy * target.transform.scaleY;
    updateLayerCommitted(target.id, {
      bitmap,
      transform: {
        ...target.transform,
        x: target.transform.x + dx * Math.cos(rad) - dy * Math.sin(rad),
        y: target.transform.y + dx * Math.sin(rad) + dy * Math.cos(rad)
      }
    }, 'Crop Layer');
    setStatusMessage(`Cropped "${target.name}" to ${w}×${h}px`);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) return;
    const coords = getCanvasCoords(e);

    if (tool === 'eyedropper' || tool === 'color-picker') {
      const sampledHex = sampleColorAtCoords(coords.x, coords.y);
      if (sampledHex) {
        setBrushColor(sampledHex);
        const currentL = rawCurrentLayer;
        if (e.altKey && currentL) {
          if (currentL.type === 'shape' && currentL.shapeSettings) updateLayerCommitted(currentL.id, { shapeSettings: { ...currentL.shapeSettings, fill: sampledHex } }, 'Sample Fill');
          else if ((currentL.type === 'text' || currentL.type === '3d-text') && currentL.fontSettings) updateLayerCommitted(currentL.id, { fontSettings: { ...currentL.fontSettings, color: sampledHex } }, 'Sample Color');
        }
        setStatusMessage(`Sampled ${sampledHex}${e.altKey ? ' (applied to layer)' : ' — Alt+click to apply to the selected layer'}`);
      } else {
        setStatusMessage('Transparent pixel — nothing sampled');
      }
      return;
    }

    if (tool === 'hand' || e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (tool === 'zoom') {
      const factor = e.altKey ? 1 / 1.5 : 1.5;
      const newZoom = Math.min(20, Math.max(0.05, zoom * factor));
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
        setPan({ x: mouseX - coords.x * newZoom, y: mouseY - coords.y * newZoom });
      }
      setZoom(newZoom);
      return;
    }

    if (tool === 'text') {
      addTextLayer(false, coords.x, coords.y);
      setSelectedTool('move');
      setActiveSidebarTab('properties');
      return;
    }

    if (tool === 'text-animator') {
      addTextAnimatorLayer(coords.x, coords.y);
      setSelectedTool('move');
      setActiveSidebarTab('properties');
      return;
    }

    if (tool === 'gradient') {
      setGradientStart(coords);
      setGradientEnd(coords);
      return;
    }

    if (tool === 'brush' || tool === 'eraser') {
      const target = beginPaintStroke();
      if (!target) return;
      setIsDrawing(true);
      setLastPoint(coords);
      return;
    }

    if (tool === 'marquee' || tool === 'crop') {
      setSelectionStart(coords);
      const rect = { ...coords, w: 0, h: 0 };
      if (tool === 'crop') setCropRect(rect); else setMarqueeRect(rect);
      return;
    }

    if (tool === 'lasso') {
      setSelectionStart(coords);
      setLassoPoints([coords]);
      return;
    }

    if (tool === 'pen') {
      const selectedL = rawCurrentLayer;
      if (selectedL && selectedL.type === 'vector' && !selectedL.locked) {
        const existingVec = selectedL.vectorSettings || {
          points: [], closed: false, stroke: '#3b82f6', strokeWidth: 4, fill: '#3b82f640',
          fillEnabled: true, strokeEnabled: true, lineCap: 'round' as const, lineJoin: 'round' as const, pathProgress: 1
        };
        const pts = [...existingVec.points];
        if (pts.length > 2) {
          const firstPt = pts[0];
          const dist = Math.hypot(coords.x - firstPt.x, coords.y - firstPt.y);
          if (dist < 12 / zoom + 6) {
            updateLayerCommitted(selectedL.id, { vectorSettings: { ...existingVec, closed: true } }, 'Close Path');
            setStatusMessage('Path closed');
            return;
          }
        }
        pts.push({ x: coords.x, y: coords.y });
        updateLayerCommitted(selectedL.id, { vectorSettings: { ...existingVec, points: pts } }, 'Add Anchor');
      } else {
        addVectorLayer(coords);
        setStatusMessage('New vector path — keep clicking to add anchors, click the first anchor to close');
      }
      return;
    }

    if (tool === 'motion-path') {
      setCurrentPath([coords]);
      return;
    }

    if (tool === 'move') {
      const hit = hitTest(coords);
      if (hit) {
        const additive = e.shiftKey || e.ctrlKey || e.metaKey;
        if (!additive && !useStore.getState().selectedLayerIds.includes(hit.id)) selectLayer(hit.id, false);
        else if (additive) selectLayer(hit.id, true);
        const rawHit = rawLayers.find(l => l.id === hit.id) || hit;
        if (!additive) beginTransform('move', e, rawHit);
      } else if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
        selectLayer(null);
        if (selection?.active) setSelection({ active: false, type: null, points: [] });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);

    if (isPanning && startPan) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
      return;
    }

    if (tool === 'gradient' && gradientStart) {
      setGradientEnd(coords);
      return;
    }

    if (tool === 'motion-path' && currentPath.length > 0 && e.buttons === 1) {
      const last = currentPath[currentPath.length - 1];
      if (Math.hypot(coords.x - last.x, coords.y - last.y) > 6 / zoom) setCurrentPath(prev => [...prev, coords]);
      return;
    }

    if (isTransforming && transformStart && rawCurrentLayer) {
      const layer = rawCurrentLayer;
      const dx = coords.x - transformStart.x;
      const dy = coords.y - transformStart.y;
      const box = getLayerBox(layer);

      if (isTransforming === 'move') {
        let rawX = transformStart.layerX + dx;
        let rawY = transformStart.layerY + dy;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) rawY = transformStart.layerY; else rawX = transformStart.layerX;
        }

        if (smartGuidesEnabled && !e.altKey) {
          const bx = rawX + box.offsetX * layer.transform.scaleX;
          const by = rawY + box.offsetY * layer.transform.scaleY;
          const { snappedX, snappedY, guides } = calculateSmartGuides(bx, by, box.w * layer.transform.scaleX, box.h * layer.transform.scaleY, layer.id, layers);
          rawX += snappedX - bx;
          rawY += snappedY - by;
          setActiveSmartGuides(guides);
        } else if (activeSmartGuides.length) {
          setActiveSmartGuides([]);
        }

        updateLayer(layer.id, { transform: { ...layer.transform, x: Math.round(rawX * 10) / 10, y: Math.round(rawY * 10) / 10 } });
      } else if (isTransforming === 'rotate') {
        const centerX = layer.transform.x + (box.offsetX + box.w / 2) * layer.transform.scaleX;
        const centerY = layer.transform.y + (box.offsetY + box.h / 2) * layer.transform.scaleY;
        let angle = Math.atan2(coords.y - centerY, coords.x - centerX) * (180 / Math.PI) + 90;
        if (e.shiftKey) angle = Math.round(angle / 15) * 15;
        updateLayer(layer.id, { transform: { ...layer.transform, rotation: Math.round(angle) } });
      } else if (isTransforming.startsWith('handle-')) {
        const handleType = isTransforming.replace('handle-', '');
        const baseW = Math.max(1, box.w), baseH = Math.max(1, box.h);
        let newScaleX = transformStart.scaleX;
        let newScaleY = transformStart.scaleY;
        let newSkewX = transformStart.skewX;
        let newSkewY = transformStart.skewY;

        const signX = handleType.endsWith('l') ? -1 : 1;
        const signY = handleType.startsWith('t') ? -1 : 1;

        if (['tl', 'tr', 'bl', 'br'].includes(handleType)) {
          newScaleX = Math.max(0.05, transformStart.scaleX + (dx * signX) / baseW);
          newScaleY = Math.max(0.05, transformStart.scaleY + (dy * signY) / baseH);
          if (e.shiftKey) {
            const ratio = Math.max(newScaleX / transformStart.scaleX, newScaleY / transformStart.scaleY);
            newScaleX = transformStart.scaleX * ratio;
            newScaleY = transformStart.scaleY * ratio;
          }
        } else if (handleType === 'tm' || handleType === 'bm') {
          newScaleY = Math.max(0.05, transformStart.scaleY + (dy * signY) / baseH);
        } else if (handleType === 'ml' || handleType === 'mr') {
          newScaleX = Math.max(0.05, transformStart.scaleX + (dx * signX) / baseW);
        } else if (handleType === 'skew-x') {
          newSkewX = Math.max(-80, Math.min(80, Math.round(transformStart.skewX + dx / 4)));
        } else if (handleType === 'skew-y') {
          newSkewY = Math.max(-80, Math.min(80, Math.round(transformStart.skewY + dy / 4)));
        }

        updateLayer(layer.id, {
          transform: {
            ...layer.transform,
            scaleX: Number(newScaleX.toFixed(3)),
            scaleY: Number(newScaleY.toFixed(3)),
            skewX: newSkewX,
            skewY: newSkewY
          }
        });
      }
      return;
    }

    if ((tool === 'marquee' || tool === 'crop') && selectionStart) {
      let w = coords.x - selectionStart.x;
      let h = coords.y - selectionStart.y;
      if (tool === 'marquee' && selection?.style === 'fixed-ratio') {
        const ratio = selection.aspectRatio || 1;
        h = (Math.abs(w) / ratio) * Math.sign(h || 1);
      } else if (tool === 'marquee' && selection?.style === 'fixed-size') {
        w = selection.fixedWidth || 100;
        h = selection.fixedHeight || 100;
      } else if (e.shiftKey) {
        const s = Math.max(Math.abs(w), Math.abs(h));
        w = s * Math.sign(w || 1);
        h = s * Math.sign(h || 1);
      }
      const rect = { x: Math.min(selectionStart.x, selectionStart.x + w), y: Math.min(selectionStart.y, selectionStart.y + h), w: Math.abs(w), h: Math.abs(h) };
      if (tool === 'crop') setCropRect(rect); else setMarqueeRect(rect);
      return;
    }

    if (tool === 'lasso' && selectionStart && e.buttons === 1) {
      setLassoPoints(prev => {
        const last = prev[prev.length - 1];
        if (last && Math.hypot(coords.x - last.x, coords.y - last.y) < 3 / zoom) return prev;
        return [...prev, coords];
      });
      return;
    }

    if (isDrawing && lastPoint) {
      const target = paintTargetIdRef.current ? rawLayers.find(l => l.id === paintTargetIdRef.current) : null;
      if (target) strokeSegment(lastPoint, coords, target);
      setLastPoint(coords);
      return;
    }

    if (tool === 'move' && !isTransforming) {
      const hit = hitTest(coords);
      const id = hit?.id || null;
      if (id !== hoverLayerId) setHoverLayerId(id);
    }
  };

  const handleMouseUp = async (e?: React.MouseEvent) => {
    if (tool === 'motion-path' && currentPath.length > 1) {
      const targetId = rawCurrentLayer && rawCurrentLayer.type !== 'audio' ? rawCurrentLayer.id : null;
      addMotionPath(currentPath, targetId);
      setStatusMessage(targetId ? `Motion path (${currentPath.length} pts) assigned to "${rawCurrentLayer!.name}" — animate Path Progress in Properties` : `Motion path created (${currentPath.length} pts) — select a layer and pick it under Properties → Motion Path`);
    }
    setCurrentPath([]);

    if (tool === 'gradient' && gradientStart && gradientEnd) {
      const dist = Math.hypot(gradientEnd.x - gradientStart.x, gradientEnd.y - gradientStart.y);
      if (dist > 2) await applyGradientFill(gradientStart, gradientEnd);
      setGradientStart(null);
      setGradientEnd(null);
    }

    if (isDrawing) {
      setIsDrawing(false);
      setLastPoint(null);
      await commitPaintBuffer(tool === 'eraser' ? 'Erase' : 'Brush Stroke');
    }

    if (tool === 'marquee' && marqueeRect) {
      if (marqueeRect.w > 2 && marqueeRect.h > 2) {
        setSelection({ type: 'marquee', active: true, points: [{ x: marqueeRect.x, y: marqueeRect.y }, { x: marqueeRect.x + marqueeRect.w, y: marqueeRect.y + marqueeRect.h }] });
        setStatusMessage(`Selection: ${Math.round(marqueeRect.w)}×${Math.round(marqueeRect.h)}px — Esc to deselect`);
      } else {
        setSelection({ type: null, active: false, points: [] });
      }
      setMarqueeRect(null);
    }

    if (tool === 'lasso' && lassoPoints.length) {
      if (lassoPoints.length > 3) {
        setSelection({ type: 'lasso', active: true, points: lassoPoints });
        setStatusMessage(`Lasso selection (${lassoPoints.length} points) — Esc to deselect`);
      } else {
        setSelection({ type: null, active: false, points: [] });
      }
      setLassoPoints([]);
    }

    if (tool === 'crop' && cropRect) {
      if (cropRect.w > 2 && cropRect.h > 2) await applyCrop(cropRect);
      setCropRect(null);
    }

    if (isTransforming) {
      const label = isTransforming === 'move' ? 'Move Layer' : isTransforming === 'rotate' ? 'Rotate Layer' : isTransforming.includes('skew') ? 'Skew Layer' : 'Scale Layer';
      endHistoryTransaction(label);
    }

    setIsPanning(false);
    setStartPan(null);
    setSelectionStart(null);
    setIsTransforming(null);
    setTransformStart(null);
    setActiveSmartGuides([]);
    void e;
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (tool !== 'move') return;
    const hit = hitTest(getCanvasCoords(e));
    if (hit) {
      selectLayer(hit.id);
      setActiveSidebarTab('properties');
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    const dropPoint = getDocCoords(e.clientX, e.clientY);
    const imported = await importImageFiles(files);
    imported.forEach((layer, i) => {
      const w = layer.bitmap?.width || 0, h = layer.bitmap?.height || 0;
      addLayer({ ...layer, transform: { ...layer.transform, x: Math.round(dropPoint.x - w / 2) + i * 20, y: Math.round(dropPoint.y - h / 2) + i * 20 } }, `Import ${layer.name}`);
    });
    if (imported.length) setStatusMessage(`Imported ${imported.length} image${imported.length > 1 ? 's' : ''}`);
  };

  const cursorClass = TOOL_CURSORS[tool] || 'cursor-crosshair';
  const selectedMotionPath = currentLayer?.motionPathId ? motionPaths.find(p => p.id === currentLayer.motionPathId) : null;

  const textStyle = (l: Layer): React.CSSProperties => ({
    fontFamily: `"${l.fontSettings?.family || 'Inter'}", Inter, system-ui, sans-serif`,
    fontSize: `${l.fontSettings?.size || 48}px`,
    fontWeight: l.fontSettings?.weight || 'bold',
    color: l.fontSettings?.color || '#ffffff',
    letterSpacing: `${l.fontSettings?.tracking || 0}px`,
    lineHeight: l.fontSettings?.leading || 1.2,
    whiteSpace: 'pre',
    width: 'max-content',
    height: 'auto'
  });

  return (
    <div
      ref={containerRef}
      className={`flex-1 bg-[#0a0a0a] relative overflow-hidden ${cursorClass} ${isDraggingFile ? 'ring-2 ring-inset ring-blue-500' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { if (isTransforming || isDrawing || isPanning || selectionStart || gradientStart || currentPath.length) void handleMouseUp(); setHoverLayerId(null); }}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => { e.preventDefault(); if (!isDraggingFile) setIsDraggingFile(true); }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={handleDrop}
    >
      {/* World Container - Handles Zoom and Pan via GPU Transforms */}
      <div
        ref={worldRef}
        className="absolute left-0 top-0 shadow-2xl origin-top-left"
        style={{
          width: DOC_WIDTH,
          height: DOC_HEIGHT,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          willChange: 'transform',
        }}
      >
        {/* Transparency Grid */}
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(45deg, #d4d4d8 25%, transparent 25%), linear-gradient(-45deg, #d4d4d8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d4d4d8 75%), linear-gradient(-45deg, transparent 75%, #d4d4d8 75%)',
            backgroundSize: '24px 24px',
            backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px',
            backgroundColor: '#f4f4f5'
          }}
        />

        <div className="absolute inset-0 overflow-hidden" style={{ isolation: 'isolate' }}>
          {layers.filter(l => !l.parentId).map((layer) => {
            const renderLayer = (l: Layer, keySuffix = ''): React.ReactNode => {
              if (!l.visible || l.type === 'audio' || l.isMask) return null;
              if (soloLayerId && l.id !== soloLayerId && l.parentId !== soloLayerId) return null;

              const maskLayer = l.maskId ? layers.find(m => m.id === l.maskId) : null;
              const motionPath = l.motionPathId ? motionPaths.find(p => p.id === l.motionPathId) : null;
              const pathOffset = motionPath ? getPointOnPath(motionPath.points, l.motionPathProgress || 0) : { x: 0, y: 0 };
              const transform = l.transform;
              const styles = l.layerStyles || {};
              const alphaHex = (o: number | undefined, d: number) => Math.round(Math.max(0, Math.min(1, o ?? d)) * 255).toString(16).padStart(2, '0');
              const dropShadow = styles.dropShadow?.enabled ? `${styles.dropShadow.distance}px ${styles.dropShadow.distance}px ${styles.dropShadow.size}px ${styles.dropShadow.color}${alphaHex(styles.dropShadow.opacity, 0.7)}` : '';
              const innerShadow = styles.innerShadow?.enabled ? `inset ${styles.innerShadow.distance}px ${styles.innerShadow.distance}px ${styles.innerShadow.size}px ${styles.innerShadow.color}${alphaHex(styles.innerShadow.opacity, 0.5)}` : '';
              const bevel = styles.bevelEmboss?.enabled ? `inset ${styles.bevelEmboss.distance}px ${styles.bevelEmboss.distance}px ${styles.bevelEmboss.size}px rgba(255,255,255,${styles.bevelEmboss.opacity}), inset -${styles.bevelEmboss.distance}px -${styles.bevelEmboss.distance}px ${styles.bevelEmboss.size}px rgba(0,0,0,${styles.bevelEmboss.opacity})` : '';
              const strokeStyle = styles.stroke?.enabled ? `${styles.stroke.width}px solid ${styles.stroke.color}${alphaHex(styles.stroke.opacity, 1)}` : undefined;
              const isFullDoc = l.type === 'adjustment' || l.type === 'group';

              const style: React.CSSProperties = {
                position: 'absolute',
                left: isFullDoc ? 0 : transform.x + pathOffset.x,
                top: isFullDoc ? 0 : transform.y + pathOffset.y,
                width: l.type === 'shape' ? SHAPE_SIZE : isFullDoc ? '100%' : undefined,
                height: l.type === 'shape' ? SHAPE_SIZE : isFullDoc ? '100%' : undefined,
                transform: isFullDoc ? undefined : `scale(${transform.scaleX}, ${transform.scaleY}) rotate(${transform.rotation}deg) skew(${transform.skewX || 0}deg, ${transform.skewY || 0}deg)`,
                transformOrigin: '0 0',
                opacity: l.opacity,
                mixBlendMode: l.blendMode as any,
                outline: strokeStyle,
                outlineOffset: styles.stroke?.enabled ? `-${styles.stroke.width}px` : undefined,
                boxShadow: [dropShadow, innerShadow, bevel].filter(Boolean).join(', ') || undefined,
                filter: l.type === 'adjustment' ? undefined : [
                  l.adjustments.brightness !== 100 ? `brightness(${l.adjustments.brightness}%)` : '',
                  l.adjustments.contrast !== 100 ? `contrast(${l.adjustments.contrast}%)` : '',
                  l.adjustments.saturation !== 100 ? `saturate(${l.adjustments.saturation}%)` : '',
                  l.adjustments.hue ? `hue-rotate(${l.adjustments.hue}deg)` : '',
                  styles.outerGlow?.enabled ? `drop-shadow(0 0 ${styles.outerGlow.size}px ${styles.outerGlow.color})` : '',
                  l.calculatedMotionBlur && l.calculatedMotionBlur.blurPx > 0.5 ? `blur(${l.calculatedMotionBlur.blurPx.toFixed(1)}px)` : ''
                ].filter(Boolean).join(' ') || undefined,
                backdropFilter: l.type === 'adjustment' ? `brightness(${l.adjustments.brightness}%) contrast(${l.adjustments.contrast}%) saturate(${l.adjustments.saturation}%) hue-rotate(${l.adjustments.hue}deg)` : undefined,
                WebkitBackdropFilter: l.type === 'adjustment' ? `brightness(${l.adjustments.brightness}%) contrast(${l.adjustments.contrast}%) saturate(${l.adjustments.saturation}%) hue-rotate(${l.adjustments.hue}deg)` : undefined,
                zIndex: layers.indexOf(l),
                maskImage: maskLayer && maskUrls[maskLayer.id] ? `url(${maskUrls[maskLayer.id]})` : undefined,
                WebkitMaskImage: maskLayer && maskUrls[maskLayer.id] ? `url(${maskUrls[maskLayer.id]})` : undefined,
                maskSize: maskLayer ? `${DOC_WIDTH}px ${DOC_HEIGHT}px` : undefined,
                maskRepeat: 'no-repeat',
                maskPosition: maskLayer ? `${(maskLayer.transform.x - transform.x)}px ${(maskLayer.transform.y - transform.y)}px` : undefined,
                pointerEvents: 'none'
              };

              const key = l.id + keySuffix;

              if (l.type === 'group') {
                const children = layers.filter(child => child.parentId === l.id);
                return (
                  <div key={key} style={style}>
                    {children.map(child => renderLayer(child))}
                  </div>
                );
              }

              if (l.type === 'cloner' && l.clonerSettings) {
                const { count, mode, offset, step } = l.clonerSettings;
                const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
                return (
                  <React.Fragment key={key}>
                    {Array.from({ length: Math.min(200, count) }).map((_, i) => {
                      let cloneX = 0, cloneY = 0, cloneRot = 0;
                      if (mode === 'linear') { cloneX = i * offset.x; cloneY = i * offset.y; cloneRot = i * offset.rotation; }
                      else if (mode === 'radial') { const angle = (i / count) * Math.PI * 2; cloneX = Math.cos(angle) * step; cloneY = Math.sin(angle) * step; cloneRot = (angle * 180) / Math.PI; }
                      else { cloneX = (i % cols) * step; cloneY = Math.floor(i / cols) * step; }
                      const shape = l.shapeSettings || { type: 'circle' as const, fill: '#8b5cf6', stroke: '#ffffff', strokeWidth: 2 };
                      return (
                        <div
                          key={`${key}-clone-${i}`}
                          style={{
                            ...style,
                            width: SHAPE_SIZE,
                            height: SHAPE_SIZE,
                            left: transform.x + pathOffset.x,
                            top: transform.y + pathOffset.y,
                            transform: `scale(${transform.scaleX}, ${transform.scaleY}) rotate(${transform.rotation}deg) translate(${cloneX}px, ${cloneY}px) rotate(${cloneRot}deg)`,
                            backgroundColor: shape.fill,
                            border: `${shape.strokeWidth}px solid ${shape.stroke}`,
                            borderRadius: shape.type === 'circle' ? '50%' : 0,
                            boxSizing: 'border-box'
                          }}
                        />
                      );
                    })}
                  </React.Fragment>
                );
              }

              if (l.type === 'shape' && l.shapeSettings) {
                return (
                  <div
                    key={key}
                    style={{
                      ...style,
                      backgroundColor: l.shapeSettings.fill,
                      border: `${l.shapeSettings.strokeWidth}px solid ${l.shapeSettings.stroke}`,
                      borderRadius: l.shapeSettings.type === 'circle' ? '50%' : '0',
                      boxSizing: 'border-box'
                    }}
                  />
                );
              }

              if (l.type === 'adjustment') {
                return <div key={key} style={style} />;
              }

              if (l.type === '3d-text') {
                const depth = Math.max(1, l.fontSettings?.depth || 10);
                const base = textStyle(l);
                return (
                  <div key={key} style={{ ...style, ...base, position: 'absolute', color: undefined }}>
                    {Array.from({ length: depth }).map((_, i) => {
                      const isFront = i === depth - 1;
                      const layerIndex = depth - 1 - i; // back to front
                      return (
                        <span
                          key={i}
                          style={{
                            position: isFront ? 'relative' : 'absolute',
                            left: 0,
                            top: 0,
                            whiteSpace: 'pre',
                            color: isFront ? (l.fontSettings?.color || '#3b82f6') : `rgba(0,0,0,${Math.max(0.15, 1 - layerIndex / (depth * 1.5))})`,
                            transform: `translate(${layerIndex}px, ${-layerIndex}px)`,
                            textShadow: isFront ? '0 0 10px rgba(0,0,0,0.5)' : 'none',
                            filter: !isFront && (l.fontSettings?.bevel || 0) > 0 ? `blur(${Math.min(2, (l.fontSettings?.bevel || 0) / 10)}px)` : undefined
                          }}
                        >
                          {l.content}
                        </span>
                      );
                    })}
                  </div>
                );
              }

              if (l.type === 'text') {
                const text = l.content || '';
                const animator = l.textAnimatorSettings;
                if (animator) {
                  const time = currentTime * animator.speed * 2;
                  const chars = text.split('');
                  return (
                    <div key={key} style={{ ...style, ...textStyle(l), display: 'flex', gap: '4px' }}>
                      {chars.map((char, i) => {
                        const progress = chars.length > 1 ? i / (chars.length - 1) : 0;
                        const inRange = progress >= (animator.range?.start ?? 0) && progress <= (animator.range?.end ?? 1);
                        let charOffset = 0, charOpacity = 1, charScale = 1;
                        const phase = progress * Math.PI * 2 + animator.offset;
                        if (inRange) {
                          if (animator.animationType === 'wave') charOffset = Math.sin(time + phase) * 20 * animator.smoothness;
                          else if (animator.animationType === 'bounce') charOffset = Math.abs(Math.sin(time + phase)) * -30 * animator.smoothness;
                          else if (animator.animationType === 'reveal') {
                            const revealProgress = (Math.sin(time * 0.5) + 1) / 2;
                            charOpacity = Math.max(0, Math.min(1, (revealProgress - progress) / 0.1 + 1));
                            charScale = 0.5 + charOpacity * 0.5;
                          } else if (animator.animationType === 'glitch') {
                            const seed = Math.sin(i * 12.9898 + Math.floor(time * 8) * 78.233) * 43758.5453;
                            const r = seed - Math.floor(seed);
                            charOffset = r > 0.85 ? (r - 0.9) * 120 : 0;
                            charOpacity = r > 0.95 ? 0.4 : 1;
                          }
                        }
                        return (
                          <span key={i} style={{ display: 'inline-block', transform: `translateY(${charOffset}px) scale(${charScale})`, opacity: charOpacity }}>
                            {char === ' ' ? ' ' : char}
                          </span>
                        );
                      })}
                    </div>
                  );
                }
                return (
                  <div key={key} style={{ ...style, ...textStyle(l) }}>
                    {text}
                  </div>
                );
              }

              if (l.type === 'vector' || l.vectorSettings) {
                return (
                  <VectorCanvas
                    key={key}
                    layer={l}
                    isSelected={l.id === selectedLayerId}
                    tool={tool}
                    zoom={zoom}
                    style={{ ...style, left: transform.x, top: transform.y, width: DOC_WIDTH, height: DOC_HEIGHT }}
                    onUpdatePath={(settings, commit) => {
                      if (commit) {
                        updateLayerCommitted(l.id, { vectorSettings: settings }, settings.closed && !l.vectorSettings?.closed ? 'Close Path' : 'Edit Path');
                        if (settings.closed && !l.vectorSettings?.closed) setStatusMessage('Path closed');
                      } else updateLayer(l.id, { vectorSettings: settings });
                    }}
                  />
                );
              }

              if (l.proceduralSettings?.type === 'particles' && l.proceduralSettings.particles) {
                return (
                  <div key={key} style={{ ...style, left: transform.x - DOC_WIDTH / 2, top: transform.y - DOC_HEIGHT / 2, width: DOC_WIDTH, height: DOC_HEIGHT, transformOrigin: '50% 50%' }}>
                    <ParticleCanvas settings={l.proceduralSettings.particles} currentTime={currentTime} width={DOC_WIDTH} height={DOC_HEIGHT} />
                  </div>
                );
              }

              // Raster layer
              const rasterW = l.bitmap ? l.bitmap.width : DOC_WIDTH;
              const rasterH = l.bitmap ? l.bitmap.height : DOC_HEIGHT;
              return (
                <canvas
                  key={key}
                  ref={registerLayerCanvas(l.id)}
                  width={rasterW}
                  height={rasterH}
                  style={{ ...style, width: rasterW, height: rasterH }}
                />
              );
            };

            return (
              <React.Fragment key={layer.id}>
                {layer.bitmap && (
                  <ChromaKeyProcessor layerId={layer.id} source={layer.bitmap} adjustments={layer.adjustments} onProcessed={handleProcessed} />
                )}
                {renderLayer(layer)}
              </React.Fragment>
            );
          })}

          {/* Processors for raster layers nested inside groups */}
          {layers.filter(l => l.parentId && l.bitmap).map(l => (
            <ChromaKeyProcessor key={`proc-${l.id}`} layerId={l.id} source={l.bitmap} adjustments={l.adjustments} onProcessed={handleProcessed} />
          ))}
        </div>

        {/* Onion Skin Ghost Overlays */}
        {onionSkinEnabled && (
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5000 }}>
            {[{ set: prevOnionLayers, cls: 'border-red-500/80', bg: 'rgba(239, 68, 68, 0.15)', label: 'Prev', text: 'text-red-300 bg-red-950/80' },
              { set: nextOnionLayers, cls: 'border-emerald-500/80', bg: 'rgba(16, 185, 129, 0.15)', label: 'Next', text: 'text-emerald-300 bg-emerald-950/80' }].map(({ set, cls, bg, label, text }) =>
              set.map((gl) => {
                if (!gl.visible || gl.type === 'audio' || gl.type === 'adjustment' || gl.type === 'group') return null;
                if (gl.type === 'raster' && !gl.bitmap) return null;
                const box = getLayerBox(gl);
                const tr = gl.transform;
                return (
                  <div
                    key={`onion-${label}-${gl.id}`}
                    className={`absolute border-2 ${cls} rounded pointer-events-none`}
                    style={{
                      left: tr.x + box.offsetX * tr.scaleX,
                      top: tr.y + box.offsetY * tr.scaleY,
                      width: box.w * tr.scaleX,
                      height: box.h * tr.scaleY,
                      transform: `rotate(${tr.rotation}deg)`,
                      transformOrigin: '0 0',
                      opacity: (gl.opacity || 1) * (onionSkinSettings.opacity || 0.35),
                      backgroundColor: bg
                    }}
                  >
                    <span className={`text-[9px] font-mono font-bold px-1 rounded absolute -top-4 left-0 ${text}`} style={{ fontSize: 9 / zoom }}>{label} Frame</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Pixel Selection Overlay (marching ants) */}
      {(marqueeRect || (selection?.active && selection.type === 'marquee' && selection.points?.length >= 2)) && (() => {
        const r = marqueeRect || {
          x: Math.min(selection.points[0].x, selection.points[1].x),
          y: Math.min(selection.points[0].y, selection.points[1].y),
          w: Math.abs(selection.points[1].x - selection.points[0].x),
          h: Math.abs(selection.points[1].y - selection.points[0].y)
        };
        return (
          <div
            className="absolute border border-dashed border-white shadow-[0_0_0_1px_black] pointer-events-none z-30"
            style={{
              left: r.x * zoom + pan.x,
              top: r.y * zoom + pan.y,
              width: r.w * zoom,
              height: r.h * zoom,
              boxShadow: selection?.feather > 0 ? `0 0 ${selection.feather * zoom}px rgba(255,255,255,0.6)` : undefined
            }}
          />
        );
      })()}

      {(lassoPoints.length > 1 || (selection?.active && selection.type === 'lasso' && selection.points?.length > 2)) && (
        <svg className="absolute inset-0 pointer-events-none z-30" width="100%" height="100%">
          <polygon
            points={(lassoPoints.length > 1 ? lassoPoints : selection.points).map((p: Point) => `${p.x * zoom + pan.x},${p.y * zoom + pan.y}`).join(' ')}
            fill="rgba(59,130,246,0.08)"
            stroke="#fff"
            strokeWidth={1}
            strokeDasharray="4 3"
            style={{ filter: 'drop-shadow(0 0 1px #000)' }}
          />
        </svg>
      )}

      {cropRect && (
        <>
          <div className="absolute inset-0 pointer-events-none z-30" style={{ background: 'rgba(0,0,0,0.45)', clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${cropRect.x * zoom + pan.x}px ${cropRect.y * zoom + pan.y}px, ${cropRect.x * zoom + pan.x}px ${(cropRect.y + cropRect.h) * zoom + pan.y}px, ${(cropRect.x + cropRect.w) * zoom + pan.x}px ${(cropRect.y + cropRect.h) * zoom + pan.y}px, ${(cropRect.x + cropRect.w) * zoom + pan.x}px ${cropRect.y * zoom + pan.y}px, ${cropRect.x * zoom + pan.x}px ${cropRect.y * zoom + pan.y}px)` }} />
          <div className="absolute border-2 border-amber-400 pointer-events-none z-30" style={{ left: cropRect.x * zoom + pan.x, top: cropRect.y * zoom + pan.y, width: cropRect.w * zoom, height: cropRect.h * zoom }}>
            <span className="absolute -top-5 left-0 bg-amber-400 text-black text-[9px] font-bold px-1.5 py-0.5 rounded">Crop {Math.round(cropRect.w)}×{Math.round(cropRect.h)}</span>
          </div>
        </>
      )}

      {/* Gradient Preview */}
      {gradientStart && gradientEnd && (
        <div
          className="absolute pointer-events-none z-30"
          style={{
            left: gradientStart.x * zoom + pan.x,
            top: gradientStart.y * zoom + pan.y,
            width: Math.hypot(gradientEnd.x - gradientStart.x, gradientEnd.y - gradientStart.y) * zoom,
            height: 3,
            background: `linear-gradient(to right, ${(gradientOptions?.colors || ['#000', '#fff']).join(', ')})`,
            transform: `rotate(${Math.atan2(gradientEnd.y - gradientStart.y, gradientEnd.x - gradientStart.x)}rad)`,
            transformOrigin: '0 50%',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.6)'
          }}
        />
      )}

      {/* Motion path overlays (in-progress + selected layer's path) */}
      {(currentPath.length > 1 || (selectedMotionPath && tool === 'move') || tool === 'motion-path') && (
        <svg className="absolute inset-0 pointer-events-none z-30" width="100%" height="100%">
          {selectedMotionPath && (
            <polyline
              points={selectedMotionPath.points.map(p => `${p.x * zoom + pan.x},${p.y * zoom + pan.y}`).join(' ')}
              fill="none" stroke="#f0abfc" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.9}
            />
          )}
          {currentPath.length > 1 && (
            <polyline
              points={currentPath.map(p => `${p.x * zoom + pan.x},${p.y * zoom + pan.y}`).join(' ')}
              fill="none" stroke="#38bdf8" strokeWidth={2}
            />
          )}
        </svg>
      )}

      {/* Smart Guides Overlay Lines */}
      {activeSmartGuides.map((guide, idx) => guide.type === 'v' ? (
        <div key={`guide-v-${idx}`} className="absolute top-0 bottom-0 border-l-2 border-dashed border-fuchsia-400 shadow-[0_0_10px_#f0abfc] z-40 pointer-events-none" style={{ left: guide.pos * zoom + pan.x }}>
          <div className="absolute top-4 left-1 bg-fuchsia-950/90 border border-fuchsia-500 text-fuchsia-200 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
            {guide.label} ({Math.round(guide.pos)}px)
          </div>
        </div>
      ) : (
        <div key={`guide-h-${idx}`} className="absolute left-0 right-0 border-t-2 border-dashed border-cyan-400 shadow-[0_0_10px_#38bdf8] z-40 pointer-events-none" style={{ top: guide.pos * zoom + pan.y }}>
          <div className="absolute left-4 top-1 bg-cyan-950/90 border border-cyan-500 text-cyan-200 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
            {guide.label} ({Math.round(guide.pos)}px)
          </div>
        </div>
      ))}

      {/* Hover outline */}
      {tool === 'move' && hoverLayerId && hoverLayerId !== selectedLayerId && !isTransforming && (() => {
        const hl = layers.find(l => l.id === hoverLayerId);
        if (!hl) return null;
        const box = getLayerBox(hl);
        const t = hl.transform;
        return (
          <div
            className="absolute border border-blue-400/70 pointer-events-none z-30"
            style={{
              left: t.x * zoom + pan.x,
              top: t.y * zoom + pan.y,
              width: box.w * t.scaleX * zoom,
              height: box.h * t.scaleY * zoom,
              transform: `rotate(${t.rotation}deg) translate(${box.offsetX * t.scaleX * zoom}px, ${box.offsetY * t.scaleY * zoom}px)`,
              transformOrigin: '0 0'
            }}
          />
        );
      })()}

      {/* Transform Gizmo Controls */}
      {rawCurrentLayer && currentLayer && (tool === 'move' || tool === 'text-animator') && rawCurrentLayer.type !== 'audio' && rawCurrentLayer.type !== 'adjustment' && (() => {
        const layer = rawCurrentLayer;
        const shown = currentLayer; // evaluated (animated) position for display
        const box = getLayerBox(shown);
        const t = shown.transform;
        const motionPath = shown.motionPathId ? motionPaths.find(p => p.id === shown.motionPathId) : null;
        const off = motionPath ? getPointOnPath(motionPath.points, shown.motionPathProgress || 0) : { x: 0, y: 0 };
        const width = box.w * t.scaleX * zoom;
        const height = box.h * t.scaleY * zoom;
        const locked = layer.locked;

        return (
          <div
            className="absolute z-40"
            style={{
              left: (t.x + off.x) * zoom + pan.x,
              top: (t.y + off.y) * zoom + pan.y,
              width: 0,
              height: 0,
              transform: `rotate(${t.rotation}deg) skew(${t.skewX || 0}deg, ${t.skewY || 0}deg)`,
              transformOrigin: '0 0',
              pointerEvents: 'none'
            }}
          >
            <div
              className={`absolute border-2 ${locked ? 'border-gray-500 border-dashed' : 'border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.5)] cursor-move'} group`}
              style={{ left: box.offsetX * t.scaleX * zoom, top: box.offsetY * t.scaleY * zoom, width, height, pointerEvents: locked ? 'none' : 'auto' }}
              onMouseDown={(e) => { if (!locked) beginTransform('move', e, layer); }}
            >
              {/* Real-time Transform Feedback Badge */}
              <div className="absolute -top-7 left-0 bg-[#111]/90 border border-blue-500/80 text-blue-300 text-[9px] font-mono font-bold px-2 py-0.5 rounded shadow flex items-center gap-2 whitespace-nowrap pointer-events-none">
                <span className="text-gray-400 max-w-[120px] truncate">{layer.name}</span>
                <span className="text-gray-600">|</span>
                <span>X: {Math.round(t.x)} Y: {Math.round(t.y)}</span>
                <span className="text-gray-600">|</span>
                <span>W: {Math.round(box.w * t.scaleX)} H: {Math.round(box.h * t.scaleY)}</span>
                <span className="text-gray-600">|</span>
                <span>R: {Math.round(t.rotation)}°</span>
                {(t.skewX || t.skewY) ? <><span className="text-gray-600">|</span><span>Sk: {t.skewX || 0}° / {t.skewY || 0}°</span></> : null}
                {locked && <span className="text-amber-400">🔒 locked</span>}
              </div>

              {!locked && (
                <>
                  {/* Rotation Stem & Handle */}
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center">
                    <div
                      className="w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-full cursor-grab active:cursor-grabbing hover:scale-125 shadow-md transition-transform"
                      title="Rotate Layer (Hold Shift for 15° Snap)"
                      onMouseDown={(e) => beginTransform('rotate', e, layer)}
                    />
                    <div className="w-0.5 h-3.5 bg-blue-500" />
                  </div>

                  {HANDLE_CORNERS.map((h) => (
                    <div
                      key={h.pos}
                      title={h.title}
                      className={`absolute w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-sm shadow hover:scale-125 transition-transform ${h.cursor}`}
                      style={{
                        top: h.pos.startsWith('t') ? -7 : 'auto',
                        bottom: h.pos.startsWith('b') ? -7 : 'auto',
                        left: h.pos.endsWith('l') ? -7 : 'auto',
                        right: h.pos.endsWith('r') ? -7 : 'auto'
                      }}
                      onMouseDown={(e) => beginTransform(`handle-${h.pos}`, e, layer)}
                    />
                  ))}

                  {HANDLE_EDGES.map((h) => (
                    <div
                      key={h.pos}
                      title={h.title}
                      className={`absolute w-3 h-3 bg-blue-500 border-2 border-white rounded-sm shadow hover:scale-125 transition-transform ${h.cursor}`}
                      style={h.style}
                      onMouseDown={(e) => beginTransform(`handle-${h.pos}`, e, layer)}
                    />
                  ))}

                  <div
                    title="Skew Horizontally"
                    className="absolute -right-4 top-1/2 -translate-y-1/2 w-3 h-3 bg-amber-400 border-2 border-black rotate-45 shadow hover:scale-125 transition-transform cursor-col-resize"
                    onMouseDown={(e) => beginTransform('handle-skew-x', e, layer)}
                  />
                  <div
                    title="Skew Vertically"
                    className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3 h-3 bg-amber-400 border-2 border-black rotate-45 shadow hover:scale-125 transition-transform cursor-row-resize"
                    onMouseDown={(e) => beginTransform('handle-skew-y', e, layer)}
                  />
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Drop hint */}
      {isDraggingFile && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
          <div className="bg-blue-600/90 text-white text-sm font-bold px-6 py-3 rounded-xl shadow-2xl">Drop images to import as layers</div>
        </div>
      )}

      {/* Bottom Overlay Info & Smart Guides Toggle */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 z-10">
        <button
          onClick={fitToScreen}
          className="bg-black/60 hover:bg-black/80 text-white text-[10px] font-mono px-2 py-1 rounded backdrop-blur-sm shadow border border-[#333]"
          title="Fit document to viewport (Shift+0)"
        >
          Zoom: {Math.round(zoom * 100)}% · Fit
        </button>

        <button
          onClick={() => setSmartGuidesEnabled(!smartGuidesEnabled)}
          className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-all flex items-center gap-1.5 shadow backdrop-blur-sm ${
            smartGuidesEnabled
              ? 'bg-fuchsia-950/80 border-fuchsia-500 text-fuchsia-300'
              : 'bg-black/60 border-[#333] text-gray-400 hover:text-white'
          }`}
          title="Toggle Smart Alignment Guides and Canvas Snapping (Ctrl+Shift+G). Hold Alt while dragging to bypass."
        >
          <span className={`w-2 h-2 rounded-full ${smartGuidesEnabled ? 'bg-fuchsia-400 shadow-[0_0_8px_#f0abfc]' : 'bg-gray-500'}`} />
          Smart Guides {smartGuidesEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
});

Canvas.displayName = 'Canvas';

export { buildFontString };
