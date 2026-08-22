import React, { useState, useRef, useEffect } from 'react';
import { ColorPoint, CurvesAdjustment } from '../core/types';

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

  const generatePath = () => {
    if (points.length < 2) return '';
    let path = `M ${(points[0].x / 255) * 100}% ${((255 - points[0].y) / 255) * 100}%`;
    
    // Simple linear path for now, spline could be added later
    for (let i = 1; i < points.length; i++) {
      path += ` L ${(points[i].x / 255) * 100}% ${((255 - points[i].y) / 255) * 100}%`;
    }
    return path;
  };

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
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none">
          {/* Grid */}
          <line x1="25%" y1="0" x2="25%" y2="100%" stroke="#222" strokeWidth="1" />
          <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#222" strokeWidth="1" />
          <line x1="75%" y1="0" x2="75%" y2="100%" stroke="#222" strokeWidth="1" />
          <line x1="0" y1="25%" x2="100%" y2="25%" stroke="#222" strokeWidth="1" />
          <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#222" strokeWidth="1" />
          <line x1="0" y1="75%" x2="100%" y2="75%" stroke="#222" strokeWidth="1" />
          
          {/* Diagonal */}
          <line x1="0" y1="100%" x2="100%" y2="0" stroke="#333" strokeWidth="1" />
          
          {/* Curve */}
          <path 
            d={generatePath()} 
            fill="none" 
            stroke={channelColors[activeChannel]} 
            strokeWidth="2" 
          />
          
          {/* Points */}
          {points.map((p, i) => (
            <circle 
              key={i}
              cx={`${(p.x / 255) * 100}%`}
              cy={`${((255 - p.y) / 255) * 100}%`}
              r="4"
              fill={draggingPointIndex === i ? 'white' : channelColors[activeChannel]}
              stroke="white"
              strokeWidth="1"
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
    </div>
  );
};
