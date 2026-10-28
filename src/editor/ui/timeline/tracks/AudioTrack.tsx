import React from 'react';
import type { TimelineClip } from '../../../core/types';

export interface AudioTrackProps {
  clips: TimelineClip[];
  pxPerSec: number;
  selectedClipId: string | null;
  onSelectClip: (id: string, e: React.MouseEvent) => void;
  onTrimStart?: (clipId: string, side: 'left' | 'right', startClientX: number) => void;
  isMuted?: boolean;
}

export const AudioTrack: React.FC<AudioTrackProps> = ({
  clips,
  pxPerSec,
  selectedClipId,
  onSelectClip,
  onTrimStart,
  isMuted = false,
}) => {
  return (
    <div
      className="relative w-full h-[48px] border-b border-slate-800/80 bg-slate-950/40 overflow-hidden"
      style={{ opacity: isMuted ? 0.4 : 1 }}
    >
      {clips.map((clip) => {
        const left = (clip.timelineStart ?? 0) * pxPerSec;
        const width = Math.max(24, (clip.timelineDuration ?? clip.duration ?? 1) * pxPerSec);
        const isSelected = selectedClipId === clip.id;

        return (
          <div
            key={clip.id}
            onClick={(e) => onSelectClip(clip.id, e)}
            className={`absolute top-1 bottom-1 rounded px-2 flex flex-col justify-between text-[11px] font-medium cursor-pointer transition-shadow select-none ${
              isSelected
                ? 'ring-2 ring-cyan-400 shadow-lg shadow-cyan-500/30 bg-cyan-600/80 text-cyan-100'
                : 'bg-cyan-950/70 text-cyan-300 border border-cyan-800/60 hover:bg-cyan-900/80'
            }`}
            style={{
              left: `${left}px`,
              width: `${width}px`,
            }}
          >
            {/* Left trim handle */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                onTrimStart?.(clip.id, 'left', e.clientX);
              }}
              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-amber-400/80 rounded-l"
              title="Trim left handle"
            />

            <div className="flex items-center justify-between w-full pointer-events-none pt-0.5">
              <span className="truncate flex items-center gap-1 font-mono text-[10px]">
                <span>🎵</span>
                <span>{clip.title}</span>
              </span>
              <span className="text-[9px] text-cyan-400/70 font-mono">
                {Number(clip.timelineDuration ?? clip.duration ?? 0).toFixed(1)}s
              </span>
            </div>

            {/* Stylized simulated audio waveform peaks */}
            <div className="flex items-end gap-[2px] h-[16px] w-full overflow-hidden opacity-60 pb-0.5 pointer-events-none">
              {Array.from({ length: Math.min(60, Math.floor(width / 4)) }).map((_, i) => {
                const heightPct = 20 + ((i * 17 + (clip.id.charCodeAt(0) || 0)) % 75);
                return (
                  <div
                    key={i}
                    className="w-[2px] bg-cyan-400 rounded-t-sm"
                    style={{ height: `${heightPct}%` }}
                  />
                );
              })}
            </div>

            {/* Right trim handle */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                onTrimStart?.(clip.id, 'right', e.clientX);
              }}
              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-amber-400/80 rounded-r"
              title="Trim right handle"
            />
          </div>
        );
      })}
    </div>
  );
};
