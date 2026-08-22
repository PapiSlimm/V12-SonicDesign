import React, { useState } from 'react';
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

  const {
    currentWorkspace,
    customWorkspaces,
    setWorkspace,
    saveCustomWorkspace
  } = useStore();

  const presetWorkspaces = ['Animation', 'Compositing', 'Editing', 'Standard Studio'];

  const menus = [
    { label: 'File', items: ['New', 'Open', 'Import Asset', 'Save', 'Export'] },
    { label: 'Edit', items: ['Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Fill'] },
    { label: 'Image', items: ['Adjustments', 'Curves', 'Chroma Key', 'LUTs'] },
    { label: 'Layer', items: ['New Layer', 'Duplicate Layer', 'Delete Layer', 'Merge Visible'] },
    { label: 'Motion', items: ['Keyframing', 'Graph Editor', 'Easing Editor', 'Motion Paths', 'Physics'] },
    { label: 'Typography', items: ['Kinetic Text', '3D Text Engine', 'Variable Fonts'] },
    { label: 'AI', items: ['Generative Fill', 'Sky Replacement', 'Enhance', 'Auto-Animate'] },
    { label: 'Window', items: ['Layers', 'Properties', 'History', 'Timeline'] },
    { label: 'Help', items: ['About', 'Shortcuts'] },
  ];

  const handleSaveWorkspaceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newWorkspaceName.trim()) {
      saveCustomWorkspace(newWorkspaceName.trim());
      setNewWorkspaceName('');
      setIsSavePromptOpen(false);
    }
  };

  return (
    <div className="h-8 bg-[#1a1a1a] border-b border-[#0a0a0a] flex items-center justify-between px-4 text-[11px] text-gray-300 z-30 select-none">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 mr-2">
          <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-[10px]">V</div>
          <span className="font-semibold text-white">V12SonicDesign Studio</span>
        </div>

        {menus.map((menu) => (
          <div key={menu.label} className="relative group cursor-default hover:bg-[#3a3a3a] px-2 py-1 rounded">
            {menu.label}
            <div className="absolute top-full left-0 mt-0 w-40 bg-[#2a2a2a] border border-[#1a1a1a] shadow-xl hidden group-hover:block z-50 rounded-b">
              {menu.items.map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    if (item === 'Shortcuts' || item === 'About') {
                      setIsHelpOpen(true);
                    } else {
                      onAction(`${menu.label}:${item}`);
                    }
                  }}
                  className="w-full text-left px-4 py-1.5 hover:bg-blue-600 hover:text-white text-gray-300 text-[11px] transition-colors"
                >
                  {item}
                </button>
              ))}
            </div>
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

      {/* Right status details or quick workspace badge */}
      <div className="flex items-center gap-2 text-[10px] text-gray-400">
        <span className="px-2 py-0.5 bg-[#222] border border-[#333] rounded text-gray-400 font-mono">
          Layout: {currentWorkspace}
        </span>
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
