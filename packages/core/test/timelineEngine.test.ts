import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlaybackSegments,
  getNextValidTime,
  sourceToVirtualTime,
  virtualToSourceTime,
  rippleCutTimeRange,
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

test('8. Asset-scoped ripple segments isolates cuts per media asset', () => {
  const multiAssetTokens: WordToken[] = [
    { id: 'a1_w1', mediaId: 'asset_1', text: 'Asset1 Keep', start: asSourceSeconds(0), end: asSourceSeconds(2), deleted: false },
    { id: 'a1_w2', mediaId: 'asset_1', text: 'Asset1 Cut', start: asSourceSeconds(2), end: asSourceSeconds(4), deleted: true },
    { id: 'a1_w3', mediaId: 'asset_1', text: 'Asset1 Keep2', start: asSourceSeconds(4), end: asSourceSeconds(6), deleted: false },
    { id: 'a2_w1', mediaId: 'asset_2', text: 'Asset2 Keep', start: asSourceSeconds(0), end: asSourceSeconds(5), deleted: false },
    { id: 'untagged_w1', text: 'Untagged Legacy', start: asSourceSeconds(10), end: asSourceSeconds(12), deleted: false },
  ];

  // Scoped to asset_1: reflects the cut interval and excludes untagged tokens
  const res1 = buildPlaybackSegments(multiAssetTokens, 'asset_1');
  assert.equal(res1.segments.length, 2);
  assert.equal(res1.segments[0]?.mediaId, 'asset_1');
  assert.equal(res1.segments[0]?.sourceStart, 0);
  assert.equal(res1.segments[0]?.sourceEnd, 2);
  assert.equal(res1.segments[1]?.sourceStart, 4);
  assert.equal(res1.segments[1]?.sourceEnd, 6);

  // Scoped to asset_2: unaffected by asset_1 cuts, excludes untagged tokens
  const res2 = buildPlaybackSegments(multiAssetTokens, 'asset_2');
  assert.equal(res2.segments.length, 1);
  assert.equal(res2.segments[0]?.mediaId, 'asset_2');
  assert.equal(res2.segments[0]?.sourceStart, 0);
  assert.equal(res2.segments[0]?.sourceEnd, 5);

  // Unscoped: includes all valid tokens including legacy untagged tokens
  const resGlobal = buildPlaybackSegments(multiAssetTokens);
  assert.equal(resGlobal.segments.length, 2);
  assert.equal(resGlobal.segments[1]?.sourceStart, 10);
  assert.equal(resGlobal.segments[1]?.sourceEnd, 12);
});

test('9. Non-deleted pauses coalesce into continuous playback without seek jumps', () => {
  const tokensWithPauses: WordToken[] = [
    { id: 'w1', text: 'Singing', start: asSourceSeconds(0.0), end: asSourceSeconds(1.5), deleted: false },
    // 3.0s instrumental guitar beat / pause (non-deleted by default)
    { id: 'p1', text: '⏸ 3.0s', start: asSourceSeconds(1.5), end: asSourceSeconds(4.5), deleted: false, isPause: true },
    { id: 'w2', text: 'Chorus', start: asSourceSeconds(4.5), end: asSourceSeconds(6.0), deleted: false },
  ];

  // Continuous playback: non-deleted pause coalesces seamlessly into 1 continuous segment
  const result = buildPlaybackSegments(tokensWithPauses);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0]?.sourceStart, 0.0);
  assert.equal(result.segments[0]?.sourceEnd, 6.0);
  assert.equal(result.segments[0]?.duration, 6.0);
  assert.equal(result.totalVirtualDuration, 6.0);
  assert.equal(result.timeSavedSec, 0.0);

  // Video player playing at 3.0s (in the middle of the pause) should NOT jump
  const jumpInfo = getNextValidTime(asSourceSeconds(3.0), result.segments);
  assert.equal(jumpInfo.nextTime, 3.0); // Continuous, no jump!
  assert.equal(jumpInfo.didJump, false);
});

test('10. Marking pause as deleted performs virtual ripple cut across the silence', () => {
  const tokensWithCutPause: WordToken[] = [
    { id: 'w1', text: 'Singing', start: asSourceSeconds(0.0), end: asSourceSeconds(1.5), deleted: false },
    // Pause explicitly marked deleted by user (e.g. clicked or Backspace)
    { id: 'p1', text: '⏸ 3.0s', start: asSourceSeconds(1.5), end: asSourceSeconds(4.5), deleted: true, isPause: true },
    { id: 'w2', text: 'Chorus', start: asSourceSeconds(4.5), end: asSourceSeconds(6.0), deleted: false },
  ];

  const result = buildPlaybackSegments(tokensWithCutPause);
  assert.equal(result.segments.length, 2);
  // Segment 1: [0.0, 1.5]
  assert.equal(result.segments[0]?.sourceStart, 0.0);
  assert.equal(result.segments[0]?.sourceEnd, 1.5);
  // Segment 2: [4.5, 6.0]
  assert.equal(result.segments[1]?.sourceStart, 4.5);
  assert.equal(result.segments[1]?.sourceEnd, 6.0);

  assert.equal(result.totalVirtualDuration, 3.0);
  assert.equal(result.totalSourceDuration, 6.0);
  assert.equal(result.timeSavedSec, 3.0);

  // Video player hitting 2.0s should jump to 4.5s
  const jumpInfo = getNextValidTime(asSourceSeconds(2.0), result.segments);
  assert.equal(jumpInfo.nextTime, 4.5);
  assert.equal(jumpInfo.didJump, true);
});

test('11. Synthetic overlay clips (effects, filters, transitions, titles) allow stretching without crash', () => {
  // Stretched filter clip whose duration expanded from 2s to 6s
  const stretchedFilter: TimelineClip = {
    id: 'eff_1',
    trackId: 'track_effects',
    title: '⚡ Cyberpunk',
    timelineStart: asTimelineSeconds(1.0),
    timelineDuration: asSeconds(6.0),
    sourceIn: asSourceSeconds(0),
    sourceOut: asSourceSeconds(6.0),
    color: '#EB3B5A',
  };

  // Must not throw despite source range being synthetic
  assert.doesNotThrow(() => validateTimelineClip(stretchedFilter));

  const stretchedTitle: TimelineClip = {
    id: 'title_1',
    trackId: 'track_title',
    title: 'Cinematic Title',
    timelineStart: asTimelineSeconds(0.5),
    timelineDuration: asSeconds(7.5),
    color: '#8854D0',
  };

  assert.doesNotThrow(() => validateTimelineClip(stretchedTitle));
});

test('12. rippleCutTimeRange splits mid-clip chunk, trims head/tail, drops enclosed, and ripples trailing clips', () => {
  const clips: TimelineClip[] = [
    {
      id: 'clip_before',
      trackId: 'track_video',
      title: 'Before Clip',
      timelineStart: asTimelineSeconds(0.0),
      timelineDuration: asSeconds(2.0),
      sourceIn: asSourceSeconds(0.0),
      sourceOut: asSourceSeconds(2.0),
      color: '#4B6584',
    },
    {
      id: 'clip_target',
      trackId: 'track_video',
      title: 'Target Clip',
      timelineStart: asTimelineSeconds(2.0),
      timelineDuration: asSeconds(8.0), // 2.0 -> 10.0
      sourceIn: asSourceSeconds(5.0),
      sourceOut: asSourceSeconds(13.0),
      color: '#4B6584',
    },
    {
      id: 'clip_trailing',
      trackId: 'track_video',
      title: 'Trailing Clip',
      timelineStart: asTimelineSeconds(10.0),
      timelineDuration: asSeconds(4.0), // 10.0 -> 14.0
      sourceIn: asSourceSeconds(0.0),
      sourceOut: asSourceSeconds(4.0),
      color: '#4B6584',
    },
  ];

  // Cut 4.0s -> 6.0s (a 2.0s slice inside clip_target)
  const cutResult = rippleCutTimeRange(clips, 4.0, 6.0);

  // clip_before: 0.0 -> 2.0 (untouched)
  // clip_target: spliced into part1 (2.0 -> 4.0, dur 2.0, sourceIn 5.0, sourceOut 7.0)
  //              and part2 (4.0 -> 6.0, dur 4.0, sourceIn 5.0 + 4.0 = 9.0, sourceOut 13.0)
  // clip_trailing: rippled backward by 2.0s -> starts at 8.0s, ends at 12.0s
  assert.equal(cutResult.length, 4);

  const before = cutResult[0]!;
  assert.equal(before.id, 'clip_before');
  assert.equal(before.timelineStart, 0.0);
  assert.equal(before.timelineDuration, 2.0);

  const part1 = cutResult[1]!;
  assert.equal(part1.timelineStart, 2.0);
  assert.equal(part1.timelineDuration, 2.0);
  assert.equal(part1.sourceIn, 5.0);
  assert.equal(part1.sourceOut, 7.0);

  const part2 = cutResult[2]!;
  assert.equal(part2.timelineStart, 4.0);
  assert.equal(part2.timelineDuration, 4.0);
  assert.equal(part2.sourceIn, 9.0);
  assert.equal(part2.sourceOut, 13.0);

  const trailing = cutResult[3]!;
  assert.equal(trailing.id, 'clip_trailing');
  assert.equal(trailing.timelineStart, 8.0);
  assert.equal(trailing.timelineDuration, 4.0);
  assert.equal(trailing.sourceIn, 0.0);
  assert.equal(trailing.sourceOut, 4.0);

  // Validate all generated clips against domain validator
  for (const c of cutResult) {
    assert.doesNotThrow(() => validateTimelineClip(c));
  }
});

test('13. rippleCutTimeRange respects locked tracks', () => {
  const clips: TimelineClip[] = [
    {
      id: 'clip_video',
      trackId: 'track_video',
      title: 'Video',
      timelineStart: asTimelineSeconds(0.0),
      timelineDuration: asSeconds(10.0),
      sourceIn: asSourceSeconds(0.0),
      sourceOut: asSourceSeconds(10.0),
      color: '#4B6584',
    },
    {
      id: 'clip_music',
      trackId: 'track_audio',
      title: 'Music (Locked)',
      timelineStart: asTimelineSeconds(0.0),
      timelineDuration: asSeconds(10.0),
      sourceIn: asSourceSeconds(0.0),
      sourceOut: asSourceSeconds(10.0),
      color: '#10AC84',
    },
  ];

  const result = rippleCutTimeRange(clips, 2.0, 5.0, {
    isTrackLocked: (trackId) => trackId === 'track_audio',
  });

  // track_audio must remain completely untouched
  const music = result.find(c => c.trackId === 'track_audio');
  assert.ok(music);
  assert.equal(music.timelineStart, 0.0);
  assert.equal(music.timelineDuration, 10.0);

  // track_video was sliced into 2 parts
  const videoParts = result.filter(c => c.trackId === 'track_video');
  assert.equal(videoParts.length, 2);
  assert.equal(videoParts[0]!.timelineDuration, 2.0);
  assert.equal(videoParts[1]!.timelineDuration, 5.0);
});




