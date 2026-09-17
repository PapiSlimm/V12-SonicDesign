import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Key, 
  ChevronRight, 
  ChevronDown,
  Activity,
  TrendingUp,
  Music,
  Volume2,
  VolumeX,
  Upload,
  Layers as LayersIcon,
  Magnet
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/index';
import { GraphEditor } from './GraphEditor';

async function extractAudioPeaks(file: File): Promise<{ url: string; peaks: number[]; duration: number }> {
  const url = URL.createObjectURL(file);
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const rawData = audioBuffer.getChannelData(0);
  const samples = 140;
  const blockSize = Math.floor(rawData.length / samples);
  const peaks: number[] = [];
  for (let i = 0; i < samples; i++) {
    let sum = 0;
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(rawData[i * blockSize + j]);
    }
    peaks.push(Math.min(1, (sum / blockSize) * 2.8));
  }
  return { url, peaks, duration: audioBuffer.duration };
}

export const Timeline: React.FC = () => {
  const {
    currentTime,
    duration,
    setDuration,
    fps,
    setFps,
    playbackSpeed,
    setPlaybackSpeed,
    setCurrentTime,
    isPlaying,
    setIsPlaying,
    layers,
    selectedLayerId,
    selectLayer,
    updateKeyframeTime,
    addKeyframe,
    removeKeyframe,
    addAudioLayer,
    updateLayer,
    onionSkinEnabled,
    toggleOnionSkin,
    onionSkinSettings,
    setOnionSkinSettings,
    timelineViewMode,
    setTimelineViewMode,
    startHistoryTransaction,
    endHistoryTransaction,
    openEasingEditor
  } = useStore(useShallow((s) => ({
    currentTime: s.currentTime,
    duration: s.duration,
    setDuration: s.setDuration,
    fps: s.fps,
    setFps: s.setFps,
    playbackSpeed: s.playbackSpeed,
    setPlaybackSpeed: s.setPlaybackSpeed,
    setCurrentTime: s.setCurrentTime,
    isPlaying: s.isPlaying,
    setIsPlaying: s.setIsPlaying,
    layers: s.layers,
    selectedLayerId: s.selectedLayerId,
    selectLayer: s.selectLayer,
    updateKeyframeTime: s.updateKeyframeTime,
    addKeyframe: s.addKeyframe,
    removeKeyframe: s.removeKeyframe,
    addAudioLayer: s.addAudioLayer,
    updateLayer: s.updateLayer,
    onionSkinEnabled: s.onionSkinEnabled,
    toggleOnionSkin: s.toggleOnionSkin,
    onionSkinSettings: s.onionSkinSettings,
    setOnionSkinSettings: s.setOnionSkinSettings,
    timelineViewMode: s.timelineViewMode,
    setTimelineViewMode: s.setTimelineViewMode,
    startHistoryTransaction: s.startHistoryTransaction,
    endHistoryTransaction: s.endHistoryTransaction,
    openEasingEditor: s.openEasingEditor
  })));

  const [isExpanded, setIsExpanded] = useState(true);
  const viewMode = timelineViewMode;
  const setViewMode = setTimelineViewMode;
  const [snappingEnabled, setSnappingEnabled] = useState(true);
  const [showOnionSettings, setShowOnionSettings] = useState(false);
  
  // Dragging keyframe state
  const [draggingKeyframe, setDraggingKeyframe] = useState<{
    layerId: string;
    property: string;
    keyframeIndex: number;
    initialTime: number;
  } | null>(null);

  const [snapIndicator, setSnapIndicator] = useState<{ time: number; label: string } | null>(null);

  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineTrackRef = useRef<HTMLDivElement>(null);

  // Sync Audio playback with the timeline clock; dispose players for deleted layers
  useEffect(() => {
    const liveIds = new Set<string>();
    layers.forEach(layer => {
      if (layer.type !== 'audio' || !layer.audioSettings?.src) return;
      liveIds.add(layer.id);
      let el = audioRefs.current.get(layer.id);
      if (!el || el.src !== layer.audioSettings.src) {
        el?.pause();
        el = new Audio(layer.audioSettings.src);
        el.preload = 'auto';
        audioRefs.current.set(layer.id, el);
      }
      el.volume = layer.audioSettings.muted ? 0 : Math.max(0, Math.min(1, layer.audioSettings.volume ?? 1));
      el.playbackRate = Math.max(0.25, Math.min(4, playbackSpeed));
      const shouldPlay = isPlaying && layer.visible && !layer.audioSettings.muted && currentTime < (layer.audioSettings.duration || Infinity);
      if (Math.abs(el.currentTime - currentTime) > 0.2) {
        try { el.currentTime = currentTime; } catch { /* not seekable yet */ }
      }
      if (shouldPlay) {
        if (el.paused) el.play().catch(() => {});
      } else if (!el.paused) {
        el.pause();
      }
    });
    audioRefs.current.forEach((el, id) => {
      if (!liveIds.has(id)) {
        el.pause();
        el.src = '';
        audioRefs.current.delete(id);
      }
    });
  }, [isPlaying, currentTime, layers, playbackSpeed]);

  useEffect(() => () => { audioRefs.current.forEach(el => { el.pause(); el.src = ''; }); audioRefs.current.clear(); }, []);

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { url, peaks, duration: audioDur } = await extractAudioPeaks(file);
      addAudioLayer(url, file.name.replace(/\.[^/.]+$/, ''), peaks, audioDur);
      if (audioDur > duration) setDuration(Math.ceil(audioDur));
    } catch (err) {
      console.error('Failed to parse audio file:', err);
      // Fallback simple audio layer
      const fallbackUrl = URL.createObjectURL(file);
      const mockPeaks = Array.from({ length: 100 }, () => 0.2 + Math.random() * 0.7);
      addAudioLayer(fallbackUrl, file.name, mockPeaks, 30);
    } finally {
      e.target.value = '';
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
  };

  // Collect all existing keyframe times for snapping (excluding the keyframe being dragged)
  const getAllKeyframeTimes = () => {
    const times: number[] = [];
    layers.forEach(l => {
      if (l.animations) {
        Object.entries(l.animations).forEach(([prop, anim]) => {
          anim.keyframes.forEach((kf, i) => {
            if (draggingKeyframe && draggingKeyframe.layerId === l.id && draggingKeyframe.property === prop && draggingKeyframe.keyframeIndex === i) return;
            times.push(kf.time);
          });
        });
      }
    });
    return times;
  };

  // Dragging keyframe handlers
  const handleKeyframeMouseDown = (
    e: React.MouseEvent,
    layerId: string,
    property: string,
    keyframeIndex: number,
    initialTime: number
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    selectLayer(layerId);
    startHistoryTransaction();
    setDraggingKeyframe({ layerId, property, keyframeIndex, initialTime });
  };

  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingKeyframe || !timelineTrackRef.current) return;

    const rect = timelineTrackRef.current.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const rawTime = Math.max(0, Math.min(duration, (relativeX / rect.width) * duration));

    if (!snappingEnabled || e.altKey) {
      const newIndex = updateKeyframeTime(draggingKeyframe.layerId, draggingKeyframe.property, draggingKeyframe.keyframeIndex, rawTime, false);
      if (newIndex !== draggingKeyframe.keyframeIndex) setDraggingKeyframe({ ...draggingKeyframe, keyframeIndex: newIndex });
      setSnapIndicator(null);
      return;
    }

    // Snapping Logic
    const SNAP_THRESHOLD = 0.25; // seconds
    let finalTime = rawTime;
    let label = '';

    // 1. Snap to playhead
    if (Math.abs(rawTime - currentTime) < SNAP_THRESHOLD) {
      finalTime = currentTime;
      label = `Playhead (${currentTime.toFixed(2)}s)`;
    } 
    // 2. Snap to integer second markers
    else if (Math.abs(rawTime - Math.round(rawTime)) < SNAP_THRESHOLD) {
      finalTime = Math.round(rawTime);
      label = `${finalTime}s Marker`;
    } 
    // 3. Snap to other keyframes
    else {
      const otherTimes = getAllKeyframeTimes().filter(t => Math.abs(t - rawTime) < SNAP_THRESHOLD);
      if (otherTimes.length > 0) {
        finalTime = otherTimes[0];
        label = `Keyframe (${finalTime.toFixed(2)}s)`;
      }
    }

    const newIndex = updateKeyframeTime(draggingKeyframe.layerId, draggingKeyframe.property, draggingKeyframe.keyframeIndex, finalTime, false);
    if (newIndex !== draggingKeyframe.keyframeIndex) setDraggingKeyframe({ ...draggingKeyframe, keyframeIndex: newIndex });

    if (label) {
      setSnapIndicator({ time: finalTime, label });
    } else {
      setSnapIndicator(null);
    }
  };

  const handleTimelineMouseUp = () => {
    if (draggingKeyframe) endHistoryTransaction('Move Keyframe');
    setDraggingKeyframe(null);
    setSnapIndicator(null);
  };

  const [durationInput, setDurationInput] = useState(String(duration));
  useEffect(() => { setDurationInput(String(duration)); }, [duration]);
  const commitDuration = () => {
    const v = parseFloat(durationInput);
    if (Number.isFinite(v) && v > 0) setDuration(Math.min(3600, v)); else setDurationInput(String(duration));
  };
  const stepFrame = (dir: 1 | -1) => setCurrentTime(Math.round((currentTime + dir / fps) * fps) / fps);


  return (
    <div className={`bg-[#222] border-t border-[#111] flex flex-col transition-all duration-300 ${isExpanded ? 'h-64' : 'h-10'}`}>
      {/* Hidden File Input for Audio */}
      <input 
        ref={fileInputRef} 
        type="file" 
        accept="audio/*" 
        className="hidden" 
        onChange={handleAudioUpload} 
      />

      {/* Timeline Control Header */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-[#111] bg-[#2a2a2a]">
        <div className="flex items-center gap-4">
          <button onClick={() => setIsExpanded(!isExpanded)} className="text-gray-400 hover:text-white">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentTime(0)} className="p-1 text-gray-400 hover:text-white" title="Jump to start (Home)">
              <SkipBack size={16} />
            </button>
            <button onClick={() => stepFrame(-1)} className="px-1 text-gray-400 hover:text-white text-[11px] font-mono" title="Previous frame (,)">‹</button>
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1.5 bg-blue-600 rounded-full text-white hover:bg-blue-500 shadow"
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button onClick={() => stepFrame(1)} className="px-1 text-gray-400 hover:text-white text-[11px] font-mono" title="Next frame (.)">›</button>
            <button onClick={() => setCurrentTime(duration)} className="p-1 text-gray-400 hover:text-white" title="Jump to end (End)">
              <SkipForward size={16} />
            </button>
          </div>
          <div className="text-[11px] font-mono text-blue-400 bg-black/40 px-2 py-0.5 rounded border border-[#333] flex items-center gap-1" title="Current time / Duration — edit the duration to change the timeline length">
            <span>{formatTime(currentTime)}</span>
            <span className="text-gray-600">/</span>
            <input
              type="number"
              min={1}
              max={3600}
              value={durationInput}
              onChange={(e) => setDurationInput(e.target.value)}
              onBlur={commitDuration}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitDuration(); (e.target as HTMLInputElement).blur(); } }}
              className="w-12 bg-transparent text-gray-300 outline-none text-right border-b border-transparent focus:border-blue-500"
            />
            <span className="text-gray-500">s</span>
            <span className="text-gray-600 mx-1">·</span>
            <span className="text-gray-500">Frame {Math.round(currentTime * fps)}</span>
          </div>
          <select
            value={fps}
            onChange={(e) => setFps(parseInt(e.target.value))}
            className="bg-[#333] border border-[#444] text-gray-300 text-[10px] rounded px-1 py-0.5 outline-none"
            title="Project frame rate"
          >
            {[12, 24, 25, 30, 60].map(f => <option key={f} value={f}>{f} fps</option>)}
          </select>
          <select
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
            className="bg-[#333] border border-[#444] text-gray-300 text-[10px] rounded px-1 py-0.5 outline-none"
            title="Playback speed"
          >
            {[0.25, 0.5, 1, 1.5, 2].map(sp => <option key={sp} value={sp}>{sp}×</option>)}
          </select>
          <button 
            onClick={() => setSnappingEnabled(!snappingEnabled)}
            className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border font-semibold transition-colors ${
              snappingEnabled 
                ? 'bg-blue-600/30 text-blue-300 border-blue-500/50' 
                : 'bg-[#333] text-gray-400 border-[#444] hover:text-white'
            }`}
            title="Toggle Keyframe Snapping"
          >
            <Magnet size={12} /> {snappingEnabled ? 'Snap On' : 'Snap Off'}
          </button>

          {/* Onion Skinning Control */}
          <div className="relative flex items-center gap-1">
            <button 
              onClick={toggleOnionSkin}
              className={`flex items-center gap-1.5 text-[10px] px-2.5 py-0.5 rounded border font-bold transition-all ${
                onionSkinEnabled 
                  ? 'bg-purple-600/30 text-purple-300 border-purple-500/70 shadow-[0_0_10px_rgba(168,85,247,0.3)]' 
                  : 'bg-[#333] text-gray-400 border-[#444] hover:text-white'
              }`}
              title="Toggle Onion Skinning (Ghost Previous/Next Frames)"
            >
              <LayersIcon size={12} className={onionSkinEnabled ? 'text-purple-400 animate-pulse' : ''} />
              <span>{onionSkinEnabled ? 'Onion Skin On' : 'Onion Skin'}</span>
            </button>

            <button 
              onClick={() => setShowOnionSettings(!showOnionSettings)}
              className="p-1 bg-[#333] hover:bg-[#444] text-gray-400 hover:text-white rounded border border-[#444] text-[10px]"
              title="Onion Skin Options"
            >
              <ChevronDown size={12} />
            </button>

            {/* Onion Skin Settings Popover */}
            {showOnionSettings && (
              <div className="absolute top-full left-0 mt-2 w-56 bg-[#282828] border border-[#444] rounded shadow-2xl p-3 z-50 text-white flex flex-col gap-2.5">
                <div className="flex items-center justify-between border-b border-[#3d3d3d] pb-1.5">
                  <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1">
                    <LayersIcon size={12} /> Onion Skin Settings
                  </span>
                  <button onClick={() => setShowOnionSettings(false)} className="text-gray-400 hover:text-white text-[10px]">✕</button>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-300">
                    <span>Frame Step (Prev/Next)</span>
                    <span className="font-mono font-bold text-purple-300">{onionSkinSettings.prevOffset.toFixed(2)}s</span>
                  </div>
                  <input 
                    type="range"
                    min="0.02"
                    max="0.5"
                    step="0.02"
                    value={onionSkinSettings.prevOffset}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setOnionSkinSettings({ prevOffset: val, nextOffset: val });
                    }}
                    className="w-full h-1 bg-[#111] rounded-full appearance-none cursor-pointer accent-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-300">
                    <span>Ghost Opacity</span>
                    <span className="font-mono font-bold text-purple-300">{Math.round(onionSkinSettings.opacity * 100)}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0.1"
                    max="0.8"
                    step="0.05"
                    value={onionSkinSettings.opacity}
                    onChange={(e) => setOnionSkinSettings({ opacity: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-[#111] rounded-full appearance-none cursor-pointer accent-purple-500"
                  />
                </div>

                <div className="text-[9px] text-gray-400 pt-1 border-t border-[#3a3a3a] leading-tight">
                  <span className="text-red-400 font-bold">Red overlay</span> = Previous frame, <span className="text-emerald-400 font-bold">Green overlay</span> = Next frame.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#333] hover:bg-[#3d3d3d] text-gray-200 hover:text-white text-[10px] font-bold rounded border border-[#444] transition-colors"
          >
            <Upload size={12} className="text-green-400" /> + Import Audio Track
          </button>
          <button 
            onClick={() => useStore.getState().openEasingEditor({ layerId: selectedLayerId || undefined })}
            className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 font-bold uppercase tracking-wider"
          >
            <TrendingUp size={12} /> Easing Editor
          </button>
          <button 
            onClick={() => addKeyframe()}
            className="flex items-center gap-1 text-[10px] text-gray-300 hover:text-white font-bold uppercase tracking-wider"
          >
            <Key size={12} /> Add Keyframe
          </button>
          <button 
            onClick={() => setViewMode(viewMode === 'timeline' ? 'graph' : 'timeline')}
            className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider transition-all ${
              viewMode === 'graph' ? 'text-blue-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Activity size={12} /> Graph Editor
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="flex-1 flex overflow-hidden">
          {viewMode === 'timeline' ? (
            <>
              {/* Left Track Names Panel */}
              <div className="w-64 border-r border-[#111] flex flex-col overflow-y-auto bg-[#252525] select-none">
                <div className="h-6 px-3 bg-[#1e1e1e] border-b border-[#111] flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5"><LayersIcon size={12} /> Layer / Animation</span>
                  <span className="text-[9px] text-gray-500">{layers.length} Layers</span>
                </div>

                {layers.length === 0 && (
                  <div className="p-3 text-[10px] text-gray-500">No layers yet.</div>
                )}
                {layers.map((layer) => {
                  const isSelected = layer.id === selectedLayerId;
                  const animProps = layer.animations ? Object.keys(layer.animations) : [];

                  return (
                    <div key={layer.id} className="border-b border-[#111]">
                      {/* Layer Header Row */}
                      <div 
                        onClick={() => selectLayer(layer.id)}
                        className={`h-8 px-3 flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-600/20 text-blue-300 font-semibold' : 'text-gray-300 hover:bg-[#333]'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {layer.type === 'audio' ? (
                            <Music size={14} className="text-green-400 shrink-0" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                          )}
                          <span className="text-xs truncate">{layer.name}</span>
                        </div>

                        {layer.type === 'audio' && layer.audioSettings && (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                const newMuted = !layer.audioSettings?.muted;
                                updateLayer(layer.id, {
                                  audioSettings: { ...layer.audioSettings!, muted: newMuted }
                                });
                              }}
                              className="p-1 text-gray-400 hover:text-white rounded"
                            >
                              {layer.audioSettings.muted ? <VolumeX size={12} className="text-red-400" /> : <Volume2 size={12} className="text-green-400" />}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Animated Property Sub-rows */}
                      {layer.type !== 'audio' && animProps.map((prop) => (
                        <div 
                          key={prop} 
                          className="h-6 pl-8 pr-3 flex items-center justify-between bg-[#1d1d1d] border-t border-[#111]/50 text-[10px] text-gray-400"
                        >
                          <span className="capitalize">{prop}</span>
                          <span className="text-[9px] text-gray-600">{layer.animations?.[prop]?.keyframes.length || 0} kf</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* Right Timeline Grid Area */}
              <div 
                ref={timelineTrackRef}
                className="flex-1 relative overflow-x-auto overflow-y-auto bg-[#1a1a1a] select-none"
                onMouseMove={handleTimelineMouseMove}
                onMouseUp={handleTimelineMouseUp}
                onMouseLeave={handleTimelineMouseUp}
                onMouseDown={(e) => {
                  if (draggingKeyframe || e.button !== 0) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const seek = (clientX: number) => setCurrentTime(Math.min(Math.max(0, ((clientX - rect.left) / rect.width) * duration), duration));
                  seek(e.clientX);
                  const move = (ev: MouseEvent) => seek(ev.clientX);
                  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                  window.addEventListener('mousemove', move);
                  window.addEventListener('mouseup', up);
                }}
              >
                {/* Time Ruler Top Row */}
                <div className="h-6 bg-[#1e1e1e] border-b border-[#111] relative sticky top-0 z-20 flex items-center">
                  {(() => {
                    const step = duration > 240 ? 30 : duration > 120 ? 10 : duration > 60 ? 5 : duration > 30 ? 2 : 1;
                    return Array.from({ length: Math.floor(duration / step) + 1 }).map((_, i) => (
                      <div 
                        key={i} 
                        className="absolute top-0 bottom-0 border-l border-[#3a3a3a] text-[9px] font-mono text-gray-400 pl-1 pt-0.5 pointer-events-none"
                        style={{ left: `${((i * step) / duration) * 100}%` }}
                      >
                        {i * step}s
                      </div>
                    ));
                  })()}
                </div>

                {/* Snap Indicator Overlay */}
                {snapIndicator && (
                  <div 
                    className="absolute top-0 bottom-0 w-px bg-yellow-400 z-30 pointer-events-none shadow-[0_0_8px_rgba(250,204,21,0.8)]"
                    style={{ left: `${(snapIndicator.time / duration) * 100}%` }}
                  >
                    <div className="absolute top-7 -translate-x-1/2 bg-yellow-400 text-black font-bold text-[9px] px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                      {snapIndicator.label}
                    </div>
                  </div>
                )}

                {/* Layer Timeline Tracks */}
                <div className="relative">
                  {layers.map((layer) => {
                    const animProps = layer.animations ? Object.keys(layer.animations) : [];

                    return (
                      <div key={layer.id} className="border-b border-[#111]">
                        {/* Layer Track Container */}
                        {layer.type === 'audio' ? (
                          /* Audio Waveform Row */
                          <div className="h-8 bg-green-950/20 border-b border-green-900/30 relative flex items-center overflow-hidden">
                            {layer.audioSettings?.peaks && layer.audioSettings.peaks.length > 0 ? (
                              <svg className="h-full text-green-500/60 pointer-events-none" style={{ width: `${Math.min(100, ((layer.audioSettings.duration || duration) / duration) * 100)}%` }} preserveAspectRatio="none" viewBox={`0 0 ${layer.audioSettings.peaks.length} 100`}>
                                <path
                                  d={layer.audioSettings.peaks.reduce((acc, peak, idx) => {
                                    const h = peak * 40;
                                    return `${acc} M ${idx} ${50 - h} L ${idx} ${50 + h}`;
                                  }, '')}
                                  stroke="currentColor"
                                  strokeWidth="1.2"
                                />
                              </svg>
                            ) : (
                              <div className="w-full h-2 bg-green-500/30 rounded" />
                            )}
                            <span className="absolute left-3 text-[10px] font-bold text-green-300 drop-shadow pointer-events-none">
                              🎵 {layer.name} ({layer.audioSettings?.duration?.toFixed(1) || duration}s)
                            </span>
                          </div>
                        ) : (
                          /* Standard Layer Keyframe Track */
                          <>
                            <div className="h-8 relative border-b border-[#111]/30">
                              {/* Parent track keyframe summary */}
                            </div>

                            {/* Property Keyframe Tracks */}
                            {animProps.map((prop) => {
                              const kfs = layer.animations?.[prop]?.keyframes || [];
                              return (
                                <div key={prop} className="h-6 relative bg-[#141414] border-t border-[#111]/40">
                                  {kfs.map((kf, kfIdx) => {
                                    const leftPct = (kf.time / duration) * 100;
                                    const isBeingDragged = draggingKeyframe?.layerId === layer.id && 
                                                           draggingKeyframe?.property === prop && 
                                                           draggingKeyframe?.keyframeIndex === kfIdx;

                                    return (
                                      <div
                                        key={kfIdx}
                                        onMouseDown={(e) => handleKeyframeMouseDown(e, layer.id, prop, kfIdx, kf.time)}
                                        onDoubleClick={(e) => { e.stopPropagation(); openEasingEditor({ layerId: layer.id, property: prop, keyframeIndex: kfIdx }); }}
                                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (window.confirm(`Delete ${prop} keyframe at ${kf.time.toFixed(2)}s?`)) removeKeyframe(layer.id, prop, kfIdx); }}
                                        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rotate-45 border transition-transform cursor-grab active:cursor-grabbing z-10 ${
                                          isBeingDragged 
                                            ? 'bg-yellow-400 border-white scale-125 z-20 shadow-[0_0_10px_rgba(250,204,21,0.8)]' 
                                            : 'bg-blue-500 hover:bg-blue-400 border-white/80 hover:scale-110'
                                        }`}
                                        style={{ left: `${leftPct}%` }}
                                        title={`${layer.name} · ${prop} = ${typeof kf.value === 'number' ? Math.round(kf.value * 100) / 100 : kf.value} @ ${kf.time.toFixed(2)}s (${kf.easing})\nDrag to move · Double-click for easing · Right-click to delete`}
                                      />
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Red Playhead Line */}
                <div 
                  className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.7)]"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                >
                  <div className="w-3 h-3 bg-red-500 rounded-full -ml-[6px] -mt-1.5 shadow" />
                </div>
              </div>
            </>
          ) : (
            <GraphEditor />
          )}
        </div>
      )}
    </div>
  );
};
