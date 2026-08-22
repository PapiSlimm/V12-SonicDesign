import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useMemo } from 'react';
import { Tool, Layer } from '../core/types';
import { ChromaKeyProcessor } from './ChromaKeyProcessor';
import { ParticleCanvas } from './ParticleCanvas';
import { VectorCanvas } from './VectorCanvas';
import { useStore } from '../store/index';
import { computeLayersAtTime } from '../hooks/useDerivedLayers';

interface CanvasProps {
  onCanvasUpdate?: () => void;
  layers: Layer[];
  motionPaths: any[];
  selectedLayerId: string | null;
  tool: Tool;
  zoom: number;
  pan: { x: number, y: number };
  brushSize: number;
  brushOpacity: number;
  selection: any;
  gradientOptions: any;
  setPan: (pan: { x: number, y: number }) => void;
  setZoom: (zoom: number) => void;
}

export interface CanvasHandle {
  toDataURL: () => string;
  getCanvas: () => HTMLCanvasElement | null;
  exportComposite: () => Promise<string>;
  getActiveLayer: () => Layer | null;
  getPixelData: (x: number, y: number, w: number, h: number) => ImageData | null;
  renderFrame: (time: number) => Promise<void>;
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
  const [transformStart, setTransformStart] = useState<{ 
    x: number; 
    y: number; 
    layerX: number; 
    layerY: number; 
    scaleX: number; 
    scaleY: number; 
    rotation: number;
    skewX: number;
    skewY: number;
  } | null>(null);
  const [gradientStart, setGradientStart] = useState<{ x: number, y: number } | null>(null);
  const [gradientEnd, setGradientEnd] = useState<{ x: number, y: number } | null>(null);
  const [activeSmartGuides, setActiveSmartGuides] = useState<Array<{ type: 'v' | 'h', pos: number, label: string }>>([]);

  const {
    updateLayer,
    addTextLayer,
    onionSkinEnabled,
    onionSkinSettings,
    currentTime,
    duration,
    smartGuidesEnabled,
    setSmartGuidesEnabled,
    layers: rawLayers,
    soloLayerId
  } = useStore();

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState<{ x: number, y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState<{ x: number, y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [selectionStart, setSelectionStart] = useState<{ x: number, y: number } | null>(null);
  const [currentPath, setCurrentPath] = useState<{ x: number, y: number }[]>([]);

  useImperativeHandle(ref, () => ({
    toDataURL: () => {
      if (!canvasRef.current) return '';
      return canvasRef.current.toDataURL();
    },
    getCanvas: () => canvasRef.current,
    exportComposite: async () => {
      const compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = 1920;
      compositeCanvas.height = 1080;
      const ctx = compositeCanvas.getContext('2d');
      if (!ctx) return '';

      // Render all visible layers to composite
      for (const layer of layers) {
        if (!layer.visible) continue;
        const processed = processedCanvases[layer.id];
        if (processed) {
          ctx.save();
          ctx.globalAlpha = layer.opacity;
          ctx.globalCompositeOperation = (layer.blendMode as GlobalCompositeOperation) || 'source-over';
          
          const transform = layer.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
          ctx.translate(transform.x, transform.y);
          ctx.rotate((transform.rotation * Math.PI) / 180);
          ctx.scale(transform.scaleX, transform.scaleY);
          
          ctx.drawImage(processed, 0, 0);
          ctx.restore();
        }
      }
      return compositeCanvas.toDataURL();
    },
    getActiveLayer: () => layers.find(l => l.id === selectedLayerId) || null,
    getPixelData: (x, y, w, h) => {
      if (!canvasRef.current) return null;
      const ctx = canvasRef.current.getContext('2d');
      return ctx ? ctx.getImageData(x, y, w, h) : null;
    },
    renderFrame: async (time) => {
      // This would involve triggering a re-render or calculating positions at 'time'
      // For now, it's a stub that could be expanded or utilized by export systems
      console.log('Rendering frame at:', time);
    }
  }));

  // Map to store processed canvases for each layer
  const [processedCanvases, setProcessedCanvases] = useState<Record<string, HTMLCanvasElement>>({});

  const handleProcessed = (layerId: string, canvas: HTMLCanvasElement) => {
    setProcessedCanvases(prev => ({ ...prev, [layerId]: canvas }));
  };

  // Initialize canvas size
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = 1920;
      canvasRef.current.height = 1080;
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 1920, 1080);
      }
    }
  }, []);

  // Update selected layer canvas when bitmap changes
  useEffect(() => {
    const layer = layers.find(l => l.id === selectedLayerId);
    if (layer && layer.bitmap && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 1920, 1080);
        ctx.drawImage(layer.bitmap, 0, 0);
      }
    }
  }, [selectedLayerId]);

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    return {
      x: (clientX - rect.left) * (canvasRef.current.width / rect.width),
      y: (clientY - rect.top) * (canvasRef.current.height / rect.height)
    };
  };

  const sampleColorAtCoords = (x: number, y: number) => {
    try {
      const compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = 1920;
      compositeCanvas.height = 1080;
      const ctx = compositeCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return '#3b82f6';

      for (const l of layers) {
        if (!l.visible) continue;
        if (l.type === 'shape' && l.shapeSettings) {
          ctx.save();
          ctx.fillStyle = l.shapeSettings.fill;
          const tr = l.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
          ctx.translate(tr.x, tr.y);
          ctx.rotate((tr.rotation * Math.PI) / 180);
          ctx.scale(tr.scaleX, tr.scaleY);
          if (l.shapeSettings.type === 'circle') {
            ctx.beginPath();
            ctx.arc(100, 100, 100, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillRect(0, 0, 200, 200);
          }
          ctx.restore();
        } else if (l.bitmap) {
          ctx.save();
          ctx.globalAlpha = l.opacity;
          const tr = l.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
          ctx.translate(tr.x, tr.y);
          ctx.rotate((tr.rotation * Math.PI) / 180);
          ctx.scale(tr.scaleX, tr.scaleY);
          ctx.drawImage(l.bitmap, 0, 0);
          ctx.restore();
        }
      }

      if (canvasRef.current) {
        ctx.drawImage(canvasRef.current, 0, 0);
      }

      const pixel = ctx.getImageData(Math.min(1919, Math.max(0, Math.round(x))), Math.min(1079, Math.max(0, Math.round(y))), 1, 1).data;
      return '#' + [pixel[0], pixel[1], pixel[2]].map(v => v.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      return '#3b82f6';
    }
  };

  const getLayerDimensions = (l: Layer) => {
    if (l.type === 'shape') {
      return { w: 200, h: 200 };
    }
    if (l.type === 'text' || l.type === '3d-text' || (l.type as string) === 'text-animator') {
      const textLen = (l.content || l.name || 'Text').length;
      const fontSize = l.fontSettings?.size || 48;
      return { w: Math.max(140, textLen * fontSize * 0.55), h: Math.max(50, fontSize * 1.3) };
    }
    return { w: 300, h: 200 };
  };

  const calculateSmartGuides = (
    rawX: number,
    rawY: number,
    w: number,
    h: number,
    scaleX: number,
    scaleY: number,
    currentLayerId: string,
    allLayers: Layer[]
  ) => {
    const layerWidth = w * scaleX;
    const layerHeight = h * scaleY;

    const left = rawX;
    const centerX = rawX + layerWidth / 2;
    const right = rawX + layerWidth;

    const top = rawY;
    const centerY = rawY + layerHeight / 2;
    const bottom = rawY + layerHeight;

    // Reference targets
    const vTargets: { pos: number; label: string }[] = [
      { pos: 0, label: 'Canvas Left Edge' },
      { pos: 960, label: 'Canvas Center X' },
      { pos: 1920, label: 'Canvas Right Edge' },
    ];

    const hTargets: { pos: number; label: string }[] = [
      { pos: 0, label: 'Canvas Top Edge' },
      { pos: 540, label: 'Canvas Center Y' },
      { pos: 1080, label: 'Canvas Bottom Edge' },
    ];

    // Add other visible layers
    allLayers.forEach(l => {
      if (l.id === currentLayerId || !l.visible) return;
      const { w: lw, h: lh } = getLayerDimensions(l);
      const lx = l.transform.x;
      const ly = l.transform.y;
      const lWidth = lw * l.transform.scaleX;
      const lHeight = lh * l.transform.scaleY;

      vTargets.push(
        { pos: lx, label: `Align Left (${l.name})` },
        { pos: lx + lWidth / 2, label: `Align Center X (${l.name})` },
        { pos: lx + lWidth, label: `Align Right (${l.name})` }
      );

      hTargets.push(
        { pos: ly, label: `Align Top (${l.name})` },
        { pos: ly + lHeight / 2, label: `Align Center Y (${l.name})` },
        { pos: ly + lHeight, label: `Align Bottom (${l.name})` }
      );
    });

    const threshold = 10;
    let snappedX = rawX;
    let snappedY = rawY;
    const guides: { type: 'v' | 'h'; pos: number; label: string }[] = [];

    // Snap X
    let bestVDist = threshold + 1;
    let bestVGuide: { pos: number; label: string } | null = null;
    let bestXCorrection = 0;

    vTargets.forEach(target => {
      const dLeft = Math.abs(left - target.pos);
      const dCenter = Math.abs(centerX - target.pos);
      const dRight = Math.abs(right - target.pos);

      if (dLeft < bestVDist) {
        bestVDist = dLeft;
        bestVGuide = target;
        bestXCorrection = target.pos - left;
      }
      if (dCenter < bestVDist) {
        bestVDist = dCenter;
        bestVGuide = target;
        bestXCorrection = target.pos - centerX;
      }
      if (dRight < bestVDist) {
        bestVDist = dRight;
        bestVGuide = target;
        bestXCorrection = target.pos - right;
      }
    });

    if (bestVGuide && bestVDist <= threshold) {
      snappedX = rawX + bestXCorrection;
      guides.push({ type: 'v', pos: bestVGuide.pos, label: bestVGuide.label });
    }

    // Snap Y
    let bestHDist = threshold + 1;
    let bestHGuide: { pos: number; label: string } | null = null;
    let bestYCorrection = 0;

    hTargets.forEach(target => {
      const dTop = Math.abs(top - target.pos);
      const dCenter = Math.abs(centerY - target.pos);
      const dBottom = Math.abs(bottom - target.pos);

      if (dTop < bestHDist) {
        bestHDist = dTop;
        bestHGuide = target;
        bestYCorrection = target.pos - top;
      }
      if (dCenter < bestHDist) {
        bestHDist = dCenter;
        bestHGuide = target;
        bestYCorrection = target.pos - centerY;
      }
      if (dBottom < bestHDist) {
        bestHDist = dBottom;
        bestHGuide = target;
        bestYCorrection = target.pos - bottom;
      }
    });

    if (bestHGuide && bestHDist <= threshold) {
      snappedY = rawY + bestYCorrection;
      guides.push({ type: 'h', pos: bestHGuide.pos, label: bestHGuide.label });
    }

    return { snappedX, snappedY, guides };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);

    if (tool === 'eyedropper' || tool === 'color-picker') {
      const sampledHex = sampleColorAtCoords(coords.x, coords.y);
      if (sampledHex) {
        useStore.getState().setBrushColor(sampledHex);
        const currentL = layers.find(l => l.id === selectedLayerId);
        if (currentL && currentL.type === 'shape' && currentL.shapeSettings) {
          updateLayer(currentL.id, { shapeSettings: { ...currentL.shapeSettings, fill: sampledHex } });
        } else if (currentL && (currentL.type === 'text' || currentL.type === '3d-text') && currentL.fontSettings) {
          updateLayer(currentL.id, { fontSettings: { ...currentL.fontSettings, color: sampledHex } });
        }
      }
      return;
    }

    if (tool === 'hand' || (tool === 'move' && e.button === 1)) {
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (tool === 'text') {
      addTextLayer(false, coords.x, coords.y);
      return;
    }

    if (tool === 'gradient') {
      setGradientStart(coords);
      setGradientEnd(coords);
      return;
    }

    if (tool === 'brush' || tool === 'eraser') {
      setIsDrawing(true);
      setLastPoint(coords);
    }

    if (tool === 'marquee') {
      setSelectionStart(coords);
      setSelectionRect({ ...coords, w: 0, h: 0 });
    }

    if (tool === 'pen') {
      const selectedL = layers.find(l => l.id === selectedLayerId);
      if (selectedL && selectedL.type === 'vector') {
        const existingVec = selectedL.vectorSettings || {
          points: [],
          closed: false,
          stroke: '#3b82f6',
          strokeWidth: 4,
          fill: '#3b82f640',
          fillEnabled: true,
          strokeEnabled: true,
          lineCap: 'round',
          lineJoin: 'round',
          pathProgress: 1
        };
        const pts = [...existingVec.points];
        if (pts.length > 2) {
          const firstPt = pts[0];
          const dist = Math.hypot(coords.x - firstPt.x, coords.y - firstPt.y);
          if (dist < 25) {
            updateLayer(selectedL.id, {
              vectorSettings: { ...existingVec, closed: true }
            });
            return;
          }
        }
        pts.push({ x: coords.x, y: coords.y });
        updateLayer(selectedL.id, {
          vectorSettings: { ...existingVec, points: pts }
        });
      } else {
        useStore.getState().addVectorLayer(coords);
      }
      return;
    }

    if (tool === 'motion-path') {
      setCurrentPath(prev => [...prev, coords]);
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

    if (isTransforming && transformStart && currentLayer) {
      const dx = coords.x - transformStart.x;
      const dy = coords.y - transformStart.y;
      const dims = getLayerDimensions(currentLayer);

      if (isTransforming === 'move') {
        let rawX = transformStart.layerX + dx;
        let rawY = transformStart.layerY + dy;

        if (smartGuidesEnabled) {
          const { snappedX, snappedY, guides } = calculateSmartGuides(
            rawX, rawY, dims.w, dims.h,
            currentLayer.transform.scaleX,
            currentLayer.transform.scaleY,
            currentLayer.id,
            layers
          );
          rawX = snappedX;
          rawY = snappedY;
          setActiveSmartGuides(guides);
        } else {
          setActiveSmartGuides([]);
        }

        updateLayer(currentLayer.id, {
          transform: {
            ...currentLayer.transform,
            x: rawX,
            y: rawY
          }
        });
      } else if (isTransforming === 'rotate') {
        const layerW = dims.w * currentLayer.transform.scaleX;
        const layerH = dims.h * currentLayer.transform.scaleY;
        const centerX = currentLayer.transform.x + layerW / 2;
        const centerY = currentLayer.transform.y + layerH / 2;

        let angle = Math.atan2(coords.y - centerY, coords.x - centerX) * (180 / Math.PI) + 90;
        if (e.shiftKey) {
          angle = Math.round(angle / 15) * 15;
        }

        updateLayer(currentLayer.id, {
          transform: {
            ...currentLayer.transform,
            rotation: Math.round(angle)
          }
        });
      } else if (isTransforming.startsWith('handle-')) {
        const handleType = isTransforming.replace('handle-', '');

        let newScaleX = transformStart.scaleX;
        let newScaleY = transformStart.scaleY;
        let newSkewX = transformStart.skewX || 0;
        let newSkewY = transformStart.skewY || 0;

        if (handleType === 'tl') {
          const delta = (dx + dy) / 200;
          newScaleX = Math.max(0.05, transformStart.scaleX - delta);
          newScaleY = Math.max(0.05, transformStart.scaleY - delta);
        } else if (handleType === 'tr') {
          const delta = (dx - dy) / 200;
          newScaleX = Math.max(0.05, transformStart.scaleX + delta);
          newScaleY = Math.max(0.05, transformStart.scaleY + delta);
        } else if (handleType === 'bl') {
          const delta = (-dx + dy) / 200;
          newScaleX = Math.max(0.05, transformStart.scaleX + delta);
          newScaleY = Math.max(0.05, transformStart.scaleY + delta);
        } else if (handleType === 'br') {
          const delta = (dx + dy) / 200;
          newScaleX = Math.max(0.05, transformStart.scaleX + delta);
          newScaleY = Math.max(0.05, transformStart.scaleY + delta);
        } else if (handleType === 'tm') {
          newScaleY = Math.max(0.05, transformStart.scaleY - dy / 100);
        } else if (handleType === 'bm') {
          newScaleY = Math.max(0.05, transformStart.scaleY + dy / 100);
        } else if (handleType === 'ml') {
          newScaleX = Math.max(0.05, transformStart.scaleX - dx / 100);
        } else if (handleType === 'mr') {
          newScaleX = Math.max(0.05, transformStart.scaleX + dx / 100);
        } else if (handleType === 'skew-x') {
          newSkewX = Math.round((transformStart.skewX || 0) + dx / 5);
        } else if (handleType === 'skew-y') {
          newSkewY = Math.round((transformStart.skewY || 0) + dy / 5);
        }

        if (e.shiftKey && ['tl', 'tr', 'bl', 'br'].includes(handleType)) {
          const avgScale = (newScaleX + newScaleY) / 2;
          newScaleX = avgScale;
          newScaleY = avgScale;
        }

        updateLayer(currentLayer.id, {
          transform: {
            ...currentLayer.transform,
            scaleX: Number(newScaleX.toFixed(3)),
            scaleY: Number(newScaleY.toFixed(3)),
            skewX: newSkewX,
            skewY: newSkewY
          }
        });
      }
      return;
    }

    if (tool === 'marquee' && selectionStart) {
      setSelectionRect({
        x: Math.min(selectionStart.x, coords.x),
        y: Math.min(selectionStart.y, coords.y),
        w: Math.abs(selectionStart.x - coords.x),
        h: Math.abs(selectionStart.y - coords.y)
      });
      return;
    }

    if (!isDrawing || !canvasRef.current || !lastPoint) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const currentPoint = getCanvasCoords(e);

    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    
    if (tool === 'brush') {
      ctx.strokeStyle = `rgba(0, 0, 0, ${brushOpacity})`;
      ctx.globalCompositeOperation = 'source-over';
    } else if (tool === 'eraser') {
      ctx.strokeStyle = 'white';
      ctx.globalCompositeOperation = 'destination-out';
    }

    ctx.stroke();
    setLastPoint(currentPoint);
  };

  const handleMouseUp = async () => {
    if (tool === 'motion-path' && currentPath.length > 1) {
      console.log("New Motion Path:", currentPath);
      setCurrentPath([]);
    }
    if (tool === 'gradient' && gradientStart && gradientEnd) {
      // Apply gradient to selected layer if applicable
      setGradientStart(null);
      setGradientEnd(null);
    }
    
    if (isDrawing && canvasRef.current && selectedLayerId) {
      const bitmap = await createImageBitmap(canvasRef.current);
      updateLayer(selectedLayerId, { bitmap });
      if (onCanvasUpdate) {
        onCanvasUpdate();
      }
    }

    setIsDrawing(false);
    setLastPoint(null);
    setIsPanning(false);
    setStartPan(null);
    setSelectionStart(null);
    setIsTransforming(null);
    setActiveSmartGuides([]);
    setIsTransforming(null);
    setTransformStart(null);
  };

  const getPointOnPath = (points: { x: number, y: number }[], progress: number) => {
    if (points.length < 2) return { x: 0, y: 0 };
    const totalPoints = points.length;
    const index = Math.min(Math.floor(progress * (totalPoints - 1)), totalPoints - 2);
    const localProgress = (progress * (totalPoints - 1)) - index;
    const p1 = points[index];
    const p2 = points[index + 1];
    return {
      x: p1.x + (p2.x - p1.x) * localProgress,
      y: p1.y + (p2.y - p1.y) * localProgress
    };
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // Use exponential zoom for smoothness
      const zoomFactor = 1.1;
      const delta = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;
      const newZoom = Math.min(Math.max(0.05, zoom * delta), 20);
      
      // Zoom towards mouse position
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Calculate the world-space point under the mouse
        const worldX = (mouseX - pan.x) / zoom;
        const worldY = (mouseY - pan.y) / zoom;
        
        // Calculate the new pan to keep the world-space point same
        const newPanX = mouseX - worldX * newZoom;
        const newPanY = mouseY - worldY * newZoom;
        
        setPan({ x: newPanX, y: newPanY });
      }
      setZoom(newZoom);
    } else {
      // Smooth panning
      setPan({ x: pan.x - e.deltaX, y: pan.y - e.deltaY });
    }
  };

  const currentLayer = layers.find(l => l.id === selectedLayerId);

  return (
    <div 
      ref={containerRef}
      className={`flex-1 bg-[#0a0a0a] relative overflow-hidden flex items-center justify-center ${tool === 'hand' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* World Container - Handles Zoom and Pan via GPU Transforms */}
      <div 
        className="absolute transition-transform duration-75 ease-out shadow-2xl origin-top-left"
        style={{
          width: 1920,
          height: 1080,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          willChange: 'transform',
        }}
      >
        {/* Transparency Grid (Unified & Efficient) */}
        <div 
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%)',
            backgroundSize: `20px 20px`,
            backgroundPosition: `0 0, 0 10px, 10px -10px, -10px 0px`,
            backgroundColor: '#fff'
          }}
        />

        <div className="w-[1920px] h-[1080px] bg-transparent relative overflow-hidden pointer-events-auto">
          {/* Onion Skin Ghost Overlays */}
          {onionSkinEnabled && (
            <div className="absolute inset-0 pointer-events-none z-10">
              {/* Previous Frame Ghost (Red Tint) */}
              {prevOnionLayers.map((gl) => {
                if (!gl.visible) return null;
                const tr = gl.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
                return (
                  <div 
                    key={`onion-prev-${gl.id}`}
                    className="absolute border-2 border-red-500/80 rounded pointer-events-none transition-all duration-75"
                    style={{
                      left: tr.x,
                      top: tr.y,
                      width: gl.type === 'shape' ? 200 : 300,
                      height: gl.type === 'shape' ? 200 : 150,
                      transform: `scale(${tr.scaleX}, ${tr.scaleY}) rotate(${tr.rotation}deg)`,
                      opacity: (gl.opacity || 1) * (onionSkinSettings.opacity || 0.35),
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      boxShadow: '0 0 12px rgba(239, 68, 68, 0.4)'
                    }}
                  >
                    <span className="text-[9px] font-mono text-red-300 font-bold px-1 bg-red-950/80 rounded absolute -top-4 left-0">
                      Prev Frame
                    </span>
                  </div>
                );
              })}

              {/* Next Frame Ghost (Green Tint) */}
              {nextOnionLayers.map((gl) => {
                if (!gl.visible) return null;
                const tr = gl.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
                return (
                  <div 
                    key={`onion-next-${gl.id}`}
                    className="absolute border-2 border-emerald-500/80 rounded pointer-events-none transition-all duration-75"
                    style={{
                      left: tr.x,
                      top: tr.y,
                      width: gl.type === 'shape' ? 200 : 300,
                      height: gl.type === 'shape' ? 200 : 150,
                      transform: `scale(${tr.scaleX}, ${tr.scaleY}) rotate(${tr.rotation}deg)`,
                      opacity: (gl.opacity || 1) * (onionSkinSettings.opacity || 0.35),
                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                      boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)'
                    }}
                  >
                    <span className="text-[9px] font-mono text-emerald-300 font-bold px-1 bg-emerald-950/80 rounded absolute -top-4 left-0">
                      Next Frame
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {layers.filter(l => !l.parentId).map((layer) => {
            const renderLayer = (l: Layer, indexOffset = 0) => {
              if (!l.visible) return null;
              if (soloLayerId && l.id !== soloLayerId && l.parentId !== soloLayerId) return null;
              
              const maskLayer = l.maskId ? layers.find(m => m.id === l.maskId) : null;
              const motionPath = l.motionPathId ? motionPaths.find(p => p.id === l.motionPathId) : null;
              const pathOffset = motionPath ? getPointOnPath(motionPath.points, l.motionPathProgress || 0) : { x: 0, y: 0 };
              const transform = l.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };

              const styles = l.layerStyles || {};
              const dropShadow = styles.dropShadow?.enabled ? `${styles.dropShadow.distance}px ${styles.dropShadow.distance}px ${styles.dropShadow.size}px ${styles.dropShadow.color}${Math.round(styles.dropShadow.opacity * 255).toString(16).padStart(2, '0')}` : 'none';
              const innerShadow = styles.innerShadow?.enabled ? `inset ${styles.innerShadow.distance}px ${styles.innerShadow.distance}px ${styles.innerShadow.size}px ${styles.innerShadow.color}${Math.round(styles.innerShadow.opacity * 255).toString(16).padStart(2, '0')}` : 'none';
              const bevel = styles.bevelEmboss?.enabled ? `inset ${styles.bevelEmboss.distance}px ${styles.bevelEmboss.distance}px ${styles.bevelEmboss.size}px rgba(255,255,255,${styles.bevelEmboss.opacity}), inset -${styles.bevelEmboss.distance}px -${styles.bevelEmboss.distance}px ${styles.bevelEmboss.size}px rgba(0,0,0,${styles.bevelEmboss.opacity})` : 'none';

              const style: React.CSSProperties = {
                position: 'absolute',
                left: transform.x + pathOffset.x,
                top: transform.y + pathOffset.y,
                width: l.type === 'shape' ? '200px' : '100%',
                height: l.type === 'shape' ? '200px' : '100%',
                transform: `scale(${transform.scaleX}, ${transform.scaleY}) rotate(${transform.rotation}deg) skew(${transform.skewX || 0}deg, ${transform.skewY || 0}deg)`,
                opacity: l.opacity,
                mixBlendMode: l.blendMode as any,
                boxShadow: [
                  dropShadow !== 'none' ? dropShadow : '',
                  innerShadow !== 'none' ? innerShadow : '',
                  bevel !== 'none' ? bevel : ''
                ].filter(Boolean).join(', ') || 'none',
                filter: l.type === 'adjustment' ? 'none' : `
                  brightness(${l.adjustments.brightness}%) 
                  contrast(${l.adjustments.contrast}%) 
                  saturate(${l.adjustments.saturation}%) 
                  hue-rotate(${l.adjustments.hue}deg)
                  ${styles.outerGlow?.enabled ? `drop-shadow(0 0 ${styles.outerGlow.size}px ${styles.outerGlow.color})` : ''}
                  ${l.calculatedMotionBlur && l.calculatedMotionBlur.blurPx > 0.5 ? `blur(${l.calculatedMotionBlur.blurPx.toFixed(1)}px)` : ''}
                `,
                backdropFilter: l.type === 'adjustment' ? `
                  brightness(${l.adjustments.brightness}%) 
                  contrast(${l.adjustments.contrast}%) 
                  saturate(${l.adjustments.saturation}%) 
                  hue-rotate(${l.adjustments.hue}deg)
                ` : 'none',
                zIndex: layers.indexOf(l) + indexOffset,
                maskImage: maskLayer && processedCanvases[maskLayer.id] 
                  ? `url(${processedCanvases[maskLayer.id].toDataURL()})` 
                  : 'none',
                maskSize: '100% 100%',
                maskRepeat: 'no-repeat',
                willChange: 'transform, opacity'
              };

              if (l.type === 'group') {
                const children = layers.filter(child => child.parentId === l.id);
                return (
                  <div key={l.id} style={style} className="pointer-events-none">
                    {children.map(child => renderLayer(child))}
                  </div>
                );
              }

              if (l.type === 'cloner' && l.clonerSettings) {
                const { count, mode, offset, step } = l.clonerSettings;
                return (
                  <React.Fragment key={l.id}>
                    {Array.from({ length: count }).map((_, i) => {
                      let cloneX = 0;
                      let cloneY = 0;
                      let cloneRot = 0;

                      if (mode === 'linear') {
                        cloneX = i * offset.x;
                        cloneY = i * offset.y;
                        cloneRot = i * offset.rotation;
                      } else if (mode === 'radial') {
                        const angle = (i / count) * Math.PI * 2;
                        cloneX = Math.cos(angle) * step;
                        cloneY = Math.sin(angle) * step;
                        cloneRot = (angle * 180) / Math.PI;
                      }

                      const clonedStyle = {
                        ...style,
                        left: transform.x + cloneX + pathOffset.x,
                        top: transform.y + cloneY + pathOffset.y,
                        transform: `scale(${transform.scaleX}, ${transform.scaleY}) rotate(${transform.rotation + cloneRot}deg)`,
                      };

                      return renderLayerContent(l, clonedStyle);
                    })}
                  </React.Fragment>
                );
              }

              return renderLayerContent(l, style);
            };

            const renderLayerContent = (l: Layer, style: React.CSSProperties) => {
              if (l.type === 'shape' && l.shapeSettings) {
                return (
                  <div 
                    key={l.id}
                    style={{
                      ...style,
                      backgroundColor: l.shapeSettings.fill,
                      border: `${l.shapeSettings.strokeWidth}px solid ${l.shapeSettings.stroke}`,
                      borderRadius: l.shapeSettings.type === 'circle' ? '50%' : '0'
                    }}
                    className="pointer-events-none"
                  />
                );
              }

              if (l.type === 'adjustment') {
                return <div key={l.id} style={{ ...style, width: '100%', height: '100%', left: 0, top: 0 }} className="pointer-events-none" />;
              }

              if (l.type === '3d-text') {
                return (
                  <div key={l.id} style={style} className="flex items-center justify-center relative overflow-hidden pointer-events-none">
                    {Array.from({ length: l.fontSettings?.depth || 10 }).map((_, i) => (
                      <span
                        key={i}
                        className="absolute"
                        style={{
                          fontFamily: l.fontSettings?.family || 'Inter',
                          fontSize: `${l.fontSettings?.size || 48}px`,
                          fontWeight: l.fontSettings?.weight || 'bold',
                          color: i === (l.fontSettings?.depth || 10) - 1 
                            ? (l.fontSettings?.color || '#3b82f6') 
                            : '#000',
                          transform: `translate(${i}px, ${-i}px)`,
                          textShadow: i === (l.fontSettings?.depth || 10) - 1 
                            ? '0 0 10px rgba(0,0,0,0.5)' 
                            : 'none',
                          opacity: 1 - (i / ((l.fontSettings?.depth || 10) * 1.5))
                        }}
                      >
                        {l.content}
                      </span>
                    ))}
                  </div>
                );
              }

              if (l.type === 'text') {
                const text = l.content || '';
                const animator = l.textAnimatorSettings;

                if (animator) {
                  return (
                    <div 
                      key={l.id} 
                      style={{
                        ...style,
                        fontFamily: l.fontSettings?.family || 'Inter',
                        fontSize: `${l.fontSettings?.size || 48}px`,
                        fontWeight: l.fontSettings?.weight || 'bold',
                        color: l.fontSettings?.color || '#ffffff',
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        letterSpacing: `${l.fontSettings?.tracking || 0}px`,
                        lineHeight: l.fontSettings?.leading || 1.2,
                        gap: '4px'
                      }} 
                      className="pointer-events-none"
                    >
                      {text.split('').map((char, i) => {
                        const progress = i / text.length;
                        let charOffset = 0;
                        let charOpacity = 1;
                        let charScale = 1;

                        const time = Date.now() / 1000 * animator.speed;
                        const phase = progress * Math.PI * 2 + animator.offset;

                        if (animator.animationType === 'wave') {
                          charOffset = Math.sin(time + phase) * 20 * animator.smoothness;
                        } else if (animator.animationType === 'bounce') {
                          charOffset = Math.abs(Math.sin(time + phase)) * -30 * animator.smoothness;
                        } else if (animator.animationType === 'reveal') {
                          const revealProgress = (Math.sin(time * 0.5) + 1) / 2;
                          charOpacity = Math.max(0, Math.min(1, (revealProgress - progress) / 0.1));
                          charScale = 0.5 + charOpacity * 0.5;
                        } else if (animator.animationType === 'glitch') {
                          charOffset = Math.random() > 0.9 ? (Math.random() - 0.5) * 20 : 0;
                          charOpacity = Math.random() > 0.95 ? 0.5 : 1;
                        }

                        return (
                          <span 
                            key={i} 
                            style={{ 
                              display: 'inline-block',
                              transform: `translateY(${charOffset}px) scale(${charScale})`,
                              opacity: charOpacity,
                              transition: 'all 0.1s ease-out'
                            }}
                          >
                            {char === ' ' ? '\u00A0' : char}
                          </span>
                        );
                      })}
                    </div>
                  );
                }

                return (
                  <div 
                    key={l.id} 
                    style={{
                      ...style,
                      fontFamily: l.fontSettings?.family || 'Inter',
                      fontSize: `${l.fontSettings?.size || 48}px`,
                      fontWeight: l.fontSettings?.weight || 'bold',
                      color: l.fontSettings?.color || '#ffffff',
                      textAlign: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      letterSpacing: `${l.fontSettings?.tracking || 0}px`,
                      lineHeight: l.fontSettings?.leading || 1.2
                    }} 
                    className="pointer-events-none"
                  >
                    {l.content}
                  </div>
                );
              }

              if (l.type === 'vector' || l.vectorSettings) {
                return (
                  <VectorCanvas
                    key={l.id}
                    layer={l}
                    isSelected={l.id === selectedLayerId}
                    tool={tool}
                    zoom={zoom}
                    style={style}
                  />
                );
              }

              if (l.proceduralSettings?.type === 'particles' && l.proceduralSettings.particles) {
                return (
                  <div key={l.id} style={style} className="pointer-events-none w-full h-full">
                    <ParticleCanvas
                      settings={l.proceduralSettings.particles}
                      currentTime={currentTime}
                      width={1920}
                      height={1080}
                    />
                  </div>
                );
              }

              if (l.id === selectedLayerId) {
                return <canvas key={l.id} ref={canvasRef} style={style} className="pointer-events-none" />;
              }

              if (processedCanvases[l.id]) {
                return (
                  <canvas 
                    key={l.id}
                    style={style}
                    className="pointer-events-none"
                    ref={(el) => {
                      if (el && processedCanvases[l.id]) {
                        const ctx = el.getContext('2d');
                        if (ctx) {
                          el.width = 1920;
                          el.height = 1080;
                          ctx.drawImage(processedCanvases[l.id], 0, 0);
                        }
                      }
                    }}
                  />
                );
              }

              return <div key={l.id} style={style} className="bg-transparent pointer-events-none" />;
            };

            return (
              <React.Fragment key={layer.id}>
                {/* Hidden processor for each layer */}
                {layer.bitmap && (
                  <ChromaKeyProcessor 
                    source={layer.bitmap}
                    settings={layer.adjustments.chromaKey || { enabled: false, targetColor: '#00ff00', similarity: 30, smoothness: 10, spillSuppression: 20, edgeFeather: 0 }}
                    width={1920}
                    height={1080}
                    onProcessed={(canvas) => handleProcessed(layer.id, canvas)}
                  />
                )}
                {renderLayer(layer)}
              </React.Fragment>
            );
          })}
        </div>
      </div>
  
      {/* Selection Overlay */}
      {selectionRect && (
        <div 
          className="absolute border border-dashed border-white shadow-[0_0_0_1px_black] pointer-events-none"
          style={{
            left: selectionRect.x * zoom + pan.x,
            top: selectionRect.y * zoom + pan.y,
            width: selectionRect.w * zoom,
            height: selectionRect.h * zoom,
            filter: selection.feather > 0 ? `blur(${selection.feather * zoom}px)` : 'none',
            boxShadow: selection.feather > 0 ? `0 0 ${selection.feather * 2 * zoom}px rgba(255,255,255,0.5)` : 'none'
          }}
        />
      )}

      {/* Gradient Preview */}
      {gradientStart && gradientEnd && (
        <div 
          className="absolute border border-white pointer-events-none z-50"
          style={{
            left: gradientStart.x * zoom + pan.x,
            top: gradientStart.y * zoom + pan.y,
            width: Math.sqrt(Math.pow(gradientEnd.x - gradientStart.x, 2) + Math.pow(gradientEnd.y - gradientStart.y, 2)) * zoom,
            height: 2,
            background: `linear-gradient(to right, ${gradientOptions.colors.join(', ')})`,
            transform: `rotate(${Math.atan2(gradientEnd.y - gradientStart.y, gradientEnd.x - gradientStart.x)}rad)`,
            transformOrigin: '0 0'
          }}
        />
      )}

      {/* Smart Guides Overlay Lines */}
      {activeSmartGuides.map((guide, idx) => {
        if (guide.type === 'v') {
          return (
            <div 
              key={`guide-v-${idx}`} 
              className="absolute top-0 bottom-0 border-l-2 border-dashed border-fuchsia-400 shadow-[0_0_10px_#f0abfc] z-50 pointer-events-none"
              style={{ left: guide.pos * zoom + pan.x }}
            >
              <div className="absolute top-4 left-1 bg-fuchsia-950/90 border border-fuchsia-500 text-fuchsia-200 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-ping"></span>
                {guide.label} ({Math.round(guide.pos)}px)
              </div>
            </div>
          );
        } else {
          return (
            <div 
              key={`guide-h-${idx}`} 
              className="absolute left-0 right-0 border-t-2 border-dashed border-cyan-400 shadow-[0_0_10px_#38bdf8] z-50 pointer-events-none"
              style={{ top: guide.pos * zoom + pan.y }}
            >
              <div className="absolute left-4 top-1 bg-cyan-950/90 border border-cyan-500 text-cyan-200 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                {guide.label} ({Math.round(guide.pos)}px)
              </div>
            </div>
          );
        }
      })}

      {/* Transform Gizmo Controls */}
      {currentLayer && (tool === 'move' || tool === 'text-animator') && (() => {
        const dims = getLayerDimensions(currentLayer);
        const width = dims.w * currentLayer.transform.scaleX;
        const height = dims.h * currentLayer.transform.scaleY;

        return (
          <div 
            className="absolute border-2 border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.5)] z-40 cursor-move pointer-events-auto group"
            style={{
              left: (currentLayer.transform.x + pan.x) * zoom,
              top: (currentLayer.transform.y + pan.y) * zoom,
              width: width * zoom,
              height: height * zoom,
              transform: `rotate(${currentLayer.transform.rotation}deg) skew(${currentLayer.transform.skewX || 0}deg, ${currentLayer.transform.skewY || 0}deg)`,
              transformOrigin: '0 0'
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setIsTransforming('move');
              setTransformStart({
                x: getCanvasCoords(e).x,
                y: getCanvasCoords(e).y,
                layerX: currentLayer.transform.x,
                layerY: currentLayer.transform.y,
                scaleX: currentLayer.transform.scaleX,
                scaleY: currentLayer.transform.scaleY,
                rotation: currentLayer.transform.rotation,
                skewX: currentLayer.transform.skewX || 0,
                skewY: currentLayer.transform.skewY || 0
              });
            }}
          >
            {/* Real-time Transform Feedback Badge */}
            <div className="absolute -top-7 left-0 bg-[#111]/90 border border-blue-500/80 text-blue-300 text-[9px] font-mono font-bold px-2 py-0.5 rounded shadow flex items-center gap-2 whitespace-nowrap pointer-events-none z-50">
              <span>X: {Math.round(currentLayer.transform.x)} Y: {Math.round(currentLayer.transform.y)}</span>
              <span className="text-gray-500">|</span>
              <span>S: {Math.round(currentLayer.transform.scaleX * 100)}%</span>
              <span className="text-gray-500">|</span>
              <span>R: {Math.round(currentLayer.transform.rotation)}°</span>
              {(currentLayer.transform.skewX || currentLayer.transform.skewY) ? (
                <>
                  <span className="text-gray-500">|</span>
                  <span>Sk: {currentLayer.transform.skewX || 0}°</span>
                </>
              ) : null}
            </div>

            {/* Rotation Stem & Handle */}
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center">
              <div 
                className="w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-full cursor-grab active:cursor-grabbing hover:scale-125 shadow-md transition-transform pointer-events-auto"
                title="Rotate Layer (Hold Shift for 15° Snap)"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsTransforming('rotate');
                  setTransformStart({
                    x: getCanvasCoords(e).x,
                    y: getCanvasCoords(e).y,
                    layerX: currentLayer.transform.x,
                    layerY: currentLayer.transform.y,
                    scaleX: currentLayer.transform.scaleX,
                    scaleY: currentLayer.transform.scaleY,
                    rotation: currentLayer.transform.rotation,
                    skewX: currentLayer.transform.skewX || 0,
                    skewY: currentLayer.transform.skewY || 0
                  });
                }}
              />
              <div className="w-0.5 h-3.5 bg-blue-500" />
            </div>

            {/* 4 Corner Scaling Handles */}
            {[
              { pos: 'tl', cursor: 'cursor-nwse-resize', title: 'Scale Top-Left' },
              { pos: 'tr', cursor: 'cursor-nesw-resize', title: 'Scale Top-Right' },
              { pos: 'bl', cursor: 'cursor-nesw-resize', title: 'Scale Bottom-Left' },
              { pos: 'br', cursor: 'cursor-nwse-resize', title: 'Scale Bottom-Right' }
            ].map((h) => (
              <div
                key={h.pos}
                title={h.title}
                className={`absolute w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-sm shadow hover:scale-125 transition-transform pointer-events-auto ${h.cursor}`}
                style={{
                  top: h.pos.startsWith('t') ? -7 : 'auto',
                  bottom: h.pos.startsWith('b') ? -7 : 'auto',
                  left: h.pos.endsWith('l') ? -7 : 'auto',
                  right: h.pos.endsWith('r') ? -7 : 'auto'
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsTransforming(`handle-${h.pos}`);
                  setTransformStart({
                    x: getCanvasCoords(e).x,
                    y: getCanvasCoords(e).y,
                    layerX: currentLayer.transform.x,
                    layerY: currentLayer.transform.y,
                    scaleX: currentLayer.transform.scaleX,
                    scaleY: currentLayer.transform.scaleY,
                    rotation: currentLayer.transform.rotation,
                    skewX: currentLayer.transform.skewX || 0,
                    skewY: currentLayer.transform.skewY || 0
                  });
                }}
              />
            ))}

            {/* 4 Edge Scaling Handles */}
            {[
              { pos: 'tm', style: { top: -6, left: '50%', transform: 'translateX(-50%)' }, cursor: 'cursor-ns-resize', title: 'Scale Height (Top)' },
              { pos: 'bm', style: { bottom: -6, left: '50%', transform: 'translateX(-50%)' }, cursor: 'cursor-ns-resize', title: 'Scale Height (Bottom)' },
              { pos: 'ml', style: { left: -6, top: '50%', transform: 'translateY(-50%)' }, cursor: 'cursor-ew-resize', title: 'Scale Width (Left)' },
              { pos: 'mr', style: { right: -6, top: '50%', transform: 'translateY(-50%)' }, cursor: 'cursor-ew-resize', title: 'Scale Width (Right)' }
            ].map((h) => (
              <div
                key={h.pos}
                title={h.title}
                className={`absolute w-3 h-3 bg-blue-500 border-2 border-white rounded-sm shadow hover:scale-125 transition-transform pointer-events-auto ${h.cursor}`}
                style={h.style}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsTransforming(`handle-${h.pos}`);
                  setTransformStart({
                    x: getCanvasCoords(e).x,
                    y: getCanvasCoords(e).y,
                    layerX: currentLayer.transform.x,
                    layerY: currentLayer.transform.y,
                    scaleX: currentLayer.transform.scaleX,
                    scaleY: currentLayer.transform.scaleY,
                    rotation: currentLayer.transform.rotation,
                    skewX: currentLayer.transform.skewX || 0,
                    skewY: currentLayer.transform.skewY || 0
                  });
                }}
              />
            ))}

            {/* Skew Handles */}
            <div
              title="Skew Horizontally"
              className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-amber-400 border-2 border-black rotate-45 shadow hover:scale-125 transition-transform pointer-events-auto cursor-col-resize"
              onMouseDown={(e) => {
                e.stopPropagation();
                setIsTransforming('handle-skew-x');
                setTransformStart({
                  x: getCanvasCoords(e).x,
                  y: getCanvasCoords(e).y,
                  layerX: currentLayer.transform.x,
                  layerY: currentLayer.transform.y,
                  scaleX: currentLayer.transform.scaleX,
                  scaleY: currentLayer.transform.scaleY,
                  rotation: currentLayer.transform.rotation,
                  skewX: currentLayer.transform.skewX || 0,
                  skewY: currentLayer.transform.skewY || 0
                });
              }}
            />

            <div
              title="Skew Vertically"
              className="absolute bottom-[-14px] left-1/2 -translate-x-1/2 w-3 h-3 bg-amber-400 border-2 border-black rotate-45 shadow hover:scale-125 transition-transform pointer-events-auto cursor-row-resize"
              onMouseDown={(e) => {
                e.stopPropagation();
                setIsTransforming('handle-skew-y');
                setTransformStart({
                  x: getCanvasCoords(e).x,
                  y: getCanvasCoords(e).y,
                  layerX: currentLayer.transform.x,
                  layerY: currentLayer.transform.y,
                  scaleX: currentLayer.transform.scaleX,
                  scaleY: currentLayer.transform.scaleY,
                  rotation: currentLayer.transform.rotation,
                  skewX: currentLayer.transform.skewX || 0,
                  skewY: currentLayer.transform.skewY || 0
                });
              }}
            />
          </div>
        );
      })()}

      {/* Bottom Overlay Info & Smart Guides Toggle */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 z-10">
        <div className="bg-black/60 text-white text-[10px] font-mono px-2 py-1 rounded backdrop-blur-sm shadow border border-[#333]">
          Zoom: {Math.round(zoom * 100)}%
        </div>

        <button
          onClick={() => setSmartGuidesEnabled(!smartGuidesEnabled)}
          className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-all flex items-center gap-1.5 shadow backdrop-blur-sm ${
            smartGuidesEnabled
              ? 'bg-fuchsia-950/80 border-fuchsia-500 text-fuchsia-300'
              : 'bg-black/60 border-[#333] text-gray-400 hover:text-white'
          }`}
          title="Toggle Smart Alignment Guides and Canvas Snapping"
        >
          <span className={`w-2 h-2 rounded-full ${smartGuidesEnabled ? 'bg-fuchsia-400 shadow-[0_0_8px_#f0abfc]' : 'bg-gray-500'}`} />
          Smart Guides {smartGuidesEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
});
