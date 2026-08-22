import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../store/index';
import { Keyframe } from '../core/types';

export const GraphEditor: React.FC = () => {
  const { layers, selectedLayerId, currentTime, updateLayer } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedKeyframe, setSelectedKeyframe] = useState<{ prop: string, index: number, handle?: 'cp1' | 'cp2' } | null>(null);

  const currentLayer = layers.find(l => l.id === selectedLayerId);
  if (!currentLayer || !currentLayer.animations) return null;

  const getBezierCoords = (kf: Keyframe, prevKf: Keyframe, rect: DOMRect) => {
    const x = (kf.time / 60) * rect.width;
    const y = rect.height - (Number(kf.value) / 1000) * rect.height;
    const prevX = (prevKf.time / 60) * rect.width;
    const prevY = rect.height - (Number(prevKf.value) / 1000) * rect.height;
    
    const points = kf.bezierPoints || { cp1: { x: 0.25, y: 0.25 }, cp2: { x: 0.75, y: 0.75 } };
    
    return {
      cp1: {
        x: prevX + (x - prevX) * points.cp1.x,
        y: prevY + (y - prevY) * points.cp1.y
      },
      cp2: {
        x: prevX + (x - prevX) * points.cp2.x,
        y: prevY + (y - prevY) * points.cp2.y
      },
      x, y, prevX, prevY
    };
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();

    // Set resolution relative to screen scale
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw grid (Technical/Engine look)
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    const gridX = rect.width / 12;
    const gridY = rect.height / 4;
    for (let i = 0; i <= rect.width; i += gridX) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, rect.height); ctx.stroke();
    }
    for (let i = 0; i <= rect.height; i += gridY) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(rect.width, i); ctx.stroke();
    }

    // Draw curves
    Object.entries(currentLayer.animations).forEach(([prop, anim]) => {
      const keys = [...anim.keyframes].sort((a, b) => a.time - b.time);
      if (keys.length < 2) return;

      const color = prop === 'x' ? '#ff4b4b' : prop === 'y' ? '#4bff4b' : prop === 'rotation' ? '#4b4bff' : '#ff4bff';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      keys.forEach((kf, i) => {
        const x = (kf.time / 60) * rect.width;
        const y = rect.height - (Number(kf.value) / 1000) * rect.height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          const prevKf = keys[i - 1];
          const coords = getBezierCoords(kf, prevKf, rect);
          
          if (kf.easing === 'bezier') {
            ctx.bezierCurveTo(coords.cp1.x, coords.cp1.y, coords.cp2.x, coords.cp2.y, x, y);
          } else if (kf.easing === 'ease-in-out') {
            ctx.bezierCurveTo(coords.prevX + (x - coords.prevX) * 0.5, coords.prevY, coords.prevX + (x - coords.prevX) * 0.5, y, x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();

      // Keyframes & Interactive Handles
      keys.forEach((kf, i) => {
        const x = (kf.time / 60) * rect.width;
        const y = rect.height - (Number(kf.value) / 1000) * rect.height;
        const isSelected = selectedKeyframe?.prop === prop && selectedKeyframe?.index === i;

        if (isSelected && kf.easing === 'bezier' && i > 0) {
          const prevKf = keys[i - 1];
          const coords = getBezierCoords(kf, prevKf, rect);
          
          ctx.setLineDash([2, 4]);
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(coords.prevX, coords.prevY); ctx.lineTo(coords.cp1.x, coords.cp1.y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(coords.cp2.x, coords.cp2.y); ctx.stroke();
          ctx.setLineDash([]);

          // Control Points
          ctx.beginPath(); ctx.arc(coords.cp1.x, coords.cp1.y, 5, 0, Math.PI * 2); 
          ctx.fillStyle = selectedKeyframe.handle === 'cp1' ? '#4ade80' : '#3b82f6';
          ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke();

          ctx.beginPath(); ctx.arc(coords.cp2.x, coords.cp2.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = selectedKeyframe.handle === 'cp2' ? '#4ade80' : '#3b82f6';
          ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke();
        }

        ctx.fillStyle = isSelected ? '#fff' : color;
        if (isSelected) {
          ctx.beginPath(); ctx.rect(x - 5, y - 5, 10, 10); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        }
      });
    });

    // Playhead (Modernized)
    const px = (currentTime / 60) * rect.width;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, rect.height); ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.moveTo(px - 5, 0); ctx.lineTo(px + 5, 0); ctx.lineTo(px, 8); ctx.fill();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!selectedKeyframe || !selectedKeyframe.handle || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const anim = currentLayer.animations![selectedKeyframe.prop];
    const keys = [...anim.keyframes].sort((a, b) => a.time - b.time);
    const kf = keys[selectedKeyframe.index];
    const prevKf = keys[selectedKeyframe.index - 1];
    if (!prevKf) return;

    const x = (kf.time / 60) * rect.width;
    const y = rect.height - (Number(kf.value) / 1000) * rect.height;
    const prevX = (prevKf.time / 60) * rect.width;
    const prevY = rect.height - (Number(prevKf.value) / 1000) * rect.height;

    const dx = x - prevX || 1;
    const dy = y - prevY || 1;

    const nx = (mouseX - prevX) / dx;
    const ny = (mouseY - prevY) / dy;

    const newBezier = { ...(kf.bezierPoints || { cp1: { x: 0.25, y: 0.25 }, cp2: { x: 0.75, y: 0.75 } }) };
    if (selectedKeyframe.handle === 'cp1') {
      newBezier.cp1 = { x: nx, y: ny };
    } else {
      newBezier.cp2 = { x: nx, y: ny };
    }

    const newAnims = { ...currentLayer.animations };
    newAnims[selectedKeyframe.prop].keyframes[selectedKeyframe.index].bezierPoints = newBezier;
    newAnims[selectedKeyframe.prop].keyframes[selectedKeyframe.index].easing = 'bezier';
    updateLayer(selectedLayerId!, { animations: newAnims });
  };

  useEffect(() => {
    draw();
  }, [currentLayer, currentTime, selectedKeyframe]);

  return (
    <div className="flex-1 bg-[#111] relative overflow-hidden border-l border-[#333]">
      <div className="absolute top-2 left-2 flex items-center gap-2 z-10">
        <select 
          value={selectedKeyframe ? currentLayer.animations![selectedKeyframe.prop].keyframes[selectedKeyframe.index].easing : 'linear'}
          className="bg-[#222] text-[10px] text-gray-300 border border-[#444] rounded px-1.5 py-0.5 outline-none"
          onChange={(e) => {
            if (selectedKeyframe && currentLayer.animations) {
              const newAnimations = { ...currentLayer.animations };
              newAnimations[selectedKeyframe.prop].keyframes[selectedKeyframe.index].easing = e.target.value as any;
              updateLayer(selectedLayerId!, { animations: newAnimations });
            }
          }}
        >
          <option value="linear">Linear</option>
          <option value="ease-in-out">In-Out</option>
          <option value="bezier">Bezier</option>
        </select>
        <button
          onClick={() => {
            useStore.getState().openEasingEditor({
              layerId: selectedLayerId || undefined,
              property: selectedKeyframe?.prop,
              keyframeIndex: selectedKeyframe?.index
            });
          }}
          className="px-2 py-0.5 bg-blue-600/80 hover:bg-blue-500 text-white text-[10px] font-bold rounded flex items-center gap-1 shadow transition-colors"
        >
          Easing Curve Editor...
        </button>
      </div>
      <canvas 
        ref={canvasRef}
        width={1000}
        height={200}
        className="w-full h-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseUp={() => selectedKeyframe?.handle && setSelectedKeyframe({ ...selectedKeyframe, handle: undefined })}
        onMouseDown={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

          if (selectedKeyframe && currentLayer.animations![selectedKeyframe.prop].keyframes[selectedKeyframe.index].easing === 'bezier') {
            const kf = currentLayer.animations![selectedKeyframe.prop].keyframes[selectedKeyframe.index];
            const prevKf = currentLayer.animations![selectedKeyframe.prop].keyframes[selectedKeyframe.index - 1];
            if (prevKf) {
              const coords = getBezierCoords(kf, prevKf, rect);
              if (Math.hypot(mouseX - coords.cp1.x, mouseY - coords.cp1.y) < 10) {
                setSelectedKeyframe({ ...selectedKeyframe, handle: 'cp1' });
                return;
              }
              if (Math.hypot(mouseX - coords.cp2.x, mouseY - coords.cp2.y) < 10) {
                setSelectedKeyframe({ ...selectedKeyframe, handle: 'cp2' });
                return;
              }
            }
          }

          Object.entries(currentLayer.animations!).forEach(([prop, anim]) => {
            anim.keyframes.forEach((kf, i) => {
              const x = (kf.time / 60) * rect.width;
              const y = rect.height - (Number(kf.value) / 1000) * rect.height;
              if (Math.hypot(mouseX - x, mouseY - y) < 10) {
                setSelectedKeyframe({ prop, index: i });
              }
            });
          });
        }}
      />
    </div>
  );
};
