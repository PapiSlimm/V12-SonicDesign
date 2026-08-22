import React, { useState, useRef, useEffect } from 'react';
import { BlendMode } from '../core/types';
import { useStore } from '../store/index';
import { ChevronDown, Check, Eye, Sliders, Layers } from 'lucide-react';

interface BlendModeDropdownProps {
  layerId: string;
  currentMode: BlendMode;
  className?: string;
}

interface BlendModeGroup {
  category: string;
  modes: { id: BlendMode; label: string; desc: string }[];
}

const BLEND_MODE_GROUPS: BlendModeGroup[] = [
  {
    category: 'Normal',
    modes: [
      { id: 'normal', label: 'Normal', desc: 'Standard pixel blending without filter effect' }
    ]
  },
  {
    category: 'Darken',
    modes: [
      { id: 'multiply', label: 'Multiply', desc: 'Multiplies colors. Ideal for shadows and darkening' },
      { id: 'darken', label: 'Darken', desc: 'Keeps dark pixels between blend and base' },
      { id: 'color-burn', label: 'Color Burn', desc: 'Increases contrast to darken base colors' }
    ]
  },
  {
    category: 'Lighten',
    modes: [
      { id: 'screen', label: 'Screen', desc: 'Inverts, multiplies, and inverts. Great for glow/highlights' },
      { id: 'lighten', label: 'Lighten', desc: 'Keeps light pixels between blend and base' },
      { id: 'color-dodge', label: 'Color Dodge', desc: 'Decreases contrast to brighten base colors' }
    ]
  },
  {
    category: 'Contrast',
    modes: [
      { id: 'overlay', label: 'Overlay', desc: 'Combines Multiply and Screen based on base color lightness' },
      { id: 'soft-light', label: 'Soft Light', desc: 'Subtle, soft spotlight lighting effect' },
      { id: 'hard-light', label: 'Hard Light', desc: 'Intense spotlight or harsh shadow effect' }
    ]
  },
  {
    category: 'Inversion & Comparative',
    modes: [
      { id: 'difference', label: 'Difference', desc: 'Subtracts darker color from lighter color' },
      { id: 'exclusion', label: 'Exclusion', desc: 'Lower contrast version of Difference' }
    ]
  },
  {
    category: 'Component Colors',
    modes: [
      { id: 'hue', label: 'Hue', desc: 'Applies blend hue with base saturation and luminosity' },
      { id: 'saturation', label: 'Saturation', desc: 'Applies blend saturation with base hue and luminosity' },
      { id: 'color', label: 'Color', desc: 'Applies blend hue and saturation with base luminosity' },
      { id: 'luminosity', label: 'Luminosity', desc: 'Applies blend luminosity with base hue and saturation' }
    ]
  }
];

export const BlendModeDropdown: React.FC<BlendModeDropdownProps> = ({
  layerId,
  currentMode,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeHoverMode, setActiveHoverMode] = useState<BlendMode | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { updateLayer, setPreviewBlendMode } = useStore();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setPreviewBlendMode(null);
        setActiveHoverMode(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setPreviewBlendMode]);

  const handleMouseEnterMode = (mode: BlendMode) => {
    setActiveHoverMode(mode);
    setPreviewBlendMode({ layerId, mode });
  };

  const handleMouseLeaveDropdown = () => {
    setActiveHoverMode(null);
    setPreviewBlendMode(null);
  };

  const handleSelectMode = (mode: BlendMode) => {
    updateLayer(layerId, { blendMode: mode });
    setPreviewBlendMode(null);
    setActiveHoverMode(null);
    setIsOpen(false);
  };

  const currentLabel = BLEND_MODE_GROUPS
    .flatMap(g => g.modes)
    .find(m => m.id === currentMode)?.label || currentMode;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Dropdown Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-7 bg-[#282828] hover:bg-[#333] border border-[#3e3e3e] hover:border-[#555] rounded px-2.5 flex items-center justify-between text-xs text-gray-200 transition-all select-none shadow-sm"
      >
        <span className="flex items-center gap-1.5 truncate">
          <span className="w-2 h-2 rounded-full bg-blue-400"></span>
          <span className="font-medium truncate capitalize">{currentLabel}</span>
          {activeHoverMode && (
            <span className="text-[9px] font-bold text-blue-400 bg-blue-950/80 px-1 rounded animate-pulse">
              Live Preview
            </span>
          )}
        </span>
        <ChevronDown size={12} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Categorized Dropdown List */}
      {isOpen && (
        <div 
          onMouseLeave={handleMouseLeaveDropdown}
          className="absolute top-full left-0 mt-1 w-64 bg-[#202020] border border-[#3a3a3a] rounded-lg shadow-2xl z-50 overflow-hidden text-xs text-gray-200 divide-y divide-[#2c2c2c] max-h-80 overflow-y-auto"
        >
          <div className="p-2 bg-[#181818] border-b border-[#2c2c2c] flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <Eye size={12} className="text-blue-400" /> Blending Mode Presets
            </span>
            <span className="text-[9px] text-blue-400 lowercase italic">Hover for live canvas preview</span>
          </div>

          {BLEND_MODE_GROUPS.map((group) => (
            <div key={group.category} className="py-1">
              <div className="px-3 py-1 text-[9px] font-bold text-gray-500 uppercase tracking-widest bg-[#1c1c1c]/50">
                {group.category}
              </div>

              {group.modes.map((mode) => {
                const isSelected = currentMode === mode.id;
                const isHovered = activeHoverMode === mode.id;

                return (
                  <button
                    key={mode.id}
                    onClick={() => handleSelectMode(mode.id)}
                    onMouseEnter={() => handleMouseEnterMode(mode.id)}
                    className={`w-full text-left px-3 py-1.5 flex flex-col transition-colors group ${
                      isHovered
                        ? 'bg-blue-600 text-white'
                        : isSelected
                        ? 'bg-blue-950/40 text-blue-300 font-semibold'
                        : 'hover:bg-[#2c2c2c] text-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] flex items-center gap-1.5">
                        {mode.label}
                        {isHovered && (
                          <span className="text-[8px] bg-white/20 px-1 rounded text-white font-mono">
                            Previewing
                          </span>
                        )}
                      </span>
                      {isSelected && <Check size={12} className={isHovered ? 'text-white' : 'text-blue-400'} />}
                    </div>
                    <span className={`text-[9px] mt-0.5 line-clamp-1 ${isHovered ? 'text-blue-100' : 'text-gray-500'}`}>
                      {mode.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
