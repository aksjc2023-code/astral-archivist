import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tagLexicalFillers,
  injectSyntheticPauseTokens,
  purgeFillersAndPauses,
  processTranscribedTokens,
  WordToken,
  asSourceSeconds,
  resamplePcmTo16kHz,
  alignWhisperChunksToWordTokens,
  OfflineWhisperEngine,
  WhisperWordChunk,
} from '../src/index';

test('1. Lexical filler tagging identifies fillers regardless of case and punctuation', () => {
  const tokens: WordToken[] = [
    { id: '1', text: 'Um,', start: asSourceSeconds(0.0), end: asSourceSeconds(0.4), deleted: false },
    { id: '2', text: 'welcome', start: asSourceSeconds(0.5), end: asSourceSeconds(1.0), deleted: false },
    { id: '3', text: 'LIKE...', start: asSourceSeconds(1.1), end: asSourceSeconds(1.4), deleted: false },
    { id: '4', text: 'actually!', start: asSourceSeconds(1.5), end: asSourceSeconds(2.0), deleted: false },
    { id: '5', text: 'editor', start: asSourceSeconds(2.1), end: asSourceSeconds(2.6), deleted: false },
  ];

  const tagged = tagLexicalFillers(tokens);
  assert.equal(tagged[0]?.isFiller, true);
  assert.equal(tagged[1]?.isFiller, undefined);
  assert.equal(tagged[2]?.isFiller, true);
  assert.equal(tagged[3]?.isFiller, true);
  assert.equal(tagged[4]?.isFiller, undefined);
});

test('2. Synthetic pause tokens injected for silence gaps >= 0.50 seconds', () => {
  const tokens: WordToken[] = [
    { id: '1', text: 'First', start: asSourceSeconds(0.0), end: asSourceSeconds(1.0), deleted: false, mediaId: 'asset_1' },
    // 0.8s gap between 1.0 and 1.8 -> pause token should be inserted!
    { id: '2', text: 'Second', start: asSourceSeconds(1.8), end: asSourceSeconds(2.5), deleted: false, mediaId: 'asset_1' },
    // 0.2s gap between 2.5 and 2.7 -> no pause token (below 0.5s threshold)
    { id: '3', text: 'Third', start: asSourceSeconds(2.7), end: asSourceSeconds(3.5), deleted: false, mediaId: 'asset_1' },
  ];

  const result = injectSyntheticPauseTokens(tokens);
  assert.equal(result.length, 4);

  const pauseTok = result[1];
  assert.equal(pauseTok?.isPause, true);
  assert.equal(pauseTok?.mediaId, 'asset_1');
  assert.equal(pauseTok?.start, 1.0);
  assert.equal(pauseTok?.end, 1.8);
  assert.match(pauseTok?.text ?? '', /0\.80s pause/);
});

test('3. Purge fillers and pauses marks both as deleted and computes savings', () => {
  const rawTokens: WordToken[] = [
    { id: '1', text: 'Um', start: asSourceSeconds(0.0), end: asSourceSeconds(0.5), deleted: false },
    { id: '2', text: 'hello', start: asSourceSeconds(1.2), end: asSourceSeconds(1.8), deleted: false },
  ];

  const processed = processTranscribedTokens(rawTokens);
  // processed has: Um (filler), [0.70s pause] (pause), hello (kept)
  assert.equal(processed.length, 3);
  assert.equal(processed[0]?.isFiller, true);
  assert.equal(processed[1]?.isPause, true);

  const purgeResult = purgeFillersAndPauses(processed);
  assert.equal(purgeResult.purgedCount, 2);
  // Purged duration: 0.5s (Um) + 0.7s (pause) = 1.2s
  assert.equal(purgeResult.purgedDurationSec, 1.2);
  assert.equal(purgeResult.updatedTokens[0]?.deleted, true);
  assert.equal(purgeResult.updatedTokens[1]?.deleted, true);
  assert.equal(purgeResult.updatedTokens[2]?.deleted, false);
});

test('4. Resample PCM Float32 audio down to 16,000 Hz correctly', () => {
  // Simulate 1 second of 48,000 Hz audio
  const sampleRate48k = 48000;
  const input48k = new Float32Array(sampleRate48k);
  for (let i = 0; i < input48k.length; i++) {
    input48k[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate48k); // 440Hz sine wave
  }

  const resampled16k = resamplePcmTo16kHz(input48k, sampleRate48k, 16000);
  assert.equal(resampled16k.length, 16000);
  // Boundary check
  assert.ok(Number.isFinite(resampled16k[0]));
  assert.ok(Number.isFinite(resampled16k[resampled16k.length - 1]));
});

test('5. Timestamp monotonicity alignment enforces chronological order and 40ms min duration', () => {
  const noisyChunks: WhisperWordChunk[] = [
    { text: 'Hello', timestamp: [1.0, 1.5] },
    // Out-of-order / overlapping chunk
    { text: 'world', timestamp: [1.2, 1.4] }, // start < prevEnd (1.5)!
    // Zero-duration chunk
    { text: 'zero', timestamp: [2.0, 2.0] },  // end === start!
  ];

  const tokens = alignWhisperChunksToWordTokens(noisyChunks, 'asset_test');
  assert.equal(tokens.length, 3);

  // First token
  assert.equal(tokens[0]?.start, 1.0);
  assert.equal(tokens[0]?.end, 1.5);
  assert.equal(tokens[0]?.mediaId, 'asset_test');

  // Second token: clamped start must be >= prevEnd (1.5), end >= 1.5 + 0.04
  assert.ok((tokens[1]?.start ?? 0) >= 1.5);
  assert.ok((tokens[1]?.end ?? 0) >= (tokens[1]?.start ?? 0) + 0.04);

  // Third token: zero duration clamped to at least 40ms
  assert.ok((tokens[2]?.end ?? 0) >= (tokens[2]?.start ?? 0) + 0.04);
});

test('6. OfflineWhisperEngine self-healing fallback gracefully handles WebGPU context failure', async () => {
  const engine = new OfflineWhisperEngine({ preferredDevice: 'webgpu' });
  assert.equal(engine.getActiveDevice(), 'webgpu');

  let fallbackTriggered = false;
  const mockAudio = new Float32Array(16000);

  const mockRunner = async (_audio: Float32Array, _options: unknown) => {
    if (engine.getActiveDevice() === 'webgpu') {
      throw new Error('WebGPU context lost / device lost (simulated hardware failure)');
    }
    return {
      text: 'Fallback transcript success',
      chunks: [
        { text: 'Fallback', timestamp: [0.0, 0.5] as [number, number] },
        { text: 'success', timestamp: [0.6, 1.0] as [number, number] },
      ],
    };
  };

  const result = await engine.transcribe(
    mockAudio,
    mockRunner,
    'asset_vid',
    (from, to) => {
      fallbackTriggered = true;
      assert.equal(from, 'webgpu');
      assert.equal(to, 'wasm');
    }
  );

  assert.equal(fallbackTriggered, true);
  assert.equal(result.deviceUsed, 'wasm');
  assert.equal(result.tokens.length, 2);
  assert.equal(result.tokens[0]?.text, 'Fallback');
  assert.equal(result.tokens[1]?.text, 'success');
});
