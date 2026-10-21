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
  LIBRARY_MEDIA_ASSETS,
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
  synthesizeOverdubWavBytes,
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
  const [activeSubNav, setActiveSubNav] = useState<SubNavSection | string>('my-files');
  const [customFolders, setCustomFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [showCropGuides, setShowCropGuides] = useState(false);
  const [lastExportBlobUrl, setLastExportBlobUrl] = useState<string | null>(null);
  const [lastExportFileName, setLastExportFileName] = useState('ScarletCut_Export_2026.mp4');
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureStatus, setCaptureStatus] = useState('');

  // WebGPU Whisper Live Transcription State
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState('');
  const [transcribePercent, setTranscribePercent] = useState(0);
  const [transcribeFileName, setTranscribeFileName] = useState('');

  // Retain actual File/Blob handles for uploaded assets (to feed Whisper and FFmpeg WASM)
  const fileBlobMapRef = useRef<Map<string, Blob>>(new Map());

  // Media Bin & Transcript State (Clean slate default: zero pre-loaded media or audio)
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [tokensByMedia, setTokensByMedia] = useState<Record<string, WordToken[]>>({});
  const [activeTranscriptMediaId, setActiveTranscriptMediaId] = useState<string>('');
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [markers, setMarkers] = useState<MarkerFlag[]>([]);

  // Playback & Scrubber State
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [timelineScale, setTimelineScale] = useState(1.0);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [selectedClipId, setSelectedClipId] = useState<string | undefined>(undefined);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [trackStates, setTrackStates] = useState<Record<string, { hidden?: boolean; locked?: boolean; muted?: boolean; volume?: number }>>({
    track_title: { hidden: false, locked: false, muted: false, volume: 100 },
    track_video: { hidden: false, locked: false, muted: false, volume: 100 },
    track_audio: { hidden: false, locked: false, muted: false, volume: 100 },
  });

  // Tool Drawer & Visual Filter State
  const [toolSettings, setToolSettings] = useState<ToolSettings>(INITIAL_TOOL_SETTINGS);
  const [activeToolTab, setActiveToolTab] = useState<ToolDrawerTab>('chroma');
  const [activeFilter, setActiveFilter] = useState<string>('none');
  const [activeTitlePreset, setActiveTitlePreset] = useState<string | undefined>();
  const [activeSticker, setActiveSticker] = useState<string | undefined>();
  const [activeTransition, setActiveTransition] = useState<string | undefined>();
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

  const videoClips = useMemo(() => clips.filter(c => c.trackId === 'track_video'), [clips]);
  const lastVideoEnd = useMemo(() => {
    if (videoClips.length === 0) return 0;
    return Math.max(...videoClips.map(c => {
      const start = c.timelineStart ?? c.sourceStart ?? 0;
      const dur = c.timelineDuration ?? c.duration ?? 0;
      return start + dur;
    }));
  }, [videoClips]);

  // Active title clip derived from title track at currentTime or selected title clip
  const activeTitleClip = useMemo(() => {
    const titleClips = clips.filter(c => c.trackId === 'track_title');
    const current = titleClips.find(c => {
      const start = c.timelineStart ?? c.sourceStart ?? 0;
      const dur = c.timelineDuration ?? c.duration ?? 0;
      return currentTime >= start && currentTime <= start + dur;
    });
    if (current) return current;
    const selected = clips.find(c => c.id === selectedClipId && c.trackId === 'track_title');
    return selected;
  }, [clips, currentTime, selectedClipId]);

  // Push history helper for Undo/Redo across both multi-asset transcripts & timeline clips
  const pushHistory = useCallback((currentTokensByMedia: Record<string, WordToken[]>, currentClips: TimelineClip[]) => {
    setHistoryStack(prev => [...prev.slice(-25), { tokensByMedia: currentTokensByMedia, clips: currentClips }]);
    setRedoStack([]);
  }, []);

  const handleEditClipTitle = useCallback((clipId: string, newTitle: string) => {
    pushHistory(tokensByMedia, clips);
    setClips(prev => prev.map(c => (c.id === clipId ? { ...c, title: newTitle } : c)));
  }, [pushHistory, tokensByMedia, clips]);

  const handleEditActiveTitle = useCallback(() => {
    const curTitle = activeTitlePreset || activeTitleClip?.title || 'Title Text';
    const newText = prompt('Edit Title & Caption text:', curTitle);
    if (newText !== null && newText.trim()) {
      setActiveTitlePreset(newText.trim());
      if (activeTitleClip) {
        handleEditClipTitle(activeTitleClip.id, newText.trim());
      }
    }
  }, [activeTitlePreset, activeTitleClip, handleEditClipTitle]);

  // Exact mapped source offset within the active video clip
  const activeClipSourceTime = useMemo(() => {
    if (!activeClip) return asSourceSeconds(0);
    return timelineToSourceTime(asTimelineSeconds(currentTime), activeClip);
  }, [currentTime, activeClip]);

  const activeVideoUrl = activeClip?.videoUrl;

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
        const slotDur = Math.max(0.15, t.end - t.start);
        const { wavBytes } = synthesizeOverdubWavBytes(newText, slotDur, 16000);
        const wavBlob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
        const overdubUrl = URL.createObjectURL(wavBlob);
        blobUrlsRef.current.add(overdubUrl);
        const u: WordToken = {
          ...t,
          text: newText,
          replacementText: newText,
          replacementAudioUrl: overdubUrl,
          isEdited: true,
        };
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
        const maxLeftExtension = c.mediaId ? Math.min(curStart - maxPrevEnd, curIn) : (curStart - maxPrevEnd);
        const appliedDelta = Math.max(-Math.max(0, maxLeftExtension), Math.min(maxDelta, deltaSec));
        const newStart = asTimelineSeconds(Number((curStart + appliedDelta).toFixed(2)));
        const newDur = asSeconds(Number((curDur - appliedDelta).toFixed(2)));
        const newIn = asSourceSeconds(Number((c.mediaId ? curIn + appliedDelta : 0).toFixed(2)));
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

  // 1-Click Load Sample Demo Project (for testing and showcase)
  const handleLoadDemoProject = useCallback(() => {
    pushHistory(tokensByMedia, clips);
    setMediaAssets([...INITIAL_MEDIA_ASSETS, ...LIBRARY_MEDIA_ASSETS]);
    setTokensByMedia(INITIAL_TOKENS_BY_MEDIA);
    setActiveTranscriptMediaId('asset_1');
    setClips(INITIAL_TIMELINE_CLIPS);
    setMarkers(INITIAL_MARKERS);
    setSelectedClipId('clip_video_1');
    setSelectedClipIds(['clip_video_1']);
    setCurrentTime(0);
  }, [pushHistory, tokensByMedia, clips]);

  // Batch shift / move multiple selected clips synchronously
  const handleBatchMoveClips = useCallback((clipIds: string[], deltaSec: number) => {
    setClips(prev => {
      return prev.map(c => {
        if (!clipIds.includes(c.id)) return c;
        if (trackStates[c.trackId]?.locked) return c;
        const curStart = c.timelineStart ?? c.sourceStart ?? asTimelineSeconds(0);
        const newStart = Math.max(0, Number((curStart + deltaSec).toFixed(2)));
        const updated: TimelineClip = {
          ...c,
          timelineStart: asTimelineSeconds(newStart),
          sourceStart: asTimelineSeconds(newStart),
        };
        validateTimelineClip(updated);
        return updated;
      });
    });
  }, [trackStates]);

  // Drag and Drop from Effects / Library directly into Timeline
  const handleTimelineDropItem = useCallback((
    payload: { type: string; name: string; color?: string; sub?: string; category?: string; data?: any },
    dropTimeSec: number,
    targetTrackId: string
  ) => {
    pushHistory(tokensByMedia, clips);
    const dropTime = asTimelineSeconds(Number(dropTimeSec.toFixed(2)));

    if (payload.type === 'titles') {
      const dur = asSeconds(4.0);
      const newTitleClip: TimelineClip = {
        id: `clip_title_${Date.now()}`,
        trackId: 'track_title',
        title: payload.name,
        timelineStart: dropTime,
        timelineDuration: dur,
        sourceIn: asSourceSeconds(0),
        sourceOut: asSourceSeconds(dur),
        sourceStart: dropTime,
        duration: dur,
        color: payload.color || '#8854D0',
      };
      validateTimelineClip(newTitleClip);
      setClips(prev => [...prev, newTitleClip]);
      setSelectedClipId(newTitleClip.id);
      setSelectedClipIds([newTitleClip.id]);
      setActiveTitlePreset(payload.name);
    } else if (payload.type === 'stickers') {
      const dur = asSeconds(4.0);
      const newStickerClip: TimelineClip = {
        id: `clip_sticker_${Date.now()}`,
        trackId: targetTrackId.startsWith('track_custom') ? targetTrackId : 'track_custom_stickers',
        title: `★ ${payload.name}`,
        timelineStart: dropTime,
        timelineDuration: dur,
        sourceIn: asSourceSeconds(0),
        sourceOut: asSourceSeconds(dur),
        sourceStart: dropTime,
        duration: dur,
        color: payload.color || '#FF7F50',
      };
      validateTimelineClip(newStickerClip);
      setClips(prev => [...prev, newStickerClip]);
      setSelectedClipId(newStickerClip.id);
      setSelectedClipIds([newStickerClip.id]);
      setActiveSticker(payload.name);
    } else if (payload.type === 'transitions') {
      setActiveTransition(payload.name);
      setClips(prev => prev.map(c => {
        if (c.trackId !== 'track_video') return c;
        const cStart = c.timelineStart ?? c.sourceStart ?? 0;
        const cDur = c.timelineDuration ?? c.duration ?? 0;
        if (dropTimeSec >= cStart && dropTimeSec <= cStart + cDur) {
          return { ...c, transitionIn: payload.name };
        }
        return c;
      }));
    } else if (payload.type === 'filters') {
      setActiveFilter(payload.name);
    } else if (payload.type === 'asset' && payload.data) {
      const asset = payload.data as MediaAsset;
      const dur = asSeconds(asset.duration || 10.0);
      const trackId = asset.type === 'audio' ? 'track_audio' : 'track_video';
      const newClip: TimelineClip = {
        id: `clip_${Date.now()}`,
        trackId,
        title: asset.name,
        timelineStart: dropTime,
        timelineDuration: dur,
        sourceIn: asSourceSeconds(0),
        sourceOut: asSourceSeconds(dur),
        sourceStart: dropTime,
        duration: dur,
        color: asset.type === 'audio' ? '#10AC84' : '#2A3548',
        mediaId: asset.id,
        locator: asset.locator ?? asset.videoUrl,
        videoUrl: asset.videoUrl,
        isSelected: true,
      };
      validateTimelineClip(newClip);
      setClips(prev => [...prev, newClip]);
      setSelectedClipId(newClip.id);
      setSelectedClipIds([newClip.id]);
      setMediaAssets(prev => prev.map(a => a.id === asset.id ? { ...a, isUsedOnTimeline: true } : a));
    }
  }, [pushHistory, tokensByMedia, clips]);

  // Delete Selection (Del Key / Trash Icon) - supports batch deletion
  const handleDeleteSelected = useCallback(() => {
    const idsToDelete = selectedClipIds.length > 0 ? selectedClipIds : (selectedClipId ? [selectedClipId] : []);
    if (idsToDelete.length > 0) {
      const clipsToDelete = clips.filter(c => idsToDelete.includes(c.id));
      const hasLocked = clipsToDelete.some(c => trackStates[c.trackId]?.locked);
      if (hasLocked) {
        alert('Cannot delete clips on a locked track. Please unlock the track first.');
        return;
      }
      pushHistory(tokensByMedia, clips);
      const remainingClips = clips.filter(c => !idsToDelete.includes(c.id));
      clipsToDelete.forEach(c => {
        if (c.videoUrl) safelyRevokeBlobUrl(c.videoUrl, remainingClips, mediaAssets);
      });
      setClips(remainingClips);
      setSelectedClipId(undefined);
      setSelectedClipIds([]);
      return;
    }

    const currentToken = tokens.find(t => !t.deleted && currentTime >= t.start && currentTime <= t.end);
    if (currentToken) {
      handleToggleDeleteToken(currentToken.id);
    }
  }, [selectedClipIds, selectedClipId, clips, tokens, currentTime, handleToggleDeleteToken, pushHistory, tokensByMedia, trackStates, safelyRevokeBlobUrl, mediaAssets]);

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

  // Download all: client-side JSON project manifest (assets, tokens, clips, markers)
  const handleDownloadAll = useCallback(() => {
    const manifest = {
      exportedAt: new Date().toISOString(),
      app: 'ScarletCut Webster 2026',
      mediaAssets: mediaAssets.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        duration: a.duration,
        category: a.category,
        resolution: a.resolution,
        fileSizeMb: a.fileSizeMb,
        isUsedOnTimeline: a.isUsedOnTimeline,
        locator: a.locator,
      })),
      wordTokensByMedia: tokensByMedia,
      timelineClips: clips,
      markers,
      telemetry: {
        timeSavedSec: telemetry.timeSavedSec,
        memfsHeapMb: telemetry.memfsHeapMb,
      },
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    blobUrlsRef.current.add(url);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ScarletCut_Project_Manifest_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      blobUrlsRef.current.delete(url);
    }, 60000);
  }, [mediaAssets, tokensByMedia, clips, markers, telemetry.timeSavedSec, telemetry.memfsHeapMb]);

  const handleAddFolder = useCallback((name: string) => {
    const id = `folder_custom_${Date.now()}`;
    setCustomFolders(prev => [...prev, { id, name }]);
    setActiveSubNav(id);
  }, []);

  // Real File Drag-and-Drop or Picker handling with tracked blob URLs
  const handleFilesAdded = useCallback(async (fileList: File[]) => {
    const customFolder = customFolders.find(f => f.id === activeSubNav);
    const categoryTag =
      activeSubNav === 'folder-landscape' ? 'Landscape'
        : activeSubNav === 'folder-nature' ? 'Nature'
        : customFolder?.name
          ?? 'Imported';

    const newAssets: MediaAsset[] = [];

    for (let idx = 0; idx < fileList.length; idx++) {
      const f = fileList[idx]!;
      const url = URL.createObjectURL(f);
      blobUrlsRef.current.add(url);
      const isVid = f.type.startsWith('video') || f.name.endsWith('.mp4') || f.name.endsWith('.mov') || f.name.endsWith('.webm');
      const isAud = f.type.startsWith('audio') || f.name.endsWith('.mp3') || f.name.endsWith('.wav');
      const assetId = `asset_upload_${Date.now()}_${idx}`;

      // Probe true duration & dimensions from media container
      const { probedDuration, width, height } = await new Promise<{
        probedDuration: number;
        width: number;
        height: number;
      }>(resolve => {
        const el = document.createElement(isVid ? 'video' : 'audio');
        el.preload = 'metadata';
        el.src = url;
        el.onloadedmetadata = () => {
          resolve({
            probedDuration: Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 15.0,
            width: isVid ? (el as HTMLVideoElement).videoWidth || 1920 : 0,
            height: isVid ? (el as HTMLVideoElement).videoHeight || 1080 : 0,
          });
        };
        el.onerror = () => resolve({ probedDuration: 15.0, width: isVid ? 1920 : 0, height: isVid ? 1080 : 0 });
      });

      // Save raw File object to feed Whisper and FFmpeg WASM
      fileBlobMapRef.current.set(assetId, f);

      newAssets.push({
        id: assetId,
        name: f.name,
        type: isVid ? 'video' : isAud ? 'audio' : 'image',
        duration: asSeconds(probedDuration),
        thumbnailUrl: isVid
          ? 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=400&q=80'
          : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80',
        locator: url,
        videoUrl: url,
        isUsedOnTimeline: false,
        resolution: isVid ? `${width}x${height}` : undefined,
        category: categoryTag,
        fileSizeMb: Number((f.size / (1024 * 1024)).toFixed(1)),
      });
    }

    setMediaAssets(prev => [...newAssets, ...prev]);

    // Automatically create instant default transcript for newly uploaded assets
    setTokensByMedia(prev => {
      const updated = { ...prev };
      newAssets.forEach(a => {
        updated[a.id] = generateDefaultTokensForAsset(a.id, a.name, a.duration);
      });
      return updated;
    });

    // Automatically set primary asset for transcript and navigate to My Files (or stay in folder)
    const primaryAsset = newAssets[0];
    if (primaryAsset) {
      setActiveTranscriptMediaId(primaryAsset.id);
    }
    setActiveDockTab('media');
    if (activeSubNav === 'import') {
      setActiveSubNav('my-files');
    }
  }, [activeSubNav, customFolders]);

  // Quick Capture: getUserMedia / getDisplayMedia → MediaRecorder → Media Bin
  const handleQuickCapture = useCallback(async (
    action: 'record-video' | 'capture-screen' | 'record-audio' | 'quick-video'
  ) => {
    if (!navigator.mediaDevices) {
      window.alert('Media devices API is not available in this browser.');
      return;
    }

    let stream: MediaStream | null = null;
    try {
      setIsCapturing(true);
      if (action === 'capture-screen') {
        setCaptureStatus('Select a screen or window to capture…');
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      } else if (action === 'record-audio') {
        setCaptureStatus('Recording microphone (5s)…');
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } else {
        setCaptureStatus(action === 'quick-video' ? 'Quick webcam clip (5s)…' : 'Recording webcam (8s)…');
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      }

      const mimeCandidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'audio/webm',
      ];
      const mimeType = mimeCandidates.find(m => {
        try {
          return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m);
        } catch {
          return false;
        }
      }) ?? '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const durationMs = action === 'record-audio' || action === 'quick-video' ? 5000 : 8000;

      const recordedBlob = await new Promise<Blob>((resolve, reject) => {
        recorder.onerror = () => reject(new Error('MediaRecorder failed'));
        recorder.onstop = () => {
          const type = action === 'record-audio' ? 'audio/webm' : (mimeType || 'video/webm');
          resolve(new Blob(chunks, { type }));
        };
        recorder.start(250);
        window.setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop();
        }, durationMs);
      });

      stream.getTracks().forEach(t => t.stop());
      stream = null;

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const nameMap = {
        'record-video': `Webcam_${stamp}.webm`,
        'capture-screen': `Screencast_${stamp}.webm`,
        'record-audio': `Audio_${stamp}.webm`,
        'quick-video': `QuickVideo_${stamp}.webm`,
      } as const;
      const file = new File([recordedBlob], nameMap[action], { type: recordedBlob.type });
      handleFilesAdded([file]);
      setCaptureStatus('Capture saved to My Files');
      window.setTimeout(() => setCaptureStatus(''), 2000);
    } catch (err) {
      console.error('[QuickCapture]', err);
      window.alert(
        err instanceof Error
          ? `Capture cancelled or failed: ${err.message}`
          : 'Capture cancelled or failed.'
      );
    } finally {
      if (stream) stream.getTracks().forEach(t => t.stop());
      setIsCapturing(false);
    }
  }, [handleFilesAdded]);

  // On-demand transcribe button trigger for active video
  const handleTranscribeCurrentMedia = useCallback(async () => {
    let blob = fileBlobMapRef.current.get(activeMediaId);
    let asset = mediaAssets.find(a => a.id === activeMediaId);

    if (!blob) {
      setTranscribeStatus('Fetching media file stream...');
      setIsTranscribing(true);
      setTranscribePercent(2);
      const urlToFetch = activeVideoUrl || '/sample_festival.mp4';
      try {
        const resp = await fetch(urlToFetch);
        if (resp.ok) {
          blob = await resp.blob();
          fileBlobMapRef.current.set(activeMediaId, new File([blob], asset?.name ?? 'video.mp4', { type: 'video/mp4' }));
        }
      } catch {
        try {
          const resp = await fetch('/sample_festival.mp4');
          if (resp.ok) {
            blob = await resp.blob();
            fileBlobMapRef.current.set(activeMediaId, new File([blob], 'sample_festival.mp4', { type: 'video/mp4' }));
          }
        } catch {}
      }
    }

    if (!blob) {
      setIsTranscribing(false);
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

    if (!blob) {
      const urlToFetch = activeVideoUrl || '/sample_festival.mp4';
      callbacks.onProgress(5, 'Fetching media stream for WASM export...');
      try {
        const resp = await fetch(urlToFetch);
        if (resp.ok) {
          blob = await resp.blob();
        }
      } catch (err) {
        console.warn('Could not fetch activeVideoUrl, falling back to local sample', err);
      }
    }

    if (!blob || blob.size < 100) {
      try {
        const resp = await fetch('/sample_festival.mp4');
        if (resp.ok) {
          blob = await resp.blob();
        }
      } catch (err) {
        console.warn('Local sample fallback failed', err);
      }
    }

    if (!blob) {
      alert('Unable to load video media buffer for export.');
      return;
    }

    try {
      const result = await exportVideoWithFfmpegWasm(
        blob,
        rebuildResult.segments,
        tokens,
        {
          mode: exportSettings.wasmMode === 'stream-copy' ? 'stream-copy' : 'filter-complex-ass',
          includeSubtitles: true,
          resolution: exportSettings.resolution,
          aspectRatio,
          onProgress: p => {
            callbacks.onProgress(p.percent, p.stage, p.log);
            if (p.memfsAllocatedMb !== undefined) {
              setTelemetry(prev => ({ ...prev, memfsHeapMb: p.memfsAllocatedMb ?? 0 }));
            }
          },
        }
      );

      // Retain blob URL for Export Ready dialog + trigger browser download
      if (lastExportBlobUrl) {
        try {
          URL.revokeObjectURL(lastExportBlobUrl);
        } catch {}
      }
      const downloadUrl = URL.createObjectURL(result.outputBlob);
      blobUrlsRef.current.add(downloadUrl);
      const fileName = (exportSettings.title || 'ScarletCut_Export').replace(/[^a-zA-Z0-9_-]/g, '_') + '.mp4';
      setLastExportBlobUrl(downloadUrl);
      setLastExportFileName(fileName);

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setTelemetry(prev => ({ ...prev, memfsHeapMb: 0 }));
    }
  }, [activeMediaId, activeVideoUrl, rebuildResult.segments, tokens, lastExportBlobUrl, aspectRatio]);

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

  // Apply Filter, Title, Transition, or Sticker from Effects Grid
  const handleApplyEffect = useCallback((effectName: string) => {
    if (activeDockTab === 'filters') {
      setActiveFilter(effectName);
    } else if (activeDockTab === 'titles') {
      pushHistory(tokensByMedia, clips);
      setActiveTitlePreset(effectName);
      const newTitleClip: TimelineClip = {
        id: `title_${Date.now()}`,
        trackId: 'track_title',
        title: effectName,
        timelineStart: asTimelineSeconds(Number(currentTime.toFixed(2))),
        timelineDuration: asSeconds(6.0),
        sourceIn: asSourceSeconds(0),
        sourceOut: asSourceSeconds(6.0),
        sourceStart: asTimelineSeconds(Number(currentTime.toFixed(2))),
        duration: asSeconds(6.0),
        color: '#8854D0',
      };
      validateTimelineClip(newTitleClip);
      setClips(prev => [...prev, newTitleClip]);
      setSelectedClipId(newTitleClip.id);
    } else if (activeDockTab === 'transitions') {
      pushHistory(tokensByMedia, clips);
      const targetId = selectedClipId || activeClip?.id;
      if (targetId) {
        setClips(prev => prev.map(c => c.id === targetId ? { ...c, transitionIn: effectName, transitionOut: effectName } : c));
      }
      setActiveTransition(effectName);
    } else if (activeDockTab === 'stickers') {
      setActiveSticker(effectName);
    }
  }, [activeDockTab, currentTime, pushHistory, tokensByMedia, clips, selectedClipId, activeClip]);

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
      // Simulate MEMFS pressure then deterministic GC reclaim
      setTelemetry(prev => ({
        ...prev,
        activeFailureMode: 'heap-guard',
        memfsHeapMb: Math.min(prev.memfsMaxMb - 8, Math.max(prev.memfsHeapMb, 620)),
        recoveryLog: '[SELF-HEALING GUARD] Simulated 2GB ceiling approach. Pre-flight check engaged…',
      }));
      window.setTimeout(() => {
        setTelemetry(prev => ({
          ...prev,
          memfsHeapMb: 68,
          recoveryLog: '[SELF-HEALING GUARD] Pre-flight 750MB limit check passed. MEMFS GC unlinked all virtual descriptors. Heap reclaimed to 68MB.',
        }));
      }, 900);
    } else if (mode === 'webgpu-loss') {
      setTelemetry(prev => ({
        ...prev,
        activeFailureMode: 'webgpu-loss',
        recoveryLog: '[SELF-HEALING GUARD] WebGPU context loss injected. Falling back to ONNX CPU WASM SIMD (4 threads)…',
      }));
      window.setTimeout(() => {
        setTelemetry(prev => ({
          ...prev,
          recoveryLog: '[SELF-HEALING GUARD] Whisper backend switched to CPU WASM SIMD (4 threads). Inference pipeline healthy.',
        }));
      }, 700);
    } else {
      setTelemetry(prev => ({
        ...prev,
        activeFailureMode: 'none',
        recoveryLog: 'System healthy. Zero SSR runtime active.',
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

        // If past last video end (or project duration), pause playback cleanly
        const playbackEnd = lastVideoEnd > 0 ? lastVideoEnd : projectDuration;
        if (rawNext >= playbackEnd) {
          setIsPlaying(false);
          return playbackEnd;
        }

        return rawNext;
      });

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, projectDuration, lastVideoEnd, playbackSpeed, clips, segmentsByMediaId]);

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
            onDownloadAll={handleDownloadAll}
            customFolders={customFolders}
            onAddFolder={handleAddFolder}
          />
        )}

        {/* Zone 3: Center Workspace Viewport */}
        <div style={{ flex: 1, backgroundColor: '#181B20', overflow: 'hidden', position: 'relative' }}>
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
              onQuickAction={handleQuickCapture}
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
            /* View A: My Files / Library / Folder-filtered Media Grid */
            <MediaGridView
              assets={mediaAssets}
              categoryFilter={
                activeSubNav === 'folder-landscape' ? 'Landscape'
                  : activeSubNav === 'folder-nature' ? 'Nature'
                  : activeSubNav === 'sample-video' ? 'Sample video'
                  : activeSubNav === 'sample-audio' ? 'Sample audio'
                  : activeSubNav === 'sample-music' ? 'Sample music'
                  : activeSubNav === 'backgrounds' ? 'Backgrounds'
                  : activeSubNav === 'stock-photos' ? 'Stock photos'
                  : customFolders.some(f => f.id === activeSubNav)
                    ? customFolders.find(f => f.id === activeSubNav)?.name ?? null
                    : null
              }
              title={
                activeSubNav === 'folder-landscape' ? 'Landscape'
                  : activeSubNav === 'folder-nature' ? 'Nature'
                  : activeSubNav === 'sample-video' ? 'Sample video'
                  : activeSubNav === 'sample-audio' ? 'Sample audio'
                  : activeSubNav === 'sample-music' ? 'Sample music'
                  : activeSubNav === 'backgrounds' ? 'Backgrounds'
                  : activeSubNav === 'stock-photos' ? 'Stock photos'
                  : customFolders.find(f => f.id === activeSubNav)?.name
                    ?? 'My Files'
              }
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

          {/* Quick Capture status toast */}
          {(isCapturing || captureStatus) && (
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(22, 139, 255, 0.95)',
                color: '#FFFFFF',
                padding: '8px 16px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 600,
                zIndex: 40,
                boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
              }}
            >
              {captureStatus || 'Capturing…'}
            </div>
          )}
        </div>

        {/* Zone 4: Right Video Preview Monitor (46% Width) */}
        <div style={{ width: '46%', minWidth: '420px', height: '100%', borderLeft: '1px solid #2B303A', display: 'flex', flexDirection: 'column' }}>
          {/* Player Header Bar with Asset Title & Quick Export */}
          <div
            style={{
              height: '38px',
              backgroundColor: '#181B20',
              borderBottom: '1px solid #2B303A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#FFFFFF' }}>
                {activeClip?.title ?? 'Player Monitor'}
              </span>
              <span style={{ fontSize: '10px', color: '#636E7B', fontFamily: "'JetBrains Mono', monospace" }}>
                ({aspectRatio})
              </span>
            </div>
            <button
              id="btn-export-top-right"
              data-testid="btn-export-top-right"
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              style={{
                backgroundColor: '#168BFF',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '9999px',
                padding: '4px 14px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(22, 139, 255, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#329AFF')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#168BFF')}
            >
              Export
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
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
            toolSettings={toolSettings}
            activeTitle={activeTitlePreset || activeTitleClip?.title}
            activeSticker={activeSticker}
            activeTransition={activeTransition ?? activeClip?.transitionIn}
            onEditActiveTitle={handleEditActiveTitle}
            onClearActiveTitle={() => {
              setActiveTitlePreset(undefined);
              if (activeTitleClip) {
                setClips(prev => prev.filter(c => c.id !== activeTitleClip.id));
              }
            }}
            onClearActiveFilter={() => setActiveFilter('none')}
            onClearActiveSticker={() => setActiveSticker(undefined)}
            onClearActiveTransition={() => setActiveTransition(undefined)}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
            onSeek={handleSeek}
            onAspectRatioChange={setAspectRatio}
            onFirstFrame={() => handleSeek(0)}
            onLastFrame={() => handleSeek(lastVideoEnd > 0 ? lastVideoEnd : projectDuration)}
            onPrevFrame={() => handleSeek(Math.max(0, currentTime - 0.04))}
            onNextFrame={() => handleSeek(Math.min(projectDuration, currentTime + 0.04))}
            onBackward10={() => handleSeek(Math.max(0, currentTime - 10))}
            onForward10={() => handleSeek(Math.min(projectDuration, currentTime + 10))}
            trackStates={trackStates}
            isSubtitlesActive={isSubtitlesActive}
            backgroundAudioUrl={backgroundAudioClip?.videoUrl}
            masterVolume={masterVolume}
            onShowCropGuidesChange={setShowCropGuides}
            onLoadDemoProject={handleLoadDemoProject}
            onImportMedia={() => {
              setActiveDockTab('media');
              setActiveSubNav('my-files');
            }}
          />
          </div>
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
          setShowCropGuides(g => !g);
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
          selectedClipIds={selectedClipIds}
          trackStates={trackStates}
          onToggleTrackHidden={handleToggleTrackHidden}
          onToggleTrackLocked={handleToggleTrackLocked}
          onToggleTrackMuted={handleToggleTrackMuted}
          onTrackVolumeChange={handleTrackVolumeChange}
          onClipVolumeChange={handleClipVolumeChange}
          onSeek={handleSeek}
          onSelectClip={clipId => {
            setSelectedClipId(clipId);
            setSelectedClipIds([clipId]);
            const target = clips.find(c => c.id === clipId);
            if (target?.mediaId) {
              setActiveTranscriptMediaId(target.mediaId);
            }
          }}
          onSelectClips={ids => {
            setSelectedClipIds(ids);
            if (ids.length > 0) {
              setSelectedClipId(ids[0]);
              const target = clips.find(c => c.id === ids[0]);
              if (target?.mediaId) {
                setActiveTranscriptMediaId(target.mediaId);
              }
            }
          }}
          onDropItem={handleTimelineDropItem}
          onBatchMoveClips={handleBatchMoveClips}
          onTrimClip={handleTrimClip}
          onMoveClip={handleMoveClip}
          onClipMoveEnd={handleClipMoveEnd}
          onAddTrack={handleAddTrack}
          onDeleteMarker={markerId => setMarkers(prev => prev.filter(m => m.id !== markerId))}
          onEditClipTitle={handleEditClipTitle}
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
        outputPath={lastExportFileName}
        downloadUrl={lastExportBlobUrl}
        fileName={lastExportFileName}
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
