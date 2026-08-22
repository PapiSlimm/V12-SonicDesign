import React, { useEffect, useRef } from 'react';
import { Layer } from '../core/types';

interface LayerRendererProps {
  layer: Layer;
  processedCanvas?: HTMLCanvasElement;
  isSelected: boolean;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  zIndex: number;
}

export const LayerRenderer: React.FC<LayerRendererProps> = React.memo(({ 
  layer, 
  processedCanvas, 
  isSelected, 
  canvasRef,
  zIndex
}) => {
  const localCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisibleInViewport, setIsVisibleInViewport] = React.useState(true);

  useEffect(() => {
    // Simple intersection observer or visibility check could go here
    // For now, we manually track or assume visible if z-index is within range
  }, []);

  useEffect(() => {
    if (!isVisibleInViewport) return;
    if (layer.id === (isSelected ? layer.id : '') && canvasRef?.current && layer.bitmap) {
      // Drawing of the selected layer to the shared interactive canvas is handled by Canvas.tsx effect
      return;
    }

    const canvas = localCanvasRef.current;
    if (canvas && processedCanvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = 1920;
        canvas.height = 1080;
        ctx.clearRect(0, 0, 1920, 1080);
        ctx.drawImage(processedCanvas, 0, 0);
      }
    }
  }, [processedCanvas, layer.bitmap, isSelected, layer.id]);

  const transform = layer.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
  const styles = layer.layerStyles || {};
  
  const dropShadow = styles.dropShadow?.enabled ? `${styles.dropShadow.distance}px ${styles.dropShadow.distance}px ${styles.dropShadow.size}px ${styles.dropShadow.color}${Math.round((styles.dropShadow.opacity ?? 0.7) * 255).toString(16).padStart(2, '0')}` : 'none';
  const innerShadow = styles.innerShadow?.enabled ? `inset ${styles.innerShadow.distance}px ${styles.innerShadow.distance}px ${styles.innerShadow.size}px ${styles.innerShadow.color}${Math.round((styles.innerShadow.opacity ?? 0.5) * 255).toString(16).padStart(2, '0')}` : 'none';
  const strokeBorder = styles.stroke?.enabled ? `${styles.stroke.width}px solid ${styles.stroke.color}` : undefined;

  const style: React.CSSProperties = {
    position: 'absolute',
    left: transform.x,
    top: transform.y,
    width: layer.type === 'shape' ? '200px' : '100%',
    height: layer.type === 'shape' ? '200px' : '100%',
    transform: `scale(${transform.scaleX}, ${transform.scaleY}) rotate(${transform.rotation}deg) skew(${transform.skewX || 0}deg, ${transform.skewY || 0}deg)`,
    opacity: layer.opacity,
    mixBlendMode: layer.blendMode as any,
    border: strokeBorder,
    boxShadow: `${dropShadow !== 'none' ? dropShadow : ''}${dropShadow !== 'none' && innerShadow !== 'none' ? ', ' : ''}${innerShadow !== 'none' ? innerShadow : ''}`,
    filter: layer.type === 'adjustment' ? 'none' : `
      brightness(${layer.adjustments.brightness}%) 
      contrast(${layer.adjustments.contrast}%) 
      saturate(${layer.adjustments.saturation}%) 
      hue-rotate(${layer.adjustments.hue}deg)
      ${styles.outerGlow?.enabled ? `drop-shadow(0 0 ${styles.outerGlow.size}px ${styles.outerGlow.color})` : ''}
    `,
    backdropFilter: layer.type === 'adjustment' ? `
      brightness(${layer.adjustments.brightness}%) 
      contrast(${layer.adjustments.contrast}%) 
      saturate(${layer.adjustments.saturation}%) 
      hue-rotate(${layer.adjustments.hue}deg)
    ` : 'none',
    zIndex: zIndex,
    pointerEvents: 'none'
  };

  if (layer.type === 'shape' && layer.shapeSettings) {
    return (
      <div 
        style={{
          ...style,
          backgroundColor: layer.shapeSettings.fill,
          border: `${layer.shapeSettings.strokeWidth}px solid ${layer.shapeSettings.stroke}`,
          borderRadius: layer.shapeSettings.type === 'circle' ? '50%' : '0'
        }}
      />
    );
  }

  if (layer.type === 'text' || layer.type === '3d-text') {
    // Basic text rendering... 
    // Simplified for now, in a real app would handle 3D depth here too
    return (
      <div 
        style={{
          ...style,
          fontFamily: layer.fontSettings?.family || 'Inter',
          fontSize: `${layer.fontSettings?.size || 48}px`,
          fontWeight: layer.fontSettings?.weight || 'bold',
          color: layer.fontSettings?.color || '#ffffff',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          letterSpacing: `${layer.fontSettings?.tracking || 0}px`,
          lineHeight: layer.fontSettings?.leading || 1.2
        }}
      >
        {layer.content}
      </div>
    );
  }

  if (layer.id === isSelected && canvasRef) {
    return <canvas ref={canvasRef} style={style} />;
  }

  return (
    <canvas 
      ref={localCanvasRef}
      style={style}
    />
  );
});
