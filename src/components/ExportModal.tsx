import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/index';
import { CanvasHandle } from './Canvas';
import { createZip, canvasToBytes } from '../utils/zip';
import { downloadBlob } from '../services/fileService';
import { DOC_WIDTH, DOC_HEIGHT } from '../core/layers/layerUtils';
import {
  Download,
  X,
  Film,
  Sliders,
  Play,
  Clock,
  Image as ImageIcon,
  StopCircle
} from 'lucide-react';

interface ExportModalProps {
  canvasRef: React.RefObject<CanvasHandle | null>;
}

type Format = 'png' | 'jpg' | 'webm' | 'gif_frames';

const FORMATS: { id: Format; title: string; desc: string; ext: string }[] = [
  { id: 'png', title: 'PNG Sequence (.zip)', desc: 'Lossless frames with alpha, zipped', ext: 'png' },
  { id: 'jpg', title: 'JPG Sequence (.zip)', desc: 'Compressed frames on a dark background', ext: 'jpg' },
  { id: 'webm', title: 'WebM Video', desc: 'Real-time captured video (VP9/VP8)', ext: 'webm' },
  { id: 'gif_frames', title: 'Single Frame (PNG)', desc: 'Snapshot at the start of the range', ext: 'png' }
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  return candidates.find(c => MediaRecorder.isTypeSupported(c)) || null;
}

export const ExportModal: React.FC<ExportModalProps> = ({ canvasRef }) => {
  const isExportModalOpen = useStore(s => s.isExportModalOpen);
  const setIsExportModalOpen = useStore(s => s.setIsExportModalOpen);
  const duration = useStore(s => s.duration);
  const projectFps = useStore(s => s.fps);
  const projectName = useStore(s => s.projectName);
  const exportFrameRange = useStore(s => s.exportFrameRange);
  const setExportFrameRange = useStore(s => s.setExportFrameRange);
  const currentTime = useStore(s => s.currentTime);

  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [renderedPreviewUrl, setRenderedPreviewUrl] = useState<string | null>(null);
  const [renderComplete, setRenderComplete] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [resultBlob, setResultBlob] = useState<{ blob: Blob; filename: string } | null>(null);
  const [transparent, setTransparent] = useState(true);
  const [scale, setScale] = useState(1);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!isExportModalOpen) {
      cancelRef.current = true;
      setRendering(false);
    }
  }, [isExportModalOpen]);

  if (!isExportModalOpen) return null;

  const startSec = Math.max(0, Math.min(exportFrameRange.startSec, duration));
  const endSec = Math.max(startSec + 0.1, Math.min(exportFrameRange.endSec, duration));
  const fps = exportFrameRange.fps || projectFps || 30;
  const format = exportFrameRange.format;
  const calculatedTotalFrames = Math.max(1, Math.round((endSec - startSec) * fps));
  const outW = Math.round(DOC_WIDTH * scale);
  const outH = Math.round(DOC_HEIGHT * scale);
  const safeName = (projectName || 'v12-export').replace(/[^a-z0-9_-]+/gi, '_');
  const webmSupport = pickMimeType();

  const renderFrameAt = (time: number, background: string | null): HTMLCanvasElement | null => {
    const full = canvasRef.current?.renderCompositeCanvas(time, background);
    if (!full) return null;
    if (scale === 1) return full;
    const scaled = document.createElement('canvas');
    scaled.width = outW;
    scaled.height = outH;
    const ctx = scaled.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(full, 0, 0, outW, outH);
    }
    return scaled;
  };

  const yieldToUI = () => new Promise(res => setTimeout(res, 0));

  const renderSequence = async (ext: 'png' | 'jpg') => {
    const totalFrames = calculatedTotalFrames;
    const entries: { name: string; data: Uint8Array }[] = [];
    const background = ext === 'jpg' || !transparent ? '#111111' : null;
    const pad = String(totalFrames).length;
    for (let frame = 0; frame < totalFrames; frame++) {
      if (cancelRef.current) throw new Error('cancelled');
      const time = startSec + frame / fps;
      const canvas = renderFrameAt(time, background);
      if (!canvas) throw new Error('Canvas unavailable');
      const bytes = await canvasToBytes(canvas, ext === 'jpg' ? 'image/jpeg' : 'image/png', 0.92);
      entries.push({ name: `${safeName}_${String(frame).padStart(pad, '0')}.${ext}`, data: bytes });
      if (frame === 0 || frame % Math.max(1, Math.floor(totalFrames / 6)) === 0) setRenderedPreviewUrl(canvas.toDataURL('image/jpeg', 0.7));
      setProgress(Math.round(((frame + 1) / totalFrames) * 100));
      setStatusMessage(`Rendering frame ${frame + 1} of ${totalFrames} (${time.toFixed(2)}s)…`);
      await yieldToUI();
    }
    setStatusMessage('Packing ZIP archive…');
    await yieldToUI();
    const blob = createZip(entries);
    return { blob, filename: `${safeName}_${ext}_sequence_${startSec.toFixed(1)}s-${endSec.toFixed(1)}s.zip` };
  };

  const renderWebm = async () => {
    const mime = pickMimeType();
    if (!mime) throw new Error('This browser cannot record video (MediaRecorder unsupported)');
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as any;
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: mime })); });
    recorder.start(250);

    const totalFrames = calculatedTotalFrames;
    const frameMs = 1000 / fps;
    for (let frame = 0; frame < totalFrames; frame++) {
      if (cancelRef.current) { recorder.stop(); throw new Error('cancelled'); }
      const time = startSec + frame / fps;
      const src = renderFrameAt(time, '#111111');
      if (src) ctx.drawImage(src, 0, 0);
      if (track && typeof track.requestFrame === 'function') track.requestFrame();
      if (frame % Math.max(1, Math.floor(totalFrames / 6)) === 0) setRenderedPreviewUrl(canvas.toDataURL('image/jpeg', 0.7));
      setProgress(Math.round(((frame + 1) / totalFrames) * 100));
      setStatusMessage(`Recording frame ${frame + 1} of ${totalFrames} (${time.toFixed(2)}s)…`);
      // MediaRecorder is real-time: wait one frame interval so timing is correct
      await new Promise(res => setTimeout(res, frameMs));
    }
    await new Promise(res => setTimeout(res, 300));
    recorder.stop();
    const blob = await finished;
    return { blob, filename: `${safeName}_${startSec.toFixed(1)}s-${endSec.toFixed(1)}s.webm` };
  };

  const renderSingle = async () => {
    const canvas = renderFrameAt(startSec, transparent ? null : '#111111');
    if (!canvas) throw new Error('Canvas unavailable');
    setRenderedPreviewUrl(canvas.toDataURL('image/jpeg', 0.7));
    setProgress(100);
    const bytes = await canvasToBytes(canvas, 'image/png');
    return { blob: new Blob([bytes], { type: 'image/png' }), filename: `${safeName}_frame_${startSec.toFixed(2)}s.png` };
  };

  const handleStartRender = async () => {
    cancelRef.current = false;
    setRendering(true);
    setProgress(0);
    setRenderComplete(false);
    setResultBlob(null);
    setRenderedPreviewUrl(null);
    setStatusMessage('Initializing frame renderer…');
    try {
      let result: { blob: Blob; filename: string };
      if (format === 'png' || format === 'jpg') result = await renderSequence(format);
      else if (format === 'webm') result = await renderWebm();
      else result = await renderSingle();
      setResultBlob(result);
      setRenderComplete(true);
      setStatusMessage(`Done — ${result.filename} (${(result.blob.size / (1024 * 1024)).toFixed(2)} MB). Click Download.`);
    } catch (err: any) {
      setStatusMessage(err?.message === 'cancelled' ? 'Render cancelled.' : `Render failed: ${err?.message || err}`);
    } finally {
      setRendering(false);
    }
  };

  const handleDownload = () => {
    if (!resultBlob) return;
    downloadBlob(resultBlob.blob, resultBlob.filename);
  };

  const close = () => { cancelRef.current = true; setIsExportModalOpen(false); };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !rendering) close(); }}>
      <div className="bg-[#222] border border-[#444] rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden text-white flex flex-col">
        <div className="px-6 py-4 bg-[#2a2a2a] border-b border-[#333] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/30 rounded-lg text-blue-400 border border-blue-500/40">
              <Film size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold">Export Animation</h2>
              <p className="text-[11px] text-gray-400">Renders exactly what you see on the canvas — text, shapes, vectors, images, effects</p>
            </div>
          </div>
          <button onClick={close} className="p-1.5 text-gray-400 hover:text-white hover:bg-[#3d3d3d] rounded-lg transition-colors" title="Close (Esc)">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5 max-h-[80vh] overflow-y-auto">
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders size={13} className="text-blue-400" /> Segment Range
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: `Entire (0–${duration.toFixed(1)}s)`, s: 0, e: duration },
                { label: `First 10s`, s: 0, e: Math.min(10, duration) },
                { label: `First Half`, s: 0, e: Number((duration / 2).toFixed(1)) },
                { label: `From Playhead (${currentTime.toFixed(1)}s)`, s: Number(currentTime.toFixed(2)), e: Math.min(duration, Number((currentTime + 5).toFixed(2))) }
              ].map(p => (
                <button
                  key={p.label}
                  onClick={() => setExportFrameRange({ startSec: p.s, endSec: p.e })}
                  className={`px-2 py-2 text-[11px] font-semibold rounded-lg border transition-all ${startSec === p.s && endSec === p.e ? 'bg-blue-600/30 border-blue-500 text-blue-300 shadow' : 'bg-[#2d2d2d] border-[#444] text-gray-300 hover:bg-[#383838]'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 bg-[#181818] p-4 rounded-xl border border-[#333]">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-gray-400 font-medium">Start (sec)</span>
              <input type="number" min={0} max={endSec - 0.1} step={0.1} value={startSec}
                onChange={(e) => setExportFrameRange({ startSec: Math.max(0, parseFloat(e.target.value) || 0) })}
                className="bg-[#282828] border border-[#444] rounded-lg px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-blue-500" />
              <span className="text-[10px] text-gray-500 font-mono">Frame {Math.round(startSec * fps)}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-gray-400 font-medium">End (sec)</span>
              <input type="number" min={startSec + 0.1} max={duration} step={0.1} value={endSec}
                onChange={(e) => setExportFrameRange({ endSec: Math.min(duration, parseFloat(e.target.value) || duration) })}
                className="bg-[#282828] border border-[#444] rounded-lg px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-blue-500" />
              <span className="text-[10px] text-gray-500 font-mono">Frame {Math.round(endSec * fps)}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-gray-400 font-medium">FPS</span>
              <select value={fps} onChange={(e) => setExportFrameRange({ fps: parseInt(e.target.value) })}
                className="bg-[#282828] border border-[#444] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500">
                <option value={12}>12</option>
                <option value={24}>24</option>
                <option value={25}>25</option>
                <option value={30}>30</option>
                <option value={60}>60</option>
              </select>
              <span className="text-[10px] font-bold text-blue-400 font-mono">{calculatedTotalFrames} frames</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-gray-400 font-medium">Resolution</span>
              <select value={scale} onChange={(e) => setScale(parseFloat(e.target.value))}
                className="bg-[#282828] border border-[#444] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500">
                <option value={1}>1920 × 1080</option>
                <option value={0.5}>960 × 540</option>
                <option value={0.25}>480 × 270</option>
              </select>
              <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer">
                <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} className="accent-blue-500" disabled={format === 'jpg' || format === 'webm'} />
                Transparent background
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <ImageIcon size={13} className="text-blue-400" /> Export Format
            </label>
            <div className="grid grid-cols-4 gap-3">
              {FORMATS.map((fmt) => {
                const disabled = fmt.id === 'webm' && !webmSupport;
                return (
                  <div
                    key={fmt.id}
                    onClick={() => !disabled && setExportFrameRange({ format: fmt.id })}
                    className={`p-3 rounded-xl border transition-all ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${format === fmt.id ? 'bg-blue-600/20 border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.2)]' : 'bg-[#282828] border-[#3a3a3a] hover:bg-[#333]'}`}
                    title={disabled ? 'Video recording is not supported in this browser' : fmt.desc}
                  >
                    <div className="text-xs font-bold text-white">{fmt.title}</div>
                    <div className="text-[10px] text-gray-400 mt-1">{fmt.desc}</div>
                  </div>
                );
              })}
            </div>
            {format === 'webm' && (
              <p className="text-[10px] text-gray-500">Video is captured in real time, so a {(endSec - startSec).toFixed(1)}s segment takes about {(endSec - startSec).toFixed(1)}s to record. Audio tracks are not included.</p>
            )}
          </div>

          {(rendering || renderComplete || renderedPreviewUrl || statusMessage) && (
            <div className="bg-[#181818] border border-[#333] rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-200 flex items-center gap-2">
                  <Clock size={14} className="text-blue-400" />
                  {rendering ? 'Rendering…' : renderComplete ? 'Render Complete' : 'Status'}
                </span>
                <span className="text-xs font-mono font-bold text-blue-400">{progress}%</span>
              </div>
              {rendering && (
                <div className="w-full h-2 bg-[#282828] rounded-full overflow-hidden border border-[#383838]">
                  <div className="h-full bg-blue-500 transition-all duration-150 rounded-full" style={{ width: `${progress}%` }} />
                </div>
              )}
              {statusMessage && <div className="text-[11px] font-mono text-gray-300">{statusMessage}</div>}
              {renderedPreviewUrl && (
                <div className="relative rounded-lg overflow-hidden border border-[#3d3d3d] bg-black/50 aspect-video max-h-48 flex items-center justify-center">
                  <img src={renderedPreviewUrl} alt="Frame Render Preview" className="h-full object-contain" />
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur rounded text-[10px] font-mono text-blue-300">
                    Preview · {outW}×{outH}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-[#2a2a2a] border-t border-[#333] flex items-center justify-between">
          <div className="text-xs text-gray-400">
            Range: <strong className="text-white">{(endSec - startSec).toFixed(2)}s</strong> · {calculatedTotalFrames} frames @ {fps} fps · {outW}×{outH}
          </div>
          <div className="flex items-center gap-2">
            {rendering ? (
              <button onClick={() => { cancelRef.current = true; }} className="px-4 py-2 bg-red-600/80 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5">
                <StopCircle size={14} /> Cancel
              </button>
            ) : (
              <button onClick={close} className="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] text-gray-200 text-xs font-semibold rounded-lg transition-colors">
                Close
              </button>
            )}
            {renderComplete && resultBlob ? (
              <>
                <button onClick={handleStartRender} className="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] text-gray-200 text-xs font-semibold rounded-lg transition-colors">Re-render</button>
                <button onClick={handleDownload} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow flex items-center gap-2 transition-colors">
                  <Download size={14} /> Download
                </button>
              </>
            ) : (
              <button onClick={handleStartRender} disabled={rendering} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow flex items-center gap-2 transition-colors">
                <Play size={14} /> {rendering ? 'Rendering…' : 'Render'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
