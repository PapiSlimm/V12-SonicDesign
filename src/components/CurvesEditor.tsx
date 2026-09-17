import React, { useState, useRef, useEffect } from 'react';
import { ColorPoint, CurvesAdjustment } from '../core/types';
import { buildCurveLUT } from '../core/rendering/layerProcessor';

interface CurvesEditorProps {
  adjustment: CurvesAdjustment;
  onChange: (newAdjustment: CurvesAdjustment) => void;
}

export const CurvesEditor: React.FC<CurvesEditorProps> = ({ adjustment, onChange }) => {
  const [activeChannel, setActiveChannel] = useState<keyof CurvesAdjustment>('rgb');
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingPointIndex, setDraggingPointIndex] = useState<number | null>(null);

  const points = adjustment[activeChannel];

  const getSvgCoords = (e: React.MouseEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(255, ((e.clientX - rect.left) / rect.width) * 255)),
      y: Math.max(0, Math.min(255, (1 - (e.clientY - rect.top) / rect.height) * 255))
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const { x, y } = getSvgCoords(e);
    
    // Check if clicking near an existing point
    const threshold = 10;
    const existingIndex = points.findIndex(p => 
      Math.abs(p.x - x) < threshold && Math.abs(p.y - y) < threshold
    );

    if (existingIndex !== -1) {
      setDraggingPointIndex(existingIndex);
    } else {
      // Add new point
      const newPoints = [...points, { x, y }].sort((a, b) => a.x - b.x);
      const newIndex = newPoints.findIndex(p => p.x === x && p.y === y);
      onChange({ ...adjustment, [activeChannel]: newPoints });
      setDraggingPointIndex(newIndex);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingPointIndex === null) return;

    const { x, y } = getSvgCoords(e);
    const newPoints = [...points];
    
    // Don't allow moving first and last points horizontally
    if (draggingPointIndex === 0) {
      newPoints[draggingPointIndex] = { x: 0, y };
    } else if (draggingPointIndex === points.length - 1) {
      newPoints[draggingPointIndex] = { x: 255, y };
    } else {
      // Ensure point stays between neighbors
      const minX = newPoints[draggingPointIndex - 1].x + 1;
      const maxX = newPoints[draggingPointIndex + 1].x - 1;
      newPoints[draggingPointIndex] = { x: Math.max(minX, Math.min(maxX, x)), y };
    }

    onChange({ ...adjustment, [activeChannel]: newPoints });
  };

  const handleMouseUp = () => {
    setDraggingPointIndex(null);
  };

  /** Draw the exact monotone spline the pixel processor applies (viewBox 0..255, y flipped). */
  const generatePath = () => {
    if (points.length < 2) return '';
    const lut = buildCurveLUT(points);
    let path = `M 0 ${255 - lut[0]}`;
    for (let x = 1; x < 256; x += 2) path += ` L ${x} ${255 - lut[x]}`;
    path += ` L 255 ${255 - lut[255]}`;
    return path;
  };

  const resetChannel = () => onChange({ ...adjustment, [activeChannel]: [{ x: 0, y: 0 }, { x: 255, y: 255 }] });
  const resetAll = () => onChange({
    rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
  });

  const channelColors = {
    rgb: '#3b82f6',
    red: '#ef4444',
    green: '#22c55e',
    blue: '#3b82f6'
  };

  return (
    <div className="flex flex-col gap-3">
      <div 
        className="bg-[#1a1a1a] aspect-square rounded border border-[#3a3a3a] relative overflow-hidden cursor-crosshair"
        onContextMenu={(e) => {
          e.preventDefault();
          const { x, y } = getSvgCoords(e);
          const idx = points.findIndex((p, i) => i !== 0 && i !== points.length - 1 && Math.abs(p.x - x) < 10 && Math.abs(p.y - y) < 10);
          if (idx !== -1) onChange({ ...adjustment, [activeChannel]: points.filter((_, i) => i !== idx) });
        }}
        onMouseDown={(e) => { if (e.button === 0) handleMouseDown(e); }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg ref={svgRef} viewBox="0 0 255 255" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
          {/* Grid */}
          {[63.75, 127.5, 191.25].map(v => (
            <React.Fragment key={v}>
              <line x1={v} y1="0" x2={v} y2="255" stroke="#222" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1={v} x2="255" y2={v} stroke="#222" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            </React.Fragment>
          ))}
          
          {/* Diagonal */}
          <line x1="0" y1="255" x2="255" y2="0" stroke="#333" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          
          {/* Curve */}
          <path 
            d={generatePath()} 
            fill="none" 
            stroke={channelColors[activeChannel]} 
            strokeWidth="2" 
            vectorEffect="non-scaling-stroke"
          />
          
          {/* Points */}
          {points.map((p, i) => (
            <circle 
              key={i}
              cx={p.x}
              cy={255 - p.y}
              r="4"
              fill={draggingPointIndex === i ? 'white' : channelColors[activeChannel]}
              stroke="white"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      
      <div className="flex gap-1">
        {(['rgb', 'red', 'green', 'blue'] as const).map(c => (
          <button 
            key={c} 
            onClick={() => setActiveChannel(c)}
            className={`flex-1 py-1 text-[9px] rounded border uppercase transition-colors ${activeChannel === c ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#1a1a1a] border-[#3a3a3a] text-gray-500 hover:text-gray-300'}`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <button onClick={resetChannel} className="flex-1 py-1 text-[9px] rounded border border-[#3a3a3a] bg-[#1a1a1a] text-gray-400 hover:text-white" title="Reset this channel to a straight line">Reset {activeChannel.toUpperCase()}</button>
        <button onClick={resetAll} className="flex-1 py-1 text-[9px] rounded border border-[#3a3a3a] bg-[#1a1a1a] text-gray-400 hover:text-white" title="Reset all channels">Reset All</button>
      </div>
      <p className="text-[9px] text-gray-500">Click to add a point, drag to shape the curve. Right-click a point to remove it.</p>
    </div>
  );
};
