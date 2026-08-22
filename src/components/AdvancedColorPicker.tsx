import React, { useState, useEffect, useRef } from 'react';
import { Palette, Plus, Trash2, Check, Copy, Sliders, Hash, Globe, ChevronDown } from 'lucide-react';
import { hexToHsl, hslToHex, hexToRgb, rgbToHex, rgbToHsl, hslToRgb, isValidHex, HSLA } from '../utils/colorUtils';
import { useStore } from '../store/index';

interface AdvancedColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
  compact?: boolean;
}

export const AdvancedColorPicker: React.FC<AdvancedColorPickerProps> = ({
  color,
  onChange,
  label = 'Color',
  compact = false
}) => {
  const [activeTab, setActiveTab] = useState<'hsl' | 'rgb' | 'hex' | 'variables'>('hsl');
  const [copied, setCopied] = useState(false);
  const [hexInput, setHexInput] = useState(color || '#3b82f6');

  // Global store values
  const colorSwatches = useStore((state) => state.colorSwatches);
  const addColorSwatch = useStore((state) => state.addColorSwatch);
  const removeColorSwatch = useStore((state) => state.removeColorSwatch);
  const globalColorVariables = useStore((state) => state.globalColorVariables);
  const addGlobalColorVariable = useStore((state) => state.addGlobalColorVariable);
  const updateGlobalColorVariable = useStore((state) => state.updateGlobalColorVariable);

  const [newVarName, setNewVarName] = useState('');
  const [isAddingVar, setIsAddingVar] = useState(false);

  // Derived HSL state from input color
  const hsla = hexToHsl(color || '#3b82f6');
  const rgba = hexToRgb(color || '#3b82f6');

  useEffect(() => {
    setHexInput(color || '#3b82f6');
  }, [color]);

  const handleHslChange = (h: number, s: number, l: number, a: number = hsla.a) => {
    const newHex = hslToHex(h, s, l, a);
    setHexInput(newHex);
    onChange(newHex);
  };

  const handleRgbChange = (r: number, g: number, b: number, a: number = rgba.a) => {
    const newHex = rgbToHex(r, g, b, a);
    setHexInput(newHex);
    onChange(newHex);
  };

  const handleHexSubmit = (val: string) => {
    let formatted = val.trim();
    if (!formatted.startsWith('#')) formatted = '#' + formatted;
    setHexInput(formatted);
    if (isValidHex(formatted)) {
      onChange(formatted);
    }
  };

  const handleCopyHex = () => {
    navigator.clipboard.writeText(color);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleAddSwatch = () => {
    if (color) {
      addColorSwatch(color);
    }
  };

  const handleCreateVariable = () => {
    if (newVarName.trim()) {
      addGlobalColorVariable(newVarName.trim(), color);
      setNewVarName('');
      setIsAddingVar(false);
    }
  };

  return (
    <div className={`flex flex-col gap-2 bg-[#18181b] border border-[#27272a] rounded-lg p-3 text-white shadow-xl ${compact ? 'max-w-xs' : 'w-full'}`}>
      {/* Header with Label & Current Color Preview */}
      <div className="flex items-center justify-between border-b border-[#27272a] pb-2">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <Palette size={13} className="text-blue-400" /> {label}
        </span>
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-mono font-bold text-gray-200">{color.toUpperCase()}</div>
          <div 
            className="w-6 h-6 rounded border border-white/20 shadow-inner relative overflow-hidden" 
            style={{ backgroundColor: color }} 
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#09090b] rounded border border-[#27272a]">
        {[
          { id: 'hsl', label: 'HSL', icon: Sliders },
          { id: 'rgb', label: 'RGB', icon: Sliders },
          { id: 'hex', label: 'Hex', icon: Hash },
          { id: 'variables', label: 'Global', icon: Globe },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-[#27272a]'
              }`}
            >
              <Icon size={11} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="py-1">
        {activeTab === 'hsl' && (
          <div className="flex flex-col gap-2.5">
            {/* Hue Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-300 font-mono">
                <span>Hue</span>
                <span className="text-blue-400">{hsla.h}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                value={hsla.h}
                onChange={(e) => handleHslChange(parseInt(e.target.value), hsla.s, hsla.l)}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'
                }}
              />
            </div>

            {/* Saturation Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-300 font-mono">
                <span>Saturation</span>
                <span className="text-blue-400">{hsla.s}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={hsla.s}
                onChange={(e) => handleHslChange(hsla.h, parseInt(e.target.value), hsla.l)}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${hslToHex(hsla.h, 0, hsla.l)}, ${hslToHex(hsla.h, 100, hsla.l)})`
                }}
              />
            </div>

            {/* Lightness Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-300 font-mono">
                <span>Lightness</span>
                <span className="text-blue-400">{hsla.l}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={hsla.l}
                onChange={(e) => handleHslChange(hsla.h, hsla.s, parseInt(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #000000, ${hslToHex(hsla.h, hsla.s, 50)}, #ffffff)`
                }}
              />
            </div>

            {/* Alpha / Opacity Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-300 font-mono">
                <span>Opacity</span>
                <span className="text-blue-400">{Math.round(hsla.a * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={hsla.a}
                onChange={(e) => handleHslChange(hsla.h, hsla.s, hsla.l, parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-blue-500 bg-[#27272a]"
              />
            </div>
          </div>
        )}

        {activeTab === 'rgb' && (
          <div className="flex flex-col gap-2.5">
            {/* Red Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-300 font-mono">
                <span className="text-red-400 font-bold">R (Red)</span>
                <span>{rgba.r}</span>
              </div>
              <input
                type="range"
                min="0"
                max="255"
                value={rgba.r}
                onChange={(e) => handleRgbChange(parseInt(e.target.value), rgba.g, rgba.b)}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-red-500"
                style={{
                  background: `linear-gradient(to right, ${rgbToHex(0, rgba.g, rgba.b)}, ${rgbToHex(255, rgba.g, rgba.b)})`
                }}
              />
            </div>

            {/* Green Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-300 font-mono">
                <span className="text-green-400 font-bold">G (Green)</span>
                <span>{rgba.g}</span>
              </div>
              <input
                type="range"
                min="0"
                max="255"
                value={rgba.g}
                onChange={(e) => handleRgbChange(rgba.r, parseInt(e.target.value), rgba.b)}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-green-500"
                style={{
                  background: `linear-gradient(to right, ${rgbToHex(rgba.r, 0, rgba.b)}, ${rgbToHex(rgba.r, 255, rgba.b)})`
                }}
              />
            </div>

            {/* Blue Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-300 font-mono">
                <span className="text-blue-400 font-bold">B (Blue)</span>
                <span>{rgba.b}</span>
              </div>
              <input
                type="range"
                min="0"
                max="255"
                value={rgba.b}
                onChange={(e) => handleRgbChange(rgba.r, rgba.g, parseInt(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-blue-500"
                style={{
                  background: `linear-gradient(to right, ${rgbToHex(rgba.r, rgba.g, 0)}, ${rgbToHex(rgba.r, rgba.g, 255)})`
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'hex' && (
          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <span className="text-[10px] text-gray-400">Hex Code Input</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={hexInput}
                  onChange={(e) => handleHexSubmit(e.target.value)}
                  placeholder="#3B82F6"
                  className="flex-1 bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleCopyHex}
                  title="Copy Hex Code"
                  className="px-3 py-1.5 bg-[#27272a] hover:bg-[#3f3f46] text-gray-200 text-xs rounded font-medium flex items-center gap-1 transition-colors"
                >
                  {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="p-2 bg-[#09090b] rounded border border-[#27272a] text-[10px] text-gray-400 space-y-1 font-mono">
              <div className="flex justify-between">
                <span>RGBA:</span>
                <span className="text-gray-200">rgba({rgba.r}, {rgba.g}, {rgba.b}, {rgba.a})</span>
              </div>
              <div className="flex justify-between">
                <span>HSLA:</span>
                <span className="text-gray-200">hsla({hsla.h}°, {hsla.s}%, {hsla.l}%, {hsla.a})</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'variables' && (
          <div className="flex flex-col gap-2.5 max-h-48 overflow-y-auto">
            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <span>Global Color Variables</span>
              {!isAddingVar && (
                <button
                  onClick={() => setIsAddingVar(true)}
                  className="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 text-[10px]"
                >
                  <Plus size={11} /> New Variable
                </button>
              )}
            </div>

            {isAddingVar && (
              <div className="p-2 bg-[#09090b] rounded border border-blue-500/50 flex flex-col gap-1.5">
                <input
                  type="text"
                  placeholder="Variable Name (e.g. Primary Accent)"
                  value={newVarName}
                  onChange={(e) => setNewVarName(e.target.value)}
                  className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setIsAddingVar(false)}
                    className="px-2 py-1 bg-[#27272a] text-gray-400 hover:text-white rounded text-[10px]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateVariable}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold"
                  >
                    Save Variable
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              {globalColorVariables.length === 0 ? (
                <div className="text-[10px] text-gray-500 italic p-2 text-center">
                  No global color variables defined yet. Create one to keep color palettes consistent!
                </div>
              ) : (
                globalColorVariables.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-1.5 bg-[#09090b] hover:bg-[#27272a] rounded border border-[#27272a] cursor-pointer group"
                    onClick={() => onChange(v.value)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-4 h-4 rounded-full border border-white/20 flex-shrink-0"
                        style={{ backgroundColor: v.value }}
                      />
                      <span className="text-[11px] font-medium text-gray-200 truncate">{v.name}</span>
                    </div>
                    <div className="flex items-center gap-1 font-mono text-[10px] text-gray-400">
                      <span>{v.value}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateGlobalColorVariable(v.id, color);
                        }}
                        title="Update variable to current color"
                        className="p-0.5 hover:bg-blue-600/30 hover:text-blue-300 rounded text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Check size={11} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Saved Color Swatches Palette */}
      <div className="border-t border-[#27272a] pt-2 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Palette Swatches</span>
          <button
            onClick={handleAddSwatch}
            title="Save current color as swatch"
            className="text-blue-400 hover:text-blue-300 text-[10px] font-bold flex items-center gap-1 hover:underline"
          >
            <Plus size={11} /> Add Swatch
          </button>
        </div>

        <div className="grid grid-cols-8 gap-1.5 max-h-20 overflow-y-auto p-1 bg-[#09090b] rounded border border-[#27272a]">
          {colorSwatches.map((s, idx) => (
            <div
              key={idx}
              onClick={() => onChange(s)}
              onContextMenu={(e) => {
                e.preventDefault();
                removeColorSwatch(s);
              }}
              title={`${s} (Right-click to remove)`}
              className="w-5 h-5 rounded border border-white/20 hover:scale-110 cursor-pointer transition-transform relative group shadow-sm"
              style={{ backgroundColor: s }}
            >
              <div className="absolute inset-0 bg-black/40 rounded opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Trash2
                  size={10}
                  className="text-white hover:text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeColorSwatch(s);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
