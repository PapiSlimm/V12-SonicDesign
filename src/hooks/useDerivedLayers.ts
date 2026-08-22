import { useMemo } from 'react';
import { Layer } from '../core/types';
import { solveCubicBezier } from '../components/EasingEditorModal';
import { useStore } from '../store/index';

export interface EvaluatedLayer extends Layer {
  calculatedMotionBlur?: {
    blurPx: number;
    dx: number;
    dy: number;
    speed: number;
  };
}

export function computeLayersAtTime(layers: Layer[], currentTime: number, previewBlendMode?: { layerId: string; mode: any } | null): EvaluatedLayer[] {
  return layers.map(layer => {
    let newTransform = { ...layer.transform };
    let hasChanges = false;

    if (layer.animations && Object.keys(layer.animations).length > 0) {
      Object.entries(layer.animations).forEach(([prop, animation]) => {
        const keyframes = animation.keyframes;
        if (!keyframes || keyframes.length === 0) return;

        let start = keyframes[0];
        let end = keyframes[keyframes.length - 1];

        if (currentTime <= start.time) {
          (newTransform as any)[prop] = start.value;
          hasChanges = true;
          return;
        }
        if (currentTime >= end.time) {
          (newTransform as any)[prop] = end.value;
          hasChanges = true;
          return;
        }

        for (let i = 0; i < keyframes.length - 1; i++) {
          if (currentTime >= keyframes[i].time && currentTime <= keyframes[i + 1].time) {
            start = keyframes[i];
            end = keyframes[i + 1];
            break;
          }
        }

        if (start === end) {
          (newTransform as any)[prop] = start.value;
        } else {
          const range = end.time - start.time;
          const progress = (currentTime - start.time) / range;
          
          let easedProgress = progress;
          if (start.bezierPoints || start.easing === 'bezier') {
            const cp1 = start.bezierPoints?.cp1 || { x: 0.25, y: 0.25 };
            const cp2 = start.bezierPoints?.cp2 || { x: 0.75, y: 0.75 };
            easedProgress = solveCubicBezier(cp1.x, cp1.y, cp2.x, cp2.y, progress);
          } else if (start.easing === 'ease-in') {
            easedProgress = solveCubicBezier(0.42, 0, 1, 1, progress);
          } else if (start.easing === 'ease-out') {
            easedProgress = solveCubicBezier(0, 0, 0.58, 1, progress);
          } else if (start.easing === 'ease-in-out') {
            easedProgress = solveCubicBezier(0.42, 0, 0.58, 1, progress);
          } else if (start.easing === 'snap') {
            easedProgress = progress < 0.5 ? 0 : 1;
          } else if (start.easing === 'bounce') {
            const n1 = 7.5625;
            const d1 = 2.75;
            let p = progress;
            if (p < 1 / d1) easedProgress = n1 * p * p;
            else if (p < 2 / d1) easedProgress = n1 * (p -= 1.5 / d1) * p + 0.75;
            else if (p < 2.5 / d1) easedProgress = n1 * (p -= 2.25 / d1) * p + 0.9375;
            else easedProgress = n1 * (p -= 2.625 / d1) * p + 0.984375;
          }

          const value = (start.value as number) + ((end.value as number) - (start.value as number)) * easedProgress;
          (newTransform as any)[prop] = value;
        }
        hasChanges = true;
      });
    }

    let resultLayer: EvaluatedLayer = hasChanges ? { ...layer, transform: newTransform } : { ...layer };

    if (previewBlendMode && previewBlendMode.layerId === layer.id) {
      resultLayer.blendMode = previewBlendMode.mode;
    }

    if (layer.proceduralSettings?.type === 'noise' && layer.proceduralSettings.noise) {
      resultLayer = applyNoise(resultLayer, currentTime);
    }

    // Motion Blur Calculation
    if (layer.motionBlurSettings?.enabled) {
      const dt = 0.03; // 30ms sample interval
      const prevTime = Math.max(0, currentTime - dt);
      const prevLayers = computeLayersWithoutBlur(layers, prevTime);
      const prevMatch = prevLayers.find(l => l.id === layer.id);

      if (prevMatch) {
        const dx = resultLayer.transform.x - prevMatch.transform.x;
        const dy = resultLayer.transform.y - prevMatch.transform.y;
        const speed = Math.hypot(dx, dy);
        const intensity = layer.motionBlurSettings.intensity ?? 50;
        const blurPx = Math.min(30, speed * (intensity / 100) * 0.3);

        resultLayer.calculatedMotionBlur = { blurPx, dx, dy, speed };
      }
    }

    return resultLayer;
  });
}

function computeLayersWithoutBlur(layers: Layer[], currentTime: number): Layer[] {
  return layers.map(layer => {
    let newTransform = { ...layer.transform };
    if (layer.animations && Object.keys(layer.animations).length > 0) {
      Object.entries(layer.animations).forEach(([prop, animation]) => {
        const keyframes = animation.keyframes;
        if (!keyframes || keyframes.length === 0) return;

        let start = keyframes[0];
        let end = keyframes[keyframes.length - 1];

        if (currentTime <= start.time) {
          (newTransform as any)[prop] = start.value;
          return;
        }
        if (currentTime >= end.time) {
          (newTransform as any)[prop] = end.value;
          return;
        }

        for (let i = 0; i < keyframes.length - 1; i++) {
          if (currentTime >= keyframes[i].time && currentTime <= keyframes[i + 1].time) {
            start = keyframes[i];
            end = keyframes[i + 1];
            break;
          }
        }

        if (start === end) {
          (newTransform as any)[prop] = start.value;
        } else {
          const range = end.time - start.time;
          const progress = (currentTime - start.time) / range;
          const value = (start.value as number) + ((end.value as number) - (start.value as number)) * progress;
          (newTransform as any)[prop] = value;
        }
      });
      return { ...layer, transform: newTransform };
    }
    return layer;
  });
}

export const useDerivedLayers = (layers: Layer[], currentTime: number): EvaluatedLayer[] => {
  const previewBlendMode = useStore((state) => state.previewBlendMode);
  return useMemo(() => {
    return computeLayersAtTime(layers, currentTime, previewBlendMode);
  }, [layers, currentTime, previewBlendMode]);
};

function applyNoise(layer: Layer, time: number): Layer {
  const { speed, amplitude } = layer.proceduralSettings!.noise!;
  const t = time * speed;
  const nt = { ...layer.transform };
  nt.x += Math.sin(t) * amplitude;
  nt.y += Math.cos(t * 1.2) * amplitude;
  nt.rotation += Math.sin(t * 0.8) * (amplitude / 10);
  return { ...layer, transform: nt };
}
