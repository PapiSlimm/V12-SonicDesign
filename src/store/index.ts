import { create } from 'zustand';
import { Layer, Tool, MotionPath, Adjustments, BlendMode, Transform, ThemeSettings, ProjectTemplate, Asset, AssetFolder, Keyframe, LayerStyles } from '../core/types';
import { LayerFactory } from '../core/layers/LayerFactory';
import { snapshotLayers, uid, collectDescendants } from '../core/layers/layerUtils';

export const MAX_HISTORY = 40;

export interface HistoryEntry {
  label: string;
  layers: Layer[];
}

export type SidebarTab = 'layers' | 'properties' | 'history' | 'motion';

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
  fps: number;
  isPlaying: boolean;
  playbackSpeed: number;
  motionPaths: MotionPath[];
  history: HistoryEntry[];
  historyIndex: number;
  isBatchingHistory: boolean;
  historyBatch: { layers: Layer[]; label: string } | null;
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
  customWorkspaces: { name: string; sidebarTab: SidebarTab; showTimeline: boolean; timelineViewMode: 'timeline' | 'graph' }[];
  activeSidebarTab: SidebarTab;
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

  // Status bar message
  statusMessage: string;
  setStatusMessage: (msg: string) => void;

  // Project meta
  projectName: string;
  setProjectName: (name: string) => void;
  dirty: boolean;

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
  setActiveSidebarTab: (tab: SidebarTab) => void;
  setShowTimeline: (show: boolean) => void;
  setTimelineViewMode: (mode: 'timeline' | 'graph') => void;
  toggleOnionSkin: () => void;
  setOnionSkinSettings: (settings: Partial<AppState['onionSkinSettings']>) => void;
  setPreviewBlendMode: (data: { layerId: string; mode: BlendMode } | null) => void;
  setSmartGuidesEnabled: (enabled: boolean) => void;
  setIsExportModalOpen: (open: boolean) => void;
  setExportFrameRange: (range: Partial<AppState['exportFrameRange']>) => void;
  setLayers: (layers: Layer[], label?: string) => void;
  setSelectedLayerId: (id: string | null) => void;
  setSelectedLayerIds: (ids: string[]) => void;
  selectLayer: (id: string | null, additive?: boolean) => void;
  setSelectedTool: (tool: Tool) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
  setBrushColor: (color: string) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setFps: (fps: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  setMotionPaths: (paths: MotionPath[]) => void;
  setTheme: (theme: Partial<ThemeSettings>) => void;
  setSelection: (selection: Partial<AppState['selection']>) => void;
  setGradientOptions: (options: Partial<AppState['gradientOptions']>) => void;
  updateLayerStyle: (id: string, styleType: keyof LayerStyles, updates: any) => void;

  // Complex Actions
  addLayer: (layer: Layer, label?: string) => void;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  /** Like updateLayer but records an undo step. Use for discrete edits (not for drags). */
  updateLayerCommitted: (id: string, updates: Partial<Layer>, label?: string) => void;
  deleteLayer: (id: string) => void;
  deleteSelectedLayers: () => void;
  duplicateLayer: (id?: string) => void;
  mergeVisibleLayers: (bitmap: ImageBitmap) => void;
  recordHistory: (layers: Layer[], label?: string) => void;
  undo: () => void;
  redo: () => void;
  jumpToHistory: (index: number) => void;
  startHistoryTransaction: () => void;
  endHistoryTransaction: (label?: string) => void;
  groupLayers: () => void;
  setMask: () => void;
  removeMask: (id: string) => void;
  moveLayer: (id: string, direction: 'up' | 'down') => void;
  reorderLayer: (id: string, targetIndex: number) => void;
  addAdjustmentLayer: () => void;
  addClonerLayer: () => void;
  addShapeLayer: (type: 'rectangle' | 'circle') => void;
  addTextLayer: (is3D?: boolean, x?: number, y?: number) => void;
  addVectorLayer: (initialPoint?: { x: number; y: number }) => void;
  addMotionPath: (points?: { x: number; y: number }[], assignToLayerId?: string | null) => void;
  applyKineticPreset: (preset: string) => void;
  addKeyframe: (layerId?: string, property?: string, keyframe?: Keyframe) => void;
  removeKeyframe: (layerId: string, property: string, keyframeIndex: number) => void;
  addTextAnimatorLayer: (x?: number, y?: number) => void;
  updateKeyframeTime: (layerId: string, property: string, keyframeIndex: number, newTime: number, commit?: boolean) => number;
  addAudioLayer: (src: string, name?: string, peaks?: number[], duration?: number) => void;
  toggleLayerVisibility: (id: string) => void;
  setAdjustments: (adjustments: Adjustments) => void;
  setBlendMode: (mode: BlendMode) => void;
  newProject: () => void;
  loadProject: (data: { layers: Layer[]; motionPaths?: MotionPath[]; duration?: number; fps?: number; projectName?: string; colorSwatches?: string[]; globalColorVariables?: AppState['globalColorVariables']; brushColor?: string }) => void;
  markSaved: () => void;
}

const KEYFRAMEABLE_PROPS: (keyof Transform)[] = ['x', 'y', 'scaleX', 'scaleY', 'rotation'];

function createInitialLayers(): Layer[] {
  return [
    LayerFactory.createRasterLayer('Background'),
    {
      ...LayerFactory.createTextLayer('V12Sonic Text', false, 560, 470),
      id: 'layer-text-1',
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
  ];
}

/** Build the history slice for a new committed state. */
function pushHistory(state: Pick<AppState, 'history' | 'historyIndex' | 'isBatchingHistory' | 'historyBatch'>, layers: Layer[], label: string) {
  if (state.isBatchingHistory) {
    return { historyBatch: { layers, label } };
  }
  const newHistory = state.history.slice(0, state.historyIndex + 1);
  newHistory.push({ label, layers: snapshotLayers(layers) });
  while (newHistory.length > MAX_HISTORY) newHistory.shift();
  return { history: newHistory, historyIndex: newHistory.length - 1, dirty: true };
}

/** Sort keyframes by time and return the index the given keyframe landed at. */
function sortKeyframes(kfs: Keyframe[], track: Keyframe): { sorted: Keyframe[]; index: number } {
  const sorted = [...kfs].sort((a, b) => a.time - b.time);
  return { sorted, index: sorted.indexOf(track) };
}

const initialLayers = createInitialLayers();

export const useStore = create<AppState>((set, get) => ({
  layers: initialLayers,
  selectedLayerId: 'layer-text-1',
  selectedLayerIds: ['layer-text-1'],
  selectedTool: 'move',
  zoom: 0.5,
  pan: { x: 40, y: 40 },
  brushSize: 20,
  brushOpacity: 1,
  brushColor: '#3b82f6',
  currentTime: 0,
  duration: 60,
  fps: 30,
  isPlaying: false,
  playbackSpeed: 1,
  motionPaths: [],
  history: [{ label: 'Open Project', layers: snapshotLayers(initialLayers) }],
  historyIndex: 0,
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
    colors: ['#3b82f6', '#8b5cf6']
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

  statusMessage: 'Ready',
  setStatusMessage: (statusMessage) => set({ statusMessage }),

  projectName: 'Untitled Project',
  setProjectName: (projectName) => set({ projectName, dirty: true }),
  dirty: false,

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
      { id: uid('var'), name, value }
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
    const target = state.layers.find(l => l.id === layerId);
    if (!target) return state;
    // Prevent moving a group into itself or one of its descendants
    if (groupId && (groupId === layerId || collectDescendants(state.layers, layerId).includes(groupId))) return state;

    const newLayers = state.layers.map(l => {
      if (l.id === layerId) {
        return { ...l, parentId: groupId || undefined };
      }
      if (l.type === 'group') {
        const children = l.children || [];
        if (l.id === groupId && !children.includes(layerId)) {
          return { ...l, children: [...children, layerId] };
        }
        if (l.id !== groupId && children.includes(layerId)) {
          return { ...l, children: children.filter(c => c !== layerId) };
        }
      }
      return l;
    });
    return { layers: newLayers, ...pushHistory(state, newLayers, groupId ? 'Move to Folder' : 'Remove from Folder') };
  }),

  toggleGroupVisibility: (groupId) => set((state) => {
    const groupLayer = state.layers.find(l => l.id === groupId);
    if (!groupLayer) return state;
    const newVis = !groupLayer.visible;
    const affected = new Set([groupId, ...collectDescendants(state.layers, groupId)]);
    const newLayers = state.layers.map(l => affected.has(l.id) ? { ...l, visible: newVis } : l);
    return { layers: newLayers, ...pushHistory(state, newLayers, newVis ? 'Show Group' : 'Hide Group') };
  }),

  toggleGroupLock: (groupId) => set((state) => {
    const groupLayer = state.layers.find(l => l.id === groupId);
    if (!groupLayer) return state;
    const newLocked = !groupLayer.locked;
    const affected = new Set([groupId, ...collectDescendants(state.layers, groupId)]);
    const newLayers = state.layers.map(l => affected.has(l.id) ? { ...l, locked: newLocked } : l);
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
    let tab: SidebarTab = 'layers';
    let showTl = true;
    let mode: 'timeline' | 'graph' = 'timeline';

    if (name === 'Animation') {
      tab = 'motion';
    } else if (name === 'Compositing') {
      tab = 'properties';
      mode = 'graph';
    } else if (name === 'Editing') {
      showTl = false;
    } else if (name !== 'Standard Studio') {
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
    let kfs = [...newAnimations[property].keyframes];

    if (keyframeIndex >= 0 && keyframeIndex < kfs.length) {
      kfs[keyframeIndex] = { ...kfs[keyframeIndex], easing, bezierPoints };
    } else {
      kfs = kfs.map(kf => ({ ...kf, easing, bezierPoints }));
    }

    newAnimations[property] = { ...newAnimations[property], keyframes: kfs };
    const newLayers = state.layers.map(l => l.id === layerId ? { ...l, animations: newAnimations } : l);
    return { layers: newLayers, ...pushHistory(state, newLayers, 'Change Easing') };
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
    return { layers: newLayers, ...pushHistory(state, newLayers, 'Change Easing (All)') };
  }),

  setLayers: (layers, label) => set((state) => ({ layers, ...(label ? pushHistory(state, layers, label) : { dirty: true }) })),
  setSelectedLayerId: (selectedLayerId) => set((state) => ({
    selectedLayerId,
    selectedLayerIds: selectedLayerId
      ? (state.selectedLayerIds.includes(selectedLayerId) && state.selectedLayerIds.length > 1 ? state.selectedLayerIds : [selectedLayerId])
      : []
  })),
  setSelectedLayerIds: (selectedLayerIds) => set((state) => ({
    selectedLayerIds,
    selectedLayerId: selectedLayerIds.length === 0
      ? null
      : (state.selectedLayerId && selectedLayerIds.includes(state.selectedLayerId) ? state.selectedLayerId : selectedLayerIds[selectedLayerIds.length - 1])
  })),
  selectLayer: (id, additive = false) => set((state) => {
    if (!id) return { selectedLayerId: null, selectedLayerIds: [] };
    if (!additive) return { selectedLayerId: id, selectedLayerIds: [id] };
    if (state.selectedLayerIds.includes(id)) {
      const remaining = state.selectedLayerIds.filter(i => i !== id);
      return { selectedLayerIds: remaining, selectedLayerId: remaining[remaining.length - 1] || null };
    }
    return { selectedLayerIds: [...state.selectedLayerIds, id], selectedLayerId: id };
  }),
  setSelectedTool: (selectedTool) => set({ selectedTool }),
  setZoom: (zoom) => set({ zoom: Math.min(20, Math.max(0.05, zoom)) }),
  setPan: (pan) => set({ pan }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setBrushOpacity: (brushOpacity) => set({ brushOpacity }),
  setBrushColor: (brushColor) => set({ brushColor }),
  setCurrentTime: (currentTime) => set((state) => ({ currentTime: Math.max(0, Math.min(state.duration, Number.isFinite(currentTime) ? currentTime : 0)) })),
  setDuration: (duration) => set((state) => {
    const d = Math.max(1, Number.isFinite(duration) ? duration : 60);
    return { duration: d, currentTime: Math.min(state.currentTime, d), dirty: true };
  }),
  setFps: (fps) => set({ fps: Math.max(1, Math.min(120, fps)) }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setMotionPaths: (motionPaths) => set({ motionPaths, dirty: true }),
  setTheme: (theme) => set((state) => ({ theme: { ...state.theme, ...theme } })),
  setSelection: (selection) => set((state) => ({ selection: { ...state.selection, ...selection } })),
  setGradientOptions: (gradientOptions) => set((state) => ({ gradientOptions: { ...state.gradientOptions, ...gradientOptions } })),
  updateLayerStyle: (id, styleType, updates) => set((state) => {
    const newLayers = state.layers.map(l => {
      if (l.id === id) {
        const newStyles: LayerStyles = { ...(l.layerStyles || {}) };
        (newStyles as any)[styleType] = { ...((newStyles as any)[styleType] || {}), ...updates };
        return { ...l, layerStyles: newStyles };
      }
      return l;
    });
    return { layers: newLayers, dirty: true };
  }),

  addLayer: (layer, label) => set((state) => {
    const newLayers = [...state.layers, layer];
    return {
      layers: newLayers,
      selectedLayerId: layer.id,
      selectedLayerIds: [layer.id],
      ...pushHistory(state, newLayers, label || `Add ${layer.name}`)
    };
  }),

  updateLayer: (id, updates) => set((state) => {
    let changed = false;
    const newLayers = state.layers.map((l) => {
      if (l.id !== id) return l;
      changed = true;
      return { ...l, ...updates };
    });
    if (!changed) return state;
    // Inside a transaction, remember that something changed so endHistoryTransaction records one undo step
    if (state.isBatchingHistory) return { layers: newLayers, dirty: true, historyBatch: { layers: newLayers, label: 'Edit Layer' } };
    return { layers: newLayers, dirty: true };
  }),

  updateLayerCommitted: (id, updates, label) => set((state) => {
    const target = state.layers.find(l => l.id === id);
    if (!target) return state;
    const newLayers = state.layers.map((l) => (l.id === id ? { ...l, ...updates } : l));
    return { layers: newLayers, ...pushHistory(state, newLayers, label || `Edit ${target.name}`) };
  }),

  deleteLayer: (id) => set((state) => {
    const target = state.layers.find(l => l.id === id);
    if (!target) return state;
    const doomed = new Set([id, ...(target.type === 'group' ? collectDescendants(state.layers, id) : [])]);
    const newLayers = state.layers
      .filter((l) => !doomed.has(l.id))
      .map((l) => {
        let next = l;
        if (next.maskId && doomed.has(next.maskId)) next = { ...next, maskId: undefined };
        if (next.type === 'group' && next.children?.some(c => doomed.has(c))) next = { ...next, children: next.children.filter(c => !doomed.has(c)) };
        return next;
      });
    const selectedLayerIds = state.selectedLayerIds.filter(sid => !doomed.has(sid));
    return {
      layers: newLayers,
      selectedLayerIds,
      selectedLayerId: state.selectedLayerId && doomed.has(state.selectedLayerId) ? (selectedLayerIds[0] || null) : state.selectedLayerId,
      soloLayerId: state.soloLayerId && doomed.has(state.soloLayerId) ? null : state.soloLayerId,
      ...pushHistory(state, newLayers, `Delete ${target.name}`)
    };
  }),

  deleteSelectedLayers: () => {
    const ids = [...get().selectedLayerIds];
    if (ids.length === 0 && get().selectedLayerId) ids.push(get().selectedLayerId!);
    if (ids.length === 0) return;
    get().startHistoryTransaction();
    ids.forEach(id => get().deleteLayer(id));
    get().endHistoryTransaction(ids.length > 1 ? `Delete ${ids.length} Layers` : undefined);
  },

  duplicateLayer: (id) => set((state) => {
    const targetId = id || state.selectedLayerId;
    const source = state.layers.find(l => l.id === targetId);
    if (!source) return state;
    const [clone] = snapshotLayers([source]);
    clone.id = uid('layer');
    clone.name = `${source.name} Copy`;
    clone.transform = { ...clone.transform, x: clone.transform.x + 20, y: clone.transform.y + 20 };
    clone.children = undefined;
    const idx = state.layers.findIndex(l => l.id === source.id);
    const newLayers = [...state.layers];
    newLayers.splice(idx + 1, 0, clone);
    return {
      layers: newLayers,
      selectedLayerId: clone.id,
      selectedLayerIds: [clone.id],
      ...pushHistory(state, newLayers, `Duplicate ${source.name}`)
    };
  }),

  mergeVisibleLayers: (bitmap) => set((state) => {
    const visible = state.layers.filter(l => l.visible && l.type !== 'audio');
    if (visible.length === 0) return state;
    const merged = LayerFactory.createRasterLayer('Merged', bitmap);
    const visibleIds = new Set(visible.map(l => l.id));
    const newLayers = [...state.layers.filter(l => !visibleIds.has(l.id)), merged];
    return {
      layers: newLayers,
      selectedLayerId: merged.id,
      selectedLayerIds: [merged.id],
      ...pushHistory(state, newLayers, 'Merge Visible')
    };
  }),

  recordHistory: (layers, label = 'Edit') => set((state) => pushHistory(state, layers, label)),

  startHistoryTransaction: () => set({ isBatchingHistory: true, historyBatch: null }),
  endHistoryTransaction: (label) => set((state) => {
    if (!state.isBatchingHistory) return state;
    if (state.historyBatch) {
      const layersToRecord = state.layers; // final state of the transaction
      const base = { ...state, isBatchingHistory: false, historyBatch: null };
      return { isBatchingHistory: false, historyBatch: null, ...pushHistory(base, layersToRecord, label || state.historyBatch.label) };
    }
    return { isBatchingHistory: false, historyBatch: null };
  }),

  undo: () => set((state) => {
    if (state.historyIndex <= 0) return state;
    const newIndex = state.historyIndex - 1;
    const restored = snapshotLayers(state.history[newIndex].layers);
    const ids = new Set(restored.map(l => l.id));
    const selectedLayerIds = state.selectedLayerIds.filter(id => ids.has(id));
    return {
      layers: restored,
      historyIndex: newIndex,
      selectedLayerIds,
      selectedLayerId: state.selectedLayerId && ids.has(state.selectedLayerId) ? state.selectedLayerId : (selectedLayerIds[0] || null),
      dirty: true
    };
  }),

  redo: () => set((state) => {
    if (state.historyIndex >= state.history.length - 1) return state;
    const newIndex = state.historyIndex + 1;
    const restored = snapshotLayers(state.history[newIndex].layers);
    const ids = new Set(restored.map(l => l.id));
    const selectedLayerIds = state.selectedLayerIds.filter(id => ids.has(id));
    return {
      layers: restored,
      historyIndex: newIndex,
      selectedLayerIds,
      selectedLayerId: state.selectedLayerId && ids.has(state.selectedLayerId) ? state.selectedLayerId : (selectedLayerIds[0] || null),
      dirty: true
    };
  }),

  jumpToHistory: (index) => set((state) => {
    if (index < 0 || index >= state.history.length || index === state.historyIndex) return state;
    const restored = snapshotLayers(state.history[index].layers);
    const ids = new Set(restored.map(l => l.id));
    const selectedLayerIds = state.selectedLayerIds.filter(id => ids.has(id));
    return {
      layers: restored,
      historyIndex: index,
      selectedLayerIds,
      selectedLayerId: state.selectedLayerId && ids.has(state.selectedLayerId) ? state.selectedLayerId : (selectedLayerIds[0] || null),
      dirty: true
    };
  }),

  groupLayers: () => set((state) => {
    const selectedLayers = state.layers.filter(l => state.selectedLayerIds.includes(l.id));
    if (selectedLayers.length === 0) {
      const folderCount = state.layers.filter(l => l.type === 'group').length + 1;
      const newGroup = LayerFactory.createGroupLayer(`Folder ${folderCount}`, []);
      const newLayers = [...state.layers, newGroup];
      return {
        layers: newLayers,
        selectedLayerId: newGroup.id,
        selectedLayerIds: [newGroup.id],
        expandedGroupIds: [...state.expandedGroupIds, newGroup.id],
        ...pushHistory(state, newLayers, 'New Folder')
      };
    }

    const newGroup = LayerFactory.createGroupLayer('New Group', selectedLayers.map(l => l.id));
    const groupId = newGroup.id;
    // Insert the group where the top-most selected layer sits so stacking order is preserved
    const maxIndex = Math.max(...selectedLayers.map(l => state.layers.indexOf(l)));
    const reparented = state.layers.map(l => selectedLayers.some(sl => sl.id === l.id) ? { ...l, parentId: groupId } : l);
    const newLayers = [...reparented];
    newLayers.splice(maxIndex + 1, 0, newGroup);
    return {
      layers: newLayers,
      selectedLayerId: groupId,
      selectedLayerIds: [groupId],
      expandedGroupIds: [...state.expandedGroupIds, groupId],
      ...pushHistory(state, newLayers, 'Group Layers')
    };
  }),

  setMask: () => set((state) => {
    if (!state.selectedLayerId) return state;
    const index = state.layers.findIndex(l => l.id === state.selectedLayerId);
    if (index < 0 || index >= state.layers.length - 1) return state;

    // The selected layer becomes the mask of the layer directly above it (next in array order)
    const targetLayer = state.layers[index + 1];
    const newLayers = state.layers.map(l => {
      if (l.id === targetLayer.id) return { ...l, maskId: state.selectedLayerId! };
      if (l.id === state.selectedLayerId) return { ...l, isMask: true };
      return l;
    });
    return { layers: newLayers, ...pushHistory(state, newLayers, 'Apply Mask') };
  }),

  removeMask: (id) => set((state) => {
    const target = state.layers.find(l => l.id === id);
    if (!target?.maskId) return state;
    const maskId = target.maskId;
    const stillUsed = state.layers.some(l => l.id !== id && l.maskId === maskId);
    const newLayers = state.layers.map(l => {
      if (l.id === id) return { ...l, maskId: undefined };
      if (l.id === maskId && !stillUsed) return { ...l, isMask: false };
      return l;
    });
    return { layers: newLayers, ...pushHistory(state, newLayers, 'Remove Mask') };
  }),

  moveLayer: (id, direction) => set((state) => {
    const index = state.layers.findIndex(l => l.id === id);
    if (index === -1) return state;
    if (direction === 'up' && index === state.layers.length - 1) return state;
    if (direction === 'down' && index === 0) return state;

    const newLayers = [...state.layers];
    const targetIndex = direction === 'up' ? index + 1 : index - 1;
    [newLayers[index], newLayers[targetIndex]] = [newLayers[targetIndex], newLayers[index]];
    return { layers: newLayers, ...pushHistory(state, newLayers, direction === 'up' ? 'Move Layer Up' : 'Move Layer Down') };
  }),

  reorderLayer: (id, targetIndex) => set((state) => {
    const index = state.layers.findIndex(l => l.id === id);
    if (index === -1) return state;
    const clamped = Math.max(0, Math.min(state.layers.length - 1, targetIndex));
    if (clamped === index) return state;
    const newLayers = [...state.layers];
    const [moved] = newLayers.splice(index, 1);
    newLayers.splice(clamped, 0, moved);
    return { layers: newLayers, ...pushHistory(state, newLayers, 'Reorder Layer') };
  }),

  addAdjustmentLayer: () => {
    const newLayer = LayerFactory.createAdjustmentLayer(`Adjustment ${get().layers.length + 1}`);
    get().addLayer(newLayer, 'Add Adjustment Layer');
  },

  addClonerLayer: () => {
    const newLayer: Layer = {
      id: uid('cloner'),
      name: `Cloner ${get().layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      adjustments: LayerFactory.createDefaultAdjustments(),
      bitmap: null,
      type: 'cloner',
      transform: { x: 200, y: 200, scaleX: 1, scaleY: 1, rotation: 0 },
      shapeSettings: { type: 'circle', fill: '#8b5cf6', stroke: '#ffffff', strokeWidth: 2 },
      clonerSettings: {
        count: 5,
        mode: 'linear',
        offset: { x: 120, y: 40, scaleX: 1, scaleY: 1, rotation: 0 },
        randomness: { x: 0, y: 0, scaleX: 0, scaleY: 0, rotation: 0 },
        step: 160
      }
    };
    get().addLayer(newLayer, 'Add Cloner');
  },

  addShapeLayer: (type) => {
    const newLayer = LayerFactory.createShapeLayer(`${type.charAt(0).toUpperCase() + type.slice(1)} ${get().layers.length + 1}`, type);
    get().addLayer(newLayer, `Add ${type}`);
  },

  addTextLayer: (is3D = false, x = 200, y = 200) => {
    const newLayer = LayerFactory.createTextLayer(`${is3D ? '3D ' : ''}Text ${get().layers.length + 1}`, is3D, x, y);
    get().addLayer(newLayer, is3D ? 'Add 3D Text' : 'Add Text');
  },

  addTextAnimatorLayer: (x = 400, y = 400) => {
    const newLayer: Layer = {
      id: uid('text-anim'),
      name: `Text Animator ${get().layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      adjustments: LayerFactory.createDefaultAdjustments(),
      bitmap: null,
      type: 'text',
      transform: LayerFactory.createDefaultTransform(x, y),
      content: 'ANIMATED TEXT',
      fontSettings: {
        family: 'Space Grotesk',
        size: 64,
        weight: '900',
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
    get().addLayer(newLayer, 'Add Text Animator');
  },

  addVectorLayer: (initialPoint) => {
    const pts = initialPoint ? [{ x: initialPoint.x, y: initialPoint.y }] : [
      { x: 400, y: 500, handleOut: { x: 550, y: 400 } },
      { x: 700, y: 600, handleIn: { x: 600, y: 700 }, handleOut: { x: 800, y: 500 } },
      { x: 1000, y: 450, handleIn: { x: 900, y: 400 } }
    ];

    const newLayer: Layer = {
      id: uid('vector'),
      name: `Vector Path ${get().layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      adjustments: LayerFactory.createDefaultAdjustments(),
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
    get().addLayer(newLayer, 'Add Vector Path');
  },

  addMotionPath: (points, assignToLayerId) => set((state) => {
    const newPath: MotionPath = {
      id: uid('path'),
      points: points && points.length > 1 ? points : [{ x: 100, y: 100 }, { x: 300, y: 300 }],
      closed: false
    };
    const newPaths = [...state.motionPaths, newPath];
    const targetId = assignToLayerId === undefined ? state.selectedLayerId : assignToLayerId;
    if (targetId) {
      const newLayers = state.layers.map(l => l.id === targetId ? { ...l, motionPathId: newPath.id, motionPathProgress: l.motionPathProgress ?? 0 } : l);
      return { motionPaths: newPaths, layers: newLayers, ...pushHistory(state, newLayers, 'Add Motion Path') };
    }
    return { motionPaths: newPaths, dirty: true };
  }),

  applyKineticPreset: (preset) => set((state) => {
    if (!state.selectedLayerId) return state;
    const layer = state.layers.find(l => l.id === state.selectedLayerId);
    if (!layer || (layer.type !== 'text' && layer.type !== '3d-text')) return state;

    const newAnimations = { ...(layer.animations || {}) };
    const time = state.currentTime;
    const tx = layer.transform.x;

    if (preset === 'Fluid Morph') {
      newAnimations['scaleX'] = {
        keyframes: [
          { time, value: layer.transform.scaleX, easing: 'ease-in-out' },
          { time: time + 1, value: layer.transform.scaleX * 1.5, easing: 'ease-in-out' },
          { time: time + 2, value: layer.transform.scaleX, easing: 'ease-in-out' }
        ],
        currentValue: layer.transform.scaleX
      };
      newAnimations['scaleY'] = {
        keyframes: [
          { time, value: layer.transform.scaleY, easing: 'ease-in-out' },
          { time: time + 1, value: layer.transform.scaleY * 0.8, easing: 'ease-in-out' },
          { time: time + 2, value: layer.transform.scaleY, easing: 'ease-in-out' }
        ],
        currentValue: layer.transform.scaleY
      };
    } else if (preset === 'Scrolling') {
      newAnimations['x'] = {
        keyframes: [
          { time, value: -400, easing: 'linear' },
          { time: time + 5, value: 1920, easing: 'linear' }
        ],
        currentValue: -400
      };
    } else if (preset === 'Glitch') {
      const kfs: Keyframe[] = [];
      for (let i = 0; i < 12; i++) {
        kfs.push({ time: time + i * 0.08, value: tx + (i % 2 === 0 ? 0 : (i % 4 === 1 ? 14 : -14)), easing: 'snap' });
      }
      kfs.push({ time: time + 1, value: tx, easing: 'snap' });
      newAnimations['x'] = { keyframes: kfs, currentValue: tx };
    } else if (preset === 'Typewriter') {
      newAnimations['opacity'] = {
        keyframes: [
          { time, value: 0, easing: 'snap' },
          { time: time + 2, value: 1, easing: 'linear' }
        ],
        currentValue: 1
      };
    } else if (preset === 'Dynamic Layout') {
      newAnimations['y'] = {
        keyframes: [
          { time, value: layer.transform.y + 300, easing: 'bounce' },
          { time: time + 1.2, value: layer.transform.y, easing: 'bounce' }
        ],
        currentValue: layer.transform.y
      };
      newAnimations['rotation'] = {
        keyframes: [
          { time, value: -12, easing: 'ease-out' },
          { time: time + 1.2, value: 0, easing: 'ease-out' }
        ],
        currentValue: 0
      };
    } else {
      return state;
    }

    const newLayers = state.layers.map(l => l.id === state.selectedLayerId ? { ...l, animations: newAnimations } : l);
    return { layers: newLayers, ...pushHistory(state, newLayers, `Preset: ${preset}`) };
  }),

  addKeyframe: (layerId, property, keyframe) => set((state) => {
    const targetId = layerId || state.selectedLayerId;
    if (!targetId) return state;
    const layer = state.layers.find(l => l.id === targetId);
    if (!layer || layer.type === 'audio') return state;

    const newAnimations = { ...(layer.animations || {}) };

    const upsert = (prop: string, kf: Keyframe) => {
      const existingTrack = newAnimations[prop] || { keyframes: [], currentValue: (layer.transform as any)[prop] ?? 0 };
      const kfs = [...existingTrack.keyframes];
      const idx = kfs.findIndex(k => Math.abs(k.time - kf.time) < 0.005);
      if (idx >= 0) kfs[idx] = { ...kfs[idx], value: kf.value, easing: kf.easing ?? kfs[idx].easing, bezierPoints: kf.bezierPoints ?? kfs[idx].bezierPoints };
      else kfs.push({ ...kf });
      kfs.sort((a, b) => a.time - b.time);
      newAnimations[prop] = { ...existingTrack, keyframes: kfs };
    };

    if (property && keyframe) {
      upsert(property, keyframe);
    } else {
      KEYFRAMEABLE_PROPS.forEach(prop => {
        upsert(prop, { time: state.currentTime, value: layer.transform[prop], easing: 'ease-in-out' });
      });
      upsert('opacity', { time: state.currentTime, value: layer.opacity, easing: 'ease-in-out' });
    }

    const newLayers = state.layers.map(l => l.id === targetId ? { ...l, animations: newAnimations } : l);
    return { layers: newLayers, ...pushHistory(state, newLayers, 'Add Keyframe') };
  }),

  removeKeyframe: (layerId, property, keyframeIndex) => set((state) => {
    const layer = state.layers.find(l => l.id === layerId);
    if (!layer?.animations?.[property]) return state;
    const kfs = layer.animations[property].keyframes.filter((_, i) => i !== keyframeIndex);
    const newAnimations = { ...layer.animations };
    if (kfs.length === 0) delete newAnimations[property];
    else newAnimations[property] = { ...newAnimations[property], keyframes: kfs };
    const newLayers = state.layers.map(l => l.id === layerId ? { ...l, animations: newAnimations } : l);
    return { layers: newLayers, ...pushHistory(state, newLayers, 'Delete Keyframe') };
  }),

  toggleLayerVisibility: (id) => set((state) => {
    const newLayers = state.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l);
    return { layers: newLayers, dirty: true };
  }),

  setAdjustments: (adjustments) => set((state) => {
    if (!state.selectedLayerId) return state;
    const newLayers = state.layers.map(l => l.id === state.selectedLayerId ? { ...l, adjustments } : l);
    return { layers: newLayers, dirty: true };
  }),

  setBlendMode: (blendMode) => set((state) => {
    if (!state.selectedLayerId) return state;
    const newLayers = state.layers.map(l => l.id === state.selectedLayerId ? { ...l, blendMode } : l);
    return { layers: newLayers, ...pushHistory(state, newLayers, 'Blend Mode') };
  }),

  updateKeyframeTime: (layerId, property, keyframeIndex, newTime, commit = true) => {
    let resultIndex = keyframeIndex;
    set((state) => {
      const layer = state.layers.find(l => l.id === layerId);
      if (!layer || !layer.animations || !layer.animations[property]) return state;

      const newAnimations = { ...layer.animations };
      const kfs = [...newAnimations[property].keyframes];
      if (keyframeIndex < 0 || keyframeIndex >= kfs.length) return state;

      const moved: Keyframe = { ...kfs[keyframeIndex], time: Math.max(0, Math.min(state.duration, newTime)) };
      kfs[keyframeIndex] = moved;
      const { sorted, index } = sortKeyframes(kfs, moved);
      resultIndex = index;

      newAnimations[property] = { ...newAnimations[property], keyframes: sorted };
      const newLayers = state.layers.map(l => l.id === layerId ? { ...l, animations: newAnimations } : l);
      return commit ? { layers: newLayers, ...pushHistory(state, newLayers, 'Move Keyframe') } : { layers: newLayers, dirty: true };
    });
    return resultIndex;
  },

  addAudioLayer: (src, name = 'Audio Track', peaks = [], duration = 10) => {
    const newLayer: Layer = {
      id: uid('audio'),
      name,
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
    get().addLayer(newLayer, `Add Audio: ${name}`);
  },

  newProject: () => {
    const layers = createInitialLayers();
    set({
      layers,
      motionPaths: [],
      selectedLayerId: layers[1]?.id || null,
      selectedLayerIds: layers[1] ? [layers[1].id] : [],
      currentTime: 0,
      isPlaying: false,
      duration: 60,
      history: [{ label: 'New Project', layers: snapshotLayers(layers) }],
      historyIndex: 0,
      isBatchingHistory: false,
      historyBatch: null,
      soloLayerId: null,
      expandedGroupIds: [],
      projectName: 'Untitled Project',
      dirty: false,
      statusMessage: 'New project created'
    });
  },

  loadProject: (data) => {
    const layers = data.layers || [];
    set((state) => ({
      layers,
      motionPaths: data.motionPaths || [],
      duration: data.duration && data.duration > 0 ? data.duration : state.duration,
      fps: data.fps || state.fps,
      projectName: data.projectName || state.projectName,
      colorSwatches: data.colorSwatches?.length ? data.colorSwatches : state.colorSwatches,
      globalColorVariables: data.globalColorVariables?.length ? data.globalColorVariables : state.globalColorVariables,
      brushColor: data.brushColor || state.brushColor,
      selectedLayerId: layers[layers.length - 1]?.id || null,
      selectedLayerIds: layers.length ? [layers[layers.length - 1].id] : [],
      currentTime: 0,
      isPlaying: false,
      history: [{ label: 'Open Project', layers: snapshotLayers(layers) }],
      historyIndex: 0,
      isBatchingHistory: false,
      historyBatch: null,
      soloLayerId: null,
      expandedGroupIds: layers.filter(l => l.type === 'group').map(l => l.id),
      dirty: false,
      statusMessage: `Loaded ${data.projectName || 'project'} (${layers.length} layers)`
    }));
  },

  markSaved: () => set({ dirty: false })
}));

/** Convenience selector helpers */
export const selectCurrentLayer = (state: AppState) => state.layers.find(l => l.id === state.selectedLayerId) || null;
