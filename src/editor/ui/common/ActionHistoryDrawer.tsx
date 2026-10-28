import React from 'react';
import type { HistorySnapshot } from '../../hooks/useTimelineHistory';

export interface ActionHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistorySnapshot[];
  currentIndex: number;
  onRestoreSnapshot: (index: number) => void;
}

export const ActionHistoryDrawer: React.FC<ActionHistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  currentIndex,
  onRestoreSnapshot,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed bottom-12 right-6 z-50 w-80 bg-slate-900/95 border border-amber-500/30 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden flex flex-col font-sans animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center gap-2">
          <span className="text-amber-400">📜</span>
          <span className="text-xs font-semibold tracking-wide text-slate-200">
            Chronicle History Stack
          </span>
          <span className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {currentIndex + 1}/{history.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-100 text-xs p-1"
        >
          ✕
        </button>
      </div>

      {/* Snapshot list */}
      <div className="max-h-72 overflow-y-auto p-2 space-y-1">
        {history.map((snapshot, idx) => {
          const isActive = idx === currentIndex;
          const isFuture = idx > currentIndex;
          const dateStr = new Date(snapshot.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });

          return (
            <button
              key={snapshot.id}
              type="button"
              onClick={() => onRestoreSnapshot(idx)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-all ${
                isActive
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 font-medium'
                  : isFuture
                  ? 'text-slate-500 hover:text-slate-400 hover:bg-slate-800/40 line-through opacity-60'
                  : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="font-mono text-[10px] text-slate-500">
                  #{idx + 1}
                </span>
                <span className="truncate">{snapshot.action}</span>
              </div>
              <span className="font-mono text-[9px] text-slate-400 ml-2 shrink-0">
                {dateStr}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer info */}
      <div className="px-3 py-1.5 bg-slate-950/80 border-t border-slate-800/60 text-[10px] text-slate-400 flex items-center justify-between">
        <span>Click any event to travel in time</span>
        <span className="font-mono text-amber-400/80">Ctrl+Z / Ctrl+Y</span>
      </div>
    </div>
  );
};
