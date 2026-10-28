import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Eye, EyeOff, ScrollText, Play, Pause, RotateCcw,
  Square, Radio, Volume2, Camera, CameraOff, ExternalLink,
  Type, Bookmark, Sparkles, RefreshCw
} from 'lucide-react';
import { useRecorderStore, dispatchRecorderCommand } from '../../store/useRecorderStore';

const STORAGE_KEY = 'astral_grimoire_notes';
const DEFAULT_SCRIPT = `## 🔮 The Astral Archivist Presentation
[CUE: Introduce Sanctum & Vision]
Welcome, archivists. Today we demonstrate total data sovereignty in multimedia creation.

• Key Point 1: 100% offline desktop screen, window, and voice capture.
• Key Point 2: Native Win32 display affinity physically omits this floating Grimoire from the captured video.
• Key Point 3: Dual-track phase-aligned audio mixer combines system audio and microphone with zero clipping.

[CUE: Switch to Timeline Demonstration]
Notice how transcript text deletions ripple-cut all 7 tracks in under 0.4 milliseconds.

"No cloud subscriptions. Zero telemetry. Pure local power."`;

export const Notes: React.FC<{ onCloseInApp?: () => void }> = ({ onCloseInApp }) => {
  // Recorder Store Sync
  const {
    isRecording, isPaused, durationMs, micLevelDb,
    isCameraOn, toggleCamera,
    startRecording, pauseRecording, resumeRecording, stopRecording,
  } = useRecorderStore();

  // Grimoire Presenter State
  const [notes, setNotes] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_SCRIPT;
  });
  const [isPrompterMode, setIsPrompterMode] = useState<boolean>(false);
  const [scrollSpeed, setScrollSpeed] = useState<number>(1.5);
  const [isScrolling, setIsScrolling] = useState<boolean>(false);
  const [fontSizePx, setFontSizePx] = useState<number>(14);
  const [isExcluded, setIsExcluded] = useState<boolean>(true);
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [markers, setMarkers] = useState<string[]>([]);

  const prompterRef = useRef<HTMLDivElement | null>(null);
  const scrollAnimRef = useRef<number | null>(null);

  // Persist notes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, notes);
  }, [notes]);

  // Ensure capture affinity is applied on mount
  useEffect(() => {
    invoke('set_window_capture_affinity', { exclude: true }).catch(() => {});
  }, []);

  const toggleAffinity = async () => {
    const nextState = !isExcluded;
    try {
      await invoke('set_window_capture_affinity', { exclude: nextState });
      setIsExcluded(nextState);
    } catch (err) {
      console.warn('Set capture affinity error:', err);
    }
  };

  const popOutNativeWindow = async () => {
    try {
      await invoke('toggle_grimoire_window', { show: true });
      if (onCloseInApp) onCloseInApp();
    } catch (err) {
      console.warn('Could not pop out native window:', err);
    }
  };

  // Smooth continuous auto-scroll engine via requestAnimationFrame
  useEffect(() => {
    let lastTimestamp = performance.now();

    const stepScroll = (timestamp: number) => {
      if (!isScrolling || !prompterRef.current) return;
      const delta = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      const pixelsPerSecond = 24 * scrollSpeed;
      prompterRef.current.scrollTop += pixelsPerSecond * delta;

      const maxScroll = prompterRef.current.scrollHeight - prompterRef.current.clientHeight;
      if (maxScroll > 0) {
        const progress = Math.min(100, Math.round((prompterRef.current.scrollTop / maxScroll) * 100));
        setScrollProgress(progress);
        if (progress >= 100) {
          setIsScrolling(false);
          return;
        }
      }

      scrollAnimRef.current = requestAnimationFrame(stepScroll);
    };

    if (isScrolling) {
      lastTimestamp = performance.now();
      scrollAnimRef.current = requestAnimationFrame(stepScroll);
    } else {
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
    }

    return () => {
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
    };
  }, [isScrolling, scrollSpeed]);

  const resetScroll = () => {
    setIsScrolling(false);
    if (prompterRef.current) {
      prompterRef.current.scrollTop = 0;
      setScrollProgress(0);
    }
  };

  const handleRecordAction = async () => {
    if (!isRecording) {
      await startRecording();
      dispatchRecorderCommand('START');
    } else if (isPaused) {
      await resumeRecording();
      dispatchRecorderCommand('RESUME');
    } else {
      await pauseRecording();
      dispatchRecorderCommand('PAUSE');
    }
  };

  const handleStopAction = async () => {
    await stopRecording();
    dispatchRecorderCommand('STOP');
  };

  const handleAddMarker = () => {
    const totalSec = Math.floor(durationMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const timecode = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    setMarkers((prev) => [...prev, `Bookmark at ${timecode}`]);
  };

  // Time format
  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const tenths = Math.floor((ms % 1000) / 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${tenths}`;
  };

  // Word count & pace
  const wordCount = notes.trim().split(/\s+/).filter(Boolean).length;
  const estimatedSeconds = Math.round((wordCount / 140) * 60);
  const estM = Math.floor(estimatedSeconds / 60);
  const estS = estimatedSeconds % 60;

  // Normalized mic meter
  const micNormalizedPercent = Math.max(0, Math.min(100, Math.round(((micLevelDb + 60) / 60) * 100)));

  return (
    <div className="flex h-full w-full flex-col bg-slate-950/85 backdrop-blur-2xl text-slate-100 p-4 select-none border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden font-sans">
      {/* 1. Header: Grimoire Title, Privacy Shield & Window Controls */}
      <div className="flex items-center justify-between border-b border-amber-500/30 pb-2.5">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-astral-amber animate-pulse" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 flex items-center gap-1.5">
            The Invisible Grimoire
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Privacy Shield Toggle */}
          <button
            onClick={toggleAffinity}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-all border ${
              isExcluded
                ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-sm shadow-emerald-500/20'
                : 'bg-red-950/80 border-red-500/60 text-red-300'
            }`}
            title="Windows DWM display affinity: physically excludes this window from recordings"
          >
            {isExcluded ? <EyeOff className="h-3 w-3 text-emerald-400" /> : <Eye className="h-3 w-3 text-red-400" />}
            <span>{isExcluded ? 'Shield: ACTIVE' : 'Shield: VISIBLE'}</span>
          </button>

          {/* Detach Native Window Button */}
          <button
            onClick={popOutNativeWindow}
            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-astral-amber transition-colors"
            title="Pop out into native borderless floating window"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Embedded Aetherial Transport Deck (Recording Controls) */}
      <div className="my-2.5 flex items-center justify-between rounded-xl border border-amber-500/30 bg-black/40 p-2.5 backdrop-blur-md">
        {/* Record / Pause / Timecode */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRecordAction}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all shadow-md active:scale-95 ${
              isRecording
                ? isPaused
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30'
                : 'bg-astral-amber text-slate-950 hover:bg-amber-400'
            }`}
          >
            {!isRecording ? (
              <>
                <Radio className="h-3.5 w-3.5" />
                <span>REC</span>
              </>
            ) : isPaused ? (
              <>
                <Play className="h-3 w-3 fill-slate-950" />
                <span>Resume</span>
              </>
            ) : (
              <>
                <Pause className="h-3 w-3" />
                <span>Pause</span>
              </>
            )}
          </button>

          {isRecording && (
            <button
              type="button"
              onClick={handleStopAction}
              className="flex items-center gap-1 rounded-lg border border-red-500/60 bg-red-950/60 px-2 py-1 text-xs font-semibold text-red-300 hover:bg-red-900/60 transition-all"
              title="Stop Recording"
            >
              <Square className="h-3 w-3 fill-red-400" />
            </button>
          )}

          <div className="font-mono text-xs font-bold text-slate-200 tracking-wider bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/60">
            {formatTime(durationMs)}
          </div>
        </div>

        {/* Live Mic Activity & Cam Toggle */}
        <div className="flex items-center gap-2">
          {isRecording && (
            <div className="flex items-center gap-1 bg-black/50 border border-slate-800 px-1.5 py-0.5 rounded text-[10px]">
              <Volume2 className="h-3 w-3 text-astral-amber" />
              <div className="w-10 h-1 bg-slate-800 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-amber-500 transition-all duration-75"
                  style={{ width: `${micNormalizedPercent}%` }}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              toggleCamera();
              dispatchRecorderCommand('TOGGLE_CAMERA');
            }}
            className={`p-1 rounded border transition-colors ${
              isCameraOn
                ? 'border-amber-500/80 bg-amber-500/20 text-astral-amber'
                : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Webcam Overlay"
          >
            {isCameraOn ? <Camera className="h-3.5 w-3.5 text-astral-amber" /> : <CameraOff className="h-3.5 w-3.5" />}
          </button>

          {isRecording && (
            <button
              type="button"
              onClick={handleAddMarker}
              className="p-1 rounded border border-slate-800 hover:border-amber-500/60 text-slate-400 hover:text-astral-amber transition-colors"
              title="Drop EDL Chapter Bookmark Marker"
            >
              <Bookmark className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Teleprompter Controls Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-xs text-slate-300">
        {/* Mode Toggle: Edit vs Prompter View */}
        <div className="flex items-center gap-1 bg-slate-900/60 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={() => setIsPrompterMode(false)}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
              !isPrompterMode ? 'bg-amber-500/20 text-astral-amber' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => setIsPrompterMode(true)}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
              isPrompterMode ? 'bg-amber-500/20 text-astral-amber' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Prompter
          </button>
        </div>

        {/* Font Size Adjusters */}
        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          <button
            onClick={() => setFontSizePx((f) => Math.max(12, f - 2))}
            className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-800 hover:text-white"
            title="Decrease font size"
          >
            A-
          </button>
          <span className="font-mono text-[10px]">{fontSizePx}px</span>
          <button
            onClick={() => setFontSizePx((f) => Math.min(26, f + 2))}
            className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-800 hover:text-white"
            title="Increase font size"
          >
            A+
          </button>
        </div>

        {/* Scroll Speed & Auto-Scroll Play */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <span>{scrollSpeed.toFixed(1)}x</span>
            <input
              type="range"
              min="0.5"
              max="4.0"
              step="0.5"
              value={scrollSpeed}
              onChange={(e) => setScrollSpeed(Number(e.target.value))}
              className="accent-astral-amber h-1 w-14 cursor-pointer"
            />
          </div>
          <button
            onClick={() => setIsScrolling(!isScrolling)}
            className={`flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-bold transition-all ${
              isScrolling
                ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/30'
                : 'bg-astral-amber text-slate-950 hover:bg-amber-400'
            }`}
          >
            {isScrolling ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 fill-slate-950" />}
            <span>{isScrolling ? 'Pause' : 'Scroll'}</span>
          </button>
          <button
            onClick={resetScroll}
            className="p-1 rounded text-slate-400 hover:text-astral-amber transition-colors"
            title="Reset Teleprompter to Top"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 4. Teleprompter Body Area */}
      <div className="relative flex-1 my-2 overflow-hidden rounded-xl border border-amber-500/20 bg-black/40 backdrop-blur-sm">
        {/* Subtle Eyeline Alignment Guide Wire (Only in prompter mode) */}
        {isPrompterMode && (
          <div className="absolute top-[28%] left-0 right-0 z-20 flex items-center justify-between px-3 pointer-events-none opacity-40 hover:opacity-100 transition-opacity">
            <div className="h-px bg-amber-400/50 flex-1 border-t border-dashed border-amber-400/80" />
            <span className="text-[9px] uppercase font-mono text-amber-300 px-1.5 tracking-widest">
              Camera Eyeline
            </span>
            <div className="h-px bg-amber-400/50 flex-1 border-t border-dashed border-amber-400/80" />
          </div>
        )}

        {isPrompterMode ? (
          <div
            ref={prompterRef}
            style={{ fontSize: `${fontSizePx}px` }}
            className="h-full w-full overflow-y-auto p-5 font-sans leading-relaxed text-slate-100 scroll-smooth space-y-3"
          >
            {notes.split('\n').map((line, idx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={idx} className="h-2" />;
              if (trimmed.startsWith('##')) {
                return (
                  <h3 key={idx} className="font-bold text-astral-amber text-base tracking-wide border-b border-amber-500/20 pb-1">
                    {trimmed.replace(/^##\s*/, '')}
                  </h3>
                );
              }
              if (trimmed.startsWith('[CUE:')) {
                return (
                  <div key={idx} className="inline-block rounded-md bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 text-xs font-bold text-astral-amber shadow-sm">
                    {trimmed}
                  </div>
                );
              }
              if (trimmed.startsWith('•')) {
                return (
                  <p key={idx} className="pl-3 text-slate-200">
                    <span className="text-astral-amber font-bold mr-1">•</span>
                    {trimmed.substring(1).trim()}
                  </p>
                );
              }
              return (
                <p key={idx} className="text-slate-200">
                  {line}
                </p>
              );
            })}
            <div className="h-32" /> {/* Bottom breathing room so script can scroll past eyeline */}
          </div>
        ) : (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ fontSize: `${fontSizePx}px` }}
            className="h-full w-full resize-none bg-transparent p-4 font-sans leading-relaxed text-slate-200 outline-none focus:ring-0"
            placeholder="Type or paste your incantations, presenter script, and cues here..."
          />
        )}
      </div>

      {/* 5. Footer Analytics & Progress Bar */}
      <div className="border-t border-slate-800 pt-2 text-[11px] text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span>{wordCount} words</span>
          <span>•</span>
          <span>~{estM}m {estS}s pace</span>
          {markers.length > 0 && (
            <span className="text-astral-amber font-semibold">({markers.length} markers)</span>
          )}
        </div>

        {/* Scroll Progress Bar */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono">{scrollProgress}%</span>
          <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-astral-amber transition-all duration-150"
              style={{ width: `${scrollProgress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
