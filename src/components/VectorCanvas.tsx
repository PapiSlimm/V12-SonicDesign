import React, { useEffect, useRef, useState } from 'react';
import { Layer, VectorPathSettings, BezierPoint } from '../core/types';
import { buildSvgPathD } from '../core/rendering/vectorPath';
import { DOC_WIDTH, DOC_HEIGHT } from '../core/layers/layerUtils';

export { buildSvgPathD };

interface VectorCanvasProps {
  layer: Layer;
  isSelected: boolean;
  tool: string;
  zoom?: number;
  /** Called while dragging (commit=false) and once on release (commit=true) */
  onUpdatePath?: (settings: VectorPathSettings, commit: boolean) => void;
  style?: React.CSSProperties;
}

type DragTarget = { index: number; part: 'anchor' | 'handleIn' | 'handleOut' };

const DEFAULT_VECTOR: VectorPathSettings = {
  points: [],
  closed: false,
  stroke: '#3b82f6',
  strokeWidth: 6,
  fill: '#3b82f633',
  fillEnabled: true,
  strokeEnabled: true,
  lineCap: 'round',
  lineJoin: 'round',
  pathProgress: 1
};

export const VectorCanvas: React.FC<VectorCanvasProps> = ({
  layer,
  isSelected,
  tool,
  zoom = 1,
  onUpdatePath,
  style
}) => {
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ target: DragTarget; points: BezierPoint[]; moved: boolean; altBreak: boolean } | null>(null);

  const vec = layer.vectorSettings || DEFAULT_VECTOR;
  const pathD = buildSvgPathD(vec.points, vec.closed);
  const strokeProgress = Math.max(0, Math.min(1, vec.pathProgress ?? 1));
  const isEditing = isSelected && (tool === 'pen' || tool === 'move') && !layer.locked;
  const inv = 1 / Math.max(0.05, zoom);

  /** Pointer → SVG user units, robust to any ancestor CSS transforms. */
  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  };

  useEffect(() => {
    if (!isEditing) return;
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const p = toSvgPoint(e.clientX, e.clientY);
      const pts = drag.points.map(pt => ({ ...pt, handleIn: pt.handleIn ? { ...pt.handleIn } : undefined, handleOut: pt.handleOut ? { ...pt.handleOut } : undefined }));
      const target = pts[drag.target.index];
      if (!target) return;
      if (drag.target.part === 'anchor') {
        const dx = p.x - target.x, dy = p.y - target.y;
        target.x = p.x; target.y = p.y;
        if (target.handleIn) { target.handleIn.x += dx; target.handleIn.y += dy; }
        if (target.handleOut) { target.handleOut.x += dx; target.handleOut.y += dy; }
      } else {
        const key = drag.target.part;
        target[key] = { x: p.x, y: p.y };
        // Mirror the opposite handle unless Alt is held (breaks the tangent)
        const opposite = key === 'handleIn' ? 'handleOut' : 'handleIn';
        if (!e.altKey && !drag.altBreak && target[opposite]) {
          target[opposite] = { x: target.x - (p.x - target.x), y: target.y - (p.y - target.y) };
        }
        if (e.altKey) drag.altBreak = true;
      }
      drag.moved = true;
      onUpdatePath?.({ ...vec, points: pts }, false);
    };
    const onUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      if (drag.moved) {
        const latest = layer.vectorSettings || vec;
        onUpdatePath?.({ ...latest }, true);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, layer.vectorSettings, onUpdatePath]);

  const startDrag = (e: React.MouseEvent, target: DragTarget) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedPointIndex(target.index);
    dragRef.current = { target, points: vec.points, moved: false, altBreak: false };
  };

  /** Alt+click an anchor without handles to give it smooth tangent handles; Alt+click with handles removes them. */
  const toggleHandles = (idx: number) => {
    const pts = vec.points.map(p => ({ ...p }));
    const p = pts[idx];
    if (p.handleIn || p.handleOut) {
      p.handleIn = undefined; p.handleOut = undefined;
    } else {
      const prev = pts[idx - 1] || pts[pts.length - 1];
      const next = pts[idx + 1] || pts[0];
      const dirX = (next?.x ?? p.x + 100) - (prev?.x ?? p.x - 100);
      const dirY = (next?.y ?? p.y) - (prev?.y ?? p.y);
      const len = Math.hypot(dirX, dirY) || 1;
      const hx = (dirX / len) * 60, hy = (dirY / len) * 60;
      p.handleIn = { x: p.x - hx, y: p.y - hy };
      p.handleOut = { x: p.x + hx, y: p.y + hy };
    }
    onUpdatePath?.({ ...vec, points: pts }, true);
  };

  const removeAnchor = (idx: number) => {
    if (vec.points.length <= 1) return;
    const pts = vec.points.filter((_, i) => i !== idx);
    setSelectedPointIndex(null);
    onUpdatePath?.({ ...vec, points: pts, closed: pts.length > 2 ? vec.closed : false }, true);
  };

  return (
    <div className="absolute pointer-events-none" style={{ ...style }}>
      <svg
        ref={svgRef}
        width={DOC_WIDTH}
        height={DOC_HEIGHT}
        viewBox={`0 0 ${DOC_WIDTH} ${DOC_HEIGHT}`}
        className="overflow-visible"
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id={`vec-grad-${layer.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={vec.stroke} stopOpacity="1" />
            <stop offset="100%" stopColor={vec.stroke} stopOpacity="0.75" />
          </linearGradient>
        </defs>

        {pathD && (
          <path
            d={pathD}
            fill={vec.fillEnabled && vec.points.length > 2 ? vec.fill : 'none'}
            stroke={vec.strokeEnabled ? `url(#vec-grad-${layer.id})` : 'none'}
            strokeWidth={vec.strokeWidth}
            strokeLinecap={vec.lineCap || 'round'}
            strokeLinejoin={vec.lineJoin || 'round'}
            pathLength={1}
            strokeDasharray={vec.dashArray ? vec.dashArray.join(' ') : (strokeProgress < 1 ? `${strokeProgress} 1` : undefined)}
            strokeDashoffset={vec.dashOffset || 0}
          />
        )}

        {isEditing && vec.points.map((pt, idx) => {
          const isPtSelected = selectedPointIndex === idx;
          return (
            <g key={`pt-${idx}`} className="pointer-events-auto">
              {pt.handleIn && (
                <>
                  <line x1={pt.x} y1={pt.y} x2={pt.handleIn.x} y2={pt.handleIn.y} stroke="#38bdf8" strokeWidth={1.5 * inv} strokeDasharray={`${3 * inv} ${3 * inv}`} />
                  <circle
                    cx={pt.handleIn.x} cy={pt.handleIn.y} r={5 * inv} fill="#38bdf8" stroke="#ffffff" strokeWidth={1.5 * inv}
                    className="cursor-move"
                    onMouseDown={(e) => startDrag(e, { index: idx, part: 'handleIn' })}
                  >
                    <title>{`Point ${idx + 1} handle in (drag; hold Alt to break tangent)`}</title>
                  </circle>
                </>
              )}
              {pt.handleOut && (
                <>
                  <line x1={pt.x} y1={pt.y} x2={pt.handleOut.x} y2={pt.handleOut.y} stroke="#f43f5e" strokeWidth={1.5 * inv} strokeDasharray={`${3 * inv} ${3 * inv}`} />
                  <circle
                    cx={pt.handleOut.x} cy={pt.handleOut.y} r={5 * inv} fill="#f43f5e" stroke="#ffffff" strokeWidth={1.5 * inv}
                    className="cursor-move"
                    onMouseDown={(e) => startDrag(e, { index: idx, part: 'handleOut' })}
                  >
                    <title>{`Point ${idx + 1} handle out (drag; hold Alt to break tangent)`}</title>
                  </circle>
                </>
              )}
              <rect
                x={pt.x - 6 * inv} y={pt.y - 6 * inv} width={12 * inv} height={12 * inv}
                fill={isPtSelected ? '#3b82f6' : '#ffffff'} stroke="#2563eb" strokeWidth={2 * inv} rx={2 * inv}
                className="cursor-move"
                onMouseDown={(e) => {
                  if (e.altKey) { e.stopPropagation(); e.preventDefault(); toggleHandles(idx); return; }
                  // Pen tool: clicking the first anchor of an open path (3+ points) closes it
                  if (tool === 'pen' && idx === 0 && vec.points.length > 2 && !vec.closed) {
                    e.stopPropagation(); e.preventDefault();
                    onUpdatePath?.({ ...vec, closed: true }, true);
                    return;
                  }
                  startDrag(e, { index: idx, part: 'anchor' });
                }}
                onDoubleClick={(e) => { e.stopPropagation(); removeAnchor(idx); }}
              >
                <title>{`Anchor ${idx + 1} — drag to move · Alt+click toggles curve handles · double-click deletes`}</title>
              </rect>
              <text x={pt.x + 10 * inv} y={pt.y - 10 * inv} fill="#38bdf8" fontSize={10 * inv} fontFamily="monospace" fontWeight="bold" className="pointer-events-none select-none">
                P{idx + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
