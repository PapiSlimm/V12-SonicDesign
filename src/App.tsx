import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Tool } from './core/types';
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
import { generateImageEdit, replaceSky, enhanceImage, isAIConfigured } from './services/aiService';
import { importImageFiles, pickFiles, buildProjectFile, saveProjectFile, openProjectFile, exportCanvas, dataUrlToBitmap } from './services/fileService';
import { useStore } from './store/index';
import { useAnimationEngine } from './hooks/useAnimationEngine';
import { useDerivedLayers } from './hooks/useDerivedLayers';
import { useHotkeys } from 'react-hotkeys-hook';
import { LayerFactory } from './core/layers/LayerFactory';
import { DOC_WIDTH, DOC_HEIGHT } from './core/layers/layerUtils';

const HOTKEY_OPTIONS = { enableOnFormTags: false, preventDefault: true } as const;

function estimateDocBytes(layers: { bitmap: ImageBitmap | null }[]): number {
  return layers.reduce((sum, l) => sum + (l.bitmap ? l.bitmap.width * l.bitmap.height * 4 : 0), 0);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function App() {
  // Subscribe to individual slices so 60fps time updates don't re-render the whole tree
  const layers = useStore(s => s.layers);
  const selectedLayerId = useStore(s => s.selectedLayerId);
  const selectedLayerIds = useStore(s => s.selectedLayerIds);
  const selectedTool = useStore(s => s.selectedTool);
  const setSelectedTool = useStore(s => s.setSelectedTool);
  const zoom = useStore(s => s.zoom);
  const setZoom = useStore(s => s.setZoom);
  const pan = useStore(s => s.pan);
  const setPan = useStore(s => s.setPan);
  const brushSize = useStore(s => s.brushSize);
  const setBrushSize = useStore(s => s.setBrushSize);
  const brushOpacity = useStore(s => s.brushOpacity);
  const setBrushOpacity = useStore(s => s.setBrushOpacity);
  const selection = useStore(s => s.selection);
  const gradientOptions = useStore(s => s.gradientOptions);
  const currentTime = useStore(s => s.currentTime);
  const setCurrentTime = useStore(s => s.setCurrentTime);
  const duration = useStore(s => s.duration);
  const fps = useStore(s => s.fps);
  const isPlaying = useStore(s => s.isPlaying);
  const setIsPlaying = useStore(s => s.setIsPlaying);
  const playbackSpeed = useStore(s => s.playbackSpeed);
  const motionPaths = useStore(s => s.motionPaths);
  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);
  const addLayer = useStore(s => s.addLayer);
  const deleteSelectedLayers = useStore(s => s.deleteSelectedLayers);
  const duplicateLayer = useStore(s => s.duplicateLayer);
  const groupLayers = useStore(s => s.groupLayers);
  const addTextAnimatorLayer = useStore(s => s.addTextAnimatorLayer);
  const addTextLayer = useStore(s => s.addTextLayer);
  const showTimeline = useStore(s => s.showTimeline);
  const setShowTimeline = useStore(s => s.setShowTimeline);
  const setIsExportModalOpen = useStore(s => s.setIsExportModalOpen);
  const setActiveSidebarTab = useStore(s => s.setActiveSidebarTab);
  const setTimelineViewMode = useStore(s => s.setTimelineViewMode);
  const setIsShortcutsModalOpen = useStore(s => s.setIsShortcutsModalOpen);
  const setSmartGuidesEnabled = useStore(s => s.setSmartGuidesEnabled);
  const smartGuidesEnabled = useStore(s => s.smartGuidesEnabled);
  const selectLayer = useStore(s => s.selectLayer);
  const setSelection = useStore(s => s.setSelection);
  const statusMessage = useStore(s => s.statusMessage);
  const setStatusMessage = useStore(s => s.setStatusMessage);
  const projectName = useStore(s => s.projectName);
  const dirty = useStore(s => s.dirty);
  const historyIndex = useStore(s => s.historyIndex);
  const historyLength = useStore(s => s.history.length);

  useAnimationEngine({ isPlaying, currentTime, setCurrentTime, duration, playbackSpeed });

  const derivedLayers = useDerivedLayers(layers, currentTime);

  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const aiAbortController = useRef<AbortController | null>(null);
  const canvasRef = useRef<CanvasHandle>(null);

  // Cleanup + unsaved-changes guard
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useStore.getState().dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      aiAbortController.current?.abort();
    };
  }, []);

  useEffect(() => {
    document.title = `${dirty ? '• ' : ''}${projectName} — V12SonicDesign Studio`;
  }, [projectName, dirty]);

  // ---------- Keyboard Shortcuts ----------
  useHotkeys('ctrl+z, meta+z', () => undo(), HOTKEY_OPTIONS, [undo]);
  useHotkeys('ctrl+shift+z, meta+shift+z, ctrl+y', () => redo(), HOTKEY_OPTIONS, [redo]);
  useHotkeys('ctrl+equal, meta+equal, ctrl+plus', () => setZoom(zoom * 1.2), HOTKEY_OPTIONS, [zoom]);
  useHotkeys('ctrl+minus, meta+minus', () => setZoom(zoom / 1.2), HOTKEY_OPTIONS, [zoom]);
  useHotkeys('ctrl+0, meta+0', () => { setZoom(1); setPan({ x: 40, y: 40 }); }, HOTKEY_OPTIONS);
  useHotkeys('shift+0', () => canvasRef.current?.fitToScreen(), HOTKEY_OPTIONS);
  useHotkeys('v', () => setSelectedTool('move'), HOTKEY_OPTIONS);
  useHotkeys('p', () => setSelectedTool('pen'), HOTKEY_OPTIONS);
  useHotkeys('b', () => setSelectedTool('brush'), HOTKEY_OPTIONS);
  useHotkeys('e', () => setSelectedTool('eraser'), HOTKEY_OPTIONS);
  useHotkeys('h', () => setSelectedTool('hand'), HOTKEY_OPTIONS);
  useHotkeys('m', () => setSelectedTool('marquee'), HOTKEY_OPTIONS);
  useHotkeys('l', () => setSelectedTool('lasso'), HOTKEY_OPTIONS);
  useHotkeys('t', () => setSelectedTool('text'), HOTKEY_OPTIONS);
  useHotkeys('shift+t', () => setSelectedTool('text-animator'), HOTKEY_OPTIONS);
  useHotkeys('shift+p', () => setSelectedTool('motion-path'), HOTKEY_OPTIONS);
  useHotkeys('g', () => setSelectedTool('gradient'), HOTKEY_OPTIONS);
  useHotkeys('i', () => setSelectedTool('eyedropper'), HOTKEY_OPTIONS);
  useHotkeys('z', () => setSelectedTool('zoom'), HOTKEY_OPTIONS);
  useHotkeys('c', () => setSelectedTool('crop'), HOTKEY_OPTIONS);
  useHotkeys('period', () => setCurrentTime(useStore.getState().currentTime + 1 / fps), HOTKEY_OPTIONS, [fps]);
  useHotkeys('comma', () => setCurrentTime(useStore.getState().currentTime - 1 / fps), HOTKEY_OPTIONS, [fps]);
  useHotkeys('home', () => setCurrentTime(0), HOTKEY_OPTIONS);
  useHotkeys('end', () => setCurrentTime(useStore.getState().duration), HOTKEY_OPTIONS);
  useHotkeys('ctrl+g, meta+g', () => groupLayers(), HOTKEY_OPTIONS, [groupLayers]);
  useHotkeys('ctrl+shift+g, meta+shift+g', () => setSmartGuidesEnabled(!smartGuidesEnabled), HOTKEY_OPTIONS, [smartGuidesEnabled]);
  useHotkeys('ctrl+d, meta+d', () => duplicateLayer(), HOTKEY_OPTIONS, [duplicateLayer]);
  useHotkeys('ctrl+e, meta+e', () => setIsExportModalOpen(true), HOTKEY_OPTIONS);
  useHotkeys('ctrl+s, meta+s', () => handleSaveProject(), HOTKEY_OPTIONS, [layers, motionPaths, duration, projectName]);
  useHotkeys('ctrl+o, meta+o', () => handleOpenProject(), HOTKEY_OPTIONS);
  useHotkeys('ctrl+i, meta+i', () => handleImportAsset(), HOTKEY_OPTIONS);
  useHotkeys('ctrl+k, meta+k', () => useStore.getState().addKeyframe(), HOTKEY_OPTIONS);
  useHotkeys('shift+slash', () => setIsShortcutsModalOpen(!useStore.getState().isShortcutsModalOpen), HOTKEY_OPTIONS);
  useHotkeys('escape', () => {
    const s = useStore.getState();
    if (s.isShortcutsModalOpen) return s.setIsShortcutsModalOpen(false);
    if (s.isEasingEditorOpen) return s.setIsEasingEditorOpen(false);
    if (s.isExportModalOpen) return s.setIsExportModalOpen(false);
    if (isAIModalOpen) return setIsAIModalOpen(false);
    if (s.selection.active) return setSelection({ active: false, type: null, points: [] });
    selectLayer(null);
  }, { enableOnFormTags: true }, [isAIModalOpen]);
  useHotkeys('delete, backspace', () => {
    if (useStore.getState().selectedLayerIds.length || useStore.getState().selectedLayerId) deleteSelectedLayers();
  }, HOTKEY_OPTIONS, [deleteSelectedLayers]);
  useHotkeys('up, down, left, right, shift+up, shift+down, shift+left, shift+right', (e) => {
    const s = useStore.getState();
    const ids = s.selectedLayerIds.length ? s.selectedLayerIds : (s.selectedLayerId ? [s.selectedLayerId] : []);
    if (!ids.length) return;
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    s.startHistoryTransaction();
    ids.forEach(id => {
      const l = s.layers.find(x => x.id === id);
      if (l && !l.locked) s.updateLayer(id, { transform: { ...l.transform, x: l.transform.x + dx, y: l.transform.y + dy } });
    });
    s.endHistoryTransaction('Nudge Layer');
  }, HOTKEY_OPTIONS);

  // Space bar: tap = play/pause, hold + drag = temporary Hand (pan) tool.
  // Refs (not effect-local variables) so the previous tool survives re-renders.
  const previousToolRef = useRef<Tool | null>(null);
  const spaceDownAtRef = useRef<number | null>(null);
  const draggedWhileSpaceRef = useRef(false);
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || !!el?.isContentEditable;
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping()) return;
      e.preventDefault();
      if (e.repeat) return;
      spaceDownAtRef.current = performance.now();
      draggedWhileSpaceRef.current = false;
      const tool = useStore.getState().selectedTool;
      if (tool !== 'hand' && previousToolRef.current === null) {
        previousToolRef.current = tool;
        useStore.getState().setSelectedTool('hand');
      }
    };
    const handleMouseDown = () => { if (spaceDownAtRef.current !== null) draggedWhileSpaceRef.current = true; };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const held = spaceDownAtRef.current !== null ? performance.now() - spaceDownAtRef.current : Infinity;
      spaceDownAtRef.current = null;
      if (previousToolRef.current !== null) {
        useStore.getState().setSelectedTool(previousToolRef.current);
        previousToolRef.current = null;
      }
      if (held < 300 && !draggedWhileSpaceRef.current && !isTyping()) {
        const s = useStore.getState();
        s.setIsPlaying(!s.isPlaying);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  // ---------- File / Project handlers ----------
  const handleImportAsset = useCallback(async () => {
    const files = await pickFiles('image/*', true);
    if (!files.length) return;
    const imported = await importImageFiles(files);
    imported.forEach((layer, i) => addLayer({ ...layer, transform: { ...layer.transform, x: i * 24, y: i * 24 } }, `Import ${layer.name}`));
    if (imported.length) setStatusMessage(`Imported ${imported.length} image${imported.length > 1 ? 's' : ''}`);
    else setStatusMessage('No supported images were selected');
  }, [addLayer, setStatusMessage]);

  const handleSaveProject = useCallback(() => {
    const s = useStore.getState();
    const project = buildProjectFile({
      projectName: s.projectName,
      duration: s.duration,
      fps: s.fps,
      layers: s.layers,
      motionPaths: s.motionPaths,
      colorSwatches: s.colorSwatches,
      globalColorVariables: s.globalColorVariables,
      brushColor: s.brushColor
    });
    saveProjectFile(project);
    s.markSaved();
    setStatusMessage(`Saved ${s.projectName}.v12proj.json`);
  }, [setStatusMessage]);

  const handleOpenProject = useCallback(async () => {
    if (useStore.getState().dirty && !window.confirm('You have unsaved changes. Open another project anyway?')) return;
    try {
      const data = await openProjectFile();
      if (!data) return;
      useStore.getState().loadProject(data);
    } catch (err: any) {
      console.error(err);
      setStatusMessage(`Could not open project: ${err?.message || err}`);
    }
  }, [setStatusMessage]);

  const handleNewProject = useCallback(() => {
    if (useStore.getState().dirty && !window.confirm('Discard unsaved changes and start a new project?')) return;
    useStore.getState().newProject();
  }, []);

  const handleExportSnapshot = useCallback((format: 'png' | 'jpg') => {
    const canvas = canvasRef.current?.renderCompositeCanvas(undefined, format === 'jpg' ? '#111111' : null);
    if (!canvas) return;
    exportCanvas(canvas, format, `${projectName.replace(/[^a-z0-9_-]+/gi, '_')}-frame-${currentTime.toFixed(2)}s`);
    setStatusMessage(`Exported current frame as ${format.toUpperCase()}`);
  }, [projectName, currentTime, setStatusMessage]);

  const handleMergeVisible = useCallback(async () => {
    const canvas = canvasRef.current?.renderCompositeCanvas(undefined, null);
    if (!canvas) return;
    const bitmap = await createImageBitmap(canvas);
    useStore.getState().mergeVisibleLayers(bitmap);
    setStatusMessage('Merged visible layers into one raster layer');
  }, [setStatusMessage]);

  const handleAddLayer = () => {
    const newLayer = LayerFactory.createRasterLayer(`Layer ${layers.length + 1}`);
    addLayer(newLayer);
  };

  // ---------- AI ----------
  const runAI = useCallback(async (label: string, job: (composite: string, signal: AbortSignal) => Promise<string>) => {
    if (!canvasRef.current) return;
    if (!isAIConfigured()) {
      setStatusMessage('AI is not configured — add VITE_GEMINI_API_KEY to .env.local and restart the dev server');
      window.alert('Gemini API key missing.\n\nCreate a .env.local file next to package.json containing:\nVITE_GEMINI_API_KEY=your_key_here\n\nthen restart `npm run dev`.');
      return;
    }
    aiAbortController.current?.abort();
    const controller = new AbortController();
    aiAbortController.current = controller;
    setAiBusy(label);
    setStatusMessage(`${label}: sending composite to Gemini…`);
    try {
      const composite = await canvasRef.current.exportComposite();
      const editedImage = await job(composite, controller.signal);
      const bitmap = await dataUrlToBitmap(editedImage);
      const aiLayer = LayerFactory.createRasterLayer(`AI: ${label}`, bitmap);
      addLayer(aiLayer, `AI ${label}`);
      setStatusMessage(`${label} complete — result added as a new layer`);
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.message === 'Aborted') {
        setStatusMessage(`${label} cancelled`);
      } else {
        console.error('AI generation failed:', error);
        setStatusMessage(`${label} failed: ${error?.message || error}`);
      }
    } finally {
      if (aiAbortController.current === controller) aiAbortController.current = null;
      setAiBusy(null);
    }
  }, [addLayer, setStatusMessage]);

  const handleAIGenerate = (prompt: string) => runAI('Generative Fill', (img, signal) => generateImageEdit(img, prompt, undefined, signal));

  // ---------- Menu actions ----------
  const handleAction = (action: string) => {
    const actions: Record<string, () => void> = {
      'File:New': handleNewProject,
      'File:Open': () => { void handleOpenProject(); },
      'File:Save': handleSaveProject,
      'File:Import Asset': () => { void handleImportAsset(); },
      'File:Export': () => setIsExportModalOpen(true),
      'File:Export PNG Frame': () => handleExportSnapshot('png'),
      'File:Export JPG Frame': () => handleExportSnapshot('jpg'),
      'Edit:Undo': undo,
      'Edit:Redo': redo,
      'Edit:Duplicate': () => duplicateLayer(),
      'Edit:Select All': () => useStore.getState().setSelectedLayerIds(layers.filter(l => l.type !== 'audio').map(l => l.id)),
      'Edit:Deselect': () => { selectLayer(null); setSelection({ active: false, type: null, points: [] }); },
      'Edit:Fill': () => setSelectedTool('gradient'),
      'Image:Adjustments': () => setActiveSidebarTab('properties'),
      'Image:Curves': () => setActiveSidebarTab('properties'),
      'Image:Chroma Key': () => setActiveSidebarTab('properties'),
      'Image:Merge Visible': () => { void handleMergeVisible(); },
      'Layer:New Layer': handleAddLayer,
      'Layer:Delete Layer': deleteSelectedLayers,
      'Layer:Duplicate Layer': () => duplicateLayer(),
      'Layer:Group Layers': groupLayers,
      'Layer:Merge Visible': () => { void handleMergeVisible(); },
      'Layer:Add Text Animator': () => addTextAnimatorLayer(),
      'Layer:Layer Styles': () => setActiveSidebarTab('properties'),
      'Motion:Keyframing': () => { setShowTimeline(true); setTimelineViewMode('timeline'); setActiveSidebarTab('motion'); },
      'Motion:Graph Editor': () => { setShowTimeline(true); setTimelineViewMode('graph'); },
      'Motion:Easing Editor': () => useStore.getState().openEasingEditor({ layerId: selectedLayerId || undefined }),
      'Motion:Motion Paths': () => setSelectedTool('motion-path'),
      'Motion:Add Keyframe': () => useStore.getState().addKeyframe(),
      'Typography:Kinetic Text': () => addTextAnimatorLayer(),
      'Typography:3D Text Engine': () => addTextLayer(true, 400, 400),
      'Typography:Text Layer': () => addTextLayer(false, 400, 400),
      'AI:Generative Fill': () => setIsAIModalOpen(true),
      'AI:Sky Replacement': () => { void runAI('Sky Replacement', (img, signal) => replaceSky(img, undefined, signal)); },
      'AI:Enhance': () => { void runAI('Enhance', (img, signal) => enhanceImage(img, signal)); },
      'AI:Auto-Animate': () => setActiveSidebarTab('properties'),
      'Window:Layers': () => setActiveSidebarTab('layers'),
      'Window:Properties': () => setActiveSidebarTab('properties'),
      'Window:History': () => setActiveSidebarTab('history'),
      'Window:Motion': () => setActiveSidebarTab('motion'),
      'Window:Timeline': () => setShowTimeline(!showTimeline),
      'View:Zoom In': () => setZoom(zoom * 1.2),
      'View:Zoom Out': () => setZoom(zoom / 1.2),
      'View:Reset Zoom': () => { setZoom(1); setPan({ x: 40, y: 40 }); },
      'View:Fit to Screen': () => canvasRef.current?.fitToScreen(),
      'Help:Shortcuts': () => setIsShortcutsModalOpen(true),
    };

    const fn = actions[action];
    if (fn) fn();
    else setStatusMessage(`"${action.split(':')[1]}" is not available yet`);
  };

  const selectedLayer = layers.find(l => l.id === selectedLayerId);
  const docBytes = estimateDocBytes(layers);

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
          setPan={setPan}
          setZoom={setZoom}
        />

        <Sidebar />
      </div>

      {showTimeline && <Timeline />}

      {/* Footer / Status Bar */}
      <div className="h-6 bg-[#1a1a1a] border-t border-[#0a0a0a] flex items-center px-4 justify-between text-[10px] text-gray-500 shrink-0">
        <div className="flex gap-4 items-center">
          <span>{DOC_WIDTH} × {DOC_HEIGHT} px</span>
          <span>RGB / 8</span>
          <span>{fps} fps · {duration}s</span>
          <span title="Approximate uncompressed pixel memory across raster layers">Doc: {formatBytes(docBytes)}</span>
          <span>{layers.length} layer{layers.length === 1 ? '' : 's'}{selectedLayerIds.length > 1 ? ` · ${selectedLayerIds.length} selected` : selectedLayer ? ` · ${selectedLayer.name}` : ''}</span>
          <span>History {historyIndex + 1}/{historyLength}</span>
        </div>
        <div className="flex gap-4 items-center">
          {aiBusy && (
            <button onClick={() => aiAbortController.current?.abort()} className="text-amber-400 hover:text-amber-300 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> {aiBusy}… (click to cancel)
            </button>
          )}
          <span className="text-gray-400 truncate max-w-[520px]">{statusMessage}</span>
        </div>
      </div>

      <AIModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        onGenerate={handleAIGenerate}
      />

      <EasingEditorModal />
      <ExportModal canvasRef={canvasRef} />
      <KeyboardShortcutsModal />
      <AutoSaveRecoveryBanner />
    </div>
  );
}
