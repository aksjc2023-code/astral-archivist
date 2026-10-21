import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  WordToken,
  MediaAsset,
  TimelineClip,
  MarkerFlag,
  ToolSettings,
  TelemetryState,
  ActivityDockTab,
  SubNavSection,
  FailureMode,
  INITIAL_MEDIA_ASSETS,
  INITIAL_WORD_TOKENS,
  INITIAL_TIMELINE_CLIPS,
  INITIAL_MARKERS,
  INITIAL_TOOL_SETTINGS,
  buildPlaybackSegments,
  getNextValidTime,
  getProjectDuration,
  getClipAtTimelineTime,
  timelineToSourceTime,
  purgeFillersAndPauses,
  restoreAllTokens,
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
} from '@astral/ui-editor';

export const App: React.FC = () => {
  // Navigation & Workspace State
  const [activeDockTab, setActiveDockTab] = useState<ActivityDockTab>('media');
  const [activeSubNav, setActiveSubNav] = useState<SubNavSection>('my-files');

  // Media Bin & Transcript State
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(INITIAL_MEDIA_ASSETS);
  const [tokens, setTokens] = useState<WordToken[]>(INITIAL_WORD_TOKENS);
  const [clips, setClips] = useState<TimelineClip[]>(INITIAL_TIMELINE_CLIPS);
  const [markers, setMarkers] = useState<MarkerFlag[]>(INITIAL_MARKERS);

  // Playback & Scrubber State
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [timelineScale, setTimelineScale] = useState(1.0);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [selectedClipId, setSelectedClipId] = useState<string | undefined>('clip_video_1');

  // Tool Drawer & Visual Filter State
  const [toolSettings, setToolSettings] = useState<ToolSettings>(INITIAL_TOOL_SETTINGS);
  const [activeFilter, setActiveFilter] = useState<string>('none');
  const [rotationAngle, setRotationAngle] = useState(0);

  // Undo / Redo History Stacks
  const [historyStack, setHistoryStack] = useState<{ tokens: WordToken[]; clips: TimelineClip[] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ tokens: WordToken[]; clips: TimelineClip[] }[]>([]);

  // Modals & Overlays
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExportReadyOpen, setIsExportReadyOpen] = useState(false);
  const [isFaultSimulatorOpen, setIsFaultSimulatorOpen] = useState(false);
  const [isSeekLocked, setIsSeekLocked] = useState(false);

  // Ref to retain and cleanup seek-lock timeout
  const seekLockTimeoutRef = useRef<number | null>(null);

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

  // Calculate real-time PlaybackSegments using 85ms coalescing
  const rebuildResult = useMemo(() => {
    return buildPlaybackSegments(tokens);
  }, [tokens]);

  // Composition project duration derived cleanly from maximum clip boundary
  const projectDuration = useMemo(() => {
    return getProjectDuration(clips, 30.0);
  }, [clips]);

  // Active video clip dynamically linked to whichever clip is currently under timeline playhead
  const activeClip = useMemo(() => {
    return getClipAtTimelineTime(currentTime, clips, 'track_video') ?? clips.find(c => c.trackId === 'track_video');
  }, [clips, currentTime]);

  // Exact mapped source offset within the active video clip
  const activeClipSourceTime = useMemo(() => {
    if (!activeClip) return 0;
    return timelineToSourceTime(currentTime, activeClip);
  }, [currentTime, activeClip]);

  const activeVideoUrl = activeClip?.videoUrl ?? 'https://www.w3schools.com/html/mov_bbb.mp4';

  // Update telemetry metrics whenever segments rebuild
  useEffect(() => {
    setTelemetry(prev => ({
      ...prev,
      rippleRebuildMs: rebuildResult.rebuildLatencyMs,
      timeSavedSec: rebuildResult.timeSavedSec,
    }));
  }, [rebuildResult]);

  // Push history helper for Undo/Redo across both transcript & timeline clips
  const pushHistory = useCallback((currentTokens: WordToken[], currentClips: TimelineClip[]) => {
    setHistoryStack(prev => [...prev.slice(-25), { tokens: currentTokens, clips: currentClips }]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyStack.length === 0) return;
    const previous = historyStack[historyStack.length - 1];
    if (previous) {
      setRedoStack(r => [...r, { tokens, clips }]);
      setTokens(previous.tokens);
      setClips(previous.clips);
      setHistoryStack(h => h.slice(0, -1));
    }
  }, [historyStack, tokens, clips]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    if (next) {
      setHistoryStack(h => [...h, { tokens, clips }]);
      setTokens(next.tokens);
      setClips(next.clips);
      setRedoStack(r => r.slice(0, -1));
    }
  }, [redoStack, tokens, clips]);

  // Word Token Cut / Toggle Action (Ripple Editing)
  const handleToggleDeleteToken = useCallback((tokenId: string) => {
    pushHistory(tokens, clips);
    setTokens(prev =>
      prev.map(t => (t.id === tokenId ? { ...t, deleted: !t.deleted } : t))
    );
  }, [pushHistory, tokens, clips]);

  // 1-Click Purge Fillers & Pauses (>0.5s)
  const handlePurgeFillers = useCallback(() => {
    pushHistory(tokens, clips);
    const result = purgeFillersAndPauses(tokens);
    setTokens(result.updatedTokens);
  }, [pushHistory, tokens, clips]);

  // Restore all cut tokens
  const handleRestoreAll = useCallback(() => {
    pushHistory(tokens, clips);
    setTokens(restoreAllTokens(tokens));
  }, [pushHistory, tokens, clips]);

  // Inline TTS Word Replacement (Softablitz A2)
  const handleEditTokenText = useCallback((tokenId: string, newText: string) => {
    pushHistory(tokens, clips);
    setTokens(prev =>
      prev.map(t => (t.id === tokenId ? { ...t, text: newText, isEdited: true } : t))
    );
  }, [pushHistory, tokens, clips]);

  // Split clip scissors tool (Scissors Icon / Ctrl+B)
  const handleSplitClip = useCallback(() => {
    const targetClip = clips.find(c => {
      if (c.trackId !== 'track_video') return false;
      const start = c.timelineStart ?? c.sourceStart ?? 0;
      const dur = c.timelineDuration ?? c.duration ?? 0;
      return currentTime > start + 0.2 && currentTime < start + dur - 0.2;
    });

    if (!targetClip) {
      alert(`Playhead (${currentTime.toFixed(2)}s) must be inside a video clip to split it!`);
      return;
    }

    pushHistory(tokens, clips);

    const clipStart = targetClip.timelineStart ?? targetClip.sourceStart ?? 0;
    const clipDur = targetClip.timelineDuration ?? targetClip.duration ?? 0;
    const clipIn = targetClip.sourceIn ?? 0;
    const clipOut = targetClip.sourceOut ?? (clipIn + clipDur);

    const splitOffset = Number((currentTime - clipStart).toFixed(2));
    const durationB = Number((clipDur - splitOffset).toFixed(2));

    const sourceInA = clipIn;
    const sourceOutA = Number((clipIn + splitOffset).toFixed(2));
    const sourceInB = sourceOutA;
    const sourceOutB = clipOut;

    const clipA: TimelineClip = {
      ...targetClip,
      id: `${targetClip.id}_a_${Date.now()}`,
      timelineStart: clipStart,
      timelineDuration: splitOffset,
      sourceIn: sourceInA,
      sourceOut: sourceOutA,
      sourceStart: clipStart,
      duration: splitOffset,
      isSelected: false,
    };

    const clipB: TimelineClip = {
      ...targetClip,
      id: `${targetClip.id}_b_${Date.now()}`,
      timelineStart: Number(currentTime.toFixed(2)),
      timelineDuration: durationB,
      sourceIn: sourceInB,
      sourceOut: sourceOutB,
      sourceStart: Number(currentTime.toFixed(2)),
      duration: durationB,
      isSelected: true,
      transitionIn: '][',
    };

    setClips(prev => {
      const idx = prev.findIndex(c => c.id === targetClip.id);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated.splice(idx, 1, clipA, clipB);
      return updated;
    });

    setSelectedClipId(clipB.id);
  }, [clips, currentTime, pushHistory, tokens]);

  // Trim clip edges (interactive yellow handles)
  const handleTrimClip = useCallback((clipId: string, side: 'left' | 'right', deltaSec: number) => {
    pushHistory(tokens, clips);
    setClips(prev => prev.map(c => {
      if (c.id !== clipId) return c;
      const curStart = c.timelineStart ?? c.sourceStart ?? 0;
      const curDur = c.timelineDuration ?? c.duration ?? 0;
      const curIn = c.sourceIn ?? 0;
      const curOut = c.sourceOut ?? (curIn + curDur);

      if (side === 'left') {
        const maxDelta = curDur - 0.5; // Min duration 0.5s
        const appliedDelta = Math.max(-curStart, Math.min(maxDelta, deltaSec));
        const newStart = Number((curStart + appliedDelta).toFixed(2));
        const newDur = Number((curDur - appliedDelta).toFixed(2));
        const newIn = Number((curIn + appliedDelta).toFixed(2));
        return {
          ...c,
          timelineStart: newStart,
          timelineDuration: newDur,
          sourceIn: newIn,
          sourceOut: curOut,
          sourceStart: newStart,
          duration: newDur,
        };
      } else {
        const newDur = Math.max(0.5, Number((curDur + deltaSec).toFixed(2)));
        const newOut = Number((curIn + newDur).toFixed(2));
        return {
          ...c,
          timelineDuration: newDur,
          sourceOut: newOut,
          duration: newDur,
        };
      }
    }));
  }, [clips, pushHistory, tokens]);

  // Add Track Interaction
  const handleAddTrack = useCallback(() => {
    const customTracks = clips.filter(c => c.trackId.startsWith('track_custom'));
    const trackNum = customTracks.length + 1;
    const newClip: TimelineClip = {
      id: `clip_custom_${Date.now()}`,
      trackId: `track_custom_${trackNum}`,
      title: `Track ${trackNum} Overlay`,
      timelineStart: 0,
      timelineDuration: 15.0,
      sourceIn: 0,
      sourceOut: 15.0,
      sourceStart: 0,
      duration: 15.0,
      color: '#FFA502',
    };
    setClips(prev => [...prev, newClip]);
    setSelectedClipId(newClip.id);
  }, [clips]);

  // Delete Selection (Del Key / Trash Icon)
  const handleDeleteSelected = useCallback(() => {
    if (selectedClipId) {
      const clipToDelete = clips.find(c => c.id === selectedClipId);
      if (clipToDelete) {
        pushHistory(tokens, clips);
        setClips(prev => prev.filter(c => c.id !== selectedClipId));
        setSelectedClipId(undefined);
        return;
      }
    }

    const currentToken = tokens.find(t => !t.deleted && currentTime >= t.start && currentTime <= t.end);
    if (currentToken) {
      handleToggleDeleteToken(currentToken.id);
    }
  }, [selectedClipId, clips, tokens, currentTime, handleToggleDeleteToken, pushHistory]);

  // Add Asset from Media Bin to Timeline
  const handleAddToTimeline = useCallback((asset: MediaAsset) => {
    pushHistory(tokens, clips);

    const videoClips = clips.filter(c => c.trackId === 'track_video');
    const lastEnd = videoClips.reduce((max, c) => {
      const start = c.timelineStart ?? c.sourceStart ?? 0;
      const dur = c.timelineDuration ?? c.duration ?? 0;
      return Math.max(max, start + dur);
    }, 0);

    const newClip: TimelineClip = {
      id: `clip_v_${Date.now()}`,
      trackId: 'track_video',
      title: asset.name,
      timelineStart: Number(lastEnd.toFixed(2)),
      timelineDuration: asset.duration,
      sourceIn: 0,
      sourceOut: asset.duration,
      sourceStart: Number(lastEnd.toFixed(2)),
      duration: asset.duration,
      color: '#4B6584',
      mediaId: asset.id,
      locator: asset.locator ?? asset.videoUrl ?? 'https://www.w3schools.com/html/mov_bbb.mp4',
      videoUrl: asset.videoUrl ?? 'https://www.w3schools.com/html/mov_bbb.mp4',
      isSelected: true,
      hasWaveform: true,
      transitionIn: videoClips.length > 0 ? '][' : undefined,
    };

    setClips(prev => [...prev, newClip]);
    setSelectedClipId(newClip.id);
    setMediaAssets(prev => prev.map(a => a.id === asset.id ? { ...a, isUsedOnTimeline: true } : a));
    setCurrentTime(newClip.timelineStart);
  }, [clips, pushHistory, tokens]);

  // Real File Drag-and-Drop or Picker handling
  const handleFilesAdded = useCallback((fileList: File[]) => {
    const newAssets: MediaAsset[] = fileList.map((f, idx) => {
      const url = URL.createObjectURL(f);
      const isVid = f.type.startsWith('video') || f.name.endsWith('.mp4') || f.name.endsWith('.mov') || f.name.endsWith('.webm');
      const isAud = f.type.startsWith('audio') || f.name.endsWith('.mp3') || f.name.endsWith('.wav');
      return {
        id: `asset_upload_${Date.now()}_${idx}`,
        name: f.name,
        type: isVid ? 'video' : isAud ? 'audio' : 'image',
        duration: 10.0,
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
    setActiveSubNav('my-files');
  }, []);

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
      pushHistory(tokens, clips);
      const newTitleClip: TimelineClip = {
        id: `title_${Date.now()}`,
        trackId: 'track_title',
        title: `TT ${effectName}`,
        timelineStart: Number(currentTime.toFixed(2)),
        timelineDuration: 8.0,
        sourceIn: 0,
        sourceOut: 8.0,
        sourceStart: Number(currentTime.toFixed(2)),
        duration: 8.0,
        color: '#8854D0',
      };
      setClips(prev => [...prev, newTitleClip]);
      setSelectedClipId(newTitleClip.id);
    } else {
      alert(`Applied effect: ${effectName}!`);
    }
  }, [activeDockTab, currentTime, pushHistory, tokens, clips]);

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

  // Playback Frame Loop: STRICTLY STOPPED WHEN PAUSED
  useEffect(() => {
    if (!isPlaying) return; // Completely STOP loop when paused to eliminate re-renders!

    let animationFrameId: number;
    let lastTimestamp = performance.now();

    const loop = (timestamp: number) => {
      const deltaSec = ((timestamp - lastTimestamp) / 1000) * playbackSpeed;
      lastTimestamp = timestamp;

      setCurrentTime(prevTime => {
        const rawNext = prevTime + deltaSec;

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
  }, [isPlaying, projectDuration, playbackSpeed]);

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
              onToggleDeleteToken={handleToggleDeleteToken}
              onPurgeFillers={handlePurgeFillers}
              onRestoreAllTokens={handleRestoreAll}
              onEditTokenText={handleEditTokenText}
              onSeekToTime={t => setCurrentTime(t)}
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
                  setCurrentTime(linkedClip.timelineStart ?? linkedClip.sourceStart ?? 0);
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
            onSeek={t => setCurrentTime(t)}
            onAspectRatioChange={setAspectRatio}
            onFirstFrame={() => setCurrentTime(0)}
            onLastFrame={() => setCurrentTime(projectDuration)}
            onPrevFrame={() => setCurrentTime(Math.max(0, currentTime - 0.04))}
            onNextFrame={() => setCurrentTime(Math.min(projectDuration, currentTime + 0.04))}
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
        onOpenColorTool={() => {
          setActiveDockTab('tools');
        }}
        onOpenEqualizerTool={() => {
          setActiveDockTab('tools');
        }}
        onToggleSubtitles={() => {
          alert('Burned-in ASS subtitles active.');
        }}
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
          onSeek={t => setCurrentTime(t)}
          onSelectClip={setSelectedClipId}
          onTrimClip={handleTrimClip}
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
      />

      <ExportReadyDialog
        isOpen={isExportReadyOpen}
        onClose={() => setIsExportReadyOpen(false)}
        outputPath="C:\Users\movavi\Desktop\ScarletCut_Export.mp4"
      />

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
