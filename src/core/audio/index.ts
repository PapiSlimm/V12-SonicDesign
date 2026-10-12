export * from './AudioAnalysis';
import { AudioReactiveSettings, AudioReactiveStyle, Layer } from '../types';

export { VisualizerStyleIndex as AudioReactiveStyleIndex } from '@v12/media/visualize';

export const DEFAULT_AUDIO_REACTIVE: AudioReactiveSettings = {
  sourceLayerId: null,
  useMicrophone: false,
  style: 'bars',
  primaryColor: '#3b82f6',
  secondaryColor: '#a855f7',
  sensitivity: 1.2,
  smoothing: 0.6,
  detail: 48,
  mirror: true,
  transparent: true,
  driveBand: 1
};

/** First audio layer in the project (default source for a new visualizer). */
export function findDefaultAudioSource(layers: Layer[]): string | null {
  return layers.find(l => l.type === 'audio' && l.audioSettings?.src)?.id || null;
}

/** Resolve the audio src URL driving a reactive layer, if any. */
export function resolveAudioSrc(layers: Layer[], settings: AudioReactiveSettings | undefined): string | null {
  if (!settings || !settings.sourceLayerId) return null;
  const src = layers.find(l => l.id === settings.sourceLayerId)?.audioSettings?.src;
  return src || null;
}
