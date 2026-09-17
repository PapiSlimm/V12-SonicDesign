import { useMemo } from 'react';
import { Keyframe, Layer } from '../core/types';
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

const TRANSFORM_PROPS = new Set(['x', 'y', 'scaleX', 'scaleY', 'rotation', 'skewX', 'skewY']);

function ease(kf: Keyframe, progress: number): number {
  if (kf.bezierPoints || kf.easing === 'bezier') {
    const cp1 = kf.bezierPoints?.cp1 || { x: 0.25, y: 0.25 };
    const cp2 = kf.bezierPoints?.cp2 || { x: 0.75, y: 0.75 };
    return solveCubicBezier(cp1.x, cp1.y, cp2.x, cp2.y, progress);
  }
  switch (kf.easing) {
    case 'ease-in': return solveCubicBezier(0.42, 0, 1, 1, progress);
    case 'ease-out': return solveCubicBezier(0, 0, 0.58, 1, progress);
    case 'ease-in-out': return solveCubicBezier(0.42, 0, 0.58, 1, progress);
    case 'snap': return progress < 1 ? 0 : 1;
    case 'bounce': {
      const n1 = 7.5625;
      const d1 = 2.75;
      let p = progress;
      if (p < 1 / d1) return n1 * p * p;
      if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
      if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
      return n1 * (p -= 2.625 / d1) * p + 0.984375;
    }
    default: return progress;
  }
}

/** Evaluate a keyframe track at a point in time. Returns undefined when the track is empty. */
export function evaluateTrack(keyframes: Keyframe[], time: number): number | string | object | undefined {
  if (!keyframes || keyframes.length === 0) return undefined;
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (time <= first.time) return first.value;
  if (time >= last.time) return last.value;

  let start = first;
  let end = last;
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
      start = keyframes[i];
      end = keyframes[i + 1];
      break;
    }
  }
  if (start === end || typeof start.value !== 'number' || typeof end.value !== 'number') return start.value;

  const range = end.time - start.time;
  const progress = range <= 0 ? 1 : (time - start.time) / range;
  const eased = ease(start, progress);
  return start.value + (end.value - start.value) * eased;
}

/** Evaluate every animated property of a layer at `time` (transform props + opacity). */
function evaluateLayer(layer: Layer, time: number): Layer {
  if (!layer.animations) return layer;
  const props = Object.keys(layer.animations);
  if (props.length === 0) return layer;

  const newTransform = { ...layer.transform };
  let opacity = layer.opacity;
  let motionPathProgress = layer.motionPathProgress;
  let vectorSettings = layer.vectorSettings;
  let touched = false;

  for (const prop of props) {
    const value = evaluateTrack(layer.animations[prop].keyframes, time);
    if (value === undefined || typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (TRANSFORM_PROPS.has(prop)) {
      (newTransform as any)[prop] = value;
      touched = true;
    } else if (prop === 'opacity') {
      opacity = Math.max(0, Math.min(1, value));
      touched = true;
    } else if (prop === 'motionPathProgress') {
      motionPathProgress = Math.max(0, Math.min(1, value));
      touched = true;
    } else if (prop === 'pathProgress' && vectorSettings) {
      vectorSettings = { ...vectorSettings, pathProgress: Math.max(0, Math.min(1, value)) };
      touched = true;
    }
  }

  return touched ? { ...layer, transform: newTransform, opacity, motionPathProgress, vectorSettings } : layer;
}

export function computeLayersAtTime(layers: Layer[], currentTime: number, previewBlendMode?: { layerId: string; mode: any } | null): EvaluatedLayer[] {
  const evaluated: EvaluatedLayer[] = layers.map(layer => {
    let result: EvaluatedLayer = evaluateLayer(layer, currentTime);

    if (previewBlendMode && previewBlendMode.layerId === layer.id) {
      result = { ...result, blendMode: previewBlendMode.mode };
    }

    if (layer.proceduralSettings?.type === 'noise' && layer.proceduralSettings.noise?.enabled !== false && layer.proceduralSettings.noise) {
      result = applyNoise(result, currentTime);
    }
    return result;
  });

  // Motion Blur: compare against a slightly earlier sample of the same layer only
  const dt = 0.03;
  for (let i = 0; i < evaluated.length; i++) {
    const layer = layers[i];
    if (!layer.motionBlurSettings?.enabled) continue;
    const prev = evaluateLayer(layer, Math.max(0, currentTime - dt));
    const current = evaluated[i];
    const dx = current.transform.x - prev.transform.x;
    const dy = current.transform.y - prev.transform.y;
    const speed = Math.hypot(dx, dy);
    const intensity = layer.motionBlurSettings.intensity ?? 50;
    const shutter = (layer.motionBlurSettings.shutterAngle ?? 180) / 180;
    const blurPx = Math.min(30, speed * (intensity / 100) * 0.3 * shutter);
    evaluated[i] = { ...current, calculatedMotionBlur: { blurPx, dx, dy, speed } };
  }

  return evaluated;
}

export const useDerivedLayers = (layers: Layer[], currentTime: number): EvaluatedLayer[] => {
  const previewBlendMode = useStore((state) => state.previewBlendMode);
  return useMemo(() => computeLayersAtTime(layers, currentTime, previewBlendMode), [layers, currentTime, previewBlendMode]);
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
