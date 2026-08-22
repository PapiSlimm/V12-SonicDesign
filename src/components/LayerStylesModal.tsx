import React, { useState } from 'react';
import { Layer, LayerStyles } from '../core/types';
import { Sliders, X, Check, Sun, Shield, Sparkles, Layers, Droplet } from 'lucide-react';

interface LayerStylesModalProps {
  layer: Layer;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStyle: (styleType: keyof LayerStyles, updates: any) => void;
}

export const LayerStylesModal: React.FC<LayerStylesModalProps> = ({
  layer,
  isOpen,
  onClose,
  onUpdateStyle,
}) => {
  const [activeTab, setActiveTab] = useState<'dropShadow' | 'innerShadow' | 'outerGlow' | 'stroke' | 'bevelEmboss'>('dropShadow');

  if (!isOpen) return null;

  const styles = layer.layerStyles || {};

  const currentDropShadow = styles.dropShadow || { enabled: false, color: '#000000', opacity: 0.75, distance: 10, size: 15, angle: 120 };
  const currentInnerShadow = styles.innerShadow || { enabled: false, color: '#000000', opacity: 0.5, distance: 5, size: 8 };
  const currentOuterGlow = styles.outerGlow || { enabled: false, color: '#3b82f6', opacity: 0.8, distance: 0, size: 20 };
  const currentStroke = styles.stroke || { enabled: false, color: '#ffffff', width: 2, opacity: 1 };
  const currentBevel = styles.bevelEmboss || { enabled: false, color: '#ffffff', opacity: 0.6, distance: 4, size: 6 };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col h-[520px]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#27272a] bg-[#09090b]">
          <div className="flex items-center gap-2">
            <Sliders className="text-blue-500" size={18} />
            <h2 className="text-sm font-bold text-white tracking-wide">
              Layer Styles <span className="text-gray-400 font-normal">({layer.name})</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white hover:bg-[#27272a] rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body Grid */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar Tabs */}
          <div className="w-48 border-r border-[#27272a] bg-[#09090b]/50 p-2 flex flex-col gap-1">
            {[
              { id: 'dropShadow', label: 'Drop Shadow', enabled: currentDropShadow.enabled },
              { id: 'innerShadow', label: 'Inner Shadow', enabled: currentInnerShadow.enabled },
              { id: 'outerGlow', label: 'Outer Glow', enabled: currentOuterGlow.enabled },
              { id: 'stroke', label: 'Stroke / Border', enabled: currentStroke.enabled },
              { id: 'bevelEmboss', label: 'Bevel & Emboss', enabled: currentBevel.enabled },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-gray-400 hover:bg-[#27272a] hover:text-gray-200'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    tab.enabled ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-gray-600'
                  }`}
                />
              </button>
            ))}
          </div>

          {/* Right Tab Content */}
          <div className="flex-1 p-6 overflow-y-auto bg-[#18181b]">
            {activeTab === 'dropShadow' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#27272a]">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={currentDropShadow.enabled}
                      onChange={(e) => onUpdateStyle('dropShadow', { ...currentDropShadow, enabled: e.target.checked })}
                      className="w-4 h-4 rounded bg-[#09090b] border-[#3f3f46] text-blue-600 focus:ring-0 accent-blue-500"
                    />
                    <span className="text-xs font-bold text-white">Enable Drop Shadow</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[11px] text-gray-400">Shadow Color</span>
                    <div className="flex items-center gap-2 bg-[#09090b] border border-[#27272a] p-1.5 rounded-lg">
                      <input
                        type="color"
                        value={currentDropShadow.color}
                        onChange={(e) => onUpdateStyle('dropShadow', { ...currentDropShadow, color: e.target.value })}
                        className="w-6 h-6 rounded cursor-pointer border-none bg-transparent"
                      />
                      <span className="text-xs font-mono text-gray-300">{currentDropShadow.color}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>Opacity</span>
                      <span className="font-mono text-blue-400">{Math.round(currentDropShadow.opacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(currentDropShadow.opacity * 100)}
                      onChange={(e) => onUpdateStyle('dropShadow', { ...currentDropShadow, opacity: parseInt(e.target.value) / 100 })}
                      className="w-full h-1.5 bg-[#27272a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>Distance (Offset)</span>
                      <span className="font-mono text-blue-400">{currentDropShadow.distance}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={currentDropShadow.distance}
                      onChange={(e) => onUpdateStyle('dropShadow', { ...currentDropShadow, distance: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-[#27272a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>Blur Size</span>
                      <span className="font-mono text-blue-400">{currentDropShadow.size}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={currentDropShadow.size}
                      onChange={(e) => onUpdateStyle('dropShadow', { ...currentDropShadow, size: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-[#27272a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'innerShadow' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#27272a]">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={currentInnerShadow.enabled}
                      onChange={(e) => onUpdateStyle('innerShadow', { ...currentInnerShadow, enabled: e.target.checked })}
                      className="w-4 h-4 rounded bg-[#09090b] border-[#3f3f46] text-blue-600 focus:ring-0 accent-blue-500"
                    />
                    <span className="text-xs font-bold text-white">Enable Inner Shadow</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[11px] text-gray-400">Color</span>
                    <div className="flex items-center gap-2 bg-[#09090b] border border-[#27272a] p-1.5 rounded-lg">
                      <input
                        type="color"
                        value={currentInnerShadow.color}
                        onChange={(e) => onUpdateStyle('innerShadow', { ...currentInnerShadow, color: e.target.value })}
                        className="w-6 h-6 rounded cursor-pointer border-none bg-transparent"
                      />
                      <span className="text-xs font-mono text-gray-300">{currentInnerShadow.color}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>Opacity</span>
                      <span className="font-mono text-blue-400">{Math.round(currentInnerShadow.opacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(currentInnerShadow.opacity * 100)}
                      onChange={(e) => onUpdateStyle('innerShadow', { ...currentInnerShadow, opacity: parseInt(e.target.value) / 100 })}
                      className="w-full h-1.5 bg-[#27272a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>Distance</span>
                      <span className="font-mono text-blue-400">{currentInnerShadow.distance}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      value={currentInnerShadow.distance}
                      onChange={(e) => onUpdateStyle('innerShadow', { ...currentInnerShadow, distance: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-[#27272a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>Blur Size</span>
                      <span className="font-mono text-blue-400">{currentInnerShadow.size}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      value={currentInnerShadow.size}
                      onChange={(e) => onUpdateStyle('innerShadow', { ...currentInnerShadow, size: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-[#27272a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'outerGlow' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#27272a]">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={currentOuterGlow.enabled}
                      onChange={(e) => onUpdateStyle('outerGlow', { ...currentOuterGlow, enabled: e.target.checked })}
                      className="w-4 h-4 rounded bg-[#09090b] border-[#3f3f46] text-blue-600 focus:ring-0 accent-blue-500"
                    />
                    <span className="text-xs font-bold text-white">Enable Outer Glow</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[11px] text-gray-400">Glow Color</span>
                    <div className="flex items-center gap-2 bg-[#09090b] border border-[#27272a] p-1.5 rounded-lg">
                      <input
                        type="color"
                        value={currentOuterGlow.color}
                        onChange={(e) => onUpdateStyle('outerGlow', { ...currentOuterGlow, color: e.target.value })}
                        className="w-6 h-6 rounded cursor-pointer border-none bg-transparent"
                      />
                      <span className="text-xs font-mono text-gray-300">{currentOuterGlow.color}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>Opacity</span>
                      <span className="font-mono text-blue-400">{Math.round(currentOuterGlow.opacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(currentOuterGlow.opacity * 100)}
                      onChange={(e) => onUpdateStyle('outerGlow', { ...currentOuterGlow, opacity: parseInt(e.target.value) / 100 })}
                      className="w-full h-1.5 bg-[#27272a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div className="space-y-1 col-span-2">
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>Glow Radius / Size</span>
                      <span className="font-mono text-blue-400">{currentOuterGlow.size}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={currentOuterGlow.size}
                      onChange={(e) => onUpdateStyle('outerGlow', { ...currentOuterGlow, size: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-[#27272a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'stroke' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#27272a]">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={currentStroke.enabled}
                      onChange={(e) => onUpdateStyle('stroke', { ...currentStroke, enabled: e.target.checked })}
                      className="w-4 h-4 rounded bg-[#09090b] border-[#3f3f46] text-blue-600 focus:ring-0 accent-blue-500"
                    />
                    <span className="text-xs font-bold text-white">Enable Stroke Effect</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[11px] text-gray-400">Stroke Color</span>
                    <div className="flex items-center gap-2 bg-[#09090b] border border-[#27272a] p-1.5 rounded-lg">
                      <input
                        type="color"
                        value={currentStroke.color}
                        onChange={(e) => onUpdateStyle('stroke', { ...currentStroke, color: e.target.value })}
                        className="w-6 h-6 rounded cursor-pointer border-none bg-transparent"
                      />
                      <span className="text-xs font-mono text-gray-300">{currentStroke.color}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>Stroke Width</span>
                      <span className="font-mono text-blue-400">{currentStroke.width}px</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={50}
                      value={currentStroke.width}
                      onChange={(e) => onUpdateStyle('stroke', { ...currentStroke, width: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-[#27272a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div className="space-y-1 col-span-2">
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>Stroke Opacity</span>
                      <span className="font-mono text-blue-400">{Math.round(currentStroke.opacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(currentStroke.opacity * 100)}
                      onChange={(e) => onUpdateStyle('stroke', { ...currentStroke, opacity: parseInt(e.target.value) / 100 })}
                      className="w-full h-1.5 bg-[#27272a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'bevelEmboss' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#27272a]">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={currentBevel.enabled}
                      onChange={(e) => onUpdateStyle('bevelEmboss', { ...currentBevel, enabled: e.target.checked })}
                      className="w-4 h-4 rounded bg-[#09090b] border-[#3f3f46] text-blue-600 focus:ring-0 accent-blue-500"
                    />
                    <span className="text-xs font-bold text-white">Enable Bevel & Emboss</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[11px] text-gray-400">Highlight Color</span>
                    <div className="flex items-center gap-2 bg-[#09090b] border border-[#27272a] p-1.5 rounded-lg">
                      <input
                        type="color"
                        value={currentBevel.color}
                        onChange={(e) => onUpdateStyle('bevelEmboss', { ...currentBevel, color: e.target.value })}
                        className="w-6 h-6 rounded cursor-pointer border-none bg-transparent"
                      />
                      <span className="text-xs font-mono text-gray-300">{currentBevel.color}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>Depth / Size</span>
                      <span className="font-mono text-blue-400">{currentBevel.size}px</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={30}
                      value={currentBevel.size}
                      onChange={(e) => onUpdateStyle('bevelEmboss', { ...currentBevel, size: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-[#27272a] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-[#27272a] bg-[#09090b] gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
