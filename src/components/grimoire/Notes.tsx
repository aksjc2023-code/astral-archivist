import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Eye, EyeOff, ScrollText, Play, RotateCcw } from 'lucide-react';

export const Notes: React.FC = () => {
  const [notes, setNotes] = useState<string>(
    'Welcome to The Astral Archivist presentation.\n\n• Key Point 1: 100% offline desktop capture.\n• Key Point 2: Win32 display affinity omits this window.\n• Key Point 3: Transcript text deletions slice timeline video.\n• Key Point 4: Zero cloud telemetry.',
  );
  const [scrollSpeed, setScrollSpeed] = useState<number>(1);
  const [isScrolling, setIsScrolling] = useState<boolean>(false);
  const [isExcluded, setIsExcluded] = useState<boolean>(true);

  const toggleAffinity = async () => {
    const nextState = !isExcluded;
    try {
      await invoke('set_window_capture_affinity', { exclude: nextState });
      setIsExcluded(nextState);
    } catch (err) {
      console.warn('Set capture affinity error:', err);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950/40 backdrop-blur-xl text-slate-100 p-4 select-none">
      <div className="flex items-center justify-between border-b border-amber-500/40 pb-3">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-astral-amber" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100">
            The Invisible Grimoire
          </h2>
        </div>
        <button
          onClick={toggleAffinity}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all border ${
            isExcluded
              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
              : 'bg-red-950/60 border-red-500/50 text-red-300'
          }`}
          title="Toggle OS-level capture exclusion"
        >
          {isExcluded ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          <span>{isExcluded ? 'Hidden from Capture' : 'Visible to Capture'}</span>
        </button>
      </div>

      {/* Teleprompter Notes Area */}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="flex-1 my-3 resize-none rounded-xl border border-amber-500/20 bg-black/30 backdrop-blur-sm p-4 font-sans text-sm leading-relaxed text-slate-200 outline-none focus:border-amber-500/60"
        placeholder="Type or paste your presenter cues and teleprompter script here..."
      />

      {/* Prompter Controls */}
      <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span>Speed: {scrollSpeed}x</span>
          <input
            type="range"
            min="1"
            max="5"
            value={scrollSpeed}
            onChange={(e) => setScrollSpeed(Number(e.target.value))}
            className="accent-astral-amber h-1 w-20"
          />
        </div>
        <button
          onClick={() => setIsScrolling(!isScrolling)}
          className="flex items-center gap-1.5 rounded bg-astral-amber px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-all"
        >
          {isScrolling ? <RotateCcw className="h-3 w-3" /> : <Play className="h-3 w-3 fill-slate-950" />}
          <span>{isScrolling ? 'Pause Scroll' : 'Auto Scroll'}</span>
        </button>
      </div>
    </div>
  );
};
