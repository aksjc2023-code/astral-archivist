import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ScrollText, Radio, FolderArchive, ArrowRight, Sparkles } from 'lucide-react';
import { Deck } from './components/recorder/Deck';
import { Webcam } from './components/recorder/Webcam';
import { LibraryView } from './components/library/LibraryView';
import { Track } from './components/timeline/Track';
import { Scribe } from './components/transcript/Scribe';
import { Notes } from './components/grimoire/Notes';
import { useVaultStore } from './store/useVaultStore';
import { useTimelineStore } from './store/useTimelineStore';
import type { VaultItem } from './types/ipc';
import mainBg from './assets/main_bg.jpg';
import logoImg from './assets/logo.jpg';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'studio' | 'library'>('studio');
  const [showGrimoire, setShowGrimoire] = useState<boolean>(false);

  const { recordings, selectedItem, selectRecording, fetchRecordings } = useVaultStore();
  const { edl, initEdl } = useTimelineStore();

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  // Handle opening a recording from Library directly into Studio Timeline & Scribe
  const handleOpenInTimeline = (item: VaultItem) => {
    selectRecording(item);
    initEdl(item.id, item.title, item.duration_ms);
    setActiveTab('studio');
  };

  const toggleGrimoire = async () => {
    const next = !showGrimoire;
    setShowGrimoire(next);
    try {
      await invoke('set_window_capture_affinity', { exclude: true });
    } catch (e) {
      console.warn('Affinity invoke:', e);
    }
  };

  return (
    <div
      className="relative flex h-screen w-screen flex-col bg-slate-950 text-slate-100 overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${mainBg})` }}
    >
      {/* Light translucent scrim to let the artwork shine through while preserving UI contrast */}
      <div className="absolute inset-0 bg-black/15 backdrop-blur-[0.5px] pointer-events-none" />

      {/* Top Navigation Sanctum */}
      <header className="relative z-20 flex h-14 items-center justify-between border-b border-amber-500/20 px-6 bg-black/30 backdrop-blur-xl">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <img
              src={logoImg}
              alt="The Astral Archivist Logo"
              className="h-8 w-8 rounded-full object-cover border border-amber-500/80 shadow-md shadow-emerald-500/40 ring-1 ring-emerald-400/50"
            />
            <h1 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
              The Astral Archivist
            </h1>
          </div>

          {/* Core Tab Navigation: Studio vs Library */}
          <nav className="flex items-center gap-1 rounded-xl border border-amber-500/30 bg-black/40 p-1 backdrop-blur-md">
            <button
              onClick={() => setActiveTab('studio')}
              className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
                activeTab === 'studio'
                  ? 'bg-astral-amber text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              <span>Studio</span>
            </button>

            <button
              onClick={() => setActiveTab('library')}
              className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
                activeTab === 'library'
                  ? 'bg-astral-amber text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <FolderArchive className="h-3.5 w-3.5" />
              <span>Library</span>
              {recordings.length > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    activeTab === 'library'
                      ? 'bg-slate-950 text-astral-amber'
                      : 'bg-amber-500/20 text-astral-amber border border-amber-500/40'
                  }`}
                >
                  {recordings.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Right Header Utilities */}
        <div className="flex items-center gap-3 text-xs text-slate-200">
          <button
            onClick={toggleGrimoire}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all ${
              showGrimoire
                ? 'bg-amber-500/20 text-astral-amber border-amber-500/50'
                : 'bg-slate-900/60 text-slate-300 border-slate-700/60 hover:text-white hover:border-slate-500'
            }`}
            title="Toggle Invisible Grimoire Teleprompter (Omitted from capture)"
          >
            <ScrollText className="h-3.5 w-3.5" />
            <span>Invisible Grimoire</span>
          </button>
          <span className="rounded-lg bg-astral-900/70 px-2.5 py-1 border border-amber-500/40 text-astral-amber font-medium shadow-sm">
            100% Offline Sanctum
          </span>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="relative z-10 flex flex-1 p-6 overflow-y-auto">
        {activeTab === 'studio' ? (
          <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto pb-12">
            {/* Capture Deck (B1, B2) */}
            <Deck />

            {/* Timeline & Scribing Engine (B4, B5, A1) */}
            {selectedItem && edl ? (
              <div className="flex flex-col gap-6 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-astral-amber">
                      Active Timeline Archive:
                    </span>
                    <span className="text-xs font-semibold text-slate-200">{selectedItem.title}</span>
                  </div>
                  <button
                    onClick={() => setActiveTab('library')}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-astral-amber transition-colors"
                  >
                    <span>Switch Archive in Library</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
                <Track />
                <Scribe recordingId={selectedItem.id} />
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-amber-500/20 bg-black/20 p-4 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-astral-amber shrink-0" />
                  <div>
                    <h3 className="text-xs font-bold text-slate-200">
                      {recordings.length > 0
                        ? `${recordings.length} Saved Recording${recordings.length > 1 ? 's' : ''} Ready in Library`
                        : 'No Active Recording in Timeline'}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {recordings.length > 0
                        ? 'Select an archive from the Library tab to scrub the timeline, cut segments, or transcribe voice notes.'
                        : 'Record above with camera overlay & audio, or podcast with Voice-only mode.'}
                    </p>
                  </div>
                </div>
                {recordings.length > 0 && (
                  <button
                    onClick={() => setActiveTab('library')}
                    className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-astral-amber hover:bg-amber-500/20 transition-all shrink-0"
                  >
                    <span>Open Library</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Library Tab: Shifted all saved videos and audios here */
          <LibraryView
            onOpenInTimeline={handleOpenInTimeline}
            onGoToStudio={() => setActiveTab('studio')}
          />
        )}
      </main>

      {/* Floating Invisible Grimoire Teleprompter Window (A3) */}
      {showGrimoire && (
        <div className="fixed top-20 right-6 z-40 w-96 h-[480px] rounded-2xl border-2 border-amber-500/60 shadow-2xl overflow-hidden backdrop-blur-xl">
          <Notes />
        </div>
      )}

      {/* Astral Webcam Floating Projection Overlay (B2) */}
      <Webcam />
    </div>
  );
};
