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
  const [historyStack, setHistoryStack] = useState<{ tokens: WordToken[]; clips: TimelineClip[] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ tokens: WordToken[]; clips: TimelineClip[] }[]>([]);

  // Timeline & Playhead State
  const [currentTime, setCurrentTime] = useState(0.0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineScale, setTimelineScale] = useState(1.0);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [selectedClipId, setSelectedClipId] = useState<string | undefined>('clip_video_1');
  const [clips, setClips] = useState<TimelineClip[]>(INITIAL_TIMELINE_CLIPS);
  const [markers, setMarkers] = useState<MarkerFlag[]>(INITIAL_MARKERS);

  // Video Player Speed, Rotation & Active Filter
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [activeFilter, setActiveFilter] = useState<string>('none');

  // Tools & Modals State
  const [toolSettings, setToolSettings] = useState<ToolSettings>(INITIAL_TOOL_SETTINGS);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExportReadyOpen, setIsExportReadyOpen] = useState(false);
  const [isFaultSimulatorOpen, setIsFaultSimulatorOpen] = useState(false);
  const [isSeekLocked, setIsSeekLocked] = useState(false);

  // Telemetry State (Webster Victory Tier)
  const [telemetry, setTelemetry] = useState<TelemetryState>({
    searchLatencyMs: 0.02,
    rippleRebuildMs: 0.28,
    memfsHeapMb: 142,
    memfsMaxMb: 2048,
    timeSavedSec: 4.25,
    activeFailureMode: 'none',
    recoveryLog: 'System healthy. Zero SSR runtime active.',
  });

  // Calculate real-time PlaybackSegments using 85ms coalescing
  const rebuildResult = useMemo(() => {
    return buildPlaybackSegments(tokens);
  }, [tokens]);

  // Project duration based on timeline clips & tokens
  const totalClipsDuration = useMemo(() => {
    const videoClips = clips.filter(c => c.trackId === 'track_video');
    return videoClips.reduce((max, c) => Math.max(max, c.sourceStart + c.duration), 0);
  }, [clips]);

  const activeDuration = rebuildResult.totalVirtualDuration > 0
    ? Math.min(rebuildResult.totalVirtualDuration, Math.max(30.0, totalClipsDuration))
    : Math.max(30.0, totalClipsDuration);

  // Active video URL dynamically linked to whichever clip is currently under playhead
  const activeVideoUrl = useMemo(() => {
    const playingClip = clips.find(
      c => c.trackId === 'track_video' && currentTime >= c.sourceStart && currentTime <= c.sourceStart + c.duration
    ) ?? clips.find(c => c.trackId === 'track_video');

    return playingClip?.videoUrl ?? 'https://www.w3schools.com/html/mov_bbb.mp4';
  }, [clips, currentTime]);

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
    const targetClip = clips.find(
      c => c.trackId === 'track_video' && currentTime > c.sourceStart + 0.2 && currentTime < c.sourceStart + c.duration - 0.2
    );

    if (!targetClip) {
      alert(`Playhead (${currentTime.toFixed(2)}s) must be inside a video clip to split it!`);
      return;
    }

    pushHistory(tokens, clips);

    const durationA = Number((currentTime - targetClip.sourceStart).toFixed(2));
    const durationB = Number((targetClip.duration - durationA).toFixed(2));

    const clipA: TimelineClip = {
      ...targetClip,
      id: `${targetClip.id}_a_${Date.now()}`,
      duration: durationA,
      isSelected: false,
    };

    const clipB: TimelineClip = {
      ...targetClip,
      id: `${targetClip.id}_b_${Date.now()}`,
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

  // Delete Selection (Del Key / Trash Icon)
  const handleDeleteSelected = useCallback(() => {
    // 1. If a clip on the timeline is selected, delete it
    if (selectedClipId) {
      const clipToDelete = clips.find(c => c.id === selectedClipId);
      if (clipToDelete) {
        pushHistory(tokens, clips);
        setClips(prev => prev.filter(c => c.id !== selectedClipId));
        setSelectedClipId(undefined);
        return;
      }
    }

    // 2. Otherwise delete the word token under playhead
    const currentToken = tokens.find(t => !t.deleted && currentTime >= t.start && currentTime <= t.end);
    if (currentToken) {
      handleToggleDeleteToken(currentToken.id);
    }
  }, [selectedClipId, clips, tokens, currentTime, handleToggleDeleteToken, pushHistory]);

  // Add Asset from Media Bin to Timeline
  const handleAddToTimeline = useCallback((asset: MediaAsset) => {
    pushHistory(tokens, clips);

    const videoClips = clips.filter(c => c.trackId === 'track_video');
    const lastEnd = videoClips.reduce((max, c) => Math.max(max, c.sourceStart + c.duration), 0);

    const newClip: TimelineClip = {
      id: `clip_v_${Date.now()}`,
      trackId: 'track_video',
      title: asset.name,
      sourceStart: Number(lastEnd.toFixed(2)),
      duration: asset.duration,
      color: '#4B6584',
      mediaId: asset.id,
      videoUrl: asset.videoUrl ?? 'https://www.w3schools.com/html/mov_bbb.mp4',
      isSelected: true,
      hasWaveform: true,
      transitionIn: videoClips.length > 0 ? '][' : undefined,
    };

    setClips(prev => [...prev, newClip]);
    setSelectedClipId(newClip.id);
    setMediaAssets(prev => prev.map(a => a.id === asset.id ? { ...a, isUsedOnTimeline: true } : a));
    setCurrentTime(newClip.sourceStart);
  }, [clips, pushHistory, tokens]);

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

  // Fault Simulator Trigger
  const handleTriggerFailureMode = useCallback((mode: FailureMode) => {
    if (mode === 'seek-lock') {
      setIsSeekLocked(true);
      setTelemetry(prev => ({
        ...prev,
        activeFailureMode: 'seek-lock',
        recoveryLog: '[SELF-HEALING GUARD] Engaged isSeekingRef mutex. Hardware decoder race condition throttled cleanly.',
      }));
      setTimeout(() => setIsSeekLocked(false), 2000);
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

  // 60FPS Playback Frame Loop with O(log N) Binary Search Leap & Speed Multiplier
  useEffect(() => {
    let animationFrameId: number;
    let lastTimestamp = performance.now();

    const loop = (timestamp: number) => {
      const deltaSec = ((timestamp - lastTimestamp) / 1000) * playbackSpeed;
      lastTimestamp = timestamp;

      if (isPlaying) {
        setCurrentTime(prevTime => {
          const rawNext = prevTime + deltaSec;

          // If past virtual duration, pause and loop back
          if (rawNext >= activeDuration) {
            setIsPlaying(false);
            return 0;
          }

          // Leaping across cut intervals using O(log N) binary search
          const jumpEval = getNextValidTime(rawNext, rebuildResult.segments);
          if (jumpEval.didJump) {
            setIsSeekLocked(true);
            setTimeout(() => setIsSeekLocked(false), 80);
            return jumpEval.nextTime;
          }

          return rawNext;
        });
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, activeDuration, rebuildResult.segments, playbackSpeed]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid hotkeys when typing in text inputs
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(p => !p);
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSplitClip();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleSplitClip, handleDeleteSelected]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#111317',
        overflow: 'hidden',
        color: '#FFFFFF',
      }}
    >
      {/* Top Split Workspace (60% Height) */}
      <div style={{ display: 'flex', flex: '1 1 60%', minHeight: 0, overflow: 'hidden' }}>
        {/* Zone 1: Far-Left Primary Activity Dock */}
        <ActivityDock
          activeTab={activeDockTab}
          onTabChange={tab => {
            setActiveDockTab(tab);
            if (tab === 'media') setActiveSubNav('my-files');
            if (tab === 'tools') setActiveSubNav('my-files');
          }}
        />

        {/* Zone 2: Collapsible Sub-Navigation Tree */}
        <SubNavSidebar
          activeSection={activeSubNav}
          onSectionChange={sec => {
            setActiveSubNav(sec);
            if (sec === 'import') setActiveDockTab('media');
          }}
        />

        {/* Zone 3: Multi-Mode Center Workspace */}
        <div style={{ flex: 1, minWidth: '400px', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* View C: Scarlet Transcript (Webster PS #09 Core) */}
          {activeSubNav === 'transcript' ? (
            <TranscriptEditorView
              tokens={tokens}
              currentTime={currentTime}
              onToggleDeleteToken={handleToggleDeleteToken}
              onPurgeFillers={handlePurgeFillers}
              onRestoreAllTokens={handleRestoreAll}
              onEditTokenText={handleEditTokenText}
              onSeekToTime={t => setCurrentTime(t)}
            />
          ) : activeSubNav === 'import' ? (
            /* View B: Import Dropzone & Capture Suite (Page 2 & 10) */
            <ImportDropzoneView
              onFilesAdded={files => {
                const newAsset: MediaAsset = {
                  id: `asset_${Date.now()}`,
                  name: files[0] ?? 'New_Clip.mp4',
                  type: 'video',
                  duration: 10.0,
                  thumbnailUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80',
                  videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
                  isUsedOnTimeline: false,
                  resolution: '1920x1080',
                  category: 'Landscape',
                };
                setMediaAssets(prev => [newAsset, ...prev]);
                setActiveSubNav('my-files');
              }}
              onQuickAction={action => {
                // Generate a simulated capture clip
                const captureAsset: MediaAsset = {
                  id: `capture_${Date.now()}`,
                  name: `${action.toUpperCase()}_Capture.mp4`,
                  type: 'video',
                  duration: 12.0,
                  thumbnailUrl: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=400&q=80',
                  videoUrl: 'https://www.w3schools.com/html/movie.mp4',
                  isUsedOnTimeline: false,
                  resolution: '1920x1080',
                  category: 'Landscape',
                };
                setMediaAssets(prev => [captureAsset, ...prev]);
                setActiveSubNav('my-files');
                alert(`Captured stream saved as ${captureAsset.name} in My Files!`);
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
                // If asset has clip on timeline, seek to it
                const linkedClip = clips.find(c => c.mediaId === asset.id);
                if (linkedClip) {
                  setCurrentTime(linkedClip.sourceStart);
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
            duration={activeDuration}
            isPlaying={isPlaying}
            tokens={tokens}
            aspectRatio={aspectRatio}
            isSeekLocked={isSeekLocked}
            videoPreviewUrl={activeVideoUrl}
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
            onLastFrame={() => setCurrentTime(activeDuration)}
            onPrevFrame={() => setCurrentTime(Math.max(0, currentTime - 0.04))}
            onNextFrame={() => setCurrentTime(Math.min(activeDuration, currentTime + 0.04))}
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
          duration={activeDuration}
          segments={rebuildResult.segments}
          clips={clips}
          markers={markers}
          scale={timelineScale}
          selectedClipId={selectedClipId}
          onSeek={t => setCurrentTime(t)}
          onSelectClip={setSelectedClipId}
          onDeleteMarker={markerId => setMarkers(prev => prev.filter(m => m.id !== markerId))}
        />

        {/* Bottom Status Footer (28px Height) */}
        <StatusFooter
          scale={timelineScale}
          onScaleChange={setTimelineScale}
          projectDuration={activeDuration}
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
      />

      {/* Webster Victory Tier: Fault Simulator Drawer */}
      <FaultSimulatorBar
        isOpen={isFaultSimulatorOpen}
        onClose={() => setIsFaultSimulatorOpen(false)}
        telemetry={telemetry}
        onTriggerFailureMode={handleTriggerFailureMode}
      />
    </div>
  );
};
