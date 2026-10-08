import React, { useEffect, useRef, useState } from 'react';
import { AudioReactiveSettings } from '../core/types';
import { AudioAnalysis, LiveAnalyser, analyseAudio } from '../core/audio';
import { AudioReactiveRenderer, FrameSignal, newSignal, render2DFallback } from '../core/audio/AudioReactiveRenderer';

interface Props {
  settings: AudioReactiveSettings;
  /** URL of the driving audio (offline analysed). */
  audioSrc: string | null;
  currentTime: number;
  isPlaying: boolean;
  width: number;
  height: number;
  /** Internal render resolution scale (0.5 = 960x540 upscaled). Keeps mid-tier mobile at 60fps. */
  quality?: number;
}

/**
 * Audio-reactive layer. Deterministic: frames are a pure function of (time, analysis, settings),
 * so scrubbing, playback and export agree. The GL canvas renders at `quality` resolution and is
 * upscaled by CSS. No per-frame allocations.
 */
export const AudioReactiveCanvas: React.FC<Props> = ({ settings, audioSrc, currentTime, isPlaying, width, height, quality = 0.5 }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<AudioReactiveRenderer | null>(null);
  const fallbackRef = useRef<HTMLCanvasElement | null>(null);
  const signalRef = useRef<FrameSignal>(newSignal());
  const liveRef = useRef<LiveAnalyser | null>(null);
  const rafRef = useRef<number | null>(null);
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error' | 'mic'>('idle');

  const w = Math.max(64, Math.round(width * quality));
  const h = Math.max(36, Math.round(height * quality));

  // Create the renderer once and mount its canvas
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const r = new AudioReactiveRenderer(w, h);
    let canvas: HTMLCanvasElement;
    if (r.ok) {
      rendererRef.current = r;
      canvas = r.canvas;
    } else {
      canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      fallbackRef.current = canvas;
    }
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    host.appendChild(canvas);
    return () => {
      r.dispose();
      rendererRef.current = null;
      fallbackRef.current = null;
      canvas.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h]);

  // Offline analysis of the driving audio
  useEffect(() => {
    if (settings.useMicrophone) return;
    if (!audioSrc) { setAnalysis(null); setStatus('idle'); return; }
    let cancelled = false;
    setStatus('loading');
    analyseAudio(audioSrc, 60).then(a => { if (!cancelled) { setAnalysis(a); setStatus('ready'); } })
      .catch(err => { console.warn('Audio analysis failed', err); if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [audioSrc, settings.useMicrophone]);

  // Microphone mode
  useEffect(() => {
    if (!settings.useMicrophone) { liveRef.current?.stop(); liveRef.current = null; return; }
    const live = new LiveAnalyser();
    liveRef.current = live;
    live.start().then(() => setStatus('mic')).catch(err => { console.warn('Microphone unavailable', err); setStatus('error'); });
    return () => { live.stop(); if (liveRef.current === live) liveRef.current = null; };
  }, [settings.useMicrophone]);

  const draw = (time: number) => {
    const signal = signalRef.current;
    if (settings.useMicrophone && liveRef.current?.active) {
      const live = liveRef.current;
      live.update();
      signal.bands.set(live.bands);
      signal.spectrum.set(live.spectrum);
      signal.rms = live.rms;
      signal.beat = 0;
    } else if (analysis) {
      AudioReactiveRenderer.sample(analysis, time, signal);
    } else {
      // idle preview so the layer is visible without audio
      const t = time;
      for (let i = 0; i < signal.spectrum.length; i++) signal.spectrum[i] = 0.25 + 0.2 * Math.sin(t * 2 + i * 0.3);
      signal.bands[0] = signal.bands[1] = 0.3 + 0.1 * Math.sin(t * 2); signal.bands[2] = signal.bands[3] = 0.25;
      signal.rms = 0.3; signal.beat = 0;
    }
    if (rendererRef.current) rendererRef.current.render(signal, settings, time);
    else if (fallbackRef.current) { const ctx = fallbackRef.current.getContext('2d'); if (ctx) render2DFallback(ctx, signal, settings); }
  };

  // Static redraw whenever time/settings change (scrubbing, property edits)
  useEffect(() => {
    if (settings.useMicrophone) return;
    draw(currentTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, settings, analysis]);

  // Mic mode needs its own RAF loop (no timeline dependency)
  useEffect(() => {
    if (!settings.useMicrophone) return;
    const start = performance.now();
    const tick = () => { draw((performance.now() - start) / 1000); rafRef.current = requestAnimationFrame(tick); };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.useMicrophone, settings, isPlaying]);

  return (
    <div ref={hostRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {status === 'loading' && <span style={{ position: 'absolute', left: 12, top: 12, fontSize: 18, fontFamily: 'monospace', color: '#a5b4fc', background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: 6 }}>Analysing audio…</span>}
      {status === 'error' && <span style={{ position: 'absolute', left: 12, top: 12, fontSize: 18, fontFamily: 'monospace', color: '#fca5a5', background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: 6 }}>Audio source unavailable</span>}
    </div>
  );
};
