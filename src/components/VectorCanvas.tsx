import React, { useState } from 'react';
import { Layer, VectorPathSettings, BezierPoint } from '../core/types';

interface VectorCanvasProps {
  layer: Layer;
  isSelected: boolean;
  tool: string;
  zoom?: number;
  onUpdatePath?: (settings: VectorPathSettings) => void;
  style?: React.CSSProperties;
}

export function buildSvgPathD(points: BezierPoint[] = [], closed: boolean = false): string {
  if (!points || points.length === 0) return '';
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];

    const cp1 = curr.handleOut ? curr.handleOut : { x: curr.x, y: curr.y };
    const cp2 = next.handleIn ? next.handleIn : { x: next.x, y: next.y };

    d += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${next.x} ${next.y}`;
  }

  if (closed && points.length > 2) {
    const last = points[points.length - 1];
    const first = points[0];

    const cp1 = last.handleOut ? last.handleOut : { x: last.x, y: last.y };
    const cp2 = first.handleIn ? first.handleIn : { x: first.x, y: first.y };

    d += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${first.x} ${first.y} Z`;
  }

  return d;
}

export const VectorCanvas: React.FC<VectorCanvasProps> = ({
  layer,
  isSelected,
  tool,
  zoom = 1,
  onUpdatePath,
  style
}) => {
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);

  const vec = layer.vectorSettings || {
    points: [
      { x: 200, y: 300, handleOut: { x: 350, y: 200 } },
      { x: 500, y: 400, handleIn: { x: 400, y: 500 }, handleOut: { x: 600, y: 300 } },
      { x: 800, y: 250, handleIn: { x: 700, y: 200 } }
    ],
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

  const pathD = buildSvgPathD(vec.points, vec.closed);
  const strokeProgress = vec.pathProgress ?? 1;

  // Approximate path perimeter for animated stroke progress
  const pathLength = 2000;
  const strokeDashoffset = pathLength * (1 - Math.max(0, Math.min(1, strokeProgress)));

  const isEditingPen = isSelected && (tool === 'pen' || tool === 'move');

  return (
    <div className="absolute inset-0 pointer-events-none z-10" style={style}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1920 1080"
        className="w-full h-full overflow-visible"
      >
        <defs>
          <linearGradient id={`vec-grad-${layer.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={vec.stroke} stopOpacity="1" />
            <stop offset="100%" stopColor={vec.stroke} stopOpacity="0.7" />
          </linearGradient>
        </defs>

        {/* Path Fill & Stroke */}
        {pathD && (
          <path
            d={pathD}
            fill={vec.fillEnabled ? vec.fill : 'none'}
            stroke={vec.strokeEnabled ? `url(#vec-grad-${layer.id})` : 'none'}
            strokeWidth={vec.strokeWidth}
            strokeLinecap={vec.lineCap || 'round'}
            strokeLinejoin={vec.lineJoin || 'round'}
            strokeDasharray={vec.dashArray ? vec.dashArray.join(' ') : `${pathLength}`}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-75"
          />
        )}

        {/* Bezier Handles & Interactive Anchor Points Overlay */}
        {isEditingPen && vec.points && vec.points.map((pt, idx) => {
          const isPtSelected = selectedPointIndex === idx;

          return (
            <g key={`pt-${idx}`} className="pointer-events-auto cursor-pointer">
              {/* Tangent direction lines to Handle In */}
              {pt.handleIn && (
                <>
                  <line
                    x1={pt.x}
                    y1={pt.y}
                    x2={pt.handleIn.x}
                    y2={pt.handleIn.y}
                    stroke="#38bdf8"
                    strokeWidth={1.5 / zoom}
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={pt.handleIn.x}
                    cy={pt.handleIn.y}
                    r={5 / zoom}
                    fill="#38bdf8"
                    stroke="#ffffff"
                    strokeWidth={1.5 / zoom}
                    className="hover:scale-125 transition-transform"
                    title={`Point ${idx + 1} Handle In`}
                  />
                </>
              )}

              {/* Tangent direction lines to Handle Out */}
              {pt.handleOut && (
                <>
                  <line
                    x1={pt.x}
                    y1={pt.y}
                    x2={pt.handleOut.x}
                    y2={pt.handleOut.y}
                    stroke="#f43f5e"
                    strokeWidth={1.5 / zoom}
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={pt.handleOut.x}
                    cy={pt.handleOut.y}
                    r={5 / zoom}
                    fill="#f43f5e"
                    stroke="#ffffff"
                    strokeWidth={1.5 / zoom}
                    className="hover:scale-125 transition-transform"
                    title={`Point ${idx + 1} Handle Out`}
                  />
                </>
              )}

              {/* Anchor Point Box */}
              <rect
                x={pt.x - 6 / zoom}
                y={pt.y - 6 / zoom}
                width={12 / zoom}
                height={12 / zoom}
                fill={isPtSelected ? '#3b82f6' : '#ffffff'}
                stroke="#2563eb"
                strokeWidth={2 / zoom}
                rx={2 / zoom}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPointIndex(idx);
                }}
                className="hover:scale-125 transition-transform shadow-md"
              />

              {/* Point Label */}
              <text
                x={pt.x + 10 / zoom}
                y={pt.y - 10 / zoom}
                fill="#38bdf8"
                fontSize={10 / zoom}
                fontFamily="monospace"
                fontWeight="bold"
              >
                P{idx + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
