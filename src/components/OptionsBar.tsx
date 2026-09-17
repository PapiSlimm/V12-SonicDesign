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
  const selection = useStore(s => s.selection);
  const setSelection = useStore(s => s.setSelection);
  const gradientOptions = useStore(s => s.gradientOptions);
  const setGradientOptions = useStore(s => s.setGradientOptions);
  const selectedLayerId = useStore(s => s.selectedLayerId);
  const layers = useStore(s => s.layers);
  const updateLayer = useStore(s => s.updateLayer);
  const zoom = useStore(s => s.zoom);
  const setZoom = useStore(s => s.setZoom);
  const brushColor = useStore(s => s.brushColor);
  const setBrushColor = useStore(s => s.setBrushColor);
  const smartGuidesEnabled = useStore(s => s.smartGuidesEnabled);
  const setSmartGuidesEnabled = useStore(s => s.setSmartGuidesEnabled);

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
          {selectedTool === 'brush' && (
            <div className="flex items-center gap-2 shrink-0">
              <span>Color:</span>
              <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="w-6 h-6 bg-transparent border-none cursor-pointer" title="Brush color" />
            </div>
          )}
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
              onChange={(e) => setSelection({ feather: Math.max(0, parseInt(e.target.value) || 0) })}
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
              {selection.style === 'fixed-ratio' && (
                <>
                  <span>Ratio:</span>
                  <input type="number" step="0.1" min="0.1" value={selection.aspectRatio} onChange={(e) => setSelection({ aspectRatio: Math.max(0.1, parseFloat(e.target.value) || 1) })} className="w-14 bg-[#18181b] border border-[#3a3a3a] rounded px-1 py-0.5 text-xs text-white" />
                </>
              )}
              {selection.style === 'fixed-size' && (
                <>
                  <input type="number" min="1" value={selection.fixedWidth} onChange={(e) => setSelection({ fixedWidth: Math.max(1, parseInt(e.target.value) || 100) })} className="w-14 bg-[#18181b] border border-[#3a3a3a] rounded px-1 py-0.5 text-xs text-white" title="Width" />
                  <span>×</span>
                  <input type="number" min="1" value={selection.fixedHeight} onChange={(e) => setSelection({ fixedHeight: Math.max(1, parseInt(e.target.value) || 100) })} className="w-14 bg-[#18181b] border border-[#3a3a3a] rounded px-1 py-0.5 text-xs text-white" title="Height" />
                </>
              )}
            </div>
          )}
          {selection.active && (
            <button onClick={() => setSelection({ active: false, type: null, points: [] })} className="px-2 py-0.5 bg-[#333] hover:bg-[#444] rounded text-[10px]">Deselect (Esc)</button>
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
          <button onClick={() => setZoom(zoom * 1.25)} className="p-1 hover:bg-[#3a3a3a] rounded" title="Zoom in"><ZoomIn size={14} /></button>
          <button onClick={() => setZoom(zoom / 1.25)} className="p-1 hover:bg-[#3a3a3a] rounded" title="Zoom out"><Minus size={14} /></button>
          {[0.25, 0.5, 1, 2].map(z => (
            <button key={z} onClick={() => setZoom(z)} className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${Math.abs(zoom - z) < 0.01 ? 'bg-blue-600 text-white' : 'hover:bg-[#3a3a3a]'}`}>{z * 100}%</button>
          ))}
          <span className="ml-2 font-mono">{Math.round(zoom * 100)}%</span>
          <span className="text-gray-500 text-[10px]">Click canvas to zoom in · Alt+click to zoom out</span>
        </div>
      )}

      {selectedTool === 'move' && (
        <div className="flex items-center gap-3 shrink-0 pl-2 border-l border-[#3f3f46]/50">
          <label className="flex items-center gap-1.5 cursor-pointer" title="Smart guides & snapping (Ctrl+Shift+G)">
            <input type="checkbox" checked={smartGuidesEnabled} onChange={(e) => setSmartGuidesEnabled(e.target.checked)} className="accent-fuchsia-500" />
            <span>Snap</span>
          </label>
          <span className="text-gray-500 text-[10px]">Click to select · Shift+click multi-select · Double-click for properties</span>
        </div>
      )}

      {(selectedTool === 'pen' || selectedTool === 'motion-path' || selectedTool === 'crop' || selectedTool === 'text' || selectedTool === 'text-animator' || selectedTool === 'eyedropper') && (
        <div className="flex items-center gap-2 shrink-0 pl-2 border-l border-[#3f3f46]/50 text-gray-500 text-[10px]">
          {selectedTool === 'pen' && 'Click to add anchors · click the first anchor to close · Alt+click anchor for curve handles · double-click anchor to delete'}
          {selectedTool === 'motion-path' && 'Drag on the canvas to draw a path for the selected layer'}
          {selectedTool === 'crop' && 'Drag a rectangle over the selected image layer to crop it'}
          {selectedTool === 'text' && 'Click on the canvas to place a text layer'}
          {selectedTool === 'text-animator' && 'Click on the canvas to place an animated text layer'}
          {selectedTool === 'eyedropper' && 'Click to sample a color · Alt+click applies it to the selected layer'}
        </div>
      )}
    </div>
  );
};

