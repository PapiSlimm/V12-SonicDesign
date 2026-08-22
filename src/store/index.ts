import { create } from 'zustand';
import { Layer, Tool, MotionPath, Adjustments, BlendMode, Transform, ThemeSettings, ProjectTemplate, Asset, AssetFolder, Keyframe, LayerStyles } from '../core/types';
import { LayerFactory } from '../core/layers/LayerFactory';

interface AppState {
  layers: Layer[];
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  selectedTool: Tool;
  zoom: number;
  pan: { x: number; y: number };
  brushSize: number;
  brushOpacity: number;
  brushColor: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackSpeed: number;
  motionPaths: MotionPath[];
  history: Layer[][];
  historyIndex: number;
  isBatchingHistory: boolean;
  historyBatch: Layer[] | null;
  theme: ThemeSettings;
  templates: ProjectTemplate[];
  assets: Asset[];
  assetFolders: AssetFolder[];
  selection: {
    type: 'marquee' | 'lasso' | null;
    points: { x: number; y: number }[];
    active: boolean;
    feather: number;
    style: 'normal' | 'fixed-ratio' | 'fixed-size';
    aspectRatio: number;
    fixedWidth: number;
    fixedHeight: number;
  };
  gradientOptions: {
    angle: number;
    type: 'linear' | 'radial' | 'conic';
    colors: string[];
  };

  // Easing Editor Modal State
  isEasingEditorOpen: boolean;
  editingKeyframeTarget: {
    layerId?: string;
    property?: string;
    keyframeIndex?: number;
  } | null;

  // Workspace Layout State
  currentWorkspace: string;
  customWorkspaces: { name: string; sidebarTab: 'layers' | 'properties' | 'history' | 'motion'; showTimeline: boolean; timelineViewMode: 'timeline' | 'graph' }[];
  activeSidebarTab: 'layers' | 'properties' | 'history' | 'motion';
  showTimeline: boolean;
  timelineViewMode: 'timeline' | 'graph';

  // Onion Skinning State
  onionSkinEnabled: boolean;
  onionSkinSettings: {
    prevOffset: number;
    nextOffset: number;
    opacity: number;
  };

  // Preview Blend Mode (Hover effect)
  previewBlendMode: { layerId: string; mode: BlendMode } | null;

  // Smart Guides State
  smartGuidesEnabled: boolean;

  // Export Modal & Custom Frame Range State
  isExportModalOpen: boolean;
  exportFrameRange: {
    startSec: number;
    endSec: number;
    fps: number;
    format: 'png' | 'jpg' | 'webm' | 'gif_frames';
  };

  // Solo Layer State
  soloLayerId: string | null;
  toggleSoloLayer: (id: string) => void;

  // Shortcuts Modal State
  isShortcutsModalOpen: boolean;
  setIsShortcutsModalOpen: (open: boolean) => void;

  // Color Swatches & Global Color Variables State
  colorSwatches: string[];
  globalColorVariables: { id: string; name: string; value: string }[];
  expandedGroupIds: string[];

  // Actions
  addColorSwatch: (color: string) => void;
  removeColorSwatch: (color: string) => void;
  addGlobalColorVariable: (name: string, value: string) => void;
  updateGlobalColorVariable: (id: string, value: string) => void;
  removeGlobalColorVariable: (id: string) => void;
  toggleGroupExpand: (groupId: string) => void;
  moveLayerToGroup: (layerId: string, groupId: string | null) => void;
  toggleGroupVisibility: (groupId: string) => void;
  toggleGroupLock: (groupId: string) => void;

  setIsEasingEditorOpen: (open: boolean) => void;
  openEasingEditor: (target?: { layerId?: string; property?: string; keyframeIndex?: number } | null) => void;
  updateKeyframeEasing: (layerId: string, property: string, keyframeIndex: number, easing: Keyframe['easing'], bezierPoints?: Keyframe['bezierPoints']) => void;
  updateAllKeyframesEasing: (layerId: string, easing: Keyframe['easing'], bezierPoints?: Keyframe['bezierPoints']) => void;
  setWorkspace: (name: string) => void;
  saveCustomWorkspace: (name: string) => void;
  setActiveSidebarTab: (tab: 'layers' | 'properties' | 'history' | 'motion') => void;
  setShowTimeline: (show: boolean) => void;
  setTimelineViewMode: (mode: 'timeline' | 'graph') => void;
  toggleOnionSkin: () => void;
  setOnionSkinSettings: (settings: Partial<AppState['onionSkinSettings']>) => void;
  setPreviewBlendMode: (data: { layerId: string; mode: BlendMode } | null) => void;
  setSmartGuidesEnabled: (enabled: boolean) => void;
  setIsExportModalOpen: (open: boolean) => void;
  setExportFrameRange: (range: Partial<AppState['exportFrameRange']>) => void;
  setLayers: (layers: Layer[]) => void;
  setSelectedLayerId: (id: string | null) => void;
  setSelectedLayerIds: (ids: string[]) => void;
  setSelectedTool: (tool: Tool) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
  setBrushColor: (color: string) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  setMotionPaths: (paths: MotionPath[]) => void;
  setTheme: (theme: Partial<ThemeSettings>) => void;
  setSelection: (selection: Partial<AppState['selection']>) => void;
  setGradientOptions: (options: Partial<AppState['gradientOptions']>) => void;
  updateLayerStyle: (id: string, styleType: keyof LayerStyles, updates: any) => void;
  
  // Complex Actions
  addLayer: (layer: Layer) => void;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  deleteLayer: (id: string) => void;
  recordHistory: (layers: Layer[]) => void;
  undo: () => void;
  redo: () => void;
  startHistoryTransaction: () => void;
  endHistoryTransaction: () => void;
  groupLayers: () => void;
  setMask: () => void;
  moveLayer: (id: string, direction: 'up' | 'down') => void;
  addAdjustmentLayer: () => void;
  addClonerLayer: () => void;
  addShapeLayer: (type: 'rectangle' | 'circle') => void;
  addTextLayer: (is3D?: boolean, x?: number, y?: number) => void;
  addVectorLayer: (initialPoint?: { x: number; y: number }) => void;
  addMotionPath: () => void;
  applyKineticPreset: (preset: string) => void;
  addKeyframe: (layerId?: string, property?: string, keyframe?: Keyframe) => void;
  addTextAnimatorLayer: (x?: number, y?: number) => void;
  updateKeyframeTime: (layerId: string, property: string, keyframeIndex: number, newTime: number) => void;
  addAudioLayer: (src: string, name?: string, peaks?: number[], duration?: number) => void;
  toggleLayerVisibility: (id: string) => void;
  setAdjustments: (adjustments: Adjustments) => void;
  setBlendMode: (mode: BlendMode) => void;
}

export const useStore = create<AppState>((set, get) => ({
  layers: [
    LayerFactory.createRasterLayer('Background'),
    {
      ...LayerFactory.createTextLayer('V12Sonic Text', false, 400, 400),
      id: 'layer-text-1',
      adjustments: {
        ...LayerFactory.createDefaultAdjustments(),
        brightness: 100
      },
      content: 'V12SonicDesign Studio',
      fontSettings: {
        family: 'Space Grotesk',
        size: 72,
        weight: 'bold',
        color: '#3b82f6',
        tracking: 2,
        leading: 1.2
      }
    }
  ],
  selectedLayerId: 'layer-text-1',
  selectedLayerIds: ['layer-text-1'],
  selectedTool: 'move',
  zoom: 0.5,
  pan: { x: 0, y: 0 },
  brushSize: 20,
  brushOpacity: 1,
  brushColor: '#ffffff',
  currentTime: 0,
  duration: 60,
  isPlaying: false,
  playbackSpeed: 1,
  motionPaths: [],
  history: [],
  historyIndex: -1,
  isBatchingHistory: false,
  historyBatch: null,
  theme: {
    mode: 'dark',
    accentColor: '#3b82f6',
    uiFont: 'Inter'
  },
  templates: [],
  assets: [],
  assetFolders: [],
  selection: {
    type: null,
    points: [],
    active: false,
    feather: 0,
    style: 'normal',
    aspectRatio: 1,
    fixedWidth: 100,
    fixedHeight: 100
  },
  gradientOptions: {
    angle: 0,
    type: 'linear',
    colors: ['#000000', '#ffffff']
  },

  isEasingEditorOpen: false,
  editingKeyframeTarget: null,

  // Workspace Layout State
  currentWorkspace: 'Standard Studio',
  customWorkspaces: [],
  activeSidebarTab: 'layers',
  showTimeline: true,
  timelineViewMode: 'timeline',

  // Onion Skinning State
  onionSkinEnabled: false,
  onionSkinSettings: {
    prevOffset: 0.1,
    nextOffset: 0.1,
    opacity: 0.35,
  },

  // Preview Blend Mode
  previewBlendMode: null,

  // Smart Guides State
  smartGuidesEnabled: true,

  // Export Modal State
  isExportModalOpen: false,
  exportFrameRange: {
    startSec: 0,
    endSec: 10,
    fps: 30,
    format: 'png'
  },

  // Solo Layer State
  soloLayerId: null,
  toggleSoloLayer: (id: string) => set((state) => ({ soloLayerId: state.soloLayerId === id ? null : id })),

  // Shortcuts Modal State
  isShortcutsModalOpen: false,

  // Color Swatches & Global Color Variables Default State
  colorSwatches: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ffffff', '#000000', '#06b6d4', '#f97316'],
  globalColorVariables: [
    { id: 'var-1', name: 'Primary Accent', value: '#3b82f6' },
    { id: 'var-2', name: 'Brand Gold', value: '#f59e0b' }
  ],
  expandedGroupIds: [],

  addColorSwatch: (color) => set((state) => {
    if (state.colorSwatches.includes(color)) return state;
    return { colorSwatches: [...state.colorSwatches, color] };
  }),

  removeColorSwatch: (color) => set((state) => ({
    colorSwatches: state.colorSwatches.filter(c => c !== color)
  })),

  addGlobalColorVariable: (name, value) => set((state) => ({
    globalColorVariables: [
      ...state.globalColorVariables,
      { id: `var-${Date.now()}`, name, value }
    ]
  })),

  updateGlobalColorVariable: (id, value) => set((state) => ({
    globalColorVariables: state.globalColorVariables.map(v => v.id === id ? { ...v, value } : v)
  })),

  removeGlobalColorVariable: (id) => set((state) => ({
    globalColorVariables: state.globalColorVariables.filter(v => v.id !== id)
  })),

  toggleGroupExpand: (groupId) => set((state) => {
    const isExpanded = state.expandedGroupIds.includes(groupId);
    return {
      expandedGroupIds: isExpanded
        ? state.expandedGroupIds.filter(id => id !== groupId)
        : [...state.expandedGroupIds, groupId]
    };
  }),

  moveLayerToGroup: (layerId, groupId) => set((state) => {
    const newLayers = state.layers.map(l => {
      if (l.id === layerId) {
        return { ...l, parentId: groupId || undefined };
      }
      if (l.type === 'group' && l.id === groupId) {
        const existingChildren = l.children || [];
        if (!existingChildren.includes(layerId)) {
          return { ...l, children: [...existingChildren, layerId] };
        }
      }
      return l;
    });
    get().recordHistory(newLayers);
    return { layers: newLayers };
  }),

  toggleGroupVisibility: (groupId) => set((state) => {
    const groupLayer = state.layers.find(l => l.id === groupId);
    if (!groupLayer) return state;
    const newVis = !groupLayer.visible;

    // Toggle group and all nested children
    const newLayers = state.layers.map(l => {
      if (l.id === groupId || l.parentId === groupId) {
        return { ...l, visible: newVis };
      }
      return l;
    });
    return { layers: newLayers };
  }),

  toggleGroupLock: (groupId) => set((state) => {
    const groupLayer = state.layers.find(l => l.id === groupId);
    if (!groupLayer) return state;
    const newLocked = !groupLayer.locked;

    // Toggle group and all nested children lock
    const newLayers = state.layers.map(l => {
      if (l.id === groupId || l.parentId === groupId) {
        return { ...l, locked: newLocked };
      }
      return l;
    });
    return { layers: newLayers };
  }),

  setIsShortcutsModalOpen: (isShortcutsModalOpen) => set({ isShortcutsModalOpen }),

  setIsEasingEditorOpen: (isEasingEditorOpen) => set({ isEasingEditorOpen }),
  openEasingEditor: (target) => set({ isEasingEditorOpen: true, editingKeyframeTarget: target || null }),
  setActiveSidebarTab: (activeSidebarTab) => set({ activeSidebarTab }),
  setShowTimeline: (showTimeline) => set({ showTimeline }),
  setTimelineViewMode: (timelineViewMode) => set({ timelineViewMode }),

  toggleOnionSkin: () => set((state) => ({ onionSkinEnabled: !state.onionSkinEnabled })),
  setOnionSkinSettings: (settings) => set((state) => ({
    onionSkinSettings: { ...state.onionSkinSettings, ...settings }
  })),
  setPreviewBlendMode: (previewBlendMode) => set({ previewBlendMode }),
  setSmartGuidesEnabled: (smartGuidesEnabled) => set({ smartGuidesEnabled }),
  setIsExportModalOpen: (isExportModalOpen) => set({ isExportModalOpen }),
  setExportFrameRange: (range) => set((state) => ({
    exportFrameRange: { ...state.exportFrameRange, ...range }
  })),

  setWorkspace: (name) => set((state) => {
    let tab: 'layers' | 'properties' | 'history' | 'motion' = 'layers';
    let showTl = true;
    let mode: 'timeline' | 'graph' = 'timeline';

    if (name === 'Animation') {
      tab = 'motion';
      showTl = true;
      mode = 'timeline';
    } else if (name === 'Compositing') {
      tab = 'properties';
      showTl = true;
      mode = 'graph';
    } else if (name === 'Editing') {
      tab = 'layers';
      showTl = false;
      mode = 'timeline';
    } else if (name === 'Standard Studio') {
      tab = 'layers';
      showTl = true;
      mode = 'timeline';
    } else {
      const custom = state.customWorkspaces.find(w => w.name === name);
      if (custom) {
        tab = custom.sidebarTab;
        showTl = custom.showTimeline;
        mode = custom.timelineViewMode;
      }
    }

    return {
      currentWorkspace: name,
      activeSidebarTab: tab,
      showTimeline: showTl,
      timelineViewMode: mode
    };
  }),

  saveCustomWorkspace: (name) => set((state) => {
    if (!name.trim()) return state;
    const newCustom = {
      name: name.trim(),
      sidebarTab: state.activeSidebarTab,
      showTimeline: state.showTimeline,
      timelineViewMode: state.timelineViewMode
    };
    const updatedCustoms = [...state.customWorkspaces.filter(w => w.name !== newCustom.name), newCustom];
    return {
      currentWorkspace: newCustom.name,
      customWorkspaces: updatedCustoms
    };
  }),
  updateKeyframeEasing: (layerId, property, keyframeIndex, easing, bezierPoints) => set((state) => {
    const layer = state.layers.find(l => l.id === layerId);
    if (!layer || !layer.animations || !layer.animations[property]) return state;

    const newAnimations = { ...layer.animations };
    const kfs = [...newAnimations[property].keyframes];

    if (keyframeIndex >= 0 && keyframeIndex < kfs.length) {
      kfs[keyframeIndex] = { ...kfs[keyframeIndex], easing, bezierPoints };
    } else {
      for (let i = 0; i < kfs.length; i++) {
        kfs[i] = { ...kfs[i], easing, bezierPoints };
      }
    }

    newAnimations[property] = { ...newAnimations[property], keyframes: kfs };
    const newLayers = state.layers.map(l => l.id === layerId ? { ...l, animations: newAnimations } : l);
    get().recordHistory(newLayers);
    return { layers: newLayers };
  }),

  updateAllKeyframesEasing: (layerId, easing, bezierPoints) => set((state) => {
    const layer = state.layers.find(l => l.id === layerId);
    if (!layer || !layer.animations) return state;

    const newAnimations = { ...layer.animations };
    Object.keys(newAnimations).forEach(prop => {
      const kfs = newAnimations[prop].keyframes.map(kf => ({ ...kf, easing, bezierPoints }));
      newAnimations[prop] = { ...newAnimations[prop], keyframes: kfs };
    });

    const newLayers = state.layers.map(l => l.id === layerId ? { ...l, animations: newAnimations } : l);
    get().recordHistory(newLayers);
    return { layers: newLayers };
  }),

  setLayers: (layers) => set({ layers }),
  setSelectedLayerId: (selectedLayerId) => set({ selectedLayerId }),
  setSelectedLayerIds: (selectedLayerIds) => set({ selectedLayerIds }),
  setSelectedTool: (selectedTool) => set({ selectedTool }),
  setZoom: (zoom) => set({ zoom }),
  setPan: (pan) => set({ pan }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setBrushOpacity: (brushOpacity) => set({ brushOpacity }),
  setBrushColor: (brushColor) => set({ brushColor }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setMotionPaths: (motionPaths) => set({ motionPaths }),
  setTheme: (theme) => set((state) => ({ theme: { ...state.theme, ...theme } })),
  setSelection: (selection) => set((state) => ({ selection: { ...state.selection, ...selection } })),
  setGradientOptions: (gradientOptions) => set((state) => ({ gradientOptions: { ...state.gradientOptions, ...gradientOptions } })),
  updateLayerStyle: (id, styleType, updates) => set((state) => {
    const newLayers = state.layers.map(l => {
      if (l.id === id) {
        const newStyles = { ...(l.layerStyles || {}) };
        newStyles[styleType] = { ...(newStyles[styleType] || {}), ...updates };
        return { ...l, layerStyles: newStyles };
      }
      return l;
    });
    return { layers: newLayers };
  }),

  addLayer: (layer) => set((state) => {
    const newLayers = [...state.layers, layer];
    get().recordHistory(newLayers);
    return { layers: newLayers };
  }),

  updateLayer: (id, updates) => set((state) => {
    const newLayers = state.layers.map((l) => (l.id === id ? { ...l, ...updates } : l));
    return { layers: newLayers };
  }),

  deleteLayer: (id) => set((state) => {
    const newLayers = state.layers.filter((l) => l.id !== id);
    get().recordHistory(newLayers);
    return { layers: newLayers };
  }),

  recordHistory: (layers) => set((state) => {
    if (state.isBatchingHistory) {
      return { historyBatch: layers };
    }
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    try {
      newHistory.push(structuredClone(layers));
    } catch (e) {
      console.warn('History: falling back to shallow clone due to non-serializable data', e);
      newHistory.push([...layers]);
    }
    if (newHistory.length > 50) newHistory.shift();
    return {
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  }),

  startHistoryTransaction: () => set({ isBatchingHistory: true, historyBatch: null }),
  endHistoryTransaction: () => set((state) => {
    if (state.historyBatch) {
      get().recordHistory(state.historyBatch);
    }
    return { isBatchingHistory: false, historyBatch: null };
  }),

  undo: () => set((state) => {
    if (state.historyIndex > 0) {
      const newIndex = state.historyIndex - 1;
      return {
        layers: state.history[newIndex],
        historyIndex: newIndex
      };
    }
    return state;
  }),

  redo: () => set((state) => {
    if (state.historyIndex < state.history.length - 1) {
      const newIndex = state.historyIndex + 1;
      return {
        layers: state.history[newIndex],
        historyIndex: newIndex
      };
    }
    return state;
  }),

  groupLayers: () => set((state) => {
    const selectedLayers = state.layers.filter(l => state.selectedLayerIds.includes(l.id));
    if (selectedLayers.length === 0) {
      const folderCount = state.layers.filter(l => l.type === 'group').length + 1;
      const newGroup = LayerFactory.createGroupLayer(`Folder ${folderCount}`, []);
      const newLayers = [...state.layers, newGroup];
      get().recordHistory(newLayers);
      return { 
        layers: newLayers, 
        selectedLayerId: newGroup.id, 
        selectedLayerIds: [newGroup.id],
        expandedGroupIds: [...state.expandedGroupIds, newGroup.id]
      };
    }

    const newGroup = LayerFactory.createGroupLayer('New Group', selectedLayers.map(l => l.id));
    const groupId = newGroup.id;
    const newLayers = [newGroup, ...state.layers.map(l => selectedLayers.find(sl => sl.id === l.id) ? { ...l, parentId: groupId } : l)];
    get().recordHistory(newLayers);
    return { 
      layers: newLayers, 
      selectedLayerId: groupId, 
      selectedLayerIds: [groupId],
      expandedGroupIds: [...state.expandedGroupIds, groupId]
    };
  }),

  setMask: () => set((state) => {
    if (!state.selectedLayerId) return state;
    const index = state.layers.findIndex(l => l.id === state.selectedLayerId);
    if (index >= state.layers.length - 1) return state;

    const targetLayer = state.layers[index + 1];
    const newLayers = state.layers.map(l => l.id === targetLayer.id ? { ...l, maskId: state.selectedLayerId! } : l);
    get().recordHistory(newLayers);
    return { layers: newLayers };
  }),

  moveLayer: (id, direction) => set((state) => {
    const index = state.layers.findIndex(l => l.id === id);
    if (index === -1) return state;
    if (direction === 'up' && index === state.layers.length - 1) return state;
    if (direction === 'down' && index === 0) return state;

    const newLayers = [...state.layers];
    const targetIndex = direction === 'up' ? index + 1 : index - 1;
    [newLayers[index], newLayers[targetIndex]] = [newLayers[targetIndex], newLayers[index]];
    get().recordHistory(newLayers);
    return { layers: newLayers };
  }),

  addAdjustmentLayer: () => set((state) => {
    const newLayer = LayerFactory.createAdjustmentLayer(`Adjustment ${state.layers.length + 1}`);
    const newLayers = [...state.layers, newLayer];
    get().recordHistory(newLayers);
    return { layers: newLayers, selectedLayerId: newLayer.id };
  }),

  addClonerLayer: () => set((state) => {
    const newLayer: Layer = {
      id: `cloner-${Date.now()}`,
      name: `Cloner ${state.layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      adjustments: { 
        brightness: 100, contrast: 100, saturation: 100, hue: 0, opacity: 1,
        curves: { rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }], red: [{ x: 0, y: 0 }, { x: 255, y: 255 }], green: [{ x: 0, y: 0 }, { x: 255, y: 255 }], blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }] },
        chromaKey: { enabled: false, targetColor: '#00ff00', similarity: 30, smoothness: 10, spillSuppression: 20, edgeFeather: 0 }
      },
      bitmap: null,
      type: 'cloner',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      clonerSettings: {
        count: 5,
        mode: 'linear',
        offset: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
        randomness: { x: 0, y: 0, scaleX: 0, scaleY: 0, rotation: 0 },
        step: 100
      }
    };
    const newLayers = [...state.layers, newLayer];
    get().recordHistory(newLayers);
    return { layers: newLayers, selectedLayerId: newLayer.id };
  }),

  addShapeLayer: (type) => set((state) => {
    const newLayer = LayerFactory.createShapeLayer(`${type.charAt(0).toUpperCase() + type.slice(1)} ${state.layers.length + 1}`, type);
    const newLayers = [...state.layers, newLayer];
    get().recordHistory(newLayers);
    return { layers: newLayers, selectedLayerId: newLayer.id };
  }),

  addTextLayer: (is3D = false, x = 200, y = 200) => set((state) => {
    const newLayer = LayerFactory.createTextLayer(`${is3D ? '3D ' : ''}Text ${state.layers.length + 1}`, is3D, x, y);
    const newLayers = [...state.layers, newLayer];
    get().recordHistory(newLayers);
    return { layers: newLayers, selectedLayerId: newLayer.id };
  }),

  addTextAnimatorLayer: (x = 400, y = 400) => set((state) => {
    const newLayer: Layer = {
      id: `text-anim-${Date.now()}`,
      name: `Text Animator ${state.layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      adjustments: LayerFactory.createDefaultAdjustments(),
      bitmap: null,
      type: 'text', // Using 'text' as base but with animator settings
      transform: LayerFactory.createDefaultTransform(x, y),
      content: 'ANIMATED TEXT',
      fontSettings: {
        family: 'Space Grotesk',
        size: 64,
        weight: 'black',
        color: '#ffffff'
      },
      textAnimatorSettings: {
        text: 'ANIMATED TEXT',
        animationType: 'wave',
        range: { start: 0, end: 1 },
        offset: 0,
        smoothness: 0.5,
        speed: 1.5
      }
    };
    const newLayers = [...state.layers, newLayer];
    get().recordHistory(newLayers);
    return { layers: newLayers, selectedLayerId: newLayer.id };
  }),

  addVectorLayer: (initialPoint?: { x: number; y: number }) => set((state) => {
    const pts = initialPoint ? [{ x: initialPoint.x, y: initialPoint.y }] : [
      { x: 400, y: 500, handleOut: { x: 550, y: 400 } },
      { x: 700, y: 600, handleIn: { x: 600, y: 700 }, handleOut: { x: 800, y: 500 } },
      { x: 1000, y: 450, handleIn: { x: 900, y: 400 } }
    ];

    const newLayer: Layer = {
      id: `vector-${Date.now()}`,
      name: `Vector Path ${state.layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      adjustments: { 
        brightness: 100, contrast: 100, saturation: 100, hue: 0, opacity: 1,
        curves: { rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }], red: [{ x: 0, y: 0 }, { x: 255, y: 255 }], green: [{ x: 0, y: 0 }, { x: 255, y: 255 }], blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }] },
        chromaKey: { enabled: false, targetColor: '#00ff00', similarity: 30, smoothness: 10, spillSuppression: 20, edgeFeather: 0 }
      },
      bitmap: null,
      type: 'vector',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      vectorSettings: {
        points: pts,
        closed: false,
        stroke: '#3b82f6',
        strokeWidth: 4,
        fill: '#3b82f640',
        fillEnabled: true,
        strokeEnabled: true,
        lineCap: 'round',
        lineJoin: 'round',
        pathProgress: 1
      }
    };
    const newLayers = [...state.layers, newLayer];
    get().recordHistory(newLayers);
    return { layers: newLayers, selectedLayerId: newLayer.id };
  }),

  addMotionPath: () => set((state) => {
    const newPath: MotionPath = {
      id: `path-${Date.now()}`,
      points: [{ x: 100, y: 100 }, { x: 300, y: 300 }],
      closed: false
    };
    const newPaths = [...state.motionPaths, newPath];
    return { motionPaths: newPaths };
  }),

  applyKineticPreset: (preset) => set((state) => {
    if (!state.selectedLayerId) return state;
    const layer = state.layers.find(l => l.id === state.selectedLayerId);
    if (!layer || (layer.type !== 'text' && layer.type !== '3d-text')) return state;

    const newAnimations = { ...(layer.animations || {}) };
    const time = state.currentTime;

    if (preset === 'Fluid Morph') {
      newAnimations['scaleX'] = {
        keyframes: [
          { time: time, value: 1, easing: 'ease-in-out' },
          { time: time + 1, value: 1.5, easing: 'ease-in-out' },
          { time: time + 2, value: 1, easing: 'ease-in-out' }
        ],
        currentValue: 1
      };
    } else if (preset === 'Scrolling') {
      newAnimations['x'] = {
        keyframes: [
          { time: time, value: -100, easing: 'linear' },
          { time: time + 5, value: 1000, easing: 'linear' }
        ],
        currentValue: -100
      };
    } else if (preset === 'Glitch') {
      newAnimations['x'] = {
        keyframes: [
          { time: time, value: layer.transform.x, easing: 'snap' },
          { time: time + 0.1, value: layer.transform.x + 10, easing: 'snap' },
          { time: time + 0.2, value: layer.transform.x - 10, easing: 'snap' },
          { time: time + 0.3, value: layer.transform.x, easing: 'snap' }
        ],
        currentValue: layer.transform.x
      };
    } else if (preset === 'Typewriter') {
      // For typewriter, we might animate a custom property or just use a preset timing
      // Here we'll mock it by animating opacity or just setting a flag
      newAnimations['opacity'] = {
        keyframes: [
          { time: time, value: 0, easing: 'snap' },
          { time: time + 2, value: 1, easing: 'linear' }
        ],
        currentValue: 1
      };
    }

    const newLayers = state.layers.map(l => l.id === state.selectedLayerId ? { ...l, animations: newAnimations } : l);
    get().recordHistory(newLayers);
    return { layers: newLayers };
  }),

  addKeyframe: (layerId?: string, property?: string, keyframe?: Keyframe) => set((state) => {
    const targetId = layerId || state.selectedLayerId;
    if (!targetId) return state;
    const layer = state.layers.find(l => l.id === targetId);
    if (!layer) return state;

    const newAnimations = { ...(layer.animations || {}) };
    
    if (property && keyframe) {
      if (!newAnimations[property]) {
        newAnimations[property] = { keyframes: [], currentValue: (layer.transform as any)[property] || 0 };
      }
      const existing = newAnimations[property].keyframes.find(k => Math.abs(k.time - keyframe.time) < 0.01);
      if (existing) {
        existing.value = keyframe.value;
        existing.easing = keyframe.easing;
      } else {
        newAnimations[property].keyframes.push(keyframe);
        newAnimations[property].keyframes.sort((a, b) => a.time - b.time);
      }
    } else {
      const props: (keyof Transform)[] = ['x', 'y', 'scaleX', 'scaleY', 'rotation'];
      props.forEach(prop => {
        if (!newAnimations[prop]) {
          newAnimations[prop] = { keyframes: [], currentValue: layer.transform[prop] };
        }
        const existing = newAnimations[prop].keyframes.find(k => Math.abs(k.time - state.currentTime) < 0.01);
        if (existing) {
          existing.value = layer.transform[prop];
        } else {
          newAnimations[prop].keyframes.push({
            time: state.currentTime,
            value: layer.transform[prop],
            easing: 'linear'
          });
          newAnimations[prop].keyframes.sort((a, b) => a.time - b.time);
        }
      });
    }

    const newLayers = state.layers.map(l => l.id === targetId ? { ...l, animations: newAnimations } : l);
    get().recordHistory(newLayers);
    return { layers: newLayers };
  }),

  toggleLayerVisibility: (id) => set((state) => {
    const newLayers = state.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l);
    return { layers: newLayers };
  }),

  setAdjustments: (adjustments) => set((state) => {
    if (!state.selectedLayerId) return state;
    const newLayers = state.layers.map(l => l.id === state.selectedLayerId ? { ...l, adjustments } : l);
    return { layers: newLayers };
  }),

  setBlendMode: (blendMode) => set((state) => {
    if (!state.selectedLayerId) return state;
    const newLayers = state.layers.map(l => l.id === state.selectedLayerId ? { ...l, blendMode } : l);
    return { layers: newLayers };
  }),

  updateKeyframeTime: (layerId, property, keyframeIndex, newTime) => set((state) => {
    const layer = state.layers.find(l => l.id === layerId);
    if (!layer || !layer.animations || !layer.animations[property]) return state;

    const newAnimations = { ...layer.animations };
    const kfs = [...newAnimations[property].keyframes];
    if (keyframeIndex < 0 || keyframeIndex >= kfs.length) return state;

    kfs[keyframeIndex] = { ...kfs[keyframeIndex], time: Math.max(0, newTime) };
    kfs.sort((a, b) => a.time - b.time);

    newAnimations[property] = { ...newAnimations[property], keyframes: kfs };
    const newLayers = state.layers.map(l => l.id === layerId ? { ...l, animations: newAnimations } : l);
    get().recordHistory(newLayers);
    return { layers: newLayers };
  }),

  addAudioLayer: (src, name = 'Audio Track', peaks = [], duration = 10) => set((state) => {
    const newLayer: Layer = {
      id: `audio-${Date.now()}`,
      name: name,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      adjustments: LayerFactory.createDefaultAdjustments(),
      bitmap: null,
      type: 'audio',
      transform: LayerFactory.createDefaultTransform(0, 0),
      audioSettings: {
        src,
        volume: 1,
        muted: false,
        duration,
        peaks
      }
    };
    const newLayers = [...state.layers, newLayer];
    get().recordHistory(newLayers);
    return { layers: newLayers, selectedLayerId: newLayer.id };
  })
}));
