import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/index';
import { Keyframe } from '../core/types';
import { evaluateTrack } from '../hooks/useDerivedLayers';

const PROP_COLORS: Record<string, string> = {
  x: '#ff4b4b',
  y: '#4bff4b',
  rotation: '#4b4bff',
  scaleX: '#ff4bff',
  scaleY: '#ffb14b',
  opacity: '#4bffff',
  motionPathProgress: '#f0abfc',
  pathProgress: '#facc15'
};

const PADDING = { top: 18, right: 16, bottom: 22, left: 48 };

export const GraphEditor: React.FC = () => {
  const { layers, selectedLayerId, currentTime, duration, updateLayer, updateLayerCommitted, setCurrentTime, openEasingEditor, removeKeyframe } = useStore(useShallow((s) => ({
    layers: s.layers,
    selectedLayerId: s.selectedLayerId,
    currentTime: s.currentTime,
    duration: s.duration,
    updateLayer: s.updateLayer,
    updateLayerCommitted: s.updateLayerCommitted,
    setCurrentTime: s.setCurrentTime,
    openEasingEditor: s.openEasingEditor,
    removeKeyframe: s.removeKeyframe
  })));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedKeyframe, setSelectedKeyframe] = useState<{ prop: string; index: number; handle?: 'cp1' | 'cp2' } | null>(null);
  const [visibleProps, setVisibleProps] = useState<Record<string, boolean>>({});
  const [dragging, setDragging] = useState<{ prop: string; index: number; mode: 'value' | 'cp1' | 'cp2' } | null>(null);

  const currentLayer = layers.find(l => l.id === selectedLayerId);
  const animations = currentLayer?.animations;
  const props = useMemo(() => Object.keys(animations || {}).filter(p => (animations?.[p]?.keyframes.length || 0) > 0), [animations]);
  const activeProps = props.filter(p => visibleProps[p] !== false);

  // Auto-fit the value axis to the visible tracks
  const range = useMemo(() => {
    let min = Infinity, max = -Infinity;
    activeProps.forEach(p => {
      animations?.[p]?.keyframes.forEach(kf => {
        if (typeof kf.value === 'number') { min = Math.min(min, kf.value); max = Math.max(max, kf.value); }
      });
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
    if (max - min < 1e-6) { min -= 1; max += 1; }
    const pad = (max - min) * 0.15;
    return { min: min - pad, max: max + pad };
  }, [activeProps, animations]);

  const toScreen = useCallback((time: number, value: number, w: number, h: number) => ({
    x: PADDING.left + (time / Math.max(0.001, duration)) * (w - PADDING.left - PADDING.right),
    y: PADDING.top + (1 - (value - range.min) / (range.max - range.min)) * (h - PADDING.top - PADDING.bottom)
  }), [duration, range]);

  const fromScreen = useCallback((x: number, y: number, w: number, h: number) => ({
    time: ((x - PADDING.left) / (w - PADDING.left - PADDING.right)) * duration,
    value: range.min + (1 - (y - PADDING.top) / (h - PADDING.top - PADDING.bottom)) * (range.max - range.min)
  }), [duration, range]);

  const getBezierScreen = (kf: Keyframe, prevKf: Keyframe, w: number, h: number) => {
    const a = toScreen(prevKf.time, Number(prevKf.value), w, h);
    const b = toScreen(kf.time, Number(kf.value), w, h);
    const pts = prevKf.bezierPoints || { cp1: { x: 0.25, y: 0.25 }, cp2: { x: 0.75, y: 0.75 } };
    return {
      a, b,
      cp1: { x: a.x + (b.x - a.x) * pts.cp1.x, y: a.y + (b.y - a.y) * pts.cp1.y },
      cp2: { x: a.x + (b.x - a.x) * pts.cp2.x, y: a.y + (b.y - a.y) * pts.cp2.y }
    };
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    // Grid + axis labels
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.font = '9px monospace';
    ctx.fillStyle = '#666';
    const timeStep = duration > 60 ? 10 : duration > 20 ? 5 : 1;
    for (let t = 0; t <= duration + 1e-6; t += timeStep) {
      const x = toScreen(t, 0, w, h).x;
      ctx.beginPath(); ctx.moveTo(x, PADDING.top); ctx.lineTo(x, h - PADDING.bottom); ctx.stroke();
      ctx.fillText(`${t}s`, x + 2, h - 8);
    }
    const rows = 4;
    for (let i = 0; i <= rows; i++) {
      const v = range.min + ((range.max - range.min) * i) / rows;
      const y = toScreen(0, v, w, h).y;
      ctx.beginPath(); ctx.moveTo(PADDING.left, y); ctx.lineTo(w - PADDING.right, y); ctx.stroke();
      ctx.fillText(Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2), 4, y + 3);
    }

    if (!animations) return;

    // Curves (sampled from the real evaluator so what you see is what plays)
    activeProps.forEach(prop => {
      const keys = animations[prop].keyframes;
      if (keys.length === 0) return;
      const color = PROP_COLORS[prop] || '#a78bfa';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const samples = Math.max(60, Math.floor(w));
      for (let i = 0; i <= samples; i++) {
        const t = (i / samples) * duration;
        const v = evaluateTrack(keys, t);
        if (typeof v !== 'number') continue;
        const p = toScreen(t, v, w, h);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      keys.forEach((kf, i) => {
        if (typeof kf.value !== 'number') return;
        const p = toScreen(kf.time, kf.value, w, h);
        const isSel = selectedKeyframe?.prop === prop && selectedKeyframe.index === i;

        if (isSel && i > 0 && keys[i - 1].easing === 'bezier') {
          const bz = getBezierScreen(kf, keys[i - 1], w, h);
          ctx.setLineDash([2, 4]);
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(bz.a.x, bz.a.y); ctx.lineTo(bz.cp1.x, bz.cp1.y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(bz.b.x, bz.b.y); ctx.lineTo(bz.cp2.x, bz.cp2.y); ctx.stroke();
          ctx.setLineDash([]);
          [bz.cp1, bz.cp2].forEach((cp, ci) => {
            ctx.beginPath(); ctx.arc(cp.x, cp.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = selectedKeyframe?.handle === (ci === 0 ? 'cp1' : 'cp2') ? '#4ade80' : '#3b82f6';
            ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke();
          });
        }

        ctx.fillStyle = isSel ? '#fff' : color;
        ctx.beginPath();
        if (isSel) { ctx.rect(p.x - 5, p.y - 5, 10, 10); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
        else { ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); }
      });
    });

    // Playhead
    const px = toScreen(currentTime, 0, w, h).x;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.moveTo(px - 5, 0); ctx.lineTo(px + 5, 0); ctx.lineTo(px, 8); ctx.fill();
  }, [animations, activeProps, currentTime, duration, range, selectedKeyframe, toScreen]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  /** Immutable keyframe patch helper. */
  const patchKeyframe = (prop: string, index: number, patch: Partial<Keyframe>, commit: boolean, label = 'Edit Keyframe') => {
    if (!currentLayer?.animations?.[prop]) return;
    const kfs = currentLayer.animations[prop].keyframes.map((k, i) => (i === index ? { ...k, ...patch } : k));
    const newAnims = { ...currentLayer.animations, [prop]: { ...currentLayer.animations[prop], keyframes: kfs } };
    if (commit) updateLayerCommitted(currentLayer.id, { animations: newAnims }, label);
    else updateLayer(currentLayer.id, { animations: newAnims });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !animations) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const w = rect.width, h = rect.height;

    // Bezier handle hit-test for the selected keyframe
    if (selectedKeyframe) {
      const keys = animations[selectedKeyframe.prop]?.keyframes || [];
      const kf = keys[selectedKeyframe.index];
      const prev = keys[selectedKeyframe.index - 1];
      if (kf && prev && prev.easing === 'bezier') {
        const bz = getBezierScreen(kf, prev, w, h);
        if (Math.hypot(mx - bz.cp1.x, my - bz.cp1.y) < 9) { setDragging({ prop: selectedKeyframe.prop, index: selectedKeyframe.index, mode: 'cp1' }); setSelectedKeyframe({ ...selectedKeyframe, handle: 'cp1' }); return; }
        if (Math.hypot(mx - bz.cp2.x, my - bz.cp2.y) < 9) { setDragging({ prop: selectedKeyframe.prop, index: selectedKeyframe.index, mode: 'cp2' }); setSelectedKeyframe({ ...selectedKeyframe, handle: 'cp2' }); return; }
      }
    }

    // Keyframe hit-test
    for (const prop of activeProps) {
      const keys = animations[prop].keyframes;
      for (let i = 0; i < keys.length; i++) {
        if (typeof keys[i].value !== 'number') continue;
        const p = toScreen(keys[i].time, Number(keys[i].value), w, h);
        if (Math.hypot(mx - p.x, my - p.y) < 8) {
          setSelectedKeyframe({ prop, index: i });
          setDragging({ prop, index: i, mode: 'value' });
          return;
        }
      }
    }

    // Empty area: scrub the playhead
    setSelectedKeyframe(null);
    const t = fromScreen(mx, my, w, h).time;
    setCurrentTime(t);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !currentLayer?.animations) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const w = rect.width, h = rect.height;
    const keys = currentLayer.animations[dragging.prop]?.keyframes || [];
    const kf = keys[dragging.index];
    if (!kf) return;

    if (dragging.mode === 'value') {
      const { value } = fromScreen(mx, my, w, h);
      const clamped = dragging.prop === 'opacity' || dragging.prop.endsWith('Progress') ? Math.max(0, Math.min(1, value)) : value;
      patchKeyframe(dragging.prop, dragging.index, { value: Math.round(clamped * 1000) / 1000 }, false);
      return;
    }

    const prev = keys[dragging.index - 1];
    if (!prev) return;
    const a = toScreen(prev.time, Number(prev.value), w, h);
    const b = toScreen(kf.time, Number(kf.value), w, h);
    const dx = b.x - a.x || 1, dy = b.y - a.y || 1;
    const nx = Math.max(0, Math.min(1, (mx - a.x) / dx));
    const ny = (my - a.y) / dy;
    const bezier = { ...(prev.bezierPoints || { cp1: { x: 0.25, y: 0.25 }, cp2: { x: 0.75, y: 0.75 } }) };
    if (dragging.mode === 'cp1') bezier.cp1 = { x: nx, y: ny }; else bezier.cp2 = { x: nx, y: ny };
    patchKeyframe(dragging.prop, dragging.index - 1, { bezierPoints: bezier, easing: 'bezier' }, false);
  };

  const handleMouseUp = () => {
    if (dragging && currentLayer) {
      updateLayerCommitted(currentLayer.id, {}, dragging.mode === 'value' ? 'Edit Keyframe Value' : 'Edit Bezier Handle');
    }
    setDragging(null);
    if (selectedKeyframe?.handle) setSelectedKeyframe({ ...selectedKeyframe, handle: undefined });
  };

  if (!currentLayer) {
    return <div className="flex-1 bg-[#111] border-l border-[#333] flex items-center justify-center text-[11px] text-gray-500">Select a layer to view its animation curves.</div>;
  }
  if (props.length === 0) {
    return <div className="flex-1 bg-[#111] border-l border-[#333] flex items-center justify-center text-[11px] text-gray-500">"{currentLayer.name}" has no keyframes yet — press Ctrl+K or "Add Keyframe" to start animating.</div>;
  }

  const selectedKf = selectedKeyframe ? animations?.[selectedKeyframe.prop]?.keyframes[selectedKeyframe.index] : undefined;
  const prevOfSelected = selectedKeyframe && selectedKeyframe.index > 0 ? animations?.[selectedKeyframe.prop]?.keyframes[selectedKeyframe.index - 1] : undefined;

  return (
    <div className="flex-1 bg-[#111] relative overflow-hidden border-l border-[#333] flex flex-col">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-[#222] bg-[#161616] flex-wrap">
        {props.map(p => (
          <button
            key={p}
            onClick={() => setVisibleProps(v => ({ ...v, [p]: v[p] === false }))}
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${visibleProps[p] === false ? 'border-[#333] text-gray-600' : 'border-[#444] text-gray-200'}`}
            style={{ borderColor: visibleProps[p] === false ? undefined : PROP_COLORS[p] || '#a78bfa' }}
            title={`Toggle ${p} curve`}
          >
            {p}
          </button>
        ))}
        <div className="flex-1" />
        {selectedKeyframe && selectedKf && (
          <>
            <span className="text-[10px] text-gray-400 font-mono">{selectedKeyframe.prop} @ {selectedKf.time.toFixed(2)}s = {typeof selectedKf.value === 'number' ? Math.round(selectedKf.value * 100) / 100 : String(selectedKf.value)}</span>
            <select
              value={prevOfSelected ? prevOfSelected.easing : selectedKf.easing}
              className="bg-[#222] text-[10px] text-gray-300 border border-[#444] rounded px-1.5 py-0.5 outline-none"
              title="Easing of the segment leading into this keyframe"
              onChange={(e) => {
                const idx = prevOfSelected ? selectedKeyframe.index - 1 : selectedKeyframe.index;
                patchKeyframe(selectedKeyframe.prop, idx, { easing: e.target.value as Keyframe['easing'] }, true, 'Change Easing');
              }}
            >
              <option value="linear">Linear</option>
              <option value="ease-in">Ease In</option>
              <option value="ease-out">Ease Out</option>
              <option value="ease-in-out">Ease In-Out</option>
              <option value="bezier">Bezier (drag handles)</option>
              <option value="snap">Snap / Hold</option>
              <option value="bounce">Bounce</option>
            </select>
            <button
              onClick={() => { removeKeyframe(currentLayer.id, selectedKeyframe.prop, selectedKeyframe.index); setSelectedKeyframe(null); }}
              className="px-2 py-0.5 bg-red-600/60 hover:bg-red-500 text-white text-[10px] font-bold rounded"
            >
              Delete
            </button>
          </>
        )}
        <button
          onClick={() => openEasingEditor({ layerId: currentLayer.id, property: selectedKeyframe?.prop, keyframeIndex: selectedKeyframe ? Math.max(0, selectedKeyframe.index - 1) : undefined })}
          className="px-2 py-0.5 bg-blue-600/80 hover:bg-blue-500 text-white text-[10px] font-bold rounded shadow transition-colors"
        >
          Easing Curve Editor…
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full flex-1 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      <div className="absolute bottom-1 right-2 text-[9px] text-gray-600 pointer-events-none">Drag points to change values · click empty space to scrub</div>
    </div>
  );
};
