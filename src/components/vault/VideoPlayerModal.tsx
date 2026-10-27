import React, { useEffect, useRef, useState } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { X, Volume2, Film, Loader2, RotateCcw } from 'lucide-react';
import type { VaultItem } from '../../types/ipc';

interface VideoPlayerModalProps {
  item: VaultItem | null;
  onClose: () => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({ item, onClose }) => {
  const [mediaSrc, setMediaSrc] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!item) return;
    let active = true;
    let objectUrl = '';

    const loadMedia = async () => {
      setLoading(true);
      try {
        const directSrc = convertFileSrc(item.filepath);
        if (directSrc) {
          setMediaSrc(directSrc);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn('convertFileSrc error, falling back:', e);
      }

      try {
        const bytes = await invoke<number[]>('read_media_bytes', { path: item.filepath });
        if (!active) return;
        const mime = item.filepath.endsWith('.m4a') ? 'audio/mp4' : 'video/mp4';
        const blob = new Blob([new Uint8Array(bytes)], { type: mime });
        objectUrl = URL.createObjectURL(blob);
        setMediaSrc(objectUrl);
      } catch (err) {
        console.warn('read_media_bytes fallback:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadMedia();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item]);

  useEffect(() => {
    if (videoRef.current && mediaSrc) {
      videoRef.current.currentTime = 0;
      videoRef.current.muted = false;
      videoRef.current.volume = 1.0;
      videoRef.current.play().catch((err) => {
        console.warn('Autoplay with sound paused pending interaction:', err);
      });
    }
  }, [mediaSrc]);

  const handleReplay = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  };

  if (!item) return null;
  const isAudioOnly = item.filepath.endsWith('.m4a') || item.width === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-6"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-4xl overflow-hidden rounded-2xl border border-amber-500/40 bg-slate-950/60 backdrop-blur-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 items-center justify-between border-b border-amber-500/20 px-4 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-astral-amber" />
            <span className="text-sm font-semibold text-slate-100">{item.title}</span>
          </div>
          <div className="flex items-center gap-2">
            {!isAudioOnly && (
              <button
                onClick={handleReplay}
                className="flex items-center gap-1 text-xs text-amber-400/80 hover:text-astral-amber px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30"
                title="Replay from beginning"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Replay</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              title="Close viewer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relative aspect-video w-full bg-black/50 flex items-center justify-center p-2">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-astral-amber" />
              <span className="text-xs">Invoking Astral Media Stream...</span>
            </div>
          ) : isAudioOnly ? (
            <div className="flex flex-col items-center gap-4">
              <div className="h-24 w-24 rounded-full border-2 border-amber-500/70 bg-amber-500/10 flex items-center justify-center shadow-lg shadow-amber-500/10 animate-pulse">
                <Volume2 className="h-12 w-12 text-astral-amber" />
              </div>
              <span className="text-xs text-slate-400 font-mono">Archival Audio Stream</span>
              <audio src={mediaSrc} autoPlay controls loop className="mt-2 w-80" />
            </div>
          ) : (
            <video
              ref={videoRef}
              src={mediaSrc}
              autoPlay
              loop
              controls
              playsInline
              className="h-full w-full object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
};
