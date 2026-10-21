import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlaybackSegments,
  getNextValidTime,
  sourceToVirtualTime,
  virtualToSourceTime,
  EPSILON_MERGE_SEC,
  MIN_SEGMENT_DURATION_SEC,
  TIME_EPSILON_SEC,
} from '../src/timelineEngine.ts';
import {
  WordToken,
  validateTimelineClip,
  validateWordToken,
  asSourceSeconds,
  asTimelineSeconds,
  asSeconds,
} from '../src/types.ts';

test('1. Unsorted input and zero/negative length tokens normalization', () => {
  const unsortedTokens: WordToken[] = [
    { id: 'w3', text: 'three', start: asSourceSeconds(2.0), end: asSourceSeconds(3.0), deleted: false },
    { id: 'w1', text: 'one', start: asSourceSeconds(0.0), end: asSourceSeconds(1.0), deleted: false },
    { id: 'invalid_zero', text: 'zero', start: asSourceSeconds(1.5), end: asSourceSeconds(1.5), deleted: false }, // Should be dropped
    { id: 'invalid_neg', text: 'neg', start: asSourceSeconds(1.8), end: asSourceSeconds(1.2), deleted: false },   // Should be dropped
    { id: 'w2', text: 'two', start: asSourceSeconds(1.05), end: asSourceSeconds(1.8), deleted: false },
  ];

  const result = buildPlaybackSegments(unsortedTokens);
  // w1 (0-1.0), gap 0.05s <= 0.085s to w2 (1.05-1.8) -> coalesces into 0-1.8
  // gap from 1.8 to w3 (2.0) is 0.2s > 0.085s -> separate segment 2.0-3.0
  assert.equal(result.segments.length, 2);
  assert.equal(result.segments[0]?.sourceStart, 0.0);
  assert.equal(result.segments[0]?.sourceEnd, 1.8);
  assert.equal(result.segments[1]?.sourceStart, 2.0);
  assert.equal(result.segments[1]?.sourceEnd, 3.0);
});

test('2. Micro-gap coalescing (<= 85ms merges, > 85ms splits)', () => {
  const tokens: WordToken[] = [
    { id: 't1', text: 'A', start: asSourceSeconds(0.0), end: asSourceSeconds(1.0), deleted: false },
    { id: 't2', text: 'B', start: asSourceSeconds(1.08), end: asSourceSeconds(2.0), deleted: false }, // Gap 80ms <= 85ms -> Merge
    { id: 't3', text: 'C', start: asSourceSeconds(2.10), end: asSourceSeconds(3.0), deleted: false }, // Gap 100ms > 85ms -> Split
  ];

  const result = buildPlaybackSegments(tokens);
  assert.equal(result.segments.length, 2);
  assert.equal(result.segments[0]?.sourceStart, 0.0);
  assert.equal(result.segments[0]?.sourceEnd, 2.0);
  assert.equal(result.segments[1]?.sourceStart, 2.1);
  assert.equal(result.segments[1]?.sourceEnd, 3.0);
});

test('3. Deleted first, middle, and last tokens with ripple virtual mapping', () => {
  const tokens: WordToken[] = [
    { id: 't1', text: 'Cut1', start: asSourceSeconds(0.0), end: asSourceSeconds(1.0), deleted: true },  // Deleted first
    { id: 't2', text: 'Keep1', start: asSourceSeconds(1.0), end: asSourceSeconds(2.0), deleted: false },
    { id: 't3', text: 'Cut2', start: asSourceSeconds(2.0), end: asSourceSeconds(3.0), deleted: true },   // Deleted middle
    { id: 't4', text: 'Keep2', start: asSourceSeconds(3.0), end: asSourceSeconds(4.5), deleted: false },
    { id: 't5', text: 'Cut3', start: asSourceSeconds(4.5), end: asSourceSeconds(6.0), deleted: true },  // Deleted last
  ];

  const result = buildPlaybackSegments(tokens);
  assert.equal(result.segments.length, 2);

  // Segment 1: source [1.0, 2.0], duration 1.0 -> virtual [0, 1.0]
  assert.equal(result.segments[0]?.sourceStart, 1.0);
  assert.equal(result.segments[0]?.sourceEnd, 2.0);
  assert.equal(result.segments[0]?.virtualStart, 0);
  assert.equal(result.segments[0]?.virtualEnd, 1.0);

  // Segment 2: source [3.0, 4.5], duration 1.5 -> virtual [1.0, 2.5]
  assert.equal(result.segments[1]?.sourceStart, 3.0);
  assert.equal(result.segments[1]?.sourceEnd, 4.5);
  assert.equal(result.segments[1]?.virtualStart, 1.0);
  assert.equal(result.segments[1]?.virtualEnd, 2.5);

  assert.equal(result.totalVirtualDuration, 2.5);
  assert.equal(result.totalSourceDuration, 6.0);
  assert.equal(result.timeSavedSec, 3.5);
});

test('4. 30ms hardware decoder fault guard discards micro-blips', () => {
  const tokens: WordToken[] = [
    { id: 't1', text: 'Normal', start: asSourceSeconds(0.0), end: asSourceSeconds(1.0), deleted: false },
    { id: 't2', text: 'MicroBlip', start: asSourceSeconds(2.0), end: asSourceSeconds(2.02), deleted: false }, // 20ms < 30ms guard!
    { id: 't3', text: 'Valid', start: asSourceSeconds(3.0), end: asSourceSeconds(4.0), deleted: false },
  ];

  const result = buildPlaybackSegments(tokens);
  assert.equal(result.segments.length, 2);
  assert.equal(result.segments[0]?.sourceStart, 0.0);
  assert.equal(result.segments[0]?.sourceEnd, 1.0);
  assert.equal(result.segments[1]?.sourceStart, 3.0);
  assert.equal(result.segments[1]?.sourceEnd, 4.0);
});

test('5. Binary search leap across cut intervals and boundary epsilon', () => {
  const tokens: WordToken[] = [
    { id: 't1', text: 'A', start: asSourceSeconds(1.0), end: asSourceSeconds(2.0), deleted: false },
    { id: 't2', text: 'Cut', start: asSourceSeconds(2.0), end: asSourceSeconds(4.0), deleted: true },
    { id: 't3', text: 'B', start: asSourceSeconds(4.0), end: asSourceSeconds(6.0), deleted: false },
  ];

  const { segments } = buildPlaybackSegments(tokens);

  // Before first segment -> jumps to first segment start (1.0)
  const jumpBefore = getNextValidTime(asSourceSeconds(0.5), segments);
  assert.equal(jumpBefore.didJump, true);
  assert.equal(jumpBefore.nextTime, 1.0);

  // Inside segment 1 -> no jump
  const inside1 = getNextValidTime(asSourceSeconds(1.5), segments);
  assert.equal(inside1.didJump, false);
  assert.equal(inside1.nextTime, 1.5);

  // In cut interval (2.5s) -> leaps forward to 4.0s
  const jumpCut = getNextValidTime(asSourceSeconds(2.5), segments);
  assert.equal(jumpCut.didJump, true);
  assert.equal(jumpCut.nextTime, 4.0);

  // Boundary epsilon (within 5ms of boundary) -> no jump
  const epsilonBoundary = getNextValidTime(asSourceSeconds(2.003), segments);
  assert.equal(epsilonBoundary.didJump, false);
});

test('6. Bijective mapping invertibility between source and virtual domains', () => {
  const tokens: WordToken[] = [
    { id: 't1', text: 'Seg1', start: asSourceSeconds(5.0), end: asSourceSeconds(10.0), deleted: false },
    { id: 'cut', text: 'Cut', start: asSourceSeconds(10.0), end: asSourceSeconds(20.0), deleted: true },
    { id: 't2', text: 'Seg2', start: asSourceSeconds(20.0), end: asSourceSeconds(25.0), deleted: false },
  ];

  const { segments } = buildPlaybackSegments(tokens);

  // Test source -> virtual -> source
  const sourcePoint1 = asSourceSeconds(7.5);
  const virt1 = sourceToVirtualTime(sourcePoint1, segments);
  assert.equal(virt1, 2.5); // 5.0s into first segment
  const backSource1 = virtualToSourceTime(virt1, segments);
  assert.equal(backSource1, sourcePoint1);

  const sourcePoint2 = asSourceSeconds(22.0);
  const virt2 = sourceToVirtualTime(sourcePoint2, segments);
  assert.equal(virt2, 7.0); // 5.0 (seg1) + 2.0 (seg2) = 7.0
  const backSource2 = virtualToSourceTime(virt2, segments);
  assert.equal(backSource2, sourcePoint2);
});

test('7. Domain validators accept valid data and throw on invalid data', () => {
  // Valid token
  assert.doesNotThrow(() => {
    validateWordToken({ id: 't', text: 'hi', start: asSourceSeconds(0), end: asSourceSeconds(1), deleted: false });
  });

  // Invalid token (end < start)
  assert.throws(() => {
    validateWordToken({ id: 't', text: 'hi', start: asSourceSeconds(2), end: asSourceSeconds(1), deleted: false });
  });

  // Valid clip
  assert.doesNotThrow(() => {
    validateTimelineClip({
      id: 'c1',
      trackId: 'video',
      title: 'Clip',
      timelineStart: asTimelineSeconds(0),
      timelineDuration: asSeconds(5),
      sourceIn: asSourceSeconds(0),
      sourceOut: asSourceSeconds(5),
      color: '#fff',
    });
  });

  // Invalid clip (sourceOut < sourceIn)
  assert.throws(() => {
    validateTimelineClip({
      id: 'c1',
      trackId: 'video',
      title: 'Clip',
      timelineStart: asTimelineSeconds(0),
      timelineDuration: asSeconds(5),
      sourceIn: asSourceSeconds(5),
      sourceOut: asSourceSeconds(2),
      color: '#fff',
    });
  });

  // Invalid clip (source duration mismatch with composition duration)
  assert.throws(() => {
    validateTimelineClip({
      id: 'c1',
      trackId: 'video',
      title: 'Clip',
      timelineStart: asTimelineSeconds(0),
      timelineDuration: asSeconds(5),
      sourceIn: asSourceSeconds(0),
      sourceOut: asSourceSeconds(10), // 10 != 5!
      color: '#fff',
    });
  });
});
