import React, { useState } from 'react';
import { MediaAsset } from '@astral/core';
import { IconSearch, IconFilterFunnel, IconCheckmark, IconTrash } from '../common/ScarletIcons';

export interface MediaGridViewProps {
  assets: MediaAsset[];
  onSelectAsset: (asset: MediaAsset) => void;
  onAddToTimeline: (asset: MediaAsset) => void;
  onDeleteAsset?: (asset: MediaAsset) => void;
  /** External category filter from sub-nav (e.g. Landscape, Nature, Sample video) */
  categoryFilter?: string | null;
  title?: string;
}

export const MediaGridView: React.FC<MediaGridViewProps> = ({
  assets,
  onSelectAsset,
  onAddToTimeline,
  onDeleteAsset,
  categoryFilter = null,
  title = 'My Files',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; asset: MediaAsset } | null>(null);

  const effectiveCategory = categoryFilter ?? (filterCategory === 'all' ? null : filterCategory);

  const filtered = React.useMemo(() => {
    return assets.filter(a => {
      const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = !effectiveCategory || a.category === effectiveCategory;
      return matchesSearch && matchesCategory;
    });
  }, [assets, searchQuery, effectiveCategory]);

  const handleCardContextMenu = (e: React.MouseEvent, asset: MediaAsset) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectAsset(asset);
    setContextMenu({ x: e.clientX, y: e.clientY, asset });
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
            {title}
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
        onClick={() => setContextMenu(null)}
      >
        {filtered.map(asset => (
          <div
            key={asset.id}
            id={`card-media-${asset.id}`}
            data-testid="card-media"
            data-asset-name={asset.name}
            draggable={true}
            onDragStart={e => {
              e.dataTransfer.setData('application/scarlet-asset', JSON.stringify(asset));
              e.dataTransfer.setData('application/scarlet-item', JSON.stringify({ type: 'asset', data: asset, name: asset.name }));
              e.dataTransfer.setData('text/plain', asset.name);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => onSelectAsset(asset)}
            onDoubleClick={() => onAddToTimeline(asset)}
            onContextMenu={e => handleCardContextMenu(e, asset)}
            title="Click to select • Double-click to add to timeline • Right-click to delete"
            style={{
              backgroundColor: '#22262E',
              borderRadius: '12px',
              overflow: 'hidden',
              cursor: 'grab',
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
              id={`thumbnail-media-${asset.id}`}
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
                id={`name-media-${asset.id}`}
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
                <span id={`meta-res-${asset.id}`}>{asset.resolution ?? '1080p'}</span>
                <span id={`meta-dur-${asset.id}`}>{Math.floor(asset.duration)}s</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                <button
                  id={`btn-add-timeline-${asset.id}`}
                  data-testid={`btn-add-timeline-${asset.id}`}
                  data-asset-name={asset.name}
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    onAddToTimeline(asset);
                  }}
                  title="Add to Timeline"
                  style={{
                    flex: 1,
                    backgroundColor: '#168BFF',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '5px 0',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background-color 0.12s ease',
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#329AFF')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#168BFF')}
                >
                  + Add
                </button>

                {onDeleteAsset && (
                  <button
                    id={`btn-delete-asset-${asset.id}`}
                    data-testid={`btn-delete-asset-${asset.id}`}
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      if (window.confirm(`Remove "${asset.name}" from project files?`)) {
                        onDeleteAsset(asset);
                      }
                    }}
                    title="Remove file from project"
                    style={{
                      width: '28px',
                      height: '28px',
                      backgroundColor: 'rgba(235, 59, 90, 0.15)',
                      color: '#FF6B81',
                      border: '1px solid rgba(235, 59, 90, 0.3)',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.12s ease',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = '#EB3B5A';
                      (e.currentTarget as HTMLElement).style.color = '#FFFFFF';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(235, 59, 90, 0.15)';
                      (e.currentTarget as HTMLElement).style.color = '#FF6B81';
                    }}
                  >
                    <IconTrash size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Right-Click Context Menu for File Operations */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            backgroundColor: '#181B20',
            border: '1px solid #343B48',
            borderRadius: '8px',
            padding: '4px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            zIndex: 99999,
            minWidth: '150px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              onAddToTimeline(contextMenu.asset);
              setContextMenu(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#FFFFFF',
              padding: '6px 12px',
              fontSize: '12px',
              borderRadius: '6px',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#2A344B')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
          >
            <span>+ Add to Timeline</span>
          </button>

          {onDeleteAsset && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete "${contextMenu.asset.name}" from project files?`)) {
                  onDeleteAsset(contextMenu.asset);
                }
                setContextMenu(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'transparent',
                border: 'none',
                color: '#FF6B81',
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '6px',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255, 107, 129, 0.15)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
            >
              <span>🗑️ Delete File</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
