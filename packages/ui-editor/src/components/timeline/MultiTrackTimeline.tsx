import React, { useRef } from 'react';
import { TimelineClip, MarkerFlag, PlaybackSegment } from '@astral/core';
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
  onSeek: (time: number) => void;
  onSelectClip?: (clipId: string) => void;
}

export const MultiTrackTimeline: React.FC<MultiTrackTimelineProps> = ({
  currentTime,
  duration,
  segments,
  clips,
  markers,
  scale = 1.0,
  onSeek,
  onSelectClip,
}) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const pxPerSec = 4.5 * scale;
  const totalTimelineWidthPx = Math.max(1200, duration * pxPerSec + 200);

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickedTime = Math.max(0, clickX / pxPerSec);
    onSeek(clickedTime);
  };

  // 20-second ruler tick intervals
  const tickIntervalSec = 20;
  const totalTicks = Math.ceil(duration / tickIntervalSec) + 3;

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
          title="Add New Track"
          onClick={() => alert('Add Video, Audio, or Subtitle Track')}
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
            onClick={handleRulerClick}
            style={{
              height: '28px',
              backgroundColor: '#14171C',
              borderBottom: '1px solid #2B303A',
              position: 'relative',
              cursor: 'pointer',
            }}
          >
            {/* 20-Second Time Markers */}
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
                title={`${m.label} (${m.time}s)`}
                style={{
                  position: 'absolute',
                  left: `${m.time * pxPerSec}px`,
                  top: '2px',
                  transform: 'translateX(-50%)',
                  width: '10px',
                  height: '14px',
                  backgroundColor: m.color,
                  clipPath: 'polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%)',
                  zIndex: 15,
                  cursor: 'pointer',
                  boxShadow: `0 2px 6px ${m.color}88`,
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
              zIndex: 30,
              pointerEvents: 'none',
              transform: 'translateX(-1px)',
            }}
          >
            {/* Top Playhead Scrubber Badge on Ruler */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: '12px',
                height: '16px',
                backgroundColor: '#FF4757',
                borderRadius: '0 0 6px 6px',
                boxShadow: '0 2px 6px rgba(255, 71, 87, 0.6)',
              }}
            />
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
            {titleClips.map(clip => (
              <div
                key={clip.id}
                style={{
                  position: 'absolute',
                  left: `${clip.sourceStart * pxPerSec}px`,
                  width: `${clip.duration * pxPerSec}px`,
                  height: '24px',
                  top: '6px',
                  backgroundColor: '#8854D0',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 8px',
                  color: '#FFFFFF',
                  fontSize: '11px',
                  fontWeight: 500,
                  boxShadow: '0 2px 6px rgba(136, 84, 208, 0.3)',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                <span>{clip.title}</span>
              </div>
            ))}
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
              const isSelected = clip.isSelected;
              return (
                <div
                  key={clip.id}
                  onClick={() => onSelectClip?.(clip.id)}
                  style={{
                    position: 'absolute',
                    left: `${clip.sourceStart * pxPerSec}px`,
                    width: `${clip.duration * pxPerSec}px`,
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
                    boxShadow: isSelected ? '0 0 12px rgba(255, 211, 42, 0.4)' : 'none',
                  }}
                >
                  {/* Yellow Drag Handles if Selected (Page 1) */}
                  {isSelected && (
                    <>
                      <div
                        style={{
                          position: 'absolute',
                          left: '0',
                          top: '0',
                          bottom: '0',
                          width: '5px',
                          backgroundColor: '#FFD32A',
                          cursor: 'ew-resize',
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          right: '0',
                          top: '0',
                          bottom: '0',
                          width: '5px',
                          backgroundColor: '#FFD32A',
                          cursor: 'ew-resize',
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
                    {Array.from({ length: Math.min(40, Math.floor(clip.duration * 1.5)) }).map((_, barIdx) => {
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
            {audioClips.map(clip => (
              <div
                key={clip.id}
                style={{
                  position: 'absolute',
                  left: `${clip.sourceStart * pxPerSec}px`,
                  width: `${clip.duration * pxPerSec}px`,
                  height: '32px',
                  top: '6px',
                  backgroundColor: '#10AC84',
                  borderRadius: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '3px 8px',
                  color: '#FFFFFF',
                  boxShadow: '0 2px 8px rgba(16, 172, 132, 0.3)',
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {clip.title}
                </span>

                {/* Mint-Green Acoustic Waveform */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '14px' }}>
                  {Array.from({ length: 60 }).map((_, i) => (
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
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
