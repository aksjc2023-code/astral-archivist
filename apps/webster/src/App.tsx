import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  WordToken,
  PlaybackSegment,
  MediaAsset,
  TimelineClip,
  MarkerFlag,
  ToolSettings,
  ToolDrawerTab,
  TelemetryState,
  ActivityDockTab,
  SubNavSection,
  FailureMode,
  INITIAL_MEDIA_ASSETS,
  INITIAL_WORD_TOKENS,
  INITIAL_TOKENS_BY_MEDIA,
  generateDefaultTokensForAsset,
  INITIAL_TIMELINE_CLIPS,
  INITIAL_MARKERS,
  INITIAL_TOOL_SETTINGS,
  buildPlaybackSegments,
  getNextValidTime,
  getProjectDuration,
  getClipAtTimelineTime,
  timelineToSourceTime,
  sourceToTimelineTime,
  purgeFillersAndPauses,
  restoreAllTokens,
  validateWordToken,
  validateTimelineClip,
  asTimelineSeconds,
  asSourceSeconds,
  asSeconds,
  AspectRatio,
} from '@astral/core';

import {
  ActivityDock,
  SubNavSidebar,
  StatusFooter,
  MediaGridView,
  ImportDropzoneView,
  TranscriptEditorView,
  ToolsDrawerView,
  EffectsGridView,
  VideoPreviewMonitor,
  MiddleActionToolbar,
  MultiTrackTimeline,
  ExportModal,
  ExportReadyDialog,
  FaultSimulatorBar,
  IconSparkles,
} from '@astral/ui-editor';

import { transcribeMediaFile } from './services/whisperService';
import { exportVideoWithFfmpegWasm } from './export/wasmExporter';
import { ExportSettings } from '@astral/core';

export const App: React.FC = () => {
  // Navigation & Workspace State
  const [activeDockTab, setActiveDockTab] = useState<ActivityDockTab>('media');
  const [activeSubNav, setActiveSubNav] = useState<SubNavSection>('my-files');

  // WebGPU Whisper Live Transcription State
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState('');
  const [transcribePercent, setTranscribePercent] = useState(0);
  const [transcribeFileName, setTranscribeFileName] = useState('');

  // Retain actual File/Blob handles for uploaded assets (to feed Whisper and FFmpeg WASM)
  const fileBlobMapRef = useRef<Map<string, Blob>>(new Map());

  // Media Bin & Transcript State
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(INITIAL_MEDIA_ASSETS);
  const [tokensByMedia, setTokensByMedia] = useState<Record<string, WordToken[]>>(INITIAL_TOKENS_BY_MEDIA);
  const [activeTranscriptMediaId, setActiveTranscriptMediaId] = useState<string>('asset_1');
  const [clips, setClips] = useState<TimelineClip[]>(INITIAL_TIMELINE_CLIPS);
  const [markers, setMarkers] = useState<MarkerFlag[]>(INITIAL_MARKERS);

  // Playback & Scrubber State
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [timelineScale, setTimelineScale] = useState(1.0);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [selectedClipId, setSelectedClipId] = useState<string | undefined>('clip_video_1');
  const [trackStates, setTrackStates] = useState<Record<string, { hidden?: boolean; locked?: boolean; muted?: boolean; volume?: number }>>({
    track_title: { hidden: false, locked: false, muted: false, volume: 100 },
    track_video: { hidden: false, locked: false, muted: false, volume: 100 },
    track_audio: { hidden: false, locked: false, muted: false, volume: 100 },
  });

  // Tool Drawer & Visual Filter State
  const [toolSettings, setToolSettings] = useState<ToolSettings>(INITIAL_TOOL_SETTINGS);
  const [activeToolTab, setActiveToolTab] = useState<ToolDrawerTab>('chroma');
  const [activeFilter, setActiveFilter] = useState<string>('none');
  const [rotationAngle, setRotationAngle] = useState(0);
  const [isSubtitlesActive, setIsSubtitlesActive] = useState(true);
  const [masterVolume, setMasterVolume] = useState(100);

  // Undo / Redo History Stacks
  const [historyStack, setHistoryStack] = useState<{ tokensByMedia: Record<string, WordToken[]>; clips: TimelineClip[] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ tokensByMedia: Record<string, WordToken[]>; clips: TimelineClip[] }[]>([]);

  // Modals & Overlays
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExportReadyOpen, setIsExportReadyOpen] = useState(false);
  const [isFaultSimulatorOpen, setIsFaultSimulatorOpen] = useState(false);
  const [isSeekLocked, setIsSeekLocked] = useState(false);

  // Ref to retain and cleanup seek-lock timeout
  const seekLockTimeoutRef = useRef<number | null>(null);

  // Retain starting clips during drag to support pristine undo/redo
  const dragStartClipsRef = useRef<TimelineClip[] | null>(null);

  // Retain all allocated blob URLs to cleanly revoke when no longer referenced anywhere
  const blobUrlsRef = useRef<Set<string>>(new Set());

  // Safe revocation helper: only revoke blob URL when no asset and no remaining clip references it
  const safelyRevokeBlobUrl = useCallback((
    urlToRevoke: string,
    remainingClips: TimelineClip[],
    currentAssets: MediaAsset[]
  ) => {
    if (!urlToRevoke || !urlToRevoke.startsWith('blob:')) return;
    const isUsedInClips = remainingClips.some(c => c.videoUrl === urlToRevoke);
    const isUsedInAssets = currentAssets.some(a => a.videoUrl === urlToRevoke || a.thumbnailUrl === urlToRevoke);
    if (!isUsedInClips && !isUsedInAssets) {
      try {
        URL.revokeObjectURL(urlToRevoke);
        blobUrlsRef.current.delete(urlToRevoke);
      } catch {}
    }
  }, []);

  // Cleanup all allocated blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      });
      blobUrlsRef.current.clear();
    };
  }, []);

  // Live Telemetry System State (ADR-001 & Architecture Plan)
  const [telemetry, setTelemetry] = useState<TelemetryState>({
    searchLatencyMs: 0.045,
    rippleRebuildMs: 0.32,
    memfsHeapMb: 68,
    memfsMaxMb: 750,
    timeSavedSec: 4.85,
    activeFailureMode: 'none',
    recoveryLog: 'System healthy. Zero SSR runtime active.',
  });

  // Active video clip dynamically linked to whichever clip is currently under timeline playhead
  const activeClip = useMemo(() => {
    return getClipAtTimelineTime(asTimelineSeconds(currentTime), clips, 'track_video') ?? clips.find(c => c.trackId === 'track_video');
  }, [clips, currentTime]);

  const activeMediaId = activeClip?.mediaId ?? 'asset_1';

  // Automatically keep active transcript in sync with active video clip under playhead
  useEffect(() => {
    if (activeClip?.mediaId) {
      setActiveTranscriptMediaId(activeClip.mediaId);
    }
  }, [activeClip?.mediaId]);

  // Active word tokens for the currently focused transcript asset
  const tokens = useMemo(() => {
    return tokensByMedia[activeTranscriptMediaId] ?? [];
  }, [tokensByMedia, activeTranscriptMediaId]);

  // Calculate real-time PlaybackSegments scoped strictly to active clip's media asset
  const rebuildResult = useMemo(() => {
    const activeClipTokens = tokensByMedia[activeMediaId] ?? [];
    return buildPlaybackSegments(activeClipTokens, activeMediaId);
  }, [tokensByMedia, activeMediaId]);

  // Asset-scoped playback segments map to prevent cross-asset cut leakage
  const segmentsByMediaId = useMemo(() => {
    const map = new Map<string, PlaybackSegment[]>();
    const mediaIds = new Set(clips.map(c => c.mediaId).filter(Boolean) as string[]);
    mediaIds.add('asset_1');
    mediaIds.forEach(id => {
      const assetTokens = tokensByMedia[id] ?? [];
      map.set(id, buildPlaybackSegments(assetTokens, id).segments);
    });
    return map;
  }, [tokensByMedia, clips]);

  // Composition project duration derived cleanly from maximum clip boundary
  const projectDuration = useMemo(() => {
    return getProjectDuration(clips, 30.0);
  }, [clips]);

  // Exact mapped source offset within the active video clip
  const activeClipSourceTime = useMemo(() => {
    if (!activeClip) return asSourceSeconds(0);
    return timelineToSourceTime(asTimelineSeconds(currentTime), activeClip);
  }, [currentTime, activeClip]);

  const activeVideoUrl = activeClip?.videoUrl ?? 'https://www.w3schools.com/html/mov_bbb.mp4';

  // Synchronized background audio track clip (Track 3)
  const backgroundAudioClip = useMemo(() => {
    return clips.find(c => c.trackId === 'track_audio');
  }, [clips]);

  // Update telemetry metrics whenever segments rebuild
  useEffect(() => {
    setTelemetry(prev => ({
      ...prev,
      rippleRebuildMs: rebuildResult.rebuildLatencyMs,
      timeSavedSec: rebuildResult.timeSavedSec,
    }));
  }, [rebuildResult]);

  // Push history helper for Undo/Redo across both multi-asset transcripts & timeline clips
  const pushHistory = useCallback((currentTokensByMedia: Record<string, WordToken[]>, currentClips: TimelineClip[]) => {
    setHistoryStack(prev => [...prev.slice(-25), { tokensByMedia: currentTokensByMedia, clips: currentClips }]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyStack.length === 0) return;
    const previous = historyStack[historyStack.length - 1];
    if (previous) {
      setRedoStack(r => [...r, { tokensByMedia, clips }]);
      setTokensByMedia(previous.tokensByMedia);
      setClips(previous.clips);
      setHistoryStack(h => h.slice(0, -1));
    }
  }, [historyStack, tokensByMedia, clips]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    if (next) {
      setHistoryStack(h => [...h, { tokensByMedia, clips }]);
      setTokensByMedia(next.tokensByMedia);
      setClips(next.clips);
      setRedoStack(r => r.slice(0, -1));
    }
  }, [redoStack, tokensByMedia, clips]);

  // Word Token Cut / Toggle Action (Ripple Editing)
  const handleToggleDeleteToken = useCallback((tokenId: string) => {
    pushHistory(tokensByMedia, clips);
    setTokensByMedia(prev => {
      const currentList = prev[activeTranscriptMediaId] ?? [];
      const updated = currentList.map(t => {
        if (t.id !== tokenId) return t;
        const u = { ...t, deleted: !t.deleted };
        validateWordToken(u);
        return u;
      });
      return { ...prev, [activeTranscriptMediaId]: updated };
    });
  }, [pushHistory, tokensByMedia, clips, activeTranscriptMediaId]);

  // Word Token Multiple Cut Action (Backspace / Range selection)
  const handleToggleDeleteMultipleTokens = useCallback((tokenIds: string[]) => {
    if (tokenIds.length === 0) return;
    const idSet = new Set(tokenIds);
    pushHistory(tokensByMedia, clips);
    setTokensByMedia(prev => {
      const currentList = prev[activeTranscriptMediaId] ?? [];
      const updated = currentList.map(t => {
        if (!idSet.has(t.id)) return t;
        const u = { ...t, deleted: true };
        validateWordToken(u);
        return u;
      });
      return { ...prev, [activeTranscriptMediaId]: updated };
    });
  }, [pushHistory, tokensByMedia, clips, activeTranscriptMediaId]);

  // 1-Click Purge Fillers & Pauses (>0.5s)
  const handlePurgeFillers = useCallback(() => {
    pushHistory(tokensByMedia, clips);
    setTokensByMedia(prev => {
      const currentList = prev[activeTranscriptMediaId] ?? [];
      const result = purgeFillersAndPauses(currentList);
      return { ...prev, [activeTranscriptMediaId]: result.updatedTokens };
    });
  }, [pushHistory, tokensByMedia, clips, activeTranscriptMediaId]);

  // Restore all cut tokens
  const handleRestoreAll = useCallback(() => {
    pushHistory(tokensByMedia, clips);
    setTokensByMedia(prev => {
      const currentList = prev[activeTranscriptMediaId] ?? [];
      return { ...prev, [activeTranscriptMediaId]: restoreAllTokens(currentList) };
    });
  }, [pushHistory, tokensByMedia, clips, activeTranscriptMediaId]);

  // Inline TTS Word Replacement (Softablitz A2)
  const handleEditTokenText = useCallback((tokenId: string, newText: string) => {
    pushHistory(tokensByMedia, clips);
    setTokensByMedia(prev => {
      const currentList = prev[activeTranscriptMediaId] ?? [];
      const updated = currentList.map(t => {
        if (t.id !== tokenId) return t;
        const u = { ...t, text: newText, isEdited: true };
        validateWordToken(u);
        return u;
      });
      return { ...prev, [activeTranscriptMediaId]: updated };
    });
  }, [pushHistory, tokensByMedia, clips, activeTranscriptMediaId]);

  // Fast Instant Mock Transcript Generator
  const handleFastGenerateTranscript = useCallback((mediaId: string) => {
    const asset = mediaAssets.find(a => a.id === mediaId);
    const dur = asset?.duration ?? 15.0;
    const name = asset?.name ?? 'Media File';
    const newTokens = generateDefaultTokensForAsset(mediaId, name, dur);
    pushHistory(tokensByMedia, clips);
    setTokensByMedia(prev => ({
      ...prev,
      [mediaId]: newTokens,
    }));
  }, [mediaAssets, pushHistory, tokensByMedia, clips]);

  // Track & Clip Volume Control Handlers
  const handleTrackVolumeChange = useCallback((trackId: string, volume: number) => {
    setTrackStates(prev => ({
      ...prev,
      [trackId]: {
        ...prev[trackId],
        volume,
      },
    }));
  }, []);

  const handleClipVolumeChange = useCallback((clipId: string, volume: number) => {
    pushHistory(tokensByMedia, clips);
    setClips(prev => prev.map(c => (c.id === clipId ? { ...c, volume } : c)));
  }, [pushHistory, tokensByMedia, clips]);

  // Split clip scissors tool (Scissors Icon / Ctrl+B) - strictly targets selected block
  const handleSplitClip = useCallback(() => {
    if (!selectedClipId) {
      alert('Please select a clip on the timeline first, then position the playhead inside it to split.');
      return;
    }

    const targetClip = clips.find(c => c.id === selectedClipId);
    if (!targetClip) {
      alert('Selected clip not found. Please click a clip on the timeline to select it.');
      return;
    }

    const start = targetClip.timelineStart ?? targetClip.sourceStart ?? asTimelineSeconds(0);
    const dur = targetClip.timelineDuration ?? targetClip.duration ?? asSeconds(0);

    // Playhead must be inside the selected clip with 0.05s edge boundary tolerance
    if (currentTime <= start + 0.05 || currentTime >= start + dur - 0.05) {
      alert(`Playhead (${currentTime.toFixed(2)}s) must be positioned inside the selected clip "${targetClip.title}" (${start.toFixed(2)}s - ${(start + dur).toFixed(2)}s) to split it!`);
      return;
    }

    if (trackStates[targetClip.trackId]?.locked) {
      alert(`Cannot split clips on a locked track (${targetClip.trackId}). Please unlock the track first.`);
      return;
    }

    pushHistory(tokensByMedia, clips);

    const clipStart = start;
    const clipDur = dur;
    const clipIn = targetClip.sourceIn ?? asSourceSeconds(0);
    const clipOut = targetClip.sourceOut ?? asSourceSeconds(clipIn + clipDur);

    const splitOffset = Number((currentTime - clipStart).toFixed(2));
    const durationB = Number((clipDur - splitOffset).toFixed(2));

    const sourceInA = clipIn;
    const sourceOutA = Number((clipIn + splitOffset).toFixed(2));
    const sourceInB = sourceOutA;
    const sourceOutB = clipOut;

    const clipA: TimelineClip = {
      ...targetClip,
      id: `${targetClip.id}_a_${Date.now()}`,
      timelineStart: asTimelineSeconds(clipStart),
      timelineDuration: asSeconds(splitOffset),
      sourceIn: asSourceSeconds(sourceInA),
      sourceOut: asSourceSeconds(sourceOutA),
      sourceStart: asTimelineSeconds(clipStart),
      duration: asSeconds(splitOffset),
      isSelected: false,
    };

    const clipB: TimelineClip = {
      ...targetClip,
      id: `${targetClip.id}_b_${Date.now()}`,
      timelineStart: asTimelineSeconds(Number(currentTime.toFixed(2))),
      timelineDuration: asSeconds(durationB),
      sourceIn: asSourceSeconds(sourceInB),
      sourceOut: asSourceSeconds(sourceOutB),
      sourceStart: asTimelineSeconds(Number(currentTime.toFixed(2))),
      duration: asSeconds(durationB),
      isSelected: true,
      transitionIn: targetClip.trackId === 'track_video' ? '][' : undefined,
    };

    // Domain boundary validation before state commit
    validateTimelineClip(clipA);
    validateTimelineClip(clipB);

    setClips(prev => {
      const idx = prev.findIndex(c => c.id === targetClip.id);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated.splice(idx, 1, clipA, clipB);
      return updated;
    });

    setSelectedClipId(clipB.id);
  }, [clips, currentTime, pushHistory, tokensByMedia, trackStates, selectedClipId]);

  // Trim clip edges (interactive yellow handles) with track-lock check and collision awareness
  const handleTrimClip = useCallback((clipId: string, side: 'left' | 'right', deltaSec: number) => {
    const target = clips.find(c => c.id === clipId);
    if (!target) return;
    if (trackStates[target.trackId]?.locked) return;

    pushHistory(tokensByMedia, clips);
    setClips(prev => prev.map(c => {
      if (c.id !== clipId) return c;
      const curStart = c.timelineStart ?? c.sourceStart ?? asTimelineSeconds(0);
      const curDur = c.timelineDuration ?? c.duration ?? asSeconds(0);
      const curIn = c.sourceIn ?? asSourceSeconds(0);
      const curOut = c.sourceOut ?? asSourceSeconds(curIn + curDur);

      // Identify sibling clips on the same track to prevent trim collisions
      const siblings = prev.filter(s => s.trackId === c.trackId && s.id !== clipId);
      const siblingsBefore = siblings.filter(s => {
        const sStart = s.timelineStart ?? s.sourceStart ?? asTimelineSeconds(0);
        return sStart < curStart;
      });
      const siblingsAfter = siblings.filter(s => {
        const sStart = s.timelineStart ?? s.sourceStart ?? asTimelineSeconds(0);
        return sStart > curStart;
      });

      const maxPrevEnd = siblingsBefore.length > 0
        ? Math.max(0, ...siblingsBefore.map(s => {
            const sStart = s.timelineStart ?? s.sourceStart ?? asTimelineSeconds(0);
            const sDur = s.timelineDuration ?? s.duration ?? asSeconds(0);
            return sStart + sDur;
          }))
        : 0;

      const minNextStart = siblingsAfter.length > 0
        ? Math.min(...siblingsAfter.map(s => s.timelineStart ?? s.sourceStart ?? asTimelineSeconds(0)))
        : Infinity;

      if (side === 'left') {
        const maxDelta = curDur - 0.5; // Min duration 0.5s
        // Guard against extending past previous sibling boundary AND negative sourceIn!
        const maxLeftExtension = Math.min(curStart - maxPrevEnd, curIn);
        const appliedDelta = Math.max(-Math.max(0, maxLeftExtension), Math.min(maxDelta, deltaSec));
        const newStart = asTimelineSeconds(Number((curStart + appliedDelta).toFixed(2)));
        const newDur = asSeconds(Number((curDur - appliedDelta).toFixed(2)));
        const newIn = asSourceSeconds(Number((curIn + appliedDelta).toFixed(2)));
        const updated: TimelineClip = {
          ...c,
          timelineStart: newStart,
          timelineDuration: newDur,
          sourceIn: newIn,
          sourceOut: curOut,
          sourceStart: newStart,
          duration: newDur,
        };
        validateTimelineClip(updated);
        return updated;
      } else {
        // Guard against extending past next sibling boundary
        const maxPossibleDur = Number.isFinite(minNextStart) ? minNextStart - curStart : Infinity;
        const requestedDur = Math.max(0.5, Number((curDur + deltaSec).toFixed(2)));
        const newDur = asSeconds(Math.min(requestedDur, maxPossibleDur));
        const newOut = asSourceSeconds(Number((curIn + newDur).toFixed(2)));
        const updated: TimelineClip = {
          ...c,
          timelineDuration: newDur,
          sourceOut: newOut,
          duration: newDur,
        };
        validateTimelineClip(updated);
        return updated;
      }
    }));
  }, [clips, pushHistory, tokensByMedia, trackStates]);

  // Shift / Move clip horizontally along timeline with track-lock check and collision awareness
  const handleMoveClip = useCallback((clipId: string, newStartSec: number) => {
    const target = clips.find(c => c.id === clipId);
    if (!target) return;
    if (trackStates[target.trackId]?.locked) return;

    if (!dragStartClipsRef.current) {
      dragStartClipsRef.current = clips;
    }

    const baselineClips = dragStartClipsRef.current;
    const initialClip = baselineClips.find(c => c.id === clipId) || target;
    const initialStart = initialClip.timelineStart ?? initialClip.sourceStart ?? asTimelineSeconds(0);
    const clipDur = target.timelineDuration ?? target.duration ?? asSeconds(0);

    // Identify sibling clips on the same track
    const siblings = baselineClips.filter(c => c.trackId === target.trackId && c.id !== clipId);

    // Bounding siblings before and after initial position
    const siblingsBefore = siblings.filter(s => {
      const sStart = s.timelineStart ?? s.sourceStart ?? asTimelineSeconds(0);
      return sStart < initialStart;
    });
    const siblingsAfter = siblings.filter(s => {
      const sStart = s.timelineStart ?? s.sourceStart ?? asTimelineSeconds(0);
      return sStart > initialStart;
    });

    const maxPrevEnd = siblingsBefore.length > 0
      ? Math.max(0, ...siblingsBefore.map(s => {
          const sStart = s.timelineStart ?? s.sourceStart ?? asTimelineSeconds(0);
          const sDur = s.timelineDuration ?? s.duration ?? asSeconds(0);
          return sStart + sDur;
        }))
      : 0;

    const minNextStart = siblingsAfter.length > 0
      ? Math.min(...siblingsAfter.map(s => s.timelineStart ?? s.sourceStart ?? asTimelineSeconds(0)))
      : Infinity;

    // Boundary clamping to prevent overlapping sibling clips on the same track
    let clampedStart = Math.max(maxPrevEnd, newStartSec);
    if (Number.isFinite(minNextStart)) {
      clampedStart = Math.min(clampedStart, Math.max(maxPrevEnd, minNextStart - clipDur));
    }

    // Magnetic snap within 0.15s of preceding boundary
    if (Math.abs(clampedStart - maxPrevEnd) <= 0.15) {
      clampedStart = maxPrevEnd;
    }
    // Magnetic snap within 0.15s of succeeding boundary
    if (Number.isFinite(minNextStart) && Math.abs((clampedStart + clipDur) - minNextStart) <= 0.15) {
      clampedStart = minNextStart - clipDur;
    }

    setClips(prev => prev.map(c => {
      if (c.id !== clipId) return c;
      const roundedStart = asTimelineSeconds(Number(clampedStart.toFixed(2)));
      const updated: TimelineClip = {
        ...c,
        timelineStart: roundedStart,
        sourceStart: roundedStart,
      };
      validateTimelineClip(updated);
      return updated;
    }));
  }, [clips, trackStates]);

  const handleClipMoveEnd = useCallback((_clipId: string) => {
    if (dragStartClipsRef.current) {
      pushHistory(tokensByMedia, dragStartClipsRef.current);
      dragStartClipsRef.current = null;
    }
  }, [pushHistory, tokensByMedia]);

  // Track Header Actions (Hide, Lock, Mute)
  const handleToggleTrackHidden = useCallback((trackId: string) => {
    setTrackStates(prev => ({
      ...prev,
      [trackId]: {
        ...prev[trackId],
        hidden: !prev[trackId]?.hidden,
      },
    }));
  }, []);

  const handleToggleTrackLocked = useCallback((trackId: string) => {
    setTrackStates(prev => ({
      ...prev,
      [trackId]: {
        ...prev[trackId],
        locked: !prev[trackId]?.locked,
      },
    }));
  }, []);

  const handleToggleTrackMuted = useCallback((trackId: string) => {
    setTrackStates(prev => ({
      ...prev,
      [trackId]: {
        ...prev[trackId],
        muted: !prev[trackId]?.muted,
      },
    }));
  }, []);

  // Add Track Interaction
  const handleAddTrack = useCallback(() => {
    const customTracks = clips.filter(c => c.trackId.startsWith('track_custom'));
    const trackNum = customTracks.length + 1;
    const newClip: TimelineClip = {
      id: `clip_custom_${Date.now()}`,
      trackId: `track_custom_${trackNum}`,
      title: `Track ${trackNum} Overlay`,
      timelineStart: asTimelineSeconds(0),
      timelineDuration: asSeconds(15.0),
      sourceIn: asSourceSeconds(0),
      sourceOut: asSourceSeconds(15.0),
      sourceStart: asTimelineSeconds(0),
      duration: asSeconds(15.0),
      color: '#FFA502',
    };
    validateTimelineClip(newClip);
    setClips(prev => [...prev, newClip]);
    setSelectedClipId(newClip.id);
  }, [clips]);

  // Delete Selection (Del Key / Trash Icon)
  const handleDeleteSelected = useCallback(() => {
    if (selectedClipId) {
      const clipToDelete = clips.find(c => c.id === selectedClipId);
      if (clipToDelete) {
        if (trackStates[clipToDelete.trackId]?.locked) {
          alert('Cannot delete clips on a locked track. Please unlock the track first.');
          return;
        }
        pushHistory(tokensByMedia, clips);
        const remainingClips = clips.filter(c => c.id !== selectedClipId);
        // Cleanly revoke blob URL ONLY when no other clip AND no media asset references it
        if (clipToDelete.videoUrl) {
          safelyRevokeBlobUrl(clipToDelete.videoUrl, remainingClips, mediaAssets);
        }
        setClips(remainingClips);
        setSelectedClipId(undefined);
        return;
      }
    }

    const currentToken = tokens.find(t => !t.deleted && currentTime >= t.start && currentTime <= t.end);
    if (currentToken) {
      handleToggleDeleteToken(currentToken.id);
    }
  }, [selectedClipId, clips, tokens, currentTime, handleToggleDeleteToken, pushHistory, tokensByMedia, trackStates, safelyRevokeBlobUrl, mediaAssets]);

  // Add Asset from Media Bin to Timeline
  const handleAddToTimeline = useCallback((asset: MediaAsset) => {
    pushHistory(tokensByMedia, clips);

    const videoClips = clips.filter(c => c.trackId === 'track_video');
    const lastEnd = videoClips.reduce((max, c) => {
      const start = c.timelineStart ?? c.sourceStart ?? asTimelineSeconds(0);
      const dur = c.timelineDuration ?? c.duration ?? asSeconds(0);
      return Math.max(max, start + dur);
    }, 0);

    const newClip: TimelineClip = {
      id: `clip_v_${Date.now()}`,
      trackId: 'track_video',
      title: asset.name,
      timelineStart: asTimelineSeconds(Number(lastEnd.toFixed(2))),
      timelineDuration: asSeconds(asset.duration),
      sourceIn: asSourceSeconds(0),
      sourceOut: asSourceSeconds(asset.duration),
      sourceStart: asTimelineSeconds(Number(lastEnd.toFixed(2))),
      duration: asSeconds(asset.duration),
      color: '#4B6584',
      mediaId: asset.id,
      locator: asset.locator ?? asset.videoUrl ?? 'https://www.w3schools.com/html/mov_bbb.mp4',
      videoUrl: asset.videoUrl ?? 'https://www.w3schools.com/html/mov_bbb.mp4',
      isSelected: true,
      hasWaveform: true,
      transitionIn: videoClips.length > 0 ? '][' : undefined,
    };
    validateTimelineClip(newClip);

    setClips(prev => [...prev, newClip]);
    setSelectedClipId(newClip.id);
    setMediaAssets(prev => prev.map(a => a.id === asset.id ? { ...a, isUsedOnTimeline: true } : a));
    setCurrentTime(newClip.timelineStart);
  }, [clips, pushHistory, tokensByMedia]);

  // Transcribe any media File/Blob with WebGPU Whisper
  const handleTranscribeMedia = useCallback(async (blob: Blob, asset: MediaAsset) => {
    setIsTranscribing(true);
    setTranscribeFileName(asset.name);
    setTranscribePercent(5);
    setTranscribeStatus('Extracting audio & initializing Whisper...');

    try {
      const result = await transcribeMediaFile(blob, asset.id, (status, percent) => {
        setTranscribeStatus(status);
        if (percent !== undefined) {
          setTranscribePercent(percent);
        }
      });

      if (result.tokens.length > 0) {
        pushHistory(tokensByMedia, clips);
        setTokensByMedia(prev => ({
          ...prev,
          [asset.id]: result.tokens,
        }));
        setActiveTranscriptMediaId(asset.id);

        // Derive audio duration from last token end
        const calculatedDur = Math.max(...result.tokens.map(t => t.end), 5.0);
        const roundedDur = asSeconds(Number(calculatedDur.toFixed(2)));

        setMediaAssets(prev => prev.map(a => a.id === asset.id ? { ...a, duration: roundedDur } : a));

        // Update clips linked to this asset
        setClips(prev => prev.map(c => {
          if (c.mediaId !== asset.id) return c;
          return {
            ...c,
            timelineDuration: roundedDur,
            sourceOut: asSourceSeconds(roundedDur),
            duration: roundedDur,
          };
        }));
      }

      setTelemetry(prev => ({
        ...prev,
        recoveryLog: `Transcribed "${asset.name}" via WebGPU (${result.deviceUsed}). Generated ${result.tokens.length} words.`,
      }));

      // Switch to transcript tab so user sees the live words!
      setActiveDockTab('media');
      setActiveSubNav('transcript');
    } catch (err) {
      console.error('[Whisper] Transcription error:', err);
      alert(`Transcription: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsTranscribing(false);
      setTranscribePercent(0);
      setTranscribeStatus('');
    }
  }, [clips, pushHistory, tokensByMedia]);

  // Real File Drag-and-Drop or Picker handling with tracked blob URLs
  const handleFilesAdded = useCallback((fileList: File[]) => {
    const newAssets: MediaAsset[] = fileList.map((f, idx) => {
      const url = URL.createObjectURL(f);
      blobUrlsRef.current.add(url);
      const isVid = f.type.startsWith('video') || f.name.endsWith('.mp4') || f.name.endsWith('.mov') || f.name.endsWith('.webm');
      const isAud = f.type.startsWith('audio') || f.name.endsWith('.mp3') || f.name.endsWith('.wav');
      const assetId = `asset_upload_${Date.now()}_${idx}`;

      // Save raw File object to feed Whisper and FFmpeg WASM
      fileBlobMapRef.current.set(assetId, f);

      return {
        id: assetId,
        name: f.name,
        type: isVid ? 'video' : isAud ? 'audio' : 'image',
        duration: asSeconds(15.0),
        thumbnailUrl: isVid
          ? 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=400&q=80'
          : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80',
        locator: url,
        videoUrl: url,
        isUsedOnTimeline: false,
        resolution: '1920x1080',
        category: 'Imported',
        fileSizeMb: Number((f.size / (1024 * 1024)).toFixed(1)),
      };
    });

    setMediaAssets(prev => [...newAssets, ...prev]);

    // Automatically create instant default transcript for newly uploaded assets
    setTokensByMedia(prev => {
      const updated = { ...prev };
      newAssets.forEach(a => {
        updated[a.id] = generateDefaultTokensForAsset(a.id, a.name, a.duration);
      });
      return updated;
    });

    // Automatically prompt and transcribe the first imported audio/video file
    const primaryFile = fileList[0];
    const primaryAsset = newAssets[0];
    if (primaryFile && primaryAsset && (primaryAsset.type === 'video' || primaryAsset.type === 'audio')) {
      setActiveTranscriptMediaId(primaryAsset.id);
      handleAddToTimeline(primaryAsset);
      handleTranscribeMedia(primaryFile, primaryAsset);
    } else {
      setActiveSubNav('my-files');
    }
  }, [handleAddToTimeline, handleTranscribeMedia]);

  // On-demand transcribe button trigger for active video
  const handleTranscribeCurrentMedia = useCallback(async () => {
    let blob = fileBlobMapRef.current.get(activeMediaId);
    let asset = mediaAssets.find(a => a.id === activeMediaId);

    if (!blob) {
      if (activeVideoUrl) {
        setTranscribeStatus('Fetching media file stream...');
        setIsTranscribing(true);
        setTranscribePercent(2);
        try {
          const resp = await fetch(activeVideoUrl);
          blob = await resp.blob();
        } catch {
          setIsTranscribing(false);
          alert('Could not fetch active media stream for WebGPU transcription.');
          return;
        }
      }
    }

    if (!blob) {
      alert('No media file loaded to transcribe.');
      return;
    }

    const targetAsset: MediaAsset = asset ?? {
      id: activeMediaId,
      name: activeClip?.title ?? 'Active Video',
      type: 'video',
      duration: asSeconds(15.0),
      thumbnailUrl: '',
      isUsedOnTimeline: true,
    };

    await handleTranscribeMedia(blob, targetAsset);
  }, [activeMediaId, activeVideoUrl, activeClip, mediaAssets, handleTranscribeMedia]);

  // Real FFmpeg WASM Video Exporter handler
  const handleStartExport = useCallback(async (
    exportSettings: ExportSettings,
    callbacks: { onProgress: (percent: number, stage: string, log?: string) => void }
  ) => {
    let blob = fileBlobMapRef.current.get(activeMediaId);

    if (!blob && activeVideoUrl) {
      callbacks.onProgress(5, 'Fetching media stream for WASM export...');
      const resp = await fetch(activeVideoUrl);
      blob = await resp.blob();
    }

    if (!blob) {
      throw new Error('No media file available to export.');
    }

    const result = await exportVideoWithFfmpegWasm(
      blob,
      rebuildResult.segments,
      tokens,
      {
        mode: exportSettings.wasmMode === 'stream-copy' ? 'stream-copy' : 'filter-complex-ass',
        includeSubtitles: true,
        onProgress: p => {
          callbacks.onProgress(p.percent, p.stage, p.log);
        },
      }
    );

    // Trigger instant browser download
    const downloadUrl = URL.createObjectURL(result.outputBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = (exportSettings.title || 'ScarletCut_Export').replace(/[^a-zA-Z0-9_-]/g, '_') + '.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
    }, 60000);
  }, [activeMediaId, activeVideoUrl, rebuildResult.segments, tokens]);

  // Add marker flag at current playhead
  const handleAddMarker = useCallback(() => {
    const newMarker: MarkerFlag = {
      id: `m_${Date.now()}`,
      time: Number(currentTime.toFixed(2)),
      color: '#168BFF',
      label: `Marker @ ${currentTime.toFixed(1)}s`,
    };
    setMarkers(prev => [...prev, newMarker]);
  }, [currentTime]);

  // Apply Filter or Title from Effects Tab
  const handleApplyEffect = useCallback((effectName: string) => {
    if (activeDockTab === 'filters') {
      setActiveFilter(effectName);
    } else if (activeDockTab === 'titles') {
      pushHistory(tokensByMedia, clips);
      const newTitleClip: TimelineClip = {
        id: `title_${Date.now()}`,
        trackId: 'track_title',
        title: `TT ${effectName}`,
        timelineStart: asTimelineSeconds(Number(currentTime.toFixed(2))),
        timelineDuration: asSeconds(8.0),
        sourceIn: asSourceSeconds(0),
        sourceOut: asSourceSeconds(8.0),
        sourceStart: asTimelineSeconds(Number(currentTime.toFixed(2))),
        duration: asSeconds(8.0),
        color: '#8854D0',
      };
      validateTimelineClip(newTitleClip);
      setClips(prev => [...prev, newTitleClip]);
      setSelectedClipId(newTitleClip.id);
    } else {
      alert(`Applied effect: ${effectName}!`);
    }
  }, [activeDockTab, currentTime, pushHistory, tokensByMedia, clips]);

  // Fault Simulator Trigger with safe timeout retention
  const handleTriggerFailureMode = useCallback((mode: FailureMode) => {
    if (seekLockTimeoutRef.current) {
      window.clearTimeout(seekLockTimeoutRef.current);
      seekLockTimeoutRef.current = null;
    }

    if (mode === 'seek-lock') {
      setIsSeekLocked(true);
      setTelemetry(prev => ({
        ...prev,
        activeFailureMode: 'seek-lock',
        recoveryLog: '[SELF-HEALING GUARD] Engaged isSeekingRef mutex. Hardware decoder race condition throttled cleanly.',
      }));
      seekLockTimeoutRef.current = window.setTimeout(() => {
        setIsSeekLocked(false);
        seekLockTimeoutRef.current = null;
      }, 2000);
    } else if (mode === 'heap-guard') {
      setTelemetry(prev => ({
        ...prev,
        activeFailureMode: 'heap-guard',
        memfsHeapMb: 142,
        recoveryLog: '[SELF-HEALING GUARD] Pre-flight 750MB limit check passed. MEMFS GC unlinked all virtual descriptors.',
      }));
    } else if (mode === 'webgpu-loss') {
      setTelemetry(prev => ({
        ...prev,
        activeFailureMode: 'webgpu-loss',
        recoveryLog: '[SELF-HEALING GUARD] WebGPU context loss caught. Seamlessly transitioned to ONNX CPU WASM SIMD (4 threads).',
      }));
    }
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (seekLockTimeoutRef.current) {
        window.clearTimeout(seekLockTimeoutRef.current);
      }
    };
  }, []);

  // Unified seek coordinator: leaps over cut segments if target falls into a cut interval
  const handleSeek = useCallback((targetTime: number) => {
    let finalTime = targetTime;
    const targetTimeline = asTimelineSeconds(targetTime);
    const currentClip = getClipAtTimelineTime(targetTimeline, clips, 'track_video')
      ?? clips.find(c => c.trackId === 'track_video');

    if (currentClip) {
      const clipMediaId = currentClip.mediaId ?? 'asset_1';
      const clipSegments = segmentsByMediaId.get(clipMediaId) ?? [];

      if (clipSegments.length > 0) {
        const sourcePos = timelineToSourceTime(targetTimeline, currentClip);
        const firstSeg = clipSegments[0];
        const lastSeg = clipSegments[clipSegments.length - 1];
        if (firstSeg && lastSeg && sourcePos >= firstSeg.sourceStart - 0.05 && sourcePos <= lastSeg.sourceEnd + 0.05) {
          const jumpResult = getNextValidTime(sourcePos, clipSegments);
          if (jumpResult.didJump) {
            finalTime = sourceToTimelineTime(jumpResult.nextTime, currentClip);
            setTelemetry(prev => ({
              ...prev,
              searchLatencyMs: jumpResult.searchLatencyMs,
              recoveryLog: `[RIPPLE SEEK] O(log N) leap across cut gap to ${jumpResult.nextTime.toFixed(2)}s (${jumpResult.searchLatencyMs}ms).`,
            }));
          }
        }
      }
    }
    setCurrentTime(Math.max(0, Math.min(projectDuration, finalTime)));
  }, [clips, segmentsByMediaId, projectDuration]);

  // Playback Frame Loop: STRICTLY STOPPED WHEN PAUSED + RIPPLE LEAPS ACROSS CUTS
  useEffect(() => {
    if (!isPlaying) return; // Completely STOP loop when paused to eliminate re-renders!

    let animationFrameId: number;
    let lastTimestamp = performance.now();

    const loop = (timestamp: number) => {
      const deltaSec = ((timestamp - lastTimestamp) / 1000) * playbackSpeed;
      lastTimestamp = timestamp;

      setCurrentTime(prevTime => {
        let rawNext = prevTime + deltaSec;

        // Transcript ripple cuts integration:
        // Evaluated strictly against the active clip's media asset playback segments
        const targetTimeline = asTimelineSeconds(rawNext);
        const currentClip = getClipAtTimelineTime(targetTimeline, clips, 'track_video')
          ?? clips.find(c => c.trackId === 'track_video');

        if (currentClip) {
          const clipMediaId = currentClip.mediaId ?? 'asset_1';
          const clipSegments = segmentsByMediaId.get(clipMediaId) ?? [];

          if (clipSegments.length > 0) {
            const sourcePos = timelineToSourceTime(targetTimeline, currentClip);
            const firstSeg = clipSegments[0];
            const lastSeg = clipSegments[clipSegments.length - 1];

            if (firstSeg && lastSeg && sourcePos >= firstSeg.sourceStart - 0.05 && sourcePos <= lastSeg.sourceEnd + 0.05) {
              const jumpResult = getNextValidTime(sourcePos, clipSegments);
              if (jumpResult.didJump) {
                rawNext = sourceToTimelineTime(jumpResult.nextTime, currentClip);
                setTelemetry(prev => ({
                  ...prev,
                  searchLatencyMs: jumpResult.searchLatencyMs,
                  recoveryLog: `[RIPPLE PLAYBACK] O(log N) leap across cut gap to ${jumpResult.nextTime.toFixed(2)}s (${jumpResult.searchLatencyMs}ms).`,
                }));
              }
            }
          }
        }

        // If past composition project duration, pause and loop back
        if (rawNext >= projectDuration) {
          setIsPlaying(false);
          return 0;
        }

        return rawNext;
      });

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, projectDuration, playbackSpeed, clips, segmentsByMediaId]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(p => !p);
      } else if (e.code === 'KeyB' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSplitClip();
      } else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.code === 'KeyY' && (e.ctrlKey || e.metaKey)) || (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        handleAddMarker();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSplitClip, handleUndo, handleRedo, handleDeleteSelected, handleAddMarker]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#111317',
        color: '#FFFFFF',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        overflow: 'hidden',
      }}
    >
      {/* Zone 1 & 2 & 3 & 4 Upper Flex Row (62% Height) */}
      <div style={{ display: 'flex', flex: '1 1 62%', minHeight: '340px', overflow: 'hidden' }}>
        {/* Zone 1: Movavi Black Left Activity Dock (48px Width) */}
        <ActivityDock
          activeTab={activeDockTab}
          onTabChange={setActiveDockTab}
        />

        {/* Zone 2: Sub-Navigation Sidebar (160px Width) */}
        {activeDockTab === 'media' && (
          <SubNavSidebar
            activeSection={activeSubNav}
            onSectionChange={setActiveSubNav}
          />
        )}

        {/* Zone 3: Center Workspace Viewport */}
        <div style={{ flex: 1, backgroundColor: '#181B20', overflow: 'hidden' }}>
          {activeDockTab === 'media' && activeSubNav === 'transcript' ? (
            /* View B: Transcript Storyboard */
            <TranscriptEditorView
              tokens={tokens}
              currentTime={currentTime}
              mediaAssets={mediaAssets}
              activeMediaId={activeTranscriptMediaId}
              onSelectMediaId={setActiveTranscriptMediaId}
              onToggleDeleteToken={handleToggleDeleteToken}
              onToggleDeleteMultipleTokens={handleToggleDeleteMultipleTokens}
              onPurgeFillers={handlePurgeFillers}
              onRestoreAllTokens={handleRestoreAll}
              onEditTokenText={handleEditTokenText}
              onSeekToTime={handleSeek}
              onTranscribeCurrentMedia={handleTranscribeCurrentMedia}
              onFastGenerateTranscript={handleFastGenerateTranscript}
              isTranscribing={isTranscribing}
            />
          ) : activeDockTab === 'media' && activeSubNav === 'import' ? (
            /* View C: Import Dropzone with Real Files */
            <ImportDropzoneView
              onFilesAdded={handleFilesAdded}
              onQuickAction={action => {
                alert(`Triggered: ${action} studio tool (Phase 2 preview)`);
              }}
            />
          ) : activeDockTab === 'tools' ? (
            /* View D: Tools 6-Panel Drawer (Page 7) */
            <ToolsDrawerView
              settings={toolSettings}
              onUpdateSettings={setToolSettings}
              activeSubTab={activeToolTab}
              onTabChange={setActiveToolTab}
              masterVolume={masterVolume}
              onMasterVolumeChange={setMasterVolume}
            />
          ) : ['filters', 'transitions', 'titles', 'stickers'].includes(activeDockTab) ? (
            /* View E: Effects Grid (Page 4 & 7) */
            <EffectsGridView
              type={activeDockTab as 'filters' | 'transitions' | 'titles' | 'stickers'}
              onApplyEffect={handleApplyEffect}
            />
          ) : (
            /* View A: My Files Media Grid (Page 1 Default) */
            <MediaGridView
              assets={mediaAssets}
              onSelectAsset={asset => {
                const linkedClip = clips.find(c => c.mediaId === asset.id);
                if (linkedClip) {
                  handleSeek(linkedClip.timelineStart ?? linkedClip.sourceStart ?? 0);
                  setSelectedClipId(linkedClip.id);
                }
              }}
              onAddToTimeline={handleAddToTimeline}
            />
          )}
        </div>

        {/* Zone 4: Right Video Preview Monitor (46% Width) */}
        <div style={{ width: '46%', minWidth: '420px', height: '100%', borderLeft: '1px solid #2B303A' }}>
          <VideoPreviewMonitor
            currentTime={currentTime}
            duration={projectDuration}
            isPlaying={isPlaying}
            tokens={tokens}
            aspectRatio={aspectRatio}
            isSeekLocked={isSeekLocked}
            onSeekLockChange={setIsSeekLocked}
            videoPreviewUrl={activeVideoUrl}
            sourceTimeOffset={activeClipSourceTime}
            playbackSpeed={playbackSpeed}
            onPlaybackSpeedChange={setPlaybackSpeed}
            rotationAngle={rotationAngle}
            activeFilter={activeFilter}
            colorAdjustments={toolSettings.colorAdjustments}
            onClearActiveFilter={() => setActiveFilter('none')}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
            onSeek={handleSeek}
            onAspectRatioChange={setAspectRatio}
            onFirstFrame={() => handleSeek(0)}
            onLastFrame={() => handleSeek(projectDuration)}
            onPrevFrame={() => handleSeek(Math.max(0, currentTime - 0.04))}
            onNextFrame={() => handleSeek(Math.min(projectDuration, currentTime + 0.04))}
            trackStates={trackStates}
            isSubtitlesActive={isSubtitlesActive}
            backgroundAudioUrl={backgroundAudioClip?.videoUrl ?? 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'}
          />
        </div>
      </div>

      {/* Zone 5: Middle Action Toolbar (46px Height) */}
      <MiddleActionToolbar
        telemetry={telemetry}
        canUndo={historyStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onDeleteSelected={handleDeleteSelected}
        onSplitClip={handleSplitClip}
        onRotateClip={() => setRotationAngle(r => (r + 90) % 360)}
        onCropZoom={() => {
          setActiveDockTab('tools');
          setActiveToolTab('overlay');
        }}
        onOpenColorTool={() => {
          setActiveDockTab('tools');
          setActiveToolTab('color');
        }}
        onOpenEqualizerTool={() => {
          setActiveDockTab('tools');
          setActiveToolTab('equalizer');
        }}
        onToggleSubtitles={() => setIsSubtitlesActive(s => !s)}
        isSubtitlesActive={isSubtitlesActive}
        onAddMarker={handleAddMarker}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onToggleFaultSimulator={() => setIsFaultSimulatorOpen(!isFaultSimulatorOpen)}
      />

      {/* Zone 6: Multi-Track Timeline & Ruler (38% Height) */}
      <div style={{ flex: '1 1 38%', minHeight: '180px', display: 'flex', flexDirection: 'column' }}>
        <MultiTrackTimeline
          currentTime={currentTime}
          duration={projectDuration}
          segments={rebuildResult.segments}
          clips={clips}
          markers={markers}
          scale={timelineScale}
          selectedClipId={selectedClipId}
          trackStates={trackStates}
          onToggleTrackHidden={handleToggleTrackHidden}
          onToggleTrackLocked={handleToggleTrackLocked}
          onToggleTrackMuted={handleToggleTrackMuted}
          onTrackVolumeChange={handleTrackVolumeChange}
          onClipVolumeChange={handleClipVolumeChange}
          onSeek={handleSeek}
          onSelectClip={clipId => {
            setSelectedClipId(clipId);
            const target = clips.find(c => c.id === clipId);
            if (target?.mediaId) {
              setActiveTranscriptMediaId(target.mediaId);
            }
          }}
          onTrimClip={handleTrimClip}
          onMoveClip={handleMoveClip}
          onClipMoveEnd={handleClipMoveEnd}
          onAddTrack={handleAddTrack}
          onDeleteMarker={markerId => setMarkers(prev => prev.filter(m => m.id !== markerId))}
        />

        {/* Bottom Status Footer (28px Height) */}
        <StatusFooter
          scale={timelineScale}
          onScaleChange={setTimelineScale}
          projectDuration={projectDuration}
          statusText={isPlaying ? `Playing (${playbackSpeed}x 60FPS)` : 'Ready'}
        />
      </div>

      {/* Zone 7: Modals & Dialogs */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExportComplete={() => {
          setIsExportModalOpen(false);
          setIsExportReadyOpen(true);
        }}
        onStartExport={handleStartExport}
      />

      <ExportReadyDialog
        isOpen={isExportReadyOpen}
        onClose={() => setIsExportReadyOpen(false)}
        outputPath="C:\Users\movavi\Desktop\ScarletCut_Export.mp4"
      />

      {/* Live WebGPU Whisper Transcription Overlay */}
      {isTranscribing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '460px',
              backgroundColor: '#181B20',
              border: '1px solid #168BFF',
              borderRadius: '16px',
              padding: '28px 24px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 30px rgba(22, 139, 255, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'rgba(22, 139, 255, 0.15)',
                border: '2px solid #168BFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <IconSparkles size={28} color="#168BFF" />
            </div>

            <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 600, color: '#FFFFFF' }}>
              Transcribing with WebGPU Whisper
            </h3>
            <span style={{ fontSize: '12px', color: '#8A96A6', marginBottom: '16px' }}>
              {transcribeFileName ? `Processing "${transcribeFileName}"` : 'Processing active media...'}
            </span>

            {/* Progress Bar */}
            <div
              style={{
                width: '100%',
                height: '8px',
                backgroundColor: '#2A313C',
                borderRadius: '4px',
                overflow: 'hidden',
                marginBottom: '12px',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${transcribePercent}%`,
                  backgroundColor: '#168BFF',
                  boxShadow: '0 0 10px #168BFF',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '12px', color: '#A4B0BE' }}>
              <span>{transcribeStatus}</span>
              <span style={{ fontWeight: 600, color: '#FFFFFF' }}>{transcribePercent}%</span>
            </div>

            <span
              style={{
                marginTop: '18px',
                fontSize: '10px',
                fontFamily: "'JetBrains Mono', monospace",
                color: '#2ED573',
                backgroundColor: 'rgba(46, 213, 115, 0.1)',
                padding: '3px 8px',
                borderRadius: '4px',
              }}
            >
              100% In-Browser • Zero Server Privacy • WebGPU Accelerated
            </span>
          </div>
        </div>
      )}

      {/* Fault Simulator Bar */}
      <FaultSimulatorBar
        isOpen={isFaultSimulatorOpen}
        onClose={() => setIsFaultSimulatorOpen(false)}
        telemetry={telemetry}
        onTriggerFailureMode={handleTriggerFailureMode}
      />
    </div>
  );
};
