import React, { useState } from 'react';
import { VaultItem, renameVaultItem, deleteVaultItem } from '../services/tauriClient';

interface VaultGalleryProps {
  items: VaultItem[];
  onRefresh: () => void;
  onSelectForEdit: (item: VaultItem) => void;
}

export const VaultGallery: React.FC<VaultGalleryProps> = ({ items, onRefresh, onSelectForEdit }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [previewItem, setPreviewItem] = useState<VaultItem | null>(null);

  const handleStartRename = (item: VaultItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
  };

  const handleSaveRename = async (id: string) => {
    if (!editTitle.trim()) return;
    await renameVaultItem(id, editTitle.trim());
    setEditingId(null);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Permanently delete this recording and its media file from the vault?')) {
      await deleteVaultItem(id);
      if (previewItem?.id === id) setPreviewItem(null);
      onRefresh();
    }
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}m ${s}s`;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const formatDate = (epochStr: string) => {
    const num = parseInt(epochStr, 10);
    if (isNaN(num)) return epochStr;
    return new Date(num * 1000).toLocaleString();
  };

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '20px', margin: '0 0 4px 0', color: '#f1f5f9' }}>Vault Library (B3)</h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
            Permanent native file archive with thumbnails, metadata index, and non-destructive project import.
          </p>
        </div>
        <button
          onClick={onRefresh}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            background: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #334155',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          🔄 Refresh Vault
        </button>
      </div>

      {/* Grid of Recordings */}
      {items.length === 0 ? (
        <div
          style={{
            border: '2px dashed #1e293b',
            borderRadius: '12px',
            padding: '60px 20px',
            textAlign: 'center',
            color: '#64748b',
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>📂</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#94a3b8' }}>Vault is Empty</div>
          <p style={{ margin: '8px 0 0 0', fontSize: '13px' }}>
            Record an application demo or tutorial in the Recorder tab to archive it here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '18px' }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Thumbnail / Header */}
              <div
                style={{
                  height: '140px',
                  background: '#020617',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  cursor: 'pointer',
                }}
                onClick={() => setPreviewItem(item)}
              >
                <div style={{ fontSize: '32px' }}>🎞️</div>
                <div
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '8px',
                    background: 'rgba(0,0,0,0.7)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: '#e2e8f0',
                    fontFamily: 'monospace',
                  }}
                >
                  {formatDuration(item.duration_seconds)}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    background: '#312e81',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    color: '#c7d2fe',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  {item.source_type}
                </div>
              </div>

              {/* Card Body */}
              <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  {editingId === item.id ? (
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        style={{
                          flex: 1,
                          background: '#1e293b',
                          border: '1px solid #475569',
                          borderRadius: '4px',
                          color: '#fff',
                          padding: '4px 8px',
                          fontSize: '13px',
                        }}
                      />
                      <button
                        onClick={() => handleSaveRename(item.id)}
                        style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer' }}
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <h4 style={{ margin: 0, fontSize: '15px', color: '#f1f5f9', fontWeight: 600 }}>{item.title}</h4>
                      <button
                        onClick={() => handleStartRename(item)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '12px' }}
                      >
                        ✏️
                      </button>
                    </div>
                  )}

                  <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span>Recorded: {formatDate(item.created_at)}</span>
                    <span>Size: {formatFileSize(item.file_size_bytes)}</span>
                  </div>
                </div>

                {/* Card Action Row */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                  <button
                    onClick={() => onSelectForEdit(item)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: '#4f46e5',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Open in Editor (B4)
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    style={{
                      padding: '8px 12px',
                      background: '#1e293b',
                      color: '#f87171',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              maxWidth: '800px',
              width: '100%',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#f1f5f9' }}>{previewItem.title}</h3>
              <button
                onClick={() => setPreviewItem(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <div style={{ background: '#020617', borderRadius: '8px', overflow: 'hidden', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#64748b', fontSize: '14px' }}>Vault Media Path: {previewItem.file_path}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => {
                  const target = previewItem;
                  setPreviewItem(null);
                  onSelectForEdit(target);
                }}
                style={{
                  padding: '10px 18px',
                  background: '#4f46e5',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Open in Editor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
