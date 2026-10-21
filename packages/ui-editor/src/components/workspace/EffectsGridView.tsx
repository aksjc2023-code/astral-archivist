import React, { useState } from 'react';
import { ActivityDockTab } from '@astral/core';

export interface EffectsGridViewProps {
  type: 'filters' | 'transitions' | 'titles' | 'stickers';
  onApplyEffect?: (effectName: string) => void;
}

export const EffectsGridView: React.FC<EffectsGridViewProps> = ({ type, onApplyEffect }) => {
  const [activeCategory, setActiveCategory] = useState('All');
  const [favorites, setFavorites] = useState<Set<string>>(new Set(['Retro Film', 'Cross Dissolve', 'Minimal Modern']));

  const config = {
    filters: {
      title: 'Filters',
      count: '172 filters',
      categories: ['All', 'Favorites', 'Featured', 'Cinematic', 'Retro', 'Glitch', 'Blur'],
      items: [
        { name: 'Retro Film', color: '#B53471', sub: 'Warm 35mm grain' },
        { name: 'Cyberpunk Neon', color: '#168BFF', sub: 'High contrast cyan' },
        { name: 'Golden Sunset', color: '#FFA502', sub: 'Amber highlights' },
        { name: 'Moody B&W', color: '#747D8C', sub: 'Silver haloid' },
        { name: 'VHS Distortion', color: '#8854D0', sub: 'Magnetic tape tracking' },
        { name: 'Teal & Orange', color: '#00D2D3', sub: 'Blockbuster grade' },
      ],
    },
    transitions: {
      title: 'Transitions',
      count: '113 transitions',
      categories: ['All', 'Favorites', 'Featured', 'Wipe', 'Zoom', 'Geometric', 'Ripple'],
      items: [
        { name: 'Cross Dissolve', color: '#3867D6', sub: 'Smooth overlap' },
        { name: 'Whip Pan Right', color: '#2ED573', sub: 'Fast kinetic leap' },
        { name: 'Glitch Flash', color: '#FF4757', sub: 'RGB offset frame' },
        { name: 'Zoom Spin In', color: '#8854D0', sub: 'Dynamic barrel roll' },
        { name: 'Iris Circle', color: '#FFA502', sub: 'Classic film closure' },
        { name: 'Split Slide', color: '#168BFF', sub: 'Horizontal parting' },
      ],
    },
    titles: {
      title: 'Titles & Captions',
      count: '132 titles',
      categories: ['All', 'Favorites', 'Minimal', 'Cinematic', 'Social Media', 'Subtitles'],
      items: [
        { name: 'Minimal Modern', color: '#8854D0', sub: 'Clean sans-serif lower' },
        { name: 'Typewriter Pop', color: '#168BFF', sub: 'Character by character' },
        { name: 'Karaoke Glow', color: '#2ED573', sub: 'Word sync highlight' },
        { name: 'Cinematic Trailer', color: '#FFA502', sub: 'Tracked serif intro' },
        { name: 'Social Subscribe', color: '#FF4757', sub: 'Animated pill callout' },
        { name: 'Vlog Chapter Marker', color: '#00D2D3', sub: 'Timecode stamp badge' },
      ],
    },
    stickers: {
      title: 'Stickers & Overlays',
      count: '120 stickers',
      categories: ['All', 'Favorites', 'Emojis', 'Arrows', 'Shapes', 'Social'],
      items: [
        { name: 'Pointing Arrow', color: '#FF4757', sub: 'Red accent locator' },
        { name: 'Like Button Pulse', color: '#168BFF', sub: 'Thumbs up motion' },
        { name: 'Sparkle Burst', color: '#FFA502', sub: 'Gold starlight flash' },
        { name: 'Heart React', color: '#EB3B5A', sub: 'Animated heartbeat' },
        { name: 'Fire Flame', color: '#FF7F50', sub: 'Burning intensity' },
        { name: 'Checkmark Circle', color: '#2ED573', sub: 'Green verified badge' },
      ],
    },
  }[type];

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

      {/* Grid Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
        {config.items.map(item => {
          const isFav = favorites.has(item.name);
          return (
            <div
              key={item.name}
              onClick={() => onApplyEffect?.(item.name)}
              style={{
                backgroundColor: '#22262E',
                borderRadius: '12px',
                border: '1px solid #2B303A',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLElement).style.borderColor = '#168BFF';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLElement).style.borderColor = '#2B303A';
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
              </div>

              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 500, color: '#FFFFFF' }}>{item.name}</div>
                <div style={{ fontSize: '10px', color: '#636E7B', marginTop: '2px' }}>{item.sub}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
