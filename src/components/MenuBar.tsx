import React, { useState, useEffect, useRef } from 'react';
import { HelpModal } from './HelpModal';
import { useStore } from '../store/index';
import { Check, Layout, Plus, Save } from 'lucide-react';

interface MenuBarProps {
  onAction: (action: string) => void;
}

export const MenuBar: React.FC<MenuBarProps> = ({ onAction }) => {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSavePromptOpen, setIsSavePromptOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');

  const currentWorkspace = useStore(s => s.currentWorkspace);
  const customWorkspaces = useStore(s => s.customWorkspaces);
  const setWorkspace = useStore(s => s.setWorkspace);
  const saveCustomWorkspace = useStore(s => s.saveCustomWorkspace);
  const projectName = useStore(s => s.projectName);
  const setProjectName = useStore(s => s.setProjectName);
  const dirty = useStore(s => s.dirty);

  const presetWorkspaces = ['Animation', 'Compositing', 'Editing', 'Standard Studio'];

  const menus: { label: string; items: { name: string; shortcut?: string }[] }[] = [
    { label: 'File', items: [
      { name: 'New' }, { name: 'Open', shortcut: 'Ctrl+O' }, { name: 'Save', shortcut: 'Ctrl+S' }, { name: 'Import Asset', shortcut: 'Ctrl+I' },
      { name: 'Export', shortcut: 'Ctrl+E' }, { name: 'Export PNG Frame' }, { name: 'Export JPG Frame' }
    ] },
    { label: 'Edit', items: [
      { name: 'Undo', shortcut: 'Ctrl+Z' }, { name: 'Redo', shortcut: 'Ctrl+Shift+Z' }, { name: 'Duplicate', shortcut: 'Ctrl+D' },
      { name: 'Select All' }, { name: 'Deselect', shortcut: 'Esc' }, { name: 'Fill', shortcut: 'G' }
    ] },
    { label: 'Image', items: [{ name: 'Adjustments' }, { name: 'Curves' }, { name: 'Chroma Key' }, { name: 'Merge Visible' }] },
    { label: 'Layer', items: [
      { name: 'New Layer' }, { name: 'Duplicate Layer', shortcut: 'Ctrl+D' }, { name: 'Delete Layer', shortcut: 'Del' },
      { name: 'Group Layers', shortcut: 'Ctrl+G' }, { name: 'Merge Visible' }, { name: 'Add Text Animator' }, { name: 'Layer Styles' }
    ] },
    { label: 'Motion', items: [
      { name: 'Add Keyframe', shortcut: 'Ctrl+K' }, { name: 'Keyframing' }, { name: 'Graph Editor' }, { name: 'Easing Editor' }, { name: 'Motion Paths', shortcut: 'Shift+P' }
    ] },
    { label: 'Typography', items: [{ name: 'Text Layer', shortcut: 'T' }, { name: 'Kinetic Text', shortcut: 'Shift+T' }, { name: '3D Text Engine' }] },
    { label: 'AI', items: [{ name: 'Generative Fill' }, { name: 'Sky Replacement' }, { name: 'Enhance' }, { name: 'Auto-Animate' }] },
    { label: 'View', items: [
      { name: 'Zoom In', shortcut: 'Ctrl++' }, { name: 'Zoom Out', shortcut: 'Ctrl+-' }, { name: 'Reset Zoom', shortcut: 'Ctrl+0' }, { name: 'Fit to Screen', shortcut: 'Shift+0' }
    ] },
    { label: 'Window', items: [{ name: 'Layers' }, { name: 'Properties' }, { name: 'History' }, { name: 'Motion' }, { name: 'Timeline' }] },
    { label: 'Help', items: [{ name: 'Shortcuts', shortcut: '?' }, { name: 'About' }] },
  ];

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [openMenu]);

  const handleSaveWorkspaceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newWorkspaceName.trim()) {
      saveCustomWorkspace(newWorkspaceName.trim());
      setNewWorkspaceName('');
      setIsSavePromptOpen(false);
    }
  };

  return (
    <div ref={barRef} className="h-8 bg-[#1a1a1a] border-b border-[#0a0a0a] flex items-center justify-between px-4 text-[11px] text-gray-300 z-30 select-none shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 mr-2">
          <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-[10px]">V</div>
          <span className="font-semibold text-white">V12SonicDesign Studio</span>
        </div>

        {menus.map((menu) => (
          <div
            key={menu.label}
            className={`relative cursor-default px-2 py-1 rounded ${openMenu === menu.label ? 'bg-[#3a3a3a] text-white' : 'hover:bg-[#3a3a3a]'}`}
            onMouseDown={(e) => { e.preventDefault(); setOpenMenu(openMenu === menu.label ? null : menu.label); }}
            onMouseEnter={() => { if (openMenu && openMenu !== menu.label) setOpenMenu(menu.label); }}
          >
            {menu.label}
            {openMenu === menu.label && (
              <div className="absolute top-full left-0 mt-0 w-52 bg-[#2a2a2a] border border-[#1a1a1a] shadow-xl z-50 rounded-b py-1" onMouseDown={(e) => e.stopPropagation()}>
                {menu.items.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => {
                      setOpenMenu(null);
                      if (item.name === 'About') setIsHelpOpen(true);
                      else onAction(`${menu.label}:${item.name}`);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white text-gray-300 text-[11px] transition-colors flex items-center justify-between gap-3"
                  >
                    <span>{item.name}</span>
                    {item.shortcut && <span className="text-[9px] font-mono text-gray-500">{item.shortcut}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Workspace Dropdown Menu */}
        <div className="relative group cursor-default hover:bg-[#3a3a3a] px-2.5 py-1 rounded flex items-center gap-1.5 font-medium text-blue-300">
          <Layout size={12} className="text-blue-400" />
          <span>Workspace: <strong className="text-white">{currentWorkspace}</strong></span>

          <div className="absolute top-full left-0 mt-0 w-52 bg-[#252525] border border-[#333] shadow-2xl hidden group-hover:block z-50 rounded overflow-hidden">
            <div className="px-3 py-1.5 bg-[#1e1e1e] border-b border-[#333] text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Layout Presets
            </div>

            {presetWorkspaces.map((preset) => (
              <button
                key={preset}
                onClick={() => setWorkspace(preset)}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-[11px] hover:bg-blue-600 hover:text-white transition-colors ${
                  currentWorkspace === preset ? 'text-blue-400 font-bold bg-blue-950/30' : 'text-gray-300'
                }`}
              >
                <span>{preset}</span>
                {currentWorkspace === preset && <Check size={12} className="text-blue-400" />}
              </button>
            ))}

            {customWorkspaces.length > 0 && (
              <>
                <div className="px-3 py-1.5 bg-[#1e1e1e] border-t border-b border-[#333] text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Custom Workspaces
                </div>
                {customWorkspaces.map((cw) => (
                  <button
                    key={cw.name}
                    onClick={() => setWorkspace(cw.name)}
                    className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-[11px] hover:bg-blue-600 hover:text-white transition-colors ${
                      currentWorkspace === cw.name ? 'text-blue-400 font-bold bg-blue-950/30' : 'text-gray-300'
                    }`}
                  >
                    <span>{cw.name}</span>
                    {currentWorkspace === cw.name && <Check size={12} className="text-blue-400" />}
                  </button>
                ))}
              </>
            )}

            <div className="p-1 border-t border-[#333] bg-[#1a1a1a]">
              <button
                onClick={() => setIsSavePromptOpen(true)}
                className="w-full text-left px-2.5 py-1.5 bg-[#333] hover:bg-blue-600 text-gray-200 hover:text-white text-[10px] font-bold rounded flex items-center gap-1.5 transition-colors"
              >
                <Save size={12} /> Save Current Layout...
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Project name + save state */}
      <div className="flex items-center gap-2 text-[10px] text-gray-400">
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="px-2 py-0.5 bg-[#222] border border-[#333] focus:border-blue-500 rounded text-gray-200 font-mono outline-none w-44 text-right"
          title="Project name (used for saved files and exports)"
          spellCheck={false}
        />
        <span className={`w-2 h-2 rounded-full ${dirty ? 'bg-amber-400' : 'bg-emerald-500'}`} title={dirty ? 'Unsaved changes — Ctrl+S to save' : 'All changes saved'} />
      </div>

      {/* Save Custom Workspace Modal */}
      {isSavePromptOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <form 
            onSubmit={handleSaveWorkspaceSubmit}
            className="bg-[#2a2a2a] border border-[#444] rounded-lg p-5 w-80 shadow-2xl flex flex-col gap-4 text-white"
          >
            <div className="flex items-center gap-2 text-sm font-bold border-b border-[#3d3d3d] pb-2">
              <Layout size={16} className="text-blue-400" /> Save Custom Workspace
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              Save your current panel layout, visible windows, and active tabs as a custom workspace preset.
            </p>
            <input 
              type="text" 
              placeholder="e.g., My Audio Layout"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              autoFocus
              className="px-3 py-1.5 bg-[#181818] border border-[#444] focus:border-blue-500 rounded text-xs text-white outline-none"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsSavePromptOpen(false)}
                className="px-3 py-1.5 bg-[#3a3a3a] hover:bg-[#4a4a4a] text-gray-300 text-xs font-semibold rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newWorkspaceName.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded shadow"
              >
                Save Layout
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Help Modal */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
};
