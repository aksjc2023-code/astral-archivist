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
  generateDefaultTokensForAsset,
  INITIAL_TOOL_SETTINGS,
  buildPlaybackSegments,
  calculateSkipRanges,
  computeKeepRanges,
  TimeRange,
  getNextValidTime,
  getProjectDuration,
  getClipAtTimelineTime,
  timelineToSourceTime,
  sourceToTimelineTime,
  rippleCutTimeRange,
  restoreAllTokens,
  validateWordToken,
  validateTimelineClip,
  asTimelineSeconds,
  asSourceSeconds,
  asVirtualSeconds,
  asSeconds,
  AspectRatio,
  synthesizeOverdubWavBytes,
  TitleClipData,
  FilterClipData,
  getSummarizedKeyTokenIds,
  predictDisfluentIndices,
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
  StudioCaptureModal,
  IconSparkles,
} from '@astral/ui-editor';

import { transcribeMediaFile, checkWebGpuAvailability } from './services/whisperService';
import {
  exportVideoWithFfmpegWasm,
  exportCompositionWithFfmpegWasm,
  CompositionClipInput,
  AudioTrackInput,
} from './export/wasmExporter';
import { ExportSettings } from '@astral/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useVaultStore } from '../store/useVaultStore';
import { useEditorBridgeStore } from './editorBridge';
import type { VaultItem } from '../types/ipc';
import { formatDurationMs, formatSizeBytes, formatCreationDate } from '../utils/media';

export const ScarletEditorApp: React.FC = () => {
  // Navigation & Workspace State
  const [activeDockTab, setActiveDockTab] = useState<ActivityDockTab>('media');
  const [activeSubNav, setActiveSubNav] = useState<SubNavSection | string>('my-files');
  const [customFolders, setCustomFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [showCropGuides, setShowCropGuides] = useState(false);
  const [lastExportBlobUrl, setLastExportBlobUrl] = useState<string | null>(null);
  const [lastExportFileName, setLastExportFileName] = useState('ScarletCut_Export_2026.mp4');
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureStatus, setCaptureStatus] = useState('');
  const [activeStudioCapture, setActiveStudioCapture] = useState<'record-video' | 'capture-screen' | 'record-audio' | 'quick-video' | null>(null);

  // WebGPU Whisper Live Transcription State
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState('');
  const [transcribePercent, setTranscribePercent] = useState(0);
  const [transcribeFileName, setTranscribeFileName] = useState('');
  const [whisperModel, setWhisperModel] = useState('Xenova/whisper-tiny.en');
  const [webGpuDeviceName, setWebGpuDeviceName] = useState<string | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

  // Detect WebGPU hardware availability on mount
  useEffect(() => {
    checkWebGpuAvailability().then(res => {
      if (res.supported && res.adapterName) {
        setWebGpuDeviceName(res.adapterName);
      }
    });
  }, []);

  // Retain actual File/Blob handles for uploaded assets (to feed Whisper and FFmpeg WASM)
  const fileBlobMapRef = useRef<Map<string, Blob>>(new Map());

  // Media Bin & Transcript State (Clean slate default: zero pre-loaded media or audio)
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [tokensByMedia, setTokensByMedia] = useState<Record<string, WordToken[]>>({});
  const [activeTranscriptMediaId, setActiveTranscriptMediaId] = useState<string>('');
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [markers, setMarkers] = useState<MarkerFlag[]>([]);
  // BUG-25 Fix: Preview unplaced media asset from media bin
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);

  // Project Management State
  const [projectName, setProjectName] = useState('Untitled Project');
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const lastHandledVaultImportIdRef = useRef<string | null>(null);
  const isVaultImportBusyRef = useRef<boolean>(false);
  const didRestoreOnMountRef = useRef<boolean>(false);

  // Playback & Scrubber State
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [timelineScale, setTimelineScale] = useState(1.0);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [selectedClipId, setSelectedClipId] = useState<string | undefined>(undefined);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [trackStates, setTrackStates] = useState<Record<string, { hidden?: boolean; locked?: boolean; muted?: boolean; volume?: number }>>({
    track_effects: { hidden: false, locked: false, muted: false, volume: 100 },
    track_transitions: { hidden: false, locked: false, muted: false, volume: 100 },
    track_stickers: { hidden: false, locked: false, muted: false, volume: 100 },
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
  const [isAcrossCutBoundary, setIsAcrossCutBoundary] = useState(false);

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

  // Asset-scoped skip ranges: only contiguous intervals where words are explicitly marked deleted
  const skipRangesByMediaId = useMemo(() => {
    const map = new Map<string, TimeRange[]>();
    const mediaIds = new Set(clips.map(c => c.mediaId).filter(Boolean) as string[]);
    mediaIds.add('asset_1');
    mediaIds.forEach(id => {
      const assetTokens = tokensByMedia[id] ?? [];
      map.set(id, calculateSkipRanges(assetTokens, id));
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

  // Active title clip strictly derived from title track at currentTime (only visible during clip interval)
  const activeTitleClip = useMemo(() => {
    const titleClips = clips.filter(c => c.trackId === 'track_title');
    return titleClips.find(c => {
      const start = c.timelineStart ?? c.sourceStart ?? 0;
      const dur = c.timelineDuration ?? c.duration ?? 0;
      return currentTime >= start && currentTime <= start + dur;
    });
  }, [clips, currentTime]);

  // Active sticker clip strictly derived from sticker / custom track at currentTime (only visible during clip interval)
  const activeStickerClip = useMemo(() => {
    if (trackStates['track_stickers']?.hidden) return undefined;
    const stickerClips = clips.filter(c =>
      c.trackId === 'track_stickers' ||
      c.trackId === 'track_custom_stickers' ||
      c.trackId.startsWith('track_custom') ||
      c.title.startsWith('★ ')
    );
    return stickerClips.find(c => {
      const start = c.timelineStart ?? c.sourceStart ?? 0;
      const dur = c.timelineDuration ?? c.duration ?? 0;
      return currentTime >= start && currentTime <= start + dur;
    });
  }, [clips, currentTime, trackStates]);

  // Active transition: strictly active during transition cut window
  const currentTransition = useMemo(() => {
    // 1. Check if there is an explicit transition clip on timeline active at currentTime
    if (!trackStates['track_transitions']?.hidden) {
      const transClip = clips.find(c => {
        const isTrans = c.title.startsWith('⧉ ') || (c as any).isTransition || c.trackId === 'track_transitions';
        if (!isTrans) return false;
        const start = c.timelineStart ?? c.sourceStart ?? 0;
        const dur = c.timelineDuration ?? c.duration ?? 0;
        return currentTime >= start && currentTime <= start + dur;
      });
      if (transClip) {
        return (transClip as any).transitionName || transClip.title.replace('⧉ ', '');
      }
    }

    // 2. Check active video clip's transitionIn during entrance window [clipStart, clipStart + transitionWindowSec]
    if (activeClip && activeClip.transitionIn) {
      const clipStart = activeClip.timelineStart ?? activeClip.sourceStart ?? 0;
      const transitionWindowSec = activeClip.transitionDuration ?? 1.2;
      if (currentTime >= clipStart && currentTime <= clipStart + transitionWindowSec) {
        return activeClip.transitionIn;
      }
    }

    // 3. Check active video clip's transitionOut during exit window [clipEnd - transitionWindowSec, clipEnd]
    if (activeClip && activeClip.transitionOut) {
      const clipStart = activeClip.timelineStart ?? activeClip.sourceStart ?? 0;
      const clipDur = activeClip.timelineDuration ?? activeClip.duration ?? 0;
      const clipEnd = clipStart + clipDur;
      const transitionWindowSec = activeClip.transitionDuration ?? 1.2;
      if (currentTime >= clipEnd - transitionWindowSec && currentTime <= clipEnd) {
        return activeClip.transitionOut;
      }
    }

    return undefined;
  }, [clips, activeClip, currentTime]);

  // Active filter strictly scoped to:
  // 1. Any filter clip on the timeline at currentTime, OR
  // 2. The active video clip's specific filter (only while playhead is inside that video clip)
  const currentFilter = useMemo(() => {
    // 1. Check if there is an effect/filter clip active on timeline at currentTime
    if (!trackStates['track_effects']?.hidden) {
      const filterClip = clips.find(c => {
        const isFilter = (c as any).filter || (c as any).isFilter || c.title.startsWith('⚡ ') || c.trackId === 'track_effects';
        if (!isFilter || c.trackId === 'track_video') return false;
        const start = c.timelineStart ?? c.sourceStart ?? 0;
        const dur = c.timelineDuration ?? c.duration ?? 0;
        return currentTime >= start && currentTime <= start + dur;
      });
      if (filterClip) {
        return (filterClip as any).filter || filterClip.title.replace('⚡ ', '');
      }
    }

    // 2. Check if current active video clip has a filter applied (only during its timeline window)
    if (!trackStates['track_video']?.hidden && activeClip && (activeClip as any).filter && (activeClip as any).filter !== 'none') {
      const cStart = activeClip.timelineStart ?? activeClip.sourceStart ?? 0;
      const cDur = activeClip.timelineDuration ?? activeClip.duration ?? 0;
      if (currentTime >= cStart && currentTime <= cStart + cDur) {
        return (activeClip as any).filter;
      }
    }

    return 'none';
  }, [clips, activeClip, currentTime, trackStates]);

  // Push history helper for Undo/Redo across both multi-asset transcripts & timeline clips
  const pushHistory = useCallback((currentTokensByMedia: Record<string, WordToken[]>, currentClips: TimelineClip[]) => {
    setHistoryStack(prev => [...prev.slice(-25), { tokensByMedia: currentTokensByMedia, clips: currentClips }]);
    setRedoStack([]);
  }, []);

  // Ref for debounced history capture during 60fps title gizmo pointer dragging (BUG-06 Fix)
  const titleDragHistorySnapshotRef = useRef<{ tokens: Record<string, WordToken[]>; clips: TimelineClip[] } | null>(null);
  const titleDragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active title data with full isolated state & style preservation (BUG-07 Fix)
  const activeTitleData = useMemo<TitleClipData | undefined>(() => {
    if (!activeTitleClip) return undefined;
    return activeTitleClip.titleData ?? {
      text: activeTitleClip.title,
      stylePreset: activeTitlePreset || 'Cinematic Trailer',
      position: { x: 50, y: 80 },
      fontSize: 22,
      scale: 1.0,
      color: '#FFFFFF',
      alignment: 'center' as const,
    };
  }, [activeTitleClip, activeTitlePreset]);

  const handleUpdateTitleData = useCallback((data: Partial<TitleClipData>) => {
    if (!activeTitleClip) return;
    // BUG-06 Fix: Debounce history push so 60fps pointer move does not flood the 25-state undo stack
    if (!titleDragHistorySnapshotRef.current) {
      titleDragHistorySnapshotRef.current = { tokens: tokensByMedia, clips };
    }
    if (titleDragTimerRef.current) {
      clearTimeout(titleDragTimerRef.current);
    }
    titleDragTimerRef.current = setTimeout(() => {
      if (titleDragHistorySnapshotRef.current) {
        pushHistory(titleDragHistorySnapshotRef.current.tokens, titleDragHistorySnapshotRef.current.clips);
        titleDragHistorySnapshotRef.current = null;
      }
    }, 400);

    setClips(prev => prev.map(c => {
      if (c.id !== activeTitleClip.id) return c;
      const curData = c.titleData ?? {
        text: c.title,
        stylePreset: activeTitlePreset || 'Cinematic Trailer',
        position: { x: 50, y: 80 },
        fontSize: 22,
        scale: 1.0,
        color: '#FFFFFF',
        alignment: 'center' as const,
      };
      const updated: TitleClipData = { ...curData, ...data };
      return {
        ...c,
        title: updated.text || c.title,
        titleData: updated,
      };
    }));
  }, [activeTitleClip, pushHistory, tokensByMedia, clips, activeTitlePreset]);

  const activeFilterClip = useMemo(() => {
    return clips.find(c => {
      const isFilter = (c as any).filter || (c as any).isFilter || c.title.startsWith('⚡ ');
      if (!isFilter || c.trackId === 'track_video') return false;
      const start = c.timelineStart ?? c.sourceStart ?? 0;
      const dur = c.timelineDuration ?? c.duration ?? 0;
      return currentTime >= start && currentTime <= start + dur;
    });
  }, [clips, currentTime]);

  const currentFilterIntensity = useMemo(() => {
    if (activeFilterClip?.filterData?.intensity !== undefined) {
      return activeFilterClip.filterData.intensity;
    }
    if ((activeClip as any)?.filterData?.intensity !== undefined) {
      return (activeClip as any).filterData.intensity;
    }
    return 100;
  }, [activeFilterClip, activeClip]);

  const handleUpdateFilterIntensity = useCallback((intensity: number) => {
    if (activeFilterClip) {
      setClips(prev => prev.map(c => c.id === activeFilterClip.id ? {
        ...c,
        filterData: { ...(c.filterData || { filterName: c.filter || 'none' }), intensity }
      } : c));
    } else if (activeClip && (activeClip as any).filter) {
      setClips(prev => prev.map(c => c.id === activeClip.id ? {
        ...c,
        filterData: { ...(c.filterData || { filterName: (c as any).filter }), intensity }
      } : c));
    }
  }, [activeFilterClip, activeClip]);

  const handleClipTransitionDurationChange = useCallback((clipId: string, durationSec: number) => {
    pushHistory(tokensByMedia, clips);
    setClips(prev => prev.map(c => c.id === clipId ? { ...c, transitionDuration: durationSec } : c));
  }, [pushHistory, tokensByMedia, clips]);

  const handleEditClipTitle = useCallback((clipId: string, newTitle: string) => {
    pushHistory(tokensByMedia, clips);
    setClips(prev => prev.map(c => {
      if (c.id !== clipId) return c;
      const existingData = c.titleData;
      return {
        ...c,
        title: newTitle,
        titleData: existingData
          ? { ...existingData, text: newTitle }
          : {
              text: newTitle,
              stylePreset: activeTitlePreset || 'Cinematic Trailer',
              position: { x: 50, y: 80 },
              fontSize: 22,
              scale: 1.0,
              color: '#FFFFFF',
              alignment: 'center' as const,
            },
      };
    }));
  }, [pushHistory, tokensByMedia, clips, activeTitlePreset]);

  const handleEditActiveTitle = useCallback(() => {
    if (!activeTitleClip) return;
    const curTitle = activeTitleClip.title || 'Title Text';
    const newText = prompt('Edit Title & Caption text:', curTitle);
    if (newText !== null && newText.trim()) {
      handleEditClipTitle(activeTitleClip.id, newText.trim());
    }
  }, [activeTitleClip, handleEditClipTitle]);

  // Exact mapped source offset within the active video clip
  const activeClipSourceTime = useMemo(() => {
    if (!activeClip) return asSourceSeconds(0);
    return timelineToSourceTime(asTimelineSeconds(currentTime), activeClip);
  }, [currentTime, activeClip]);

  // BUG-25 Fix: Fall back to clicked media bin asset if no clip under playhead
  const previewAsset = useMemo(() => {
    return mediaAssets.find(a => a.id === previewAssetId);
  }, [mediaAssets, previewAssetId]);

  const activeVideoUrl = activeClip?.videoUrl ?? previewAsset?.videoUrl;

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

  // Compound Ripple-Cut helper: slices clips intersecting [cutStart, cutEnd], ripples trailing clips,
  // shifts words past cutEnd, and adjusts playhead
  const applyRippleCutTimeRange = useCallback((cutStart: number, cutEnd: number) => {
    if (cutStart >= cutEnd) return;
    const deltaT = Number((cutEnd - cutStart).toFixed(3));

    // 1. Slice and ripple clips across all unlocked tracks
    setClips(prevClips => {
      const updatedClips = rippleCutTimeRange(prevClips, cutStart, cutEnd, {
        isTrackLocked: (trackId) => Boolean(trackStates[trackId]?.locked),
      });
      for (const c of updatedClips) {
        try {
          validateTimelineClip(c);
        } catch {}
      }
      return updatedClips;
    });

    // 2. Ripple timestamps of remaining tokens across current transcript
    setTokensByMedia(prev => {
      const currentList = prev[activeTranscriptMediaId] ?? [];
      const updated = currentList
        .filter(w => !(w.start >= cutStart - 0.01 && w.end <= cutEnd + 0.01 && w.deleted))
        .map(w => {
          if (w.start >= cutEnd - 0.01) {
            const newStart = asSourceSeconds(Math.max(cutStart, Number((w.start - deltaT).toFixed(3))));
            const newEnd = asSourceSeconds(Math.max(cutStart, Number((w.end - deltaT).toFixed(3))));
            return { ...w, start: newStart, end: newEnd };
          }
          return w;
        });
      return { ...prev, [activeTranscriptMediaId]: updated };
    });

    // 3. Adjust playhead if inside cut zone or trailing
    setCurrentTime(prevTime => {
      if (prevTime > cutStart && prevTime <= cutEnd) {
        return cutStart;
      } else if (prevTime > cutEnd) {
        return Math.max(cutStart, Number((prevTime - deltaT).toFixed(3)));
      }
      return prevTime;
    });
  }, [trackStates, activeTranscriptMediaId]);

  // Word Token Cut / Toggle Action (Non-Destructive Skip-List)
  const handleToggleDeleteToken = useCallback((tokenId: string) => {
    const currentList = tokensByMedia[activeTranscriptMediaId] ?? [];
    const targetToken = currentList.find(t => t.id === tokenId);
    if (!targetToken) return;

    pushHistory(tokensByMedia, clips);

    // Toggle deleted state without destructive timeline clip-slicing
    setTokensByMedia(prev => {
      const list = prev[activeTranscriptMediaId] ?? [];
      return {
        ...prev,
        [activeTranscriptMediaId]: list.map(t =>
          t.id === tokenId ? { ...t, deleted: !t.deleted } : t
        ),
      };
    });
  }, [pushHistory, tokensByMedia, clips, activeTranscriptMediaId]);

  // Word Token Multiple Cut Action (Backspace / Range selection)
  const handleToggleDeleteMultipleTokens = useCallback((tokenIds: string[]) => {
    if (tokenIds.length === 0) return;
    const currentList = tokensByMedia[activeTranscriptMediaId] ?? [];
    const idSet = new Set(tokenIds);
    const targetTokens = currentList.filter(t => idSet.has(t.id));
    if (targetTokens.length === 0) return;

    pushHistory(tokensByMedia, clips);

    // Mark tokens as deleted without destructive timeline clip-slicing
    setTokensByMedia(prev => {
      const list = prev[activeTranscriptMediaId] ?? [];
      return {
        ...prev,
        [activeTranscriptMediaId]: list.map(t =>
          idSet.has(t.id) ? { ...t, deleted: true } : t
        ),
      };
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

  // AI Extractive Summarizer: Keep only top ranked key highlight sentences and cut the rest
  const handleSummarizeKeyPoints = useCallback(() => {
    pushHistory(tokensByMedia, clips);
    setTokensByMedia(prev => {
      const currentList = prev[activeTranscriptMediaId] ?? [];
      if (currentList.length <= 8) return prev;
      const keyIds = getSummarizedKeyTokenIds(currentList, 0.5);
      const updated = currentList.map(t => {
        if (t.isPause || t.isFiller) {
          return { ...t, deleted: true };
        }
        return {
          ...t,
          deleted: !keyIds.has(t.id),
        };
      });
      return { ...prev, [activeTranscriptMediaId]: updated };
    });
  }, [pushHistory, tokensByMedia, clips, activeTranscriptMediaId]);

  // LLM-Powered Auto-Clean: detect and soft-delete fumbles, stutters, fillers, and pauses
  const handleAutoClean = useCallback(async () => {
    const currentList = tokensByMedia[activeTranscriptMediaId] ?? [];
    // Spoken tokens for LLM/heuristic disfluency analysis
    const spokenTokens = currentList.filter(t => !t.deleted && !t.isPause);
    // Active pause tokens (>0.5s silence gaps) to be automatically filtered
    const activePauseTokens = currentList.filter(t => !t.deleted && t.isPause);

    if (spokenTokens.length === 0 && activePauseTokens.length === 0) return;

    let flaggedSpokenIds: string[] = [];
    if (spokenTokens.length > 0) {
      const flaggedIndices = await predictDisfluentIndices(spokenTokens);
      flaggedSpokenIds = flaggedIndices
        .map(idx => spokenTokens[idx]?.id)
        .filter((id): id is string => id !== undefined);
    }

    // Combine disfluent word IDs and active pause IDs
    const pauseIds = activePauseTokens.map(p => p.id);
    const allIdsToDelete = Array.from(new Set([...flaggedSpokenIds, ...pauseIds]));

    if (allIdsToDelete.length === 0) return;

    pushHistory(tokensByMedia, clips);

    const idSet = new Set(allIdsToDelete);
    setTokensByMedia(prev => {
      const list = prev[activeTranscriptMediaId] ?? [];
      return {
        ...prev,
        [activeTranscriptMediaId]: list.map(t =>
          idSet.has(t.id) ? { ...t, deleted: true } : t
        ),
      };
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

  // Split clip scissors tool (Scissors Icon / Ctrl+B) - splits selected or playhead clip
  const handleSplitClip = useCallback(() => {
    let targetClip = selectedClipId ? clips.find(c => c.id === selectedClipId) : undefined;
    if (!targetClip) {
      // Auto-detect clip under playhead across video or active tracks
      targetClip = clips.find(c => {
        if (trackStates[c.trackId]?.locked) return false;
        const start = c.timelineStart ?? c.sourceStart ?? asTimelineSeconds(0);
        const dur = c.timelineDuration ?? c.duration ?? asSeconds(0);
        return currentTime > start + 0.05 && currentTime < start + dur - 0.05;
      });
      if (targetClip) {
        setSelectedClipId(targetClip.id);
        setSelectedClipIds([targetClip.id]);
      }
    }

    if (!targetClip) {
      alert('Please position the playhead inside a clip on the timeline to split it.');
      return;
    }

    const start = targetClip.timelineStart ?? targetClip.sourceStart ?? asTimelineSeconds(0);
    const dur = targetClip.timelineDuration ?? targetClip.duration ?? asSeconds(0);

    // Playhead must be inside the clip with 0.05s edge boundary tolerance
    if (currentTime <= start + 0.05 || currentTime >= start + dur - 0.05) {
      alert(`Playhead (${currentTime.toFixed(2)}s) must be positioned inside the clip "${targetClip.title}" (${start.toFixed(2)}s - ${(start + dur).toFixed(2)}s) to split it!`);
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
      transitionIn: undefined, // BUG-05 Fix: Do not inject spurious dissolve transition on split
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

    // BUG-19 Fix: Sync selectedClipIds alongside selectedClipId
    setSelectedClipId(clipB.id);
    setSelectedClipIds([clipB.id]);
  }, [clips, currentTime, pushHistory, tokensByMedia, trackStates, selectedClipId]);

  // Trim clip edges (interactive yellow handles) with track-lock check and collision awareness
  const handleTrimClip = useCallback((clipId: string, side: 'left' | 'right', deltaSec: number) => {
    const target = clips.find(c => c.id === clipId);
    if (!target) return;
    if (trackStates[target.trackId]?.locked) return;

    if (!dragStartClipsRef.current) {
      dragStartClipsRef.current = clips;
      pushHistory(tokensByMedia, clips);
    }
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
        const minDur = 0.3;
        const maxDelta = curDur - minDur; // Min duration 0.3s
        // Guard against extending past previous sibling boundary AND negative sourceIn!
        const maxLeftExtension = c.mediaId ? Math.min(curStart - maxPrevEnd, curIn) : Math.max(0, curStart - maxPrevEnd);
        const appliedDelta = Math.max(-Math.max(0, maxLeftExtension), Math.min(maxDelta, deltaSec));
        const newStart = asTimelineSeconds(Number(Math.max(0, curStart + appliedDelta).toFixed(2)));
        const newDur = asSeconds(Number(Math.max(minDur, curDur - appliedDelta).toFixed(2)));
        const newIn = asSourceSeconds(Number((c.mediaId ? Math.max(0, curIn + appliedDelta) : 0).toFixed(2)));
        const newOut = asSourceSeconds(Number((c.mediaId ? curOut : newDur).toFixed(2)));
        const updated: TimelineClip = {
          ...c,
          timelineStart: newStart,
          timelineDuration: newDur,
          sourceIn: newIn,
          sourceOut: newOut,
          sourceStart: newStart,
          duration: newDur,
        };
        try {
          validateTimelineClip(updated);
        } catch {
          updated.sourceIn = asSourceSeconds(0);
          updated.sourceOut = asSourceSeconds(newDur);
        }
        return updated;
      } else {
        // Guard against extending past next sibling boundary
        const minDur = 0.3;
        const maxPossibleDur = Number.isFinite(minNextStart) ? minNextStart - curStart : Infinity;
        const requestedDur = Math.max(minDur, Number((curDur + deltaSec).toFixed(2)));
        const newDur = asSeconds(Math.min(requestedDur, maxPossibleDur));
        const newIn = asSourceSeconds(Number((c.mediaId ? curIn : 0).toFixed(2)));
        const newOut = asSourceSeconds(Number((c.mediaId ? curIn + newDur : newDur).toFixed(2)));
        const updated: TimelineClip = {
          ...c,
          timelineDuration: newDur,
          sourceIn: newIn,
          sourceOut: newOut,
          duration: newDur,
        };
        try {
          validateTimelineClip(updated);
        } catch {
          updated.sourceIn = asSourceSeconds(0);
          updated.sourceOut = asSourceSeconds(newDur);
        }
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

    // BUG-18 Fix: Allow moving clip freely and reordering past siblings
    const candidateStart = Math.max(0, newStartSec);
    const siblings = baselineClips.filter(c => c.trackId === target.trackId && c.id !== clipId);

    // Magnetic snap within 0.15s of sibling boundaries or origin
    let snappedStart = candidateStart;
    const snapPoints = [0, currentTime];
    siblings.forEach(s => {
      const sStart = s.timelineStart ?? s.sourceStart ?? 0;
      const sDur = s.timelineDuration ?? s.duration ?? 0;
      snapPoints.push(sStart, sStart + sDur);
    });

    for (const pt of snapPoints) {
      if (Math.abs(candidateStart - pt) <= 0.15) {
        snappedStart = pt;
        break;
      }
      if (Math.abs(candidateStart + clipDur - pt) <= 0.15) {
        snappedStart = Math.max(0, pt - clipDur);
        break;
      }
    }

    // Check if dragging past adjacent siblings on video track to reorder
    const isSequentialTrack = target.trackId === 'track_video';
    if (isSequentialTrack && siblings.length > 0) {
      const ordered = [
        ...siblings.map(s => ({ id: s.id, dur: s.timelineDuration ?? s.duration ?? 0, origStart: s.timelineStart ?? 0 })),
        { id: clipId, dur: clipDur, origStart: snappedStart },
      ].sort((a, b) => a.origStart - b.origStart);

      let curPos = 0;
      const newPosMap = new Map<string, number>();
      for (const item of ordered) {
        if (item.id === clipId) {
          newPosMap.set(item.id, snappedStart);
          curPos = Math.max(curPos + item.dur, snappedStart + item.dur);
        } else {
          newPosMap.set(item.id, curPos);
          curPos += item.dur;
        }
      }

      setClips(prev => prev.map(c => {
        if (c.trackId !== target.trackId) return c;
        const newStart = newPosMap.get(c.id);
        if (newStart !== undefined) {
          const rounded = asTimelineSeconds(Number(newStart.toFixed(2)));
          return { ...c, timelineStart: rounded, sourceStart: rounded };
        }
        return c;
      }));
    } else {
      setClips(prev => prev.map(c => {
        if (c.id !== clipId) return c;
        const roundedStart = asTimelineSeconds(Number(snappedStart.toFixed(2)));
        const updated: TimelineClip = {
          ...c,
          timelineStart: roundedStart,
          sourceStart: roundedStart,
        };
        validateTimelineClip(updated);
        return updated;
      }));
    }
  }, [clips, trackStates, currentTime]);

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

  // Batch shift / move multiple selected clips synchronously (BUG-01 Fix: Linear displacement from baseline snapshot)
  const handleBatchMoveClips = useCallback((clipIds: string[], deltaSec: number) => {
    if (!dragStartClipsRef.current) {
      dragStartClipsRef.current = clips;
    }
    const baselineClips = dragStartClipsRef.current;

    setClips(prev => {
      return prev.map(c => {
        if (!clipIds.includes(c.id)) return c;
        if (trackStates[c.trackId]?.locked) return c;
        const initial = baselineClips.find(i => i.id === c.id);
        const baseStart = initial ? (initial.timelineStart ?? initial.sourceStart ?? asTimelineSeconds(0)) : (c.timelineStart ?? c.sourceStart ?? asTimelineSeconds(0));
        const newStart = Math.max(0, Number((baseStart + deltaSec).toFixed(2)));
        const updated: TimelineClip = {
          ...c,
          timelineStart: asTimelineSeconds(newStart),
          sourceStart: asTimelineSeconds(newStart),
        };
        validateTimelineClip(updated);
        return updated;
      });
    });
  }, [trackStates, clips]);

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
        titleData: {
          text: payload.name,
          stylePreset: payload.name,
          position: { x: 50, y: 80 },
          fontSize: 22,
          scale: 1.0,
          color: '#FFFFFF',
          alignment: 'center',
        },
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
        trackId: 'track_stickers',
        title: `★ ${payload.name}`,
        timelineStart: dropTime,
        timelineDuration: dur,
        sourceIn: asSourceSeconds(0),
        sourceOut: asSourceSeconds(dur),
        sourceStart: dropTime,
        duration: dur,
        color: payload.color || '#FA8231',
      };
      validateTimelineClip(newStickerClip);
      setClips(prev => [...prev, newStickerClip]);
      setSelectedClipId(newStickerClip.id);
      setSelectedClipIds([newStickerClip.id]);
      setActiveSticker(payload.name);
    } else if (payload.type === 'transitions') {
      setActiveTransition(payload.name);
      const dur = asSeconds(2.0);
      const newTransClip: TimelineClip = {
        id: `trans_${Date.now()}`,
        trackId: 'track_transitions',
        title: `⧉ ${payload.name}`,
        timelineStart: dropTime,
        timelineDuration: dur,
        sourceIn: asSourceSeconds(0),
        sourceOut: asSourceSeconds(dur),
        sourceStart: dropTime,
        duration: dur,
        transitionDuration: dur,
        color: '#FA8231',
      };
      (newTransClip as any).isTransition = true;
      (newTransClip as any).transitionName = payload.name;
      validateTimelineClip(newTransClip);
      setClips(prev => [...prev, newTransClip]);
      setSelectedClipId(newTransClip.id);
      setSelectedClipIds([newTransClip.id]);
    } else if (payload.type === 'filters') {
      setActiveFilter(payload.name);
      const newFilterClip: TimelineClip = {
        id: `filter_${Date.now()}`,
        trackId: 'track_effects',
        title: `⚡ ${payload.name}`,
        timelineStart: dropTime,
        timelineDuration: asSeconds(4.0),
        sourceIn: asSourceSeconds(0),
        sourceOut: asSourceSeconds(4.0),
        sourceStart: dropTime,
        duration: asSeconds(4.0),
        color: '#EB3B5A',
        filter: payload.name,
        filterData: { filterName: payload.name, intensity: 100 },
      };
      (newFilterClip as any).isFilter = true;
      (newFilterClip as any).filter = payload.name;
      validateTimelineClip(newFilterClip);
      setClips(prev => [...prev, newFilterClip]);
      setSelectedClipId(newFilterClip.id);
      setSelectedClipIds([newFilterClip.id]);
    } else if (payload.type === 'asset' && payload.data) {
      const asset = payload.data as MediaAsset;
      const dur = asSeconds(asset.duration || 10.0);
      const trackId = targetTrackId.startsWith('track_custom')
        ? targetTrackId
        : (asset.type === 'audio' ? 'track_audio' : 'track_video');
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

      // BUG-20 Fix: Ripple shift existing clips if dropTime collides on target track
      const trackClips = clips.filter(c => c.trackId === trackId);
      const hasCollision = trackClips.some(c => {
        const cStart = c.timelineStart ?? c.sourceStart ?? 0;
        const cDur = c.timelineDuration ?? c.duration ?? 0;
        return dropTime < cStart + cDur && dropTime + dur > cStart;
      });

      if (hasCollision) {
        setClips(prev => {
          const shifted = prev.map(c => {
            if (c.trackId !== trackId) return c;
            const cStart = c.timelineStart ?? c.sourceStart ?? 0;
            if (cStart >= dropTime) {
              const newStart = asTimelineSeconds(Number((cStart + dur).toFixed(2)));
              return { ...c, timelineStart: newStart, sourceStart: newStart };
            }
            return c;
          });
          return [...shifted, newClip];
        });
      } else {
        setClips(prev => [...prev, newClip]);
      }

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
      transitionIn: undefined,
    };
    validateTimelineClip(newClip);

    setClips(prev => [...prev, newClip]);
    setSelectedClipId(newClip.id);
    setSelectedClipIds([newClip.id]);
    setMediaAssets(prev => prev.map(a => a.id === asset.id ? { ...a, isUsedOnTimeline: true } : a));
    setCurrentTime(newClip.timelineStart);
  }, [clips, pushHistory, tokensByMedia]);

  // Transcribe any media File/Blob with WebGPU Whisper
  const handleTranscribeMedia = useCallback(async (blob: Blob, asset: MediaAsset) => {
    setIsTranscribing(true);
    setTranscriptionError(null);
    setTranscribeFileName(asset.name);
    setTranscribePercent(5);
    setTranscribeStatus(`Extracting audio & initializing Whisper (${whisperModel.replace('Xenova/', '')})...`);

    try {
      const result = await transcribeMediaFile(blob, asset.id, {
        modelId: whisperModel,
        onProgress: (status, percent) => {
          setTranscribeStatus(status);
          if (percent !== undefined) {
            setTranscribePercent(percent);
          }
        },
        onChunkTokens: partialTokens => {
          if (partialTokens && partialTokens.length > 0) {
            setTokensByMedia(prev => ({
              ...prev,
              [asset.id]: partialTokens,
            }));
            setActiveTranscriptMediaId(asset.id);
          }
        },
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
        recoveryLog: `Transcribed "${asset.name}" via ${result.deviceUsed.toUpperCase()}. Generated ${result.tokens.length} words.`,
      }));

      // Switch to transcript tab so user sees the live words!
      setActiveDockTab('media');
      setActiveSubNav('transcript');
    } catch (err: any) {
      console.error('[Whisper] Transcription error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setTranscriptionError(msg);
    } finally {
      setIsTranscribing(false);
      setTranscribePercent(0);
      setTranscribeStatus('');
    }
  }, [clips, pushHistory, tokensByMedia, whisperModel]);

  // Auto-Save project state debounced to localStorage (state preservation)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (clips.length > 0 || mediaAssets.length > 0) {
          const serialized = JSON.stringify({
            version: '1.0.0',
            appName: 'The Astral Archivist',
            name: projectName,
            savedAt: new Date().toISOString(),
            aspectRatio,
            masterVolume,
            activeFilter,
            toolSettings,
            clips,
            mediaAssets: mediaAssets.map(a => ({
              id: a.id,
              name: a.name,
              type: a.type,
              duration: a.duration,
              category: a.category,
              resolution: a.resolution,
              fileSizeMb: a.fileSizeMb,
              isUsedOnTimeline: a.isUsedOnTimeline,
              locator: a.locator && !a.locator.startsWith('blob:') ? a.locator : undefined,
              videoUrl: a.videoUrl && !a.videoUrl.startsWith('blob:') ? a.videoUrl : undefined,
            })),
            tokensByMedia,
            markers,
          });
          localStorage.setItem('astral_archivist_active_project', serialized);
        }
      } catch (err) {
        console.warn('Auto-save error', err);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [projectName, clips, mediaAssets, tokensByMedia, markers, toolSettings, activeFilter, aspectRatio, masterVolume]);

  // Restore on mount if editor was empty
  useEffect(() => {
    if (didRestoreOnMountRef.current) return;
    didRestoreOnMountRef.current = true;
    try {
      const saved = localStorage.getItem('astral_archivist_active_project');
      if (saved && clips.length === 0 && mediaAssets.length === 0) {
        const parsed = JSON.parse(saved);
        if (parsed.clips && Array.isArray(parsed.clips) && parsed.clips.length > 0) {
          setClips(parsed.clips);
          if (parsed.mediaAssets) setMediaAssets(parsed.mediaAssets);
          if (parsed.tokensByMedia) setTokensByMedia(parsed.tokensByMedia);
          if (parsed.markers) setMarkers(parsed.markers);
          if (parsed.name) setProjectName(parsed.name);
          if (parsed.toolSettings) setToolSettings(parsed.toolSettings);
          if (parsed.activeFilter) setActiveFilter(parsed.activeFilter);
          if (parsed.aspectRatio) setAspectRatio(parsed.aspectRatio);
          setCaptureStatus('Restored previous project session');
          setTimeout(() => setCaptureStatus(''), 2500);
        }
      }
    } catch {}
  }, []);

  // 1. New Project Action
  const handleNewProject = useCallback(() => {
    const hasContent = clips.length > 0 || mediaAssets.length > 0;
    if (hasContent) {
      const confirmNew = window.confirm('Create a new project? All current timeline edits will be cleared.');
      if (!confirmNew) return;
    }
    pushHistory(tokensByMedia, clips);
    setClips([]);
    setMediaAssets([]);
    setTokensByMedia({});
    setMarkers([]);
    setCurrentTime(0);
    setIsPlaying(false);
    setActiveFilter('none');
    setToolSettings(INITIAL_TOOL_SETTINGS);
    setProjectName('Untitled Project');
    setSelectedClipId(undefined);
    setSelectedClipIds([]);
    setPreviewAssetId(null);
    localStorage.removeItem('astral_archivist_active_project');
    setCaptureStatus('✨ New project created!');
    setTimeout(() => setCaptureStatus(''), 2500);
  }, [clips, mediaAssets, tokensByMedia, pushHistory]);

  // 2. Save Project Action
  const handleSaveProject = useCallback(() => {
    const projectData = {
      version: '1.0.0',
      appName: 'The Astral Archivist',
      name: projectName,
      savedAt: new Date().toISOString(),
      aspectRatio,
      masterVolume,
      activeFilter,
      toolSettings,
      clips,
      mediaAssets: mediaAssets.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        duration: a.duration,
        category: a.category,
        resolution: a.resolution,
        fileSizeMb: a.fileSizeMb,
        isUsedOnTimeline: a.isUsedOnTimeline,
        locator: a.locator && !a.locator.startsWith('blob:') ? a.locator : undefined,
        videoUrl: a.videoUrl && !a.videoUrl.startsWith('blob:') ? a.videoUrl : undefined,
      })),
      tokensByMedia,
      markers,
    };

    const serialized = JSON.stringify(projectData, null, 2);
    try {
      localStorage.setItem('astral_archivist_saved_project', serialized);
      localStorage.setItem('astral_archivist_active_project', serialized);
    } catch {}

    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    blobUrlsRef.current.add(url);
    const a = document.createElement('a');
    a.href = url;
    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Project';
    a.download = `${safeName}_${Date.now()}.astral`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
      URL.revokeObjectURL(url);
      blobUrlsRef.current.delete(url);
    }, 15000);

    setCaptureStatus('💾 Project saved successfully!');
    setTimeout(() => setCaptureStatus(''), 2500);
  }, [projectName, aspectRatio, masterVolume, activeFilter, toolSettings, clips, mediaAssets, tokensByMedia, markers]);

  // 3. Open Project Action
  const handleOpenProjectFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object') {
          alert('Invalid project file format.');
          return;
        }
        pushHistory(tokensByMedia, clips);
        if (Array.isArray(data.clips)) setClips(data.clips);
        if (Array.isArray(data.mediaAssets)) setMediaAssets(data.mediaAssets);
        if (data.tokensByMedia && typeof data.tokensByMedia === 'object') setTokensByMedia(data.tokensByMedia);
        if (Array.isArray(data.markers)) setMarkers(data.markers);
        if (data.toolSettings) setToolSettings(data.toolSettings);
        if (data.activeFilter) setActiveFilter(data.activeFilter);
        if (data.aspectRatio) setAspectRatio(data.aspectRatio);
        if (data.masterVolume !== undefined) setMasterVolume(data.masterVolume);
        if (data.name) setProjectName(data.name);
        setCurrentTime(0);
        setIsPlaying(false);
        setSelectedClipId(undefined);
        setSelectedClipIds([]);

        setCaptureStatus(`📂 Loaded project: "${data.name || file.name}"`);
        setTimeout(() => setCaptureStatus(''), 3000);
      } catch (parseErr) {
        alert('Failed to read project file. Please ensure it is a valid .astral or .json file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [pushHistory, tokensByMedia, clips]);

  const handleAddFolder = useCallback((name: string) => {
    const id = `folder_custom_${Date.now()}`;
    setCustomFolders(prev => [...prev, { id, name }]);
    setActiveSubNav(id);
  }, []);

  const handleDeleteFolder = useCallback((folderId: string) => {
    setCustomFolders(prev => prev.filter(f => f.id !== folderId));
    if (activeSubNav === folderId) {
      setActiveSubNav('my-files');
    }
  }, [activeSubNav]);

  const [isVaultImportModalOpen, setIsVaultImportModalOpen] = useState(false);
  const { recordings: vaultRecordings } = useVaultStore();

  const handleImportVaultItem = useCallback(async (item: VaultItem, andPlaceOnTimeline: boolean = true) => {
    const assetId = `vault_asset_${item.id}`;

    // Check if clip is already on timeline
    const alreadyOnTimeline = clips.some(c => c.mediaId === assetId);

    // Check if already in media assets
    const existing = mediaAssets.find(a => a.id === assetId);
    if (existing) {
      if (andPlaceOnTimeline && !alreadyOnTimeline) {
        handleAddToTimeline(existing);
      } else if (alreadyOnTimeline) {
        const existingClip = clips.find(c => c.mediaId === assetId);
        if (existingClip) {
          setSelectedClipId(existingClip.id);
          setSelectedClipIds([existingClip.id]);
          setCurrentTime(existingClip.timelineStart ?? existingClip.sourceStart ?? 0);
        }
      }
      setActiveTranscriptMediaId(existing.id);
      setActiveDockTab('media');
      setActiveSubNav('my-files');
      return;
    }

    let url = '';
    try {
      url = convertFileSrc(item.filepath);
    } catch {
      url = item.filepath;
    }

    let rawBlob: Blob | null = null;
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        rawBlob = await resp.blob();
      }
    } catch (fetchErr) {
      console.warn('Direct fetch on vault asset failed, attempting file path', fetchErr);
    }

    if (rawBlob) {
      fileBlobMapRef.current.set(assetId, rawBlob);
    }

    const durationSec = Math.max(1, (item.duration_ms || 1000) / 1000);
    const isVid = !item.filepath.endsWith('.m4a') && (item.width > 0 || !item.filepath.endsWith('.mp3'));

    const newAsset: MediaAsset = {
      id: assetId,
      name: item.title || 'Vault Recording',
      type: isVid ? 'video' : 'audio',
      duration: asSeconds(durationSec),
      thumbnailUrl: item.thumbnail_path ? convertFileSrc(item.thumbnail_path) : 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=400&q=80',
      locator: url,
      videoUrl: url,
      isUsedOnTimeline: andPlaceOnTimeline,
      resolution: isVid ? `${item.width || 1920}x${item.height || 1080}` : undefined,
      category: 'Saved Vault',
      fileSizeMb: Number(((item.file_size_bytes || 0) / (1024 * 1024)).toFixed(1)),
    };

    setMediaAssets(prev => {
      if (prev.some(a => a.id === newAsset.id)) return prev;
      return [newAsset, ...prev];
    });
    setActiveTranscriptMediaId(newAsset.id);

    if (andPlaceOnTimeline && !alreadyOnTimeline) {
      handleAddToTimeline(newAsset);
    }

    setActiveDockTab('media');
    setActiveSubNav('my-files');
  }, [mediaAssets, clips, handleAddToTimeline]);

  // Check pending import from Library "Open in Editor" (BUG FIX: Strict atomic mutex & deduplication)
  const pendingImportItem = useEditorBridgeStore(state => state.pendingImportItem);
  const setPendingImportItem = useEditorBridgeStore(state => state.setPendingImportItem);

  useEffect(() => {
    if (!pendingImportItem) return;
    const item = pendingImportItem;
    // Synchronously clear bridge store so subsequent renders don't trigger again
    setPendingImportItem(null);

    // Prevent duplicate triggers if already importing this item or lock is active
    if (lastHandledVaultImportIdRef.current === item.id || isVaultImportBusyRef.current) {
      return;
    }
    lastHandledVaultImportIdRef.current = item.id;
    isVaultImportBusyRef.current = true;

    // Reset lock after 2.5 seconds
    setTimeout(() => {
      if (lastHandledVaultImportIdRef.current === item.id) {
        lastHandledVaultImportIdRef.current = null;
      }
    }, 2500);

    handleImportVaultItem(item, true).finally(() => {
      isVaultImportBusyRef.current = false;
    });
  }, [pendingImportItem, setPendingImportItem, handleImportVaultItem]);

  // Real File Drag-and-Drop or Picker handling with tracked blob URLs (BUG-21 Fix: supports placement on drop)
  const handleFilesAdded = useCallback(async (
    fileList: File[],
    timelinePlacement?: { dropTime: number; trackId: string }
  ) => {
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
      const isImg = f.type.startsWith('image') || f.name.endsWith('.png') || f.name.endsWith('.jpg') || f.name.endsWith('.jpeg') || f.name.endsWith('.webp');
      const assetId = `asset_upload_${Date.now()}_${idx}`;

      // Probe true duration & dimensions from media container (BUG-14 Fix: WebM Infinity duration & image probing)
      const { probedDuration, width, height } = await new Promise<{
        probedDuration: number;
        width: number;
        height: number;
      }>(resolve => {
        if (isImg) {
          const img = new Image();
          img.onload = () => resolve({ probedDuration: 5.0, width: img.naturalWidth || 1920, height: img.naturalHeight || 1080 });
          img.onerror = () => resolve({ probedDuration: 5.0, width: 1920, height: 1080 });
          img.src = url;
          return;
        }

        const el = document.createElement(isVid ? 'video' : 'audio');
        el.preload = 'metadata';
        el.src = url;

        let hasResolved = false;
        const finish = (duration: number) => {
          if (hasResolved) return;
          hasResolved = true;
          resolve({
            probedDuration: Number.isFinite(duration) && duration > 0 ? duration : 15.0,
            width: isVid ? (el as HTMLVideoElement).videoWidth || 1920 : 0,
            height: isVid ? (el as HTMLVideoElement).videoHeight || 1080 : 0,
          });
        };

        el.onloadedmetadata = () => {
          // Chromium WebM MediaRecorder quirk: duration is Infinity until seeked to end
          if (el.duration === Infinity) {
            const onSeeked = () => {
              el.removeEventListener('seeked', onSeeked);
              const finiteDur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : (el.currentTime > 0 ? el.currentTime : 15.0);
              el.currentTime = 0;
              finish(finiteDur);
            };
            el.addEventListener('seeked', onSeeked);
            el.currentTime = 1e10;
            setTimeout(() => {
              el.removeEventListener('seeked', onSeeked);
              finish(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 15.0);
            }, 1000);
            return;
          }
          finish(el.duration);
        };
        el.onerror = () => finish(15.0);
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

    // BUG-21 Fix: If explicit timeline placement is requested from timeline drag-and-drop
    if (timelinePlacement && newAssets.length > 0) {
      let currentDropTime = asTimelineSeconds(timelinePlacement.dropTime);
      const placedClips: TimelineClip[] = [];
      for (const asset of newAssets) {
        const isAud = asset.type === 'audio';
        const targetTrack = timelinePlacement.trackId.startsWith('track_custom')
          ? timelinePlacement.trackId
          : (isAud ? 'track_audio' : 'track_video');
        const newClip: TimelineClip = {
          id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          trackId: targetTrack,
          title: asset.name,
          timelineStart: currentDropTime,
          timelineDuration: asset.duration,
          sourceIn: asSourceSeconds(0),
          sourceOut: asSourceSeconds(asset.duration),
          sourceStart: currentDropTime,
          duration: asset.duration,
          color: isAud ? '#10AC84' : '#4B6584',
          mediaId: asset.id,
          locator: asset.videoUrl,
          videoUrl: asset.videoUrl,
          isSelected: true,
          hasWaveform: true,
        };
        validateTimelineClip(newClip);
        placedClips.push(newClip);
        asset.isUsedOnTimeline = true;
        currentDropTime = asTimelineSeconds(currentDropTime + asset.duration);
      }
      setClips(prev => [...prev, ...placedClips]);
      if (placedClips[0]) {
        setSelectedClipId(placedClips[0].id);
        setSelectedClipIds(placedClips.map(c => c.id));
      }
    } else if (clips.length === 0 && newAssets.length > 0) {
      const first = newAssets[0]!;
      const isAud = first.type === 'audio';
      const newClip: TimelineClip = {
        id: `clip_${Date.now()}`,
        trackId: isAud ? 'track_audio' : 'track_video',
        title: first.name,
        timelineStart: asTimelineSeconds(0),
        timelineDuration: first.duration,
        sourceIn: asSourceSeconds(0),
        sourceOut: asSourceSeconds(first.duration),
        sourceStart: asTimelineSeconds(0),
        duration: first.duration,
        color: isAud ? '#10AC84' : '#4B6584',
        mediaId: first.id,
        locator: first.videoUrl,
        videoUrl: first.videoUrl,
        isSelected: true,
        hasWaveform: true,
      };
      validateTimelineClip(newClip);
      setClips([newClip]);
      setSelectedClipId(newClip.id);
      setSelectedClipIds([newClip.id]);
      setCurrentTime(0);
      first.isUsedOnTimeline = true;
    }

    // Do NOT create fake/dummy default transcripts. Real speech tokens will come from Whisper ASR.

    // Automatically set primary asset for transcript and navigate to My Files (or stay in folder)
    const primaryAsset = newAssets[0];
    if (primaryAsset) {
      setActiveTranscriptMediaId(primaryAsset.id);
    }
    setActiveDockTab('media');
    if (activeSubNav === 'import') {
      setActiveSubNav('my-files');
    }
  }, [activeSubNav, customFolders, clips]);

  // Quick Capture Studio Launcher
  const handleQuickCapture = useCallback((
    action: 'record-video' | 'capture-screen' | 'record-audio' | 'quick-video'
  ) => {
    if (!navigator.mediaDevices) {
      window.alert('Media devices API is not available in this browser.');
      return;
    }
    setActiveStudioCapture(action);
  }, []);

  // Studio Capture Completion Handler
  const handleStudioCaptureComplete = useCallback((file: File, options?: { durationSec: number }) => {
    setActiveStudioCapture(null);
    handleFilesAdded([file]);
    setCaptureStatus(`Captured ${options?.durationSec ?? 0}s media saved to My Files`);
    window.setTimeout(() => setCaptureStatus(''), 2500);
  }, [handleFilesAdded]);

  // Remove imported file from media library and cleanup memory
  const handleDeleteAsset = useCallback((asset: MediaAsset) => {
    // 1. Remove from mediaAssets
    setMediaAssets(prev => prev.filter(a => a.id !== asset.id));

    // 2. Remove raw File from fileBlobMapRef
    fileBlobMapRef.current.delete(asset.id);

    // 3. Remove tokens
    setTokensByMedia(prev => {
      const next = { ...prev };
      delete next[asset.id];
      return next;
    });

    // 4. Revoke object URL if created
    if (asset.locator && asset.locator.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(asset.locator);
        blobUrlsRef.current.delete(asset.locator);
      } catch {}
    }

    // 5. Remove any timeline clips associated with this asset
    setClips(prev => {
      const filtered = prev.filter(c => c.mediaId !== asset.id);
      return filtered;
    });

    // 6. If currently active preview asset was deleted, fallback to first available
    if (activeMediaId === asset.id || previewAssetId === asset.id) {
      const remaining = mediaAssets.filter(a => a.id !== asset.id);
      if (remaining.length > 0) {
        const nextAsset = remaining[0]!;
        setPreviewAssetId(nextAsset.id);
        setActiveTranscriptMediaId(nextAsset.id);
      }
    }
  }, [activeMediaId, previewAssetId, mediaAssets]);

  // On-demand transcribe button trigger for active video
  const handleTranscribeCurrentMedia = useCallback(async () => {
    let blob = fileBlobMapRef.current.get(activeMediaId);
    let asset = mediaAssets.find(a => a.id === activeMediaId);

    if (!blob) {
      if (!activeVideoUrl) {
        setIsTranscribing(false);
        alert('No media file loaded to transcribe.');
        return;
      }
      setTranscribeStatus('Fetching media file stream...');
      setIsTranscribing(true);
      setTranscribePercent(2);
      try {
        const resp = await fetch(activeVideoUrl);
        if (resp.ok) {
          blob = await resp.blob();
          fileBlobMapRef.current.set(activeMediaId, new File([blob], asset?.name ?? 'video.mp4', { type: 'video/mp4' }));
        }
      } catch (err) {
        console.warn('Failed to fetch media blob from URL', err);
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

  // Real FFmpeg WASM Video Exporter handler - exports the full timeline composition
  const handleStartExport = useCallback(async (
    exportSettings: ExportSettings,
    callbacks: { onProgress: (percent: number, stage: string, log?: string) => void }
  ) => {
    const activeVideoClips = clips
      .filter(c => c.trackId === 'track_video')
      .sort((a, b) => (a.timelineStart ?? 0) - (b.timelineStart ?? 0));

    callbacks.onProgress(5, `Preparing ${activeVideoClips.length || 1} timeline video clip(s) for WASM export...`);

    const clipInputs: CompositionClipInput[] = [];

    for (let i = 0; i < activeVideoClips.length; i++) {
      const c = activeVideoClips[i]!;
      let cBlob = c.mediaId ? fileBlobMapRef.current.get(c.mediaId) : undefined;
      if (!cBlob && c.videoUrl) {
        try {
          const resp = await fetch(c.videoUrl);
          if (resp.ok) cBlob = await resp.blob();
        } catch {}
      }
      if (cBlob) {
        const sIn = Number((c.sourceIn ?? 0).toFixed(2));
        const sDur = Number((c.timelineDuration ?? c.duration ?? 5.0).toFixed(2));
        const sOut = Number((c.sourceOut ?? (sIn + sDur)).toFixed(2));

        // Non-destructive skip list export: compute keep ranges from deleted words
        const mediaTokens = c.mediaId ? tokensByMedia[c.mediaId] : undefined;
        let clipSegments: PlaybackSegment[] | undefined;
        if (mediaTokens && mediaTokens.length > 0) {
          const skips = calculateSkipRanges(mediaTokens, c.mediaId);
          if (skips.length > 0) {
            const keeps = computeKeepRanges(sOut, skips);
            const activeKeeps = keeps
              .map(k => ({
                start: Math.max(sIn, k.start),
                end: Math.min(sOut, k.end),
              }))
              .filter(k => k.end - k.start > 0.02);

            if (activeKeeps.length > 0) {
              let curVirt = 0;
              clipSegments = activeKeeps.map((k, idx) => {
                const dur = Number((k.end - k.start).toFixed(3));
                const seg: PlaybackSegment = {
                  id: `seg_${c.id}_${idx}`,
                  mediaId: c.mediaId || 'clip',
                  sourceStart: asSourceSeconds(k.start),
                  sourceEnd: asSourceSeconds(k.end),
                  virtualStart: asVirtualSeconds(curVirt),
                  virtualEnd: asVirtualSeconds(curVirt + dur),
                  duration: asSeconds(dur),
                };
                curVirt += dur;
                return seg;
              });
            }
          }
        }

        clipInputs.push({
          blob: cBlob,
          sourceIn: sIn,
          sourceOut: sOut,
          duration: sDur,
          mediaId: c.mediaId,
          segments: clipSegments,
        });
      }
    }

    if (clipInputs.length === 0) {
      alert('Unable to load video media buffer for export. Please ensure at least one video clip is on the timeline.');
      return;
    }

    // BUG-03 Fix: Compute composition tokens with accurate cumulative timeline positioning
    const compositionTokens: WordToken[] = [];
    let accumulatedTimelineTime = 0;
    for (const c of activeVideoClips) {
      const sIn = Number((c.sourceIn ?? 0).toFixed(2));
      const sDur = Number((c.timelineDuration ?? c.duration ?? 5.0).toFixed(2));
      const sOut = Number((c.sourceOut ?? (sIn + sDur)).toFixed(2));
      const mediaTokens = c.mediaId ? tokensByMedia[c.mediaId] : undefined;
      if (mediaTokens && mediaTokens.length > 0) {
        for (const tok of mediaTokens) {
          if (tok.deleted) continue;
          if (tok.end >= sIn && tok.start <= sOut) {
            const clampedStart = Math.max(sIn, tok.start);
            const clampedEnd = Math.min(sOut, tok.end);
            const globalStart = accumulatedTimelineTime + (clampedStart - sIn);
            const globalEnd = accumulatedTimelineTime + (clampedEnd - sIn);
            compositionTokens.push({
              ...tok,
              start: asSourceSeconds(Number(globalStart.toFixed(2))),
              end: asSourceSeconds(Number(globalEnd.toFixed(2))),
            });
          }
        }
      }
      accumulatedTimelineTime += sDur;
    }

    // BUG-04 Fix: Collect and multiplex Background Audio Track (Track 3)
    const audioInputs: AudioTrackInput[] = [];
    const isAudioTrackMuted = Boolean(trackStates['track_audio']?.muted);
    const audioTrackVolume = ((trackStates['track_audio']?.volume ?? 100) / 100);

    if (!isAudioTrackMuted) {
      const activeAudioClips = clips
        .filter(c => c.trackId === 'track_audio' || c.trackId.startsWith('track_audio') || (c as any).isAudioTrack)
        .sort((a, b) => (a.timelineStart ?? 0) - (b.timelineStart ?? 0));

      for (let j = 0; j < activeAudioClips.length; j++) {
        const aClip = activeAudioClips[j]!;
        let aBlob = aClip.mediaId ? fileBlobMapRef.current.get(aClip.mediaId) : undefined;
        if (!aBlob) {
          const fetchUrl = aClip.videoUrl || aClip.locator;
          if (fetchUrl) {
            try {
              const resp = await fetch(fetchUrl);
              if (resp.ok) aBlob = await resp.blob();
            } catch {}
          }
        }
        if (aBlob) {
          const aStart = Number((aClip.timelineStart ?? aClip.sourceStart ?? 0).toFixed(2));
          const aDur = Number((aClip.timelineDuration ?? aClip.duration ?? 10.0).toFixed(2));
          const aIn = Number((aClip.sourceIn ?? 0).toFixed(2));
          const aOut = Number((aClip.sourceOut ?? (aIn + aDur)).toFixed(2));
          audioInputs.push({
            blob: aBlob,
            timelineStart: aStart,
            duration: aDur,
            sourceIn: aIn,
            sourceOut: aOut,
            volume: audioTrackVolume,
          });
        }
      }
    }

    try {
      const targetExtMatch = exportSettings.outputPath?.match(/\.([a-zA-Z0-9]+)$/);
      const targetExt = targetExtMatch ? targetExtMatch[1]!.toLowerCase() : 'mp4';
      const requestedFormat = (targetExt === 'mp3' ? 'MP3' : targetExt === 'webm' ? 'WebM' : targetExt === 'gif' ? 'GIF' : targetExt === 'mov' ? 'MOV' : 'MP4') as any;
      const baseName = (exportSettings.title || 'ScarletCut_Export').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${baseName}.${targetExt}`;

      const result = await exportCompositionWithFfmpegWasm(
        clipInputs,
        compositionTokens.length > 0 ? compositionTokens : tokens,
        {
          mode: exportSettings.wasmMode === 'stream-copy' ? 'stream-copy' : 'filter-complex-ass',
          includeSubtitles: true,
          resolution: exportSettings.resolution,
          aspectRatio,
          format: requestedFormat,
          outputFilename: fileName,
          audioInputs,
          activeFilter: currentFilter !== 'none' ? currentFilter : undefined,
          activeFilterIntensity: currentFilterIntensity,
          colorAdjustments: toolSettings.colorAdjustments,
          rotationAngle,
          activeTransition: currentTransition,
          activeTransitionDuration: activeClip?.transitionDuration || 1.2,
          activeTitle: activeTitleClip?.title,
          activeTitleData,
          activeSticker: activeStickerClip ? activeStickerClip.title.replace(/^★\s*/, '') : undefined,
          onProgress: p => {
            callbacks.onProgress(p.percent, p.stage, p.log);
            if (p.memfsAllocatedMb !== undefined) {
              setTelemetry(prev => ({ ...prev, memfsHeapMb: p.memfsAllocatedMb ?? 0 }));
            }
          },
        }
      );

      // Retain blob URL for Export Ready dialog (BUG-26 Fix: do not double-download automatically)
      if (lastExportBlobUrl) {
        try {
          URL.revokeObjectURL(lastExportBlobUrl);
        } catch {}
      }
      const downloadUrl = URL.createObjectURL(result.outputBlob);
      blobUrlsRef.current.add(downloadUrl);
      setLastExportBlobUrl(downloadUrl);
      setLastExportFileName(fileName);
    } finally {
      setTelemetry(prev => ({ ...prev, memfsHeapMb: 0 }));
    }
  }, [clips, tokens, tokensByMedia, trackStates, lastExportBlobUrl, aspectRatio]);

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
      pushHistory(tokensByMedia, clips);
      setActiveFilter(effectName);
      const newFilterClip: TimelineClip = {
        id: `filter_${Date.now()}`,
        trackId: 'track_effects',
        title: `⚡ ${effectName}`,
        timelineStart: asTimelineSeconds(Number(currentTime.toFixed(2))),
        timelineDuration: asSeconds(4.0),
        sourceIn: asSourceSeconds(0),
        sourceOut: asSourceSeconds(4.0),
        sourceStart: asTimelineSeconds(Number(currentTime.toFixed(2))),
        duration: asSeconds(4.0),
        color: '#EB3B5A',
        filter: effectName,
        filterData: { filterName: effectName, intensity: 100 },
      };
      (newFilterClip as any).isFilter = true;
      (newFilterClip as any).filter = effectName;
      validateTimelineClip(newFilterClip);
      setClips(prev => [...prev, newFilterClip]);
      setSelectedClipId(newFilterClip.id);
      setSelectedClipIds([newFilterClip.id]);
    } else if (activeDockTab === 'titles') {
      pushHistory(tokensByMedia, clips);
      setActiveTitlePreset(effectName);
      const newTitleClip: TimelineClip = {
        id: `title_${Date.now()}`,
        trackId: 'track_title',
        title: effectName,
        timelineStart: asTimelineSeconds(Number(currentTime.toFixed(2))),
        timelineDuration: asSeconds(4.0),
        sourceIn: asSourceSeconds(0),
        sourceOut: asSourceSeconds(4.0),
        sourceStart: asTimelineSeconds(Number(currentTime.toFixed(2))),
        duration: asSeconds(4.0),
        color: '#8854D0',
        titleData: {
          text: effectName,
          stylePreset: effectName,
          position: { x: 50, y: 80 },
          fontSize: 22,
          scale: 1.0,
          color: '#FFFFFF',
          alignment: 'center',
        },
      };
      validateTimelineClip(newTitleClip);
      setClips(prev => [...prev, newTitleClip]);
      setSelectedClipId(newTitleClip.id);
      setSelectedClipIds([newTitleClip.id]);
    } else if (activeDockTab === 'transitions') {
      pushHistory(tokensByMedia, clips);
      setActiveTransition(effectName);
      const dur = asSeconds(2.0);
      const newTransClip: TimelineClip = {
        id: `trans_${Date.now()}`,
        trackId: 'track_transitions',
        title: `⧉ ${effectName}`,
        timelineStart: asTimelineSeconds(Number(currentTime.toFixed(2))),
        timelineDuration: dur,
        sourceIn: asSourceSeconds(0),
        sourceOut: asSourceSeconds(dur),
        sourceStart: asTimelineSeconds(Number(currentTime.toFixed(2))),
        duration: dur,
        transitionDuration: dur,
        color: '#FA8231',
      };
      (newTransClip as any).isTransition = true;
      (newTransClip as any).transitionName = effectName;
      validateTimelineClip(newTransClip);
      setClips(prev => [...prev, newTransClip]);
      setSelectedClipId(newTransClip.id);
      setSelectedClipIds([newTransClip.id]);
    } else if (activeDockTab === 'stickers') {
      pushHistory(tokensByMedia, clips);
      setActiveSticker(effectName);
      const newStickerClip: TimelineClip = {
        id: `sticker_${Date.now()}`,
        trackId: 'track_stickers',
        title: `★ ${effectName}`,
        timelineStart: asTimelineSeconds(Number(currentTime.toFixed(2))),
        timelineDuration: asSeconds(4.0),
        sourceIn: asSourceSeconds(0),
        sourceOut: asSourceSeconds(4.0),
        sourceStart: asTimelineSeconds(Number(currentTime.toFixed(2))),
        duration: asSeconds(4.0),
        color: '#FF7F50',
      };
      validateTimelineClip(newStickerClip);
      setClips(prev => [...prev, newStickerClip]);
      setSelectedClipId(newStickerClip.id);
      setSelectedClipIds([newStickerClip.id]);
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

  // Unified seek coordinator: leaps over deleted word skip-ranges
  const handleSeek = useCallback((targetTime: number) => {
    let finalTime = targetTime;
    const targetTimeline = asTimelineSeconds(targetTime);
    const currentClip = getClipAtTimelineTime(targetTimeline, clips, 'track_video')
      ?? clips.find(c => c.trackId === 'track_video');

    if (currentClip) {
      const clipMediaId = currentClip.mediaId ?? 'asset_1';
      const skipRanges = skipRangesByMediaId.get(clipMediaId) ?? [];

      if (skipRanges.length > 0) {
        const sourcePos = timelineToSourceTime(targetTimeline, currentClip);
        for (const range of skipRanges) {
          if (sourcePos >= range.start && sourcePos < range.end) {
            finalTime = sourceToTimelineTime(asSourceSeconds(range.end), currentClip);
            setTelemetry(prev => ({
              ...prev,
              recoveryLog: `[SKIP SEEK] Non-destructive leap across deleted word range [${range.start.toFixed(2)}s - ${range.end.toFixed(2)}s] to ${finalTime.toFixed(2)}s.`,
            }));
            break;
          }
        }
      }
    }
    setCurrentTime(Math.max(0, Math.min(projectDuration, finalTime)));
  }, [clips, skipRangesByMediaId, projectDuration]);

  // Playback Frame Loop: STRICTLY STOPPED WHEN PAUSED + LEAPS ACROSS SKIP RANGES
  useEffect(() => {
    if (!isPlaying) return; // Completely STOP loop when paused to eliminate re-renders!

    let animationFrameId: number;
    let lastTimestamp = performance.now();

    const loop = (timestamp: number) => {
      const deltaSec = ((timestamp - lastTimestamp) / 1000) * playbackSpeed;
      lastTimestamp = timestamp;

      let didLeap = false;
      let leapLog = '';

      setCurrentTime(prevTime => {
        let rawNext = prevTime + deltaSec;

        // Transcript non-destructive skip list:
        // Evaluated strictly against the active clip's media asset skip ranges
        const targetTimeline = asTimelineSeconds(rawNext);
        const currentClip = getClipAtTimelineTime(targetTimeline, clips, 'track_video')
          ?? clips.find(c => c.trackId === 'track_video');

        if (currentClip) {
          const clipMediaId = currentClip.mediaId ?? 'asset_1';
          const skipRanges = skipRangesByMediaId.get(clipMediaId) ?? [];

          if (skipRanges.length > 0) {
            const sourcePos = timelineToSourceTime(targetTimeline, currentClip);
            const LOOKAHEAD_SEC = 0.030;
            for (const range of skipRanges) {
              if (sourcePos >= range.start - LOOKAHEAD_SEC && sourcePos < range.end) {
                const leapSec = range.end - sourcePos;
                rawNext = rawNext + Math.max(0, leapSec);
                didLeap = true;
                leapLog = `[SKIP PLAYBACK] Immediate leap across deleted word range [${range.start.toFixed(2)}s - ${range.end.toFixed(2)}s] to ${rawNext.toFixed(2)}s.`;
                break;
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

      if (didLeap) {
        setIsAcrossCutBoundary(true);
        setTimeout(() => setIsAcrossCutBoundary(false), 80);
        setTelemetry(prev => ({
          ...prev,
          recoveryLog: leapLog,
        }));
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, projectDuration, lastVideoEnd, playbackSpeed, clips, skipRangesByMediaId]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.isContentEditable ||
          target.closest('[contenteditable="true"]') ||
          target.closest('input') ||
          target.closest('textarea')
        )
      ) {
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

  // Synchronized source-time position for active transcript asset
  const effectiveTranscriptCurrentTime = useMemo(() => {
    const linkedClip = clips.find(c => c.mediaId === activeTranscriptMediaId && c.trackId === 'track_video')
      ?? activeClip;
    if (linkedClip && linkedClip.mediaId === activeTranscriptMediaId) {
      return timelineToSourceTime(asTimelineSeconds(currentTime), linkedClip);
    }
    return currentTime;
  }, [clips, activeTranscriptMediaId, activeClip, currentTime]);

  // Synchronized playhead seek from transcript word click (source -> timeline)
  const handleTranscriptSeek = useCallback((sourceTime: number) => {
    const linkedClip = clips.find(c => c.mediaId === activeTranscriptMediaId && c.trackId === 'track_video')
      ?? activeClip;
    if (linkedClip && linkedClip.mediaId === activeTranscriptMediaId) {
      const targetTimeline = sourceToTimelineTime(asSourceSeconds(sourceTime), linkedClip);
      handleSeek(targetTimeline);
    } else {
      handleSeek(sourceTime);
    }
  }, [clips, activeTranscriptMediaId, activeClip, handleSeek]);

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
            onDownloadAll={handleSaveProject}
            customFolders={customFolders}
            onAddFolder={handleAddFolder}
            onDeleteFolder={handleDeleteFolder}
          />
        )}

        {/* Zone 3: Center Workspace Viewport */}
        <div style={{ flex: 1, backgroundColor: '#181B20', overflow: 'hidden', position: 'relative' }}>
          {activeDockTab === 'media' && activeSubNav === 'transcript' ? (
            /* View B: Transcript Storyboard */
            <TranscriptEditorView
              tokens={tokens}
              currentTime={effectiveTranscriptCurrentTime}
              mediaAssets={mediaAssets}
              activeMediaId={activeTranscriptMediaId}
              onSelectMediaId={setActiveTranscriptMediaId}
              onToggleDeleteToken={handleToggleDeleteToken}
              onToggleDeleteMultipleTokens={handleToggleDeleteMultipleTokens}
              onRestoreAllTokens={handleRestoreAll}
              onEditTokenText={handleEditTokenText}
              onSeekToTime={handleTranscriptSeek}
              onTranscribeCurrentMedia={handleTranscribeCurrentMedia}
              onFastGenerateTranscript={handleFastGenerateTranscript}
              isTranscribing={isTranscribing}
              whisperModel={whisperModel}
              onSelectWhisperModel={setWhisperModel}
              webGpuDeviceName={webGpuDeviceName}
              transcriptionError={transcriptionError}
              onClearTranscriptionError={() => setTranscriptionError(null)}
              onSummarizeKeyPoints={handleSummarizeKeyPoints}
              onAutoClean={handleAutoClean}
            />
          ) : activeDockTab === 'media' && activeSubNav === 'import' ? (
            /* View C: Import Dropzone with Real Files */
            <ImportDropzoneView
              onFilesAdded={handleFilesAdded}
              onQuickAction={handleQuickCapture}
              onOpenSavedVaultModal={() => setIsVaultImportModalOpen(true)}
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
            /* View A: My Files / Folder-filtered Media Grid */
            <MediaGridView
              assets={mediaAssets}
              categoryFilter={
                customFolders.some(f => f.id === activeSubNav)
                  ? customFolders.find(f => f.id === activeSubNav)?.name ?? null
                  : null
              }
              title={
                customFolders.find(f => f.id === activeSubNav)?.name
                  ?? 'My Files'
              }
              onSelectAsset={asset => {
                setPreviewAssetId(asset.id);
                setActiveTranscriptMediaId(asset.id);
                const linkedClip = clips.find(c => c.mediaId === asset.id);
                if (linkedClip) {
                  handleSeek(linkedClip.timelineStart ?? linkedClip.sourceStart ?? 0);
                  setSelectedClipId(linkedClip.id);
                  setSelectedClipIds([linkedClip.id]);
                }
              }}
              onAddToTimeline={handleAddToTimeline}
              onDeleteAsset={handleDeleteAsset}
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
          {/* Player Header Bar with Project Controls & Quick Export */}
          <div
            style={{
              height: '42px',
              backgroundColor: '#181B20',
              borderBottom: '1px solid #2B303A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
              flexShrink: 0,
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              <input
                id="input-project-name"
                data-testid="input-project-name"
                type="text"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                title="Click to rename project"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid #343B48',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  width: '130px',
                  outline: 'none',
                  transition: 'border-color 0.15s ease',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#168BFF')}
                onBlur={e => (e.currentTarget.style.borderColor = '#343B48')}
              />
              <span style={{ fontSize: '10px', color: '#636E7B', fontFamily: "'JetBrains Mono', monospace" }}>
                ({aspectRatio})
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              {/* Hidden file input for Open Project */}
              <input
                ref={projectFileInputRef}
                id="file-input-open-project"
                data-testid="file-input-open-project"
                type="file"
                accept=".astral,.json"
                style={{ display: 'none' }}
                onChange={handleOpenProjectFile}
              />

              <button
                id="btn-new-project"
                data-testid="btn-new-project"
                type="button"
                onClick={handleNewProject}
                title="Create a new clean project"
                style={{
                  backgroundColor: '#22262E',
                  color: '#D2DAE2',
                  border: '1px solid #343B48',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = '#168BFF';
                  (e.currentTarget as HTMLElement).style.color = '#FFFFFF';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = '#343B48';
                  (e.currentTarget as HTMLElement).style.color = '#D2DAE2';
                }}
              >
                <span>+ New</span>
              </button>

              <button
                id="btn-open-project"
                data-testid="btn-open-project"
                type="button"
                onClick={() => projectFileInputRef.current?.click()}
                title="Open saved project (.astral / .json)"
                style={{
                  backgroundColor: 'rgba(22, 139, 255, 0.12)',
                  color: '#168BFF',
                  border: '1px solid rgba(22, 139, 255, 0.4)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(22, 139, 255, 0.22)';
                  (e.currentTarget as HTMLElement).style.borderColor = '#168BFF';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(22, 139, 255, 0.12)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(22, 139, 255, 0.4)';
                }}
              >
                <span>📂 Open</span>
              </button>

              <button
                id="btn-save-project"
                data-testid="btn-save-project"
                type="button"
                onClick={handleSaveProject}
                title="Save project file to device (.astral)"
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  color: '#F59E0B',
                  border: '1px solid rgba(245, 158, 11, 0.5)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(245, 158, 11, 0.25)';
                  (e.currentTarget as HTMLElement).style.borderColor = '#F59E0B';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245, 158, 11, 0.5)';
                }}
              >
                <span>💾 Save</span>
              </button>

              <button
                id="btn-export-top-right"
                data-testid="btn-export-top-right"
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                style={{
                  backgroundColor: '#168BFF',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 14px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(22, 139, 255, 0.4)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#329AFF')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#168BFF')}
              >
                Export
              </button>
            </div>
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
            isAcrossCutBoundary={isAcrossCutBoundary}
            playbackSpeed={playbackSpeed}
            onPlaybackSpeedChange={setPlaybackSpeed}
            rotationAngle={rotationAngle}
            activeFilter={currentFilter}
            activeFilterIntensity={currentFilterIntensity}
            onUpdateFilterIntensity={handleUpdateFilterIntensity}
            colorAdjustments={toolSettings.colorAdjustments}
            toolSettings={toolSettings}
            activeTitle={activeTitleClip?.title}
            activeTitleData={activeTitleData}
            onUpdateTitleData={handleUpdateTitleData}
            activeSticker={activeStickerClip ? activeStickerClip.title.replace(/^★\s*/, '') : undefined}
            activeTransition={currentTransition}
            activeTransitionDuration={activeClip?.transitionDuration || 1.2}
            onEditActiveTitle={handleEditActiveTitle}
            onClearActiveTitle={() => {
              setActiveTitlePreset(undefined);
              if (activeTitleClip) {
                setClips(prev => prev.filter(c => c.id !== activeTitleClip.id));
              }
            }}
            onClearActiveFilter={() => setActiveFilter('none')}
            onClearActiveSticker={() => {
              setActiveSticker(undefined);
              if (activeStickerClip) {
                setClips(prev => prev.filter(c => c.id !== activeStickerClip.id));
              }
            }}
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
            onImportMedia={() => {
              setActiveDockTab('media');
              setActiveSubNav('my-files');
            }}
            onBrowseFilesSelected={handleFilesAdded}
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
          onFilesDropped={async (files, dropTime, trackId) => {
            await handleFilesAdded(files, { dropTime, trackId });
          }}
          onBatchMoveClips={handleBatchMoveClips}
          onTrimClip={handleTrimClip}
          onMoveClip={handleMoveClip}
          onClipMoveEnd={handleClipMoveEnd}
          onAddTrack={handleAddTrack}
          onDeleteMarker={markerId => setMarkers(prev => prev.filter(m => m.id !== markerId))}
          onEditClipTitle={handleEditClipTitle}
          onClipTransitionDurationChange={handleClipTransitionDurationChange}
          tokens={tokens}
          onToggleDeleteToken={handleToggleDeleteToken}
          onEditTokenText={handleEditTokenText}
          onSeekToSourceTime={handleTranscriptSeek}
          onScaleChange={setTimelineScale}
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

      {/* Professional Studio Capture Modal (Webcam, Screen, Mic Audio, Quick Video) */}
      {activeStudioCapture && (
        <StudioCaptureModal
          isOpen={!!activeStudioCapture}
          captureType={activeStudioCapture}
          onClose={() => setActiveStudioCapture(null)}
          onComplete={handleStudioCaptureComplete}
        />
      )}

      {/* Fault Simulator Bar */}
      <FaultSimulatorBar
        isOpen={isFaultSimulatorOpen}
        onClose={() => setIsFaultSimulatorOpen(false)}
        telemetry={telemetry}
        onTriggerFailureMode={handleTriggerFailureMode}
      />

      {/* Saved Vault Media Ingestion Modal (Select single or multiple saved recordings) */}
      {isVaultImportModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            zIndex: 99998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setIsVaultImportModalOpen(false)}
        >
          <div
            style={{
              width: '680px',
              maxHeight: '80vh',
              backgroundColor: '#181B20',
              border: '1px solid #F59E0B',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 30px rgba(245, 158, 11, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #2B303A', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: '#FFFFFF' }}>
                  Import from Saved Vault Recordings
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#A4B0BE' }}>
                  Select one or more archives to import into your Editor workspace and timeline
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsVaultImportModalOpen(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#A4B0BE',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '6px',
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#FFFFFF')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#A4B0BE')}
              >
                ✕
              </button>
            </div>

            {/* List of Vault Recordings */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '50vh', paddingRight: '4px' }}>
              {vaultRecordings.length === 0 ? (
                <div style={{ padding: '36px 0', textAlign: 'center', color: '#636E7B', fontSize: '13px' }}>
                  No saved recordings in the Vault Library yet. Capture screen or mic in Studio first.
                </div>
              ) : (
                vaultRecordings.map(item => {
                  const isAlreadyImported = mediaAssets.some(a => a.id === `vault_asset_${item.id}`);
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        backgroundColor: '#22262E',
                        borderRadius: '10px',
                        border: '1px solid #2B303A',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: '48px',
                            height: '36px',
                            borderRadius: '6px',
                            backgroundColor: '#111317',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {item.thumbnail_path ? (
                            <img
                              src={convertFileSrc(item.thumbnail_path)}
                              alt={item.title}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <span style={{ fontSize: '18px' }}>🎥</span>
                          )}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.title}
                          </div>
                          <div style={{ fontSize: '11px', color: '#A4B0BE', marginTop: '2px' }}>
                            {formatDurationMs(item.duration_ms)} • {formatSizeBytes(item.file_size_bytes)} • {formatCreationDate(item.created_at)}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => {
                            handleImportVaultItem(item, true);
                            setIsVaultImportModalOpen(false);
                          }}
                          style={{
                            backgroundColor: '#F59E0B',
                            color: '#0B0F19',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 14px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease',
                          }}
                          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#FBBF24')}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#F59E0B')}
                        >
                          {isAlreadyImported ? 'Open on Timeline' : '+ Import to Timeline'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '10px', borderTop: '1px solid #2B303A' }}>
              <button
                type="button"
                onClick={() => setIsVaultImportModalOpen(false)}
                style={{
                  backgroundColor: '#2C313C',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '7px 16px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
