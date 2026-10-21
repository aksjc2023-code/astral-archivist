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
  onBackward10?: () => void;
  onForward10?: () => void;
  videoPreviewUrl?: string;
  sourceTimeOffset?: number;
  isSeekLocked?: boolean;
  onSeekLockChange?: (isLocked: boolean) => void;
  playbackSpeed?: number;
  onPlaybackSpeedChange?: (speed: number) => void;
  rotationAngle?: number;
  activeFilter?: string;
  colorAdjustments?: ToolSettings['colorAdjustments'];
  toolSettings?: ToolSettings;
  activeTitle?: string;
  activeSticker?: string;
  activeTransition?: string;
  onEditActiveTitle?: () => void;
  onClearActiveFilter?: () => void;
  trackStates?: Record<string, { hidden?: boolean; locked?: boolean; muted?: boolean; volume?: number }>;
  isSubtitlesActive?: boolean;
  backgroundAudioUrl?: string;
  /** Master timeline gain from Tools → Equalizer (0–200%) */
  masterVolume?: number;
  /** Controlled crop guides (toolbar #btn-crop-zoom can toggle) */
  showCropGuides?: boolean;
  onShowCropGuidesChange?: (show: boolean) => void;
  onClearActiveSticker?: () => void;
  onClearActiveTransition?: () => void;
  onClearActiveTitle?: () => void;
  onLoadDemoProject?: () => void;
  onImportMedia?: () => void;
  onBrowseFilesSelected?: (files: File[]) => void;
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
  onBackward10,
  onForward10,
  videoPreviewUrl,
  sourceTimeOffset,
  isSeekLocked = false,
  onSeekLockChange,
  playbackSpeed = 1.0,
  onPlaybackSpeedChange,
  rotationAngle = 0,
  activeFilter = 'none',
  colorAdjustments,
  toolSettings,
  activeTitle,
  activeSticker,
  activeTransition,
  onEditActiveTitle,
  onClearActiveFilter,
  trackStates,
  isSubtitlesActive = true,
  backgroundAudioUrl,
  masterVolume = 100,
  showCropGuides: showCropGuidesProp,
  onShowCropGuidesChange,
  onClearActiveSticker,
  onClearActiveTransition,
  onClearActiveTitle,
  onLoadDemoProject,
  onImportMedia,
  onBrowseFilesSelected,
}) => {
  const [transitionAnimKey, setTransitionAnimKey] = useState(0);
  const browseFileInputRef = useRef<HTMLInputElement>(null);

  const handleBrowseFilesClick = () => {
    browseFileInputRef.current?.click();
    onImportMedia?.();
  };

  const handleBrowseFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onBrowseFilesSelected?.(Array.from(e.target.files));
    }
  };

  // Interactive Movable & Resizable Sticker State
  const [stickerPos, setStickerPos] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [stickerScale, setStickerScale] = useState(1.0);
  const [isHoveredSticker, setIsHoveredSticker] = useState(false);

  useEffect(() => {
    if (activeSticker) {
      if (activeSticker.toLowerCase().includes('arrow')) setStickerPos({ x: 30, y: 35 });
      else if (activeSticker.toLowerCase().includes('like')) setStickerPos({ x: 75, y: 70 });
      else if (activeSticker.toLowerCase().includes('heart')) setStickerPos({ x: 70, y: 30 });
      else if (activeSticker.toLowerCase().includes('fire')) setStickerPos({ x: 30, y: 70 });
      else setStickerPos({ x: 50, y: 50 });
      setStickerScale(1.0);
    }
  }, [activeSticker]);

  const handleStickerPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const stage = stageContainerRef.current;
    if (!stage) return;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialX = stickerPos.x;
    const initialY = stickerPos.y;

    const handlePointerMove = (moveEvt: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const deltaXPercent = ((moveEvt.clientX - startClientX) / rect.width) * 100;
      const deltaYPercent = ((moveEvt.clientY - startClientY) / rect.height) * 100;
      const nextX = Math.max(8, Math.min(92, Number((initialX + deltaXPercent).toFixed(1))));
      const nextY = Math.max(8, Math.min(92, Number((initialY + deltaYPercent).toFixed(1))));
      setStickerPos({ x: nextX, y: nextY });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleStickerResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const startClientX = e.clientX;
    const initialScale = stickerScale;

    const handlePointerMove = (moveEvt: PointerEvent) => {
      const deltaX = moveEvt.clientX - startClientX;
      const nextScale = Math.max(0.4, Math.min(2.5, Number((initialScale + deltaX * 0.01).toFixed(2))));
      setStickerScale(nextScale);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  useEffect(() => {
    if (activeTransition) {
      setTransitionAnimKey(k => k + 1);
    }
  }, [activeTransition]);

  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [showCropGuidesLocal, setShowCropGuidesLocal] = useState(false);
  const showCropGuides = showCropGuidesProp ?? showCropGuidesLocal;
  const setShowCropGuides = (next: boolean) => {
    if (onShowCropGuidesChange) onShowCropGuidesChange(next);
    else setShowCropGuidesLocal(next);
  };
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

  const isVideoTrackHidden = !!trackStates?.['track_video']?.hidden;
  const isTitleTrackHidden = !!trackStates?.['track_title']?.hidden;

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

  // Sync volume and mute across video and audio tracks (monitor slider × master EQ × track gain)
  useEffect(() => {
    const masterGain = Math.max(0, Math.min(2, masterVolume / 100));
    const eqBands = toolSettings?.equalizer?.bands ?? [];
    // EQ bands are −10…+10 dB-ish; map average to a gentle gain multiplier
    const bandAvgDb = eqBands.length > 0
      ? eqBands.reduce((s, b) => s + b, 0) / eqBands.length
      : 0;
    const bandGain = Math.max(0.4, Math.min(1.6, 1 + bandAvgDb / 20));
    const vocalGate = toolSettings?.equalizer?.vocalPurifierEnabled ? 0.92 : 1;
    const eqGain = Math.max(0.05, Math.min(1.5, bandGain * vocalGate));

    const v = videoRef.current;
    if (v) {
      const isTrackMuted = trackStates?.['track_video']?.muted;
      const trackVol = (trackStates?.['track_video']?.volume ?? 100) / 100;
      const effectiveVol = (isMuted || isTrackMuted)
        ? 0
        : Math.max(0, Math.min(1.0, volume * trackVol * masterGain * eqGain));
      v.volume = effectiveVol;
      v.muted = isMuted || !!isTrackMuted;
    }

    const a = audioRef.current;
    if (a) {
      const isTrackMuted = trackStates?.['track_audio']?.muted;
      const trackVol = (trackStates?.['track_audio']?.volume ?? 100) / 100;
      const effectiveVol = (isMuted || isTrackMuted)
        ? 0
        : Math.max(0, Math.min(1.0, volume * trackVol * masterGain * eqGain));
      a.volume = effectiveVol;
      a.muted = isMuted || !!isTrackMuted;
    }
  }, [volume, isMuted, trackStates, masterVolume, toolSettings?.equalizer]);

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

  // Compute live CSS filters from Color Grading, LUT, chroma, and highlight/shadow tools
  const computedCssFilter = useMemo(() => {
    const parts: string[] = [];
    if (colorAdjustments) {
      const gamma = colorAdjustments.gamma ?? 0;
      // Gamma slider is centered at 0 (neutral); positive brightens midtones
      const gammaMul = Math.max(0.5, Math.min(1.8, 1 + gamma / 100));
      const brightnessBase = 1 + (colorAdjustments.brightness ?? 0) / 100;
      const shadowLift = (colorAdjustments.shadows ?? 0) / 200;
      const highlightPull = -(colorAdjustments.highlights ?? 0) / 250;
      const combinedBright = Math.max(0.15, (brightnessBase + shadowLift + highlightPull) * gammaMul);
      if (combinedBright !== 1) {
        parts.push(`brightness(${combinedBright})`);
      }
      if (colorAdjustments.contrast !== 0) {
        parts.push(`contrast(${Math.max(0.2, 1 + colorAdjustments.contrast / 100)})`);
      }
      if (colorAdjustments.saturation !== 0) {
        parts.push(`saturate(${Math.max(0, 1 + colorAdjustments.saturation / 100)})`);
      }
      if (colorAdjustments.whitebalance) {
        parts.push('sepia(0.18) hue-rotate(-12deg) saturate(1.1)');
      }
    }
    if (activeFilter && activeFilter !== 'none') {
      if (activeFilter === 'Retro Film') parts.push('sepia(0.6) contrast(1.15) brightness(0.95)');
      else if (activeFilter === 'Cyberpunk Neon') parts.push('hue-rotate(180deg) saturate(2.5) contrast(1.3)');
      else if (activeFilter === 'Golden Sunset') parts.push('sepia(0.4) saturate(1.8) hue-rotate(-20deg)');
      else if (activeFilter === 'Moody B&W') parts.push('grayscale(1) contrast(1.4)');
      else if (activeFilter === 'VHS Distortion') parts.push('contrast(1.5) hue-rotate(90deg)');
      else if (activeFilter === 'Teal & Orange') parts.push('saturate(2) contrast(1.2) hue-rotate(30deg)');
      else if (activeFilter === 'Soft Bloom') parts.push('brightness(1.1) contrast(0.9) saturate(1.2)');
      else if (activeFilter === 'Featured Punch') parts.push('contrast(1.35) saturate(1.4)');
      else if (activeFilter === 'RGB Split') parts.push('contrast(1.4) hue-rotate(45deg) saturate(1.8)');
      else if (activeFilter === 'Noir Fade') parts.push('grayscale(0.85) contrast(1.2) brightness(0.9)');
      else if (activeFilter === 'Polaroid Warm') parts.push('sepia(0.45) saturate(1.3) contrast(1.05)');
      else if (activeFilter === 'Motion Blur Soft') parts.push('blur(0.6px) brightness(1.05)');
      else parts.push('contrast(1.15) saturate(1.2)');
    }
    // Chroma key approximation: boost key channel + slight blur on edges when enabled
    const chroma = toolSettings?.chromaKey;
    if (chroma?.enabled) {
      const tol = (chroma.tolerance ?? 40) / 100;
      const noise = (chroma.noise ?? 20) / 200;
      const edges = (chroma.edges ?? 30) / 100;
      if (chroma.color === 'green') {
        parts.push(`saturate(${1 + tol * 0.8}) hue-rotate(${-tol * 20}deg) contrast(${1 + tol * 0.3})`);
      } else {
        parts.push(`saturate(${1 + tol * 0.8}) hue-rotate(${tol * 40}deg) contrast(${1 + tol * 0.3})`);
      }
      if (edges > 0.1) parts.push(`blur(${edges * 1.2}px)`);
      if (noise > 0.05) parts.push(`contrast(${1 + noise})`);
    }
    return parts.length > 0 ? parts.join(' ') : 'none';
  }, [colorAdjustments, activeFilter, toolSettings?.chromaKey]);

  // Compute live motion preset transform from Animation tool tab
  const computedMotionTransform = useMemo(() => {
    const preset = toolSettings?.animation?.selectedPreset;
    if (!preset || preset === 'none' || toolSettings?.animation?.enabled === false) return '';
    if (preset === 'Zoom in') return 'scale(1.18)';
    if (preset === 'Move left') return 'translateX(-32px)';
    if (preset === 'Spin 1') return 'rotate(360deg)';
    if (preset === 'Zoom out') return 'scale(0.82)';
    if (preset === 'Drop') return 'translateY(32px)';
    if (preset === 'Bounce') return 'scale(1.08) translateY(-10px)';
    return '';
  }, [toolSettings?.animation?.selectedPreset, toolSettings?.animation?.enabled]);

  const handleBackward10 = onBackward10 ?? (() => onSeek(Math.max(0, currentTime - 10)));
  const handleForward10 = onForward10 ?? (() => onSeek(Math.min(duration, currentTime + 10)));

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
          {/* Active Live Video Element or Empty State Stage */}
          {!videoPreviewUrl ? (
            <div
              id="empty-monitor-stage"
              data-testid="empty-monitor-stage"
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'radial-gradient(circle at 50% 40%, rgba(22, 139, 255, 0.12) 0%, rgba(13, 15, 19, 0.98) 100%)',
                color: '#A4B0BE',
                padding: '32px 24px',
                textAlign: 'center',
                position: 'relative',
                userSelect: 'none',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '16px',
                  background: 'rgba(22, 139, 255, 0.14)',
                  border: '1px solid rgba(22, 139, 255, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '14px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}
              >
                <span style={{ fontSize: '30px' }}>🎬</span>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF', marginBottom: '6px' }}>
                No Media on Timeline
              </div>
              <div style={{ fontSize: '11px', color: '#747D8C', maxWidth: '320px', lineHeight: 1.5, marginBottom: '20px' }}>
                Drag & drop filters, transitions, titles or stickers into the timeline below, import files, or load the sample demo.
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  ref={browseFileInputRef}
                  id="file-input-preview-browse"
                  data-testid="file-input-preview-browse"
                  type="file"
                  multiple
                  accept="video/*,audio/*,image/*"
                  style={{ display: 'none' }}
                  onChange={handleBrowseFilesChange}
                />
                <button
                  type="button"
                  id="btn-empty-import"
                  data-testid="btn-empty-import"
                  onClick={handleBrowseFilesClick}
                  style={{
                    backgroundColor: '#168BFF',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 18px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(22, 139, 255, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>📁 Browse Files</span>
                </button>
                {onLoadDemoProject && (
                  <button
                    type="button"
                    id="btn-load-demo-project"
                    data-testid="btn-load-demo-project"
                    onClick={onLoadDemoProject}
                    style={{
                      backgroundColor: '#22262E',
                      color: '#00F0FF',
                      border: '1px solid rgba(0, 240, 255, 0.45)',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>⚡ Load Demo Project</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <video
              ref={videoRef}
              id="preview-video-element"
              data-testid="preview-video-element"
              src={videoPreviewUrl}
              playsInline
              muted={isMuted}
              onSeeking={handleSeeking}
              onSeeked={handleSeeked}
              style={{
                width: (toolSettings?.overlay?.mode === 'pip' && toolSettings.overlay.enabled !== false) ? '42%' : (toolSettings?.overlay?.mode === 'side-left' || toolSettings?.overlay?.mode === 'side-right') ? '50%' : '100%',
                height: (toolSettings?.overlay?.mode === 'pip' && toolSettings.overlay.enabled !== false) ? '42%' : toolSettings?.overlay?.mode === 'top-bottom' ? '50%' : '100%',
                position: (toolSettings?.overlay?.mode === 'pip' && toolSettings.overlay.enabled !== false) ? 'absolute' : 'relative',
                bottom: (toolSettings?.overlay?.mode === 'pip' && toolSettings.overlay.enabled !== false) ? '16px' : 'auto',
                right: (toolSettings?.overlay?.mode === 'pip' && toolSettings.overlay.enabled !== false) ? '16px' : 'auto',
                zIndex: (toolSettings?.overlay?.mode === 'pip' && toolSettings.overlay.enabled !== false) ? 12 : 1,
                borderRadius: (toolSettings?.overlay?.mode === 'pip' && toolSettings.overlay.enabled !== false) ? '8px' : '0',
                border: (toolSettings?.overlay?.mode === 'pip' && toolSettings.overlay.enabled !== false) ? '2px solid #168BFF' : 'none',
                boxShadow: (toolSettings?.overlay?.mode === 'pip' && toolSettings.overlay.enabled !== false) ? '0 8px 24px rgba(0,0,0,0.85)' : 'none',
                objectFit: aspectRatio === '16:9' ? 'contain' : 'cover',
                transform: `rotate(${rotationAngle}deg) ${computedMotionTransform}`,
                filter: computedCssFilter,
                transition: 'filter 0.2s ease, transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease',
                backgroundColor: '#000000',
                opacity: isVideoTrackHidden ? 0 : ((toolSettings?.chromaKey?.opacity ?? 100) / 100),
                visibility: isVideoTrackHidden ? 'hidden' : 'visible',
              }}
            />
          )}

          {/* Picture-in-Picture Studio Backdrop */}
          {toolSettings?.overlay?.mode === 'pip' && toolSettings.overlay.enabled !== false && !isVideoTrackHidden && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: '#0C0E12',
                backgroundImage: 'radial-gradient(circle at center, #1E2638 0%, #0A0C10 100%)',
                zIndex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4B5563',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              <span>Main Canvas Stage (PiP Active)</span>
            </div>
          )}

          {/* Watermark Logo Corner Overlay */}
          {toolSettings?.overlay?.mode === 'logo' && (
            <div
              style={{
                position: 'absolute',
                top: '14px',
                right: '16px',
                backgroundColor: 'rgba(22, 139, 255, 0.85)',
                backdropFilter: 'blur(4px)',
                color: '#FFFFFF',
                padding: '3px 9px',
                borderRadius: '5px',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.6px',
                zIndex: 18,
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              }}
            >
              SCARLETCUT HD
            </div>
          )}

          {/* Triplet Split Grid Lines */}
          {toolSettings?.overlay?.mode === 'triplet' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                border: '1px solid rgba(22, 139, 255, 0.4)',
                pointerEvents: 'none',
                zIndex: 18,
              }}
            >
              <div style={{ borderRight: '1px dashed rgba(22, 139, 255, 0.6)' }} />
              <div style={{ borderRight: '1px dashed rgba(22, 139, 255, 0.6)' }} />
              <div />
            </div>
          )}

          {/* Highlight Spotlight Box */}
          {toolSettings?.highlightConceal?.mode === 'highlight' && toolSettings.highlightConceal.enabled !== false && (
            <div
              id="overlay-highlight-box"
              style={{
                position: 'absolute',
                width: '240px',
                height: '140px',
                borderRadius: `${Math.max(6, (toolSettings.highlightConceal.feathering ?? 35) / 3)}px`,
                boxShadow: `0 0 0 9999px rgba(0, 0, 0, ${Math.min(0.85, ((toolSettings.highlightConceal.opacity ?? 100) / 100) * 0.75)})`,
                border: toolSettings.highlightConceal.outline ? '2px solid #FFD32A' : 'none',
                pointerEvents: 'none',
                zIndex: 14,
                transition: 'all 0.2s ease',
              }}
            />
          )}

          {/* Conceal Frosted Blur Box */}
          {toolSettings?.highlightConceal?.mode === 'conceal' && toolSettings.highlightConceal.enabled !== false && (
            <div
              id="overlay-conceal-box"
              style={{
                position: 'absolute',
                width: '240px',
                height: '140px',
                borderRadius: `${Math.max(6, (toolSettings.highlightConceal.feathering ?? 35) / 3)}px`,
                backdropFilter: 'blur(16px)',
                backgroundColor: `rgba(20, 24, 30, ${Math.min(0.85, ((toolSettings.highlightConceal.opacity ?? 100) / 100) * 0.6)})`,
                border: toolSettings.highlightConceal.outline ? '1.5px dashed #FF4757' : 'none',
                pointerEvents: 'none',
                zIndex: 14,
                transition: 'all 0.2s ease',
              }}
            />
          )}

          {/* Embedded Dynamic Animation Keyframes */}
          <style>{`
            @keyframes scarletGlitchFx {
              0% { opacity: 0; transform: scale(1); filter: hue-rotate(0deg); }
              15% { opacity: 0.95; transform: scale(1.05) translate(-6px, 4px); filter: hue-rotate(90deg); }
              30% { opacity: 0.75; transform: scale(0.98) translate(5px, -3px); filter: hue-rotate(180deg); }
              50% { opacity: 0.9; transform: scale(1.03) translate(-3px, 2px); filter: hue-rotate(270deg); }
              75% { opacity: 0.4; transform: scale(1.01); }
              100% { opacity: 0; transform: scale(1); }
            }
            @keyframes scarletDissolveFx {
              0% { opacity: 0.9; }
              50% { opacity: 0.55; }
              100% { opacity: 0; }
            }
            @keyframes scarletWhipPanFx {
              0% { transform: translateX(-100%); opacity: 0.9; }
              50% { transform: translateX(0%); opacity: 0.7; }
              100% { transform: translateX(100%); opacity: 0; }
            }
            @keyframes scarletZoomFx {
              0% { transform: scale(1.8) rotate(15deg); opacity: 0.95; }
              100% { transform: scale(1) rotate(0deg); opacity: 0; }
            }
            @keyframes scarletIrisFx {
              0% { clip-path: circle(0% at 50% 50%); opacity: 1; }
              50% { clip-path: circle(40% at 50% 50%); opacity: 0.7; }
              100% { clip-path: circle(100% at 50% 50%); opacity: 0; }
            }
            @keyframes scarletFlashCutFx {
              0% { opacity: 1; }
              100% { opacity: 0; }
            }
            @keyframes scarletSplitSlideFx {
              0% { transform: scaleX(1); opacity: 0.9; }
              100% { transform: scaleX(0); opacity: 0; }
            }
            @keyframes scarletArrowBounce {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(12px); }
            }
            @keyframes scarletLikePulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.12); }
            }
            @keyframes scarletHeartBeat {
              0%, 100% { transform: scale(1); }
              30% { transform: scale(1.25); }
              60% { transform: scale(1.1); }
            }
            @keyframes scarletFireFlicker {
              0% { transform: scale(1) rotate(-2deg); }
              100% { transform: scale(1.08) rotate(3deg); }
            }
            @keyframes scarletSparkleSpin {
              0% { transform: rotate(0deg) scale(0.9); }
              50% { transform: rotate(180deg) scale(1.15); }
              100% { transform: rotate(360deg) scale(0.9); }
            }
            @keyframes scarletBellRing {
              0%, 100% { transform: rotate(0deg); }
              20% { transform: rotate(-18deg); }
              40% { transform: rotate(18deg); }
              60% { transform: rotate(-10deg); }
              80% { transform: rotate(10deg); }
            }
            @keyframes scarletBadgePop {
              0% { transform: scale(0.5); opacity: 0; }
              100% { transform: scale(1); opacity: 1; }
            }
            @keyframes scarletCursorBlink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0; }
            }
          `}</style>

          {/* Active Transition Visual Simulation Layer */}
          {activeTransition && (
            <div
              key={`trans_${transitionAnimKey}`}
              id="overlay-transition-fx"
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 20,
                ...(activeTransition.toLowerCase().includes('glitch')
                  ? {
                      animation: 'scarletGlitchFx 1.2s ease-out forwards',
                      mixBlendMode: 'screen' as const,
                      backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,71,87,0.3) 0px, rgba(22,139,255,0.3) 2px, transparent 3px, transparent 6px)',
                    }
                  : activeTransition.toLowerCase().includes('cross') || activeTransition.toLowerCase().includes('dissolve')
                  ? {
                      animation: 'scarletDissolveFx 1.4s ease-in-out forwards',
                      backgroundColor: 'rgba(255, 255, 255, 0.45)',
                      backdropFilter: 'blur(10px)',
                    }
                  : activeTransition.toLowerCase().includes('whip') || activeTransition.toLowerCase().includes('pan')
                  ? {
                      animation: 'scarletWhipPanFx 0.8s cubic-bezier(0.2, 0.9, 0.1, 1) forwards',
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%)',
                      backdropFilter: 'blur(14px)',
                    }
                  : activeTransition.toLowerCase().includes('zoom')
                  ? {
                      animation: 'scarletZoomFx 1.1s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                      background: 'radial-gradient(circle, transparent 20%, rgba(0,0,0,0.85) 100%)',
                    }
                  : activeTransition.toLowerCase().includes('iris')
                  ? {
                      animation: 'scarletIrisFx 1.2s ease-in-out forwards',
                      backgroundColor: '#000000',
                    }
                  : activeTransition.toLowerCase().includes('flash')
                  ? {
                      animation: 'scarletFlashCutFx 0.6s ease-out forwards',
                      backgroundColor: '#FFFFFF',
                    }
                  : activeTransition.toLowerCase().includes('slide') || activeTransition.toLowerCase().includes('split')
                  ? {
                      animation: 'scarletSplitSlideFx 1.0s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                      background: 'linear-gradient(90deg, #111317 0%, transparent 50%, #111317 100%)',
                    }
                  : {
                      animation: 'scarletDissolveFx 1.2s ease-in-out forwards',
                      backgroundColor: 'rgba(255, 255, 255, 0.35)',
                    }),
              }}
            />
          )}

          {/* Active Transition Indicator Badge with Live Replay Trigger */}
          {activeTransition && (
            <div
              id="overlay-active-transition"
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                zIndex: 27,
                backgroundColor: 'rgba(20, 24, 33, 0.92)',
                border: '1px solid #2ED573',
                borderRadius: '8px',
                padding: '4px 10px',
                color: '#2ED573',
                fontSize: '11px',
                fontWeight: 700,
                boxShadow: '0 4px 16px rgba(46, 213, 115, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>][ {activeTransition}</span>
              <button
                type="button"
                id="btn-replay-transition"
                data-testid="btn-replay-transition"
                title="Preview transition animation again"
                onClick={e => {
                  e.stopPropagation();
                  setTransitionAnimKey(k => k + 1);
                }}
                style={{
                  backgroundColor: '#2ED573',
                  border: 'none',
                  color: '#000000',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                ▶ Replay
              </button>
              {onClearActiveTransition && (
                <button
                  type="button"
                  title="Remove transition"
                  onClick={e => {
                    e.stopPropagation();
                    onClearActiveTransition();
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#8A96A6',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: 0,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Active Filter Indicator Badge with 1-Click Clear */}
          {activeFilter && activeFilter !== 'none' && (
            <div
              id="overlay-active-filter"
              data-testid="overlay-active-filter"
              style={{
                position: 'absolute',
                top: activeTransition ? '52px' : '16px',
                right: '16px',
                zIndex: 27,
                backgroundColor: 'rgba(20, 24, 33, 0.92)',
                border: '1px solid #FF9F43',
                borderRadius: '8px',
                padding: '4px 10px',
                color: '#FF9F43',
                fontSize: '11px',
                fontWeight: 700,
                boxShadow: '0 4px 16px rgba(255, 159, 67, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>🎨 {activeFilter}</span>
              {onClearActiveFilter && (
                <button
                  type="button"
                  id="btn-clear-active-filter"
                  data-testid="btn-clear-active-filter"
                  title="Remove filter"
                  onClick={e => {
                    e.stopPropagation();
                    onClearActiveFilter();
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#8A96A6',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: 0,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Active Title & Caption Overlay on Monitor Stage */}
          {activeTitle && !isTitleTrackHidden && (
            <div
              id="overlay-active-title"
              onClick={onEditActiveTitle}
              style={{
                position: 'absolute',
                zIndex: 25,
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                ...(activeTitle.toLowerCase().includes('typewriter')
                  ? {
                      bottom: '50px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      backgroundColor: 'rgba(10, 15, 25, 0.92)',
                      border: '2px solid #168BFF',
                      borderRadius: '8px',
                      padding: '10px 24px',
                      color: '#00F0FF',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '15px',
                      fontWeight: 700,
                      letterSpacing: '1px',
                      boxShadow: '0 0 25px rgba(22, 139, 255, 0.65)',
                    }
                  : activeTitle.toLowerCase().includes('cinematic') || activeTitle.toLowerCase().includes('epic')
                  ? {
                      bottom: '60px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      backgroundColor: 'rgba(0, 0, 0, 0.82)',
                      borderTop: '2px solid #FFD700',
                      borderBottom: '2px solid #FFD700',
                      padding: '12px 36px',
                      color: '#FFD700',
                      fontFamily: "'Times New Roman', Times, serif",
                      fontSize: '18px',
                      fontWeight: 700,
                      letterSpacing: '5px',
                      textTransform: 'uppercase' as const,
                      boxShadow: '0 0 35px rgba(255, 215, 0, 0.45)',
                      textShadow: '0 2px 10px rgba(0,0,0,0.9), 0 0 20px rgba(255, 215, 0, 0.8)',
                    }
                  : activeTitle.toLowerCase().includes('news') || activeTitle.toLowerCase().includes('lower')
                  ? {
                      bottom: '36px',
                      left: '30px',
                      display: 'flex',
                      alignItems: 'stretch',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.85)',
                    }
                  : activeTitle.toLowerCase().includes('social') || activeTitle.toLowerCase().includes('subscribe')
                  ? {
                      bottom: '50px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      backgroundColor: '#FF0000',
                      borderRadius: '9999px',
                      padding: '8px 22px',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      fontSize: '14px',
                      boxShadow: '0 6px 20px rgba(255, 0, 0, 0.55)',
                    }
                  : activeTitle.toLowerCase().includes('karaoke')
                  ? {
                      bottom: '48px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'linear-gradient(135deg, rgba(46, 213, 115, 0.95), rgba(0, 206, 201, 0.95))',
                      borderRadius: '12px',
                      padding: '10px 28px',
                      color: '#FFFFFF',
                      fontSize: '16px',
                      fontWeight: 800,
                      boxShadow: '0 0 30px rgba(46, 213, 115, 0.7)',
                    }
                  : activeTitle.toLowerCase().includes('chapter') || activeTitle.toLowerCase().includes('vlog')
                  ? {
                      top: '24px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      backgroundColor: 'rgba(20, 24, 33, 0.9)',
                      border: '1px solid #00D2D3',
                      borderRadius: '6px',
                      padding: '6px 18px',
                      color: '#00D2D3',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '12px',
                      fontWeight: 700,
                      letterSpacing: '1.5px',
                    }
                  : {
                      bottom: '48px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      backgroundColor: 'rgba(22, 27, 36, 0.88)',
                      backdropFilter: 'blur(16px)',
                      border: '1px solid #8854D0',
                      borderRadius: '8px',
                      padding: '8px 24px',
                      color: '#FFFFFF',
                      fontSize: '14px',
                      fontWeight: 600,
                      letterSpacing: '0.5px',
                      boxShadow: '0 8px 24px rgba(136, 84, 208, 0.45)',
                    }),
              }}
              title="Click to edit Title text"
            >
              {activeTitle.toLowerCase().includes('news') || activeTitle.toLowerCase().includes('lower') ? (
                <>
                  <div style={{ backgroundColor: '#E74C3C', color: '#FFFFFF', padding: '10px 14px', fontWeight: 900, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '1px' }}>
                    <span style={{ width: '8px', height: '8px', backgroundColor: '#FFFFFF', borderRadius: '50%', display: 'inline-block' }} />
                    LIVE
                  </div>
                  <div style={{ backgroundColor: 'rgba(10, 25, 47, 0.95)', color: '#FFFFFF', padding: '10px 20px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center' }}>
                    {activeTitle}
                  </div>
                </>
              ) : activeTitle.toLowerCase().includes('social') || activeTitle.toLowerCase().includes('subscribe') ? (
                <>
                  <span style={{ fontSize: '16px' }}>▶</span>
                  <span>{activeTitle.toUpperCase()}</span>
                  <span style={{ fontSize: '16px' }}>🔔</span>
                </>
              ) : activeTitle.toLowerCase().includes('typewriter') ? (
                <>
                  <span>{activeTitle}</span>
                  <span style={{ animation: 'scarletCursorBlink 0.8s infinite', marginLeft: '3px', color: '#00F0FF' }}>_</span>
                </>
              ) : (
                activeTitle
              )}

              {onClearActiveTitle && (
                <button
                  type="button"
                  title="Remove title"
                  onClick={e => {
                    e.stopPropagation();
                    onClearActiveTitle();
                  }}
                  style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    backgroundColor: '#FF4757',
                    border: 'none',
                    color: '#FFFFFF',
                    borderRadius: '50%',
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                    fontSize: '10px',
                    lineHeight: '18px',
                    textAlign: 'center',
                    padding: 0,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Active Interactive Movable Sticker Graphic Overlay */}
          {activeSticker && (
            <div
              id="overlay-active-sticker"
              data-testid="overlay-active-sticker"
              onPointerDown={handleStickerPointerDown}
              onMouseEnter={() => setIsHoveredSticker(true)}
              onMouseLeave={() => setIsHoveredSticker(false)}
              style={{
                position: 'absolute',
                top: `${stickerPos.y}%`,
                left: `${stickerPos.x}%`,
                transform: `translate(-50%, -50%) scale(${stickerScale})`,
                zIndex: 26,
                pointerEvents: 'auto',
                cursor: 'grab',
                userSelect: 'none',
                touchAction: 'none',
                padding: '8px',
                border: isHoveredSticker ? '1.5px dashed #00F0FF' : '1.5px solid transparent',
                borderRadius: '12px',
                boxShadow: isHoveredSticker ? '0 0 16px rgba(0, 240, 255, 0.45)' : 'none',
                transition: 'border 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              {activeSticker.toLowerCase().includes('arrow') ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <svg width="68" height="68" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L12 18M12 18L5 11M12 18L19 11" stroke="#FF4757" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ backgroundColor: '#FF4757', color: '#FFF', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>LOOK HERE</span>
                </div>
              ) : activeSticker.toLowerCase().includes('like') ? (
                <div style={{ backgroundColor: '#168BFF', borderRadius: '16px', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 10px 30px rgba(22, 139, 255, 0.7)', border: '2px solid #FFFFFF' }}>
                  <span style={{ fontSize: '32px' }}>👍</span>
                  <div>
                    <div style={{ color: '#FFF', fontWeight: 900, fontSize: '13px', letterSpacing: '0.5px' }}>LIKE & SHARE</div>
                    <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '10px' }}>TAP TO ENGAGE</div>
                  </div>
                </div>
              ) : activeSticker.toLowerCase().includes('heart') ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', filter: 'drop-shadow(0 0 20px #FF4757)' }}>
                  <span style={{ fontSize: '56px' }}>❤️</span>
                </div>
              ) : activeSticker.toLowerCase().includes('fire') ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', filter: 'drop-shadow(0 0 25px #FFA502)' }}>
                  <span style={{ fontSize: '58px' }}>🔥</span>
                  <span style={{ backgroundColor: '#FFA502', color: '#000', fontSize: '11px', fontWeight: 900, padding: '2px 8px', borderRadius: '4px' }}>TRENDING</span>
                </div>
              ) : activeSticker.toLowerCase().includes('sparkle') ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', filter: 'drop-shadow(0 0 20px #FFD32A)' }}>
                  <span style={{ fontSize: '42px' }}>✨</span>
                  <span style={{ fontSize: '28px' }}>🌟</span>
                  <span style={{ fontSize: '36px' }}>✨</span>
                </div>
              ) : activeSticker.toLowerCase().includes('bell') ? (
                <div style={{ backgroundColor: '#FFA502', borderRadius: '50%', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 25px rgba(255, 165, 2, 0.7)', border: '2px solid #FFF' }}>
                  <span style={{ fontSize: '32px' }}>🔔</span>
                </div>
              ) : activeSticker.toLowerCase().includes('checkmark') ? (
                <div style={{ backgroundColor: '#2ED573', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 25px rgba(46, 213, 115, 0.7)', border: '2px solid #FFF' }}>
                  <span style={{ fontSize: '30px', color: '#FFF', fontWeight: 900 }}>✓</span>
                </div>
              ) : (
                <div style={{ backgroundColor: 'rgba(255, 71, 87, 0.95)', borderRadius: '12px', padding: '10px 16px', color: '#FFF', fontWeight: 800, fontSize: '14px', boxShadow: '0 8px 24px rgba(255, 71, 87, 0.6)' }}>
                  ★ {activeSticker}
                </div>
              )}

              {/* Drag Handle & Position Indicator */}
              {isHoveredSticker && (
                <div
                  style={{
                    position: 'absolute',
                    top: '-20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: 'rgba(0, 240, 255, 0.9)',
                    color: '#0A0C10',
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '3px',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                  }}
                >
                  Drag to move ({stickerPos.x}%, {stickerPos.y}%)
                </div>
              )}

              {/* Corner Resize Handle */}
              <div
                onPointerDown={handleStickerResizeDown}
                title="Drag to resize sticker"
                style={{
                  position: 'absolute',
                  bottom: '-5px',
                  right: '-5px',
                  width: '12px',
                  height: '12px',
                  backgroundColor: '#00F0FF',
                  border: '1.5px solid #000',
                  borderRadius: '3px',
                  cursor: 'nwse-resize',
                  zIndex: 30,
                  display: isHoveredSticker ? 'block' : 'none',
                }}
              />

              {onClearActiveSticker && (
                <button
                  type="button"
                  title="Remove sticker"
                  onClick={e => {
                    e.stopPropagation();
                    onClearActiveSticker();
                  }}
                  style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    backgroundColor: '#FF4757',
                    border: 'none',
                    color: '#FFFFFF',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    lineHeight: '20px',
                    textAlign: 'center',
                    padding: 0,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                    zIndex: 30,
                    display: isHoveredSticker ? 'block' : 'none',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Video Track Hidden Visual Placeholder */}
          {isVideoTrackHidden && (
            <div
              style={{
                position: 'absolute',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                color: '#8A94A6',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
              <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.4px' }}>Video Track Hidden</span>
              <span style={{ fontSize: '11px', color: '#57606F' }}>Click eye icon on Track 2 to unhide</span>
            </div>
          )}

          {/* Synchronized Background Music Audio Element for Track 3 (Only when real URL is present) */}
          {backgroundAudioUrl && (
            <audio
              ref={audioRef}
              src={backgroundAudioUrl}
              preload="auto"
            />
          )}

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
          {isSubtitlesActive !== false && !isTitleTrackHidden && (
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

        {/* Center: 7 Transport Buttons including -10s and +10s Skips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <button
            id="btn-first-frame"
            data-testid="btn-first-frame"
            type="button"
            title="First Frame (|◀)"
            aria-label="First Frame"
            onClick={onFirstFrame ?? (() => onSeek(0))}
            style={transportBtnStyle}
          >
            <IconFirstFrame size={15} />
          </button>
          <button
            id="btn-backward-10s"
            data-testid="btn-backward-10s"
            type="button"
            title="Backward 10 Seconds (-10s)"
            aria-label="Backward 10 Seconds"
            onClick={handleBackward10}
            style={{
              ...transportBtnStyle,
              width: '32px',
              fontSize: '10px',
              fontWeight: 700,
              color: '#FFFFFF',
            }}
          >
            -10s
          </button>
          <button
            id="btn-prev-frame"
            data-testid="btn-prev-frame"
            type="button"
            title="Previous Frame (◀|)"
            aria-label="Previous Frame"
            onClick={onPrevFrame ?? (() => onSeek(Math.max(0, currentTime - 0.04)))}
            style={transportBtnStyle}
          >
            <IconPrevFrame size={15} />
          </button>
          <button
            id="btn-play-pause"
            data-testid="btn-play-pause"
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
            id="btn-next-frame"
            data-testid="btn-next-frame"
            type="button"
            title="Next Frame (|▶)"
            aria-label="Next Frame"
            onClick={onNextFrame ?? (() => onSeek(Math.min(duration, currentTime + 0.04)))}
            style={transportBtnStyle}
          >
            <IconNextFrame size={15} />
          </button>
          <button
            id="btn-forward-10s"
            data-testid="btn-forward-10s"
            type="button"
            title="Forward 10 Seconds (+10s)"
            aria-label="Forward 10 Seconds"
            onClick={handleForward10}
            style={{
              ...transportBtnStyle,
              width: '32px',
              fontSize: '10px',
              fontWeight: 700,
              color: '#FFFFFF',
            }}
          >
            +10s
          </button>
          <button
            id="btn-last-frame"
            data-testid="btn-last-frame"
            type="button"
            title="Last Frame (▶|)"
            aria-label="Last Frame"
            onClick={onLastFrame ?? (() => onSeek(duration))}
            style={transportBtnStyle}
          >
            <IconLastFrame size={15} />
          </button>
        </div>

        {/* Right: Aspect Ratio, Speed Selector (0.25x - 3.0x), Volume, Crop, Fullscreen */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Aspect Ratio Selector Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              id="btn-aspect-ratio-menu"
              data-testid="btn-aspect-ratio-menu"
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
                    id={`opt-aspect-${ratio.replace(':', '-')}`}
                    data-testid={`opt-aspect-${ratio.replace(':', '-')}`}
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
              id="btn-speed-menu"
              data-testid="btn-speed-menu"
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
                    id={`opt-speed-${String(speed).replace('.', '_')}`}
                    data-testid={`opt-speed-${String(speed).replace('.', '_')}`}
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
