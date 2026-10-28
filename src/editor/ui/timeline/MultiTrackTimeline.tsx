import React, { useRef, useState, useEffect } from 'react';
import { TimelineClip, MarkerFlag, PlaybackSegment, WordToken, formatTimecode, getTimelineDragPayload } from '@astral/core';
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
  selectedClipIds?: string[];
  trackStates?: Record<string, TrackControlState>;
  onToggleTrackHidden?: (trackId: string) => void;
  onToggleTrackLocked?: (trackId: string) => void;
  onToggleTrackMuted?: (trackId: string) => void;
  onTrackVolumeChange?: (trackId: string, volume: number) => void;
  onClipVolumeChange?: (clipId: string, volume: number) => void;
  onSeek: (time: number) => void;
  onSelectClip?: (clipId: string) => void;
  onSelectClips?: (clipIds: string[]) => void;
  onDropItem?: (payload: { type: string; name: string; [key: string]: any }, dropTimeSec: number, trackId: string) => void;
  onBatchMoveClips?: (clipIds: string[], deltaSec: number) => void;
  onTrimClip?: (clipId: string, side: 'left' | 'right', deltaSec: number) => void;
  onMoveClip?: (clipId: string, newStartSec: number) => void;
  onClipMoveEnd?: (clipId: string) => void;
  onAddTrack?: () => void;
  onDeleteMarker?: (markerId: string) => void;
  onEditClipTitle?: (clipId: string, newTitle: string) => void;
  onClipTransitionDurationChange?: (clipId: string, durationSec: number) => void;
  onFilesDropped?: (files: File[], dropTimeSec: number, trackId: string) => void;
  tokens?: WordToken[];
  onToggleDeleteToken?: (tokenId: string) => void;
  onEditTokenText?: (tokenId: string, newText: string) => void;
  onSeekToSourceTime?: (sourceTime: number) => void;
  onScaleChange?: (scale: number) => void;
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
  selectedClipIds,
  trackStates,
  onToggleTrackHidden,
  onToggleTrackLocked,
  onToggleTrackMuted,
  onTrackVolumeChange,
  onClipVolumeChange,
  onSeek,
  onSelectClip,
  onSelectClips,
  onDropItem,
  onBatchMoveClips,
  onTrimClip,
  onMoveClip,
  onClipMoveEnd,
  onAddTrack,
  onDeleteMarker,
  onEditClipTitle,
  onClipTransitionDurationChange,
  onFilesDropped,
  tokens = [],
  onToggleDeleteToken,
  onEditTokenText,
  onSeekToSourceTime,
  onScaleChange,
}) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const playheadRef = useRef<HTMLDivElement>(null);

  // Ctrl + Mouse Wheel for Zoom In/Out & Trackpad horizontal scrolling
  const handleTimelineWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (onScaleChange) {
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        const nextScale = Math.max(0.2, Math.min(3.5, Number((scale + delta).toFixed(2))));
        onScaleChange(nextScale);
      }
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // Allow natural horizontal scroll
      if (scrollContainerRef.current && e.shiftKey) {
        scrollContainerRef.current.scrollLeft += e.deltaY;
      }
    }
  };

  // Magnetic Snap Guide state (cyan vertical guideline during drag alignment)
  const [activeSnapTime, setActiveSnapTime] = useState<number | null>(null);

  // Marquee Drag Selection State
  const [isMarqueeActive, setIsMarqueeActive] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<{ x: number; y: number } | null>(null);

  // Drag & Drop Timeline Indicator State (Premiere Pro-style Ghost Preview)
  const [dropIndicator, setDropIndicator] = useState<{
    x: number;
    timeSec: number;
    trackId: string;
    trackName: string;
    itemType?: string;
    itemName?: string;
    trackTop?: number;
    trackHeight?: number;
    color?: string;
  } | null>(null);

  // Real-time Trimming Feedback Tooltip state
  const [trimmingInfo, setTrimmingInfo] = useState<{
    clipId: string;
    side: 'left' | 'right';
    startSec: number;
    durationSec: number;
    currentSec: number;
    trackTop?: number;
  } | null>(null);

  // Hovered Clip ID for interactive left/right trim handles
  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);

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

  const pxPerSec = 11 * scale;
  const totalTimelineWidthPx = Math.max(1400, duration * pxPerSec + 300);

  // Direct DOM transform mutation bypassing React render lifecycle for 60fps buttery smoothness
  useEffect(() => {
    if (playheadRef.current) {
      playheadRef.current.style.transform = `translateX(${currentTime * pxPerSec}px)`;
    }
  }, [currentTime, pxPerSec]);

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
    const origUserSelect = document.body.style.userSelect;
    const origCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';

    const clip = clips.find(c => c.id === clipId);
    const initialStart = clip ? getClipStart(clip) : 0;
    const initialDur = clip ? getClipDuration(clip) : 4;
    const trackTop = trackId === 'track_effects' ? 28
      : trackId === 'track_transitions' ? 60
      : trackId === 'track_stickers' ? 92
      : trackId === 'track_title' ? 124
      : trackId === 'track_captions' ? 156
      : trackId === 'track_video' ? 186
      : 262;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      const totalDeltaSec = Number((deltaPx / pxPerSec).toFixed(2));

      let newStart = initialStart;
      let newDur = initialDur;
      if (side === 'left') {
        const applied = Math.min(initialDur - 0.2, totalDeltaSec);
        newStart = Math.max(0, initialStart + applied);
        newDur = Math.max(0.2, initialDur - applied);
      } else {
        newDur = Math.max(0.2, initialDur + totalDeltaSec);
      }

      setTrimmingInfo({
        clipId,
        side,
        startSec: Number(newStart.toFixed(2)),
        durationSec: Number(newDur.toFixed(2)),
        currentSec: Number((side === 'left' ? newStart : newStart + newDur).toFixed(2)),
        trackTop,
      });

      onTrimClip?.(clipId, side, totalDeltaSec);

      // Real-time video preview scrubbing as edge is dragged
      const seekTarget = side === 'left' ? newStart : Number((newStart + newDur).toFixed(2));
      onSeek(seekTarget);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = origUserSelect;
      document.body.style.cursor = origCursor;
      setTrimmingInfo(null);
      onClipMoveEnd?.(clipId);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Reusable 14px-wide Left & Right interactive trim handles with bracket grip indicators
  const renderTrimHandles = (clip: TimelineClip, trackId: string) => {
    const isTrackLocked = activeTrackStates[trackId]?.locked;
    const isSelected = selectedClipIds ? selectedClipIds.includes(clip.id) : clip.id === selectedClipId;
    const isHovered = hoveredClipId === clip.id;
    if (isTrackLocked || (!isSelected && !isHovered)) return null;

    return (
      <>
        {/* Left Trim Handle (In-Point & Length) */}
        <div
          id={`trim-left-${clip.id}`}
          data-testid={`trim-left-${clip.id}`}
          role="separator"
          aria-label="Trim In-Point (Left handle)"
          tabIndex={0}
          title="◀ Drag left edge to adjust in-point / length"
          onMouseDown={e => handleTrimMouseDown(e, clip.id, 'left', trackId)}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '14px',
            backgroundColor: '#FFD32A',
            cursor: 'ew-resize',
            zIndex: 25,
            borderRadius: '5px 0 0 5px',
            boxShadow: '0 0 10px rgba(255, 211, 42, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
            borderRight: '1px solid rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
            <div style={{ width: '2px', height: '8px', backgroundColor: '#332600', borderRadius: '1px' }} />
            <div style={{ width: '2px', height: '8px', backgroundColor: '#332600', borderRadius: '1px' }} />
          </div>
        </div>

        {/* Right Trim Handle (Out-Point & Length) */}
        <div
          id={`trim-right-${clip.id}`}
          data-testid={`trim-right-${clip.id}`}
          role="separator"
          aria-label="Trim Out-Point (Right handle)"
          tabIndex={0}
          title="Drag right edge to adjust out-point / length ▶"
          onMouseDown={e => handleTrimMouseDown(e, clip.id, 'right', trackId)}
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: '14px',
            backgroundColor: '#FFD32A',
            cursor: 'ew-resize',
            zIndex: 25,
            borderRadius: '0 5px 5px 0',
            boxShadow: '0 0 10px rgba(255, 211, 42, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
            borderLeft: '1px solid rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
            <div style={{ width: '2px', height: '8px', backgroundColor: '#332600', borderRadius: '1px' }} />
            <div style={{ width: '2px', height: '8px', backgroundColor: '#332600', borderRadius: '1px' }} />
          </div>
        </div>
      </>
    );
  };

  // Horizontal clip dragging / timeline shift coordinator (supports batch moving selected clips)
  const handleClipMouseDown = (
    e: React.MouseEvent,
    clipId: string,
    initialStart: number,
    trackId: string
  ) => {
    if (e.button !== 0) return;
    if (activeTrackStates[trackId]?.locked) return;

    e.stopPropagation();
    e.preventDefault();

    // Multi-select toggle with Shift+Click or Ctrl/Cmd+Click
    const isMultiSelectModifier = e.shiftKey || e.ctrlKey || e.metaKey;
    const currentSelected = selectedClipIds ?? (selectedClipId ? [selectedClipId] : []);
    const isAlreadySelected = currentSelected.includes(clipId);

    if (isMultiSelectModifier) {
      const next = isAlreadySelected
        ? currentSelected.filter(id => id !== clipId)
        : [...currentSelected, clipId];
      onSelectClips?.(next);
      if (next.length > 0) {
        onSelectClip?.(next[next.length - 1]!);
      } else {
        onSelectClip?.('');
      }
      return;
    }

    // Single click on a clip:
    // If it's NOT already selected, select it immediately
    // If it IS already selected as part of a multi-selection, keep the group selected for batch dragging
    let activeSelectedIds: string[];
    let shouldIsolateOnMouseUp = false;

    if (!isAlreadySelected) {
      activeSelectedIds = [clipId];
      onSelectClips?.([clipId]);
      onSelectClip?.(clipId);
    } else {
      activeSelectedIds = currentSelected.length > 0 ? currentSelected : [clipId];
      if (activeSelectedIds.length > 1) {
        shouldIsolateOnMouseUp = true;
      }
    }

    const startX = e.clientX;
    let hasDragged = false;
    const origUserSelect = document.body.style.userSelect;
    const origCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      if (!hasDragged && Math.abs(deltaPx) >= 2) {
        hasDragged = true;
      }
      if (hasDragged) {
        const deltaSec = deltaPx / pxPerSec;
        const candidateStart = Math.max(0, Number((initialStart + deltaSec).toFixed(2)));

        // Compute magnetic snap target across playhead and other clips boundaries
        let detectedSnap: number | null = null;
        const clipTarget = clips.find(c => c.id === clipId);
        const clipDur = clipTarget ? getClipDuration(clipTarget) : 4;
        const snapTargets = [0, currentTime];
        clips.filter(c => c.id !== clipId).forEach(c => {
          const s = getClipStart(c);
          const d = getClipDuration(c);
          snapTargets.push(s, s + d);
        });

        for (const pt of snapTargets) {
          if (Math.abs(candidateStart - pt) <= 0.12) {
            detectedSnap = pt;
            break;
          }
          if (Math.abs(candidateStart + clipDur - pt) <= 0.12) {
            detectedSnap = pt;
            break;
          }
        }
        setActiveSnapTime(detectedSnap);

        if (activeSelectedIds.length > 1 && onBatchMoveClips) {
          onBatchMoveClips(activeSelectedIds, deltaSec);
        } else {
          onMoveClip?.(clipId, candidateStart);
        }
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = origUserSelect;
      document.body.style.cursor = origCursor;
      setActiveSnapTime(null);

      if (hasDragged) {
        onClipMoveEnd?.(clipId);
      } else if (shouldIsolateOnMouseUp) {
        // User clicked on an already-selected clip without dragging: isolate selection to this clip
        onSelectClips?.([clipId]);
        onSelectClip?.(clipId);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Discover dynamic tracks early for marquee coordinate calculation
  const customTrackIds = Array.from(
    new Set(
      clips
        .map(c => c.trackId)
        .filter(id => !['track_effects', 'track_transitions', 'track_stickers', 'track_title', 'track_captions', 'track_video', 'track_audio', 'track_custom_stickers'].includes(id))
    )
  ).sort();

  // Marquee Drag-Selection Mouse Coordinator
  const handleTracksMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-testid^="timeline-clip-"]') || (e.target as HTMLElement).closest('button')) {
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left + container.scrollLeft;
    const y = e.clientY - rect.top + container.scrollTop;

    setIsMarqueeActive(true);
    setMarqueeStart({ x, y });
    setMarqueeCurrent({ x, y });
    if (!e.shiftKey) {
      onSelectClips?.([]);
    }
  };

  useEffect(() => {
    if (!isMarqueeActive || !marqueeStart) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + container.scrollLeft;
      const y = e.clientY - rect.top + container.scrollTop;
      setMarqueeCurrent({ x, y });

      const minX = Math.min(marqueeStart.x, x);
      const maxX = Math.max(marqueeStart.x, x);
      const minY = Math.min(marqueeStart.y, y);
      const maxY = Math.max(marqueeStart.y, y);

      const intersectingIds: string[] = [];
      clips.forEach(clip => {
        const startSec = getClipStart(clip);
        const durSec = getClipDuration(clip);
        const clipLeft = startSec * pxPerSec;
        const clipRight = clipLeft + durSec * pxPerSec;

        let trackTop = 186;
        let trackBottom = 262;
        if (clip.trackId === 'track_effects') {
          trackTop = 28;
          trackBottom = 60;
        } else if (clip.trackId === 'track_transitions') {
          trackTop = 60;
          trackBottom = 92;
        } else if (clip.trackId === 'track_stickers' || clip.trackId === 'track_custom_stickers') {
          trackTop = 92;
          trackBottom = 124;
        } else if (clip.trackId === 'track_title') {
          trackTop = 124;
          trackBottom = 156;
        } else if (clip.trackId === 'track_captions') {
          trackTop = 156;
          trackBottom = 186;
        } else if (clip.trackId === 'track_video') {
          trackTop = 186;
          trackBottom = 262;
        } else if (clip.trackId === 'track_audio') {
          trackTop = 262;
          trackBottom = 306;
        } else {
          const customIdx = customTrackIds.indexOf(clip.trackId);
          trackTop = 306 + (customIdx >= 0 ? customIdx : 0) * 40;
          trackBottom = trackTop + 40;
        }

        if (clipLeft < maxX && clipRight > minX && trackTop < maxY && trackBottom > minY) {
          intersectingIds.push(clip.id);
        }
      });

      if (intersectingIds.length > 0) {
        onSelectClips?.(intersectingIds);
        if (intersectingIds[0]) onSelectClip?.(intersectingIds[0]);
      }
    };

    const handleMouseUp = () => {
      setIsMarqueeActive(false);
      setMarqueeStart(null);
      setMarqueeCurrent(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isMarqueeActive, marqueeStart, clips, pxPerSec, customTrackIds, onSelectClips, onSelectClip]);

  // Drag & Drop from Library / Effects onto Timeline (include scrollTop and exact track heights)
  const resolveTrackFromClientY = (clientY: number) => {
    const container = scrollContainerRef.current;
    if (!container) return { trackId: 'track_video', trackName: 'Main Video Track' };
    const rect = container.getBoundingClientRect();
    const y = clientY - rect.top + (container.scrollTop || 0);
    if (y < 60) return { trackId: 'track_effects', trackName: 'Filters & Effects Track' };
    if (y < 92) return { trackId: 'track_transitions', trackName: 'Transitions Track' };
    if (y < 124) return { trackId: 'track_stickers', trackName: 'Stickers & Overlays Track' };
    if (y < 156) return { trackId: 'track_title', trackName: 'Titles Track' };
    if (y < 186) return { trackId: 'track_captions', trackName: 'Captions & Subtitles Track' };
    if (y < 262) return { trackId: 'track_video', trackName: 'Main Video Track' };
    if (y < 306) return { trackId: 'track_audio', trackName: 'Audio Track' };
    const customIdx = Math.floor((y - 306) / 40);
    if (customIdx >= 0 && customIdx < customTrackIds.length) {
      const tid = customTrackIds[customIdx]!;
      return { trackId: tid, trackName: tid.replace('track_custom_', 'Track ') };
    }
    return { trackId: 'track_stickers', trackName: 'Stickers & Overlays Track' };
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const clickTime = calculateTimeFromClientX(e.clientX);
    const dragPayload = getTimelineDragPayload();
    let { trackId, trackName } = resolveTrackFromClientY(e.clientY);

    // If an item is being dragged, lock to its dedicated track so it never drops or hovers on video track
    let trackTop = 186;
    let trackHeight = 76;
    let color = '#35435B';

    if (dragPayload) {
      if (dragPayload.type === 'filters') {
        trackId = 'track_effects';
        trackName = 'Filters & Effects Track';
        trackTop = 28;
        trackHeight = 32;
        color = '#EB3B5A';
      } else if (dragPayload.type === 'transitions') {
        trackId = 'track_transitions';
        trackName = 'Transitions Track';
        trackTop = 60;
        trackHeight = 32;
        color = '#FA8231';
      } else if (dragPayload.type === 'stickers') {
        trackId = 'track_stickers';
        trackName = 'Stickers & Overlays Track';
        trackTop = 92;
        trackHeight = 32;
        color = '#F39C12';
      } else if (dragPayload.type === 'titles') {
        trackId = 'track_title';
        trackName = 'Titles Track';
        trackTop = 124;
        trackHeight = 32;
        color = '#8854D0';
      } else if (dragPayload.type === 'asset' && dragPayload.data?.type === 'audio') {
        trackId = 'track_audio';
        trackName = 'Audio Track';
        trackTop = 262;
        trackHeight = 44;
        color = '#10AC84';
      } else if (dragPayload.type === 'asset' && dragPayload.data?.type === 'video') {
        trackId = 'track_video';
        trackName = 'Main Video Track';
        trackTop = 186;
        trackHeight = 76;
        color = '#35435B';
      }
    } else {
      if (trackId === 'track_effects') { trackTop = 28; trackHeight = 32; color = '#EB3B5A'; }
      else if (trackId === 'track_transitions') { trackTop = 60; trackHeight = 32; color = '#FA8231'; }
      else if (trackId === 'track_stickers') { trackTop = 92; trackHeight = 32; color = '#F39C12'; }
      else if (trackId === 'track_title') { trackTop = 124; trackHeight = 32; color = '#8854D0'; }
      else if (trackId === 'track_captions') { trackTop = 156; trackHeight = 30; color = '#3867D6'; }
      else if (trackId === 'track_video') { trackTop = 186; trackHeight = 76; color = '#35435B'; }
      else if (trackId === 'track_audio') { trackTop = 262; trackHeight = 44; color = '#10AC84'; }
    }

    setDropIndicator({
      x: clickTime * pxPerSec,
      timeSec: clickTime,
      trackId,
      trackName,
      trackTop,
      trackHeight,
      color,
      itemType: dragPayload?.type,
      itemName: dragPayload?.name,
    });
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDropIndicator(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const clickTime = calculateTimeFromClientX(e.clientX);
    const { trackId } = resolveTrackFromClientY(e.clientY);
    setDropIndicator(null);

    // BUG-21 Fix: Check if real media files were dragged directly from the desktop/OS
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      onFilesDropped?.(files, clickTime, trackId);
      return;
    }

    let rawData = e.dataTransfer.getData('application/scarlet-item');
    if (!rawData) {
      rawData = e.dataTransfer.getData('application/scarlet-asset');
    }
    if (!rawData) {
      const text = e.dataTransfer.getData('text/plain');
      if (text) {
        rawData = JSON.stringify({ type: 'titles', name: text });
      }
    }

    if (rawData) {
      try {
        const parsed = JSON.parse(rawData);
        // Automatically enforce proper track routing so items never overlap on video track
        let resolvedTrackId = trackId;
        if (parsed.type === 'filters') resolvedTrackId = 'track_effects';
        else if (parsed.type === 'transitions') resolvedTrackId = 'track_transitions';
        else if (parsed.type === 'stickers') resolvedTrackId = 'track_stickers';
        else if (parsed.type === 'titles') resolvedTrackId = 'track_title';
        else if (parsed.type === 'asset' && parsed.data?.type === 'audio') resolvedTrackId = 'track_audio';
        else if (parsed.type === 'asset' && parsed.data?.type === 'video') resolvedTrackId = 'track_video';

        onDropItem?.(parsed, clickTime, resolvedTrackId);
      } catch (err) {
        console.warn('[Timeline] Failed to parse dropped item', err);
      }
    }
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

  // Dynamic ruler tick intervals to prevent label collision across wide zoom-out ranges
  const tickIntervalSec =
    pxPerSec < 6 ? 30 :
    pxPerSec < 12 ? 15 :
    pxPerSec < 20 ? 10 :
    scale > 1.8 ? 2 : 5;
  const totalTicks = Math.ceil(duration / tickIntervalSec) + 4;

  const rulerTicks = React.useMemo(() => {
    const ticks: Array<{ id: number; leftPx: number; label: string }> = [];
    for (let i = 0; i < totalTicks; i++) {
      const tickSec = i * tickIntervalSec;
      const leftPx = tickSec * pxPerSec;
      const mins = Math.floor(tickSec / 60);
      const secs = tickSec % 60;
      const label = `00:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      ticks.push({ id: i, leftPx, label });
    }
    return ticks;
  }, [totalTicks, tickIntervalSec, pxPerSec]);

  const playheadPositionPx = currentTime * pxPerSec;

  const effectClips = React.useMemo(() => clips.filter(c => {
    return c.trackId === 'track_effects' || (c as any).isFilter || c.title.startsWith('⚡ ');
  }), [clips]);

  const transitionClips = React.useMemo(() => clips.filter(c => {
    return c.trackId === 'track_transitions' || (c as any).isTransition || c.title.startsWith('⧉ ');
  }), [clips]);

  const stickerClips = React.useMemo(() => clips.filter(c => {
    if (c.trackId === 'track_effects' || c.trackId === 'track_transitions' || (c as any).isFilter || (c as any).isTransition || c.title.startsWith('⚡ ') || c.title.startsWith('⧉ ')) return false;
    return c.trackId === 'track_stickers' || c.trackId === 'track_custom_stickers' || c.title.startsWith('★ ');
  }), [clips]);

  const titleClips = React.useMemo(() => clips.filter(c => {
    if (c.trackId === 'track_effects' || c.trackId === 'track_transitions' || (c as any).isFilter || (c as any).isTransition || c.title.startsWith('⚡ ') || c.title.startsWith('⧉ ')) return false;
    return c.trackId === 'track_title' || c.trackId === 'track_custom_title';
  }), [clips]);

  const videoClips = React.useMemo(() => clips.filter(c => c.trackId === 'track_video'), [clips]);
  const audioClips = React.useMemo(() => clips.filter(c => c.trackId === 'track_audio'), [clips]);

  // Group continuous transcript tokens into phrase-level caption blocks for timeline display
  interface CaptionTimelineBlock {
    id: string;
    text: string;
    startSec: number;
    endSec: number;
    tokens: WordToken[];
    deleted: boolean;
    isFiller: boolean;
  }

  const captionBlocks = React.useMemo<CaptionTimelineBlock[]>(() => {
    if (!tokens || tokens.length === 0) return [];
    const validTokens = tokens.filter(t => !t.isPause && t.text.trim().length > 0);
    if (validTokens.length === 0) return [];

    const blocks: CaptionTimelineBlock[] = [];
    let currentBlockTokens: WordToken[] = [];

    for (let i = 0; i < validTokens.length; i++) {
      const tok = validTokens[i]!;
      currentBlockTokens.push(tok);

      const isTerminalPunctuation = /[.!?]$/.test(tok.text.trim());
      const nextTok = validTokens[i + 1];
      const hasGap = nextTok ? (nextTok.start - tok.end > 0.45) : false;
      const isWordLimit = currentBlockTokens.length >= 6;

      if (isTerminalPunctuation || hasGap || isWordLimit || i === validTokens.length - 1) {
        const startSec = currentBlockTokens[0]!.start;
        const endSec = currentBlockTokens[currentBlockTokens.length - 1]!.end;
        const text = currentBlockTokens.map(t => t.text).join(' ');
        const allDeleted = currentBlockTokens.every(t => t.deleted);
        const hasFiller = currentBlockTokens.some(t => t.isFiller);
        blocks.push({
          id: `caption_${currentBlockTokens[0]!.id}`,
          text,
          startSec,
          endSec: Math.max(startSec + 0.3, endSec),
          tokens: [...currentBlockTokens],
          deleted: allDeleted,
          isFiller: hasFiller,
        });
        currentBlockTokens = [];
      }
    }
    return blocks;
  }, [tokens]);

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

        {/* Track 1 Header: Effects & Filters (⚡ FX) */}
        <div
          style={{
            height: '32px',
            borderBottom: '1px solid #2B303A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 6px',
            color: '#EB3B5A',
          }}
          title="Effects & Filters Track"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '11px' }}>⚡</span>
            <span style={{ fontSize: '10px', fontWeight: 600 }}>Effects</span>
          </div>
          <div style={{ display: 'flex', gap: '2px' }}>
            <button
              id="btn-hide-track_effects"
              data-testid="btn-hide-track_effects"
              type="button"
              title={activeTrackStates['track_effects']?.hidden ? 'Show Track' : 'Hide Track'}
              onClick={() => toggleHidden('track_effects')}
              style={trackBtnStyle}
            >
              <IconEye size={11} color={activeTrackStates['track_effects']?.hidden ? '#FF4757' : '#A4B0BE'} />
            </button>
            <button
              id="btn-lock-track_effects"
              data-testid="btn-lock-track_effects"
              type="button"
              title={activeTrackStates['track_effects']?.locked ? 'Unlock Track' : 'Lock Track'}
              onClick={() => toggleLocked('track_effects')}
              style={trackBtnStyle}
            >
              <IconLock size={11} color={activeTrackStates['track_effects']?.locked ? '#FFD32A' : '#636E7B'} />
            </button>
          </div>
        </div>

        {/* Track 2 Header: Transitions (⧉ Transitions) */}
        <div
          style={{
            height: '32px',
            borderBottom: '1px solid #2B303A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 6px',
            color: '#FA8231',
          }}
          title="Transitions Track"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '11px' }}>⧉</span>
            <span style={{ fontSize: '10px', fontWeight: 600 }}>Transitions</span>
          </div>
          <div style={{ display: 'flex', gap: '2px' }}>
            <button
              id="btn-hide-track_transitions"
              data-testid="btn-hide-track_transitions"
              type="button"
              title={activeTrackStates['track_transitions']?.hidden ? 'Show Track' : 'Hide Track'}
              onClick={() => toggleHidden('track_transitions')}
              style={trackBtnStyle}
            >
              <IconEye size={11} color={activeTrackStates['track_transitions']?.hidden ? '#FF4757' : '#A4B0BE'} />
            </button>
            <button
              id="btn-lock-track_transitions"
              data-testid="btn-lock-track_transitions"
              type="button"
              title={activeTrackStates['track_transitions']?.locked ? 'Unlock Track' : 'Lock Track'}
              onClick={() => toggleLocked('track_transitions')}
              style={trackBtnStyle}
            >
              <IconLock size={11} color={activeTrackStates['track_transitions']?.locked ? '#FFD32A' : '#636E7B'} />
            </button>
          </div>
        </div>

        {/* Track 3 Header: Stickers & Overlays (★ Overlay) */}
        <div
          style={{
            height: '32px',
            borderBottom: '1px solid #2B303A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 6px',
            color: '#F39C12',
          }}
          title="Stickers & Overlays Track"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '11px' }}>★</span>
            <span style={{ fontSize: '10px', fontWeight: 600 }}>Stickers</span>
          </div>
          <div style={{ display: 'flex', gap: '2px' }}>
            <button
              id="btn-hide-track_stickers"
              data-testid="btn-hide-track_stickers"
              type="button"
              title={activeTrackStates['track_stickers']?.hidden ? 'Show Track' : 'Hide Track'}
              onClick={() => toggleHidden('track_stickers')}
              style={trackBtnStyle}
            >
              <IconEye size={11} color={activeTrackStates['track_stickers']?.hidden ? '#FF4757' : '#A4B0BE'} />
            </button>
            <button
              id="btn-lock-track_stickers"
              data-testid="btn-lock-track_stickers"
              type="button"
              title={activeTrackStates['track_stickers']?.locked ? 'Unlock Track' : 'Lock Track'}
              onClick={() => toggleLocked('track_stickers')}
              style={trackBtnStyle}
            >
              <IconLock size={11} color={activeTrackStates['track_stickers']?.locked ? '#FFD32A' : '#636E7B'} />
            </button>
          </div>
        </div>

        {/* Track 4 Header: Titles */}
        <div
          style={{
            height: '32px',
            borderBottom: '1px solid #2B303A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 6px',
            color: '#8854D0',
          }}
          title="Titles & Lower Thirds Track"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '11px' }}>🔤</span>
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

        {/* Track 5 Header: Captions & Subtitles */}
        <div
          style={{
            height: '30px',
            borderBottom: '1px solid #2B303A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 6px',
            color: '#3867D6',
          }}
          title="Transcript Subtitles & Captions Track"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '11px' }}>💬</span>
            <span style={{ fontSize: '10px', fontWeight: 600 }}>Captions</span>
            {captionBlocks.length > 0 && (
              <span
                style={{
                  fontSize: '8px',
                  backgroundColor: '#3867D6',
                  color: '#FFFFFF',
                  borderRadius: '8px',
                  padding: '1px 4px',
                  fontWeight: 700,
                  marginLeft: '2px',
                }}
              >
                {captionBlocks.length}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '2px' }}>
            <button
              id="btn-hide-track_captions"
              data-testid="btn-hide-track_captions"
              type="button"
              title={activeTrackStates['track_captions']?.hidden ? 'Show Track' : 'Hide Track'}
              onClick={() => toggleHidden('track_captions')}
              style={trackBtnStyle}
            >
              <IconEye size={11} color={activeTrackStates['track_captions']?.hidden ? '#FF4757' : '#A4B0BE'} />
            </button>
            <button
              id="btn-lock-track_captions"
              data-testid="btn-lock-track_captions"
              type="button"
              title={activeTrackStates['track_captions']?.locked ? 'Unlock Track' : 'Lock Track'}
              onClick={() => toggleLocked('track_captions')}
              style={trackBtnStyle}
            >
              <IconLock size={11} color={activeTrackStates['track_captions']?.locked ? '#FFD32A' : '#636E7B'} />
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
        onMouseDown={handleTracksMouseDown}
        onWheel={handleTimelineWheel}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          position: 'relative',
          backgroundColor: '#111317',
        }}
      >
        <div style={{ width: `${totalTimelineWidthPx}px`, height: '100%', position: 'relative' }}>
          {/* Real-time Magnetic Snap Guideline (Cyan Vertical Line) */}
          {activeSnapTime !== null && (
            <div
              style={{
                position: 'absolute',
                left: `${activeSnapTime * pxPerSec}px`,
                top: 0,
                bottom: 0,
                width: '1px',
                backgroundColor: '#00F0FF',
                zIndex: 45,
                pointerEvents: 'none',
                boxShadow: '0 0 10px #00F0FF, 0 0 4px #FFFFFF',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '2px',
                  left: '4px',
                  backgroundColor: '#00F0FF',
                  color: '#0A0C10',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontSize: '9px',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                🧲 SNAP {activeSnapTime.toFixed(2)}s
              </div>
            </div>
          )}

          {/* Active Magnetic Drop Indicator & Premiere Pro-Style Ghost Preview Block */}
          {dropIndicator && (
            <>
              {/* Full Timeline Vertical Alignment Guide Line */}
              <div
                style={{
                  position: 'absolute',
                  left: `${dropIndicator.x}px`,
                  top: 0,
                  bottom: 0,
                  width: '2px',
                  backgroundColor: dropIndicator.color || '#00F0FF',
                  zIndex: 42,
                  pointerEvents: 'none',
                  boxShadow: `0 0 12px ${dropIndicator.color || '#00F0FF'}, 0 0 4px #FFFFFF`,
                }}
              >
                {/* Floating Track Placement Pill */}
                <div
                  style={{
                    position: 'absolute',
                    top: '2px',
                    left: '6px',
                    backgroundColor: dropIndicator.color || '#00F0FF',
                    color: '#0A0C10',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.6)',
                    letterSpacing: '0.3px',
                  }}
                >
                  + {dropIndicator.itemName ? `"${dropIndicator.itemName}"` : 'Item'} → {dropIndicator.trackName} @ {formatTimecode(dropIndicator.timeSec).main}
                </div>
              </div>

              {/* Premiere Pro-style Ghost Placement Block on Dedicated Track */}
              {(() => {
                const previewDur = dropIndicator.itemType === 'transitions' ? 2.0 : 4.0;
                const previewWidth = Math.max(70, previewDur * pxPerSec);
                const blockTop = (dropIndicator.trackTop !== undefined ? dropIndicator.trackTop : 28) + 2;
                const blockHeight = (dropIndicator.trackHeight !== undefined ? dropIndicator.trackHeight : 32) - 4;
                const blockColor = dropIndicator.color || '#00F0FF';
                const typeIcon = dropIndicator.itemType === 'filters' ? '⚡'
                  : dropIndicator.itemType === 'transitions' ? '⧉'
                  : dropIndicator.itemType === 'stickers' ? '★'
                  : dropIndicator.itemType === 'titles' ? '🔤'
                  : dropIndicator.itemType === 'asset' ? '🎬'
                  : '✨';

                return (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${dropIndicator.x}px`,
                      top: `${blockTop}px`,
                      width: `${previewWidth}px`,
                      height: `${blockHeight}px`,
                      backgroundColor: `${blockColor}33`,
                      border: `2px dashed ${blockColor}`,
                      borderRadius: '6px',
                      zIndex: 41,
                      pointerEvents: 'none',
                      boxShadow: `0 0 16px ${blockColor}66, inset 0 0 12px ${blockColor}33`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 8px',
                      color: '#FFFFFF',
                      fontSize: '11px',
                      fontWeight: 700,
                      backdropFilter: 'blur(3px)',
                      boxSizing: 'border-box',
                    }}
                  >
                    {/* Left Trim Handle Ghost Bracket */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: '8px',
                        backgroundColor: '#FFD32A',
                        borderRadius: '4px 0 0 4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#0A0C10',
                        fontSize: '9px',
                        fontWeight: 900,
                      }}
                    >
                      [
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px', overflow: 'hidden' }}>
                      <span style={{ fontSize: '12px' }}>{typeIcon}</span>
                      <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {dropIndicator.itemName || 'New Block'}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: '9px',
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        color: blockColor,
                        border: `1px solid ${blockColor}66`,
                        marginRight: '6px',
                        flexShrink: 0,
                      }}
                    >
                      {previewDur.toFixed(1)}s
                    </div>

                    {/* Right Trim Handle Ghost Bracket */}
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '8px',
                        backgroundColor: '#FFD32A',
                        borderRadius: '0 4px 4px 0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#0A0C10',
                        fontSize: '9px',
                        fontWeight: 900,
                      }}
                    >
                      ]
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {/* Real-time Trimming Feedback Tooltip - Dynamically Track-Positioned */}
          {trimmingInfo && (
            <div
              style={{
                position: 'absolute',
                left: `${trimmingInfo.currentSec * pxPerSec}px`,
                top: `${Math.max(2, (trimmingInfo.trackTop !== undefined ? trimmingInfo.trackTop - 26 : 32))}px`,
                transform: 'translateX(-50%)',
                backgroundColor: '#1E222B',
                color: '#FFD32A',
                border: '1.5px solid #FFD32A',
                borderRadius: '5px',
                padding: '3px 9px',
                fontSize: '10px',
                fontWeight: 700,
                zIndex: 60,
                pointerEvents: 'none',
                boxShadow: '0 4px 16px rgba(0,0,0,0.9), 0 0 12px rgba(255, 211, 42, 0.6)',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{trimmingInfo.side === 'left' ? '◀ Trim In' : 'Trim Out ▶'}</span>
              <span style={{ color: '#FFFFFF', fontWeight: 800 }}>{trimmingInfo.durationSec.toFixed(2)}s</span>
              <span style={{ color: '#A4B0BE', fontSize: '9px', fontFamily: "'JetBrains Mono', monospace" }}>
                [{trimmingInfo.startSec.toFixed(2)}s — {(trimmingInfo.startSec + trimmingInfo.durationSec).toFixed(2)}s]
              </span>
            </div>
          )}

          {/* Marquee Selection Rectangle */}
          {isMarqueeActive && marqueeStart && marqueeCurrent && (
            <div
              style={{
                position: 'absolute',
                left: `${Math.min(marqueeStart.x, marqueeCurrent.x)}px`,
                top: `${Math.min(marqueeStart.y, marqueeCurrent.y)}px`,
                width: `${Math.abs(marqueeCurrent.x - marqueeStart.x)}px`,
                height: `${Math.abs(marqueeCurrent.y - marqueeStart.y)}px`,
                border: '1px solid #00F0FF',
                backgroundColor: 'rgba(0, 240, 255, 0.15)',
                borderRadius: '4px',
                pointerEvents: 'none',
                zIndex: 50,
                boxShadow: '0 0 12px rgba(0, 240, 255, 0.35)',
              }}
            />
          )}
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
            {rulerTicks.map(tick => (
              <div
                key={tick.id}
                style={{
                  position: 'absolute',
                  left: `${tick.leftPx}px`,
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
                  {tick.label}
                </span>
              </div>
            ))}

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
            ref={playheadRef}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: '2px',
              backgroundColor: '#FF4757',
              zIndex: 35,
              pointerEvents: 'none',
              transform: `translateX(${playheadPositionPx}px)`,
              willChange: 'transform',
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

          {/* Track 1 — Effects & Filters Strip */}
          <div
            style={{
              height: '32px',
              borderBottom: '1px solid #1E232B',
              position: 'relative',
              backgroundColor: '#15171C',
            }}
          >
            {effectClips.map(clip => {
              const isSelected = selectedClipIds ? selectedClipIds.includes(clip.id) : clip.id === selectedClipId;
              const isHovered = hoveredClipId === clip.id;
              const clipStart = getClipStart(clip);
              const clipDur = getClipDuration(clip);
              const isTrackHidden = activeTrackStates['track_effects']?.hidden;
              const isTrackLocked = activeTrackStates['track_effects']?.locked;
              return (
                <div
                  key={clip.id}
                  id={`timeline-clip-${clip.id}`}
                  data-testid={`timeline-clip-${clip.id}`}
                  onClick={e => {
                    e.stopPropagation();
                    onSelectClip?.(clip.id);
                  }}
                  onMouseEnter={() => setHoveredClipId(clip.id)}
                  onMouseLeave={() => setHoveredClipId(null)}
                  onMouseDown={e => handleClipMouseDown(e, clip.id, clipStart, 'track_effects')}
                  title={`[Effect] ${clip.title} (${clipDur.toFixed(1)}s) - Drag to shift, Yellow handles to adjust duration, Delete to remove`}
                  style={{
                    position: 'absolute',
                    left: `${clipStart * pxPerSec}px`,
                    width: `${Math.max(20, clipDur * pxPerSec)}px`,
                    height: '24px',
                    top: '4px',
                    backgroundColor: '#EB3B5A',
                    border: isSelected ? '2px solid #00F0FF' : '1px solid #FF6B81',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 600,
                    boxShadow: isSelected ? '0 0 14px rgba(0, 240, 255, 0.7)' : '0 2px 6px rgba(235, 59, 90, 0.4)',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    cursor: isTrackLocked ? 'not-allowed' : 'grab',
                    opacity: isTrackHidden ? 0.3 : 1,
                    filter: isTrackHidden ? 'grayscale(80%)' : 'none',
                    transition: 'border 0.12s ease, opacity 0.15s ease',
                  }}
                >
                  {renderTrimHandles(clip, 'track_effects')}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: isSelected || isHovered ? '6px' : '0' }}>{clip.title}</span>
                </div>
              );
            })}
          </div>

          {/* Track 2 — Transitions Strip (Separate Block Track) */}
          <div
            style={{
              height: '32px',
              borderBottom: '1px solid #1E232B',
              position: 'relative',
              backgroundColor: '#16191F',
            }}
          >
            {transitionClips.map(clip => {
              const isSelected = selectedClipIds ? selectedClipIds.includes(clip.id) : clip.id === selectedClipId;
              const isHovered = hoveredClipId === clip.id;
              const clipStart = getClipStart(clip);
              const clipDur = getClipDuration(clip);
              const isTrackHidden = activeTrackStates['track_transitions']?.hidden;
              const isTrackLocked = activeTrackStates['track_transitions']?.locked;
              return (
                <div
                  key={clip.id}
                  id={`timeline-clip-${clip.id}`}
                  data-testid={`timeline-clip-${clip.id}`}
                  onClick={e => {
                    e.stopPropagation();
                    onSelectClip?.(clip.id);
                  }}
                  onMouseEnter={() => setHoveredClipId(clip.id)}
                  onMouseLeave={() => setHoveredClipId(null)}
                  onMouseDown={e => handleClipMouseDown(e, clip.id, clipStart, 'track_transitions')}
                  title={`[Transition] ${clip.title} (${clipDur.toFixed(1)}s) - Drag to shift, Yellow handles to adjust duration, Delete to remove`}
                  style={{
                    position: 'absolute',
                    left: `${clipStart * pxPerSec}px`,
                    width: `${Math.max(20, clipDur * pxPerSec)}px`,
                    height: '24px',
                    top: '4px',
                    backgroundColor: '#FA8231',
                    border: isSelected ? '2px solid #00F0FF' : '1px solid #FF9F1A',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 600,
                    boxShadow: isSelected ? '0 0 14px rgba(0, 240, 255, 0.7)' : '0 2px 6px rgba(250, 130, 49, 0.4)',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    cursor: isTrackLocked ? 'not-allowed' : 'grab',
                    opacity: isTrackHidden ? 0.3 : 1,
                    filter: isTrackHidden ? 'grayscale(80%)' : 'none',
                    transition: 'border 0.12s ease, opacity 0.15s ease',
                  }}
                >
                  {renderTrimHandles(clip, 'track_transitions')}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: isSelected || isHovered ? '6px' : '0' }}>{clip.title}</span>
                </div>
              );
            })}
          </div>

          {/* Track 3 — Stickers & Overlays Strip */}
          <div
            style={{
              height: '32px',
              borderBottom: '1px solid #1E232B',
              position: 'relative',
              backgroundColor: '#14171C',
            }}
          >
            {stickerClips.map(clip => {
              const isSelected = selectedClipIds ? selectedClipIds.includes(clip.id) : clip.id === selectedClipId;
              const isHovered = hoveredClipId === clip.id;
              const clipStart = getClipStart(clip);
              const clipDur = getClipDuration(clip);
              const isTrackHidden = activeTrackStates['track_stickers']?.hidden;
              const isTrackLocked = activeTrackStates['track_stickers']?.locked;
              return (
                <div
                  key={clip.id}
                  id={`timeline-clip-${clip.id}`}
                  data-testid={`timeline-clip-${clip.id}`}
                  onClick={e => {
                    e.stopPropagation();
                    onSelectClip?.(clip.id);
                  }}
                  onMouseEnter={() => setHoveredClipId(clip.id)}
                  onMouseLeave={() => setHoveredClipId(null)}
                  onMouseDown={e => handleClipMouseDown(e, clip.id, clipStart, 'track_stickers')}
                  title={`[Sticker/Overlay] ${clip.title} (${clipDur.toFixed(1)}s) - Drag to shift, Yellow handles to adjust duration, Delete to remove`}
                  style={{
                    position: 'absolute',
                    left: `${clipStart * pxPerSec}px`,
                    width: `${Math.max(20, clipDur * pxPerSec)}px`,
                    height: '24px',
                    top: '4px',
                    backgroundColor: clip.color || '#F39C12',
                    border: isSelected ? '2px solid #00F0FF' : '1px solid #FFA502',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 600,
                    boxShadow: isSelected ? '0 0 14px rgba(0, 240, 255, 0.7)' : '0 2px 6px rgba(243, 156, 18, 0.4)',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    cursor: isTrackLocked ? 'not-allowed' : 'grab',
                    opacity: isTrackHidden ? 0.3 : 1,
                    filter: isTrackHidden ? 'grayscale(80%)' : 'none',
                    transition: 'border 0.12s ease, opacity 0.15s ease',
                  }}
                >
                  {renderTrimHandles(clip, 'track_stickers')}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: isSelected || isHovered ? '6px' : '0' }}>{clip.title}</span>
                </div>
              );
            })}
          </div>

          {/* Track 4 — Titles Strip */}
          <div
            style={{
              height: '32px',
              borderBottom: '1px solid #1E232B',
              position: 'relative',
              backgroundColor: '#14171C',
            }}
          >
            {titleClips.map(clip => {
              const isSelected = selectedClipIds ? selectedClipIds.includes(clip.id) : clip.id === selectedClipId;
              const isHovered = hoveredClipId === clip.id;
              const clipStart = getClipStart(clip);
              const clipDur = getClipDuration(clip);
              const isTrackHidden = activeTrackStates['track_title']?.hidden;
              const isTrackLocked = activeTrackStates['track_title']?.locked;
              return (
                <div
                  key={clip.id}
                  id={`timeline-clip-${clip.id}`}
                  data-testid={`timeline-clip-${clip.id}`}
                  onClick={e => {
                    e.stopPropagation();
                    onSelectClip?.(clip.id);
                  }}
                  onMouseEnter={() => setHoveredClipId(clip.id)}
                  onMouseLeave={() => setHoveredClipId(null)}
                  onMouseDown={e => handleClipMouseDown(e, clip.id, clipStart, 'track_title')}
                  onDoubleClick={e => {
                    e.stopPropagation();
                    const newText = prompt('Edit Title text:', clip.title);
                    if (newText !== null && newText.trim()) {
                      onEditClipTitle?.(clip.id, newText.trim());
                    }
                  }}
                  title={`[Title] ${clip.title} (${clipDur.toFixed(1)}s) - Drag to shift, Yellow handles to trim/extend, Double-click to rename`}
                  style={{
                    position: 'absolute',
                    left: `${clipStart * pxPerSec}px`,
                    width: `${Math.max(20, clipDur * pxPerSec)}px`,
                    height: '24px',
                    top: '4px',
                    backgroundColor: '#8854D0',
                    border: isSelected ? '2px solid #00F0FF' : '1px solid #9B63E6',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 500,
                    boxShadow: isSelected ? '0 0 14px rgba(0, 240, 255, 0.7)' : '0 2px 6px rgba(136, 84, 208, 0.3)',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    cursor: isTrackLocked ? 'not-allowed' : 'grab',
                    opacity: isTrackHidden ? 0.3 : 1,
                    filter: isTrackHidden ? 'grayscale(80%)' : 'none',
                    transition: 'border 0.12s ease, opacity 0.15s ease',
                  }}
                >
                  {renderTrimHandles(clip, 'track_title')}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: isSelected || isHovered ? '6px' : '0' }}>
                    {clip.title}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Track 5 — Captions Strip (Dedicated 30px Lane) */}
          <div
            style={{
              height: '30px',
              borderBottom: '1px solid #1E232B',
              position: 'relative',
              backgroundColor: '#121418',
            }}
          >
            {captionBlocks.map(block => {
              const isActive = currentTime >= block.startSec && currentTime <= block.endSec;
              const blockLeft = block.startSec * pxPerSec;
              const blockWidth = Math.max(18, (block.endSec - block.startSec) * pxPerSec);
              const isTrackHidden = activeTrackStates['track_captions']?.hidden;
              const isTrackLocked = activeTrackStates['track_captions']?.locked;

              return (
                <div
                  key={block.id}
                  id={`timeline-caption-${block.id}`}
                  data-testid={`timeline-caption-${block.id}`}
                  onClick={e => {
                    e.stopPropagation();
                    onSeekToSourceTime?.(block.startSec);
                  }}
                  onContextMenu={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onToggleDeleteToken) {
                      block.tokens.forEach(tok => onToggleDeleteToken(tok.id));
                    }
                  }}
                  onDoubleClick={e => {
                    e.stopPropagation();
                    const newText = prompt('Edit Caption Subtitle:', block.text);
                    if (newText !== null && newText.trim() && block.tokens[0]) {
                      onEditTokenText?.(block.tokens[0].id, newText.trim());
                    }
                  }}
                  title={`[Subtitle Block] "${block.text}" (${block.startSec.toFixed(1)}s - ${block.endSec.toFixed(1)}s)\nClick to seek • Right-click to cut/restore • Double-click to edit text`}
                  style={{
                    position: 'absolute',
                    left: `${blockLeft}px`,
                    width: `${blockWidth}px`,
                    height: '22px',
                    top: '4px',
                    backgroundColor: block.deleted
                      ? 'rgba(235, 59, 90, 0.25)'
                      : block.isFiller
                      ? 'rgba(255, 168, 1, 0.25)'
                      : isActive
                      ? 'rgba(56, 103, 214, 0.95)'
                      : 'rgba(35, 65, 140, 0.65)',
                    border: isActive
                      ? '2px solid #00F0FF'
                      : block.deleted
                      ? '1px dashed #FF4757'
                      : block.isFiller
                      ? '1px dashed #FFA502'
                      : '1px solid rgba(56, 103, 214, 0.6)',
                    borderRadius: '5px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 6px',
                    color: block.deleted ? '#FF6B81' : '#FFFFFF',
                    fontSize: '10px',
                    fontWeight: 600,
                    boxShadow: isActive ? '0 0 12px rgba(0, 240, 255, 0.8)' : 'none',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    textDecoration: block.deleted ? 'line-through' : 'none',
                    cursor: isTrackLocked ? 'not-allowed' : 'pointer',
                    opacity: isTrackHidden ? 0.25 : 1,
                    filter: isTrackHidden ? 'grayscale(80%)' : 'none',
                    transition: 'all 0.12s ease',
                    zIndex: isActive ? 12 : 5,
                  }}
                >
                  <span style={{ fontSize: '9px', marginRight: '4px', opacity: 0.8 }}>💬</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{block.text}</span>
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
              const isSelected = selectedClipIds ? selectedClipIds.includes(clip.id) : (clip.id === selectedClipId || clip.isSelected);
              const isHovered = hoveredClipId === clip.id;
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
                  onMouseEnter={() => setHoveredClipId(clip.id)}
                  onMouseLeave={() => setHoveredClipId(null)}
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
                    border: isSelected ? '2px solid #00F0FF' : '1px solid #3B4F6B',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    cursor: isTrackLocked ? 'not-allowed' : 'grab',
                    opacity: isTrackHidden ? 0.3 : 1,
                    filter: isTrackHidden ? 'grayscale(80%)' : 'none',
                    boxShadow: isSelected ? '0 0 16px rgba(0, 240, 255, 0.75)' : 'none',
                    transition: 'border-color 0.12s ease, box-shadow 0.12s ease, opacity 0.15s ease',
                  }}
                >
                  {renderTrimHandles(clip, 'track_video')}

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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        {clip.filter && clip.filter !== 'none' && (
                          <span
                            style={{
                              fontSize: '9px',
                              backgroundColor: '#FF9F43',
                              color: '#000000',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              fontWeight: 700,
                            }}
                            title={`Filter: ${clip.filter}`}
                          >
                            🎨 {clip.filter}
                          </span>
                        )}
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
                          }}
                          title="Click to set clip volume %"
                        >
                          {clip.volume !== undefined ? `${clip.volume}%` : '100%'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Lavender-Blue Waveform Strip Below (Page 1) with Visual Ripple Cut Notches */}
                  <div
                    style={{
                      height: '24px',
                      backgroundColor: 'rgba(75, 101, 132, 0.6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-around',
                      padding: '0 4px',
                      position: 'relative',
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

                    {/* Visual Cut Notches from Deleted Transcript Tokens & Pauses */}
                    {tokens
                      .filter(t => t.deleted && (!clip.mediaId || t.mediaId === clip.mediaId))
                      .map(delTok => {
                        const inPoint = clip.sourceIn ?? 0;
                        if (delTok.end < inPoint || delTok.start > inPoint + clipDur) return null;
                        const cutLeft = Math.max(0, (delTok.start - inPoint) * pxPerSec);
                        const cutWidth = Math.max(8, (delTok.end - delTok.start) * pxPerSec);

                        return (
                          <div
                            key={`cut_${delTok.id}`}
                            title={`[Cut Interval] ${delTok.text} (${(delTok.end - delTok.start).toFixed(2)}s cut)`}
                            style={{
                              position: 'absolute',
                              left: `${cutLeft}px`,
                              width: `${cutWidth}px`,
                              top: 0,
                              bottom: 0,
                              backgroundColor: 'rgba(235, 59, 90, 0.45)',
                              borderLeft: '1.5px dashed #FF4757',
                              borderRight: '1.5px dashed #FF4757',
                              pointerEvents: 'none',
                              zIndex: 4,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <span style={{ fontSize: '8px', color: '#FFD2D2', fontWeight: 700 }}>✕</span>
                          </div>
                        );
                      })}
                  </div>
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
              const isSelected = selectedClipIds ? selectedClipIds.includes(clip.id) : clip.id === selectedClipId;
              const isHovered = hoveredClipId === clip.id;
              const clipStart = getClipStart(clip);
              const clipDur = getClipDuration(clip);
              const isTrackMuted = activeTrackStates['track_audio']?.muted;
              const isTrackLocked = activeTrackStates['track_audio']?.locked;
              return (
                <div
                  key={clip.id}
                  id={`timeline-clip-${clip.id}`}
                  data-testid={`timeline-clip-${clip.id}`}
                  onClick={e => {
                    e.stopPropagation();
                    onSelectClip?.(clip.id);
                  }}
                  onMouseEnter={() => setHoveredClipId(clip.id)}
                  onMouseLeave={() => setHoveredClipId(null)}
                  onMouseDown={e => handleClipMouseDown(e, clip.id, clipStart, 'track_audio')}
                  onDoubleClick={e => {
                    e.stopPropagation();
                    onSeek(clipStart);
                  }}
                  title={`[Audio] ${clip.title} (${clipDur.toFixed(1)}s) - Drag to shift, Yellow handles to trim`}
                  style={{
                    position: 'absolute',
                    left: `${clipStart * pxPerSec}px`,
                    width: `${Math.max(20, clipDur * pxPerSec)}px`,
                    height: '32px',
                    top: '6px',
                    backgroundColor: '#10AC84',
                    border: isSelected ? '2px solid #00F0FF' : 'none',
                    borderRadius: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '3px 8px',
                    color: '#FFFFFF',
                    boxShadow: isSelected ? '0 0 14px rgba(0, 240, 255, 0.7)' : '0 2px 8px rgba(16, 172, 132, 0.3)',
                    overflow: 'hidden',
                    cursor: isTrackLocked ? 'not-allowed' : 'grab',
                    opacity: isTrackMuted ? 0.35 : 1,
                    filter: isTrackMuted ? 'grayscale(70%)' : 'none',
                    transition: 'all 0.12s ease',
                  }}
                >
                  {renderTrimHandles(clip, 'track_audio')}
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
                  const isSelected = selectedClipIds ? selectedClipIds.includes(clip.id) : clip.id === selectedClipId;
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
                        backgroundColor: (clip.title.startsWith('⚡ ') || (clip as any).isFilter)
                          ? '#EB3B5A'
                          : (clip.title.startsWith('⧉ ') || (clip as any).isTransition)
                          ? '#FA8231'
                          : clip.color || '#FFA502',
                        backgroundImage: (clip.title.startsWith('⚡ ') || (clip as any).isFilter)
                          ? 'linear-gradient(90deg, #EB3B5A, #FA8231)'
                          : (clip.title.startsWith('⧉ ') || (clip as any).isTransition)
                          ? 'linear-gradient(90deg, #FA8231, #FF9F1A)'
                          : undefined,
                        border: isSelected ? '2px solid #00F0FF' : 'none',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 8px',
                        color: '#FFFFFF',
                        boxShadow: isSelected ? '0 0 14px rgba(0, 240, 255, 0.7)' : 'none',
                        overflow: 'hidden',
                        cursor: isTrackLocked ? 'not-allowed' : 'grab',
                        opacity: isTrackHidden ? 0.3 : 1,
                        filter: isTrackHidden ? 'grayscale(80%)' : 'none',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      {renderTrimHandles(clip, trackId)}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: isSelected ? '4px' : '0' }}>
                        {clip.title}
                      </span>
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
