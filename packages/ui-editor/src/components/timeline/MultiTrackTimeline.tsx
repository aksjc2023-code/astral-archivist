import React, { useRef, useEffect } from 'react';
import { TimelineClip, MarkerFlag, PlaybackSegment, formatTimecode } from '@astral/core';
import {
  IconEye,
  IconLock,
  IconVolumeMute,
  IconTitles,
} from '../common/ScarletIcons';

export interface MultiTrackTimelineProps {
  currentTime: number;
  duration: number;
  segments: PlaybackSegment[];
  clips: TimelineClip[];
  markers: MarkerFlag[];
  scale: number; // Pixels per second multiplier
  selectedClipId?: string;
  onSeek: (time: number) => void;
  onSelectClip?: (clipId: string) => void;
  onTrimClip?: (clipId: string, side: 'left' | 'right', deltaSec: number) => void;
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
  onSeek,
  onSelectClip,
  onTrimClip,
  onAddTrack,
  onDeleteMarker,
}) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

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

  const handleTrimMouseDown = (e: React.MouseEvent, clipId: string, side: 'left' | 'right') => {
    e.stopPropagation();
    e.preventDefault();
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
    >
      {/* Left Track Control Headers (Page 1) */}
      <div
        style={{
          width: '56px',
          backgroundColor: '#14171C',
          borderRight: '1px solid #2B303A',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        {/* Top Header Corner: Plus Add Track */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Add New Track"
          style={{
            height: '28px',
            borderBottom: '1px solid #2B303A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#168BFF',
            fontSize: '16px',
            fontWeight: 600,
          }}
          title="Add New Video/Audio Track"
          onClick={onAddTrack ?? (() => {})}
        >
          +
        </div>

        {/* Track 1 Header: Titles */}
        <div
          style={{
            height: '36px',
            borderBottom: '1px solid #2B303A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            padding: '0 4px',
            color: '#8854D0',
          }}
          title="Titles & Subtitles Track"
        >
          <IconTitles size={14} color="#8854D0" />
          <IconEye size={12} color="#636E7B" />
          <IconLock size={12} color="#636E7B" />
        </div>

        {/* Track 2 Header: Video & Waveform */}
        <div
          style={{
            height: '76px',
            borderBottom: '1px solid #2B303A',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            color: '#4B6584',
          }}
          title="Composite Video Track"
        >
          <span style={{ fontSize: '13px' }}>🎬</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <IconEye size={12} color="#A4B0BE" />
            <IconLock size={12} color="#636E7B" />
          </div>
        </div>

        {/* Track 3 Header: Background Music */}
        <div
          style={{
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            padding: '0 4px',
            color: '#10AC84',
          }}
          title="Audio & Music Track"
        >
          <span style={{ fontSize: '13px' }}>🎵</span>
          <IconVolumeMute size={12} color="#636E7B" />
          <IconLock size={12} color="#636E7B" />
        </div>
      </div>

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
              return (
                <div
                  key={clip.id}
                  onClick={e => {
                    e.stopPropagation();
                    onSelectClip?.(clip.id);
                  }}
                  onDoubleClick={e => {
                    e.stopPropagation();
                    onSeek(clipStart);
                  }}
                  title={`[Title] ${clip.title} (Double-click to seek)`}
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
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
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
              return (
                <div
                  key={clip.id}
                  onClick={e => {
                    e.stopPropagation();
                    onSelectClip?.(clip.id);
                  }}
                  onDoubleClick={e => {
                    e.stopPropagation();
                    onSeek(clipStart);
                  }}
                  title={`[Video] ${clip.title} (${clipDur.toFixed(1)}s) - Click to select, Double-click to seek`}
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
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 0 14px rgba(255, 211, 42, 0.45)' : 'none',
                    transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
                  }}
                >
                  {/* Yellow Drag Handles if Selected (Page 1 Interactive Trim) */}
                  {isSelected && (
                    <>
                      <div
                        role="separator"
                        aria-label="Trim In-Point (Left handle)"
                        tabIndex={0}
                        title="Drag to trim clip in-point"
                        onMouseDown={e => handleTrimMouseDown(e, clip.id, 'left')}
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
                        role="separator"
                        aria-label="Trim Out-Point (Right handle)"
                        tabIndex={0}
                        title="Drag to trim clip out-point"
                        onMouseDown={e => handleTrimMouseDown(e, clip.id, 'right')}
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
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#FFFFFF', whiteSpace: 'nowrap' }}>
                      {clip.title}
                    </span>
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
              return (
                <div
                  key={clip.id}
                  onClick={e => {
                    e.stopPropagation();
                    onSelectClip?.(clip.id);
                  }}
                  onDoubleClick={e => {
                    e.stopPropagation();
                    onSeek(clipStart);
                  }}
                  title={`[Audio] ${clip.title} (Double-click to seek)`}
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
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                  }}
                >
                  <span style={{ fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {clip.title}
                  </span>

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
        </div>
      </div>
    </div>
  );
};
