import React, { useEffect, useState } from 'react';
import { AudioLines, Mic, Sparkles, Wand2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/index';
import { AudioReactiveSettings, AudioReactiveStyle, Layer } from '../core/types';
import { AudioAnalysis, BAND_NAMES, DEFAULT_AUDIO_REACTIVE, analyseAudio, bakeKeyframes, resolveAudioSrc } from '../core/audio';
import { safeNumber } from '../core/layers/layerUtils';

interface Props {
  layer: Layer;
  /** Show only the "Audio → Keyframes" baking section (for non-visualizer layers). */
  bakeOnly?: boolean;
}

const STYLES: { id: AudioReactiveStyle; label: string }[] = [
  { id: 'bars', label: 'Bars' },
  { id: 'ring', label: 'Ring' },
  { id: 'wave', label: 'Wave' },
  { id: 'blob', label: 'Blob' },
  { id: 'grid', label: 'Grid' }
];

const BAKE_PROPS: { id: 'scaleX' | 'scaleY' | 'opacity' | 'rotation' | 'y'; label: string; base: number; amount: number }[] = [
  { id: 'scaleX', label: 'Scale X', base: 1, amount: 0.4 },
  { id: 'scaleY', label: 'Scale Y', base: 1, amount: 0.4 },
  { id: 'opacity', label: 'Opacity', base: 0.4, amount: 0.6 },
  { id: 'rotation', label: 'Rotation', base: 0, amount: 15 },
  { id: 'y', label: 'Position Y', base: 0, amount: -80 }
];

export const AudioReactivePanel: React.FC<Props> = ({ layer, bakeOnly = false }) => {
  const { layers, updateLayer, updateLayerCommitted, replaceKeyframeTrack, currentTime, duration, setStatusMessage, startHistoryTransaction, endHistoryTransaction } = useStore(useShallow(s => ({
    layers: s.layers,
    updateLayer: s.updateLayer,
    updateLayerCommitted: s.updateLayerCommitted,
    replaceKeyframeTrack: s.replaceKeyframeTrack,
    currentTime: s.currentTime,
    duration: s.duration,
    setStatusMessage: s.setStatusMessage,
    startHistoryTransaction: s.startHistoryTransaction,
    endHistoryTransaction: s.endHistoryTransaction
  })));

  const audioLayers = layers.filter(l => l.type === 'audio' && l.audioSettings?.src);
  const settings: AudioReactiveSettings = layer.proceduralSettings?.audioReactive || DEFAULT_AUDIO_REACTIVE;

  // Bake controls (per-panel local state)
  const [bakeSourceLayer, setBakeSourceLayer] = useState<string>(settings.sourceLayerId || audioLayers[0]?.id || '');
  const [bakeProp, setBakeProp] = useState<typeof BAKE_PROPS[number]['id']>('scaleX');
  const [bakeSignal, setBakeSignal] = useState<'0' | '1' | '2' | '3' | 'rms' | 'beat'>('1');
  const [bakeAmount, setBakeAmount] = useState<number>(0.4);
  const [bakeRate, setBakeRate] = useState<number>(24);
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!bakeSourceLayer && audioLayers[0]) setBakeSourceLayer(audioLayers[0].id);
  }, [audioLayers.length, bakeSourceLayer, audioLayers]);

  useEffect(() => {
    const src = layers.find(l => l.id === bakeSourceLayer)?.audioSettings?.src;
    if (!src) { setAnalysis(null); return; }
    let cancelled = false;
    analyseAudio(src, 60).then(a => { if (!cancelled) setAnalysis(a); }).catch(() => { if (!cancelled) setAnalysis(null); });
    return () => { cancelled = true; };
  }, [bakeSourceLayer, layers]);

  const patch = (updates: Partial<AudioReactiveSettings>, commit = false, label = 'Audio Visualizer') => {
    const next = { ...settings, ...updates };
    const payload = { proceduralSettings: { ...(layer.proceduralSettings || { type: 'audio' as const }), type: 'audio' as const, audioReactive: next } };
    if (commit) updateLayerCommitted(layer.id, payload, label); else updateLayer(layer.id, payload);
  };

  const handleBake = () => {
    if (!analysis) return;
    setBusy(true);
    try {
      const prop = BAKE_PROPS.find(p => p.id === bakeProp)!;
      const base = bakeProp === 'opacity' ? Math.max(0, 1 - bakeAmount) : bakeProp === 'y' ? layer.transform.y : bakeProp === 'rotation' ? layer.transform.rotation : (layer.transform as any)[bakeProp] ?? prop.base;
      const kfs = bakeKeyframes(analysis, {
        property: bakeProp,
        source: bakeSignal === 'rms' || bakeSignal === 'beat' ? bakeSignal : (parseInt(bakeSignal) as 0 | 1 | 2 | 3),
        base,
        amount: bakeAmount * (bakeProp === 'rotation' ? 40 : bakeProp === 'y' ? -200 : 1),
        rate: bakeRate,
        startTime: currentTime,
        endTime: Math.min(duration, currentTime + analysis.duration)
      });
      replaceKeyframeTrack(layer.id, bakeProp, kfs, `Bake audio → ${prop.label}`);
      setStatusMessage(`Baked ${kfs.length} ${prop.label} keyframes from audio (${analysis.bpm ? analysis.bpm + ' BPM' : 'no tempo detected'})`);
    } finally {
      setBusy(false);
    }
  };

  const handleAutoDuration = () => {
    if (!analysis) return;
    const s = useStore.getState();
    s.setDuration(Math.max(s.duration, Math.ceil(currentTime + analysis.duration)));
  };

  return (
    <div className="flex flex-col gap-3 p-3 bg-[#18181c] rounded-lg border border-cyan-500/30">
      {!bakeOnly && (
        <>
          <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
            <AudioLines size={13} /> Audio Visualizer
          </h3>

          <div className="space-y-1">
            <span className="text-[10px] text-gray-400">Audio Source</span>
            <select
              value={settings.useMicrophone ? '__mic' : settings.sourceLayerId || ''}
              onChange={(e) => {
                if (e.target.value === '__mic') patch({ useMicrophone: true }, true, 'Visualizer: Microphone');
                else patch({ useMicrophone: false, sourceLayerId: e.target.value || null }, true, 'Visualizer Source');
              }}
              className="w-full bg-[#222] border border-[#3a3a3a] rounded px-2 py-1.5 text-xs text-white outline-none"
            >
              <option value="">— none (idle preview) —</option>
              {audioLayers.map(a => <option key={a.id} value={a.id}>🎵 {a.name}</option>)}
              <option value="__mic">🎤 Microphone (live preview only)</option>
            </select>
            {audioLayers.length === 0 && <p className="text-[9px] text-gray-500">Import an audio track in the timeline (“+ Import Audio Track”) to drive this layer.</p>}
            {settings.useMicrophone && <p className="text-[9px] text-amber-400 flex items-center gap-1"><Mic size={10} /> Mic input is live-only; exports use the selected audio layer.</p>}
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-gray-400">Style</span>
            <div className="grid grid-cols-5 gap-1">
              {STYLES.map(st => (
                <button
                  key={st.id}
                  onClick={() => patch({ style: st.id }, true, `Visualizer: ${st.label}`)}
                  className={`py-1 text-[10px] rounded border transition-colors ${settings.style === st.id ? 'bg-cyan-600/30 border-cyan-500 text-cyan-200' : 'bg-[#222] border-[#3a3a3a] text-gray-400 hover:text-white'}`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <span className="text-[10px] text-gray-400">Primary</span>
              <input type="color" value={settings.primaryColor} onChange={(e) => patch({ primaryColor: e.target.value })} onBlur={() => patch({}, true, 'Visualizer Color')} className="w-full h-7 bg-[#222] border border-[#333] rounded cursor-pointer" />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-gray-400">Secondary</span>
              <input type="color" value={settings.secondaryColor} onChange={(e) => patch({ secondaryColor: e.target.value })} onBlur={() => patch({}, true, 'Visualizer Color')} className="w-full h-7 bg-[#222] border border-[#333] rounded cursor-pointer" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <span className="text-[10px] text-gray-400">Sensitivity ({settings.sensitivity.toFixed(1)}×)</span>
              <input type="range" min="0.1" max="4" step="0.1" value={settings.sensitivity} onChange={(e) => patch({ sensitivity: safeNumber(e.target.value, 1) })} onMouseUp={() => patch({}, true, 'Visualizer Sensitivity')} className="w-full h-1 bg-[#222] rounded appearance-none accent-cyan-500 cursor-pointer" />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-gray-400">Smoothing ({Math.round(settings.smoothing * 100)}%)</span>
              <input type="range" min="0" max="0.95" step="0.05" value={settings.smoothing} onChange={(e) => patch({ smoothing: safeNumber(e.target.value, 0.6) })} onMouseUp={() => patch({}, true, 'Visualizer Smoothing')} className="w-full h-1 bg-[#222] rounded appearance-none accent-cyan-500 cursor-pointer" />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-gray-400">Detail ({settings.detail})</span>
              <input type="range" min="4" max="128" step="1" value={settings.detail} onChange={(e) => patch({ detail: safeNumber(e.target.value, 48) })} onMouseUp={() => patch({}, true, 'Visualizer Detail')} className="w-full h-1 bg-[#222] rounded appearance-none accent-cyan-500 cursor-pointer" />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-gray-400">Drive band</span>
              <select value={settings.driveBand} onChange={(e) => patch({ driveBand: parseInt(e.target.value) as 0 | 1 | 2 | 3 }, true, 'Visualizer Band')} className="w-full bg-[#222] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white outline-none">
                {BAND_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-[10px] text-gray-300 cursor-pointer"><input type="checkbox" checked={settings.mirror} onChange={(e) => patch({ mirror: e.target.checked }, true, 'Visualizer Mirror')} className="accent-cyan-500" /> Mirror</label>
            <label className="flex items-center gap-1.5 text-[10px] text-gray-300 cursor-pointer"><input type="checkbox" checked={settings.transparent} onChange={(e) => patch({ transparent: e.target.checked }, true, 'Visualizer Background')} className="accent-cyan-500" /> Transparent</label>
          </div>
          <div className="border-t border-[#2a2a35]" />
        </>
      )}

      {/* Audio → Keyframes */}
      <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
        <Wand2 size={13} /> Audio → Keyframes
      </h3>
      {audioLayers.length === 0 ? (
        <p className="text-[9px] text-gray-500">Import an audio track first (Timeline → “+ Import Audio Track”), then bake its energy into this layer's motion.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <span className="text-[10px] text-gray-400">Track</span>
              <select value={bakeSourceLayer} onChange={(e) => setBakeSourceLayer(e.target.value)} className="w-full bg-[#222] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white outline-none">
                {audioLayers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-gray-400">Signal</span>
              <select value={bakeSignal} onChange={(e) => setBakeSignal(e.target.value as any)} className="w-full bg-[#222] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white outline-none">
                <option value="beat">Beat pulse</option>
                <option value="rms">Loudness</option>
                {BAND_NAMES.map((n, i) => <option key={n} value={String(i)}>{n}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-gray-400">Property</span>
              <select value={bakeProp} onChange={(e) => setBakeProp(e.target.value as any)} className="w-full bg-[#222] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white outline-none">
                {BAKE_PROPS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-gray-400">Amount ({Math.round(bakeAmount * 100)}%)</span>
              <input type="range" min="0.05" max="1.5" step="0.05" value={bakeAmount} onChange={(e) => setBakeAmount(safeNumber(e.target.value, 0.4))} className="w-full h-1 mt-2 bg-[#222] rounded appearance-none accent-cyan-500 cursor-pointer" />
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span>Keyframes/sec</span>
            <select value={bakeRate} onChange={(e) => setBakeRate(parseInt(e.target.value))} className="bg-[#222] border border-[#3a3a3a] rounded px-1 py-0.5 text-xs text-white outline-none">
              {[8, 12, 24, 30, 60].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="text-[9px] text-gray-500">
            {analysis ? `${analysis.duration.toFixed(1)}s · ${analysis.beats.length} beats · ${analysis.bpm ? analysis.bpm + ' BPM' : 'tempo n/a'} · starts at playhead ${currentTime.toFixed(2)}s` : 'Analysing…'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { startHistoryTransaction(); handleBake(); endHistoryTransaction('Bake Audio'); }}
              disabled={!analysis || busy}
              className="flex-1 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-[10px] font-bold rounded flex items-center justify-center gap-1.5"
            >
              <Sparkles size={12} /> {busy ? 'Baking…' : 'Bake Keyframes'}
            </button>
            <button onClick={handleAutoDuration} disabled={!analysis} className="px-2 py-1.5 bg-[#222] hover:bg-[#2a2a2a] border border-[#3a3a3a] rounded text-[10px] text-gray-300 disabled:opacity-40" title="Extend the timeline to fit the track">Fit timeline</button>
          </div>
        </>
      )}
    </div>
  );
};

export { resolveAudioSrc };
