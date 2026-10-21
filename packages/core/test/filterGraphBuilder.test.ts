import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAssTimestamp,
  generateAssSubtitleScript,
  generateConcatDemuxerList,
  generateFfmpegFilterComplex,
  buildVideoScaleFilter,
  buildPlaybackSegments,
  processVocalPurifierPcm,
  computeAudioDuckingGain,
  synthesizeOverdubWavBytes,
  summarizeTranscriptTokens,
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
  assert.equal(formatAssTimestamp(-5), '0:00:00.00');
});

test('2. generateAssSubtitleScript filters deleted & pause tokens and maps virtual timestamps across cuts', () => {
  const tokens: WordToken[] = [
    { id: '1', text: 'Hello', start: asSourceSeconds(0.0), end: asSourceSeconds(1.0), deleted: false },
    { id: '2', text: 'um', start: asSourceSeconds(1.0), end: asSourceSeconds(3.0), deleted: true, isFiller: true },
    { id: '3', text: 'World', replacementText: 'Galaxy', isEdited: true, start: asSourceSeconds(3.0), end: asSourceSeconds(4.0), deleted: false },
  ];

  const { segments } = buildPlaybackSegments(tokens);
  const ass = generateAssSubtitleScript(tokens, {}, segments);

  assert.ok(ass.includes('[Script Info]'));
  assert.ok(ass.includes('Dialogue: 0,0:00:00.00,0:00:01.00,ScarletDefault,,0,0,0,,Hello'));
  // Because [1.0, 3.0] was cut, 'Galaxy' at source [3.0, 4.0] maps to virtual [1.0, 2.0]
  assert.ok(ass.includes('Dialogue: 0,0:00:01.00,0:00:02.00,ScarletDefault,,0,0,0,,Galaxy'));
  assert.ok(!ass.includes('um'));
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

test('4. generateFfmpegFilterComplex builds single-pass concat graph across multiple cuts and scale filters', () => {
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

  const scaleFilter = buildVideoScaleFilter('1080p', '9:16');
  assert.equal(scaleFilter, 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black');

  const result = generateFfmpegFilterComplex(segments, {
    subtitleVirtualFileName: 'subs.ass',
    videoScaleFilter: scaleFilter,
  });

  assert.equal(result.segmentCount, 2);
  assert.ok(result.filterComplex.includes('[0:v]trim=start=1.000:end=4.000,setpts=PTS-STARTPTS[v0]'));
  assert.ok(result.filterComplex.includes('[0:a]atrim=start=1.000:end=4.000,asetpts=PTS-STARTPTS[a0]'));
  assert.ok(result.filterComplex.includes('[0:v]trim=start=6.000:end=9.000,setpts=PTS-STARTPTS[v1]'));
  assert.ok(result.filterComplex.includes('[v0][a0][v1][a1]concat=n=2:v=1:a=1[vconcat][outa]'));
  assert.ok(result.filterComplex.includes("[vscaled]ass='subs.ass'[outv]"));
  assert.equal(result.videoMap, '[outv]');
  assert.equal(result.audioMap, '[outa]');
});

test('5. Vocal purifier DSP, WAV RIFF TTS overdubbing, and TF-IDF summarizer operate deterministically', () => {
  const rawPcm = new Float32Array(1600);
  for (let i = 0; i < rawPcm.length; i++) {
    rawPcm[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.5;
  }
  const purified = processVocalPurifierPcm(rawPcm, 16000);
  assert.equal(purified.length, 1600);

  const duckGain = computeAudioDuckingGain(1.5, [{ start: 1.0, end: 2.0, deleted: false }]);
  assert.equal(duckGain, 0.22);

  const { wavBytes, prosodyRate } = synthesizeOverdubWavBytes('symphony', 0.65, 16000);
  assert.ok(wavBytes.byteLength > 44);
  assert.ok(prosodyRate >= 0.65 && prosodyRate <= 1.75);

  const summary = summarizeTranscriptTokens([
    { id: '1', text: 'ScarletCut', start: asSourceSeconds(0), end: asSourceSeconds(0.5), deleted: false },
    { id: '2', text: 'enables', start: asSourceSeconds(0.5), end: asSourceSeconds(1.0), deleted: false },
    { id: '3', text: 'instant', start: asSourceSeconds(1.0), end: asSourceSeconds(1.5), deleted: false },
    { id: '4', text: 'editing.', start: asSourceSeconds(1.5), end: asSourceSeconds(2.0), deleted: false },
  ], 1);
  assert.equal(summary.length, 1);
  assert.equal(summary[0], 'ScarletCut enables instant editing.');
});
