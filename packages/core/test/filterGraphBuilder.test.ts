import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAssTimestamp,
  generateAssSubtitleScript,
  generateConcatDemuxerList,
  generateFfmpegFilterComplex,
  WordToken,
  PlaybackSegment,
  asSourceSeconds,
  asVirtualSeconds,
  asSeconds,
} from '../src/index';

test('1. formatAssTimestamp converts seconds to H:MM:SS.cs standard ASS format', () => {
  assert.equal(formatAssTimestamp(0), '0:00:00.00');
  assert.equal(formatAssTimestamp(1.234), '0:00:01.23');
  assert.equal(formatAssTimestamp(65.789), '0:01:05.79');
  assert.equal(formatAssTimestamp(3661.05), '1:01:01.05');
  assert.equal(formatAssTimestamp(-5), '0:00:00.00'); // Negative guard
});

test('2. generateAssSubtitleScript filters deleted & pause tokens and formats dialogues', () => {
  const tokens: WordToken[] = [
    { id: '1', text: 'Hello', start: asSourceSeconds(1.0), end: asSourceSeconds(1.5), deleted: false },
    { id: '2', text: 'um', start: asSourceSeconds(1.55), end: asSourceSeconds(1.85), deleted: true, isFiller: true },
    { id: 'p1', text: '[0.8s pause]', start: asSourceSeconds(1.97), end: asSourceSeconds(2.77), deleted: false, isPause: true },
    { id: '3', text: 'World', start: asSourceSeconds(2.8), end: asSourceSeconds(3.3), deleted: false },
  ];

  const ass = generateAssSubtitleScript(tokens);

  assert.ok(ass.includes('[Script Info]'));
  assert.ok(ass.includes('[V4+ Styles]'));
  assert.ok(ass.includes('[Events]'));
  assert.ok(ass.includes('Dialogue: 0,0:00:01.00,0:00:01.50,ScarletDefault,,0,0,0,,Hello'));
  assert.ok(ass.includes('Dialogue: 0,0:00:02.80,0:00:03.30,ScarletDefault,,0,0,0,,World'));
  // Must NOT include deleted "um" or pause token
  assert.ok(!ass.includes('um'));
  assert.ok(!ass.includes('[0.8s pause]'));
});

test('3. generateConcatDemuxerList generates valid ffconcat manifest with inpoints and outpoints', () => {
  const segments: PlaybackSegment[] = [
    {
      id: 'seg_1',
      sourceStart: asSourceSeconds(0.0),
      sourceEnd: asSourceSeconds(5.25),
      virtualStart: asVirtualSeconds(0.0),
      virtualEnd: asVirtualSeconds(5.25),
      duration: asSeconds(5.25),
    },
    {
      id: 'seg_2',
      sourceStart: asSourceSeconds(7.5),
      sourceEnd: asSourceSeconds(12.0),
      virtualStart: asVirtualSeconds(5.25),
      virtualEnd: asVirtualSeconds(9.75),
      duration: asSeconds(4.5),
    },
  ];

  const manifest = generateConcatDemuxerList(segments, 'input_video.mp4');

  assert.ok(manifest.startsWith('ffconcat version 1.0'));
  assert.ok(manifest.includes("file 'input_video.mp4'\ninpoint 0.000\noutpoint 5.250"));
  assert.ok(manifest.includes("file 'input_video.mp4'\ninpoint 7.500\noutpoint 12.000"));
});

test('4. generateFfmpegFilterComplex builds single-pass concat graph across multiple cuts', () => {
  const segments: PlaybackSegment[] = [
    {
      id: 's1',
      sourceStart: asSourceSeconds(1.0),
      sourceEnd: asSourceSeconds(4.0),
      virtualStart: asVirtualSeconds(0.0),
      virtualEnd: asVirtualSeconds(3.0),
      duration: asSeconds(3.0),
    },
    {
      id: 's2',
      sourceStart: asSourceSeconds(6.0),
      sourceEnd: asSourceSeconds(9.0),
      virtualStart: asVirtualSeconds(3.0),
      virtualEnd: asVirtualSeconds(6.0),
      duration: asSeconds(3.0),
    },
  ];

  const result = generateFfmpegFilterComplex(segments, {
    subtitleVirtualFileName: 'subs.ass',
  });

  assert.equal(result.segmentCount, 2);
  assert.ok(result.filterComplex.includes('[0:v]trim=start=1.000:end=4.000,setpts=PTS-STARTPTS[v0]'));
  assert.ok(result.filterComplex.includes('[0:a]atrim=start=1.000:end=4.000,asetpts=PTS-STARTPTS[a0]'));
  assert.ok(result.filterComplex.includes('[0:v]trim=start=6.000:end=9.000,setpts=PTS-STARTPTS[v1]'));
  assert.ok(result.filterComplex.includes('[v0][a0][v1][a1]concat=n=2:v=1:a=1[vconcat][outa]'));
  assert.ok(result.filterComplex.includes("[vconcat]ass='subs.ass'[outv]"));
  assert.equal(result.videoMap, '[outv]');
  assert.equal(result.audioMap, '[outa]');
});
