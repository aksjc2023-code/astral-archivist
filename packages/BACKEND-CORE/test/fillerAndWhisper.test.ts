import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tagLexicalFillers,
  injectSyntheticPauseTokens,
  purgeFillersAndPauses,
  processTranscribedTokens,
  cleanPunctuation,
  WordToken,
  asSourceSeconds,
  resamplePcmTo16kHz,
  alignWhisperChunksToWordTokens,
  OfflineWhisperEngine,
  WhisperWordChunk,
  decodeAndResampleTo16kHzMono,
  isWebGpuHardwareError,
} from '../src/index';

test('1. Extended punctuation stripping handles ellipses, em-dashes, and smart quotes', () => {
  assert.equal(cleanPunctuation('“Um…”'), 'um');
  assert.equal(cleanPunctuation('uh—'), 'uh');
  assert.equal(cleanPunctuation('LIKE!'), 'like');
  assert.equal(cleanPunctuation('(actually)'), 'actually');
});

test('2. Hard fillers vs discourse markers and multi-word phrase matching', () => {
  const tokens: WordToken[] = [
    { id: '1', text: 'Um,', start: asSourceSeconds(0.0), end: asSourceSeconds(0.4), deleted: false, mediaId: 'a1' },
    { id: '2', text: 'I', start: asSourceSeconds(0.5), end: asSourceSeconds(0.7), deleted: false, mediaId: 'a1' },
    { id: '3', text: 'like', start: asSourceSeconds(0.72), end: asSourceSeconds(1.0), deleted: false, mediaId: 'a1' },
    { id: '4', text: 'this,', start: asSourceSeconds(1.05), end: asSourceSeconds(1.3), deleted: false, mediaId: 'a1' },
    // Multi-token phrase: "you" + "know"
    { id: '5', text: 'you', start: asSourceSeconds(1.4), end: asSourceSeconds(1.6), deleted: false, mediaId: 'a1' },
    { id: '6', text: 'know?', start: asSourceSeconds(1.65), end: asSourceSeconds(1.9), deleted: false, mediaId: 'a1' },
  ];

  const tagged = tagLexicalFillers(tokens);

  // "Um" is a hard filler
  assert.equal(tagged[0]?.isFiller, true);

  // "like" is a discourse marker, NOT a hard filler (protects legitimate speech)
  assert.equal(tagged[2]?.isDiscourseMarker, true);
  assert.equal(tagged[2]?.isFiller, undefined);

  // "you" + "know" multi-word phrase matching tags both tokens as discourse markers
  assert.equal(tagged[4]?.isDiscourseMarker, true);
  assert.equal(tagged[5]?.isDiscourseMarker, true);
  assert.equal(tagged[4]?.isFiller, undefined);
  assert.equal(tagged[5]?.isFiller, undefined);
});

test('3. Non-destructive pause tokens match exact silence duration and enforce strict mediaId', () => {
  const tokens: WordToken[] = [
    { id: '1', text: 'Hello', start: asSourceSeconds(0.0), end: asSourceSeconds(1.0), deleted: false, mediaId: 'asset_1' },
    // 1.0s gap between 1.0 and 2.0 -> non-destructive pause token is [1.0, 2.0] (duration 1.0s)
    { id: '2', text: 'World', start: asSourceSeconds(2.0), end: asSourceSeconds(2.8), deleted: false, mediaId: 'asset_1' },
    // Token on DIFFERENT media asset: must NOT inject pause across asset boundary!
    { id: '3', text: 'Cut', start: asSourceSeconds(4.0), end: asSourceSeconds(4.5), deleted: false, mediaId: 'asset_2' },
  ];

  const result = injectSyntheticPauseTokens(tokens);
  assert.equal(result.length, 4); // tokens[0], pause, tokens[1], tokens[2]

  const pauseTok = result[1];
  assert.equal(pauseTok?.isPause, true);
  assert.equal(pauseTok?.deleted, false);
  assert.equal(pauseTok?.mediaId, 'asset_1');
  assert.equal(pauseTok?.start, 1.0);
  assert.equal(pauseTok?.end, 2.0);
  assert.equal(Number((pauseTok?.end - pauseTok?.start).toFixed(2)), 1.0);
  assert.equal(pauseTok?.text, '⏸ 1.0s');

  // Verify no pause between World (asset_1) and Cut (asset_2)
  assert.equal(result[3]?.id, '3');

  // Verify custom edgePaddingSec when explicitly supplied
  const paddedResult = injectSyntheticPauseTokens(tokens, 0.5, 0.12);
  const paddedTok = paddedResult[1];
  assert.equal(paddedTok?.start, 1.12);
  assert.equal(paddedTok?.end, 1.88);
  assert.equal(Number((paddedTok?.end - paddedTok?.start).toFixed(2)), 0.76);
});

test('4. Purge options protect discourse markers by default and compute exact savings', () => {
  const tokens: WordToken[] = [
    { id: '1', text: 'Um', start: asSourceSeconds(0.0), end: asSourceSeconds(0.4), deleted: false, isFiller: true },
    { id: '2', text: 'I', start: asSourceSeconds(0.5), end: asSourceSeconds(0.7), deleted: false },
    { id: '3', text: 'like', start: asSourceSeconds(0.75), end: asSourceSeconds(1.0), deleted: false, isDiscourseMarker: true },
    { id: 'p1', text: '[0.6s pause]', start: asSourceSeconds(1.12), end: asSourceSeconds(1.68), deleted: false, isPause: true },
    { id: '4', text: 'music', start: asSourceSeconds(1.8), end: asSourceSeconds(2.3), deleted: false },
  ];

  // Default purge: purges hard fillers and pauses, leaves "like" intact!
  const defaultPurge = purgeFillersAndPauses(tokens);
  assert.equal(defaultPurge.purgedCount, 2);
  assert.equal(defaultPurge.updatedTokens[0]?.deleted, true);  // "Um" purged
  assert.equal(defaultPurge.updatedTokens[2]?.deleted, false); // "like" KEPT
  assert.equal(defaultPurge.updatedTokens[3]?.deleted, true);  // pause purged

  // Aggressive purge: including discourse markers
  const aggressivePurge = purgeFillersAndPauses(tokens, { includeDiscourseMarkers: true });
  assert.equal(aggressivePurge.purgedCount, 3);
  assert.equal(aggressivePurge.updatedTokens[2]?.deleted, true); // "like" purged
});

test('5. Resample PCM with anti-aliasing preserves 440Hz tone and rejects invalid sample rates', () => {
  // Input validation
  assert.throws(() => resamplePcmTo16kHz(new Float32Array(10), 0), /Invalid inputSampleRate/);
  assert.throws(() => resamplePcmTo16kHz(new Float32Array(10), 48000, -1), /Invalid targetSampleRate/);

  // Generate 1 second of 440Hz sine wave sampled at 48kHz
  const sampleRate = 48000;
  const input = new Float32Array(sampleRate);
  for (let i = 0; i < input.length; i++) {
    input[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  }

  const resampled = resamplePcmTo16kHz(input, sampleRate, 16000);
  assert.equal(resampled.length, 16000);

  // Peak amplitude of 440Hz passband should be preserved within 15% (no excessive attenuation in passband)
  let maxAmp = 0;
  for (let i = 1000; i < 2000; i++) {
    const val = Math.abs(resampled[i] ?? 0);
    if (val > maxAmp) maxAmp = val;
  }
  assert.ok(maxAmp > 0.85, `Passband amplitude was ${maxAmp}, expected > 0.85`);

  // Generate 11kHz sine wave sampled at 48kHz (should be attenuated >16dB by 4-pole cascaded anti-aliasing filter)
  const input11k = new Float32Array(sampleRate);
  for (let i = 0; i < input11k.length; i++) {
    input11k[i] = Math.sin((2 * Math.PI * 11000 * i) / sampleRate);
  }
  const resampled11k = resamplePcmTo16kHz(input11k, sampleRate, 16000);
  let maxAmp11k = 0;
  for (let i = 1000; i < 2000; i++) {
    const val = Math.abs(resampled11k[i] ?? 0);
    if (val > maxAmp11k) maxAmp11k = val;
  }
  assert.ok(maxAmp11k < 0.15, `Stopband 11kHz amplitude was ${maxAmp11k}, expected < 0.15 (>16dB attenuation)`);
});

test('6. Timestamp monotonicity alignment rejects empty chunks and clamps out-of-order timestamps', () => {
  const chunks: WhisperWordChunk[] = [
    { text: '   ', timestamp: [0.0, 0.5] }, // whitespace-only: must be discarded
    { text: 'Valid', timestamp: [1.0, 1.4] },
    { text: 'monotonic', timestamp: [1.2, 1.3] }, // overlaps previous: must clamp start >= 1.4
    { text: 'zero-dur', timestamp: [2.0, 2.0] },  // zero duration: must clamp end >= start + 0.04
  ];

  const tokens = alignWhisperChunksToWordTokens(chunks, 'media_a');
  assert.equal(tokens.length, 3); // whitespace chunk skipped
  assert.equal(tokens[0]?.text, 'Valid');
  assert.equal(tokens[1]?.text, 'monotonic');
  assert.ok((tokens[1]?.start ?? 0) >= 1.4);
  assert.ok((tokens[2]?.end ?? 0) >= (tokens[2]?.start ?? 0) + 0.04);
});

test('7. Device-aware Whisper runner factory and GPU-error specific fallback', async () => {
  assert.equal(isWebGpuHardwareError(new Error('WebGPU adapter returned null')), true);
  assert.equal(isWebGpuHardwareError(new Error('GPU device lost')), true);
  assert.equal(isWebGpuHardwareError(new Error('navigator.gpu not supported')), true);
  assert.equal(isWebGpuHardwareError(new Error('Invalid PCM input buffer')), false);

  const engine = new OfflineWhisperEngine({ preferredDevice: 'webgpu' });
  let devicesRequested: string[] = [];

  const factory = (device: 'webgpu' | 'wasm' | 'cpu') => {
    devicesRequested.push(device);
    return async (_pcm: Float32Array) => {
      if (device === 'webgpu') {
        throw new Error('WebGPU device.lost hardware fault');
      }
      return {
        text: 'WASM transcript success',
        chunks: [{ text: 'WASM', timestamp: [0.0, 0.5] as [number, number] }],
      };
    };
  };

  const result = await engine.transcribe(new Float32Array(16000), factory, 'asset_1');
  assert.deepEqual(devicesRequested, ['webgpu', 'wasm']);
  assert.equal(result.deviceUsed, 'wasm');
  assert.equal(result.tokens[0]?.text, 'WASM');

  // Verify that errors during factory initialization on webgpu trigger wasm fallback
  const initDevicesRequested: string[] = [];
  const initFailFactory = (device: 'webgpu' | 'wasm' | 'cpu') => {
    initDevicesRequested.push(device);
    if (device === 'webgpu') {
      throw new Error('navigator.gpu is not supported in this browser environment');
    }
    return async (_pcm: Float32Array) => ({
      text: 'Fallback succeeded from factory init',
      chunks: [{ text: 'InitFallback', timestamp: [0.0, 0.4] as [number, number] }],
    });
  };

  const engineInit = new OfflineWhisperEngine({ preferredDevice: 'webgpu' });
  const initResult = await engineInit.transcribe(new Float32Array(16000), initFailFactory, 'asset_init');
  assert.deepEqual(initDevicesRequested, ['webgpu', 'wasm']);
  assert.equal(initResult.deviceUsed, 'wasm');
  assert.equal(initResult.tokens[0]?.text, 'InitFallback');

  // Verify non-GPU errors are NOT masked and do not trigger fallback
  const failingFactory = () => {
    return async () => {
      throw new Error('Corrupt audio header format');
    };
  };

  const engine2 = new OfflineWhisperEngine({ preferredDevice: 'webgpu' });
  await assert.rejects(
    async () => engine2.transcribe(new Float32Array(16000), failingFactory),
    /Corrupt audio header format/
  );
  assert.equal(engine2.getActiveDevice(), 'webgpu'); // Did not switch device on non-GPU error
});

test('8. decodeAndResampleTo16kHzMono invokes audio context factories and decodes buffer', async () => {
  let tempCtxClosed = false;
  let offlineRendered = false;

  const mockAudioCtxFactory = () => ({
    decodeAudioData: async () => ({
      duration: 1.0,
      sampleRate: 48000,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(48000),
    }),
    close: async () => {
      tempCtxClosed = true;
    },
  });

  const mockOfflineFactory = (_channels: number, length: number, _rate: number) => ({
    createBufferSource: () => ({
      buffer: null,
      connect: () => {},
      start: () => {},
    }),
    destination: {},
    startRendering: async () => {
      offlineRendered = true;
      return {
        duration: 1.0,
        sampleRate: 16000,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array(length),
      };
    },
  });

  const pcm = await decodeAndResampleTo16kHzMono(
    new ArrayBuffer(100),
    mockAudioCtxFactory,
    mockOfflineFactory
  );

  assert.equal(pcm.length, 16000);
  assert.equal(tempCtxClosed, true);
  assert.equal(offlineRendered, true);
});
