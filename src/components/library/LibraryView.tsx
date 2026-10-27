import React, { useEffect, useState, useMemo } from 'react';
import {
  Film,
  Mic,
  Trash2,
  Edit2,
  Check,
  X,
  Clock,
  Calendar,
  HardDrive,
  PlayCircle,
  Eye,
  Search,
  Filter,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { useVaultStore } from '../../store/useVaultStore';
import { loadThumbnailSrc, formatDurationMs, formatSizeBytes, formatCreationDate } from '../../utils/media';
import { VideoPlayerModal } from '../vault/VideoPlayerModal';
import type { VaultItem } from '../../types/ipc';

interface LibraryViewProps {
  onGoToStudio: () => void;
  onOpenInEditor?: (item: VaultItem) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ onGoToStudio, onOpenInEditor }) => {
  const { recordings, selectedItem, fetchRecordings, renameRecording, deleteRecording, isLoading } =
    useVaultStore();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'video' | 'audio'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [thumbMap, setThumbMap] = useState<Record<string, string>>({});
  const [activeReviewItem, setActiveReviewItem] = useState<VaultItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  const loadedThumbsRef = React.useRef<Set<string>>(new Set());

  // Load thumbnails asynchronously without trigger loops
  useEffect(() => {
    let isMounted = true;
    recordings.forEach((item) => {
      if (item.thumbnail_path && !loadedThumbsRef.current.has(item.id)) {
        loadedThumbsRef.current.add(item.id);
        loadThumbnailSrc(item.thumbnail_path).then((src) => {
          if (src && isMounted) {
            setThumbMap((prev) => ({ ...prev, [item.id]: src }));
          }
        });
      }
    });
    return () => {
      isMounted = false;
    };
  }, [recordings]);

  // Filtered recordings
  const filteredRecordings = useMemo(() => {
    return recordings.filter((item) => {
      const isAudio = item.filepath.endsWith('.m4a') || item.width === 0;
      if (filterType === 'video' && isAudio) return false;
      if (filterType === 'audio' && !isAudio) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return item.title.toLowerCase().includes(q);
      }
      return true;
    });
  }, [recordings, filterType, searchQuery]);

  const videoCount = useMemo(
    () => recordings.filter((r) => !r.filepath.endsWith('.m4a') && r.width > 0).length,
    [recordings],
  );
  const audioCount = useMemo(
    () => recordings.filter((r) => r.filepath.endsWith('.m4a') || r.width === 0).length,
    [recordings],
  );

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

  const handleCancelRename = () => {
    setEditingId(null);
  };

  const handleDelete = async (id: string, title: string) => {
    const confirmMsg = `Permanently erase "${title}" from the Vault Library?`;

    if (window.confirm(confirmMsg)) {
      setDeletingId(id);
      try {
        await deleteRecording(id);
      } finally {
        setDeletingId(null);
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto pb-16 animate-fadeIn">
      {/* Library Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-amber-500/25 bg-black/25 p-5 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/50 bg-amber-500/10 text-astral-amber shadow-lg shadow-amber-500/10">
            <Film className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold uppercase tracking-wider text-slate-100">
                Astral Vault Library
              </h2>
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-astral-amber border border-amber-500/40">
                {recordings.length} {recordings.length === 1 ? 'Archive' : 'Archives'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Review, rename, or permanently erase your recordings
            </p>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search recordings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-900/80 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-astral-amber transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => fetchRecordings()}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-amber-500/40 hover:text-white transition-all disabled:opacity-50"
            title="Refresh library from vault"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs Bar */}
      <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterType('all')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              filterType === 'all'
                ? 'bg-astral-amber text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-black/30 text-slate-400 hover:text-slate-200 hover:bg-black/50 border border-slate-800'
            }`}
          >
            <Filter className="h-3 w-3" />
            <span>All Items ({recordings.length})</span>
          </button>
          <button
            onClick={() => setFilterType('video')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              filterType === 'video'
                ? 'bg-astral-amber text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-black/30 text-slate-400 hover:text-slate-200 hover:bg-black/50 border border-slate-800'
            }`}
          >
            <Film className="h-3 w-3" />
            <span>Videos ({videoCount})</span>
          </button>
          <button
            onClick={() => setFilterType('audio')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              filterType === 'audio'
                ? 'bg-astral-amber text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-black/30 text-slate-400 hover:text-slate-200 hover:bg-black/50 border border-slate-800'
            }`}
          >
            <Mic className="h-3 w-3" />
            <span>Audio ({audioCount})</span>
          </button>
        </div>
      </div>

      {/* Grid of Recordings */}
      {filteredRecordings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/30 bg-black/20 p-12 text-center backdrop-blur-md">
          <div className="h-16 w-16 rounded-full border border-amber-500/40 bg-amber-500/10 flex items-center justify-center text-astral-amber mb-4 shadow-lg shadow-amber-500/10">
            <Sparkles className="h-8 w-8 opacity-80" />
          </div>
          <h3 className="text-base font-bold text-slate-200">
            {searchQuery ? 'No archives match your search' : 'The Library Vault is Empty'}
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md">
            {searchQuery
              ? 'Try adjusting your search query or clear the filter to view all recordings.'
              : 'Head to the Studio tab to capture your screen, audio, and webcam overlay into high-quality archives.'}
          </p>
          <button
            onClick={onGoToStudio}
            className="mt-5 flex items-center gap-2 rounded-lg bg-astral-amber px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20"
          >
            <PlayCircle className="h-4 w-4" />
            <span>Go to Capture Studio</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRecordings.map((item) => {
            const isCurrentlySelected = selectedItem?.id === item.id;
            const thumbUrl = thumbMap[item.id] ?? '';
            const isAudioOnly = item.filepath.endsWith('.m4a') || item.width === 0;

            return (
              <div
                key={item.id}
                className={`group relative flex flex-col rounded-2xl border overflow-hidden transition-all backdrop-blur-xl shadow-xl ${
                  isCurrentlySelected
                    ? 'border-amber-500/70 bg-black/35 shadow-amber-500/10'
                    : 'border-amber-500/20 bg-black/25 hover:border-amber-500/50 hover:bg-black/35'
                }`}
              >
                {/* Thumbnail Container */}
                <div
                  className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden cursor-pointer"
                  onClick={() => setActiveReviewItem(item)}
                >
                  {isAudioOnly ? (
                    <div className="h-full w-full bg-gradient-to-br from-indigo-950/80 via-slate-950 to-amber-950/50 flex flex-col items-center justify-center gap-2 p-4">
                      <div className="h-16 w-16 rounded-full border-2 border-amber-500/60 bg-amber-500/10 flex items-center justify-center shadow-lg shadow-amber-500/15 group-hover:scale-105 transition-transform">
                        <Mic className="h-8 w-8 text-astral-amber" />
                      </div>
                      <span className="text-[11px] font-mono uppercase tracking-wider text-amber-300/80">
                        Vocal Archive
                      </span>
                    </div>
                  ) : thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="h-full w-full bg-slate-900 flex items-center justify-center">
                      <Film className="h-12 w-12 text-slate-700" />
                    </div>
                  )}

                  {/* Hover Overlay with Review Play Icon */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
                    <div className="flex items-center gap-2 rounded-full bg-black/80 px-4 py-2 border border-amber-500/60 text-xs font-semibold text-astral-amber shadow-2xl backdrop-blur-md transform translate-y-1 group-hover:translate-y-0 transition-transform">
                      <Eye className="h-4 w-4" />
                      <span>Review Playback</span>
                    </div>
                  </div>

                  {/* Format Badge (Top Left) */}
                  <span className="absolute top-2.5 left-2.5 rounded-md bg-black/80 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-slate-200 border border-slate-700/60 backdrop-blur">
                    {isAudioOnly ? 'AAC AUDIO' : `${item.width}x${item.height}`}
                  </span>

                  {/* Duration Badge (Bottom Right) */}
                  <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/85 px-2 py-0.5 font-mono text-xs font-semibold text-amber-400 border border-amber-500/30 backdrop-blur">
                    {formatDurationMs(item.duration_ms)}
                  </span>
                </div>

                {/* Card Information Body */}
                <div className="p-4 flex flex-col gap-3 flex-1 justify-between">
                  <div>
                    {/* Title with Inline Rename */}
                    {editingId === item.id ? (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(item.id);
                            if (e.key === 'Escape') handleCancelRename();
                          }}
                          className="flex-1 rounded-lg border border-astral-amber bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-100 outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveRename(item.id)}
                          className="rounded-lg bg-astral-amber p-1.5 text-slate-950 hover:bg-amber-400 transition-colors"
                          title="Save title"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={handleCancelRename}
                          className="rounded-lg bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 transition-colors"
                          title="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <h4
                          className="text-xs font-bold text-slate-100 leading-snug line-clamp-2 hover:text-astral-amber cursor-pointer transition-colors"
                          onClick={() => setActiveReviewItem(item)}
                          title={item.title}
                        >
                          {item.title}
                        </h4>
                        <button
                          onClick={() => handleStartRename(item)}
                          className="shrink-0 p-1 text-slate-400 hover:text-astral-amber transition-colors"
                          title="Rename recording"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Metadata: Creation Date, Duration, Size */}
                    <div className="flex flex-col gap-1.5 mt-2.5 text-[11px] text-slate-400 border-t border-slate-800/80 pt-2.5">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Calendar className="h-3 w-3 text-astral-amber shrink-0" />
                        <span className="truncate">{formatCreationDate(item.created_at)}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-500" />
                          <span>Duration: {formatDurationMs(item.duration_ms)}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3 text-slate-500" />
                          <span>{formatSizeBytes(item.file_size_bytes)}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Transport: Review, Open in Editor, Erase */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800/60">
                    {/* Review Button */}
                    <button
                      onClick={() => setActiveReviewItem(item)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 py-1.5 text-xs font-semibold text-astral-amber hover:bg-amber-500/20 hover:border-amber-500/60 transition-all"
                      title="Review recording with player"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Review</span>
                    </button>

                    {/* Open in Editor Button */}
                    {onOpenInEditor && (
                      <button
                        onClick={() => onOpenInEditor(item)}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 py-1.5 text-xs font-semibold text-sky-400 hover:bg-sky-500/20 hover:border-sky-400 hover:text-sky-300 transition-all"
                        title="Send recording directly to Editor timeline"
                      >
                        <Film className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>
                    )}

                    {/* Permanently Erase Button */}
                    <button
                      onClick={() => handleDelete(item.id, item.title)}
                      disabled={deletingId === item.id}
                      className="flex items-center justify-center rounded-lg border border-red-500/30 bg-red-950/30 p-2 text-xs font-semibold text-red-400 hover:bg-red-900/40 hover:border-red-500/60 hover:text-red-300 transition-all disabled:opacity-50"
                      title="Permanently erase recording from vault"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Player Modal */}
      {activeReviewItem && (
        <VideoPlayerModal
          item={activeReviewItem}
          onClose={() => setActiveReviewItem(null)}
        />
      )}
    </div>
  );
};
