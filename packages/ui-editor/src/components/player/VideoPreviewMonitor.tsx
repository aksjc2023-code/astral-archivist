import React, { useRef, useState, useEffect } from 'react';
import { WordToken, formatTimecode } from '@astral/core';
import {
  IconPlay,
  IconPause,
  IconFirstFrame,
  IconLastFrame,
  IconPrevFrame,
  IconNextFrame,
  IconVolume,
  IconVolumeMute,
  IconFullscreen,
  IconCrop,
  IconChevronDown,
} from '../common/ScarletIcons';

export interface VideoPreviewMonitorProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  tokens: WordToken[];
  aspectRatio: '16:9' | '9:16';
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onAspectRatioChange: (aspect: '16:9' | '9:16') => void;
  onNextFrame?: () => void;
  onPrevFrame?: () => void;
  onFirstFrame?: () => void;
  onLastFrame?: () => void;
  videoPreviewUrl?: string;
  isSeekLocked?: boolean;
}

export const VideoPreviewMonitor: React.FC<VideoPreviewMonitorProps> = ({
  currentTime,
  duration,
  isPlaying,
  tokens,
  aspectRatio,
  onTogglePlay,
  onSeek,
  onAspectRatioChange,
  onNextFrame,
  onPrevFrame,
  onFirstFrame,
  onLastFrame,
  videoPreviewUrl = 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=1200&q=85',
  isSeekLocked = false,
}) => {
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [showCropGuides, setShowCropGuides] = useState(false);
  const scrubberTrackRef = useRef<HTMLDivElement>(null);

  // Active word token for live karaoke subtitle overlay
  const activeToken = tokens.find(t => !t.deleted && currentTime >= t.start && currentTime <= t.end);
  const currentSentenceTokens = tokens.filter(
    t => !t.deleted && Math.abs(t.start - currentTime) < 3.0
  );

  const timecode = formatTimecode(currentTime);

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubberTrackRef.current || duration <= 0) return;
    const rect = scrubberTrackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#181B20',
        padding: '14px 16px',
        justifyContent: 'space-between',
        userSelect: 'none',
      }}
    >
      {/* Video Viewport Stage */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#111317',
          borderRadius: '12px',
          overflow: 'hidden',
          position: 'relative',
          boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)',
        }}
      >
        {/* Aspect Frame Container */}
        <div
          style={{
            position: 'relative',
            width: aspectRatio === '16:9' ? '100%' : 'auto',
            height: aspectRatio === '9:16' ? '100%' : 'auto',
            aspectRatio: aspectRatio === '16:9' ? '16 / 9' : '9 / 16',
            maxHeight: '100%',
            maxWidth: '100%',
            backgroundColor: '#000000',
            borderRadius: '6px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundImage: `url(${videoPreviewUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Subtle Vignette Gradient */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at center, transparent 40%, rgba(0,0,0,0.45) 100%)',
              pointerEvents: 'none',
            }}
          />

          {/* Crop Overlay Guidelines (Page 1 Toggle) */}
          {showCropGuides && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                border: '1px dashed rgba(255, 211, 42, 0.6)',
                pointerEvents: 'none',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gridTemplateRows: 'repeat(3, 1fr)',
              }}
            >
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} style={{ border: '0.5px solid rgba(255, 211, 42, 0.2)' }} />
              ))}
            </div>
          )}

          {/* Seek-Lock Visual Feedback */}
          {isSeekLocked && (
            <div
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                backgroundColor: 'rgba(255, 71, 87, 0.85)',
                color: '#FFFFFF',
                fontSize: '10px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '9999px',
                backdropFilter: 'blur(4px)',
              }}
            >
              SEEK-LOCK MUTEX
            </div>
          )}

          {/* Dynamic Burned-In Subtitles (Webster Victory Tier) */}
          <div
            style={{
              position: 'absolute',
              bottom: '24px',
              left: '20px',
              right: '20px',
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                display: 'inline-block',
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(6px)',
                borderRadius: '8px',
                padding: '6px 14px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              {currentSentenceTokens.length > 0 ? (
                currentSentenceTokens.map(tok => {
                  const isActive = activeToken?.id === tok.id;
                  return (
                    <span
                      key={tok.id}
                      style={{
                        margin: '0 3px',
                        fontSize: '14px',
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? '#168BFF' : '#FFFFFF',
                        textShadow: isActive ? '0 0 10px rgba(22, 139, 255, 0.8)' : 'none',
                        transition: 'all 0.1s ease',
                      }}
                    >
                      {tok.text}
                    </span>
                  );
                })
              ) : (
                <span style={{ fontSize: '13px', color: '#A4B0BE', fontStyle: 'italic' }}>
                  ScarletCut Interactive Preview Monitor
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Blue Scrubber Bar (Page 1) */}
      <div style={{ marginTop: '12px', marginBottom: '8px' }}>
        <div
          ref={scrubberTrackRef}
          onClick={handleScrubberClick}
          style={{
            position: 'relative',
            height: '6px',
            backgroundColor: '#2B303A',
            borderRadius: '9999px',
            cursor: 'pointer',
          }}
        >
          {/* Active Blue Progress Fill */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: `${Math.min(100, Math.max(0, progressPercent))}%`,
              backgroundColor: '#168BFF',
              borderRadius: '9999px',
            }}
          />

          {/* Circular Scrubber Thumb Handle with White Dot */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: `${Math.min(100, Math.max(0, progressPercent))}%`,
              transform: 'translate(-50%, -50%)',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              backgroundColor: '#168BFF',
              border: '2px solid #FFFFFF',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              cursor: 'grab',
            }}
          />
        </div>
      </div>

      {/* Transport Control Row (Page 1 Exact Layout) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '4px',
        }}
      >
        {/* Left: Timecode Readout */}
        <div style={{ display: 'flex', alignItems: 'baseline', fontFamily: "'JetBrains Mono', monospace" }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>
            {timecode.main}
          </span>
          <span style={{ fontSize: '11px', color: '#636E7B', marginLeft: '4px' }}>
            {timecode.ms}
          </span>
        </div>

        {/* Center: 5 Transport Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            title="First Frame (|◀)"
            onClick={onFirstFrame ?? (() => onSeek(0))}
            style={transportBtnStyle}
          >
            <IconFirstFrame size={16} />
          </button>
          <button
            type="button"
            title="Previous Frame (◀|)"
            onClick={onPrevFrame ?? (() => onSeek(Math.max(0, currentTime - 0.04)))}
            style={transportBtnStyle}
          >
            <IconPrevFrame size={16} />
          </button>
          <button
            type="button"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            onClick={onTogglePlay}
            style={{
              ...transportBtnStyle,
              width: '36px',
              height: '36px',
              backgroundColor: '#168BFF',
              color: '#FFFFFF',
              boxShadow: '0 2px 8px rgba(22, 139, 255, 0.4)',
            }}
          >
            {isPlaying ? <IconPause size={18} color="#FFFFFF" /> : <IconPlay size={18} color="#FFFFFF" />}
          </button>
          <button
            type="button"
            title="Next Frame (|▶)"
            onClick={onNextFrame ?? (() => onSeek(Math.min(duration, currentTime + 0.04)))}
            style={transportBtnStyle}
          >
            <IconNextFrame size={16} />
          </button>
          <button
            type="button"
            title="Last Frame (▶|)"
            onClick={onLastFrame ?? (() => onSeek(duration))}
            style={transportBtnStyle}
          >
            <IconLastFrame size={16} />
          </button>
        </div>

        {/* Right: Aspect Ratio, Volume, Crop, Fullscreen */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Aspect Ratio Selector */}
          <button
            type="button"
            title="Switch Aspect Ratio"
            onClick={() => onAspectRatioChange(aspectRatio === '16:9' ? '9:16' : '16:9')}
            style={{
              backgroundColor: '#22262E',
              color: '#FFFFFF',
              border: '1px solid #2B303A',
              borderRadius: '9999px',
              padding: '3px 10px',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
          >
            <span>{aspectRatio}</span>
            <IconChevronDown size={10} color="#A4B0BE" />
          </button>

          {/* Volume */}
          <button
            type="button"
            title={isMuted ? 'Unmute' : 'Mute'}
            onClick={() => setIsMuted(!isMuted)}
            style={transportBtnStyle}
          >
            {isMuted ? <IconVolumeMute size={16} color="#FF4757" /> : <IconVolume size={16} />}
          </button>

          {/* Crop Toggle */}
          <button
            type="button"
            title="Toggle Crop Guides"
            onClick={() => setShowCropGuides(!showCropGuides)}
            style={{
              ...transportBtnStyle,
              color: showCropGuides ? '#FFD32A' : '#A4B0BE',
            }}
          >
            <IconCrop size={16} />
          </button>

          {/* Fullscreen */}
          <button
            type="button"
            title="Fullscreen Preview"
            onClick={() => {
              const el = document.documentElement;
              if (document.fullscreenElement) {
                document.exitFullscreen();
              } else {
                el.requestFullscreen().catch(() => {});
              }
            }}
            style={transportBtnStyle}
          >
            <IconFullscreen size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

const transportBtnStyle: React.CSSProperties = {
  width: '30px',
  height: '30px',
  borderRadius: '50%',
  backgroundColor: '#22262E',
  color: '#A4B0BE',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};
