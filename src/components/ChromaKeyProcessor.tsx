import React, { useEffect, useRef } from 'react';
import { ChromaKeySettings } from '../core/types';

interface ChromaKeyProcessorProps {
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap | null;
  settings: ChromaKeySettings;
  width: number;
  height: number;
  onProcessed: (canvas: HTMLCanvasElement) => void;
}

export const ChromaKeyProcessor: React.FC<ChromaKeyProcessorProps> = ({ 
  source, 
  settings, 
  width, 
  height, 
  onProcessed 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!source || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Draw source
    ctx.drawImage(source, 0, 0, width, height);

    if (!settings.enabled) {
      onProcessed(canvas);
      return;
    }

    // Apply Chroma Key
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Convert hex to RGB
    const hex = settings.targetColor.replace('#', '');
    const rKey = parseInt(hex.substring(0, 2), 16);
    const gKey = parseInt(hex.substring(2, 4), 16);
    const bKey = parseInt(hex.substring(4, 6), 16);

    const similarity = settings.similarity / 100 * 255;
    const smoothness = settings.smoothness / 100 * 255;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Calculate distance in RGB space
      const distance = Math.sqrt(
        Math.pow(r - rKey, 2) + 
        Math.pow(g - gKey, 2) + 
        Math.pow(b - bKey, 2)
      );

      if (distance < similarity) {
        data[i + 3] = 0; // Transparent
      } else if (distance < similarity + smoothness) {
        // Feathering/Smoothness
        const alpha = (distance - similarity) / smoothness;
        data[i + 3] = Math.min(data[i + 3], alpha * 255);
      }
      
      // Spill Suppression (very basic: reduce the key color component)
      if (settings.spillSuppression > 0 && data[i + 3] > 0) {
        const spillFactor = settings.spillSuppression / 100;
        if (gKey > rKey && gKey > bKey) { // Green key
          data[i + 1] = Math.min(data[i + 1], (data[i] + data[i + 2]) / 2 * (1 + spillFactor));
        } else if (rKey > gKey && rKey > bKey) { // Red key
          data[i] = Math.min(data[i], (data[i + 1] + data[i + 2]) / 2 * (1 + spillFactor));
        } else if (bKey > rKey && bKey > gKey) { // Blue key
          data[i + 2] = Math.min(data[i + 2], (data[i] + data[i + 1]) / 2 * (1 + spillFactor));
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    onProcessed(canvas);
  }, [source, settings, width, height, onProcessed]);

  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height} 
      style={{ display: 'none' }} 
    />
  );
};
