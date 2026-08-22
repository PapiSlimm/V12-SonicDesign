import React, { useState, useEffect, useRef } from 'react';
import { Tool, Layer, Adjustments, BlendMode, AnimationProperty, Transform } from './core/types';
import { Toolbar } from './components/Toolbar';
import { MenuBar } from './components/MenuBar';
import { OptionsBar } from './components/OptionsBar';
import { Sidebar } from './components/Sidebar';
import { Canvas, CanvasHandle } from './components/Canvas';
import { Timeline } from './components/Timeline';
import { AIModal } from './components/AIModal';
import { EasingEditorModal } from './components/EasingEditorModal';
import { ExportModal } from './components/ExportModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { AutoSaveRecoveryBanner } from './components/AutoSaveRecoveryBanner';
import { generateImageEdit } from './services/aiService';
import { importAsset, exportCanvas } from './services/fileService';
import { useStore } from './store/index';
import { useAnimationEngine } from './hooks/useAnimationEngine';
import { useDerivedLayers } from './hooks/useDerivedLayers';
import { useHotkeys } from 'react-hotkeys-hook';
import { LayerFactory } from './core/layers/LayerFactory';
import { debounce } from 'lodash';

export default function App() {
  const {
    layers, setLayers,
    selectedLayerId, setSelectedLayerId,
    selectedLayerIds, setSelectedLayerIds,
    selectedTool, setSelectedTool,
    zoom, setZoom,
    pan, setPan,
    brushSize, setBrushSize,
    brushOpacity, setBrushOpacity,
    selection,
    gradientOptions,
    currentTime, setCurrentTime,
    duration, setDuration,
    isPlaying, setIsPlaying,
    playbackSpeed, setPlaybackSpeed,
    motionPaths, setMotionPaths,
    historyIndex, recordHistory,
    undo, redo,
    addLayer, updateLayer, deleteLayer,
    groupLayers, setMask, moveLayer,
    addAdjustmentLayer, addClonerLayer, addShapeLayer, addKeyframe, addTextAnimatorLayer,
    showTimeline, setShowTimeline,
    setIsExportModalOpen
  } = useStore();

  useAnimationEngine({
    isPlaying,
    currentTime,
    setCurrentTime,
    duration,
    playbackSpeed
  });

  const derivedLayers = useDerivedLayers(layers, currentTime);

  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const aiAbortController = useRef<AbortController | null>(null);

  // Debounced History recording
  const debouncedHistory = useRef(debounce((stateLayers: Layer[]) => {
    recordHistory(structuredClone(stateLayers));
  }, 500)).current;

  // Cleanup
  useEffect(() => {
    return () => {
      debouncedHistory.cancel();
      aiAbortController.current?.abort();
    };
  }, []);

  // Keyboard Shortcuts
  const hotkeyOptions = { enableOnFormTags: false };
  
  useHotkeys('ctrl+z, command+z', (e) => { e.preventDefault(); undo(); }, hotkeyOptions);
  useHotkeys('ctrl+shift+z, command+shift+z', (e) => { e.preventDefault(); redo(); }, hotkeyOptions);
  useHotkeys('ctrl+=, command+=', (e) => { e.preventDefault(); setZoom(Math.min(zoom * 1.2, 20)); }, hotkeyOptions);
  useHotkeys('ctrl+-, command+-', (e) => { e.preventDefault(); setZoom(Math.max(zoom / 1.2, 0.05)); }, hotkeyOptions);
  useHotkeys('ctrl+0, command+0', (e) => { e.preventDefault(); setZoom(1); setPan({ x: 0, y: 0 }); }, hotkeyOptions);
  useHotkeys('v', () => setSelectedTool('move'), hotkeyOptions);
  useHotkeys('p', () => setSelectedTool('pen'), hotkeyOptions);
  useHotkeys('b', () => setSelectedTool('brush'), hotkeyOptions);
  useHotkeys('e', () => setSelectedTool('eraser'), hotkeyOptions);
  useHotkeys('h', () => setSelectedTool('hand'), hotkeyOptions);
  useHotkeys('m', () => setSelectedTool('marquee'), hotkeyOptions);
  useHotkeys('t', () => setSelectedTool('text'), hotkeyOptions);
  useHotkeys('shift+space, enter', (e) => { e.preventDefault(); setIsPlaying(!isPlaying); }, hotkeyOptions);
  useHotkeys('delete, backspace', (e) => { 
    if (selectedLayerId) {
      e.preventDefault();
      deleteLayer(selectedLayerId);
    }
  }, hotkeyOptions);

  // Temporary Hand Tool (Spacebar)
  useEffect(() => {
    let previousTool: Tool | null = null;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA')) {
        if (selectedTool !== 'hand') {
          previousTool = selectedTool;
          setSelectedTool('hand');
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && previousTool) {
        setSelectedTool(previousTool);
        previousTool = null;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedTool, setSelectedTool]);

  const canvasRef = useRef<CanvasHandle>(null);

  const handleAction = (action: string) => {
    console.log('Action:', action);
    
    const actions: Record<string, () => void> = {
      'AI:Generative Fill': () => setIsAIModalOpen(true),
      'Layer:New Layer': () => handleAddLayer(),
      'Layer:Delete Layer': () => selectedLayerId && deleteLayer(selectedLayerId),
      'Layer:Duplicate Layer': () => handleDuplicateLayer(),
      'Window:Timeline': () => setShowTimeline(!showTimeline),
      'Motion:Easing Editor': () => useStore.getState().openEasingEditor(),
      'File:Import Asset': () => handleImportAsset(),
      'File:Export': () => handleExport(),
      'File:Save': () => handleExport(),
      'View:Zoom In': () => setZoom(Math.min(zoom * 1.2, 20)),
      'View:Zoom Out': () => setZoom(Math.max(zoom / 1.2, 0.05)),
      'View:Reset Zoom': () => { setZoom(1); setPan({ x: 0, y: 0 }); },
      'Layer:Add Text Animator': () => addTextAnimatorLayer(),
    };

    actions[action]?.();
  };

  const handleExport = () => {
    setIsExportModalOpen(true);
  };

  const handleImportAsset = () => {
    importAsset((newLayer) => {
      addLayer(newLayer);
      setSelectedLayerId(newLayer.id);
    });
  };

  const handleAddLayer = () => {
    const newLayer = LayerFactory.createRasterLayer(`Layer ${layers.length + 1}`);
    addLayer(newLayer);
    setSelectedLayerId(newLayer.id);
  };

  const handleDuplicateLayer = () => {
    const layerToDup = layers.find(l => l.id === selectedLayerId);
    if (!layerToDup) return;
    
    const newLayer = structuredClone(layerToDup);
    newLayer.id = `layer-${Date.now()}`;
    newLayer.name = `${layerToDup.name} Copy`;
    
    addLayer(newLayer);
    setSelectedLayerId(newLayer.id);
  };

  const handleAIGenerate = async (prompt: string) => {
    if (!canvasRef.current) return;
    
    // Abort previous if still running
    aiAbortController.current?.abort();
    aiAbortController.current = new AbortController();

    const base64Image = await canvasRef.current.exportComposite();
    if (!base64Image) return;

    try {
      const editedImage = await generateImageEdit(base64Image, prompt, undefined, aiAbortController.current.signal);
      
      // Fast path: base64 -> Blob -> Bitmap
      const response = await fetch(editedImage);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      
      const aiLayer = LayerFactory.createRasterLayer('AI Result', bitmap);
      addLayer(aiLayer);
      setSelectedLayerId(aiLayer.id);
    } catch (error: any) {
      if (error.message !== 'Aborted') {
        console.error('AI Generation failed:', error);
      }
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1a1a] text-white font-sans select-none overflow-hidden">
      <MenuBar onAction={handleAction} />
      <OptionsBar 
        selectedTool={selectedTool} 
        brushSize={brushSize} 
        setBrushSize={setBrushSize}
        brushOpacity={brushOpacity}
        setBrushOpacity={setBrushOpacity}
      />
      
      <div className="flex-1 flex overflow-hidden">
        <Toolbar selectedTool={selectedTool} setSelectedTool={setSelectedTool} />
        
        <Canvas 
          ref={canvasRef}
          layers={derivedLayers}
          motionPaths={motionPaths}
          selectedLayerId={selectedLayerId}
          tool={selectedTool}
          zoom={zoom}
          pan={pan}
          brushSize={brushSize}
          brushOpacity={brushOpacity}
          selection={selection}
          gradientOptions={gradientOptions}
          onCanvasUpdate={() => debouncedHistory(layers)}
          setPan={setPan}
          setZoom={setZoom}
        />
        
        <Sidebar />
      </div>

      {showTimeline && <Timeline />}

      {/* Footer / Status Bar */}
      <div className="h-6 bg-[#1a1a1a] border-t border-[#0a0a0a] flex items-center px-4 justify-between text-[10px] text-gray-500">
        <div className="flex gap-4">
          <span>1920 x 1080 px (72 ppi)</span>
          <span>RGB / 8</span>
        </div>
        <div className="flex gap-4">
          <span>Doc: 5.93M / 12.4M</span>
          <span>Click and drag to move selection</span>
        </div>
      </div>

      <AIModal 
        isOpen={isAIModalOpen} 
        onClose={() => setIsAIModalOpen(false)} 
        onGenerate={handleAIGenerate} 
      />

      <EasingEditorModal />
      <ExportModal />
      <KeyboardShortcutsModal />
      <AutoSaveRecoveryBanner />
    </div>
  );
}
