import { describe, it, expect } from 'vitest';
import {
  buildPlaybackSegments,
  virtualToSourceTime,
  timelineToSourceTime,
  sourceToTimelineTime,
  calculateSkipRanges,
  computeKeepRanges,
  rippleCutTimeRange,
  getClipAtTimelineTime,
  getProjectDuration,
  EPSILON_MERGE_SEC,
  MIN_SEGMENT_DURATION_SEC,
} from '../timelineEngine';
import {
  WordToken,
  TimelineClip,
  asSourceSeconds,
  asTimelineSeconds,
  asVirtualSeconds,
  asSeconds,
} from '../types';

describe('timelineEngine Core Mathematical Engine', () => {
  const createMockToken = (
    id: string,
    start: number,
    end: number,
    text: string = 'word',
    deleted: boolean = false
  ): WordToken => ({
    id,
    mediaId: 'media_test',
    text,
    start: asSourceSeconds(start),
    end: asSourceSeconds(end),
    deleted,
  });

  const createMockClip = (
    id: string,
    start: number,
    duration: number,
    trackId: string = 'track_video'
  ): TimelineClip => ({
    id,
    trackId,
    title: `Clip ${id}`,
    color: '#3B82F6',
    timelineStart: asTimelineSeconds(start),
    sourceStart: asTimelineSeconds(start),
    timelineDuration: asSeconds(duration),
    duration: asSeconds(duration),
    sourceIn: asSourceSeconds(0),
    sourceOut: asSourceSeconds(duration),
  });

  describe('buildPlaybackSegments', () => {
    it('returns empty result when tokens array is empty', () => {
      const res = buildPlaybackSegments([]);
      expect(res.segments).toEqual([]);
      expect(res.totalVirtualDuration).toBe(0);
      expect(res.totalSourceDuration).toBe(0);
    });

    it('rejects invalid, NaN, or inverted timestamps defensively', () => {
      const invalidTokens: WordToken[] = [
        createMockToken('t1', NaN, 1.0),
        createMockToken('t2', 1.0, 0.5), // Inverted: end < start
        createMockToken('t3', 1.0, 1.0), // Zero duration
        createMockToken('t4', 2.0, Infinity),
        createMockToken('t5', 3.0, 4.0), // Valid
      ];

      const res = buildPlaybackSegments(invalidTokens);
      expect(res.segments.length).toBe(1);
      expect(res.segments[0].sourceStart).toBe(3.0);
      expect(res.segments[0].sourceEnd).toBe(4.0);
    });

    it('coalesces adjacent tokens separated by less than EPSILON_MERGE_SEC (85ms)', () => {
      const gap = EPSILON_MERGE_SEC - 0.02; // 65ms gap
      const tokens: WordToken[] = [
        createMockToken('t1', 1.0, 2.0),
        createMockToken('t2', 2.0 + gap, 3.0),
      ];

      const res = buildPlaybackSegments(tokens);
      expect(res.segments.length).toBe(1);
      expect(res.segments[0].sourceStart).toBe(1.0);
      expect(res.segments[0].sourceEnd).toBe(3.0);
    });

    it('does not coalesce tokens separated by more than EPSILON_MERGE_SEC', () => {
      const largeGap = 0.5; // 500ms pause
      const tokens: WordToken[] = [
        createMockToken('t1', 1.0, 2.0),
        createMockToken('t2', 2.0 + largeGap, 3.5),
      ];

      const res = buildPlaybackSegments(tokens);
      expect(res.segments.length).toBe(2);
      expect(res.segments[0].sourceStart).toBe(1.0);
      expect(res.segments[0].sourceEnd).toBe(2.0);
      expect(res.segments[1].sourceStart).toBe(2.5);
      expect(res.segments[1].sourceEnd).toBe(3.5);
    });

    it('discards segments shorter than MIN_SEGMENT_DURATION_SEC (30ms decoder fault guard)', () => {
      const tinyDuration = MIN_SEGMENT_DURATION_SEC - 0.01; // 20ms token
      const tokens: WordToken[] = [
        createMockToken('t_tiny', 1.0, 1.0 + tinyDuration),
      ];

      const res = buildPlaybackSegments(tokens);
      expect(res.segments.length).toBe(0);
    });

    it('correctly handles deletion and calculates timeSavedSec', () => {
      const tokens: WordToken[] = [
        createMockToken('t1', 0.0, 2.0, 'Keep'),
        createMockToken('t2', 2.2, 4.0, 'Delete', true), // 1.8s deleted
        createMockToken('t3', 4.2, 6.0, 'Keep'),
      ];

      const res = buildPlaybackSegments(tokens);
      expect(res.segments.length).toBe(2);
      expect(res.segments[0].sourceStart).toBe(0.0);
      expect(res.segments[0].sourceEnd).toBe(2.0);
      expect(res.segments[1].sourceStart).toBe(4.2);
      expect(res.segments[1].sourceEnd).toBe(6.0);
      expect(res.timeSavedSec).toBeGreaterThanOrEqual(1.8);
    });
  });

  describe('virtualToSourceTime Mapping Across Cuts', () => {
    it('accurately maps virtual timeline time to source time across cuts', () => {
      const tokens: WordToken[] = [
        createMockToken('t1', 0.0, 5.0),
        createMockToken('t2', 5.0, 10.0, 'cut', true), // 5.0 to 10.0 deleted
        createMockToken('t3', 10.0, 15.0),
      ];

      const { segments } = buildPlaybackSegments(tokens);

      // Virtual 2.0 -> Source 2.0 (inside segment 1)
      expect(virtualToSourceTime(asVirtualSeconds(2.0), segments)).toBe(2.0);

      // Virtual 5.1 -> Source 10.1 (inside segment 2 after cut)
      expect(virtualToSourceTime(asVirtualSeconds(5.1), segments)).toBeCloseTo(10.1);

      // Virtual 7.0 -> Source 12.0
      expect(virtualToSourceTime(asVirtualSeconds(7.0), segments)).toBe(12.0);
    });
  });

  describe('timelineToSourceTime & sourceToTimelineTime within TimelineClip', () => {
    it('converts timeline time to clip internal source time and vice versa', () => {
      const clip = createMockClip('c1', 10.0, 5.0); // starts at 10s on timeline, 5s long
      // At timeline 12.0s -> clip offset is 2.0s
      expect(timelineToSourceTime(asTimelineSeconds(12.0), clip)).toBe(2.0);

      // Inverse: clip offset 2.0s -> timeline 12.0s
      expect(sourceToTimelineTime(asSourceSeconds(2.0), clip)).toBe(12.0);
    });
  });

  describe('calculateSkipRanges and computeKeepRanges', () => {
    it('produces complementary skip and keep ranges', () => {
      const tokens: WordToken[] = [
        createMockToken('t1', 0.0, 2.0, 'A'),
        createMockToken('t2', 2.0, 4.0, 'B', true), // Deleted 2.0 - 4.0
        createMockToken('t3', 4.0, 6.0, 'C'),
      ];

      const skips = calculateSkipRanges(tokens);
      expect(skips.length).toBe(1);
      expect(skips[0].start).toBe(2.0);
      expect(skips[0].end).toBe(4.0);

      const keeps = computeKeepRanges(6.0, skips);
      expect(keeps.length).toBe(2);
      expect(keeps[0].start).toBe(0.0);
      expect(keeps[0].end).toBe(2.0);
      expect(keeps[1].start).toBe(4.0);
      expect(keeps[1].end).toBe(6.0);
    });
  });

  describe('rippleCutTimeRange on Clips', () => {
    it('splits a clip when cut is entirely within the clip', () => {
      const clips: TimelineClip[] = [
        createMockClip('c1', 0.0, 10.0), // 0.0 to 10.0
      ];

      // Cut 3.0 to 6.0
      const result = rippleCutTimeRange(clips, 3.0, 6.0);
      expect(result.length).toBe(2);

      // Left part: 0.0 to 3.0 (duration 3.0)
      expect(result[0].timelineStart).toBe(0.0);
      expect(result[0].timelineDuration).toBe(3.0);

      // Right part: ripples forward to 3.0, duration 4.0
      expect(result[1].timelineStart).toBe(3.0);
      expect(result[1].timelineDuration).toBe(4.0);
      expect(result[1].sourceIn).toBe(6.0);
    });

    it('completely drops clip when enclosed in cut range', () => {
      const clips: TimelineClip[] = [
        createMockClip('c1', 2.0, 2.0), // 2.0 to 4.0
      ];

      const result = rippleCutTimeRange(clips, 1.0, 5.0);
      expect(result.length).toBe(0);
    });
  });

  describe('getClipAtTimelineTime & getProjectDuration', () => {
    it('finds clip by time on specific track', () => {
      const clips: TimelineClip[] = [
        createMockClip('v1', 0.0, 5.0, 'track_video'),
        createMockClip('a1', 0.0, 5.0, 'track_audio'),
      ];

      const found = getClipAtTimelineTime(asTimelineSeconds(2.5), clips, 'track_video');
      expect(found?.id).toBe('v1');
    });

    it('calculates total project duration correctly', () => {
      const clips: TimelineClip[] = [
        createMockClip('c1', 0.0, 10.0),
        createMockClip('c2', 10.0, 25.0),
      ];

      // End is 35.0s, which is > minDuration (30s)
      expect(getProjectDuration(clips)).toBe(35.0);
    });
  });
});
