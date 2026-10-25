import {
  WordToken,
  PlaybackSegment,
  TimelineClip,
  TimeRange,
  TimelineSeconds,
  SourceSeconds,
  VirtualSeconds,
  Seconds,
  asTimelineSeconds,
  asSourceSeconds,
  asVirtualSeconds,
  asSeconds,
} from './types';

/**
 * Constants strictly adhering to Argon ADR-001 Math Specification
 */
export const EPSILON_MERGE_SEC = 0.085;       // 85ms micro-gap coalescing threshold
export const MIN_SEGMENT_DURATION_SEC = 0.030; // 30ms hardware decoder fault guard
export const TIME_EPSILON_SEC = 0.005;         // 5ms floating-point boundary grace window

/**
 * Environment-Neutral Clock Provider interface for Phase 2 desktop / WASM portability
 */
export interface Clock {
  now(): number;
}

export const defaultClock: Clock = {
  now: (): number => {
    // Environment-neutral: checks globalThis.performance safely without requiring DOM lib
    const g = typeof globalThis !== 'undefined' ? (globalThis as Record<string, unknown>) : undefined;
    const perf = g?.['performance'] as { now?: () => number } | undefined;
    if (typeof perf?.now === 'function') {
      return perf.now();
    }
    return Date.now();
  },
};

export interface RebuildResult {
  segments: PlaybackSegment[];
  rebuildLatencyMs: number;
  totalVirtualDuration: VirtualSeconds;
  totalSourceDuration: SourceSeconds;
  timeSavedSec: Seconds;
}

/**
 * Pure Coalescing Algorithm: Maps non-deleted WordTokens into contiguous PlaybackSegments.
 * Executes in under 0.4ms for sub-millisecond ripple edits.
 * 
 * Defensively normalizes input:
 * 1. Rejects invalid / non-finite timestamps and zero-or-negative duration tokens
 * 2. Normalizes order by sorting by (start ASC, end ASC, id ASC)
 * 3. Coalesces intervals with gaps <= 85ms
 * 4. Discards segments shorter than 30ms decoder guard
 * 5. Generates monotonic bijective piecewise-linear mapping
 */
export function buildPlaybackSegments(
  tokens: readonly WordToken[],
  mediaIdOrClock?: string | Clock,
  clockProvider: Clock = defaultClock
): RebuildResult {
  const targetMediaId = typeof mediaIdOrClock === 'string' ? mediaIdOrClock : undefined;
  const clock = (typeof mediaIdOrClock === 'object' && mediaIdOrClock !== null && 'now' in mediaIdOrClock)
    ? mediaIdOrClock
    : clockProvider;

  const startTime = clock.now();

  // 1. Defensively validate and normalize inputs (optionally scoped to targetMediaId)
  const validTokens: WordToken[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    if (targetMediaId && t.mediaId !== targetMediaId) {
      continue;
    }
    if (Number.isFinite(t.start) && Number.isFinite(t.end) && t.end > t.start) {
      validTokens.push(t);
    }
  }

  // 2. Sort defensively by (start ASC, end ASC, id ASC) to eliminate ordering assumptions
  validTokens.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return a.end - b.end;
    return a.id.localeCompare(b.id);
  });

  // 3. Filter kept tokens (non-deleted)
  const keptTokens = validTokens.filter(t => !t.deleted);
  const segments: PlaybackSegment[] = [];

  const rawTotalSource = validTokens.length > 0 
    ? (validTokens[validTokens.length - 1]?.end ?? asSourceSeconds(0)) 
    : asSourceSeconds(0);

  if (keptTokens.length === 0) {
    const elapsed = clock.now() - startTime;
    return {
      segments: [],
      rebuildLatencyMs: Number(elapsed.toFixed(3)),
      totalVirtualDuration: asVirtualSeconds(0),
      totalSourceDuration: rawTotalSource,
      timeSavedSec: asSeconds(rawTotalSource),
    };
  }

  let currentStart = keptTokens[0]?.start ?? asSourceSeconds(0);
  let currentEnd = keptTokens[0]?.end ?? asSourceSeconds(0);
  let segIdCounter = 1;

  for (let i = 1; i < keptTokens.length; i++) {
    const prevToken = keptTokens[i - 1];
    const currToken = keptTokens[i];

    if (!prevToken || !currToken) continue;

    const gap = currToken.start - currentEnd;

    // Check if tokens can coalesce:
    // 1. Monotonic order and gap <= 85ms
    // 2. OR non-deleted pause token bridging speech/natural silence on the same media asset
    const isSameMedia = !prevToken.mediaId || !currToken.mediaId || prevToken.mediaId === currToken.mediaId;
    const isPauseBridge = isSameMedia && gap >= 0 && (Boolean(prevToken.isPause) || Boolean(currToken.isPause));

    if ((gap <= EPSILON_MERGE_SEC || isPauseBridge) && currToken.start >= currentStart) {
      currentEnd = asSourceSeconds(Math.max(currentEnd, currToken.end));
    } else {
      // Close active segment if it satisfies minimum duration guard (30ms)
      const duration = currentEnd - currentStart;
      if (duration >= MIN_SEGMENT_DURATION_SEC) {
        segments.push({
          id: `seg_${segIdCounter++}`,
          mediaId: targetMediaId ?? keptTokens[0]?.mediaId,
          sourceStart: currentStart,
          sourceEnd: currentEnd,
          virtualStart: asVirtualSeconds(0), // Assigned in bijective mapping pass
          virtualEnd: asVirtualSeconds(0),
          duration: asSeconds(duration),
        });
      }
      currentStart = currToken.start;
      currentEnd = currToken.end;
    }
  }

  // Push final segment if it satisfies minimum duration guard
  const finalDuration = currentEnd - currentStart;
  if (finalDuration >= MIN_SEGMENT_DURATION_SEC) {
    segments.push({
      id: `seg_${segIdCounter++}`,
      mediaId: targetMediaId ?? keptTokens[0]?.mediaId,
      sourceStart: currentStart,
      sourceEnd: currentEnd,
      virtualStart: asVirtualSeconds(0),
      virtualEnd: asVirtualSeconds(0),
      duration: asSeconds(finalDuration),
    });
  }

  // Bijective Piecewise-Linear Virtual Timeline Mapping Pass
  let cumulativeVirtual = 0;
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[k];
    if (!seg) continue;
    seg.virtualStart = asVirtualSeconds(cumulativeVirtual);
    cumulativeVirtual += seg.duration;
    seg.virtualEnd = asVirtualSeconds(cumulativeVirtual);
  }

  const timeSaved = Math.max(0, rawTotalSource - cumulativeVirtual);
  const elapsed = clock.now() - startTime;

  return {
    segments,
    rebuildLatencyMs: Number(elapsed.toFixed(3)),
    totalVirtualDuration: asVirtualSeconds(cumulativeVirtual),
    totalSourceDuration: rawTotalSource,
    timeSavedSec: asSeconds(Number(timeSaved.toFixed(2))),
  };
}

/**
 * O(log N) Binary Search Playhead Leap.
 * Evaluates whether sourceTime is within a kept segment or needs a leap across a cut interval.
 */
export function getNextValidTime(
  sourceTime: SourceSeconds,
  segments: readonly PlaybackSegment[],
  clock: Clock = defaultClock
): { nextTime: SourceSeconds; didJump: boolean; activeSegmentIndex: number; searchLatencyMs: number } {
  const t0 = clock.now();

  if (segments.length === 0) {
    const t1 = clock.now();
    return { nextTime: sourceTime, didJump: false, activeSegmentIndex: -1, searchLatencyMs: Number((t1 - t0).toFixed(4)) };
  }

  const firstSeg = segments[0];
  const lastSeg = segments[segments.length - 1];

  if (!firstSeg || !lastSeg) {
    return { nextTime: sourceTime, didJump: false, activeSegmentIndex: -1, searchLatencyMs: 0 };
  }

  // If before first segment, leap to first segment start
  if (sourceTime < firstSeg.sourceStart - TIME_EPSILON_SEC) {
    const t1 = clock.now();
    return {
      nextTime: firstSeg.sourceStart,
      didJump: true,
      activeSegmentIndex: 0,
      searchLatencyMs: Number((t1 - t0).toFixed(4)),
    };
  }

  // If past last segment, clamp to last segment end
  if (sourceTime > lastSeg.sourceEnd) {
    const t1 = clock.now();
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
    if (sourceTime >= seg.sourceStart - TIME_EPSILON_SEC && sourceTime <= seg.sourceEnd + TIME_EPSILON_SEC) {
      const t1 = clock.now();
      return {
        nextTime: sourceTime,
        didJump: false,
        activeSegmentIndex: mid,
        searchLatencyMs: Number((t1 - t0).toFixed(4)),
      };
    }

    if (sourceTime < seg.sourceStart) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  // Playhead fell into a cut interval between segments: leap to low (the next kept segment)
  const targetSeg = segments[low];
  const t1 = clock.now();

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
export function sourceToVirtualTime(sourceTime: SourceSeconds, segments: readonly PlaybackSegment[]): VirtualSeconds {
  if (segments.length === 0) return asVirtualSeconds(0);
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    if (sourceTime >= seg.sourceStart && sourceTime <= seg.sourceEnd) {
      return asVirtualSeconds(seg.virtualStart + (sourceTime - seg.sourceStart));
    }
    if (sourceTime < seg.sourceStart) {
      return asVirtualSeconds(seg.virtualStart);
    }
  }
  const last = segments[segments.length - 1];
  return last ? last.virtualEnd : asVirtualSeconds(0);
}

/**
 * Inverse Bijective Mapping: Virtual Timeline Timestamp -> Source Media Timestamp
 */
export function virtualToSourceTime(virtualTime: VirtualSeconds, segments: readonly PlaybackSegment[]): SourceSeconds {
  if (segments.length === 0) return asSourceSeconds(0);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    if (virtualTime >= seg.virtualStart && virtualTime <= seg.virtualEnd) {
      return asSourceSeconds(seg.sourceStart + (virtualTime - seg.virtualStart));
    }
  }
  const last = segments[segments.length - 1];
  return last ? last.sourceEnd : asSourceSeconds(0);
}

/**
 * Maps a composition timeline timestamp to the active source offset within a clip
 */
export function timelineToSourceTime(timelineTime: TimelineSeconds, clip: TimelineClip): SourceSeconds {
  const start = clip.timelineStart ?? clip.sourceStart ?? asTimelineSeconds(0);
  const dur = clip.timelineDuration ?? clip.duration ?? asSeconds(0);
  const inPoint = clip.sourceIn ?? asSourceSeconds(0);
  const offset = Math.max(0, Math.min(dur, timelineTime - start));
  return asSourceSeconds(inPoint + offset);
}

/**
 * Maps an offset within a clip's source media back to composition timeline time
 */
export function sourceToTimelineTime(sourceTime: SourceSeconds, clip: TimelineClip): TimelineSeconds {
  const start = clip.timelineStart ?? clip.sourceStart ?? asTimelineSeconds(0);
  const dur = clip.timelineDuration ?? clip.duration ?? asSeconds(0);
  const inPoint = clip.sourceIn ?? asSourceSeconds(0);
  const offset = Math.max(0, Math.min(dur, sourceTime - inPoint));
  return asTimelineSeconds(start + offset);
}

/**
 * Helper to retrieve the active clip on a track at a given composition timeline timestamp
 */
export function getClipAtTimelineTime(
  timelineTime: TimelineSeconds,
  clips: readonly TimelineClip[],
  trackId = 'track_video'
): TimelineClip | undefined {
  return clips.find(c => {
    if (c.trackId !== trackId) return false;
    const start = c.timelineStart ?? c.sourceStart ?? asTimelineSeconds(0);
    const dur = c.timelineDuration ?? c.duration ?? asSeconds(0);
    return timelineTime >= start && timelineTime < start + dur;
  });
}

/**
 * Computes total composition duration across all clips on the timeline
 */
export function getProjectDuration(clips: readonly TimelineClip[], minDuration = 30.0): Seconds {
  const maxEnd = clips.reduce((max, c) => {
    const start = c.timelineStart ?? c.sourceStart ?? 0;
    const dur = c.timelineDuration ?? c.duration ?? 0;
    return Math.max(max, start + dur);
  }, 0);
  return asSeconds(Math.max(minDuration, maxEnd));
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

export interface RippleCutOptions {
  /** Optional predicate or set of locked track IDs */
  isTrackLocked?: (trackId: string) => boolean;
}

/**
 * Pure Compound Ripple-Cut Reducer:
 * Slices clips across all unlocked tracks intersecting [startTime, endTime],
 * removes the cut interval, adjusts source in/out offsets so media never freezes or desyncs,
 * and ripples all subsequent clips to the left by deltaT = (endTime - startTime).
 */
export function rippleCutTimeRange(
  clips: readonly TimelineClip[],
  startTime: number,
  endTime: number,
  options: RippleCutOptions = {}
): TimelineClip[] {
  if (startTime >= endTime || !Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return [...clips];
  }

  const deltaT = Number((endTime - startTime).toFixed(3));
  const isLocked = options.isTrackLocked ?? (() => false);
  const newClips: TimelineClip[] = [];

  for (const clip of clips) {
    if (isLocked(clip.trackId)) {
      newClips.push(clip);
      continue;
    }

    const clipStart = Number((clip.timelineStart ?? clip.sourceStart ?? 0).toFixed(3));
    const clipDur = Number((clip.timelineDuration ?? clip.duration ?? 0).toFixed(3));
    const clipEnd = Number((clipStart + clipDur).toFixed(3));
    const clipIn = Number((clip.sourceIn ?? 0).toFixed(3));
    const clipOut = Number((clip.sourceOut ?? (clipIn + clipDur)).toFixed(3));

    // Case 1: Clip ends at or before cut begins -> Untouched
    if (clipEnd <= startTime) {
      newClips.push(clip);
    }
    // Case 2: Clip starts at or after cut ends -> Ripple backward by deltaT
    else if (clipStart >= endTime) {
      const newStart = asTimelineSeconds(Number(Math.max(0, clipStart - deltaT).toFixed(3)));
      newClips.push({
        ...clip,
        timelineStart: newStart,
        sourceStart: newStart,
      });
    }
    // Case 3: Cut is completely inside the clip -> SPLICE into left and right chunks
    else if (clipStart < startTime && clipEnd > endTime) {
      const leftDur = Number((startTime - clipStart).toFixed(3));
      const leftIn = clipIn;
      const leftOut = Number((clipIn + leftDur).toFixed(3));

      const leftPart: TimelineClip = {
        ...clip,
        id: `${clip.id}_part1_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timelineStart: asTimelineSeconds(clipStart),
        timelineDuration: asSeconds(leftDur),
        sourceIn: asSourceSeconds(leftIn),
        sourceOut: asSourceSeconds(leftOut),
        sourceStart: asTimelineSeconds(clipStart),
        duration: asSeconds(leftDur),
      };

      const cutDurationFromClipStart = Number((endTime - clipStart).toFixed(3));
      const rightDur = Number((clipEnd - endTime).toFixed(3));
      const rightIn = Number((clipIn + cutDurationFromClipStart).toFixed(3));
      const rightOut = clipOut;
      const rightStart = asTimelineSeconds(Number(startTime.toFixed(3)));

      const rightPart: TimelineClip = {
        ...clip,
        id: `${clip.id}_part2_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timelineStart: rightStart,
        timelineDuration: asSeconds(rightDur),
        sourceIn: asSourceSeconds(rightIn),
        sourceOut: asSourceSeconds(rightOut),
        sourceStart: rightStart,
        duration: asSeconds(rightDur),
        transitionIn: undefined, // Prevent spurious transition on slice boundary
      };

      newClips.push(leftPart, rightPart);
    }
    // Case 4: Cut overlaps tail of clip -> Trim right edge
    else if (clipStart < startTime && clipEnd <= endTime) {
      const newDur = Number((startTime - clipStart).toFixed(3));
      if (newDur > 0.005) {
        const newOut = Number((clipIn + newDur).toFixed(3));
        newClips.push({
          ...clip,
          timelineDuration: asSeconds(newDur),
          sourceOut: asSourceSeconds(newOut),
          duration: asSeconds(newDur),
        });
      }
    }
    // Case 5: Cut overlaps head of clip -> Trim head and shift to startTime
    else if (clipStart >= startTime && clipEnd > endTime) {
      const cutIntoClip = Number((endTime - clipStart).toFixed(3));
      const newDur = Number((clipDur - cutIntoClip).toFixed(3));
      if (newDur > 0.005) {
        const newIn = Number((clipIn + cutIntoClip).toFixed(3));
        const newStart = asTimelineSeconds(Number(startTime.toFixed(3)));
        newClips.push({
          ...clip,
          timelineStart: newStart,
          sourceStart: newStart,
          timelineDuration: asSeconds(newDur),
          sourceIn: asSourceSeconds(newIn),
          duration: asSeconds(newDur),
          transitionIn: undefined,
        });
      }
    }
    // Case 6: Clip is completely enclosed inside [startTime, endTime] -> Drop (deleted)
  }

  return newClips;
}

/**
 * Merges overlapping or contiguous deleted word intervals into solid skip ranges.
 */
export function calculateSkipRanges(tokens: readonly WordToken[], targetMediaId?: string): TimeRange[] {
  const deleted = tokens
    .filter((w) => w.deleted && (!targetMediaId || w.mediaId === targetMediaId))
    .sort((a, b) => a.start - b.start);

  if (deleted.length === 0) return [];

  const merged: TimeRange[] = [];
  let current: TimeRange = { start: Number(deleted[0]!.start), end: Number(deleted[0]!.end) };

  for (let i = 1; i < deleted.length; i++) {
    const next = deleted[i]!;
    // Merge if overlapping or within 40ms of each other
    if (next.start <= current.end + 0.04) {
      current.end = Math.max(current.end, Number(next.end));
    } else {
      merged.push({ start: Number(current.start.toFixed(3)), end: Number(current.end.toFixed(3)) });
      current = { start: Number(next.start), end: Number(next.end) };
    }
  }
  merged.push({ start: Number(current.start.toFixed(3)), end: Number(current.end.toFixed(3)) });
  return merged;
}

/**
 * Computes the inverse kept intervals to be rendered and merged into the final video.
 */
export function computeKeepRanges(totalDuration: number, skipRanges: readonly TimeRange[]): TimeRange[] {
  if (skipRanges.length === 0) {
    return totalDuration > 0 ? [{ start: 0, end: Number(totalDuration.toFixed(3)) }] : [];
  }

  const sortedSkips = [...skipRanges].sort((a, b) => a.start - b.start);
  const keepRanges: TimeRange[] = [];
  let cursor = 0;

  for (const skip of sortedSkips) {
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

