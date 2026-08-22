import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, Command, Keyboard, Sparkles, Sliders, Play, Move, PenTool, Layers } from 'lucide-react';
import { useStore } from '../store';

interface ShortcutItem {
  id: string;
  label: string;
  description: string;
  category: 'tools' | 'canvas' | 'timeline' | 'layers' | 'general';
  keys: string[];
}

const SHORTCUTS: ShortcutItem[] = [
  // Tools
  { id: 'tool-move', label: 'Move / Selection Tool', description: 'Select and transform layers on canvas', category: 'tools', keys: ['V'] },
  { id: 'tool-pen', label: 'Vector Pen Tool', description: 'Create and edit Bezier path curves', category: 'tools', keys: ['P'] },
  { id: 'tool-brush', label: 'Paint Brush Tool', description: 'Draw freehand raster strokes', category: 'tools', keys: ['B'] },
  { id: 'tool-eraser', label: 'Eraser Tool', description: 'Erase raster pixels on active layer', category: 'tools', keys: ['E'] },
  { id: 'tool-hand', label: 'Hand / Pan Tool', description: 'Pan around the canvas viewport', category: 'tools', keys: ['H'] },
  { id: 'tool-gradient', label: 'Gradient Tool', description: 'Draw linear, radial, or conic gradients', category: 'tools', keys: ['G'] },
  { id: 'tool-text', label: 'Text Tool', description: 'Create text or 3D text layers', category: 'tools', keys: ['T'] },
  { id: 'tool-eyedropper', label: 'Eyedropper Tool', description: 'Sample color from any canvas pixel', category: 'tools', keys: ['I'] },
  { id: 'tool-zoom', label: 'Zoom Tool', description: 'Zoom in or out of the canvas', category: 'tools', keys: ['Z'] },

  // Canvas & Vector Pen
  { id: 'vector-add-point', label: 'Add Bezier Anchor', description: 'Click canvas with Pen tool to place point', category: 'canvas', keys: ['Click'] },
  { id: 'vector-drag-handle', label: 'Smooth Curve Handles', description: 'Click & drag with Pen tool for smooth tangent handles', category: 'canvas', keys: ['Click & Drag'] },
  { id: 'vector-close-path', label: 'Close Vector Path', description: 'Click first anchor point or press Enter to close path', category: 'canvas', keys: ['Enter'] },
  { id: 'canvas-snap-angle', label: 'Constrain Angle / Ratio', description: 'Hold Shift while rotating or scaling to snap by 15° or maintain 1:1 ratio', category: 'canvas', keys: ['Shift', 'Drag'] },
  { id: 'canvas-pan-space', label: 'Quick Pan Canvas', description: 'Hold Space and drag mouse to pan canvas', category: 'canvas', keys: ['Space', 'Drag'] },
  { id: 'canvas-zoom-wheel', label: 'Zoom Viewport', description: 'Pinch or Ctrl/Cmd + Mouse Wheel to zoom centered on cursor', category: 'canvas', keys: ['⌘ / Ctrl', 'Wheel'] },
  { id: 'canvas-smart-guides', label: 'Toggle Smart Guides', description: 'Toggle alignment guide lines and snapping', category: 'canvas', keys: ['⌘ / Ctrl', 'Shift', 'G'] },

  // Playback & Timeline
  { id: 'play-toggle', label: 'Play / Pause Animation', description: 'Toggle timeline animation playback', category: 'timeline', keys: ['Space'] },
  { id: 'frame-next', label: 'Step Forward 1 Frame', description: 'Advance timeline by 1 frame', category: 'timeline', keys: ['.'] },
  { id: 'frame-prev', label: 'Step Backward 1 Frame', description: 'Move timeline back by 1 frame', category: 'timeline', keys: [','] },
  { id: 'jump-start', label: 'Jump to Timeline Start', description: 'Move playhead to 0.0 seconds', category: 'timeline', keys: ['Home'] },
  { id: 'jump-end', label: 'Jump to Timeline End', description: 'Move playhead to end of animation', category: 'timeline', keys: ['End'] },

  // Layers & Editing
  { id: 'edit-undo', label: 'Undo Action', description: 'Revert last editing operation', category: 'layers', keys: ['⌘ / Ctrl', 'Z'] },
  { id: 'edit-redo', label: 'Redo Action', description: 'Reapply undone operation', category: 'layers', keys: ['⌘ / Ctrl', 'Shift', 'Z'] },
  { id: 'layer-delete', label: 'Delete Selected Layer', description: 'Remove current layer from project', category: 'layers', keys: ['Delete'] },
  { id: 'layer-group', label: 'Group Layers', description: 'Group selected layers into container', category: 'layers', keys: ['⌘ / Ctrl', 'G'] },
  { id: 'layer-duplicate', label: 'Duplicate Layer', description: 'Clone active layer with transforms', category: 'layers', keys: ['⌘ / Ctrl', 'D'] },
  { id: 'layer-deselect', label: 'Deselect All', description: 'Clear active layer or selection marquee', category: 'layers', keys: ['Esc'] },

  // General & Modals
  { id: 'modal-shortcuts', label: 'Keyboard Shortcuts Reference', description: 'Open this searchable shortcuts guide', category: 'general', keys: ['?'] },
  { id: 'modal-export', label: 'Export Animation', description: 'Open frame range and video export modal', category: 'general', keys: ['⌘ / Ctrl', 'E'] },
];

export const KeyboardShortcutsModal: React.FC = () => {
  const { isShortcutsModalOpen, setIsShortcutsModalOpen } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'tools' | 'canvas' | 'timeline' | 'layers' | 'general'>('all');

  // Listen for global shortcut key '?' or Cmd/Ctrl+/
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if ((e.key === '?' || (e.key === '/' && (e.metaKey || e.ctrlKey))) && !e.shiftKey) {
        e.preventDefault();
        setIsShortcutsModalOpen(!isShortcutsModalOpen);
      } else if (e.key === 'Escape' && isShortcutsModalOpen) {
        setIsShortcutsModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isShortcutsModalOpen, setIsShortcutsModalOpen]);

  const filteredShortcuts = useMemo(() => {
    return SHORTCUTS.filter(s => {
      const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory;
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query || 
        s.label.toLowerCase().includes(query) || 
        s.description.toLowerCase().includes(query) ||
        s.keys.some(k => k.toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  if (!isShortcutsModalOpen) return null;

  const categoryIcons = {
    all: Sparkles,
    tools: PenTool,
    canvas: Move,
    timeline: Play,
    layers: Layers,
    general: Command,
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md animate-fadeIn p-4">
      <div 
        className="w-full max-w-3xl bg-[#121214] border border-[#2e2e34] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2e2e34] flex items-center justify-between bg-[#18181c]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-wide flex items-center gap-2">
                Keyboard Shortcuts Reference
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-300 font-bold">
                  Quick Guide
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Master canvas navigation, Bezier paths, timeline tools, and layer edits
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsShortcutsModalOpen(false)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#282830] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="p-4 border-b border-[#2e2e34] bg-[#141418] space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search shortcuts by action, tool, or key combination (e.g. 'Pen', 'Zoom', 'Ctrl+Z')..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="w-full pl-9 pr-9 py-2 bg-[#1c1c22] border border-[#2e2e34] focus:border-blue-500 rounded-lg text-xs text-white placeholder-gray-500 outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {[
              { id: 'all', label: 'All Shortcuts' },
              { id: 'tools', label: 'Tools' },
              { id: 'canvas', label: 'Canvas & Vector' },
              { id: 'timeline', label: 'Timeline & Play' },
              { id: 'layers', label: 'Layers & Edit' },
              { id: 'general', label: 'General' },
            ].map((cat) => {
              const Icon = categoryIcons[cat.id as keyof typeof categoryIcons] || Sliders;
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id as any)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 border ${
                    active
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                      : 'bg-[#1a1a20] border-[#2a2a32] text-gray-400 hover:text-white hover:bg-[#22222a]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Shortcuts List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {filteredShortcuts.length > 0 ? (
            filteredShortcuts.map((s) => (
              <div
                key={s.id}
                className="p-3 bg-[#18181c] border border-[#26262e] rounded-lg hover:border-blue-500/50 transition-all flex items-center justify-between gap-4 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white group-hover:text-blue-300 transition-colors">
                      {s.label}
                    </span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-[#22222a] border border-[#33333e] text-gray-400">
                      {s.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                    {s.description}
                  </p>
                </div>

                {/* Key Badges */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {s.keys.map((key, idx) => (
                    <React.Fragment key={idx}>
                      <kbd className="px-2 py-1 bg-[#22222b] border border-[#363644] border-b-[2px] rounded text-[11px] font-mono font-bold text-gray-200 shadow-sm min-w-[24px] text-center">
                        {key}
                      </kbd>
                      {idx < s.keys.length - 1 && (
                        <span className="text-gray-500 text-xs font-bold">+</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center space-y-2">
              <Keyboard className="w-8 h-8 mx-auto text-gray-600 animate-pulse" />
              <p className="text-xs font-medium text-gray-400">No keyboard shortcuts matching "{searchQuery}"</p>
              <button
                onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
                className="text-xs text-blue-400 hover:underline font-semibold"
              >
                Clear search filters
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#2e2e34] bg-[#141418] flex items-center justify-between text-xs text-gray-400">
          <span>Press <kbd className="px-1.5 py-0.5 bg-[#222] border border-[#333] rounded text-[10px] text-white">?</kbd> anytime to toggle shortcuts</span>
          <button
            onClick={() => setIsShortcutsModalOpen(false)}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
