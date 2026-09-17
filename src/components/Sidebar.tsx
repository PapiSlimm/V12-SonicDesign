import React, { useState } from 'react';
import { Layer, Adjustments, BlendMode } from '../core/types';
import { 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock,
  Sun, 
  Palette, 
  Maximize,
  Image as ImageIcon,
  History,
  Activity,
  Scissors,
  Download,
  Upload,
  Layers as LayersIcon,
  Settings,
  Zap,
  Type as TypeIcon,
  Wind,
  FolderPlus,
  Sparkles,
  PenTool,
  Sliders,
  Search,
  X
} from 'lucide-react';

import { CurvesEditor } from './CurvesEditor';
import { BlendModeDropdown } from './BlendModeDropdown';
import { AdvancedColorPicker } from './AdvancedColorPicker';
import { LayerTreeItem } from './LayerTreeItem';
import { LayerStylesModal } from './LayerStylesModal';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store/index';
import { generateKeyframes, isAIConfigured } from '../services/aiService';
import { importImageFiles, pickFiles } from '../services/fileService';
import { LayerFactory } from '../core/layers/LayerFactory';
import { safeNumber } from '../core/layers/layerUtils';

export const Sidebar: React.FC = () => {
  const {
    layers,
    motionPaths,
    selectedLayerId,
    selectedLayerIds,
    setSelectedLayerId,
    setSelectedLayerIds,
    selectLayer,
    toggleLayerVisibility,
    addLayer,
    deleteLayer,
    deleteSelectedLayers,
    groupLayers,
    setMask,
    removeMask,
    moveLayer,
    addAdjustmentLayer,
    addClonerLayer,
    addShapeLayer,
    addTextLayer,
    addVectorLayer,
    applyKineticPreset,
    undo,
    redo,
    history,
    historyIndex,
    jumpToHistory,
    setLayers,
    updateLayer,
    updateLayerCommitted,
    setAdjustments,
    setBlendMode,
    addKeyframe,
    addTextAnimatorLayer,
    activeSidebarTab,
    setActiveSidebarTab,
    setIsExportModalOpen,
    expandedGroupIds,
    toggleGroupExpand,
    moveLayerToGroup,
    toggleGroupVisibility,
    toggleGroupLock,
    brushColor,
    setBrushColor,
    soloLayerId,
    toggleSoloLayer,
    updateLayerStyle,
    duplicateLayer,
    currentTime,
    duration,
    setStatusMessage
  } = useStore(useShallow((s) => ({
    layers: s.layers,
    motionPaths: s.motionPaths,
    selectedLayerId: s.selectedLayerId,
    selectedLayerIds: s.selectedLayerIds,
    setSelectedLayerId: s.setSelectedLayerId,
    setSelectedLayerIds: s.setSelectedLayerIds,
    selectLayer: s.selectLayer,
    toggleLayerVisibility: s.toggleLayerVisibility,
    addLayer: s.addLayer,
    deleteLayer: s.deleteLayer,
    deleteSelectedLayers: s.deleteSelectedLayers,
    groupLayers: s.groupLayers,
    setMask: s.setMask,
    removeMask: s.removeMask,
    moveLayer: s.moveLayer,
    addAdjustmentLayer: s.addAdjustmentLayer,
    addClonerLayer: s.addClonerLayer,
    addShapeLayer: s.addShapeLayer,
    addTextLayer: s.addTextLayer,
    addVectorLayer: s.addVectorLayer,
    applyKineticPreset: s.applyKineticPreset,
    undo: s.undo,
    redo: s.redo,
    history: s.history,
    historyIndex: s.historyIndex,
    jumpToHistory: s.jumpToHistory,
    setLayers: s.setLayers,
    updateLayer: s.updateLayer,
    updateLayerCommitted: s.updateLayerCommitted,
    setAdjustments: s.setAdjustments,
    setBlendMode: s.setBlendMode,
    addKeyframe: s.addKeyframe,
    addTextAnimatorLayer: s.addTextAnimatorLayer,
    activeSidebarTab: s.activeSidebarTab,
    setActiveSidebarTab: s.setActiveSidebarTab,
    setIsExportModalOpen: s.setIsExportModalOpen,
    expandedGroupIds: s.expandedGroupIds,
    toggleGroupExpand: s.toggleGroupExpand,
    moveLayerToGroup: s.moveLayerToGroup,
    toggleGroupVisibility: s.toggleGroupVisibility,
    toggleGroupLock: s.toggleGroupLock,
    brushColor: s.brushColor,
    setBrushColor: s.setBrushColor,
    soloLayerId: s.soloLayerId,
    toggleSoloLayer: s.toggleSoloLayer,
    updateLayerStyle: s.updateLayerStyle,
    duplicateLayer: s.duplicateLayer,
    currentTime: s.currentTime,
    duration: s.duration,
    setStatusMessage: s.setStatusMessage
  })));

  const activeTab = activeSidebarTab;
  const setActiveTab = setActiveSidebarTab;
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [layerSearchQuery, setLayerSearchQuery] = useState('');
  const [stylesTargetLayerId, setStylesTargetLayerId] = useState<string | null>(null);

  const currentLayer = layers.find(l => l.id === selectedLayerId);

  const handleAiAnimate = async () => {
    if (!selectedLayerId || !aiPrompt.trim() || !currentLayer) return;
    if (!isAIConfigured()) {
      setStatusMessage('AI is not configured — add VITE_GEMINI_API_KEY to .env.local and restart the dev server');
      return;
    }
    setIsGenerating(true);
    try {
      const tracks = await generateKeyframes(aiPrompt, { durationSec: Math.min(10, duration), startX: currentLayer.transform.x, startY: currentLayer.transform.y });
      if (!tracks.length) {
        setStatusMessage('AI returned no usable keyframes — try a more specific prompt');
        return;
      }
      useStore.getState().startHistoryTransaction();
      tracks.forEach(track => {
        track.keyframes.forEach(kf => addKeyframe(selectedLayerId, track.property, { ...kf, time: kf.time + currentTime }));
      });
      useStore.getState().endHistoryTransaction('AI Animate');
      setStatusMessage(`AI added ${tracks.reduce((n, t) => n + t.keyframes.length, 0)} keyframes across ${tracks.map(t => t.property).join(', ')}`);
    } catch (error: any) {
      console.error(error);
      setStatusMessage(`AI animate failed: ${error?.message || error}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImport = async () => {
    const files = await pickFiles('image/*', true);
    const imported = await importImageFiles(files);
    imported.forEach((layer, i) => addLayer({ ...layer, transform: { ...layer.transform, x: i * 24, y: i * 24 } }, `Import ${layer.name}`));
  };

  /** Numeric field helper: keeps NaN out of the store while the user is typing. */
  const num = (raw: string, fallback: number) => safeNumber(raw, fallback);

  /** Live styles-modal target: always reads the latest layer data from the store. */
  const stylesTarget = stylesTargetLayerId ? layers.find(l => l.id === stylesTargetLayerId) || null : null;

  return (
    <div className="w-80 bg-[#2a2a2a] border-l border-[#1a1a1a] flex flex-col z-20 shrink-0">
      {/* Panel Tabs */}
      <div className="flex border-b border-[#1a1a1a]">
        <button 
          onClick={() => setActiveTab('layers')}
          className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest ${activeTab === 'layers' ? 'bg-[#3a3a3a] text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
        >
          Layers
        </button>
        <button 
          onClick={() => setActiveTab('properties')}
          className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest ${activeTab === 'properties' ? 'bg-[#3a3a3a] text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
        >
          Properties
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest ${activeTab === 'history' ? 'bg-[#3a3a3a] text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
        >
          History
        </button>
        <button 
          onClick={() => setActiveTab('motion')}
          className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest ${activeTab === 'motion' ? 'bg-[#3a3a3a] text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}
        >
          Motion
        </button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'layers' && (
          <div className="flex flex-col">
            <div className="p-2 flex flex-col gap-2 border-b border-[#1a1a1a] bg-[#222]">
              <div className="flex items-center justify-between gap-2">
                <BlendModeDropdown 
                  layerId={selectedLayerId || ''} 
                  currentMode={currentLayer?.blendMode || 'normal'} 
                  className="flex-1"
                />
                <div className="flex items-center gap-1.5 px-2 py-1 bg-[#181818] rounded border border-[#383838]">
                  <span className="text-[9px] text-gray-500 font-bold uppercase">Opacity:</span>
                  <input 
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round((currentLayer?.opacity ?? 1) * 100)}
                    onChange={(e) => {
                      if (selectedLayerId) {
                        updateLayer(selectedLayerId, { opacity: parseInt(e.target.value) / 100 });
                      }
                    }}
                    className="w-16 h-1.5 bg-[#2a2a2a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    title="Drag to adjust layer transparency (0% to 100%)"
                  />
                  <input 
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round((currentLayer?.opacity ?? 1) * 100)}
                    onChange={(e) => {
                      if (selectedLayerId) {
                        const val = parseInt(e.target.value || '0');
                        updateLayer(selectedLayerId, { opacity: Math.max(0, Math.min(100, isNaN(val) ? 100 : val)) / 100 });
                      }
                    }}
                    className="w-7 bg-transparent text-[10px] font-mono text-blue-400 outline-none text-right font-bold"
                  />
                  <span className="text-[9px] text-gray-500">%</span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[#2a2a2a] pt-1.5 gap-1 flex-wrap">
                <div className="flex gap-1 flex-wrap">
                  <button onClick={() => addShapeLayer('rectangle')} title="Add Rectangle" className="p-1 hover:bg-[#3a3a3a] rounded text-gray-400 hover:text-white"><Maximize size={14} /></button>
                  <button onClick={() => addShapeLayer('circle')} title="Add Circle" className="p-1 hover:bg-[#3a3a3a] rounded text-gray-400 hover:text-white"><Activity size={14} /></button>
                  <button onClick={addAdjustmentLayer} title="Add Adjustment Layer" className="p-1 hover:bg-[#3a3a3a] rounded text-gray-400 hover:text-white"><Sun size={14} /></button>
                  <button onClick={groupLayers} title="Create Folder / Group Layers" className="p-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-blue-300 rounded border border-blue-500/30 transition-colors flex items-center gap-1 text-[10px] px-1.5 font-bold"><FolderPlus size={13} /> Folder</button>
                  <button onClick={setMask} title="Set as Mask" className="p-1 hover:bg-[#3a3a3a] rounded text-gray-400 hover:text-white"><Scissors size={14} /></button>
                  <button onClick={handleImport} title="Import Asset" className="p-1 hover:bg-[#3a3a3a] rounded text-gray-400 hover:text-white"><Upload size={14} /></button>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <button onClick={() => setIsExportModalOpen(true)} title="Export animation / frames (Ctrl+E)" className="p-1 bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white rounded border border-blue-500/50 transition-colors flex items-center gap-1 text-[10px] font-bold px-1.5"><Download size={13} /> Export</button>
                  <button onClick={() => addLayer(LayerFactory.createRasterLayer(`Layer ${layers.length + 1}`))} title="New Empty Raster Layer" className="p-1 hover:bg-[#3a3a3a] rounded text-gray-400 hover:text-white"><Plus size={14} /></button>
                  <button onClick={() => addTextLayer(false, 400, 400)} title="Add Text Layer (T)" className="p-1 hover:bg-[#3a3a3a] rounded text-gray-400 hover:text-white"><TypeIcon size={14} /></button>
                  <button onClick={() => addVectorLayer()} title="Add Vector Path (P)" className="p-1 hover:bg-[#3a3a3a] rounded text-gray-400 hover:text-white"><PenTool size={14} /></button>
                  <button onClick={addClonerLayer} title="Add Cloner Layer" className="p-1 hover:bg-[#3a3a3a] rounded text-gray-400 hover:text-white"><Settings size={14} /></button>
                  <button onClick={() => addTextAnimatorLayer()} title="Add Text Animator" className="p-1 hover:bg-[#3a3a3a] rounded text-gray-400 hover:text-white"><Zap size={14} /></button>
                  <button onClick={() => duplicateLayer()} title="Duplicate Selected Layer (Ctrl+D)" disabled={!selectedLayerId} className="p-1 hover:bg-[#3a3a3a] rounded text-gray-400 hover:text-white disabled:opacity-40"><LayersIcon size={14} /></button>
                  <button onClick={deleteSelectedLayers} title="Delete Selected Layer(s) (Delete)" disabled={!selectedLayerId && selectedLayerIds.length === 0} className="p-1 hover:bg-[#3a3a3a] rounded text-gray-400 hover:text-red-400 disabled:opacity-40"><Trash2 size={14} /></button>
                </div>
              </div>

              {/* Search Bar for Layers */}
              <div className="relative mt-2">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="Filter layers by name or type..."
                  value={layerSearchQuery}
                  onChange={(e) => setLayerSearchQuery(e.target.value)}
                  className="w-full bg-[#18181b] border border-[#27272a] focus:border-blue-500/80 rounded-lg pl-8 pr-7 py-1.5 text-xs text-gray-200 placeholder-gray-500 outline-none transition-colors"
                />
                {layerSearchQuery && (
                  <button
                    onClick={() => setLayerSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-0.5"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex flex-col overflow-y-auto max-h-[calc(100vh-380px)]">
              {layers
                .filter((l) => {
                  if (!layerSearchQuery.trim()) return !l.parentId;
                  const q = layerSearchQuery.toLowerCase();
                  return l.name.toLowerCase().includes(q) || l.type.toLowerCase().includes(q);
                })
                .slice()
                .reverse()
                .map((layer) => (
                  <LayerTreeItem
                    key={layer.id}
                    layer={layer}
                    layers={layers}
                    selectedLayerId={selectedLayerId}
                    selectedLayerIds={selectedLayerIds}
                    expandedGroupIds={layerSearchQuery.trim() ? layers.map(l => l.id) : expandedGroupIds}
                    soloLayerId={soloLayerId}
                    onSelect={(id, isMulti) => selectLayer(id, isMulti)}
                    onToggleVisibility={(id) => {
                      const l = layers.find((item) => item.id === id);
                      if (l?.type === 'group') {
                        toggleGroupVisibility(id);
                      } else {
                        toggleLayerVisibility(id);
                      }
                    }}
                    onToggleLock={(id, currentLocked) => {
                      const l = layers.find((item) => item.id === id);
                      if (l?.type === 'group') {
                        toggleGroupLock(id);
                      } else {
                        updateLayer(id, { locked: !currentLocked });
                      }
                    }}
                    onToggleSolo={toggleSoloLayer}
                    onToggleExpand={toggleGroupExpand}
                    onMoveLayer={moveLayer}
                    onMoveToGroup={moveLayerToGroup}
                    onDeleteLayer={(id) => deleteLayer(id)}
                    onRenameLayer={(id, newName) => updateLayerCommitted(id, { name: newName }, 'Rename Layer')}
                    onUpdateColorTag={(id, colorTag) => updateLayer(id, { colorTag })}
                    onOpenStyles={(l) => setStylesTargetLayerId(l.id)}
                    onAddMask={(id) => {
                      const target = layers.find(l => l.id === id);
                      if (target?.maskId) { removeMask(id); return; }
                      selectLayer(id);
                      // setMask reads selectedLayerId from the store, so call it after selection settles
                      setTimeout(() => useStore.getState().setMask(), 0);
                    }}
                  />
                ))}
            </div>
          </div>
        )}

        {activeTab === 'properties' && !currentLayer && (
          <div className="p-6 flex flex-col items-center justify-center text-center gap-3 text-gray-500 h-48">
            <Sliders size={22} className="text-gray-600" />
            <p className="text-[11px] leading-relaxed">Select a layer on the canvas or in the Layers tab to edit its properties.</p>
          </div>
        )}

        {activeTab === 'properties' && currentLayer && selectedLayerId && (
          <div className="p-4 flex flex-col gap-6">
            <div className="flex items-center justify-between -mb-2">
              <span className="text-[11px] font-bold text-white truncate" title={currentLayer.name}>{currentLayer.name}</span>
              <span className="text-[9px] uppercase tracking-wider text-gray-500 bg-[#1a1a1a] border border-[#333] rounded px-1.5 py-0.5">{currentLayer.type}</span>
            </div>
            {/* Opacity & Blend Mode Section */}
            <div className="flex flex-col gap-3 pb-3 border-b border-[#27272a]">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Sliders size={12} /> Opacity & Blend Mode
              </h3>
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Layer Opacity</span>
                    <span className="font-mono text-blue-400">{Math.round((currentLayer?.opacity ?? 1) * 100)}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="100" 
                    value={Math.round((currentLayer?.opacity ?? 1) * 100)} 
                    onChange={(e) => updateLayer(selectedLayerId!, { opacity: parseInt(e.target.value) / 100 })}
                    className="w-full h-1.5 bg-[#18181b] rounded-full appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] text-gray-400">Blend Mode</span>
                  <BlendModeDropdown 
                    layerId={selectedLayerId} 
                    currentMode={currentLayer?.blendMode || 'normal'} 
                    className="w-full"
                  />
                </div>
                <div className="pt-2">
                  <button
                    onClick={() => {
                      if (currentLayer) setStylesTargetLayerId(currentLayer.id);
                    }}
                    className="w-full py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 hover:text-white border border-blue-500/40 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow"
                  >
                    <Sliders size={13} /> Configure Layer Styles (Drop Shadow, Stroke, Glow)
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Maximize size={12} /> Transform
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-gray-400">Position X</span>
                  <input 
                    type="number" 
                    value={Math.round(currentLayer.transform.x * 10) / 10}
                    onChange={(e) => updateLayer(selectedLayerId!, { transform: { ...currentLayer.transform, x: num(e.target.value, currentLayer.transform.x) } })}
                    className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-gray-400">Position Y</span>
                  <input 
                    type="number" 
                    value={Math.round(currentLayer.transform.y * 10) / 10}
                    onChange={(e) => updateLayer(selectedLayerId!, { transform: { ...currentLayer.transform, y: num(e.target.value, currentLayer.transform.y) } })}
                    className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-gray-400">Scale X</span>
                  <input 
                    type="number" step="0.1"
                    value={currentLayer.transform.scaleX}
                    onChange={(e) => updateLayer(selectedLayerId!, { transform: { ...currentLayer.transform, scaleX: Math.max(0.01, num(e.target.value, currentLayer.transform.scaleX)) } })}
                    className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-gray-400">Scale Y</span>
                  <input 
                    type="number" step="0.1"
                    value={currentLayer.transform.scaleY}
                    onChange={(e) => updateLayer(selectedLayerId!, { transform: { ...currentLayer.transform, scaleY: Math.max(0.01, num(e.target.value, currentLayer.transform.scaleY)) } })}
                    className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <span className="text-[10px] text-gray-400">Rotation</span>
                  <input 
                    type="number" 
                    value={currentLayer.transform.rotation}
                    onChange={(e) => updateLayer(selectedLayerId!, { transform: { ...currentLayer.transform, rotation: num(e.target.value, currentLayer.transform.rotation) } })}
                    className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Sun size={12} /> Brightness / Contrast
              </h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Brightness</span>
                    <span>{currentLayer?.adjustments.brightness}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="200" value={currentLayer?.adjustments.brightness} 
                    onMouseUp={() => updateLayerCommitted(selectedLayerId!, {}, 'Brightness')}
                    onChange={(e) => setAdjustments({ ...currentLayer!.adjustments, brightness: parseInt(e.target.value) })}
                    className="w-full h-1 bg-[#1a1a1a] rounded-full appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Contrast</span>
                    <span>{currentLayer?.adjustments.contrast}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="200" value={currentLayer?.adjustments.contrast} 
                    onMouseUp={() => updateLayerCommitted(selectedLayerId!, {}, 'Contrast')}
                    onChange={(e) => setAdjustments({ ...currentLayer!.adjustments, contrast: parseInt(e.target.value) })}
                    className="w-full h-1 bg-[#1a1a1a] rounded-full appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Palette size={12} /> Hue / Saturation
              </h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Hue</span>
                    <span>{currentLayer?.adjustments.hue}°</span>
                  </div>
                  <input 
                    type="range" min="-180" max="180" value={currentLayer?.adjustments.hue} 
                    onMouseUp={() => updateLayerCommitted(selectedLayerId!, {}, 'Hue')}
                    onChange={(e) => setAdjustments({ ...currentLayer!.adjustments, hue: parseInt(e.target.value) })}
                    className="w-full h-1 bg-gradient-to-r from-red-500 via-green-500 to-red-500 rounded-full appearance-none cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Saturation</span>
                    <span>{currentLayer?.adjustments.saturation}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="200" value={currentLayer?.adjustments.saturation} 
                    onMouseUp={() => updateLayerCommitted(selectedLayerId!, {}, 'Saturation')}
                    onChange={(e) => setAdjustments({ ...currentLayer!.adjustments, saturation: parseInt(e.target.value) })}
                    className="w-full h-1 bg-[#1a1a1a] rounded-full appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>
            </div>

            {currentLayer?.type === 'text' && (
              <div className="flex flex-col gap-3">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <TypeIcon size={12} /> Text Settings
                </h3>
                <div className="space-y-4">
                  {!currentLayer.textAnimatorSettings && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Text Content</span>
                      <textarea
                        value={currentLayer.content || ''}
                        onChange={(e) => updateLayer(selectedLayerId!, { content: e.target.value })}
                        onBlur={() => updateLayerCommitted(selectedLayerId!, {}, 'Edit Text')}
                        placeholder="Type your text… (Enter for new line)"
                        className="w-full bg-[#1a1a1a] border border-[#3a3a3a] focus:border-blue-500 rounded p-2 text-xs text-white resize-y min-h-[56px] outline-none"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Weight</span>
                      <select
                        value={currentLayer.fontSettings?.weight || 'bold'}
                        onChange={(e) => updateLayer(selectedLayerId!, { fontSettings: { ...(currentLayer?.fontSettings || { size: 48 }), weight: e.target.value } })}
                        className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                      >
                        <option value="300">Light</option>
                        <option value="normal">Regular</option>
                        <option value="500">Medium</option>
                        <option value="600">Semi-Bold</option>
                        <option value="bold">Bold</option>
                        <option value="900">Black</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Opacity</span>
                      <input
                        type="range" min="0" max="100"
                        value={Math.round(currentLayer.opacity * 100)}
                        onChange={(e) => updateLayer(selectedLayerId!, { opacity: num(e.target.value, 100) / 100 })}
                        className="w-full h-1 mt-2 bg-[#1a1a1a] rounded-full appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-400">Font Family</span>
                    <select 
                      value={currentLayer.fontSettings?.family || 'Inter'}
                      onChange={(e) => updateLayer(selectedLayerId!, { fontSettings: { ...(currentLayer?.fontSettings || { size: 48 }), family: e.target.value } })}
                      className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                    >
                      <option value="Inter">Inter</option>
                      <option value="Roboto">Roboto</option>
                      <option value="Montserrat">Montserrat</option>
                      <option value="Playfair Display">Playfair Display</option>
                      <option value="Space Grotesk">Space Grotesk</option>
                      <option value="Outfit">Outfit</option>
                      <option value="JetBrains Mono">JetBrains Mono</option>
                      <option value="Bebas Neue">Bebas Neue</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Size</span>
                      <input 
                        type="number" 
                        value={currentLayer.fontSettings?.size || 48}
                        onChange={(e) => updateLayer(selectedLayerId!, { fontSettings: { ...(currentLayer?.fontSettings || { size: 48 }), size: Math.max(1, num(e.target.value, currentLayer.fontSettings?.size || 48)) } })}
                        className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Color</span>
                      <input 
                        type="color" 
                        value={currentLayer.fontSettings?.color || '#ffffff'}
                        onChange={(e) => updateLayer(selectedLayerId!, { fontSettings: { ...(currentLayer?.fontSettings || { size: 48 }), color: e.target.value } })}
                        className="w-full h-7 bg-transparent border-none cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Tracking</span>
                      <input 
                        type="number" 
                        value={currentLayer.fontSettings?.tracking || 0}
                        onChange={(e) => updateLayer(selectedLayerId!, { fontSettings: { ...(currentLayer?.fontSettings || { size: 48 }), tracking: num(e.target.value, 0) } })}
                        className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Leading</span>
                      <input 
                        type="number" step="0.1"
                        value={currentLayer.fontSettings?.leading || 1.2}
                        onChange={(e) => updateLayer(selectedLayerId!, { fontSettings: { ...(currentLayer?.fontSettings || { size: 48 }), leading: Math.max(0.1, num(e.target.value, 1.2)) } })}
                        className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentLayer?.textAnimatorSettings && (
              <div className="flex flex-col gap-3">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Zap size={12} /> Text Animator
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-400">Content</span>
                    <input 
                      type="text" 
                      value={currentLayer.textAnimatorSettings.text}
                      onChange={(e) => updateLayer(selectedLayerId!, { 
                        content: e.target.value,
                        textAnimatorSettings: { ...currentLayer.textAnimatorSettings!, text: e.target.value } 
                      })}
                      className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-400">Animation Type</span>
                    <select 
                      value={currentLayer.textAnimatorSettings.animationType}
                      onChange={(e) => updateLayer(selectedLayerId!, { 
                        textAnimatorSettings: { ...currentLayer.textAnimatorSettings!, animationType: e.target.value as any } 
                      })}
                      className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                    >
                      <option value="wave">Wave</option>
                      <option value="bounce">Bounce</option>
                      <option value="reveal">Reveal</option>
                      <option value="glitch">Glitch</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Speed</span>
                      <input 
                        type="number" step="0.1"
                        value={currentLayer.textAnimatorSettings.speed}
                        onChange={(e) => updateLayer(selectedLayerId!, { 
                          textAnimatorSettings: { ...currentLayer.textAnimatorSettings!, speed: num(e.target.value, 1) } 
                        })}
                        className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Smoothness</span>
                      <input 
                        type="number" step="0.1"
                        value={currentLayer.textAnimatorSettings.smoothness}
                        onChange={(e) => updateLayer(selectedLayerId!, { 
                          textAnimatorSettings: { ...currentLayer.textAnimatorSettings!, smoothness: num(e.target.value, 0.5) } 
                        })}
                        className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <LayersIcon size={12} /> Layer Styles
              </h3>
              <div className="space-y-2">
                {[
                  { id: 'dropShadow', label: 'Drop Shadow' },
                  { id: 'innerShadow', label: 'Inner Shadow' },
                  { id: 'outerGlow', label: 'Outer Glow' },
                  { id: 'bevelEmboss', label: 'Bevel & Emboss' }
                ].map(style => {
                  const styleData = (currentLayer?.layerStyles as any)?.[style.id] || { enabled: false, color: '#000000', opacity: 0.5, distance: 5, size: 5 };
                  return (
                    <div key={style.id} className="flex flex-col gap-2 p-2 bg-[#1a1a1a] rounded border border-[#3a3a3a]">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-300">{style.label}</span>
                        <input 
                          type="checkbox" 
                          checked={styleData.enabled}
                          onChange={(e) => useStore.getState().updateLayerStyle(selectedLayerId!, style.id as any, { enabled: e.target.checked })}
                          className="w-3 h-3 accent-blue-500" 
                        />
                      </div>
                      {styleData.enabled && (
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <div className="flex flex-col gap-1">
                            <span className="text-[8px] text-gray-500 uppercase">Color</span>
                            <input 
                              type="color" 
                              value={styleData.color} 
                              onChange={(e) => useStore.getState().updateLayerStyle(selectedLayerId!, style.id as any, { color: e.target.value })}
                              className="w-full h-4 bg-transparent border-none cursor-pointer"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[8px] text-gray-500 uppercase">Opacity</span>
                            <input 
                              type="number" step="0.1" min="0" max="1"
                              value={styleData.opacity} 
                              onChange={(e) => useStore.getState().updateLayerStyle(selectedLayerId!, style.id as any, { opacity: Math.max(0, Math.min(1, num(e.target.value, 0.5))) })}
                              className="w-full bg-[#222] border border-[#3a3a3a] rounded px-1 py-0.5 text-[10px] text-white"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[8px] text-gray-500 uppercase">Dist</span>
                            <input 
                              type="number"
                              value={styleData.distance} 
                              onChange={(e) => useStore.getState().updateLayerStyle(selectedLayerId!, style.id as any, { distance: num(e.target.value, 5) })}
                              className="w-full bg-[#222] border border-[#3a3a3a] rounded px-1 py-0.5 text-[10px] text-white"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[8px] text-gray-500 uppercase">Size</span>
                            <input 
                              type="number"
                              value={styleData.size} 
                              onChange={(e) => useStore.getState().updateLayerStyle(selectedLayerId!, style.id as any, { size: Math.max(0, num(e.target.value, 5)) })}
                              className="w-full bg-[#222] border border-[#3a3a3a] rounded px-1 py-0.5 text-[10px] text-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {currentLayer?.type === 'shape' && (
              <div className="flex flex-col gap-3">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Maximize size={12} /> Shape Settings
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">Fill Color</span>
                    <input 
                      type="color" 
                      value={currentLayer.shapeSettings?.fill || '#3b82f6'}
                      onChange={(e) => updateLayer(selectedLayerId!, { shapeSettings: { ...(currentLayer?.shapeSettings || { type: 'rectangle', fill: '#3b82f6', stroke: '#000000', strokeWidth: 2 }), fill: e.target.value } })}
                      className="w-8 h-5 bg-transparent border-none cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>Stroke Width</span>
                      <span>{currentLayer.shapeSettings?.strokeWidth || 2}</span>
                    </div>
                    <input 
                      type="range" min="0" max="20" value={currentLayer.shapeSettings?.strokeWidth || 2} 
                      onChange={(e) => updateLayer(selectedLayerId!, { shapeSettings: { ...(currentLayer?.shapeSettings || { type: 'rectangle', fill: '#3b82f6', stroke: '#000000', strokeWidth: 2 }), strokeWidth: parseInt(e.target.value) } })}
                      className="w-full h-1 bg-[#1a1a1a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}
            {currentLayer?.type === 'cloner' && (
              <div className="flex flex-col gap-3">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Settings size={12} /> Cloner Settings
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>Count</span>
                      <span>{currentLayer.clonerSettings?.count || 5}</span>
                    </div>
                    <input 
                      type="range" min="1" max="50" value={currentLayer.clonerSettings?.count || 5} 
                      onChange={(e) => updateLayer(selectedLayerId!, { clonerSettings: { ...(currentLayer?.clonerSettings || { count: 5, mode: 'linear', offset: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 }, randomness: { x: 0, y: 0, scaleX: 0, scaleY: 0, rotation: 0 }, step: 100 }), count: parseInt(e.target.value) } })}
                      className="w-full h-1 bg-[#1a1a1a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-400">Mode</span>
                    <select 
                      value={currentLayer.clonerSettings?.mode || 'linear'}
                      onChange={(e) => updateLayer(selectedLayerId!, { clonerSettings: { ...(currentLayer?.clonerSettings || { count: 5, mode: 'linear', offset: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 }, randomness: { x: 0, y: 0, scaleX: 0, scaleY: 0, rotation: 0 }, step: 100 }), mode: e.target.value as any } })}
                      className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                    >
                      <option value="linear">Linear</option>
                      <option value="grid">Grid</option>
                      <option value="radial">Radial</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>Offset X</span>
                      <span>{currentLayer.clonerSettings?.offset.x || 0}</span>
                    </div>
                    <input 
                      type="range" min="-200" max="200" value={currentLayer.clonerSettings?.offset.x || 0} 
                      onChange={(e) => setLayers(layers.map(l => l.id === selectedLayerId ? { ...l, clonerSettings: { ...(l.clonerSettings || { count: 5, mode: 'linear', offset: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, randomness: { x: 0, y: 0, scaleX: 0, scaleY: 0, rotation: 0 }, step: 100 }), offset: { ...(l.clonerSettings?.offset || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }), x: parseInt(e.target.value) } } } : l))}
                      className="w-full h-1 bg-[#1a1a1a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}
            {/* Vector Pen Path Properties */}
            {currentLayer?.type === 'vector' && (
              <div className="flex flex-col gap-3 p-3 bg-[#18181c] rounded-lg border border-blue-500/30">
                <h3 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                  <PenTool size={13} /> Vector Pen Path Properties
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-gray-300 font-medium">Enable Stroke</label>
                    <input 
                      type="checkbox" 
                      checked={currentLayer.vectorSettings?.strokeEnabled ?? true}
                      onChange={(e) => updateLayer(selectedLayerId!, {
                        vectorSettings: {
                          ...(currentLayer.vectorSettings || { points: [], closed: false, stroke: '#3b82f6', strokeWidth: 4, fill: '#3b82f640', fillEnabled: true, strokeEnabled: true }),
                          strokeEnabled: e.target.checked
                        }
                      })}
                      className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Stroke Color</span>
                      <input 
                        type="color"
                        value={currentLayer.vectorSettings?.stroke || '#3b82f6'}
                        onChange={(e) => updateLayer(selectedLayerId!, {
                          vectorSettings: {
                            ...(currentLayer.vectorSettings || { points: [], closed: false, stroke: '#3b82f6', strokeWidth: 4, fill: '#3b82f640', fillEnabled: true, strokeEnabled: true }),
                            stroke: e.target.value
                          }
                        })}
                        className="w-full h-7 bg-[#222] border border-[#333] rounded cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Width ({currentLayer.vectorSettings?.strokeWidth || 4}px)</span>
                      <input 
                        type="range" min="1" max="40"
                        value={currentLayer.vectorSettings?.strokeWidth || 4}
                        onChange={(e) => updateLayer(selectedLayerId!, {
                          vectorSettings: {
                            ...(currentLayer.vectorSettings || { points: [], closed: false, stroke: '#3b82f6', strokeWidth: 4, fill: '#3b82f640', fillEnabled: true, strokeEnabled: true }),
                            strokeWidth: parseInt(e.target.value)
                          }
                        })}
                        className="w-full h-1 bg-[#222] rounded appearance-none accent-blue-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="text-[11px] text-gray-300 font-medium">Enable Fill</label>
                    <input 
                      type="checkbox" 
                      checked={currentLayer.vectorSettings?.fillEnabled ?? true}
                      onChange={(e) => updateLayer(selectedLayerId!, {
                        vectorSettings: {
                          ...(currentLayer.vectorSettings || { points: [], closed: false, stroke: '#3b82f6', strokeWidth: 4, fill: '#3b82f640', fillEnabled: true, strokeEnabled: true }),
                          fillEnabled: e.target.checked
                        }
                      })}
                      className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
                    />
                  </div>

                  {currentLayer.vectorSettings?.fillEnabled && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Fill Color</span>
                      <input 
                        type="color"
                        value={currentLayer.vectorSettings?.fill?.slice(0, 7) || '#3b82f6'}
                        onChange={(e) => updateLayer(selectedLayerId!, {
                          vectorSettings: {
                            ...(currentLayer.vectorSettings || { points: [], closed: false, stroke: '#3b82f6', strokeWidth: 4, fill: '#3b82f640', fillEnabled: true, strokeEnabled: true }),
                            fill: e.target.value + '66'
                          }
                        })}
                        className="w-full h-7 bg-[#222] border border-[#333] rounded cursor-pointer"
                      />
                    </div>
                  )}

                  <div className="space-y-1 pt-2 border-t border-[#2a2a35]">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-blue-300">Stroke Draw Animation</span>
                      <span className="text-[10px] font-mono font-bold text-gray-300">{Math.round((currentLayer.vectorSettings?.pathProgress ?? 1) * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="1" step="0.01"
                      value={currentLayer.vectorSettings?.pathProgress ?? 1}
                      onChange={(e) => updateLayer(selectedLayerId!, {
                        vectorSettings: {
                          ...(currentLayer.vectorSettings || { points: [], closed: false, stroke: '#3b82f6', strokeWidth: 4, fill: '#3b82f640', fillEnabled: true, strokeEnabled: true }),
                          pathProgress: parseFloat(e.target.value)
                        }
                      })}
                      className="w-full h-1 bg-[#222] rounded appearance-none accent-blue-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => updateLayer(selectedLayerId!, {
                        vectorSettings: {
                          ...(currentLayer.vectorSettings || { points: [], closed: false, stroke: '#3b82f6', strokeWidth: 4, fill: '#3b82f640', fillEnabled: true, strokeEnabled: true }),
                          closed: !currentLayer.vectorSettings?.closed
                        }
                      })}
                      className={`px-3 py-1 rounded text-[10px] font-semibold border transition-all ${
                        currentLayer.vectorSettings?.closed 
                          ? 'bg-blue-600/30 border-blue-500 text-blue-300' 
                          : 'bg-[#222] border-[#333] text-gray-400 hover:text-white'
                      }`}
                    >
                      {currentLayer.vectorSettings?.closed ? 'Path Closed ✓' : 'Close Path Loop'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Procedural Particle System Node Properties */}
            {(currentLayer?.proceduralSettings?.type === 'particles' || currentLayer?.name?.toLowerCase().includes('particle')) && (
              <div className="flex flex-col gap-3 p-3 bg-[#18181c] rounded-lg border border-amber-500/30">
                <h3 className="text-[10px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                  <Sparkles size={13} /> Particle System Node
                </h3>

                <div className="space-y-1">
                  <span className="text-[10px] text-gray-400 font-medium">Effect Preset</span>
                  <select
                    value={currentLayer.proceduralSettings?.particles?.preset || 'sparks'}
                    onChange={(e) => {
                      const preset = e.target.value as any;
                      const defaults = {
                        sparks: { color: '#f59e0b', secondaryColor: '#ef4444', speed: 4, gravity: 2, spread: 120, size: 6 },
                        smoke: { color: '#94a3b8', secondaryColor: '#475569', speed: 1.5, gravity: -0.5, spread: 60, size: 25 },
                        light: { color: '#38bdf8', secondaryColor: '#c084fc', speed: 2.5, gravity: 0, spread: 360, size: 10 },
                        fireflies: { color: '#facc15', secondaryColor: '#a3e635', speed: 1, gravity: 0, spread: 360, size: 8 },
                        snow: { color: '#ffffff', secondaryColor: '#e0f2fe', speed: 2, gravity: 1.5, spread: 30, size: 4 }
                      }[preset as 'sparks'] || {};

                      updateLayer(selectedLayerId!, {
                        proceduralSettings: {
                          type: 'particles',
                          particles: {
                            ...(currentLayer.proceduralSettings?.particles || { enabled: true, preset: 'sparks', count: 120, speed: 4, life: 2.5, size: 6, color: '#f59e0b', gravity: 2, spread: 120 }),
                            preset,
                            ...defaults
                          }
                        }
                      });
                    }}
                    className="w-full bg-[#222] border border-[#3a3a3a] rounded px-2 py-1.5 text-xs text-amber-200 font-semibold outline-none"
                  >
                    <option value="sparks">✨ Sparks / Embers</option>
                    <option value="smoke">💨 Volumetric Smoke</option>
                    <option value="light">🌟 Light & Magic Aura</option>
                    <option value="fireflies">🪲 Pulsing Fireflies</option>
                    <option value="snow">❄️ Gentle Snowfall</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-400">Count ({currentLayer.proceduralSettings?.particles?.count || 120})</span>
                    <input
                      type="range" min="20" max="400"
                      value={currentLayer.proceduralSettings?.particles?.count || 120}
                      onChange={(e) => updateLayer(selectedLayerId!, {
                        proceduralSettings: {
                          type: 'particles',
                          particles: {
                            ...(currentLayer.proceduralSettings?.particles || { enabled: true, preset: 'sparks', life: 2.5, speed: 4, size: 6, color: '#f59e0b', gravity: 2, spread: 120 }),
                            count: parseInt(e.target.value)
                          }
                        }
                      })}
                      className="w-full h-1 bg-[#222] rounded appearance-none accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-400">Speed ({currentLayer.proceduralSettings?.particles?.speed || 4})</span>
                    <input
                      type="range" min="0.5" max="10" step="0.5"
                      value={currentLayer.proceduralSettings?.particles?.speed || 4}
                      onChange={(e) => updateLayer(selectedLayerId!, {
                        proceduralSettings: {
                          type: 'particles',
                          particles: {
                            ...(currentLayer.proceduralSettings?.particles || { enabled: true, preset: 'sparks', count: 120, life: 2.5, size: 6, color: '#f59e0b', gravity: 2, spread: 120 }),
                            speed: parseFloat(e.target.value)
                          }
                        }
                      })}
                      className="w-full h-1 bg-[#222] rounded appearance-none accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-400">Primary Color</span>
                    <input
                      type="color"
                      value={currentLayer.proceduralSettings?.particles?.color?.slice(0, 7) || '#f59e0b'}
                      onChange={(e) => updateLayer(selectedLayerId!, {
                        proceduralSettings: {
                          type: 'particles',
                          particles: {
                            ...(currentLayer.proceduralSettings?.particles || { enabled: true, preset: 'sparks', count: 120, life: 2.5, speed: 4, size: 6, gravity: 2, spread: 120 }),
                            color: e.target.value
                          }
                        }
                      })}
                      className="w-full h-7 bg-[#222] border border-[#333] rounded cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-400">Secondary Color</span>
                    <input
                      type="color"
                      value={currentLayer.proceduralSettings?.particles?.secondaryColor?.slice(0, 7) || '#ef4444'}
                      onChange={(e) => updateLayer(selectedLayerId!, {
                        proceduralSettings: {
                          type: 'particles',
                          particles: {
                            ...(currentLayer.proceduralSettings?.particles || { enabled: true, preset: 'sparks', count: 120, life: 2.5, speed: 4, size: 6, color: '#f59e0b', gravity: 2, spread: 120 }),
                            secondaryColor: e.target.value
                          }
                        }
                      })}
                      className="w-full h-7 bg-[#222] border border-[#333] rounded cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-400">Particle Size ({currentLayer.proceduralSettings?.particles?.size || 6}px)</span>
                    <input
                      type="range" min="1" max="40"
                      value={currentLayer.proceduralSettings?.particles?.size || 6}
                      onChange={(e) => updateLayer(selectedLayerId!, {
                        proceduralSettings: {
                          type: 'particles',
                          particles: {
                            ...(currentLayer.proceduralSettings?.particles || { enabled: true, preset: 'sparks', count: 120, life: 2.5, speed: 4, color: '#f59e0b', gravity: 2, spread: 120 }),
                            size: parseInt(e.target.value)
                          }
                        }
                      })}
                      className="w-full h-1 bg-[#222] rounded appearance-none accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-400">Gravity ({currentLayer.proceduralSettings?.particles?.gravity ?? 2})</span>
                    <input
                      type="range" min="-5" max="5" step="0.5"
                      value={currentLayer.proceduralSettings?.particles?.gravity ?? 2}
                      onChange={(e) => updateLayer(selectedLayerId!, {
                        proceduralSettings: {
                          type: 'particles',
                          particles: {
                            ...(currentLayer.proceduralSettings?.particles || { enabled: true, preset: 'sparks', count: 120, life: 2.5, speed: 4, size: 6, color: '#f59e0b', spread: 120 }),
                            gravity: parseFloat(e.target.value)
                          }
                        }
                      })}
                      className="w-full h-1 bg-[#222] rounded appearance-none accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}
            {currentLayer?.type === '3d-text' && (
              <div className="flex flex-col gap-3">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <TypeIcon size={12} /> 3D Kinetic Typography
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-400">Text Content</span>
                    <textarea 
                      value={currentLayer.content || ''}
                      onChange={(e) => updateLayer(selectedLayerId!, { content: e.target.value })}
                      className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded p-2 text-xs text-white resize-none h-20"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Font Size</span>
                      <input 
                        type="number" 
                        value={currentLayer.fontSettings?.size || 48}
                        onChange={(e) => updateLayer(selectedLayerId!, { fontSettings: { ...(currentLayer?.fontSettings || { size: 48 }), size: Math.max(1, num(e.target.value, currentLayer.fontSettings?.size || 48)) } })}
                        className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Depth</span>
                      <input 
                        type="number" 
                        value={currentLayer.fontSettings?.depth || 10}
                        onChange={(e) => updateLayer(selectedLayerId!, { fontSettings: { ...(currentLayer?.fontSettings || { size: 48 }), depth: Math.max(1, Math.min(60, num(e.target.value, 10))) } })}
                        className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-400">Font Family</span>
                    <select 
                      value={currentLayer.fontSettings?.family || 'Inter'}
                      onChange={(e) => updateLayer(selectedLayerId!, { fontSettings: { ...(currentLayer?.fontSettings || { size: 48 }), family: e.target.value } })}
                      className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                    >
                      <option value="Inter">Inter</option>
                      <option value="Space Grotesk">Space Grotesk</option>
                      <option value="Outfit">Outfit</option>
                      <option value="Playfair Display">Playfair Display</option>
                      <option value="JetBrains Mono">JetBrains Mono</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Weight</span>
                      <select 
                        value={currentLayer.fontSettings?.weight || 'normal'}
                        onChange={(e) => updateLayer(selectedLayerId!, { fontSettings: { ...(currentLayer?.fontSettings || { size: 48 }), weight: e.target.value } })}
                        className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-white"
                      >
                        <option value="normal">Normal</option>
                        <option value="bold">Bold</option>
                        <option value="black">Black</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Color</span>
                      <input 
                        type="color" 
                        value={currentLayer.fontSettings?.color || '#ffffff'}
                        onChange={(e) => updateLayer(selectedLayerId!, { fontSettings: { ...(currentLayer?.fontSettings || { size: 48 }), color: e.target.value } })}
                        className="w-full h-8 bg-[#1a1a1a] border border-[#3a3a3a] rounded cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-gray-400">
                        <span>Tracking</span>
                        <span>{currentLayer.fontSettings?.tracking || 0}</span>
                      </div>
                      <input 
                        type="range" min="-10" max="50" value={currentLayer.fontSettings?.tracking || 0}
                        onChange={(e) => updateLayer(selectedLayerId!, { fontSettings: { ...(currentLayer?.fontSettings || { size: 48 }), tracking: num(e.target.value, 0) } })}
                        className="w-full h-1 bg-[#1a1a1a] rounded-full appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-gray-400">
                        <span>Leading</span>
                        <span>{currentLayer.fontSettings?.leading || 1.2}</span>
                      </div>
                      <input 
                        type="range" min="0.5" max="3" step="0.1" value={currentLayer.fontSettings?.leading || 1.2}
                        onChange={(e) => updateLayer(selectedLayerId!, { fontSettings: { ...(currentLayer?.fontSettings || { size: 48 }), leading: Math.max(0.1, num(e.target.value, 1.2)) } })}
                        className="w-full h-1 bg-[#1a1a1a] rounded-full appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-400">Bevel</span>
                    <input 
                      type="range" min="0" max="20" value={currentLayer.fontSettings?.bevel || 0}
                      onChange={(e) => updateLayer(selectedLayerId!, { fontSettings: { ...(currentLayer?.fontSettings || { size: 48 }), bevel: num(e.target.value, 0) } })}
                      className="w-full h-1 bg-[#1a1a1a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] text-gray-400">Animation Presets</span>
                    <div className="grid grid-cols-2 gap-1">
                      {['Fluid Morph', 'Scrolling', 'Glitch', 'Typewriter', 'Dynamic Layout'].map(preset => (
                        <button 
                          key={preset}
                          onClick={() => { applyKineticPreset(preset); setStatusMessage(`Applied "${preset}" preset at ${currentTime.toFixed(2)}s`); }}
                          title={`Add "${preset}" keyframes starting at the playhead`}
                          className="py-1.5 text-[9px] bg-[#1a1a1a] border border-[#3a3a3a] rounded text-gray-400 hover:text-white hover:border-blue-500 transition-all"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Wind size={12} /> Motion Path
              </h3>
              <div className="space-y-2">
                <select 
                  className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1.5 text-xs text-white"
                  value={currentLayer?.motionPathId || ''}
                  onChange={(e) => updateLayerCommitted(selectedLayerId!, { motionPathId: e.target.value || undefined, motionPathProgress: currentLayer?.motionPathProgress ?? 0 }, 'Assign Motion Path')}
                >
                  <option value="">No Path</option>
                  {motionPaths.map(path => (
                    <option key={path.id} value={path.id}>Path {path.id.slice(-5)} ({path.points.length} pts)</option>
                  ))}
                </select>
                {currentLayer?.motionPathId && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>Path Progress</span>
                      <span>{Math.round((currentLayer.motionPathProgress || 0) * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="1" step="0.01" value={currentLayer.motionPathProgress || 0}
                      onMouseUp={() => updateLayerCommitted(selectedLayerId!, {}, 'Path Progress')}
                      onChange={(e) => updateLayer(selectedLayerId!, { motionPathProgress: num(e.target.value, 0) })}
                      className="w-full h-1 bg-[#1a1a1a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                    <button
                      onClick={() => {
                        const p = currentLayer.motionPathProgress || 0;
                        addKeyframe(selectedLayerId!, 'motionPathProgress', { time: currentTime, value: p, easing: 'ease-in-out' });
                        setStatusMessage(`Keyframed path progress ${Math.round(p * 100)}% at ${currentTime.toFixed(2)}s`);
                      }}
                      className="w-full py-1 mt-1 bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#3a3a3a] rounded text-[10px] text-gray-300"
                    >
                      ◆ Keyframe progress at {currentTime.toFixed(2)}s
                    </button>
                  </div>
                )}
                <p className="text-[9px] text-gray-500">Draw a new path with the Motion Path tool (Shift+P) while this layer is selected.</p>
              </div>
            </div>

            {/* Velocity-based Motion Blur Effect */}
            <div className="flex flex-col gap-3 p-3 bg-[#1e1e1e] rounded-lg border border-[#383838]">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Activity size={13} /> Motion Blur
                </h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={currentLayer?.motionBlurSettings?.enabled || false}
                    onChange={(e) => {
                      if (!selectedLayerId) return;
                      const currentMb = currentLayer?.motionBlurSettings || { enabled: false, intensity: 50, shutterAngle: 180 };
                      updateLayer(selectedLayerId, {
                        motionBlurSettings: { ...currentMb, enabled: e.target.checked }
                      });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {currentLayer?.motionBlurSettings?.enabled && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-300">
                      <span>Blur Intensity</span>
                      <span className="font-mono font-bold text-blue-400">{currentLayer.motionBlurSettings.intensity ?? 50}%</span>
                    </div>
                    <input 
                      type="range"
                      min="0"
                      max="100"
                      value={currentLayer.motionBlurSettings.intensity ?? 50}
                      onChange={(e) => {
                        if (!selectedLayerId) return;
                        updateLayer(selectedLayerId, {
                          motionBlurSettings: {
                            ...currentLayer.motionBlurSettings!,
                            intensity: parseInt(e.target.value)
                          }
                        });
                      }}
                      className="w-full h-1 bg-[#111] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-300">
                      <span>Shutter Angle</span>
                      <span className="font-mono text-gray-400">{currentLayer.motionBlurSettings.shutterAngle ?? 180}°</span>
                    </div>
                    <input 
                      type="range"
                      min="0"
                      max="360"
                      step="10"
                      value={currentLayer.motionBlurSettings.shutterAngle ?? 180}
                      onChange={(e) => {
                        if (!selectedLayerId) return;
                        updateLayer(selectedLayerId, {
                          motionBlurSettings: {
                            ...currentLayer.motionBlurSettings!,
                            shutterAngle: parseInt(e.target.value)
                          }
                        });
                      }}
                      className="w-full h-1 bg-[#111] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div className="p-2 bg-[#121212] rounded border border-[#2c2c2c] text-[9px] text-gray-400 leading-snug">
                    ⚡ <strong className="text-gray-200">Velocity Adaptive:</strong> Blur automatically calculates frame-to-time movement vector across keyframe transitions.
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Zap size={12} /> AI Animator
              </h3>
              <div className="space-y-2">
                <textarea 
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Describe animation (e.g., 'float gently in a circle')"
                  className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded p-2 text-[10px] text-white resize-none h-16"
                />
                <button 
                  onClick={handleAiAnimate}
                  disabled={isGenerating || !selectedLayerId}
                  className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded transition-colors flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  {isGenerating ? 'Generating...' : 'Generate Motion'}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Activity size={12} /> Curves
              </h3>
              {currentLayer?.type !== 'raster' && <p className="text-[9px] text-gray-500 -mt-1">Curves and Chroma Key process pixels, so they apply to image (raster) layers.</p>}
              <CurvesEditor 
                adjustment={currentLayer?.adjustments.curves || {
                  rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
                  red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
                  green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
                  blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
                }}
                onChange={(newCurves) => setAdjustments({ ...currentLayer!.adjustments, curves: newCurves })}
              />
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Scissors size={12} /> Chroma Key (Ultra Key)
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Enable Key</span>
                  <input 
                    type="checkbox" 
                    checked={currentLayer?.adjustments.chromaKey?.enabled || false}
                    onChange={(e) => setAdjustments({ 
                      ...currentLayer!.adjustments, 
                      chromaKey: { ...(currentLayer?.adjustments.chromaKey || { targetColor: '#00ff00', similarity: 30, smoothness: 10, spillSuppression: 20, edgeFeather: 0 }), enabled: e.target.checked } 
                    })}
                    className="w-3 h-3 accent-blue-500"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Key Color</span>
                  <input 
                    type="color" 
                    value={currentLayer?.adjustments.chromaKey?.targetColor || '#00ff00'}
                    onChange={(e) => setAdjustments({ 
                      ...currentLayer!.adjustments, 
                      chromaKey: { ...(currentLayer?.adjustments.chromaKey || { enabled: false, similarity: 30, smoothness: 10, spillSuppression: 20, edgeFeather: 0 }), targetColor: e.target.value } 
                    })}
                    className="w-8 h-5 bg-transparent border-none cursor-pointer"
                  />
                </div>

                {[
                  { label: 'Similarity', key: 'similarity', min: 0, max: 100 },
                  { label: 'Smoothness', key: 'smoothness', min: 0, max: 100 },
                  { label: 'Spill Suppression', key: 'spillSuppression', min: 0, max: 100 },
                  { label: 'Edge Feather', key: 'edgeFeather', min: 0, max: 50 },
                ].map((slider) => (
                  <div key={slider.key} className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>{slider.label}</span>
                      <span>{(currentLayer?.adjustments.chromaKey as any)?.[slider.key] || 0}</span>
                    </div>
                    <input 
                      type="range" 
                      min={slider.min} 
                      max={slider.max} 
                      value={(currentLayer?.adjustments.chromaKey as any)?.[slider.key] || 0}
                      onChange={(e) => setAdjustments({ 
                        ...currentLayer!.adjustments, 
                        chromaKey: { ...(currentLayer?.adjustments.chromaKey || {}), [slider.key]: parseInt(e.target.value) } as any
                      })}
                      className="w-full h-1 bg-[#1a1a1a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Maximize size={12} /> Transform
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#1a1a1a] p-2 rounded border border-[#3a3a3a]">
                  <div className="text-[8px] text-gray-500 uppercase">Width</div>
                  <div className="text-[11px] text-gray-300">1920 px</div>
                </div>
                <div className="bg-[#1a1a1a] p-2 rounded border border-[#3a3a3a]">
                  <div className="text-[8px] text-gray-500 uppercase">Height</div>
                  <div className="text-[11px] text-gray-300">1080 px</div>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'motion' && (
          <div className="p-4 flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Zap size={12} /> Kinetic Typography
              </h3>
              <div className="space-y-2">
                <button 
                  onClick={() => addTextLayer(true)}
                  className="w-full py-2 bg-[#333] hover:bg-[#444] text-[10px] rounded border border-[#444] flex items-center justify-center gap-2"
                >
                  <Plus size={12} /> Add 3D Text Engine
                </button>
                <div className="space-y-1">
                  <span className="text-[10px] text-gray-400">Presets</span>
                  <div className="grid grid-cols-2 gap-2">
                    {['Fluid Morph', 'Scrolling', 'Glitch', 'Typewriter', 'Dynamic Layout'].map(preset => (
                      <button 
                        key={preset}
                        disabled={!currentLayer || (currentLayer.type !== 'text' && currentLayer.type !== '3d-text')}
                        title={!currentLayer || (currentLayer.type !== 'text' && currentLayer.type !== '3d-text') ? 'Select a text or 3D text layer first' : `Apply "${preset}" at the playhead`}
                        onClick={() => { applyKineticPreset(preset); setStatusMessage(`Applied "${preset}" preset at ${currentTime.toFixed(2)}s`); }}
                        className="py-2 bg-[#1a1a1a] text-[9px] rounded border border-[#3a3a3a] hover:border-blue-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Activity size={12} /> Keyframe Easing
              </h3>
              <div className="space-y-2">
                <button 
                  onClick={() => useStore.getState().openEasingEditor({ layerId: selectedLayerId || undefined })}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded shadow flex items-center justify-center gap-2 transition-colors"
                >
                  <Activity size={12} /> Open Easing Curve Editor...
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Settings size={12} /> Procedural Tools
              </h3>
              <div className="space-y-2">
                <button
                  onClick={addClonerLayer}
                  className="w-full py-2 bg-[#333] hover:bg-[#444] text-[10px] rounded border border-[#444] flex items-center justify-center gap-2"
                >
                  <Plus size={12} /> Add Cloner System Layer
                </button>
                <button
                  onClick={() => useStore.getState().addKeyframe()}
                  disabled={!currentLayer}
                  className="w-full py-2 bg-[#333] hover:bg-[#444] text-[10px] rounded border border-[#444] flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Activity size={12} /> Keyframe Transform at {currentTime.toFixed(2)}s (Ctrl+K)
                </button>
                <div className="flex items-center justify-between p-2 bg-[#1a1a1a] rounded border border-[#3a3a3a]">
                  <span className="text-[10px] text-gray-300">Wiggle / Noise on selected layer</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      disabled={!currentLayer}
                      checked={currentLayer?.proceduralSettings?.type === 'noise'}
                      onChange={(e) => {
                        if (!currentLayer) return;
                        updateLayerCommitted(currentLayer.id, {
                          proceduralSettings: e.target.checked
                            ? { type: 'noise', noise: { enabled: true, frequency: 1, amplitude: 20, speed: 2 } }
                            : { type: null }
                        }, e.target.checked ? 'Enable Wiggle' : 'Disable Wiggle');
                      }}
                    />
                    <div className="w-8 h-4 bg-[#333] rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-full"></div>
                  </label>
                </div>
                {currentLayer?.proceduralSettings?.type === 'noise' && currentLayer.proceduralSettings.noise && (
                  <div className="grid grid-cols-2 gap-2 p-2 bg-[#1a1a1a] rounded border border-[#3a3a3a]">
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Amplitude ({currentLayer.proceduralSettings.noise.amplitude}px)</span>
                      <input type="range" min="0" max="200" value={currentLayer.proceduralSettings.noise.amplitude}
                        onChange={(e) => updateLayer(currentLayer.id, { proceduralSettings: { ...currentLayer.proceduralSettings!, noise: { ...currentLayer.proceduralSettings!.noise!, amplitude: num(e.target.value, 20) } } })}
                        className="w-full h-1 bg-[#222] rounded appearance-none accent-blue-500 cursor-pointer" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400">Speed ({currentLayer.proceduralSettings.noise.speed})</span>
                      <input type="range" min="0.1" max="10" step="0.1" value={currentLayer.proceduralSettings.noise.speed}
                        onChange={(e) => updateLayer(currentLayer.id, { proceduralSettings: { ...currentLayer.proceduralSettings!, noise: { ...currentLayer.proceduralSettings!.noise!, speed: num(e.target.value, 2) } } })}
                        className="w-full h-1 bg-[#222] rounded appearance-none accent-blue-500 cursor-pointer" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="flex flex-col">
            <div className="p-2 flex gap-2 border-b border-[#1a1a1a] bg-[#222]">
              <button
                onClick={undo}
                className="flex-1 py-1 bg-[#333] hover:bg-[#444] text-[10px] rounded border border-[#444] disabled:opacity-50"
                disabled={historyIndex <= 0}
                title="Undo (Ctrl+Z)"
              >
                Undo
              </button>
              <button
                onClick={redo}
                className="flex-1 py-1 bg-[#333] hover:bg-[#444] text-[10px] rounded border border-[#444] disabled:opacity-50"
                disabled={historyIndex >= history.length - 1}
                title="Redo (Ctrl+Shift+Z)"
              >
                Redo
              </button>
            </div>
            <div className="flex flex-col">
              {history.map((entry, i) => (
                <button
                  key={i}
                  onClick={() => jumpToHistory(i)}
                  className={`p-2 border-b border-[#1a1a1a] flex items-center justify-between text-left hover:bg-[#333] transition-colors ${i === historyIndex ? 'bg-blue-600/10' : ''} ${i > historyIndex ? 'opacity-50' : ''}`}
                  title={i === historyIndex ? 'Current state' : `Jump to "${entry.label}"`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <History size={12} className={i === historyIndex ? 'text-blue-400 shrink-0' : 'text-gray-500 shrink-0'} />
                    <span className={`text-[11px] truncate ${i === historyIndex ? 'text-white font-bold' : 'text-gray-300'}`}>
                      {entry.label}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-gray-600 shrink-0">{entry.layers.length}L</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Color Picker Area */}
      <div className="border-t border-[#0a0a0a] p-2 bg-[#121214]">
        <AdvancedColorPicker
          color={brushColor || '#3b82f6'}
          onChange={(newColor) => {
            setBrushColor(newColor);
            if (selectedLayerId) {
              const currentLayer = layers.find(l => l.id === selectedLayerId);
              if (currentLayer?.type === 'text' || currentLayer?.type === '3d-text') {
                updateLayer(selectedLayerId, {
                  fontSettings: { ...(currentLayer.fontSettings || { size: 48 }), color: newColor }
                });
              } else if (currentLayer?.type === 'shape') {
                updateLayer(selectedLayerId, {
                  shapeSettings: { ...(currentLayer.shapeSettings || { type: 'rectangle', fill: '#3b82f6', stroke: '#ffffff', strokeWidth: 2 }), fill: newColor }
                });
              } else if (currentLayer?.type === 'vector') {
                updateLayer(selectedLayerId, {
                  vectorSettings: { ...(currentLayer.vectorSettings || { points: [], closed: false, stroke: '#3b82f6', strokeWidth: 4, fill: '#3b82f640', fillEnabled: true, strokeEnabled: true }), stroke: newColor }
                });
              }
            }
          }}
          label="Active Palette & Color"
        />
      </div>

      {stylesTarget && (
        <LayerStylesModal
          layer={stylesTarget}
          isOpen={!!stylesTarget}
          onClose={() => { setStylesTargetLayerId(null); updateLayerCommitted(stylesTarget.id, {}, 'Layer Styles'); }}
          onUpdateStyle={(styleType, updates) => updateLayerStyle(stylesTarget.id, styleType, updates)}
        />
      )}
    </div>
  );
};
