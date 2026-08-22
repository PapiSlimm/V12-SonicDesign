import React from 'react';
import { Tool, BlendMode } from '../core/types';
import { ZoomIn, Minus, Settings2, Layers, Sliders } from 'lucide-react';
import { useStore } from '../store/index';

interface OptionsBarProps {
  selectedTool: Tool;
  brushSize: number;
  setBrushSize: (s: number) => void;
  brushOpacity: number;
  setBrushOpacity: (o: number) => void;
}

const COMMON_BLEND_MODES: { group: string; modes: { value: BlendMode; label: string }[] }[] = [
  {
    group: 'Standard',
    modes: [
      { value: 'normal', label: 'Normal' },
    ]
  },
  {
    group: 'Darken',
    modes: [
      { value: 'multiply', label: 'Multiply' },
      { value: 'darken', label: 'Darken' },
      { value: 'color-burn', label: 'Color Burn' },
    ]
  },
  {
    group: 'Lighten',
    modes: [
      { value: 'screen', label: 'Screen' },
      { value: 'lighten', label: 'Lighten' },
      { value: 'color-dodge', label: 'Color Dodge' },
    ]
  },
  {
    group: 'Contrast',
    modes: [
      { value: 'overlay', label: 'Overlay' },
      { value: 'soft-light', label: 'Soft Light' },
      { value: 'hard-light', label: 'Hard Light' },
    ]
  },
  {
    group: 'Comparative',
    modes: [
      { value: 'difference', label: 'Difference' },
      { value: 'exclusion', label: 'Exclusion' },
    ]
  },
  {
    group: 'Color',
    modes: [
      { value: 'hue', label: 'Hue' },
      { value: 'saturation', label: 'Saturation' },
      { value: 'color', label: 'Color' },
      { value: 'luminosity', label: 'Luminosity' },
    ]
  }
];

export const OptionsBar: React.FC<OptionsBarProps> = ({ 
  selectedTool, 
  brushSize, 
  setBrushSize, 
  brushOpacity, 
  setBrushOpacity 
}) => {
  const { 
    selection, 
    setSelection, 
    gradientOptions, 
    setGradientOptions, 
    selectedLayerId, 
    layers, 
    updateLayer 
  } = useStore();

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  return (
    <div className="h-10 bg-[#242427] border-b border-[#18181b] flex items-center px-4 gap-6 text-[11px] text-gray-300 z-20 overflow-x-auto no-scrollbar shadow-inner">
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-gray-500 uppercase tracking-wider font-bold text-[9px]">Tool:</span>
        <span className="text-blue-400 capitalize font-medium">{selectedTool}</span>
      </div>
      
      {/* Blend Mode Dropdown Selector for Selected Layer */}
      <div className="flex items-center gap-2 shrink-0 pl-2 border-l border-[#3f3f46]/50">
        <div className="flex items-center gap-1.5 text-gray-400">
          <Layers size={13} className="text-blue-400" />
          <span className="text-[9px] uppercase tracking-wider font-bold text-gray-400">Blend:</span>
        </div>
        <select
          value={selectedLayer?.blendMode || 'normal'}
          disabled={!selectedLayer}
          onChange={(e) => {
            if (selectedLayerId) {
              updateLayer(selectedLayerId, { blendMode: e.target.value as BlendMode });
            }
          }}
          className={`bg-[#18181b] border rounded px-2 py-1 text-xs outline-none transition-colors cursor-pointer font-medium ${
            selectedLayer 
              ? 'border-[#3f3f46] text-white hover:border-blue-500 focus:border-blue-500' 
              : 'border-[#27272a] text-gray-500 cursor-not-allowed opacity-60'
          }`}
          title={selectedLayer ? `Blend mode for "${selectedLayer.name}"` : 'Select a layer to change blend mode'}
        >
          {COMMON_BLEND_MODES.map((grp) => (
            <optgroup key={grp.group} label={grp.group} className="bg-[#18181b] text-gray-400 text-[11px]">
              {grp.modes.map((mode) => (
                <option key={mode.value} value={mode.value} className="bg-[#18181b] text-white">
                  {mode.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {selectedLayer && (
          <div className="flex items-center gap-1.5 ml-1">
            <span className="text-[9px] uppercase tracking-wider font-bold text-gray-500">Opacity:</span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round((selectedLayer.opacity ?? 1) * 100)}
              onChange={(e) => {
                updateLayer(selectedLayer.id, { opacity: parseInt(e.target.value) / 100 });
              }}
              className="w-16 h-1 bg-[#18181b] rounded-full appearance-none cursor-pointer accent-blue-500"
              title="Layer opacity"
            />
            <span className="text-[10px] font-mono text-blue-400 w-8">
              {Math.round((selectedLayer.opacity ?? 1) * 100)}%
            </span>
          </div>
        )}
      </div>

      {(selectedTool === 'brush' || selectedTool === 'eraser') && (
        <div className="flex items-center gap-4 shrink-0 pl-2 border-l border-[#3f3f46]/50">
          <div className="flex items-center gap-2 shrink-0">
            <span>Brush Size:</span>
            <input 
              type="range" 
              min="1" 
              max="500" 
              value={brushSize} 
              onChange={(e) => setBrushSize(parseInt(e.target.value))}
              className="w-20 h-1 bg-[#18181b] rounded-full appearance-none cursor-pointer accent-blue-500"
            />
            <span className="w-8 font-mono">{brushSize}px</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span>Brush Opacity:</span>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={brushOpacity * 100} 
              onChange={(e) => setBrushOpacity(parseInt(e.target.value) / 100)}
              className="w-20 h-1 bg-[#18181b] rounded-full appearance-none cursor-pointer accent-blue-500"
            />
            <span className="w-8 font-mono">{Math.round(brushOpacity * 100)}%</span>
          </div>
        </div>
      )}

      {(selectedTool === 'marquee' || selectedTool === 'lasso') && (
        <div className="flex items-center gap-4 shrink-0 pl-2 border-l border-[#3f3f46]/50">
          <div className="flex items-center gap-2">
            <span>Feather:</span>
            <input 
              type="number" 
              min="0" 
              max="100" 
              value={selection.feather} 
              onChange={(e) => setSelection({ feather: parseInt(e.target.value) })}
              className="w-12 bg-[#18181b] border border-[#3a3a3a] rounded px-1 py-0.5 text-xs text-white"
            />
            <span>px</span>
          </div>
          {selectedTool === 'marquee' && (
            <div className="flex items-center gap-2">
              <span>Style:</span>
              <select 
                value={selection.style}
                onChange={(e) => setSelection({ style: e.target.value as any })}
                className="bg-[#18181b] border border-[#3a3a3a] rounded px-1 py-0.5 text-xs text-white"
              >
                <option value="normal">Normal</option>
                <option value="fixed-ratio">Fixed Ratio</option>
                <option value="fixed-size">Fixed Size</option>
              </select>
            </div>
          )}
        </div>
      )}

      {selectedTool === 'gradient' && (
        <div className="flex items-center gap-4 shrink-0 pl-2 border-l border-[#3f3f46]/50">
          <div className="flex items-center gap-2">
            <span>Type:</span>
            <select 
              value={gradientOptions.type}
              onChange={(e) => setGradientOptions({ type: e.target.value as any })}
              className="bg-[#18181b] border border-[#3a3a3a] rounded px-1 py-0.5 text-xs text-white"
            >
              <option value="linear">Linear</option>
              <option value="radial">Radial</option>
              <option value="conic">Conic</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span>Angle:</span>
            <input 
              type="number" 
              value={gradientOptions.angle} 
              onChange={(e) => setGradientOptions({ angle: parseInt(e.target.value) })}
              className="w-12 bg-[#18181b] border border-[#3a3a3a] rounded px-1 py-0.5 text-xs text-white"
            />
            <span>°</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Colors:</span>
            {gradientOptions.colors.map((color, idx) => (
              <input 
                key={idx}
                type="color" 
                value={color} 
                onChange={(e) => {
                  const newColors = [...gradientOptions.colors];
                  newColors[idx] = e.target.value;
                  setGradientOptions({ colors: newColors });
                }}
                className="w-6 h-6 bg-transparent border-none cursor-pointer"
              />
            ))}
          </div>
        </div>
      )}

      {selectedTool === 'zoom' && (
        <div className="flex items-center gap-2 shrink-0 pl-2 border-l border-[#3f3f46]/50">
          <button className="p-1 hover:bg-[#3a3a3a] rounded"><ZoomIn size={14} /></button>
          <button className="p-1 hover:bg-[#3a3a3a] rounded"><Minus size={14} /></button>
          <span className="ml-2 font-mono">100%</span>
        </div>
      )}
    </div>
  );
};

