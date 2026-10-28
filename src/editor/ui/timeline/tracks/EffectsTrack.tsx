import React from 'react';
import type { TimelineClip } from '../../../core/types';

export interface EffectsTrackProps {
  clips: TimelineClip[];
  pxPerSec: number;
  selectedClipId: string | null;
  onSelectClip: (id: string, e: React.MouseEvent) => void;
  onTrimStart?: (clipId: string, side: 'left' | 'right', startClientX: number) => void;
  isHidden?: boolean;
}

export const EffectsTrack: React.FC<EffectsTrackProps> = ({
  clips,
  pxPerSec,
  selectedClipId,
  onSelectClip,
  onTrimStart,
  isHidden = false,
}) => {
  return (
    <div
      className="relative w-full h-[40px] border-b border-slate-800/80 bg-slate-950/30 overflow-hidden"
      style={{ opacity: isHidden ? 0.35 : 1 }}
    >
      {clips.map((clip) => {
        const left = (clip.timelineStart ?? 0) * pxPerSec;
        const width = Math.max(24, (clip.timelineDuration ?? clip.duration ?? 1) * pxPerSec);
        const isSelected = selectedClipId === clip.id;

        return (
          <div
            key={clip.id}
            onClick={(e) => onSelectClip(clip.id, e)}
            className={`absolute top-1 bottom-1 rounded px-2 flex items-center justify-between text-[11px] font-medium cursor-pointer transition-shadow select-none ${
              isSelected
                ? 'ring-2 ring-violet-400 shadow-lg shadow-violet-500/30 bg-violet-600/80 text-violet-100'
                : 'bg-violet-950/70 text-violet-300 border border-violet-800/60 hover:bg-violet-900/80'
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

            <span className="truncate pointer-events-none flex items-center gap-1">
              <span>✨</span>
              <span>{clip.title}</span>
            </span>

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
