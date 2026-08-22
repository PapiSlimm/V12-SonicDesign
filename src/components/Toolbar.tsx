import React from 'react';
import { Tool } from '../core/types';
import { 
  Move, 
  Square, 
  Lasso, 
  Paintbrush, 
  Eraser, 
  Hand, 
  ZoomIn, 
  Crop,
  Type as TypeIcon,
  Wind,
  Pipette,
  Layers,
  PenTool,
  Keyboard,
  Sparkles
} from 'lucide-react';
import { useStore } from '../store';

interface ToolbarProps {
  selectedTool: Tool;
  setSelectedTool: (t: Tool) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ selectedTool, setSelectedTool }) => {
  const { setIsShortcutsModalOpen, addLayer, setSelectedLayerId } = useStore();

  const tools: { id: Tool, icon: any, label: string, shortcut: string }[] = [
    { id: 'move', icon: Move, label: 'Move / Selection (V)', shortcut: 'V' },
    { id: 'pen', icon: PenTool, label: 'Vector Pen Tool (P)', shortcut: 'P' },
    { id: 'brush', icon: Paintbrush, label: 'Brush (B)', shortcut: 'B' },
    { id: 'eraser', icon: Eraser, label: 'Eraser (E)', shortcut: 'E' },
    { id: 'marquee', icon: Square, label: 'Marquee (M)', shortcut: 'M' },
    { id: 'lasso', icon: Lasso, label: 'Lasso (L)', shortcut: 'L' },
    { id: 'text', icon: TypeIcon, label: 'Text Tool (T)', shortcut: 'T' },
    { id: 'text-animator', icon: Wind, label: 'Text Animator', shortcut: 'Shift+T' },
    { id: 'motion-path', icon: Wind, label: 'Motion Path', shortcut: 'Shift+P' },
    { id: 'gradient', icon: Layers, label: 'Gradient (G)', shortcut: 'G' },
    { id: 'eyedropper', icon: Pipette, label: 'Eyedropper (I)', shortcut: 'I' },
    { id: 'hand', icon: Hand, label: 'Hand / Pan (Space)', shortcut: 'Space' },
    { id: 'zoom', icon: ZoomIn, label: 'Zoom (Z)', shortcut: 'Z' },
    { id: 'crop', icon: Crop, label: 'Crop (C)', shortcut: 'C' },
  ];

  const handleAddParticleLayer = () => {
    const particleLayerId = `particles-${Date.now()}`;
    addLayer({
      id: particleLayerId,
      name: 'Procedural Particles',
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'screen',
      bitmap: null,
      adjustments: { brightness: 100, contrast: 100, saturation: 100, hue: 0, opacity: 1 },
      transform: { x: 960, y: 540, scaleX: 1, scaleY: 1, rotation: 0 },
      proceduralSettings: {
        type: 'particles',
        particles: {
          enabled: true,
          preset: 'sparks',
          count: 120,
          speed: 4,
          life: 2.5,
          size: 6,
          color: '#f59e0b',
          secondaryColor: '#ef4444',
          gravity: 2,
          spread: 120,
          blendMode: 'screen',
          turbulence: 5,
          emitterX: 0,
          emitterY: 0,
          rate: 40
        }
      }
    });
    setSelectedLayerId(particleLayerId);
  };

  return (
    <div className="w-12 bg-[#18181c] border-r border-[#2a2a32] flex flex-col items-center py-2 justify-between z-20">
      <div className="flex flex-col items-center gap-1 w-full px-1">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setSelectedTool(tool.id)}
            className={`p-2 rounded-lg transition-all group relative flex items-center justify-center ${
              selectedTool === tool.id 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold' 
                : 'text-gray-400 hover:bg-[#282832] hover:text-white'
            }`}
            title={tool.label}
          >
            <tool.icon size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-[#111] border border-[#333] text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 font-sans">
              {tool.label}
            </span>
          </button>
        ))}

        <div className="w-6 h-[1px] bg-[#333] my-1" />

        {/* Quick Particle System Layer Button */}
        <button
          onClick={handleAddParticleLayer}
          className="p-2 rounded-lg transition-all group relative flex items-center justify-center text-amber-400 hover:bg-amber-950/40 hover:text-amber-300 border border-amber-500/20"
          title="Add Procedural Particle System Node"
        >
          <Sparkles size={18} />
          <span className="absolute left-full ml-2 px-2 py-1 bg-[#111] border border-amber-500/50 text-amber-300 text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 font-sans font-bold">
            + Particle System Node
          </span>
        </button>
      </div>

      {/* Keyboard Shortcuts Trigger Button */}
      <div className="flex flex-col items-center gap-1 px-1">
        <button
          onClick={() => setIsShortcutsModalOpen(true)}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#282832] transition-colors group relative"
          title="Keyboard Shortcuts Reference (?)"
        >
          <Keyboard size={18} />
          <span className="absolute left-full ml-2 px-2 py-1 bg-[#111] border border-[#333] text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 font-sans">
            Shortcuts Guide (?)
          </span>
        </button>
      </div>
    </div>
  );
};
