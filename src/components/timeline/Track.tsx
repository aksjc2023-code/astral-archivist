import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useTimelineStore } from '../../store/useTimelineStore';
import { formatDurationMs } from '../../utils/media';

export const Track: React.FC = () => {
  const { edl, activePlayheadMs, selectedSegmentId, setPlayhead, toggleSegmentMute } = useTimelineStore();

  if (!edl) return null;

  const totalDuration = edl.duration_ms || 1;
  const playheadPercent = Math.min(100, Math.max(0, (activePlayheadMs / totalDuration) * 100));

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    setPlayhead(Math.round(ratio * totalDuration));
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-500/25 bg-black/15 p-4 backdrop-blur-md shadow-xl">
      <div className="flex items-center justify-between text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-astral-amber uppercase tracking-wider">
            Multi-Track Timeline
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            {formatDurationMs(activePlayheadMs)} / {formatDurationMs(edl.duration_ms)}
          </span>
        </div>
        <span className="text-[10px] text-slate-400">Non-Destructive EDL</span>
      </div>

      {/* Interactive Timeline Track Canvas */}
      <div
        onClick={handleTrackClick}
        className="relative h-20 w-full rounded-lg border border-amber-500/20 bg-black/30 overflow-hidden cursor-pointer select-none backdrop-blur-sm"
      >
        {/* Playhead Scrubber Line */}
        <div
          style={{ left: `${playheadPercent}%` }}
          className="absolute top-0 bottom-0 z-20 w-0.5 bg-astral-amber shadow-lg shadow-amber-500/80 pointer-events-none"
        >
          <div className="absolute -top-1 -left-1.5 h-3 w-3 rounded-full bg-astral-amber shadow-md" />
        </div>

        {/* Video Track Clips */}
        {edl.tracks.map((track) => (
          <div key={track.track_id} className="flex h-full w-full">
            {track.segments.map((seg) => {
              const segDuration = seg.timeline_end_ms - seg.timeline_start_ms;
              const widthPct = (segDuration / totalDuration) * 100;
              const isSelected = selectedSegmentId === seg.segment_id;

              return (
                <div
                  key={seg.segment_id}
                  style={{ width: `${widthPct}%` }}
                  className={`group relative h-full border-r border-slate-950/80 p-2 transition-all flex flex-col justify-between ${
                    seg.is_muted
                      ? 'bg-red-950/40 text-red-300'
                      : isSelected
                      ? 'bg-amber-500/25 border-y-2 border-amber-500 text-amber-200'
                      : 'bg-indigo-950/50 hover:bg-indigo-900/40 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-mono truncate">{seg.segment_id}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSegmentMute(seg.segment_id);
                      }}
                      className="p-1 hover:text-astral-amber"
                      title={seg.is_muted ? 'Unmute segment' : 'Mute segment'}
                    >
                      {seg.is_muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                    <span>{formatDurationMs(seg.source_start_ms)}</span>
                    <span>{formatDurationMs(seg.source_end_ms)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
