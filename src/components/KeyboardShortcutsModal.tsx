import React, { useState, useMemo } from 'react';
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
  { id: 'tool-move', label: 'Move / Selection Tool', description: 'Click layers on the canvas to select; drag to move (Shift = constrain axis, Alt = ignore snapping)', category: 'tools', keys: ['V'] },
  { id: 'tool-pen', label: 'Vector Pen Tool', description: 'Click to add anchors; click the first anchor to close; Alt+click an anchor for curve handles; double-click removes', category: 'tools', keys: ['P'] },
  { id: 'tool-brush', label: 'Paint Brush Tool', description: 'Paint on the selected image layer using the active color (creates a paint layer if needed)', category: 'tools', keys: ['B'] },
  { id: 'tool-eraser', label: 'Eraser Tool', description: 'Erase pixels on the selected image layer', category: 'tools', keys: ['E'] },
  { id: 'tool-marquee', label: 'Rectangular Marquee', description: 'Drag a rectangular pixel selection (constrains brush & gradient fills)', category: 'tools', keys: ['M'] },
  { id: 'tool-lasso', label: 'Lasso Selection', description: 'Drag a freehand pixel selection', category: 'tools', keys: ['L'] },
  { id: 'tool-hand', label: 'Hand / Pan Tool', description: 'Pan around the canvas viewport', category: 'tools', keys: ['H'] },
  { id: 'tool-gradient', label: 'Gradient Tool', description: 'Drag to fill the selected image layer with a linear, radial, or conic gradient', category: 'tools', keys: ['G'] },
  { id: 'tool-text', label: 'Text Tool', description: 'Click on the canvas to place a new text layer', category: 'tools', keys: ['T'] },
  { id: 'tool-text-animator', label: 'Text Animator Tool', description: 'Click to place an animated (wave/bounce/reveal/glitch) text layer', category: 'tools', keys: ['Shift', 'T'] },
  { id: 'tool-motion-path', label: 'Motion Path Tool', description: 'Drag to draw a motion path and assign it to the selected layer', category: 'tools', keys: ['Shift', 'P'] },
  { id: 'tool-eyedropper', label: 'Eyedropper Tool', description: 'Sample a color into the active swatch (Alt+click applies it to the selected layer)', category: 'tools', keys: ['I'] },
  { id: 'tool-zoom', label: 'Zoom Tool', description: 'Click to zoom in, Alt+click to zoom out', category: 'tools', keys: ['Z'] },
  { id: 'tool-crop', label: 'Crop Tool', description: 'Drag a rectangle to crop the selected image layer', category: 'tools', keys: ['C'] },

  // Canvas
  { id: 'canvas-select', label: 'Select Layer on Canvas', description: 'Click a layer with the Move tool; Shift+click adds to the selection; double-click opens Properties', category: 'canvas', keys: ['Click'] },
  { id: 'canvas-nudge', label: 'Nudge Layer', description: 'Move the selected layer(s) by 1px (Shift = 10px)', category: 'canvas', keys: ['↑ ↓ ← →'] },
  { id: 'canvas-snap-angle', label: 'Constrain Angle / Ratio', description: 'Hold Shift while rotating (15° steps) or scaling (keep aspect ratio)', category: 'canvas', keys: ['Shift', 'Drag'] },
  { id: 'canvas-pan-space', label: 'Quick Pan Canvas', description: 'Hold Space and drag to pan (tap Space to play/pause)', category: 'canvas', keys: ['Space', 'Drag'] },
  { id: 'canvas-zoom-wheel', label: 'Zoom Viewport', description: 'Ctrl/Cmd + mouse wheel zooms around the cursor; plain wheel pans', category: 'canvas', keys: ['⌘ / Ctrl', 'Wheel'] },
  { id: 'canvas-zoom-keys', label: 'Zoom In / Out / Reset', description: 'Step the zoom level, or reset to 100%', category: 'canvas', keys: ['⌘ / Ctrl', '+ / − / 0'] },
  { id: 'canvas-fit', label: 'Fit Document to Screen', description: 'Zoom so the whole 1920×1080 document is visible', category: 'canvas', keys: ['Shift', '0'] },
  { id: 'canvas-smart-guides', label: 'Toggle Smart Guides', description: 'Toggle alignment guide lines and snapping', category: 'canvas', keys: ['⌘ / Ctrl', 'Shift', 'G'] },
  { id: 'canvas-drop', label: 'Import by Drag & Drop', description: 'Drop image files onto the canvas to import them as layers', category: 'canvas', keys: ['Drop'] },

  // Timeline
  { id: 'play-toggle', label: 'Play / Pause Animation', description: 'Tap Space to toggle timeline playback', category: 'timeline', keys: ['Space'] },
  { id: 'frame-next', label: 'Step Forward 1 Frame', description: 'Advance the playhead by one frame', category: 'timeline', keys: ['.'] },
  { id: 'frame-prev', label: 'Step Backward 1 Frame', description: 'Move the playhead back one frame', category: 'timeline', keys: [','] },
  { id: 'jump-start', label: 'Jump to Timeline Start', description: 'Move playhead to 0.0 seconds', category: 'timeline', keys: ['Home'] },
  { id: 'jump-end', label: 'Jump to Timeline End', description: 'Move playhead to the end of the timeline', category: 'timeline', keys: ['End'] },
  { id: 'add-keyframe', label: 'Add Keyframe', description: 'Keyframe the selected layer\'s transform and opacity at the playhead', category: 'timeline', keys: ['⌘ / Ctrl', 'K'] },
  { id: 'keyframe-drag', label: 'Move Keyframe', description: 'Drag a keyframe diamond in the timeline (Alt = ignore snapping)', category: 'timeline', keys: ['Drag'] },
  { id: 'keyframe-easing', label: 'Edit Keyframe Easing', description: 'Double-click a keyframe to open the Easing Editor', category: 'timeline', keys: ['Double-click'] },
  { id: 'keyframe-delete', label: 'Delete Keyframe', description: 'Right-click a keyframe in the timeline', category: 'timeline', keys: ['Right-click'] },

  // Layers
  { id: 'edit-undo', label: 'Undo', description: 'Revert the last editing operation', category: 'layers', keys: ['⌘ / Ctrl', 'Z'] },
  { id: 'edit-redo', label: 'Redo', description: 'Reapply an undone operation', category: 'layers', keys: ['⌘ / Ctrl', 'Shift', 'Z'] },
  { id: 'layer-delete', label: 'Delete Selected Layer(s)', description: 'Remove the selected layers from the project', category: 'layers', keys: ['Delete'] },
  { id: 'layer-group', label: 'Group Layers', description: 'Group selected layers into a folder', category: 'layers', keys: ['⌘ / Ctrl', 'G'] },
  { id: 'layer-duplicate', label: 'Duplicate Layer', description: 'Clone the active layer including animation', category: 'layers', keys: ['⌘ / Ctrl', 'D'] },
  { id: 'layer-deselect', label: 'Deselect / Close', description: 'Clear the pixel selection, deselect layers, or close the open dialog', category: 'layers', keys: ['Esc'] },
  { id: 'layer-rename', label: 'Rename Layer', description: 'Double-click a layer name in the Layers panel', category: 'layers', keys: ['Double-click'] },

  // General
  { id: 'modal-shortcuts', label: 'Keyboard Shortcuts Reference', description: 'Open this searchable shortcuts guide', category: 'general', keys: ['?'] },
  { id: 'file-save', label: 'Save Project', description: 'Download the project as a .v12proj.json file (includes images)', category: 'general', keys: ['⌘ / Ctrl', 'S'] },
  { id: 'file-open', label: 'Open Project', description: 'Load a saved .v12proj.json file', category: 'general', keys: ['⌘ / Ctrl', 'O'] },
  { id: 'file-import', label: 'Import Images', description: 'Import one or more image files as layers', category: 'general', keys: ['⌘ / Ctrl', 'I'] },
  { id: 'modal-export', label: 'Export Animation', description: 'Open the frame-range / video export dialog', category: 'general', keys: ['⌘ / Ctrl', 'E'] },
];

export const KeyboardShortcutsModal: React.FC = () => {
  const isShortcutsModalOpen = useStore(s => s.isShortcutsModalOpen);
  const setIsShortcutsModalOpen = useStore(s => s.setIsShortcutsModalOpen);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'tools' | 'canvas' | 'timeline' | 'layers' | 'general'>('all');

  // Global '?' and Esc handling lives in App.tsx (react-hotkeys-hook) to avoid double-toggling.

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
