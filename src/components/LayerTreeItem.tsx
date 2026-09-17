import React, { useState, useEffect, useRef } from 'react';
import { Layer } from '../core/types';
import { LayerThumbnail } from './LayerThumbnail';
import { 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FolderOpen, 
  Image as ImageIcon, 
  Type as TypeIcon, 
  Maximize, 
  Activity, 
  Scissors, 
  Plus, 
  FolderMinus, 
  Trash2,
  MoreVertical,
  Tag,
  Edit2,
  Check,
  CircleDot,
  Sliders,
  Layers
} from 'lucide-react';

interface LayerTreeItemProps {
  layer: Layer;
  layers: Layer[];
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  expandedGroupIds: string[];
  soloLayerId: string | null;
  depth?: number;
  onSelect: (id: string, isMulti: boolean) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string, currentLocked: boolean) => void;
  onToggleSolo: (id: string) => void;
  onToggleExpand: (groupId: string) => void;
  onMoveLayer: (id: string, direction: 'up' | 'down') => void;
  onMoveToGroup: (layerId: string, groupId: string | null) => void;
  onDeleteLayer: (id: string) => void;
  onRenameLayer: (id: string, newName: string) => void;
  onUpdateColorTag: (id: string, colorTag: string | undefined) => void;
  onOpenStyles: (layer: Layer) => void;
  onAddMask: (layerId: string) => void;
}

const PRESET_TAG_COLORS = [
  { name: 'Red', color: '#ef4444' },
  { name: 'Orange', color: '#f97316' },
  { name: 'Amber', color: '#f59e0b' },
  { name: 'Green', color: '#10b981' },
  { name: 'Blue', color: '#3b82f6' },
  { name: 'Purple', color: '#8b5cf6' },
  { name: 'Pink', color: '#ec4899' },
];

export const LayerTreeItem: React.FC<LayerTreeItemProps> = ({
  layer,
  layers,
  selectedLayerId,
  selectedLayerIds,
  expandedGroupIds,
  soloLayerId,
  depth = 0,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onToggleSolo,
  onToggleExpand,
  onMoveLayer,
  onMoveToGroup,
  onDeleteLayer,
  onRenameLayer,
  onUpdateColorTag,
  onOpenStyles,
  onAddMask
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(layer.name);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  // Close popover menus when clicking anywhere else
  useEffect(() => {
    if (!showTagMenu && !showGroupMenu) return;
    const onDown = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setShowTagMenu(false);
        setShowGroupMenu(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showTagMenu, showGroupMenu]);

  // Keep the rename buffer in sync if the layer is renamed elsewhere
  useEffect(() => { if (!isEditingName) setNameInput(layer.name); }, [layer.name, isEditingName]);

  const isSelected = selectedLayerIds.includes(layer.id);
  const isSolo = soloLayerId === layer.id;
  const isGroup = layer.type === 'group';
  const isExpanded = expandedGroupIds.includes(layer.id);
  const children = isGroup ? layers.filter(l => l.parentId === layer.id) : [];

  const handleNameSubmit = () => {
    if (nameInput.trim()) {
      onRenameLayer(layer.id, nameInput.trim());
    }
    setIsEditingName(false);
  };

  const availableGroups = layers.filter(l => l.type === 'group' && l.id !== layer.id);

  return (
    <div className="flex flex-col">
      {/* Row Item */}
      <div
        ref={rowRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(layer.id, e.ctrlKey || e.metaKey);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowTagMenu(true);
          setShowGroupMenu(false);
        }}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        className={`relative flex items-center gap-1.5 p-1.5 border-b border-[#18181b] cursor-pointer group select-none transition-colors ${
          isSelected
            ? 'bg-blue-600/25 border-l-2 border-l-blue-500 text-white font-medium'
            : 'hover:bg-[#27272a]/60 text-gray-300'
        } ${!layer.visible ? 'opacity-50' : ''}`}
      >
        {/* Color Tag Bar on Left Edge */}
        {layer.colorTag && (
          <div 
            className="absolute left-0 top-1 bottom-1 w-1 rounded-r-full shadow-sm" 
            style={{ backgroundColor: layer.colorTag }}
            title={`Tagged with ${layer.colorTag}`}
          />
        )}

        {/* Expand / Collapse Chevron for Groups */}
        {isGroup ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(layer.id);
            }}
            className="p-0.5 hover:bg-[#3f3f46] rounded text-gray-400 hover:text-white"
          >
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <div className="w-3" />
        )}

        {/* Eye Visibility Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(layer.id);
          }}
          className="text-gray-500 hover:text-white transition-colors"
          title={layer.visible ? 'Hide Layer' : 'Show Layer'}
        >
          {layer.visible ? <Eye size={13} className="text-gray-300" /> : <EyeOff size={13} className="text-gray-600" />}
        </button>

        {/* Solo (Dot / Target Icon) Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSolo(layer.id);
          }}
          className={`p-0.5 rounded transition-colors ${
            isSolo
              ? 'text-amber-400 bg-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
              : 'text-gray-600 hover:text-amber-400'
          }`}
          title={isSolo ? 'Exit Solo Mode' : 'Solo Layer (Hide all other layers)'}
        >
          <CircleDot size={12} />
        </button>

        {/* Live Downscaled Thumbnail Preview */}
        <LayerThumbnail layer={layer} size={24} />

        {/* Small Colored Tag Dot */}
        {layer.colorTag ? (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0 shadow-sm border border-white/20 transition-transform hover:scale-125"
            style={{ backgroundColor: layer.colorTag }}
            title={`Color tag: ${layer.colorTag} (Right-click layer to change)`}
          />
        ) : null}

        {/* Name or Inline Rename Input */}
        <div className="flex-1 min-w-0 flex items-center gap-1">
          {isEditingName ? (
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={handleNameSubmit}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSubmit();
                if (e.key === 'Escape') setIsEditingName(false);
              }}
              autoFocus
              className="bg-[#09090b] border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white w-full outline-none font-mono"
            />
          ) : (
            <div className="flex items-center gap-1 min-w-0 group/name">
              <span
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setNameInput(layer.name);
                  setIsEditingName(true);
                }}
                className="text-[11px] truncate font-mono tracking-tight hover:text-blue-300"
                title="Double-click to edit layer name"
              >
                {layer.name}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setNameInput(layer.name);
                  setIsEditingName(true);
                }}
                className="opacity-0 group-hover/name:opacity-100 p-0.5 text-gray-500 hover:text-white"
                title="Rename Layer (or Double-Click)"
              >
                <Edit2 size={9} />
              </button>
            </div>
          )}

          {isGroup && (
            <span className="text-[9px] font-mono text-gray-400 px-1 py-0.2 bg-[#27272a] rounded-full border border-[#3f3f46]">
              {children.length}
            </span>
          )}

          {/* Mask Indicator Badge */}
          {layer.maskId && (
            <span className="text-[8px] font-bold text-amber-300 px-1 py-0.2 bg-amber-950/80 border border-amber-500/50 rounded flex items-center gap-0.5" title="Layer has an active non-destructive mask">
              <Scissors size={8} /> Mask
            </span>
          )}
        </div>

        {/* Action Controls & Menus */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Layer Styles Panel Trigger */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenStyles(layer);
            }}
            className="text-gray-500 hover:text-blue-400 p-0.5 font-bold text-[9px] hover:bg-[#27272a] rounded"
            title="Open Layer Styles (Drop Shadow, Stroke, Glow)"
          >
            fx
          </button>

          {/* Add Mask Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddMask(layer.id);
            }}
            className={`p-0.5 ${layer.maskId ? 'text-amber-400' : 'text-gray-500 hover:text-amber-400'}`}
            title={layer.maskId ? 'Remove mask from this layer' : 'Use this layer as a mask for the layer above it'}
          >
            <Scissors size={11} />
          </button>

          {/* Tag Color Picker Menu */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowTagMenu(!showTagMenu);
                setShowGroupMenu(false);
              }}
              className="text-gray-500 hover:text-amber-400 p-0.5"
              title="Assign Tag Color (or Right-Click Layer)"
            >
              <Tag size={11} style={{ color: layer.colorTag }} />
            </button>
            {showTagMenu && (
              <div 
                className="absolute right-0 top-6 z-50 bg-[#18181b] border border-[#3f3f46] rounded-lg shadow-2xl p-2 w-48 text-[10px]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-gray-400 font-bold uppercase tracking-wider mb-1.5 px-1 flex items-center justify-between">
                  <span>Assign Color Tag</span>
                  <label className="flex items-center gap-1 text-[9px] text-blue-400 hover:underline cursor-pointer">
                    <span>Custom</span>
                    <input
                      type="color"
                      value={layer.colorTag || '#3b82f6'}
                      onChange={(e) => {
                        onUpdateColorTag(layer.id, e.target.value);
                      }}
                      className="w-4 h-4 rounded cursor-pointer border-none bg-transparent"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {PRESET_TAG_COLORS.map((tag) => (
                    <button
                      key={tag.name}
                      onClick={() => {
                        onUpdateColorTag(layer.id, tag.color);
                        setShowTagMenu(false);
                      }}
                      className="w-7 h-7 rounded-full flex items-center justify-center border border-white/10 hover:scale-110 transition-transform relative"
                      style={{ backgroundColor: tag.color }}
                      title={tag.name}
                    >
                      {layer.colorTag === tag.color && <Check size={12} className="text-white drop-shadow" />}
                    </button>
                  ))}
                </div>
                {layer.colorTag && (
                  <button
                    onClick={() => {
                      onUpdateColorTag(layer.id, undefined);
                      setShowTagMenu(false);
                    }}
                    className="w-full text-center py-1 bg-[#27272a] hover:bg-[#3f3f46] text-gray-300 rounded text-[10px]"
                  >
                    Clear Color Tag
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Move Up/Down Buttons */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveLayer(layer.id, 'up');
            }}
            className="text-gray-500 hover:text-white p-0.5"
            title="Move Layer Up"
          >
            <Plus size={10} className="rotate-45" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveLayer(layer.id, 'down');
            }}
            className="text-gray-500 hover:text-white p-0.5"
            title="Move Layer Down"
          >
            <Plus size={10} className="-rotate-45" />
          </button>

          {/* Grouping dropdown if not group */}
          {!isGroup && availableGroups.length > 0 && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowGroupMenu(!showGroupMenu);
                  setShowTagMenu(false);
                }}
                className="text-gray-500 hover:text-blue-400 p-0.5"
                title="Move to Folder"
              >
                <MoreVertical size={11} />
              </button>
              {showGroupMenu && (
                <div 
                  className="absolute right-0 top-6 z-50 bg-[#18181b] border border-[#3f3f46] rounded-lg shadow-2xl py-1 w-36 text-[10px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-2 py-1 text-gray-500 font-bold uppercase border-b border-[#27272a]">
                    Move to Folder
                  </div>
                  {layer.parentId && (
                    <button
                      onClick={() => {
                        onMoveToGroup(layer.id, null);
                        setShowGroupMenu(false);
                      }}
                      className="w-full text-left px-2 py-1 hover:bg-[#27272a] text-amber-400 flex items-center gap-1"
                    >
                      <FolderMinus size={11} /> Remove from Folder
                    </button>
                  )}
                  {availableGroups.map((grp) => (
                    <button
                      key={grp.id}
                      onClick={() => {
                        onMoveToGroup(layer.id, grp.id);
                        setShowGroupMenu(false);
                      }}
                      className="w-full text-left px-2 py-1 hover:bg-[#27272a] text-gray-200 truncate flex items-center gap-1"
                    >
                      <Folder size={11} className="text-blue-400" /> {grp.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Delete Layer */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteLayer(layer.id);
            }}
            className="text-gray-500 hover:text-red-400 p-0.5"
            title="Delete Layer"
          >
            <Trash2 size={11} />
          </button>
        </div>

        {/* Lock / Unlock Toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock(layer.id, layer.locked);
          }}
          className={`flex-shrink-0 p-0.5 rounded ${layer.locked ? 'text-blue-400' : 'text-gray-500 hover:text-white opacity-0 group-hover:opacity-100'} transition-opacity`}
          title={layer.locked ? 'Unlock Layer' : 'Lock Layer (prevents moving/painting)'}
        >
          {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
      </div>

      {/* Child layers nested under Group */}
      {isGroup && isExpanded && children.length > 0 && (
        <div className="border-l-2 border-blue-500/30 ml-2.5">
          {children.map((child) => (
            <LayerTreeItem
              key={child.id}
              layer={child}
              layers={layers}
              selectedLayerId={selectedLayerId}
              selectedLayerIds={selectedLayerIds}
              expandedGroupIds={expandedGroupIds}
              soloLayerId={soloLayerId}
              depth={depth + 1}
              onSelect={onSelect}
              onToggleVisibility={onToggleVisibility}
              onToggleLock={onToggleLock}
              onToggleSolo={onToggleSolo}
              onToggleExpand={onToggleExpand}
              onMoveLayer={onMoveLayer}
              onMoveToGroup={onMoveToGroup}
              onDeleteLayer={onDeleteLayer}
              onRenameLayer={onRenameLayer}
              onUpdateColorTag={onUpdateColorTag}
              onOpenStyles={onOpenStyles}
              onAddMask={onAddMask}
            />
          ))}
        </div>
      )}
    </div>
  );
};
