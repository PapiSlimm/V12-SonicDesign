import React, { useEffect, useRef } from 'react';
import { Layer } from '../core/types';
import { Folder, Activity, Sun, Music, Sparkles, Sliders } from 'lucide-react';

interface LayerThumbnailProps {
  layer: Layer;
  size?: number;
}

export const LayerThumbnail: React.FC<LayerThumbnailProps> = ({ layer, size = 28 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);

    // Render Checkerboard Background for transparency
    const checkSize = 4;
    for (let x = 0; x < size; x += checkSize) {
      for (let y = 0; y < size; y += checkSize) {
        ctx.fillStyle = (x / checkSize + y / checkSize) % 2 === 0 ? '#1f1f23' : '#2d2d32';
        ctx.fillRect(x, y, checkSize, checkSize);
      }
    }

    if (layer.bitmap && (layer.type === 'raster' || !layer.type)) {
      try {
        ctx.drawImage(layer.bitmap, 0, 0, size, size);
      } catch (err) {
        // Fallback if bitmap draw fails
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(4, 4, size - 8, size - 8);
      }
    } else if (layer.type === 'shape' && layer.shapeSettings) {
      ctx.fillStyle = layer.shapeSettings.fill || '#3b82f6';
      ctx.strokeStyle = layer.shapeSettings.stroke || '#ffffff';
      ctx.lineWidth = Math.min(layer.shapeSettings.strokeWidth || 1, 2);

      const margin = 4;
      if (layer.shapeSettings.type === 'circle') {
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, (size - margin * 2) / 2, 0, Math.PI * 2);
        ctx.fill();
        if (layer.shapeSettings.strokeWidth > 0) ctx.stroke();
      } else {
        ctx.fillRect(margin, margin, size - margin * 2, size - margin * 2);
        if (layer.shapeSettings.strokeWidth > 0) {
          ctx.strokeRect(margin, margin, size - margin * 2, size - margin * 2);
        }
      }
    } else if (layer.type === 'text' || layer.type === '3d-text') {
      const char = layer.content ? layer.content.trim().charAt(0).toUpperCase() || 'T' : 'T';
      ctx.fillStyle = layer.fontSettings?.color || '#3b82f6';
      ctx.font = `bold ${Math.round(size * 0.6)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(char, size / 2, size / 2 + 1);
    } else if (layer.type === 'vector' && layer.vectorSettings) {
      ctx.fillStyle = layer.vectorSettings.fillEnabled ? layer.vectorSettings.fill : 'transparent';
      ctx.strokeStyle = layer.vectorSettings.strokeEnabled ? layer.vectorSettings.stroke : '#a855f7';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(4, size - 6);
      ctx.lineTo(size / 2, 6);
      ctx.lineTo(size - 4, size - 6);
      if (layer.vectorSettings.closed) ctx.closePath();
      if (layer.vectorSettings.fillEnabled) ctx.fill();
      ctx.stroke();
    } else if (layer.type === 'adjustment') {
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, '#f59e0b');
      grad.addColorStop(1, '#ef4444');
      ctx.fillStyle = grad;
      ctx.fillRect(3, 3, size - 6, size - 6);
    } else if (layer.type === 'group') {
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(3, 8, size - 6, size - 11);
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(3, 5, 8, 4);
    } else {
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(4, 4, size - 8, size - 8);
    }
  }, [layer, layer.bitmap, layer.type, layer.shapeSettings, layer.content, layer.fontSettings, layer.vectorSettings, size]);

  return (
    <div 
      className="relative rounded overflow-hidden border border-[#3f3f46] shadow-inner flex-shrink-0 bg-[#09090b] flex items-center justify-center"
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <canvas ref={canvasRef} width={size} height={size} className="block w-full h-full object-cover" />
    </div>
  );
};
