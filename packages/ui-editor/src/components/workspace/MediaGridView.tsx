import React, { useState } from 'react';
import { MediaAsset } from '@astral/core';
import { IconSearch, IconFilterFunnel, IconCheckmark } from '../common/ScarletIcons';

export interface MediaGridViewProps {
  assets: MediaAsset[];
  onSelectAsset: (asset: MediaAsset) => void;
  onAddToTimeline: (asset: MediaAsset) => void;
}

export const MediaGridView: React.FC<MediaGridViewProps> = ({
  assets,
  onSelectAsset,
  onAddToTimeline,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const filtered = assets.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || a.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

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
      {/* Top Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 500, color: '#FFFFFF', margin: 0 }}>
            My Files
          </h2>
          <span style={{ fontSize: '12px', color: '#636E7B' }}>
            ({filtered.length} files)
          </span>
        </div>

        {/* Search & Filter Funnel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#111317',
              borderRadius: '9999px',
              padding: '5px 12px',
              gap: '8px',
              border: '1px solid #2B303A',
              width: '200px',
            }}
          >
            <IconSearch size={14} color="#636E7B" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#FFFFFF',
                fontSize: '12px',
                width: '100%',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <button
            type="button"
            title="Filter by category"
            onClick={() => setFilterCategory(f => (f === 'all' ? 'Landscape' : f === 'Landscape' ? 'Nature' : 'all'))}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              backgroundColor: filterCategory !== 'all' ? '#168BFF' : '#22262E',
              color: filterCategory !== 'all' ? '#FFFFFF' : '#A4B0BE',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconFilterFunnel size={14} />
          </button>
        </div>
      </div>

      {/* 3-Column Media Grid (Page 1) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '14px',
        }}
      >
        {filtered.map(asset => (
          <div
            key={asset.id}
            onClick={() => onSelectAsset(asset)}
            onDoubleClick={() => onAddToTimeline(asset)}
            style={{
              backgroundColor: '#22262E',
              borderRadius: '12px',
              overflow: 'hidden',
              cursor: 'pointer',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              border: '1px solid #2B303A',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
              (e.currentTarget as HTMLElement).style.borderColor = '#168BFF';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              (e.currentTarget as HTMLElement).style.borderColor = '#2B303A';
            }}
          >
            {/* Thumbnail Canvas Well */}
            <div
              style={{
                position: 'relative',
                height: '96px',
                backgroundColor: '#111317',
                backgroundImage: `url(${asset.thumbnailUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {/* Type Badge */}
              <div
                style={{
                  position: 'absolute',
                  top: '6px',
                  left: '6px',
                  backgroundColor: 'rgba(0,0,0,0.65)',
                  backdropFilter: 'blur(4px)',
                  borderRadius: '4px',
                  padding: '2px 5px',
                  fontSize: '9px',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                {asset.type}
              </div>

              {/* Green Checkmark Badge if used on timeline (Page 1) */}
              {asset.isUsedOnTimeline && (
                <div
                  title="Used on timeline"
                  style={{
                    position: 'absolute',
                    bottom: '6px',
                    right: '6px',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: '#2ED573',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                  }}
                >
                  <IconCheckmark size={11} color="#FFFFFF" />
                </div>
              )}
            </div>

            {/* Media Information */}
            <div style={{ padding: '8px 10px' }}>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#FFFFFF',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={asset.name}
              >
                {asset.name}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '4px',
                  fontSize: '10px',
                  color: '#A4B0BE',
                }}
              >
                <span>{asset.resolution ?? '1080p'}</span>
                <span>{Math.floor(asset.duration)}s</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
