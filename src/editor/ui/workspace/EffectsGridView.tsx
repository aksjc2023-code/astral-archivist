import React, { useState } from 'react';
import { ActivityDockTab, setTimelineDragPayload } from '@astral/core';

export interface EffectsGridViewProps {
  type: 'filters' | 'transitions' | 'titles' | 'stickers';
  onApplyEffect?: (effectName: string) => void;
}

type EffectItem = { name: string; color: string; sub: string; category: string };

export const EffectsGridView: React.FC<EffectsGridViewProps> = ({ type, onApplyEffect }) => {
  const [activeCategory, setActiveCategory] = useState('All');
  const [favorites, setFavorites] = useState<Set<string>>(new Set(['Retro Film', 'Cross Dissolve', 'Minimal Modern']));

  const config = {
    filters: {
      title: 'Filters',
      count: '172 filters',
      categories: ['All', 'Favorites', 'Featured', 'Cinematic', 'Retro', 'Glitch', 'Blur'],
      items: [
        { name: 'Retro Film', color: '#B53471', sub: 'Warm 35mm grain', category: 'Retro' },
        { name: 'Cyberpunk Neon', color: '#168BFF', sub: 'High contrast cyan', category: 'Glitch' },
        { name: 'Golden Sunset', color: '#FFA502', sub: 'Amber highlights', category: 'Cinematic' },
        { name: 'Moody B&W', color: '#747D8C', sub: 'Silver haloid', category: 'Cinematic' },
        { name: 'VHS Distortion', color: '#8854D0', sub: 'Magnetic tape tracking', category: 'Retro' },
        { name: 'Teal & Orange', color: '#00D2D3', sub: 'Blockbuster grade', category: 'Cinematic' },
        { name: 'Soft Bloom', color: '#A29BFE', sub: 'Dreamy haze', category: 'Blur' },
        { name: 'Featured Punch', color: '#FF6B81', sub: 'Curated highlight grade', category: 'Featured' },
        { name: 'RGB Split', color: '#FF4757', sub: 'Chromatic aberration', category: 'Glitch' },
        { name: 'Noir Fade', color: '#2F3542', sub: 'Lifted blacks', category: 'Cinematic' },
        { name: 'Polaroid Warm', color: '#E17055', sub: 'Instant film look', category: 'Retro' },
        { name: 'Motion Blur Soft', color: '#70A1FF', sub: 'Directional smear', category: 'Blur' },
      ] as EffectItem[],
    },
    transitions: {
      title: 'Transitions',
      count: '113 transitions',
      categories: ['All', 'Favorites', 'Featured', 'Wipe', 'Zoom', 'Geometric', 'Ripple'],
      items: [
        { name: 'Cross Dissolve', color: '#3867D6', sub: 'Smooth overlap', category: 'Featured' },
        { name: 'Whip Pan Right', color: '#2ED573', sub: 'Fast kinetic leap', category: 'Wipe' },
        { name: 'Glitch Flash', color: '#FF4757', sub: 'RGB offset frame', category: 'Featured' },
        { name: 'Zoom Spin In', color: '#8854D0', sub: 'Dynamic barrel roll', category: 'Zoom' },
        { name: 'Iris Circle', color: '#FFA502', sub: 'Classic film closure', category: 'Geometric' },
        { name: 'Split Slide', color: '#168BFF', sub: 'Horizontal parting', category: 'Wipe' },
        { name: 'Ripple Push', color: '#00CEC9', sub: 'Wave distortion', category: 'Ripple' },
        { name: 'Hard Cut Flash', color: '#FD79A8', sub: 'White flash cut', category: 'Featured' },
        { name: 'Cube Spin', color: '#6C5CE7', sub: '3D geometric flip', category: 'Geometric' },
        { name: 'Zoom Blur Out', color: '#0984E3', sub: 'Radial smear exit', category: 'Zoom' },
      ] as EffectItem[],
    },
    titles: {
      title: 'Titles & Captions',
      count: '132 titles',
      categories: ['All', 'Favorites', 'Minimal', 'Cinematic', 'Social Media', 'Subtitles'],
      items: [
        { name: 'Minimal Modern', color: '#8854D0', sub: 'Clean sans-serif lower', category: 'Minimal' },
        { name: 'Typewriter Pop', color: '#168BFF', sub: 'Character by character', category: 'Minimal' },
        { name: 'Karaoke Glow', color: '#2ED573', sub: 'Word sync highlight', category: 'Subtitles' },
        { name: 'Cinematic Trailer', color: '#FFA502', sub: 'Tracked serif intro', category: 'Cinematic' },
        { name: 'Social Subscribe', color: '#FF4757', sub: 'Animated pill callout', category: 'Social Media' },
        { name: 'Vlog Chapter Marker', color: '#00D2D3', sub: 'Timecode stamp badge', category: 'Social Media' },
        { name: 'Lower Third News', color: '#74B9FF', sub: 'Broadcast caption bar', category: 'Subtitles' },
        { name: 'Epic Serif Open', color: '#FDCB6E', sub: 'Trailer title card', category: 'Cinematic' },
      ] as EffectItem[],
    },
    stickers: {
      title: 'Stickers & Overlays',
      count: '120 stickers',
      categories: ['All', 'Favorites', 'Emojis', 'Arrows', 'Shapes', 'Social'],
      items: [
        { name: 'Pointing Arrow', color: '#FF4757', sub: 'Red accent locator', category: 'Arrows' },
        { name: 'Like Button Pulse', color: '#168BFF', sub: 'Thumbs up motion', category: 'Social' },
        { name: 'Sparkle Burst', color: '#FFA502', sub: 'Gold starlight flash', category: 'Emojis' },
        { name: 'Heart React', color: '#EB3B5A', sub: 'Animated heartbeat', category: 'Emojis' },
        { name: 'Fire Flame', color: '#FF7F50', sub: 'Burning intensity', category: 'Emojis' },
        { name: 'Checkmark Circle', color: '#2ED573', sub: 'Green verified badge', category: 'Shapes' },
        { name: 'Subscribe Bell', color: '#FFD32A', sub: 'Notification callout', category: 'Social' },
        { name: 'Circle Outline', color: '#70A1FF', sub: 'Highlight ring', category: 'Shapes' },
        { name: 'Curved Arrow', color: '#A29BFE', sub: 'Soft callout path', category: 'Arrows' },
      ] as EffectItem[],
    },
  }[type];

  const filteredItems = config.items.filter(item => {
    if (activeCategory === 'All') return true;
    if (activeCategory === 'Favorites') return favorites.has(item.name);
    return item.category === activeCategory;
  });

  const toggleFavorite = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#181B20',
        padding: '16px 20px',
        overflowY: 'auto',
      }}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 500, color: '#FFFFFF', margin: 0 }}>
            {config.title}
          </h2>
          <span style={{ fontSize: '12px', color: '#636E7B' }}>
            ({config.count})
          </span>
        </div>
      </div>

      {/* Categories Bar */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        {config.categories.map(cat => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              style={{
                backgroundColor: isActive ? '#168BFF' : '#22262E',
                color: isActive ? '#FFFFFF' : '#A4B0BE',
                border: 'none',
                borderRadius: '9999px',
                padding: '4px 12px',
                fontSize: '11px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Pro Tip Banner */}
      <div
        style={{
          backgroundColor: '#1E232E',
          border: '1px solid #2B3A4F',
          borderRadius: '8px',
          padding: '8px 12px',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: '#93C5FD',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>💡</span>
          <span>
            <strong>Premiere Pro-style Tracks:</strong> Drag any preset directly to the timeline to create an isolated block. Drag its yellow handles to adjust length!
          </span>
        </div>
      </div>

      {/* Grid Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
        {filteredItems.length === 0 && (
          <div style={{ gridColumn: '1 / -1', fontSize: '12px', color: '#636E7B', padding: '24px 0', textAlign: 'center' }}>
            No presets in this category yet.
          </div>
        )}
        {filteredItems.map(item => {
          const isFav = favorites.has(item.name);
          return (
            <div
              key={item.name}
              id={`effect-card-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
              data-testid={`effect-card-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
              draggable={true}
              onDragStart={e => {
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
                ghost.innerText = `${type === 'filters' ? '⚡' : type === 'transitions' ? '⧉' : type === 'titles' ? '🔤' : '★'} ${item.name} (4.0s)`;
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, 20, 20);
                setTimeout(() => document.body.removeChild(ghost), 100);
              }}
              onDragEnd={() => {
                setTimelineDragPayload(null);
              }}
              style={{
                backgroundColor: '#22262E',
                borderRadius: '12px',
                border: '1px solid #2B303A',
                overflow: 'hidden',
                cursor: 'grab',
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLElement).style.borderColor = '#168BFF';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 18px rgba(0,0,0,0.4)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLElement).style.borderColor = '#2B303A';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
            >
              <div
                style={{
                  height: '75px',
                  backgroundColor: item.color,
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: '12px',
                  textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                }}
              >
                <span>{item.name}</span>
                <button
                  type="button"
                  onClick={e => toggleFavorite(item.name, e)}
                  title="Favorite"
                  style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    background: 'rgba(0,0,0,0.4)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    color: isFav ? '#FF4757' : '#FFFFFF',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  {isFav ? '♥' : '♡'}
                </button>
                <div
                  style={{
                    position: 'absolute',
                    bottom: '4px',
                    left: '6px',
                    fontSize: '9px',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  <span>⋮⋮</span>
                  <span>Drag to Timeline</span>
                </div>
              </div>

              <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: '11px', fontWeight: 500, color: '#FFFFFF', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: '10px', color: '#636E7B', marginTop: '2px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    {item.sub}
                  </div>
                </div>

                <button
                  type="button"
                  title="Add block to timeline at current playhead"
                  onClick={() => onApplyEffect?.(item.name)}
                  style={{
                    backgroundColor: '#1E293B',
                    color: '#93C5FD',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    flexShrink: 0,
                    marginLeft: '6px',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = '#168BFF';
                    (e.currentTarget as HTMLElement).style.color = '#FFFFFF';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = '#1E293B';
                    (e.currentTarget as HTMLElement).style.color = '#93C5FD';
                  }}
                >
                  + Add
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
