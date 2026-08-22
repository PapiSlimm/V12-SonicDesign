import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  RotateCcw, 
  Copy, 
  Check, 
  Activity, 
  TrendingUp, 
  Sliders,
  Sparkles
} from 'lucide-react';
import { useStore } from '../store/index';
import { Keyframe } from '../core/types';

interface BezierPoints {
  cp1: { x: number; y: number };
  cp2: { x: number; y: number };
}

export interface EasingPreset {
  id: string;
  name: string;
  easingType: Keyframe['easing'];
  bezierPoints: BezierPoints;
  description: string;
}

export const EASING_PRESETS: EasingPreset[] = [
  {
    id: 'linear',
    name: 'Linear',
    easingType: 'linear',
    bezierPoints: { cp1: { x: 0, y: 0 }, cp2: { x: 1, y: 1 } },
    description: 'Constant speed, no acceleration'
  },
  {
    id: 'ease-in',
    name: 'Ease In',
    easingType: 'ease-in',
    bezierPoints: { cp1: { x: 0.42, y: 0 }, cp2: { x: 1, y: 1 } },
    description: 'Starts slow and accelerates'
  },
  {
    id: 'ease-out',
    name: 'Ease Out',
    easingType: 'ease-out',
    bezierPoints: { cp1: { x: 0, y: 0 }, cp2: { x: 0.58, y: 1 } },
    description: 'Starts fast and decelerates'
  },
  {
    id: 'ease-in-out',
    name: 'Ease In Out',
    easingType: 'ease-in-out',
    bezierPoints: { cp1: { x: 0.42, y: 0 }, cp2: { x: 0.58, y: 1 } },
    description: 'Smooth acceleration and deceleration'
  },
  {
    id: 'ease-in-quad',
    name: 'Ease In Quad',
    easingType: 'bezier',
    bezierPoints: { cp1: { x: 0.11, y: 0 }, cp2: { x: 0.5, y: 0 } },
    description: 'Accelerates quadratic curve'
  },
  {
    id: 'ease-out-quad',
    name: 'Ease Out Quad',
    easingType: 'bezier',
    bezierPoints: { cp1: { x: 0.5, y: 1 }, cp2: { x: 0.89, y: 1 } },
    description: 'Decelerates quadratic curve'
  },
  {
    id: 'overshoot-out',
    name: 'Back / Overshoot',
    easingType: 'bezier',
    bezierPoints: { cp1: { x: 0.34, y: 1.56 }, cp2: { x: 0.64, y: 1 } },
    description: 'Overshoots target then settles back'
  },
  {
    id: 'anticipate-in',
    name: 'Anticipate In',
    easingType: 'bezier',
    bezierPoints: { cp1: { x: 0.36, y: -0.56 }, cp2: { x: 0.66, y: -0.2 } },
    description: 'Pulls back slightly before rushing forward'
  },
  {
    id: 'bounce',
    name: 'Bounce',
    easingType: 'bounce',
    bezierPoints: { cp1: { x: 0.175, y: 0.885 }, cp2: { x: 0.32, y: 1.275 } },
    description: 'Bounces near completion'
  },
  {
    id: 'elastic-out',
    name: 'Elastic Out',
    easingType: 'bezier',
    bezierPoints: { cp1: { x: 0.68, y: -0.55 }, cp2: { x: 0.265, y: 1.55 } },
    description: 'Springy elastic oscillation'
  }
];

// Solve Cubic Bezier Y given progress X
export function solveCubicBezier(p1x: number, p1y: number, p2x: number, p2y: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  let u = x;
  for (let i = 0; i < 10; i++) {
    const currentX = 3 * (1 - u) * (1 - u) * u * p1x + 3 * (1 - u) * u * u * p2x + u * u * u;
    const dx = 3 * (1 - u) * (1 - u) * p1x + 6 * (1 - u) * u * (p2x - p1x) + 3 * u * u * (1 - p2x);
    if (Math.abs(currentX - x) < 1e-6 || Math.abs(dx) < 1e-7) break;
    u = u - (currentX - x) / dx;
    u = Math.max(0, Math.min(1, u));
  }
  return 3 * (1 - u) * (1 - u) * u * p1y + 3 * (1 - u) * u * u * p2y + u * u * u;
}

export const EasingEditorModal: React.FC = () => {
  const {
    isEasingEditorOpen,
    setIsEasingEditorOpen,
    editingKeyframeTarget,
    layers,
    selectedLayerId,
    updateKeyframeEasing,
    updateAllKeyframesEasing
  } = useStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cp1, setCp1] = useState<{ x: number; y: number }>({ x: 0.25, y: 0.25 });
  const [cp2, setCp2] = useState<{ x: number; y: number }>({ x: 0.75, y: 0.75 });
  const [selectedPresetId, setSelectedPresetId] = useState<string>('ease-in-out');
  const [easingType, setEasingType] = useState<Keyframe['easing']>('bezier');
  const [draggingHandle, setDraggingHandle] = useState<'cp1' | 'cp2' | null>(null);
  const [scope, setScope] = useState<'selected' | 'property' | 'layer'>('selected');
  const [copiedCss, setCopiedCss] = useState(false);

  // Preview animation state
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(true);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewSpeed, setPreviewSpeed] = useState(1);
  const [previewMode, setPreviewMode] = useState<'translate' | 'scale' | 'rotate' | 'opacity'>('translate');
  const animFrameRef = useRef<number | null>(null);

  // Initialize values when target or modal opens
  useEffect(() => {
    if (!isEasingEditorOpen) return;

    const layerId = editingKeyframeTarget?.layerId || selectedLayerId;
    const layer = layers.find(l => l.id === layerId);
    let initialCp1 = { x: 0.42, y: 0 };
    let initialCp2 = { x: 0.58, y: 1 };
    let initialType: Keyframe['easing'] = 'ease-in-out';

    if (layer && layer.animations) {
      const prop = editingKeyframeTarget?.property || Object.keys(layer.animations)[0];
      if (prop && layer.animations[prop]) {
        const kfs = layer.animations[prop].keyframes;
        const kfIndex = editingKeyframeTarget?.keyframeIndex ?? 0;
        const targetKf = kfs[kfIndex] || kfs[0];
        if (targetKf) {
          initialType = targetKf.easing;
          if (targetKf.bezierPoints) {
            initialCp1 = targetKf.bezierPoints.cp1;
            initialCp2 = targetKf.bezierPoints.cp2;
          } else {
            const matched = EASING_PRESETS.find(p => p.easingType === targetKf.easing);
            if (matched) {
              initialCp1 = matched.bezierPoints.cp1;
              initialCp2 = matched.bezierPoints.cp2;
              setSelectedPresetId(matched.id);
            }
          }
        }
      }
    }

    setCp1(initialCp1);
    setCp2(initialCp2);
    setEasingType(initialType);
  }, [isEasingEditorOpen, editingKeyframeTarget, selectedLayerId]);

  // Live preview animation loop
  useEffect(() => {
    if (!isEasingEditorOpen || !isPreviewPlaying) return;

    let startTime = performance.now();
    const duration = 1500 / previewSpeed;

    const tick = (now: number) => {
      const elapsed = (now - startTime) % duration;
      const progress = elapsed / duration;
      setPreviewProgress(progress);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isEasingEditorOpen, isPreviewPlaying, previewSpeed]);

  // Canvas drawing
  useEffect(() => {
    if (!isEasingEditorOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const padding = 40;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Graph background area
    ctx.fillStyle = '#141414';
    ctx.fillRect(padding, padding, graphWidth, graphHeight);

    // Subtle Grid
    ctx.strokeStyle = '#282828';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gx = padding + (graphWidth / 4) * i;
      const gy = padding + (graphHeight / 4) * i;
      // Vertical grid lines
      ctx.beginPath(); ctx.moveTo(gx, padding); ctx.lineTo(gx, padding + graphHeight); ctx.stroke();
      // Horizontal grid lines
      ctx.beginPath(); ctx.moveTo(padding, gy); ctx.lineTo(padding + graphWidth, gy); ctx.stroke();
    }

    // Border
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(padding, padding, graphWidth, graphHeight);

    // Baseline reference line (0,0) to (1,1)
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(padding, padding + graphHeight);
    ctx.lineTo(padding + graphWidth, padding);
    ctx.stroke();
    ctx.setLineDash([]);

    // Map graph coordinates to canvas pixels
    // x: 0..1 -> padding .. padding + graphWidth
    // y: -0.5..1.5 -> padding + graphHeight * 1.5 .. padding - graphHeight * 0.5
    // Here we map y = 0 to (padding + graphHeight), y = 1 to (padding)
    const toPx = (x: number, y: number) => ({
      px: padding + x * graphWidth,
      py: padding + (1 - y) * graphHeight
    });

    const p0 = toPx(0, 0);
    const p1 = toPx(cp1.x, cp1.y);
    const p2 = toPx(cp2.x, cp2.y);
    const p3 = toPx(1, 1);

    // Tangent handle lines
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)'; // cp1 line
    ctx.beginPath(); ctx.moveTo(p0.px, p0.py); ctx.lineTo(p1.px, p1.py); ctx.stroke();

    ctx.strokeStyle = 'rgba(74, 222, 128, 0.6)'; // cp2 line
    ctx.beginPath(); ctx.moveTo(p3.px, p3.py); ctx.lineTo(p2.px, p2.py); ctx.stroke();
    ctx.setLineDash([]);

    // Curve Line
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p0.px, p0.py);
    ctx.bezierCurveTo(p1.px, p1.py, p2.px, p2.py, p3.px, p3.py);
    ctx.stroke();

    // End points
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p0.px - 4, p0.py - 4, 8, 8);
    ctx.fillRect(p3.px - 4, p3.py - 4, 8, 8);

    // Control point 1 (Handle 1)
    ctx.beginPath();
    ctx.arc(p1.px, p1.py, draggingHandle === 'cp1' ? 8 : 6, 0, Math.PI * 2);
    ctx.fillStyle = '#3b82f6';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Control point 2 (Handle 2)
    ctx.beginPath();
    ctx.arc(p2.px, p2.py, draggingHandle === 'cp2' ? 8 : 6, 0, Math.PI * 2);
    ctx.fillStyle = '#4ade80';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Handle labels
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('P1', p1.px + 8, p1.py + 3);
    ctx.fillStyle = '#86efac';
    ctx.fillText('P2', p2.px + 8, p2.py + 3);

    // Current position marker on curve based on preview
    const solvedY = solveCubicBezier(cp1.x, cp1.y, cp2.x, cp2.y, previewProgress);
    const marker = toPx(previewProgress, solvedY);
    ctx.beginPath();
    ctx.arc(marker.px, marker.py, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

  }, [isEasingEditorOpen, cp1, cp2, draggingHandle, previewProgress]);

  if (!isEasingEditorOpen) return null;

  // Handle Dragging
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const padding = 40;
    const graphWidth = rect.width - padding * 2;
    const graphHeight = rect.height - padding * 2;

    const toPx = (x: number, y: number) => ({
      px: padding + x * graphWidth,
      py: padding + (1 - y) * graphHeight
    });

    const p1 = toPx(cp1.x, cp1.y);
    const p2 = toPx(cp2.x, cp2.y);

    if (Math.hypot(mx - p1.px, my - p1.py) < 15) {
      setDraggingHandle('cp1');
    } else if (Math.hypot(mx - p2.px, my - p2.py) < 15) {
      setDraggingHandle('cp2');
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingHandle || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const padding = 40;
    const graphWidth = rect.width - padding * 2;
    const graphHeight = rect.height - padding * 2;

    // Convert pixels to 0..1 x and -0.5..1.5 y
    let nx = (mx - padding) / graphWidth;
    let ny = 1 - (my - padding) / graphHeight;

    nx = Math.max(0, Math.min(1, Math.round(nx * 100) / 100));
    ny = Math.max(-0.5, Math.min(1.5, Math.round(ny * 100) / 100));

    if (draggingHandle === 'cp1') {
      setCp1({ x: nx, y: ny });
    } else if (draggingHandle === 'cp2') {
      setCp2({ x: nx, y: ny });
    }

    setSelectedPresetId('custom');
    setEasingType('bezier');
  };

  const handleMouseUp = () => {
    setDraggingHandle(null);
  };

  const selectPreset = (preset: EasingPreset) => {
    setCp1(preset.bezierPoints.cp1);
    setCp2(preset.bezierPoints.cp2);
    setEasingType(preset.easingType);
    setSelectedPresetId(preset.id);
  };

  const handleApply = () => {
    const targetLayerId = editingKeyframeTarget?.layerId || selectedLayerId;
    if (!targetLayerId) {
      setIsEasingEditorOpen(false);
      return;
    }

    const bezierPoints = { cp1, cp2 };
    const finalEasing: Keyframe['easing'] = selectedPresetId === 'custom' ? 'bezier' : easingType;

    if (scope === 'selected' && editingKeyframeTarget?.property !== undefined && editingKeyframeTarget?.keyframeIndex !== undefined) {
      updateKeyframeEasing(
        targetLayerId,
        editingKeyframeTarget.property,
        editingKeyframeTarget.keyframeIndex,
        finalEasing,
        bezierPoints
      );
    } else if (scope === 'property' && editingKeyframeTarget?.property !== undefined) {
      updateKeyframeEasing(
        targetLayerId,
        editingKeyframeTarget.property,
        -1, // -1 means all keyframes for property
        finalEasing,
        bezierPoints
      );
    } else {
      // Scope: layer
      updateAllKeyframesEasing(targetLayerId, finalEasing, bezierPoints);
    }

    setIsEasingEditorOpen(false);
  };

  const cssString = `cubic-bezier(${cp1.x}, ${cp1.y}, ${cp2.x}, ${cp2.y})`;

  const copyCss = () => {
    navigator.clipboard.writeText(cssString);
    setCopiedCss(true);
    setTimeout(() => setCopiedCss(false), 2000);
  };

  // Preview animation output value
  const previewVal = solveCubicBezier(cp1.x, cp1.y, cp2.x, cp2.y, previewProgress);

  const targetLayerName = layers.find(l => l.id === (editingKeyframeTarget?.layerId || selectedLayerId))?.name || 'Selected Layer';
  const targetPropName = editingKeyframeTarget?.property ? `Property: ${editingKeyframeTarget.property.toUpperCase()}` : 'All Properties';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="bg-[#222] border border-[#3a3a3a] rounded-xl shadow-2xl overflow-hidden w-[720px] max-w-[95vw] flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#2a2a2a] border-b border-[#333] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg">
              <TrendingUp size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">Easing Curve Editor</h2>
              <p className="text-[11px] text-gray-400">
                {targetLayerName} &bull; <span className="text-blue-400">{targetPropName}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={() => setIsEasingEditorOpen(false)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-[#383838] rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Left Column: Interactive Graph */}
          <div className="md:col-span-7 flex flex-col gap-3">
            <div className="relative bg-[#181818] rounded-xl border border-[#333] overflow-hidden flex flex-col items-center justify-center p-2">
              <canvas
                ref={canvasRef}
                style={{ width: '100%', height: '280px' }}
                className="cursor-crosshair touch-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
              <div className="absolute bottom-2 left-3 text-[10px] text-gray-500 font-mono">
                Drag handles P1 & P2 to sculpt custom curve
              </div>
            </div>

            {/* Numeric Control Inputs */}
            <div className="bg-[#1a1a1a] p-3 rounded-lg border border-[#333] flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] text-gray-400 font-medium">
                <span>Control Points</span>
                <button 
                  onClick={copyCss}
                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors font-mono text-[10px]"
                >
                  {copiedCss ? <Check size={12} /> : <Copy size={12} />}
                  {copiedCss ? 'Copied!' : 'Copy CSS'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* P1 Input */}
                <div className="flex items-center gap-2 bg-[#252525] p-2 rounded border border-[#3a3a3a]">
                  <span className="w-5 text-center text-xs font-bold text-blue-400 font-mono">P1</span>
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-[10px] text-gray-500">X:</span>
                    <input 
                      type="number" step="0.05" min="0" max="1"
                      value={cp1.x}
                      onChange={(e) => {
                        setCp1({ ...cp1, x: parseFloat(e.target.value) || 0 });
                        setSelectedPresetId('custom');
                        setEasingType('bezier');
                      }}
                      className="w-full bg-transparent text-xs text-white outline-none font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-[10px] text-gray-500">Y:</span>
                    <input 
                      type="number" step="0.05" min="-0.5" max="1.5"
                      value={cp1.y}
                      onChange={(e) => {
                        setCp1({ ...cp1, y: parseFloat(e.target.value) || 0 });
                        setSelectedPresetId('custom');
                        setEasingType('bezier');
                      }}
                      className="w-full bg-transparent text-xs text-white outline-none font-mono"
                    />
                  </div>
                </div>

                {/* P2 Input */}
                <div className="flex items-center gap-2 bg-[#252525] p-2 rounded border border-[#3a3a3a]">
                  <span className="w-5 text-center text-xs font-bold text-green-400 font-mono">P2</span>
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-[10px] text-gray-500">X:</span>
                    <input 
                      type="number" step="0.05" min="0" max="1"
                      value={cp2.x}
                      onChange={(e) => {
                        setCp2({ ...cp2, x: parseFloat(e.target.value) || 0 });
                        setSelectedPresetId('custom');
                        setEasingType('bezier');
                      }}
                      className="w-full bg-transparent text-xs text-white outline-none font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-[10px] text-gray-500">Y:</span>
                    <input 
                      type="number" step="0.05" min="-0.5" max="1.5"
                      value={cp2.y}
                      onChange={(e) => {
                        setCp2({ ...cp2, y: parseFloat(e.target.value) || 0 });
                        setSelectedPresetId('custom');
                        setEasingType('bezier');
                      }}
                      className="w-full bg-transparent text-xs text-white outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
              <div className="text-[10px] font-mono text-gray-400 bg-[#141414] px-2 py-1 rounded text-center truncate">
                {cssString}
              </div>
            </div>

            {/* Live Motion Preview */}
            <div className="bg-[#1a1a1a] p-3 rounded-lg border border-[#333] flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] text-gray-400 font-medium">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-blue-400" />
                  <span>Real-Time Motion Preview</span>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setIsPreviewPlaying(!isPreviewPlaying)}
                    className="p-1 hover:bg-[#333] rounded text-gray-300 hover:text-white"
                  >
                    {isPreviewPlaying ? <Pause size={12} /> : <Play size={12} />}
                  </button>
                  <select
                    value={previewSpeed}
                    onChange={(e) => setPreviewSpeed(parseFloat(e.target.value))}
                    className="bg-[#252525] text-[10px] text-gray-300 border border-[#3a3a3a] rounded px-1 py-0.5 outline-none"
                  >
                    <option value={0.5}>0.5x</option>
                    <option value={1}>1.0x</option>
                    <option value={2}>2.0x</option>
                  </select>
                  <select
                    value={previewMode}
                    onChange={(e) => setPreviewMode(e.target.value as any)}
                    className="bg-[#252525] text-[10px] text-gray-300 border border-[#3a3a3a] rounded px-1 py-0.5 outline-none"
                  >
                    <option value="translate">Position X</option>
                    <option value="scale">Scale</option>
                    <option value="rotate">Rotation</option>
                    <option value="opacity">Opacity</option>
                  </select>
                </div>
              </div>

              {/* Animated Target */}
              <div className="h-12 bg-[#121212] rounded border border-[#2a2a2a] relative overflow-hidden flex items-center px-4">
                <div className="absolute inset-x-4 h-0.5 bg-[#2a2a2a]" />
                
                {previewMode === 'translate' && (
                  <div 
                    className="w-6 h-6 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-md shadow-lg border border-white/30 relative z-10"
                    style={{
                      transform: `translateX(${previewVal * 320}px)`
                    }}
                  />
                )}

                {previewMode === 'scale' && (
                  <div 
                    className="w-6 h-6 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-md shadow-lg border border-white/30 mx-auto relative z-10"
                    style={{
                      transform: `scale(${0.3 + previewVal * 1.2})`
                    }}
                  />
                )}

                {previewMode === 'rotate' && (
                  <div 
                    className="w-6 h-6 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-md shadow-lg border border-white/30 mx-auto relative z-10"
                    style={{
                      transform: `rotate(${previewVal * 360}deg)`
                    }}
                  />
                )}

                {previewMode === 'opacity' && (
                  <div 
                    className="w-6 h-6 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-md shadow-lg border border-white/30 mx-auto relative z-10"
                    style={{
                      opacity: previewVal
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Presets Library & Target Scope */}
          <div className="md:col-span-5 flex flex-col gap-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders size={14} className="text-blue-400" /> Easing Presets
            </h3>

            <div className="flex-1 overflow-y-auto max-h-[300px] space-y-1.5 pr-1">
              {EASING_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => selectPreset(preset)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-all flex flex-col gap-0.5 ${
                      isSelected 
                        ? 'bg-blue-600/20 border-blue-500 text-white' 
                        : 'bg-[#1a1a1a] border-[#333] text-gray-300 hover:bg-[#252525] hover:border-[#444]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{preset.name}</span>
                      {isSelected && <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.2 rounded font-bold">Active</span>}
                    </div>
                    <span className="text-[10px] text-gray-400 truncate">{preset.description}</span>
                  </button>
                );
              })}
            </div>

            {/* Target Scope Selection */}
            <div className="bg-[#1a1a1a] p-3 rounded-lg border border-[#333] flex flex-col gap-2">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Apply Scope</span>
              <div className="flex flex-col gap-1.5 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white">
                  <input 
                    type="radio" 
                    name="scope" 
                    value="selected" 
                    checked={scope === 'selected'}
                    onChange={() => setScope('selected')}
                    className="accent-blue-500"
                  />
                  <span>Selected Keyframe Only</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white">
                  <input 
                    type="radio" 
                    name="scope" 
                    value="property" 
                    checked={scope === 'property'}
                    onChange={() => setScope('property')}
                    className="accent-blue-500"
                  />
                  <span>All Keyframes in Property</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white">
                  <input 
                    type="radio" 
                    name="scope" 
                    value="layer" 
                    checked={scope === 'layer'}
                    onChange={() => setScope('layer')}
                    className="accent-blue-500"
                  />
                  <span>All Keyframes in Layer</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-[#2a2a2a] border-t border-[#333] flex items-center justify-between">
          <button
            onClick={() => {
              setCp1({ x: 0.25, y: 0.25 });
              setCp2({ x: 0.75, y: 0.75 });
              setSelectedPresetId('linear');
              setEasingType('linear');
            }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <RotateCcw size={14} /> Reset
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsEasingEditorOpen(false)}
              className="px-4 py-1.5 text-xs text-gray-300 hover:text-white bg-[#333] hover:bg-[#3d3d3d] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg transition-colors flex items-center gap-1.5"
            >
              <Sparkles size={14} /> Apply Easing Curve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
