import React, { useEffect, useState } from 'react';
import { Film, Trash2, Edit2, Check, Clock, HardDrive, PlayCircle, Mic } from 'lucide-react';
import { useVaultStore } from '../../store/useVaultStore';
import { loadThumbnailSrc, formatDurationMs, formatSizeBytes } from '../../utils/media';
import { VideoPlayerModal } from './VideoPlayerModal';
import type { VaultItem } from '../../types/ipc';

export const VaultGrid: React.FC = () => {
  const { recordings, selectedItem, fetchRecordings, selectRecording, renameRecording, deleteRecording } =
    useVaultStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [thumbMap, setThumbMap] = useState<Record<string, string>>({});
  const [activePlayItem, setActivePlayItem] = useState<VaultItem | null>(null);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  useEffect(() => {
    recordings.forEach((item) => {
      if (item.thumbnail_path && !thumbMap[item.id]) {
        loadThumbnailSrc(item.thumbnail_path).then((src) => {
          if (src) {
            setThumbMap((prev) => ({ ...prev, [item.id]: src }));
          }
        });
      }
    });
  }, [recordings, thumbMap]);

  const handleStartRename = (item: VaultItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
  };

  const handleSaveRename = async (id: string) => {
    if (editTitle.trim()) {
      await renameRecording(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this recording from the Vault?')) {
      await deleteRecording(id);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-astral-800 pb-2">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-astral-amber" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
            Vault of Memories ({recordings.length})
          </h2>
        </div>
      </div>

      {recordings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-astral-800/80 p-8 text-center text-slate-500">
          <Film className="h-8 w-8 mb-2 opacity-40 text-astral-amber" />
          <p className="text-sm font-medium">The vault is silent</p>
          <p className="text-xs text-slate-600 mt-1">Capture your first illusion above to forge an archive</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {recordings.map((item) => {
            const isSelected = selectedItem?.id === item.id;
            const thumbUrl = thumbMap[item.id] ?? '';
            const isAudioOnly = item.filepath.endsWith('.m4a') || item.width === 0;

            return (
              <div
                key={item.id}
                onClick={() => {
                  selectRecording(item);
                  setActivePlayItem(item);
                }}
                className={`group relative flex flex-col rounded-xl border overflow-hidden transition-all cursor-pointer backdrop-blur-md ${
                  isSelected
                    ? 'border-amber-500/80 bg-black/35 shadow-lg shadow-amber-500/10'
                    : 'border-amber-500/20 bg-black/20 hover:border-amber-500/50 hover:bg-black/30'
                }`}
              >
                {/* Thumbnail Header */}
                <div className="relative aspect-video w-full bg-slate-900 flex items-center justify-center overflow-hidden">
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : null}

                  <div className="absolute inset-0 flex items-center justify-center text-slate-300 group-hover:text-astral-amber transition-colors bg-black/25 group-hover:bg-black/40">
                    {isAudioOnly ? (
                      <Mic className="h-10 w-10 text-astral-amber opacity-90 group-hover:scale-110 transition-transform" />
                    ) : (
                      <PlayCircle className="h-10 w-10 opacity-85 group-hover:scale-110 transition-transform shadow-sm" />
                    )}
                  </div>

                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-200 backdrop-blur border border-slate-700/50">
                    {formatDurationMs(item.duration_ms)}
                  </span>
                </div>

                {/* Card Body */}
                <div className="p-3 flex flex-col gap-2">
                  {editingId === item.id ? (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="flex-1 rounded border border-astral-amber bg-astral-950 px-2 py-0.5 text-xs text-slate-100 outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveRename(item.id)}
                        className="rounded bg-astral-amber p-1 text-slate-950 hover:bg-amber-400"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 truncate" title={item.title}>
                        {item.title}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(item);
                          }}
                          className="p-1 text-slate-400 hover:text-astral-amber"
                          title="Rename recording"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, item.id)}
                          className="p-1 text-slate-400 hover:text-red-400"
                          title="Delete recording from Vault"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Metadata Chips */}
                  <div className="flex items-center gap-3 text-[10px] text-slate-400 border-t border-astral-800/60 pt-2">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-500" />
                      {isAudioOnly ? 'Audio' : `${item.fps} FPS`}
                    </span>
                    <span className="flex items-center gap-1">
                      <HardDrive className="h-3 w-3 text-slate-500" />
                      {formatSizeBytes(item.file_size_bytes)}
                    </span>
                    <span className="truncate text-slate-500 ml-auto">
                      {isAudioOnly ? '48kHz AAC' : `${item.width}x${item.height}`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Video Player Modal */}
      {activePlayItem && (
        <VideoPlayerModal
          item={activePlayItem}
          onClose={() => setActivePlayItem(null)}
        />
      )}
    </div>
  );
};
