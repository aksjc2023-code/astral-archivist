import { useState, useRef, useCallback } from 'react';
import type { TimelineClip } from '../core/types';

export interface HistorySnapshot {
  id: string;
  action: string;
  timestamp: number;
  clips: TimelineClip[];
  activeFilter?: string;
  activeTransition?: string;
  activeSticker?: string;
  activeTitle?: string;
}

export interface UseTimelineHistoryOptions {
  maxStackSize?: number;
  debounceMs?: number;
}

export function useTimelineHistory(initialClips: TimelineClip[] = [], options: UseTimelineHistoryOptions = {}) {
  const maxStackSize = options.maxStackSize ?? 30;
  const debounceMs = options.debounceMs ?? 200;

  const [history, setHistory] = useState<HistorySnapshot[]>([
    {
      id: 'snapshot_init',
      action: 'Initial State',
      timestamp: Date.now(),
      clips: initialClips,
    },
  ]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  const pushSnapshot = useCallback(
    (action: string, state: { clips: TimelineClip[]; activeFilter?: string; activeTransition?: string; activeSticker?: string; activeTitle?: string }) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        setHistory((prev) => {
          // Truncate future if user performed an edit after undoing
          const validHistory = prev.slice(0, currentIndex + 1);
          const newSnapshot: HistorySnapshot = {
            id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            action,
            timestamp: Date.now(),
            ...state,
          };

          const nextStack = [...validHistory, newSnapshot];
          if (nextStack.length > maxStackSize) {
            return nextStack.slice(nextStack.length - maxStackSize);
          }
          return nextStack;
        });

        setCurrentIndex((prev) => Math.min(prev + 1, maxStackSize - 1));
      }, debounceMs);
    },
    [currentIndex, maxStackSize, debounceMs]
  );

  const undo = useCallback((): HistorySnapshot | null => {
    if (!canUndo) return null;
    const targetIdx = currentIndex - 1;
    setCurrentIndex(targetIdx);
    return history[targetIdx] ?? null;
  }, [canUndo, currentIndex, history]);

  const redo = useCallback((): HistorySnapshot | null => {
    if (!canRedo) return null;
    const targetIdx = currentIndex + 1;
    setCurrentIndex(targetIdx);
    return history[targetIdx] ?? null;
  }, [canRedo, currentIndex, history]);

  return {
    history,
    currentIndex,
    canUndo,
    canRedo,
    pushSnapshot,
    undo,
    redo,
    currentSnapshot: history[currentIndex] ?? null,
  };
}
