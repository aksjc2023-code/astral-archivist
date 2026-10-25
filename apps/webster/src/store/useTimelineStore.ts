import { create } from 'zustand';

export interface TimeRange {
  start: number;
  end: number;
}

export interface TranscriptWord {
  id: string;
  word: string;
  start: number;
  end: number;
  isDeleted?: boolean;
}

export interface TimelineState {
  words: TranscriptWord[];
  skipRanges: TimeRange[];
  sourceDuration: number;
  currentTime: number;
  isPlaying: boolean;

  setWords: (words: TranscriptWord[]) => void;
  setSourceDuration: (duration: number) => void;
  deleteWords: (wordIds: string[]) => void;
  restoreWords: (wordIds: string[]) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  getKeepRanges: () => TimeRange[];
}

/**
 * Merges overlapping or contiguous deleted word intervals into solid skip ranges.
 */
export function calculateSkipRanges(words: TranscriptWord[]): TimeRange[] {
  const deleted = words
    .filter((w) => w.isDeleted)
    .sort((a, b) => a.start - b.start);

  if (deleted.length === 0) return [];

  const merged: TimeRange[] = [];
  let current: TimeRange = { start: deleted[0]!.start, end: deleted[0]!.end };

  for (let i = 1; i < deleted.length; i++) {
    const next = deleted[i]!;
    // Merge if overlapping or within 40ms of each other
    if (next.start <= current.end + 0.04) {
      current.end = Math.max(current.end, next.end);
    } else {
      merged.push(current);
      current = { start: next.start, end: next.end };
    }
  }
  merged.push(current);
  return merged;
}

/**
 * Computes the inverse kept intervals to be rendered and merged into the final video.
 */
export function computeKeepRanges(totalDuration: number, skipRanges: TimeRange[]): TimeRange[] {
  if (skipRanges.length === 0) {
    return totalDuration > 0 ? [{ start: 0, end: totalDuration }] : [];
  }

  const keepRanges: TimeRange[] = [];
  let cursor = 0;

  for (const skip of skipRanges) {
    if (skip.start > cursor) {
      // Keep everything between cursor and the start of the skip
      keepRanges.push({
        start: Number(cursor.toFixed(3)),
        end: Number(skip.start.toFixed(3)),
      });
    }
    cursor = Math.max(cursor, skip.end);
  }

  if (cursor < totalDuration) {
    keepRanges.push({
      start: Number(cursor.toFixed(3)),
      end: Number(totalDuration.toFixed(3)),
    });
  }

  return keepRanges.filter((r) => r.end - r.start > 0.02); // drop sub-frame slivers
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  words: [],
  skipRanges: [],
  sourceDuration: 0,
  currentTime: 0,
  isPlaying: false,

  setWords: (words) => {
    set({
      words,
      skipRanges: calculateSkipRanges(words),
    });
  },

  setSourceDuration: (sourceDuration) => set({ sourceDuration }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),

  deleteWords: (wordIds: string[]) => {
    const { words } = get();
    const updated = words.map((w) =>
      wordIds.includes(w.id) ? { ...w, isDeleted: true } : w
    );
    set({
      words: updated,
      skipRanges: calculateSkipRanges(updated),
    });
  },

  restoreWords: (wordIds: string[]) => {
    const { words } = get();
    const updated = words.map((w) =>
      wordIds.includes(w.id) ? { ...w, isDeleted: false } : w
    );
    set({
      words: updated,
      skipRanges: calculateSkipRanges(updated),
    });
  },

  getKeepRanges: () => {
    const { sourceDuration, skipRanges } = get();
    return computeKeepRanges(sourceDuration, skipRanges);
  },
}));
