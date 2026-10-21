import React, { useRef, useState, useEffect, useMemo } from 'react';
import { WordToken, ToolSettings, formatTimecode, AspectRatio } from '@astral/core';
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
  aspectRatio: AspectRatio;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onAspectRatioChange: (aspect: AspectRatio) => void;
  onNextFrame?: () => void;
  onPrevFrame?: () => void;
  onFirstFrame?: () => void;
  onLastFrame?: () => void;
  videoPreviewUrl?: string;
  sourceTimeOffset?: number;
  isSeekLocked?: boolean;
  onSeekLockChange?: (isLocked: boolean) => void;
  playbackSpeed?: number;
  onPlaybackSpeedChange?: (speed: number) => void;
  rotationAngle?: number;
  activeFilter?: string;
  colorAdjustments?: ToolSettings['colorAdjustments'];
  onClearActiveFilter?: () => void;
  trackStates?: Record<string, { hidden?: boolean; locked?: boolean; muted?: boolean; volume?: number }>;
  isSubtitlesActive?: boolean;
  backgroundAudioUrl?: string;
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
  videoPreviewUrl = 'https://www.w3schools.com/html/mov_bbb.mp4',
  sourceTimeOffset,
  isSeekLocked = false,
  onSeekLockChange,
  playbackSpeed = 1.0,
  onPlaybackSpeedChange,
  rotationAngle = 0,
  activeFilter = 'none',
  colorAdjustments,
  onClearActiveFilter,
  trackStates,
  isSubtitlesActive = true,
  backgroundAudioUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
}) => {
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [showCropGuides, setShowCropGuides] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const scrubberTrackRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const stageContainerRef = useRef<HTMLDivElement>(null);

  // Robust ref-backed seek coordinator with generation and target verification
  const isSeekingRef = useRef(false);
  const pendingSeekTargetRef = useRef<number | null>(null);
  const seekSeqRef = useRef(0);
  const activeSeekSeqRef = useRef(0);
  const activeSeekTargetRef = useRef<number | null>(null);
  const seekTimeoutRef = useRef<number | null>(null);

  const executeSeek = (targetSec: number) => {
    const v = videoRef.current;
    if (!v) return;

    const currentSeq = ++seekSeqRef.current;
    activeSeekSeqRef.current = currentSeq;
    activeSeekTargetRef.current = targetSec;
    isSeekingRef.current = true;
    onSeekLockChange?.(true);

    if (seekTimeoutRef.current) {
      window.clearTimeout(seekTimeoutRef.current);
      seekTimeoutRef.current = null;
    }

    try {
      v.currentTime = targetSec;
    } catch {
      activeSeekSeqRef.current = 0;
      activeSeekTargetRef.current = null;
      isSeekingRef.current = false;
      onSeekLockChange?.(false);
      return;
    }

    // Generation-matched safety watchdog: unlocks if decoder fails to emit 'seeked' within 350ms
    seekTimeoutRef.current = window.setTimeout(() => {
      if (seekSeqRef.current === currentSeq) {
        if (pendingSeekTargetRef.current !== null) {
          const nextTarget = pendingSeekTargetRef.current;
          pendingSeekTargetRef.current = null;
          executeSeek(nextTarget);
        } else {
          activeSeekSeqRef.current = 0;
          activeSeekTargetRef.current = null;
          isSeekingRef.current = false;
          onSeekLockChange?.(false);
        }
      }
    }, 350);
  };

  const requestVideoSeek = (targetSec: number) => {
    if (isSeekingRef.current) {
      pendingSeekTargetRef.current = targetSec;
      return;
    }
    executeSeek(targetSec);
  };

  const handleSeeking = () => {
    isSeekingRef.current = true;
    onSeekLockChange?.(true);
  };

  const SEEK_EPSILON = 0.08; // 80ms tight convergence threshold for hardware frame accuracy

  const handleSeeked = () => {
    const v = videoRef.current;
    if (!v) return;

    // If another seek arrived while in-flight, execute it with a fresh sequence generation
    if (pendingSeekTargetRef.current !== null) {
      const nextTarget = pendingSeekTargetRef.current;
      pendingSeekTargetRef.current = null;
      executeSeek(nextTarget);
      return;
    }

    // Verify whether this seeked event belongs to the active in-flight sequence generation
    if (
      activeSeekSeqRef.current === 0 ||
      activeSeekSeqRef.current !== seekSeqRef.current ||
      activeSeekTargetRef.current === null
    ) {
      return;
    }

    // Verify whether the observed currentTime converged to active target within seek tolerance
    const delta = Math.abs(v.currentTime - activeSeekTargetRef.current);
    if (delta > SEEK_EPSILON) {
      // Stale seeked event from an earlier generation or unfinished decoder seek; do not unlock prematurely!
      return;
    }

    if (seekTimeoutRef.current) {
      window.clearTimeout(seekTimeoutRef.current);
      seekTimeoutRef.current = null;
    }
    activeSeekSeqRef.current = 0;
    activeSeekTargetRef.current = null;
    isSeekingRef.current = false;
    onSeekLockChange?.(false);
  };

  // Fullscreen event listener to sync active button state
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, []);

  const handleToggleFullscreen = () => {
    const target = stageContainerRef.current || videoRef.current || document.documentElement;
    if (!document.fullscreenElement) {
      if (target.requestFullscreen) {
        target.requestFullscreen().catch(() => {
          videoRef.current?.requestFullscreen?.().catch(() => {});
        });
      } else if ((target as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen) {
        (target as unknown as { webkitRequestFullscreen: () => void }).webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as unknown as { webkitExitFullscreen?: () => void }).webkitExitFullscreen) {
        (document as unknown as { webkitExitFullscreen: () => void }).webkitExitFullscreen();
      }
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (seekTimeoutRef.current) {
        window.clearTimeout(seekTimeoutRef.current);
      }
    };
  }, []);

  // Active word token for live karaoke subtitle overlay
  const activeToken = tokens.find(t => !t.deleted && currentTime >= t.start && currentTime <= t.end);
  const currentSentenceTokens = tokens.filter(
    t => !t.deleted && Math.abs(t.start - currentTime) < 3.0
  );

  const timecode = formatTimecode(currentTime);

  // Sync HTML5 <video> element play/pause
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isPlaying]);

  // Sync playback speed
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  // Sync volume and mute across video and audio tracks
  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      const isTrackMuted = trackStates?.['track_video']?.muted;
      const trackVol = (trackStates?.['track_video']?.volume ?? 100) / 100;
      const effectiveVol = (isMuted || isTrackMuted) ? 0 : Math.max(0, Math.min(1.0, volume * trackVol));
      v.volume = effectiveVol;
      v.muted = isMuted || !!isTrackMuted;
    }

    const a = audioRef.current;
    if (a) {
      const isTrackMuted = trackStates?.['track_audio']?.muted;
      const trackVol = (trackStates?.['track_audio']?.volume ?? 100) / 100;
      const effectiveVol = (isMuted || isTrackMuted) ? 0 : Math.max(0, Math.min(1.0, volume * trackVol));
      a.volume = effectiveVol;
      a.muted = isMuted || !!isTrackMuted;
    }
  }, [volume, isMuted, trackStates]);

  // Sync background audio playback & seek
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) {
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (Math.abs(a.currentTime - currentTime) > 0.35) {
      try {
        a.currentTime = currentTime % (a.duration || 60);
      } catch {}
    }
  }, [currentTime]);

  // Sync mapped source time to HTML5 video element with seek serialization and boundary clamping
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const vidDuration = v.duration && !isNaN(v.duration) && v.duration > 0 ? v.duration : 10;
    const rawTarget = sourceTimeOffset !== undefined ? sourceTimeOffset : currentTime;
    if (rawTarget > vidDuration + 0.05) {
      console.warn(`[VideoPreviewMonitor] Target ${rawTarget.toFixed(2)}s exceeds video duration ${vidDuration.toFixed(2)}s; clamping cleanly without wrap.`);
    }
    const targetOffset = Math.max(0, Math.min(vidDuration, rawTarget));

    if (Math.abs(v.currentTime - targetOffset) > 0.30) {
      requestVideoSeek(targetOffset);
    }
  }, [currentTime, sourceTimeOffset]);

  // Compute live CSS filters from Color Grading & LUT settings
  const computedCssFilter = useMemo(() => {
    const parts: string[] = [];
    if (colorAdjustments) {
      if (colorAdjustments.brightness !== 0) {
        parts.push(`brightness(${Math.max(0.2, 1 + colorAdjustments.brightness / 100)})`);
      }
      if (colorAdjustments.contrast !== 0) {
        parts.push(`contrast(${Math.max(0.2, 1 + colorAdjustments.contrast / 100)})`);
      }
      if (colorAdjustments.saturation !== 0) {
        parts.push(`saturate(${Math.max(0, 1 + colorAdjustments.saturation / 100)})`);
      }
    }
    if (activeFilter && activeFilter !== 'none') {
      if (activeFilter === 'Retro Film') parts.push('sepia(0.6) contrast(1.15) brightness(0.95)');
      else if (activeFilter === 'Cyberpunk Neon') parts.push('hue-rotate(180deg) saturate(2.5) contrast(1.3)');
      else if (activeFilter === 'Golden Sunset') parts.push('sepia(0.4) saturate(1.8) hue-rotate(-20deg)');
      else if (activeFilter === 'Moody B&W') parts.push('grayscale(1) contrast(1.4)');
      else if (activeFilter === 'VHS Distortion') parts.push('contrast(1.5) hue-rotate(90deg)');
      else if (activeFilter === 'Teal & Orange') parts.push('saturate(2) contrast(1.2) hue-rotate(30deg)');
    }
    return parts.length > 0 ? parts.join(' ') : 'none';
  }, [colorAdjustments, activeFilter]);

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
        ref={stageContainerRef}
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
            aspectRatio: aspectRatio === '16:9' ? '16 / 9' :
                         aspectRatio === '9:16' ? '9 / 16' :
                         aspectRatio === '1:1' ? '1 / 1' :
                         aspectRatio === '4:5' ? '4 / 5' :
                         aspectRatio === '21:9' ? '21 / 9' :
                         aspectRatio === '4:3' ? '4 / 3' : '16 / 9',
            maxWidth: '100%',
            maxHeight: '100%',
            width: ['16:9', '21:9', '4:3'].includes(aspectRatio) ? '100%' : 'auto',
            height: ['9:16', '4:5', '1:1'].includes(aspectRatio) ? '100%' : 'auto',
            backgroundColor: '#000000',
            borderRadius: '6px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Active Live Video Element */}
          <video
            ref={videoRef}
            src={videoPreviewUrl}
            playsInline
            loop
            muted={isMuted}
            onSeeking={handleSeeking}
            onSeeked={handleSeeked}
            style={{
              width: '100%',
              height: '100%',
              objectFit: aspectRatio === '16:9' ? 'contain' : 'cover',
              transform: `rotate(${rotationAngle}deg)`,
              filter: computedCssFilter,
              transition: 'filter 0.2s ease, transform 0.25s ease',
              backgroundColor: '#000000',
            }}
          />

          {/* Synchronized Background Music Audio Element for Track 3 */}
          <audio
            ref={audioRef}
            src={backgroundAudioUrl}
            loop
            preload="auto"
          />

          {/* Subtle Vignette Gradient */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at center, transparent 40%, rgba(0,0,0,0.45) 100%)',
              pointerEvents: 'none',
            }}
          />

          {/* Active Filter Badge */}
          {activeFilter && activeFilter !== 'none' && (
            <div
              style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                backgroundColor: 'rgba(22, 139, 255, 0.9)',
                backdropFilter: 'blur(6px)',
                color: '#FFFFFF',
                fontSize: '11px',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: '9999px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                zIndex: 20,
              }}
            >
              <span>Filter: {activeFilter}</span>
              {onClearActiveFilter && (
                <span
                  onClick={onClearActiveFilter}
                  style={{ cursor: 'pointer', fontWeight: 800, fontSize: '12px' }}
                  title="Remove Filter"
                >
                  ✕
                </span>
              )}
            </div>
          )}

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
                zIndex: 20,
              }}
            >
              SEEK-LOCK MUTEX
            </div>
          )}

          {/* Dynamic Burned-In Subtitles (Webster Victory Tier) */}
          {isSubtitlesActive !== false && (
            <div
              style={{
                position: 'absolute',
                bottom: '24px',
                left: '20px',
                right: '20px',
                textAlign: 'center',
                pointerEvents: 'none',
                zIndex: 15,
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
                    ScarletCut Live Video Monitor
                  </span>
                )}
              </div>
            </div>
          )}
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
            aria-label="First Frame"
            onClick={onFirstFrame ?? (() => onSeek(0))}
            style={transportBtnStyle}
          >
            <IconFirstFrame size={16} />
          </button>
          <button
            type="button"
            title="Previous Frame (◀|)"
            aria-label="Previous Frame"
            onClick={onPrevFrame ?? (() => onSeek(Math.max(0, currentTime - 0.04)))}
            style={transportBtnStyle}
          >
            <IconPrevFrame size={16} />
          </button>
          <button
            type="button"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
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
            aria-label="Next Frame"
            onClick={onNextFrame ?? (() => onSeek(Math.min(duration, currentTime + 0.04)))}
            style={transportBtnStyle}
          >
            <IconNextFrame size={16} />
          </button>
          <button
            type="button"
            title="Last Frame (▶|)"
            aria-label="Last Frame"
            onClick={onLastFrame ?? (() => onSeek(duration))}
            style={transportBtnStyle}
          >
            <IconLastFrame size={16} />
          </button>
        </div>

        {/* Right: Aspect Ratio, Speed Selector (0.25x - 3.0x), Volume, Crop, Fullscreen */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Aspect Ratio Selector Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              title="Select Aspect Ratio (16:9, 9:16, 1:1, 4:5, 21:9, 4:3)"
              aria-label="Select Aspect Ratio"
              onClick={() => {
                setShowAspectMenu(!showAspectMenu);
                setShowSpeedMenu(false);
              }}
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
            {showAspectMenu && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '36px',
                  right: '0',
                  backgroundColor: '#1E232B',
                  border: '1px solid #2B303A',
                  borderRadius: '8px',
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  zIndex: 60,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
                  minWidth: '85px',
                }}
              >
                {(['16:9', '9:16', '1:1', '4:5', '21:9', '4:3'] as AspectRatio[]).map(ratio => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => {
                      onAspectRatioChange(ratio);
                      setShowAspectMenu(false);
                    }}
                    style={{
                      backgroundColor: aspectRatio === ratio ? '#168BFF' : 'transparent',
                      color: aspectRatio === ratio ? '#FFFFFF' : '#A4B0BE',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      fontWeight: aspectRatio === ratio ? 600 : 400,
                    }}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Speed Selector (0.25x - 3.0x) */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              title="Playback Speed (0.25x - 3.0x)"
              aria-label="Select Playback Speed"
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              style={{
                backgroundColor: '#22262E',
                color: playbackSpeed !== 1.0 ? '#168BFF' : '#FFFFFF',
                border: playbackSpeed !== 1.0 ? '1px solid #168BFF' : '1px solid #2B303A',
                borderRadius: '9999px',
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <span>{playbackSpeed}x</span>
              <IconChevronDown size={10} color="#A4B0BE" />
            </button>
            {showSpeedMenu && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '36px',
                  right: '0',
                  backgroundColor: '#1E232B',
                  border: '1px solid #2B303A',
                  borderRadius: '8px',
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  zIndex: 60,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
                  minWidth: '70px',
                }}
              >
                {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0].map(speed => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => {
                      onPlaybackSpeedChange?.(speed);
                      setShowSpeedMenu(false);
                    }}
                    style={{
                      backgroundColor: playbackSpeed === speed ? '#168BFF' : 'transparent',
                      color: playbackSpeed === speed ? '#FFFFFF' : '#A4B0BE',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      fontWeight: playbackSpeed === speed ? 600 : 400,
                    }}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Volume Control with Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              title={isMuted ? 'Unmute Master' : 'Mute Master'}
              onClick={() => setIsMuted(!isMuted)}
              style={transportBtnStyle}
            >
              {isMuted ? <IconVolumeMute size={16} color="#FF4757" /> : <IconVolume size={16} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={e => {
                setVolume(Number(e.target.value));
                if (isMuted) setIsMuted(false);
              }}
              title={`Master Volume: ${Math.round(volume * 100)}%`}
              style={{
                width: '54px',
                height: '4px',
                accentColor: '#168BFF',
                cursor: 'pointer',
              }}
            />
          </div>

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

          {/* Fullscreen Preview */}
          <button
            type="button"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Preview'}
            onClick={handleToggleFullscreen}
            style={{
              ...transportBtnStyle,
              color: isFullscreen ? '#168BFF' : '#A4B0BE',
              backgroundColor: isFullscreen ? 'rgba(22, 139, 255, 0.25)' : '#22262E',
            }}
          >
            <IconFullscreen size={16} color={isFullscreen ? '#168BFF' : '#A4B0BE'} />
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
