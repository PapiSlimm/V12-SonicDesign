/**
 * Sonic Design's audio-reactive renderer is the shared V12 visualizer (`@v12/media/visualize`).
 * `AudioReactiveSettings` is a superset of `VisualizerSettings` (adds sourceLayerId / useMicrophone),
 * so the app's settings objects pass straight through.
 */
export { AudioReactiveRenderer, render2DFallback, getSharedRenderer, newSignal } from '@v12/media/visualize';
export type { FrameSignal, VisualizerSettings, VisualizerStyle } from '@v12/media/visualize';
