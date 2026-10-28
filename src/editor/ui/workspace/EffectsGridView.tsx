import React, { useState, useMemo, useCallback } from 'react';
import { Heart, Lightbulb, Plus, GripVertical } from 'lucide-react';
import { setTimelineDragPayload } from '@astral/core';
import {
  EffectType,
  EffectItem,
  EFFECTS_CONFIG,
  DEFAULT_FAVORITES,
  getEffectTypeIcon,
} from './effectsCatalog';

export type { EffectType, EffectItem } from './effectsCatalog';

export interface EffectsGridViewProps {
  type: EffectType;
  onApplyEffect?: (effectName: string) => void;
}

/**
 * Individual Effect Card component with drag-and-drop support,
 * favorites toggle, and quick add action.
 */
interface EffectCardProps {
  item: EffectItem;
  type: EffectType;
  isFavorite: boolean;
  onToggleFavorite: (name: string, e: React.MouseEvent) => void;
  onApply?: (name: string) => void;
}

const EffectCard: React.FC<EffectCardProps> = React.memo(({
  item,
  type,
  isFavorite,
  onToggleFavorite,
  onApply,
}) => {
  const cardId = `effect-card-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const payload = {
      type,
      name: item.name,
      color: item.color,
      sub: item.sub,
      category: item.category,
    };

    setTimelineDragPayload(payload);
    e.dataTransfer.setData('application/scarlet-item', JSON.stringify(payload));
    e.dataTransfer.setData('application/scarlet-effect-type', type);
    e.dataTransfer.setData('text/plain', item.name);
    e.dataTransfer.effectAllowed = 'copy';

    // Create sleek drag ghost pill
    const ghost = document.createElement('div');
    ghost.style.position = 'absolute';
    ghost.style.top = '-9999px';
    ghost.style.left = '-9999px';
    ghost.style.backgroundColor = item.color;
    ghost.style.color = '#FFFFFF';
    ghost.style.padding = '6px 14px';
    ghost.style.borderRadius = '6px';
    ghost.style.fontSize = '11px';
    ghost.style.fontWeight = '700';
    ghost.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)';
    ghost.style.border = '1px solid rgba(255,255,255,0.4)';
    ghost.style.display = 'flex';
    ghost.style.alignItems = 'center';
    ghost.style.gap = '6px';
    ghost.innerText = `${getEffectTypeIcon(type)} ${item.name} (4.0s)`;

    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 20, 20);
    setTimeout(() => {
      if (document.body.contains(ghost)) {
        document.body.removeChild(ghost);
      }
    }, 100);
  }, [type, item]);

  const handleDragEnd = useCallback(() => {
    setTimelineDragPayload(null);
  }, []);

  return (
    <div
      id={cardId}
      data-testid={cardId}
      draggable={true}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-[#2B303A] bg-[#22262E] cursor-grab select-none transition-all duration-150 hover:-translate-y-0.5 hover:border-[#168BFF] hover:shadow-lg hover:shadow-black/40"
    >
      {/* Visual Color Preview Banner */}
      <div
        className="relative flex h-[75px] items-center justify-center font-semibold text-xs text-white shadow-inner"
        style={{ backgroundColor: item.color }}
      >
        <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] px-2 text-center">
          {item.name}
        </span>

        {/* Favorite Heart Button */}
        <button
          type="button"
          onClick={(e) => onToggleFavorite(item.name, e)}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 text-white transition-transform hover:scale-110 active:scale-95"
        >
          <Heart
            className={`h-3.5 w-3.5 transition-colors ${
              isFavorite ? 'fill-red-500 text-red-500' : 'text-white/80 hover:text-white'
            }`}
          />
        </button>

        {/* Drag to Timeline Badge */}
        <div className="absolute bottom-1 left-1.5 flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5 text-[9px] text-white/90 backdrop-blur-xs font-medium">
          <GripVertical className="h-2.5 w-2.5 opacity-80" />
          <span>Drag to Timeline</span>
        </div>
      </div>

      {/* Card Metadata & Action Bar */}
      <div className="flex items-center justify-between p-2.5">
        <div className="min-w-0 flex-1 pr-2">
          <div className="truncate text-[11px] font-medium text-white">
            {item.name}
          </div>
          <div className="truncate text-[10px] text-[#636E7B] mt-0.5">
            {item.sub}
          </div>
        </div>

        <button
          type="button"
          title="Add block to timeline at current playhead"
          onClick={() => onApply?.(item.name)}
          className="flex items-center gap-1 flex-shrink-0 rounded border border-[#334155] bg-[#1E293B] px-2 py-1 text-[10px] font-semibold text-[#93C5FD] transition-colors hover:bg-[#168BFF] hover:text-white hover:border-[#168BFF] active:scale-95"
        >
          <Plus className="h-2.5 w-2.5" />
          <span>Add</span>
        </button>
      </div>
    </div>
  );
});

EffectCard.displayName = 'EffectCard';

/**
 * Main Effects Grid View for Filters, Transitions, Titles, and Stickers
 */
export const EffectsGridView: React.FC<EffectsGridViewProps> = ({ type, onApplyEffect }) => {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(DEFAULT_FAVORITES));

  const config = EFFECTS_CONFIG[type] ?? EFFECTS_CONFIG.filters;

  const filteredItems = useMemo(() => {
    return config.items.filter((item) => {
      if (activeCategory === 'All') return true;
      if (activeCategory === 'Favorites') return favorites.has(item.name);
      return item.category === activeCategory;
    });
  }, [config.items, activeCategory, favorites]);

  const toggleFavorite = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  return (
    <div className="flex h-full flex-col bg-[#181B20] p-4 sm:p-5 overflow-y-auto">
      {/* Top Header: Title & Total Count */}
      <div className="mb-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-medium text-white m-0">
            {config.title}
          </h2>
          <span className="text-xs text-[#636E7B]">
            ({config.count})
          </span>
        </div>
      </div>

      {/* Category Filter Pills Bar */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {config.categories.map((cat) => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[#168BFF] text-white shadow-sm'
                  : 'bg-[#22262E] text-[#A4B0BE] hover:text-white hover:bg-[#2C313C]'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Pro Tip Info Banner */}
      <div className="mb-3.5 flex items-center gap-2 rounded-lg border border-[#2B3A4F] bg-[#1E232E] px-3 py-2 text-[11px] text-[#93C5FD]">
        <Lightbulb className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
        <span>
          <strong className="font-semibold text-white">Premiere Pro-style Tracks:</strong> Drag any preset directly to the timeline to create an isolated block. Drag its yellow handles to adjust length!
        </span>
      </div>

      {/* Grid of Preset Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredItems.length === 0 ? (
          <div className="col-span-full py-8 text-center text-xs text-[#636E7B]">
            No presets in this category yet.
          </div>
        ) : (
          filteredItems.map((item) => (
            <EffectCard
              key={item.name}
              item={item}
              type={type}
              isFavorite={favorites.has(item.name)}
              onToggleFavorite={toggleFavorite}
              onApply={onApplyEffect}
            />
          ))
        )}
      </div>
    </div>
  );
};
