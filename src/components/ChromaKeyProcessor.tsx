import React, { useEffect, useRef } from 'react';
import { Adjustments } from '../core/types';
import { pixelProcessingKey, processLayerPixels } from '../core/rendering/layerProcessor';

interface LayerPixelProcessorProps {
  layerId: string;
  source: ImageBitmap | HTMLCanvasElement | HTMLImageElement | null;
  adjustments: Adjustments | undefined;
  onProcessed: (layerId: string, canvas: HTMLCanvasElement) => void;
}

/**
 * Off-DOM pixel processor for raster layers (chroma key + curves).
 * Re-processes only when the source bitmap or the pixel-affecting adjustments change,
 * and reports the result through a ref-stabilised callback so parent re-renders never
 * trigger a re-process loop.
 */
export const ChromaKeyProcessor: React.FC<LayerPixelProcessorProps> = ({ layerId, source, adjustments, onProcessed }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const callbackRef = useRef(onProcessed);
  callbackRef.current = onProcessed;

  const processingKey = pixelProcessingKey(adjustments);

  useEffect(() => {
    if (!source) return;
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = processLayerPixels(source, adjustments, canvasRef.current);
    callbackRef.current(layerId, canvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, processingKey, layerId]);

  return null;
};
