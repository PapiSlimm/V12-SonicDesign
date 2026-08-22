import React, { useState, useRef } from 'react';
import { useStore } from '../store/index';
import { computeLayersAtTime } from '../hooks/useDerivedLayers';
import { 
  Download, 
  X, 
  Film, 
  Sliders, 
  Play, 
  CheckCircle2, 
  Sparkles, 
  Clock, 
  Layers, 
  Image as ImageIcon 
} from 'lucide-react';

export const ExportModal: React.FC = () => {
  const {
    isExportModalOpen,
    setIsExportModalOpen,
    duration,
    layers,
    exportFrameRange,
    setExportFrameRange
  } = useStore();

  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentRenderFrame, setCurrentRenderFrame] = useState(0);
  const [totalRenderFrames, setTotalRenderFrames] = useState(0);
  const [renderedPreviewUrl, setRenderedPreviewUrl] = useState<string | null>(null);
  const [renderComplete, setRenderComplete] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);

  if (!isExportModalOpen) return null;

  const startSec = Math.max(0, Math.min(exportFrameRange.startSec, duration));
  const endSec = Math.max(startSec + 0.1, Math.min(exportFrameRange.endSec, duration));
  const fps = exportFrameRange.fps || 30;
  const calculatedTotalFrames = Math.max(1, Math.round((endSec - startSec) * fps));

  const handleStartRender = async () => {
    setRendering(true);
    setProgress(0);
    setRenderComplete(false);
    setRenderedPreviewUrl(null);
    setStatusMessage('Initializing frame renderer...');

    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frameStep = 1 / fps;
    const totalFrames = Math.max(1, Math.round((endSec - startSec) * fps));
    setTotalRenderFrames(totalFrames);

    const frameImages: string[] = [];

    // Progressive frame render loop
    for (let frame = 0; frame <= totalFrames; frame++) {
      const renderTime = startSec + frame * frameStep;
      if (renderTime > endSec && frame > 0) break;

      setCurrentRenderFrame(frame);
      setProgress(Math.min(100, Math.round((frame / totalFrames) * 100)));
      setStatusMessage(`Rendering Frame ${frame + 1} of ${totalFrames + 1} (${renderTime.toFixed(2)}s)...`);

      // Evaluate derived layers at exact timestamp
      const derived = computeLayersAtTime(layers, renderTime);

      // Clear canvas
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, 1920, 1080);

      // Render layers onto offscreen canvas
      for (const layer of derived) {
        if (!layer.visible) continue;
        ctx.save();

        const tr = layer.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
        ctx.translate(tr.x + 100, tr.y + 100);
        ctx.rotate((tr.rotation * Math.PI) / 180);
        ctx.scale(tr.scaleX, tr.scaleY);
        ctx.globalAlpha = layer.opacity ?? 1;

        if (layer.blendMode && layer.blendMode !== 'normal') {
          ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
        }

        if (layer.type === 'shape') {
          ctx.fillStyle = layer.shapeSettings?.fill || '#3b82f6';
          ctx.strokeStyle = layer.shapeSettings?.stroke || '#ffffff';
          ctx.lineWidth = layer.shapeSettings?.strokeWidth || 2;

          if (layer.shapeSettings?.type === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, 80, 0, Math.PI * 2);
            ctx.fill();
            if (layer.shapeSettings?.strokeWidth) ctx.stroke();
          } else {
            ctx.fillRect(-100, -75, 200, 150);
            if (layer.shapeSettings?.strokeWidth) ctx.strokeRect(-100, -75, 200, 150);
          }
        } else if (layer.type === 'text') {
          ctx.font = `${layer.fontSettings?.size || 48}px ${layer.fontSettings?.family || 'sans-serif'}`;
          ctx.fillStyle = layer.fontSettings?.color || '#ffffff';
          ctx.fillText(layer.content || layer.name, 0, 0);
        } else {
          ctx.fillStyle = '#3b82f6';
          ctx.fillRect(-120, -80, 240, 160);
        }

        ctx.restore();
      }

      // Capture frame
      const frameDataUrl = canvas.toDataURL('image/png');
      frameImages.push(frameDataUrl);

      if (frame === 0 || frame === Math.floor(totalFrames / 2)) {
        setRenderedPreviewUrl(frameDataUrl);
      }

      // Yield thread to keep UI smooth
      await new Promise(res => setTimeout(res, 12));
    }

    setRendering(false);
    setRenderComplete(true);
    setStatusMessage('Rendering finished! Ready to download sequence.');

    if (frameImages.length > 0) {
      setRenderedPreviewUrl(frameImages[frameImages.length - 1]);
    }
  };

  const handleDownloadSingleFrame = () => {
    if (!renderedPreviewUrl) return;
    const a = document.createElement('a');
    a.href = renderedPreviewUrl;
    a.download = `animation-segment-${startSec.toFixed(1)}s-${endSec.toFixed(1)}s.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#222] border border-[#444] rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden text-white flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-[#2a2a2a] border-b border-[#333] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/30 rounded-lg text-blue-400 border border-blue-500/40">
              <Film size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold">Export Custom Animation Segment</h2>
              <p className="text-[11px] text-gray-400">Define precise frame boundaries and export parameters</p>
            </div>
          </div>
          <button 
            onClick={() => setIsExportModalOpen(false)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-[#3d3d3d] rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6 max-h-[80vh] overflow-y-auto">
          {/* Segment Range Presets */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders size={13} className="text-blue-400" /> Segment Range Presets
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setExportFrameRange({ startSec: 0, endSec: duration })}
                className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                  startSec === 0 && endSec === duration
                    ? 'bg-blue-600/30 border-blue-500 text-blue-300 shadow'
                    : 'bg-[#2d2d2d] border-[#444] text-gray-300 hover:bg-[#383838]'
                }`}
              >
                Entire Timeline (0s - {duration.toFixed(1)}s)
              </button>

              <button
                onClick={() => setExportFrameRange({ startSec: 0, endSec: Number((duration / 2).toFixed(1)) })}
                className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                  startSec === 0 && endSec === Number((duration / 2).toFixed(1))
                    ? 'bg-blue-600/30 border-blue-500 text-blue-300 shadow'
                    : 'bg-[#2d2d2d] border-[#444] text-gray-300 hover:bg-[#383838]'
                }`}
              >
                First Half (0s - {(duration / 2).toFixed(1)}s)
              </button>

              <button
                onClick={() => setExportFrameRange({ startSec: Number((duration / 2).toFixed(1)), endSec: duration })}
                className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                  startSec === Number((duration / 2).toFixed(1)) && endSec === duration
                    ? 'bg-blue-600/30 border-blue-500 text-blue-300 shadow'
                    : 'bg-[#2d2d2d] border-[#444] text-gray-300 hover:bg-[#383838]'
                }`}
              >
                Second Half ({(duration / 2).toFixed(1)}s - {duration.toFixed(1)}s)
              </button>
            </div>
          </div>

          {/* Time & Frame Controls */}
          <div className="grid grid-cols-3 gap-4 bg-[#181818] p-4 rounded-xl border border-[#333]">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-gray-400 font-medium">Start Time (sec)</span>
              <input 
                type="number"
                min={0}
                max={endSec - 0.1}
                step={0.1}
                value={startSec}
                onChange={(e) => setExportFrameRange({ startSec: parseFloat(e.target.value) || 0 })}
                className="bg-[#282828] border border-[#444] rounded-lg px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-blue-500"
              />
              <span className="text-[10px] text-gray-500 font-mono">Frame ~{Math.round(startSec * fps)}</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-gray-400 font-medium">End Time (sec)</span>
              <input 
                type="number"
                min={startSec + 0.1}
                max={duration}
                step={0.1}
                value={endSec}
                onChange={(e) => setExportFrameRange({ endSec: parseFloat(e.target.value) || duration })}
                className="bg-[#282828] border border-[#444] rounded-lg px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-blue-500"
              />
              <span className="text-[10px] text-gray-500 font-mono">Frame ~{Math.round(endSec * fps)}</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-gray-400 font-medium">Target FPS</span>
              <select 
                value={fps}
                onChange={(e) => setExportFrameRange({ fps: parseInt(e.target.value) })}
                className="bg-[#282828] border border-[#444] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              >
                <option value={12}>12 FPS (Anime / Hand-drawn)</option>
                <option value={24}>24 FPS (Cinematic standard)</option>
                <option value={30}>30 FPS (Digital video)</option>
                <option value={60}>60 FPS (Ultra smooth)</option>
              </select>
              <span className="text-[10px] font-bold text-blue-400 font-mono">{calculatedTotalFrames} frames total</span>
            </div>
          </div>

          {/* Format Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <ImageIcon size={13} className="text-blue-400" /> Export Format
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'png', title: 'PNG Sequence', desc: 'High quality frame series' },
                { id: 'jpg', title: 'JPG Sequence', desc: 'Compressed frame series' },
                { id: 'webm', title: 'Single Composite Snapshot', desc: 'Keyframe composite preview' },
              ].map((fmt) => (
                <div
                  key={fmt.id}
                  onClick={() => setExportFrameRange({ format: fmt.id as any })}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    exportFrameRange.format === fmt.id
                      ? 'bg-blue-600/20 border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.2)]'
                      : 'bg-[#282828] border-[#3a3a3a] hover:bg-[#333]'
                  }`}
                >
                  <div className="text-xs font-bold text-white">{fmt.title}</div>
                  <div className="text-[10px] text-gray-400 mt-1">{fmt.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Render Progress & Live Preview Box */}
          {(rendering || renderComplete || renderedPreviewUrl) && (
            <div className="bg-[#181818] border border-[#333] rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-200 flex items-center gap-2">
                  <Clock size={14} className="text-blue-400" />
                  {rendering ? 'Rendering Segment...' : renderComplete ? 'Rendering Complete!' : 'Preview Snapshot'}
                </span>
                <span className="text-xs font-mono font-bold text-blue-400">{progress}%</span>
              </div>

              {rendering && (
                <div className="w-full h-2 bg-[#282828] rounded-full overflow-hidden border border-[#383838]">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-150 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              {statusMessage && (
                <div className="text-[11px] font-mono text-gray-300">
                  {statusMessage}
                </div>
              )}

              {renderedPreviewUrl && (
                <div className="relative rounded-lg overflow-hidden border border-[#3d3d3d] bg-black/50 aspect-video max-h-48 flex items-center justify-center">
                  <img src={renderedPreviewUrl} alt="Frame Render Preview" className="h-full object-contain" />
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur rounded text-[10px] font-mono text-blue-300">
                    Segment Render Preview ({startSec}s - {endSec}s)
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#2a2a2a] border-t border-[#333] flex items-center justify-between">
          <div className="text-xs text-gray-400">
            Selected Range: <strong className="text-white">{(endSec - startSec).toFixed(2)}s</strong> ({calculatedTotalFrames} Frames @ {fps} FPS)
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExportModalOpen(false)}
              className="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] text-gray-200 text-xs font-semibold rounded-lg transition-colors"
            >
              Close
            </button>

            {!renderComplete ? (
              <button
                onClick={handleStartRender}
                disabled={rendering}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow flex items-center gap-2 transition-colors"
              >
                <Play size={14} /> {rendering ? 'Rendering Frames...' : 'Render Segment'}
              </button>
            ) : (
              <button
                onClick={handleDownloadSingleFrame}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow flex items-center gap-2 transition-colors"
              >
                <Download size={14} /> Download Segment Frame
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
