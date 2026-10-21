import React, { useRef, useState, useEffect } from 'react';
import { TimelineClip, MarkerFlag, PlaybackSegment, formatTimecode } from '@astral/core';
import {
  IconEye,
  IconLock,
  IconVolume,
  IconVolumeMute,
  IconTitles,
} from '../common/ScarletIcons';

export interface TrackControlState {
  hidden?: boolean;
  locked?: boolean;
  muted?: boolean;
  volume?: number; // 0 to 200 (percent), default 100
}

export interface MultiTrackTimelineProps {
  currentTime: number;
  duration: number;
  segments: PlaybackSegment[];
  clips: TimelineClip[];
  markers: MarkerFlag[];
  scale: number; // Pixels per second multiplier
  selectedClipId?: string;
  trackStates?: Record<string, TrackControlState>;
  onToggleTrackHidden?: (trackId: string) => void;
  onToggleTrackLocked?: (trackId: string) => void;
  onToggleTrackMuted?: (trackId: string) => void;
  onTrackVolumeChange?: (trackId: string, volume: number) => void;
  onClipVolumeChange?: (clipId: string, volume: number) => void;
  onSeek: (time: number) => void;
  onSelectClip?: (clipId: string) => void;
  onTrimClip?: (clipId: string, side: 'left' | 'right', deltaSec: number) => void;
  onMoveClip?: (clipId: string, newStartSec: number) => void;
  onClipMoveEnd?: (clipId: string) => void;
  onAddTrack?: () => void;
  onDeleteMarker?: (markerId: string) => void;
}

const getClipStart = (c: TimelineClip): number => c.timelineStart ?? c.sourceStart ?? 0;
const getClipDuration = (c: TimelineClip): number => c.timelineDuration ?? c.duration ?? 0;

export const MultiTrackTimeline: React.FC<MultiTrackTimelineProps> = ({
  currentTime,
  duration,
  segments,
  clips,
  markers,
  scale = 1.0,
  selectedClipId,
  trackStates,
  onToggleTrackHidden,
  onToggleTrackLocked,
  onToggleTrackMuted,
  onTrackVolumeChange,
  onClipVolumeChange,
  onSeek,
  onSelectClip,
  onTrimClip,
  onMoveClip,
  onClipMoveEnd,
  onAddTrack,
  onDeleteMarker,
}) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Track control state fallback if not controlled by parent
  const [internalTrackStates, setInternalTrackStates] = useState<Record<string, TrackControlState>>({});
  const activeTrackStates = trackStates ?? internalTrackStates;

  const toggleHidden = (trackId: string) => {
    if (onToggleTrackHidden) {
      onToggleTrackHidden(trackId);
    } else {
      setInternalTrackStates(prev => ({
        ...prev,
        [trackId]: { ...prev[trackId], hidden: !prev[trackId]?.hidden },
      }));
    }
  };

  const toggleLocked = (trackId: string) => {
    if (onToggleTrackLocked) {
      onToggleTrackLocked(trackId);
    } else {
      setInternalTrackStates(prev => ({
        ...prev,
        [trackId]: { ...prev[trackId], locked: !prev[trackId]?.locked },
      }));
    }
  };

  const toggleMuted = (trackId: string) => {
    if (onToggleTrackMuted) {
      onToggleTrackMuted(trackId);
    } else {
      setInternalTrackStates(prev => ({
        ...prev,
        [trackId]: { ...prev[trackId], muted: !prev[trackId]?.muted },
      }));
    }
  };

  const changeTrackVolume = (trackId: string, volume: number) => {
    if (onTrackVolumeChange) {
      onTrackVolumeChange(trackId, volume);
    } else {
      setInternalTrackStates(prev => ({
        ...prev,
        [trackId]: { ...prev[trackId], volume },
      }));
    }
  };

  const [volumePopoverTrackId, setVolumePopoverTrackId] = useState<string | null>(null);

  const pxPerSec = 22 * scale;
  const totalTimelineWidthPx = Math.max(1400, duration * pxPerSec + 300);

  const calculateTimeFromClientX = (clientX: number) => {
    if (!rulerRef.current) return 0;
    const rect = rulerRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    return Math.max(0, Math.min(duration, clickX / pxPerSec));
  };

  const handleStartScrubbing = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    const clickedTime = calculateTimeFromClientX(e.clientX);
    onSeek(clickedTime);
  };

  const handleTrimMouseDown = (e: React.MouseEvent, clipId: string, side: 'left' | 'right', trackId?: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (trackId && activeTrackStates[trackId]?.locked) return;
    const startX = e.clientX;
    let accumulatedSec = 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      const currentDeltaSec = Number((deltaPx / pxPerSec).toFixed(2));
      const stepDelta = currentDeltaSec - accumulatedSec;
      if (Math.abs(stepDelta) >= 0.05) {
        accumulatedSec = currentDeltaSec;
        onTrimClip?.(clipId, side, stepDelta);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Horizontal clip dragging / timeline shift coordinator
  const handleClipMouseDown = (
    e: React.MouseEvent,
    clipId: string,
    initialStart: number,
    trackId: string
  ) => {
    if (e.button !== 0) return;
    if (activeTrackStates[trackId]?.locked) return;

    e.stopPropagation();
    onSelectClip?.(clipId);

    const startX = e.clientX;
    let hasDragged = false;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      if (!hasDragged && Math.abs(deltaPx) > 3) {
        hasDragged = true;
      }
      if (hasDragged) {
        const deltaSec = deltaPx / pxPerSec;
        const newStart = Math.max(0, Number((initialStart + deltaSec).toFixed(2)));
        onMoveClip?.(clipId, newStart);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (hasDragged) {
        onClipMoveEnd?.(clipId);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newTime = calculateTimeFromClientX(e.clientX);
      onSeek(newTime);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [pxPerSec, duration, onSeek]);

  // 5-second ruler tick intervals for clear, usable precision
  const tickIntervalSec = scale > 1.5 ? 2 : 5;
  const totalTicks = Math.ceil(duration / tickIntervalSec) + 4;

  const playheadPositionPx = currentTime * pxPerSec;

  const titleClips = clips.filter(c => c.trackId === 'track_title');
  const videoClips = clips.filter(c => c.trackId === 'track_video');
  const audioClips = clips.filter(c => c.trackId === 'track_audio');

  // Discover and render all dynamic/custom tracks added via Add Track or plugins
  const customTrackIds = Array.from(
    new Set(
      clips
        .map(c => c.trackId)
        .filter(id => !['track_title', 'track_video', 'track_audio'].includes(id))
    )
  ).sort();

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        backgroundColor: '#111317',
        overflow: 'hidden',
        userSelect: 'none',
        position: 'relative',
      }}
      onClick={() => setVolumePopoverTrackId(null)}
    >
      {/* Left Track Control Headers (Wider 84px for volume control and labels) */}
      <div
        style={{
          width: '84px',
          backgroundColor: '#14171C',
          borderRight: '1px solid #2B303A',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        {/* Top Header Corner: Plus Add Track */}
        <button
          type="button"
          aria-label="Add New Track"
          style={{
            height: '28px',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: '1px solid #2B303A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#168BFF',
            fontSize: '12px',
            fontWeight: 700,
            transition: 'background-color 0.15s, transform 0.1s',
          }}
          title="Add New Video/Audio Track"
          onClick={onAddTrack ?? (() => {})}
        >
          + Track
        </button>

        {/* Track 1 Header: Titles */}
        <div
          style={{
            height: '36px',
            borderBottom: '1px solid #2B303A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 6px',
            color: '#8854D0',
          }}
          title="Titles & Subtitles Track"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <IconTitles size={13} color="#8854D0" />
            <span style={{ fontSize: '10px', fontWeight: 600 }}>Titles</span>
          </div>
          <div style={{ display: 'flex', gap: '2px' }}>
            <button
              id="btn-hide-track_title"
              data-testid="btn-hide-track_title"
              type="button"
              title={activeTrackStates['track_title']?.hidden ? 'Show Track' : 'Hide Track'}
              onClick={() => toggleHidden('track_title')}
              style={trackBtnStyle}
            >
              <IconEye size={11} color={activeTrackStates['track_title']?.hidden ? '#FF4757' : '#A4B0BE'} />
            </button>
            <button
              id="btn-lock-track_title"
              data-testid="btn-lock-track_title"
              type="button"
              title={activeTrackStates['track_title']?.locked ? 'Unlock Track' : 'Lock Track'}
              onClick={() => toggleLocked('track_title')}
              style={trackBtnStyle}
            >
              <IconLock size={11} color={activeTrackStates['track_title']?.locked ? '#FFD32A' : '#636E7B'} />
            </button>
          </div>
        </div>

        {/* Track 2 Header: Video & Waveform with Volume Slider */}
        <div
          style={{
            height: '76px',
            borderBottom: '1px solid #2B303A',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '4px 6px',
            color: '#4B6584',
            position: 'relative',
          }}
          title="Composite Video Track"
        >
          {/* Header Row: Label + Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <span style={{ fontSize: '12px' }}>🎬</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#A4B0BE' }}>Video</span>
            </div>
            <div style={{ display: 'flex', gap: '2px' }}>
              <button
                id="btn-hide-track_video"
                data-testid="btn-hide-track_video"
                type="button"
                title={activeTrackStates['track_video']?.hidden ? 'Show Track' : 'Hide Track'}
                onClick={() => toggleHidden('track_video')}
                style={trackBtnStyle}
              >
                <IconEye size={11} color={activeTrackStates['track_video']?.hidden ? '#FF4757' : '#A4B0BE'} />
              </button>
              <button
                id="btn-lock-track_video"
                data-testid="btn-lock-track_video"
                type="button"
                title={activeTrackStates['track_video']?.locked ? 'Unlock Track' : 'Lock Track'}
                onClick={() => toggleLocked('track_video')}
                style={trackBtnStyle}
              >
                <IconLock size={11} color={activeTrackStates['track_video']?.locked ? '#FFD32A' : '#636E7B'} />
              </button>
            </div>
          </div>

          {/* Volume Control Row */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9px', color: '#8A96A6' }}>
              <button
                id="btn-vol-popover-track_video"
                data-testid="btn-vol-popover-track_video"
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setVolumePopoverTrackId(volumePopoverTrackId === 'track_video' ? null : 'track_video');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  color: (activeTrackStates['track_video']?.volume ?? 100) === 0 ? '#FF4757' : '#168BFF',
                }}
                title="Click for Video Volume Presets"
              >
                {(activeTrackStates['track_video']?.volume ?? 100) === 0 ? (
                  <IconVolumeMute size={11} color="#FF4757" />
                ) : (
                  <IconVolume size={11} color="#168BFF" />
                )}
                <span>Vol</span>
              </button>
              <span style={{ fontWeight: 600, color: '#FFFFFF' }}>
                {activeTrackStates['track_video']?.volume ?? 100}%
              </span>
            </div>
            <input
              id="input-vol-track_video"
              data-testid="input-vol-track_video"
              type="range"
              min="0"
              max="200"
              step="1"
              value={activeTrackStates['track_video']?.volume ?? 100}
              onChange={e => changeTrackVolume('track_video', Number(e.target.value))}
              title={`Video Track Volume: ${activeTrackStates['track_video']?.volume ?? 100}%`}
              style={{
                width: '100%',
                height: '4px',
                accentColor: '#168BFF',
                cursor: 'pointer',
                margin: '2px 0',
              }}
            />
          </div>
        </div>

        {/* Track 3 Header: Background Music with Volume Slider */}
        <div
          style={{
            height: '44px',
            borderBottom: customTrackIds.length > 0 ? '1px solid #2B303A' : 'none',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '3px 6px',
            color: '#10AC84',
            position: 'relative',
          }}
          title="Audio & Music Track"
        >
          {/* Header Row: Label + Mute & Lock */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <span style={{ fontSize: '11px' }}>🎵</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#10AC84' }}>Audio</span>
            </div>
            <div style={{ display: 'flex', gap: '2px' }}>
              <button
                id="btn-mute-track_audio"
                data-testid="btn-mute-track_audio"
                type="button"
                title={activeTrackStates['track_audio']?.muted ? 'Unmute Track' : 'Mute Track'}
                onClick={() => toggleMuted('track_audio')}
                style={trackBtnStyle}
              >
                <IconVolumeMute size={11} color={activeTrackStates['track_audio']?.muted ? '#FF4757' : '#10AC84'} />
              </button>
              <button
                id="btn-lock-track_audio"
                data-testid="btn-lock-track_audio"
                type="button"
                title={activeTrackStates['track_audio']?.locked ? 'Unlock Track' : 'Lock Track'}
                onClick={() => toggleLocked('track_audio')}
                style={trackBtnStyle}
              >
                <IconLock size={11} color={activeTrackStates['track_audio']?.locked ? '#FFD32A' : '#636E7B'} />
              </button>
            </div>
          </div>

          {/* Volume Control Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              id="input-vol-track_audio"
              data-testid="input-vol-track_audio"
              type="range"
              min="0"
              max="200"
              step="1"
              value={activeTrackStates['track_audio']?.muted ? 0 : (activeTrackStates['track_audio']?.volume ?? 100)}
              onChange={e => changeTrackVolume('track_audio', Number(e.target.value))}
              title={`Audio Track Volume: ${activeTrackStates['track_audio']?.volume ?? 100}%`}
              style={{
                flex: 1,
                height: '4px',
                accentColor: '#10AC84',
                cursor: 'pointer',
              }}
            />
            <span
              id="btn-vol-badge-track_audio"
              data-testid="btn-vol-badge-track_audio"
              onClick={e => {
                e.stopPropagation();
                setVolumePopoverTrackId(volumePopoverTrackId === 'track_audio' ? null : 'track_audio');
              }}
              style={{
                fontSize: '9px',
                fontWeight: 600,
                color: activeTrackStates['track_audio']?.muted ? '#FF4757' : '#FFFFFF',
                cursor: 'pointer',
                minWidth: '24px',
                textAlign: 'right',
              }}
              title="Click for Volume Presets"
            >
              {activeTrackStates['track_audio']?.muted ? '0%' : `${activeTrackStates['track_audio']?.volume ?? 100}%`}
            </span>
          </div>
        </div>

        {/* Dynamic Custom Track Headers */}
        {customTrackIds.map((trackId, idx) => (
          <div
            key={trackId}
            style={{
              height: '40px',
              borderBottom: '1px solid #2B303A',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '2px 6px',
              color: '#FFA502',
              position: 'relative',
            }}
            title={`Custom Overlay Track ${idx + 1} (${trackId})`}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '10px', fontWeight: 600 }}>T{idx + 4}</span>
              <div style={{ display: 'flex', gap: '2px' }}>
                <button
                  type="button"
                  title={activeTrackStates[trackId]?.hidden ? 'Show Track' : 'Hide Track'}
                  onClick={() => toggleHidden(trackId)}
                  style={trackBtnStyle}
                >
                  <IconEye size={11} color={activeTrackStates[trackId]?.hidden ? '#FF4757' : '#A4B0BE'} />
                </button>
                <button
                  type="button"
                  title={activeTrackStates[trackId]?.locked ? 'Unlock Track' : 'Lock Track'}
                  onClick={() => toggleLocked(trackId)}
                  style={trackBtnStyle}
                >
                  <IconLock size={11} color={activeTrackStates[trackId]?.locked ? '#FFD32A' : '#636E7B'} />
                </button>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              value={activeTrackStates[trackId]?.volume ?? 100}
              onChange={e => changeTrackVolume(trackId, Number(e.target.value))}
              style={{ width: '100%', height: '3px', accentColor: '#FFA502' }}
            />
          </div>
        ))}
      </div>

      {/* Floating Volume Presets Popover */}
      {volumePopoverTrackId && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: '88px',
            top: volumePopoverTrackId === 'track_video' ? '70px' : '140px',
            backgroundColor: '#1E222B',
            border: '1px solid #168BFF',
            borderRadius: '8px',
            padding: '12px 14px',
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7), 0 0 12px rgba(22, 139, 255, 0.3)',
            width: '210px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#FFFFFF' }}>
              {volumePopoverTrackId === 'track_video' ? 'Video Audio Gain' : 'Music Track Gain'}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#168BFF' }}>
              {activeTrackStates[volumePopoverTrackId]?.volume ?? 100}%
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="200"
            step="1"
            value={activeTrackStates[volumePopoverTrackId]?.volume ?? 100}
            onChange={e => changeTrackVolume(volumePopoverTrackId, Number(e.target.value))}
            style={{ width: '100%', accentColor: '#168BFF', cursor: 'pointer' }}
          />

          <div style={{ display: 'flex', gap: '4px', justifyContent: 'space-between' }}>
            {[0, 50, 100, 150, 200].map(pct => (
              <button
                key={pct}
                id={`btn-preset-${pct}`}
                data-testid={`btn-preset-${pct}`}
                type="button"
                onClick={() => changeTrackVolume(volumePopoverTrackId, pct)}
                style={{
                  backgroundColor: (activeTrackStates[volumePopoverTrackId]?.volume ?? 100) === pct ? '#168BFF' : '#2A303C',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '2px 5px',
                  fontSize: '9px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {pct === 0 ? 'Mute' : `${pct}%`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable Tracks Canvas Well */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          position: 'relative',
          backgroundColor: '#111317',
        }}
      >
        <div style={{ width: `${totalTimelineWidthPx}px`, height: '100%', position: 'relative' }}>
          {/* Timeline Timecode Ruler (Page 1) */}
          <div
            ref={rulerRef}
            onMouseDown={handleStartScrubbing}
            style={{
              height: '28px',
              backgroundColor: '#14171C',
              borderBottom: '1px solid #2B303A',
              position: 'relative',
              cursor: 'ew-resize',
            }}
          >
            {/* Time Markers */}
            {Array.from({ length: totalTicks }).map((_, i) => {
              const tickSec = i * tickIntervalSec;
              const leftPx = tickSec * pxPerSec;
              const mins = Math.floor(tickSec / 60);
              const secs = tickSec % 60;
              const label = `00:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${leftPx}px`,
                    top: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: '4px',
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{ width: '1px', height: '8px', backgroundColor: '#454D5B', position: 'absolute', left: 0, bottom: 0 }} />
                  <span style={{ fontSize: '9px', fontFamily: "'JetBrains Mono', monospace", color: '#636E7B' }}>
                    {label}
                  </span>
                </div>
              );
            })}

            {/* Colored Pentagon Marker Flags (Page 1) */}
            {markers.map(m => (
              <div
                key={m.id}
                onClick={e => {
                  e.stopPropagation();
                  onSeek(m.time);
                }}
                onContextMenu={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onDeleteMarker) onDeleteMarker(m.id);
                }}
                title={`${m.label} (${m.time.toFixed(1)}s) - Click to seek, Right-click to delete`}
                style={{
                  position: 'absolute',
                  left: `${m.time * pxPerSec}px`,
                  top: '2px',
                  transform: 'translateX(-50%)',
                  width: '12px',
                  height: '16px',
                  backgroundColor: m.color,
                  clipPath: 'polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%)',
                  zIndex: 25,
                  cursor: 'pointer',
                  boxShadow: `0 2px 8px ${m.color}AA`,
                  transition: 'transform 0.1s ease',
                }}
              />
            ))}
          </div>

          {/* Red Draggable Playhead Scrubber (Page 1) */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${playheadPositionPx}px`,
              width: '2px',
              backgroundColor: '#FF4757',
              zIndex: 35,
              pointerEvents: 'none',
              transform: 'translateX(-1px)',
            }}
          >
            {/* Top Playhead Scrubber Badge on Ruler with Live Timecode Tooltip */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: '14px',
                height: '18px',
                backgroundColor: '#FF4757',
                borderRadius: '0 0 6px 6px',
                boxShadow: '0 2px 8px rgba(255, 71, 87, 0.7)',
                cursor: 'grab',
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseDown={handleStartScrubbing}
            >
              <div style={{ width: '4px', height: '4px', backgroundColor: '#FFFFFF', borderRadius: '50%' }} />
            </div>
          </div>

          {/* Track 1 — Titles & Captions Strip */}
          <div
            style={{
              height: '36px',
              borderBottom: '1px solid #1E232B',
              position: 'relative',
              backgroundColor: '#14171C',
            }}
          >
            {titleClips.map(clip => {
              const isSelected = clip.id === selectedClipId;
              const clipStart = getClipStart(clip);
              const clipDur = getClipDuration(clip);
              const isTrackHidden = activeTrackStates['track_title']?.hidden;
              const isTrackLocked = activeTrackStates['track_title']?.locked;
              return (
                <div
                  key={clip.id}
                  onClick={e => {
                    e.stopPropagation();
                    onSelectClip?.(clip.id);
                  }}
                  onMouseDown={e => handleClipMouseDown(e, clip.id, clipStart, 'track_title')}
                  onDoubleClick={e => {
                    e.stopPropagation();
                    onSeek(clipStart);
                  }}
                  title={`[Title] ${clip.title} (Drag to shift, Double-click to seek)`}
                  style={{
                    position: 'absolute',
                    left: `${clipStart * pxPerSec}px`,
                    width: `${Math.max(20, clipDur * pxPerSec)}px`,
                    height: '24px',
                    top: '6px',
                    backgroundColor: '#8854D0',
                    border: isSelected ? '2px solid #FFD32A' : '1px solid #9B63E6',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 500,
                    boxShadow: isSelected ? '0 0 10px rgba(255, 211, 42, 0.5)' : '0 2px 6px rgba(136, 84, 208, 0.3)',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    cursor: isTrackLocked ? 'not-allowed' : 'grab',
                    opacity: isTrackHidden ? 0.3 : 1,
                    filter: isTrackHidden ? 'grayscale(80%)' : 'none',
                    transition: 'border 0.12s ease, opacity 0.15s ease',
                  }}
                >
                  <span>{clip.title}</span>
                </div>
              );
            })}
          </div>

          {/* Track 2 — Video Clips + Integrated Waveform (Page 1) */}
          <div
            style={{
              height: '76px',
              borderBottom: '1px solid #1E232B',
              position: 'relative',
              backgroundColor: '#111317',
            }}
          >
            {videoClips.map((clip, index) => {
              const isSelected = clip.id === selectedClipId || clip.isSelected;
              const clipStart = getClipStart(clip);
              const clipDur = getClipDuration(clip);
              const isTrackHidden = activeTrackStates['track_video']?.hidden;
              const isTrackLocked = activeTrackStates['track_video']?.locked;
              return (
                <div
                  key={clip.id}
                  onClick={e => {
                    e.stopPropagation();
                    onSelectClip?.(clip.id);
                  }}
                  onMouseDown={e => handleClipMouseDown(e, clip.id, clipStart, 'track_video')}
                  onDoubleClick={e => {
                    e.stopPropagation();
                    onSeek(clipStart);
                  }}
                  id={`timeline-clip-${clip.id}`}
                  data-testid={`timeline-clip-${clip.id}`}
                  title={`[Video] ${clip.title} (${clipDur.toFixed(1)}s) - Drag to shift, Double-click to seek`}
                  style={{
                    position: 'absolute',
                    left: `${clipStart * pxPerSec}px`,
                    width: `${Math.max(20, clipDur * pxPerSec)}px`,
                    height: '66px',
                    top: '5px',
                    backgroundColor: '#2A3548',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #FFD32A' : '1px solid #3B4F6B',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    cursor: isTrackLocked ? 'not-allowed' : 'grab',
                    opacity: isTrackHidden ? 0.3 : 1,
                    filter: isTrackHidden ? 'grayscale(80%)' : 'none',
                    boxShadow: isSelected ? '0 0 14px rgba(255, 211, 42, 0.45)' : 'none',
                    transition: 'border-color 0.12s ease, box-shadow 0.12s ease, opacity 0.15s ease',
                  }}
                >
                  {/* Yellow Drag Handles if Selected and track not locked */}
                  {isSelected && !isTrackLocked && (
                    <>
                      <div
                        id={`trim-left-${clip.id}`}
                        data-testid={`trim-left-${clip.id}`}
                        role="separator"
                        aria-label="Trim In-Point (Left handle)"
                        tabIndex={0}
                        title="Drag to trim clip in-point"
                        onMouseDown={e => handleTrimMouseDown(e, clip.id, 'left', clip.trackId)}
                        style={{
                          position: 'absolute',
                          left: '0',
                          top: '0',
                          bottom: '0',
                          width: '7px',
                          backgroundColor: '#FFD32A',
                          cursor: 'ew-resize',
                          zIndex: 10,
                          borderRadius: '2px 0 0 2px',
                        }}
                      />
                      <div
                        id={`trim-right-${clip.id}`}
                        data-testid={`trim-right-${clip.id}`}
                        role="separator"
                        aria-label="Trim Out-Point (Right handle)"
                        tabIndex={0}
                        title="Drag to trim clip out-point"
                        onMouseDown={e => handleTrimMouseDown(e, clip.id, 'right', clip.trackId)}
                        style={{
                          position: 'absolute',
                          right: '0',
                          top: '0',
                          bottom: '0',
                          width: '7px',
                          backgroundColor: '#FFD32A',
                          cursor: 'ew-resize',
                          zIndex: 10,
                          borderRadius: '0 2px 2px 0',
                        }}
                      />
                    </>
                  )}

                  {/* Thumbnail Strip Header */}
                  <div
                    style={{
                      height: '38px',
                      backgroundColor: '#35435B',
                      padding: '4px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', overflow: 'hidden' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#FFFFFF', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {clip.title}
                      </span>
                      <span
                        onClick={e => {
                          e.stopPropagation();
                          const newVol = prompt(`Set clip volume % (0 - 200):`, String(clip.volume ?? 100));
                          if (newVol !== null && !isNaN(Number(newVol))) {
                            onClipVolumeChange?.(clip.id, Math.max(0, Math.min(200, Number(newVol))));
                          }
                        }}
                        style={{
                          fontSize: '9px',
                          backgroundColor: 'rgba(0, 0, 0, 0.45)',
                          color: '#A4B0BE',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          flexShrink: 0,
                          marginLeft: '6px',
                        }}
                        title="Click to set clip volume %"
                      >
                        {clip.volume !== undefined ? `${clip.volume}%` : '100%'}
                      </span>
                    </div>
                  </div>

                  {/* Lavender-Blue Waveform Strip Below (Page 1) */}
                  <div
                    style={{
                      height: '24px',
                      backgroundColor: 'rgba(75, 101, 132, 0.6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-around',
                      padding: '0 4px',
                    }}
                  >
                    {/* Simulated Audio Bars */}
                    {Array.from({ length: Math.min(50, Math.floor(clipDur * 2.2)) }).map((_, barIdx) => {
                      const h = 4 + ((barIdx * 7) % 18);
                      return (
                        <div
                          key={barIdx}
                          style={{
                            width: '2px',
                            height: `${h}px`,
                            backgroundColor: '#A4B0BE',
                            borderRadius: '1px',
                          }}
                        />
                      );
                    })}
                  </div>

                  {/* Transition Badge "][" (Page 1) */}
                  {clip.transitionOut && index < videoClips.length - 1 && (
                    <div
                      title="Transition: Cross Dissolve"
                      style={{
                        position: 'absolute',
                        right: '-8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        backgroundColor: '#168BFF',
                        color: '#FFFFFF',
                        borderRadius: '4px',
                        padding: '1px 3px',
                        fontSize: '9px',
                        fontWeight: 700,
                        zIndex: 12,
                      }}
                    >
                      ][
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Track 3 — Background Emerald Music Track (Page 1) */}
          <div
            style={{
              height: '44px',
              position: 'relative',
              backgroundColor: '#14171C',
            }}
          >
            {audioClips.map(clip => {
              const isSelected = clip.id === selectedClipId;
              const clipStart = getClipStart(clip);
              const clipDur = getClipDuration(clip);
              const isTrackMuted = activeTrackStates['track_audio']?.muted;
              const isTrackLocked = activeTrackStates['track_audio']?.locked;
              return (
                <div
                  key={clip.id}
                  onClick={e => {
                    e.stopPropagation();
                    onSelectClip?.(clip.id);
                  }}
                  onMouseDown={e => handleClipMouseDown(e, clip.id, clipStart, 'track_audio')}
                  onDoubleClick={e => {
                    e.stopPropagation();
                    onSeek(clipStart);
                  }}
                  title={`[Audio] ${clip.title} - Drag to shift, Double-click to seek`}
                  style={{
                    position: 'absolute',
                    left: `${clipStart * pxPerSec}px`,
                    width: `${Math.max(20, clipDur * pxPerSec)}px`,
                    height: '32px',
                    top: '6px',
                    backgroundColor: '#10AC84',
                    border: isSelected ? '2px solid #FFD32A' : 'none',
                    borderRadius: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '3px 8px',
                    color: '#FFFFFF',
                    boxShadow: isSelected ? '0 0 12px rgba(255, 211, 42, 0.45)' : '0 2px 8px rgba(16, 172, 132, 0.3)',
                    overflow: 'hidden',
                    cursor: isTrackLocked ? 'not-allowed' : 'grab',
                    opacity: isTrackMuted ? 0.35 : 1,
                    filter: isTrackMuted ? 'grayscale(70%)' : 'none',
                    transition: 'all 0.12s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', overflow: 'hidden' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {clip.title}
                    </span>
                    <span
                      onClick={e => {
                        e.stopPropagation();
                        const newVol = prompt(`Set clip volume % (0 - 200):`, String(clip.volume ?? 100));
                        if (newVol !== null && !isNaN(Number(newVol))) {
                          onClipVolumeChange?.(clip.id, Math.max(0, Math.min(200, Number(newVol))));
                        }
                      }}
                      style={{
                        fontSize: '9px',
                        backgroundColor: 'rgba(0, 0, 0, 0.45)',
                        color: '#E0FFF5',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        flexShrink: 0,
                        marginLeft: '6px',
                      }}
                      title="Click to set clip volume %"
                    >
                      {clip.volume !== undefined ? `${clip.volume}%` : '100%'}
                    </span>
                  </div>

                  {/* Mint-Green Acoustic Waveform */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '14px' }}>
                    {Array.from({ length: Math.min(80, Math.floor(clipDur * 2)) }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          width: '2px',
                          height: `${3 + ((i * 11) % 12)}px`,
                          backgroundColor: '#7BED9F',
                          borderRadius: '1px',
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dynamic Custom Tracks Lanes */}
          {customTrackIds.map((trackId, trackIdx) => {
            const trackClips = clips.filter(c => c.trackId === trackId);
            const isTrackHidden = activeTrackStates[trackId]?.hidden;
            const isTrackLocked = activeTrackStates[trackId]?.locked;
            return (
              <div
                key={trackId}
                style={{
                  height: '40px',
                  position: 'relative',
                  backgroundColor: trackIdx % 2 === 0 ? '#181B20' : '#14171C',
                  borderBottom: '1px solid #22262E',
                }}
              >
                {trackClips.map(clip => {
                  const isSelected = clip.id === selectedClipId;
                  const clipStart = getClipStart(clip);
                  const clipDur = getClipDuration(clip);
                  return (
                    <div
                      key={clip.id}
                      onClick={e => {
                        e.stopPropagation();
                        onSelectClip?.(clip.id);
                      }}
                      onMouseDown={e => handleClipMouseDown(e, clip.id, clipStart, trackId)}
                      onDoubleClick={e => {
                        e.stopPropagation();
                        onSeek(clipStart);
                      }}
                      title={`${clip.title} - Drag to shift, Double-click to seek`}
                      style={{
                        position: 'absolute',
                        left: `${clipStart * pxPerSec}px`,
                        width: `${Math.max(20, clipDur * pxPerSec)}px`,
                        height: '30px',
                        top: '5px',
                        backgroundColor: clip.color || '#FFA502',
                        border: isSelected ? '2px solid #FFD32A' : 'none',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 8px',
                        color: '#FFFFFF',
                        boxShadow: isSelected ? '0 0 12px rgba(255, 211, 42, 0.45)' : 'none',
                        overflow: 'hidden',
                        cursor: isTrackLocked ? 'not-allowed' : 'grab',
                        opacity: isTrackHidden ? 0.3 : 1,
                        filter: isTrackHidden ? 'grayscale(80%)' : 'none',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      {clip.title}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const trackBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '2px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '3px',
  transition: 'background-color 0.15s, color 0.15s',
};
