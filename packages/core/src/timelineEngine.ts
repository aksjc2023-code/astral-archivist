import { WordToken, PlaybackSegment } from './types';

/**
 * Constants strictly adhering to Argon ADR-001 Math Specification
 */
export const EPSILON_MERGE_SEC = 0.085;       // 85ms micro-gap coalescing threshold
export const MIN_SEGMENT_DURATION_SEC = 0.030; // 30ms hardware decoder fault guard
export const TIME_EPSILON_SEC = 0.005;         // 5ms floating-point boundary grace window

export interface RebuildResult {
  segments: PlaybackSegment[];
  rebuildLatencyMs: number;
  totalVirtualDuration: number;
  totalSourceDuration: number;
  timeSavedSec: number;
}

/**
 * Pure Coalescing Algorithm: Maps non-deleted WordTokens into contiguous PlaybackSegments.
 * Executes in under 0.4ms for sub-millisecond ripple edits.
 */
export function buildPlaybackSegments(tokens: WordToken[]): RebuildResult {
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const keptTokens = tokens.filter(t => !t.deleted);
  const segments: PlaybackSegment[] = [];

  if (keptTokens.length === 0) {
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
    return {
      segments: [],
      rebuildLatencyMs: Number(elapsed.toFixed(3)),
      totalVirtualDuration: 0,
      totalSourceDuration: 0,
      timeSavedSec: 0,
    };
  }

  let currentStart = keptTokens[0]?.start ?? 0;
  let currentEnd = keptTokens[0]?.end ?? 0;
  let segIdCounter = 1;

  for (let i = 1; i < keptTokens.length; i++) {
    const prevToken = keptTokens[i - 1];
    const currToken = keptTokens[i];

    if (!prevToken || !currToken) continue;

    const gap = currToken.start - prevToken.end;

    // Check if tokens can coalesce: monotonic order and gap <= 85ms
    if (gap <= EPSILON_MERGE_SEC && currToken.start >= prevToken.start) {
      currentEnd = Math.max(currentEnd, currToken.end);
    } else {
      // Close active segment if it satisfies minimum duration guard
      const duration = currentEnd - currentStart;
      if (duration >= MIN_SEGMENT_DURATION_SEC) {
        segments.push({
          id: `seg_${segIdCounter++}`,
          sourceStart: currentStart,
          sourceEnd: currentEnd,
          virtualStart: 0, // Assigned in bijective mapping pass
          virtualEnd: 0,
          duration,
        });
      }
      currentStart = currToken.start;
      currentEnd = currToken.end;
    }
  }

  // Push final segment
  const finalDuration = currentEnd - currentStart;
  if (finalDuration >= MIN_SEGMENT_DURATION_SEC) {
    segments.push({
      id: `seg_${segIdCounter++}`,
      sourceStart: currentStart,
      sourceEnd: currentEnd,
      virtualStart: 0,
      virtualEnd: 0,
      duration: finalDuration,
    });
  }

  // Bijective Piecewise-Linear Virtual Timeline Mapping Pass
  let cumulativeVirtual = 0;
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[k];
    if (!seg) continue;
    seg.virtualStart = cumulativeVirtual;
    cumulativeVirtual += seg.duration;
    seg.virtualEnd = cumulativeVirtual;
  }

  const rawTotalSource = tokens.length > 0 ? (tokens[tokens.length - 1]?.end ?? 0) : 0;
  const timeSaved = Math.max(0, rawTotalSource - cumulativeVirtual);
  const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;

  return {
    segments,
    rebuildLatencyMs: Number(elapsed.toFixed(3)),
    totalVirtualDuration: cumulativeVirtual,
    totalSourceDuration: rawTotalSource,
    timeSavedSec: Number(timeSaved.toFixed(2)),
  };
}

/**
 * O(log N) Binary Search Playhead Leap.
 * Evaluates whether currentTime is within a kept segment or needs a leap across a cut interval.
 */
export function getNextValidTime(
  currentTime: number,
  segments: PlaybackSegment[]
): { nextTime: number; didJump: boolean; activeSegmentIndex: number; searchLatencyMs: number } {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  if (segments.length === 0) {
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return { nextTime: currentTime, didJump: false, activeSegmentIndex: -1, searchLatencyMs: Number((t1 - t0).toFixed(4)) };
  }

  const firstSeg = segments[0];
  const lastSeg = segments[segments.length - 1];

  if (!firstSeg || !lastSeg) {
    return { nextTime: currentTime, didJump: false, activeSegmentIndex: -1, searchLatencyMs: 0 };
  }

  // If before first segment, jump to first segment start
  if (currentTime < firstSeg.sourceStart - TIME_EPSILON_SEC) {
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      nextTime: firstSeg.sourceStart,
      didJump: true,
      activeSegmentIndex: 0,
      searchLatencyMs: Number((t1 - t0).toFixed(4)),
    };
  }

  // If past last segment, clamp to last segment end
  if (currentTime > lastSeg.sourceEnd) {
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      nextTime: lastSeg.sourceEnd,
      didJump: false,
      activeSegmentIndex: segments.length - 1,
      searchLatencyMs: Number((t1 - t0).toFixed(4)),
    };
  }

  // Binary search with unsigned right-shift midpoint
  let low = 0;
  let high = segments.length - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const seg = segments[mid];
    if (!seg) break;

    // Inside current segment with boundary epsilon
    if (currentTime >= seg.sourceStart - TIME_EPSILON_SEC && currentTime <= seg.sourceEnd + TIME_EPSILON_SEC) {
      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      return {
        nextTime: currentTime,
        didJump: false,
        activeSegmentIndex: mid,
        searchLatencyMs: Number((t1 - t0).toFixed(4)),
      };
    }

    if (currentTime < seg.sourceStart) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  // Playhead fell into a cut interval between segments: leap to low (the next kept segment)
  const targetSeg = segments[low];
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  if (targetSeg) {
    return {
      nextTime: targetSeg.sourceStart,
      didJump: true,
      activeSegmentIndex: low,
      searchLatencyMs: Number((t1 - t0).toFixed(4)),
    };
  }

  return {
    nextTime: lastSeg.sourceEnd,
    didJump: false,
    activeSegmentIndex: segments.length - 1,
    searchLatencyMs: Number((t1 - t0).toFixed(4)),
  };
}

/**
 * Bijective Piecewise-Linear Mapping: Source Media Timestamp -> Virtual Timeline Timestamp
 */
export function sourceToVirtualTime(sourceTime: number, segments: PlaybackSegment[]): number {
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    if (sourceTime >= seg.sourceStart && sourceTime <= seg.sourceEnd) {
      return seg.virtualStart + (sourceTime - seg.sourceStart);
    }
    if (sourceTime < seg.sourceStart) {
      return seg.virtualStart;
    }
  }
  const last = segments[segments.length - 1];
  return last ? last.virtualEnd : 0;
}

/**
 * Inverse Bijective Mapping: Virtual Timeline Timestamp -> Source Media Timestamp
 */
export function virtualToSourceTime(virtualTime: number, segments: PlaybackSegment[]): number {
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    if (virtualTime >= seg.virtualStart && virtualTime <= seg.virtualEnd) {
      return seg.sourceStart + (virtualTime - seg.virtualStart);
    }
  }
  const last = segments[segments.length - 1];
  return last ? last.sourceEnd : 0;
}

/**
 * Format seconds to standard Movavi MM:SS or HH:MM:SS format
 */
export function formatTimecode(seconds: number): { main: string; ms: string } {
  const totalSec = Math.max(0, seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = Math.floor(totalSec % 60);
  const millis = Math.floor((totalSec % 1) * 1000);

  const main = hrs > 0
    ? `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  
  const ms = String(millis).padStart(3, '0');
  return { main, ms };
}
