/**
 * WebGPU / Offline Whisper Speech-to-Text Pipeline & Audio Resampler
 * Pure TypeScript, zero-DOM lib dependency (compatible with lib: ["ES2022"])
 */

import { WordToken, asSourceSeconds } from './types';

export interface WhisperWordChunk {
  text: string;
  timestamp: [number | null, number | null];
}

export interface WhisperOutput {
  text: string;
  chunks?: WhisperWordChunk[];
}

export interface AudioBufferLike {
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export interface AudioContextLike {
  decodeAudioData(audioData: ArrayBuffer): Promise<AudioBufferLike>;
  close(): Promise<void>;
}

export interface OfflineAudioContextLike {
  createBufferSource(): {
    buffer: AudioBufferLike | null;
    connect(destination: unknown): void;
    start(when?: number): void;
  };
  destination: unknown;
  startRendering(): Promise<AudioBufferLike>;
}

/**
 * Applies a 2-pole Butterworth low-pass anti-aliasing filter to prevent spectral folding
 * when downsampling to a lower sample rate.
 */
function applyButterworthLowPass(
  data: Float32Array,
  sampleRate: number,
  cutoffHz: number
): Float32Array {
  if (data.length === 0 || cutoffHz >= sampleRate / 2) {
    return new Float32Array(data);
  }

  // Pre-warp digital cutoff frequency
  const omega = Math.tan((Math.PI * cutoffHz) / sampleRate);
  const omega2 = omega * omega;
  const sqrt2 = Math.SQRT2;

  // Normalized biquad filter coefficients
  const a0 = 1 + sqrt2 * omega + omega2;
  const b0 = omega2 / a0;
  const b1 = (2 * omega2) / a0;
  const b2 = omega2 / a0;
  const a1 = (2 * (omega2 - 1)) / a0;
  const a2 = (1 - sqrt2 * omega + omega2) / a0;

  const output = new Float32Array(data.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  for (let i = 0; i < data.length; i++) {
    const x0 = data[i] ?? 0;
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;

    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;

    output[i] = y0;
  }

  return output;
}

/**
 * Mathematical linear interpolation resampler for PCM Float32 audio with
 * integrated Butterworth low-pass anti-aliasing filter.
 *
 * Resamples any input sample rate (e.g. 44.1kHz, 48kHz) down to 16,000 Hz mono
 * without requiring browser AudioContext (works in Node.js, workers, and unit tests).
 */
export function resamplePcmTo16kHz(
  inputData: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000
): Float32Array {
  if (!Number.isFinite(inputSampleRate) || inputSampleRate <= 0) {
    throw new Error(`Invalid inputSampleRate: ${inputSampleRate}. Must be a positive finite number.`);
  }
  if (!Number.isFinite(targetSampleRate) || targetSampleRate <= 0) {
    throw new Error(`Invalid targetSampleRate: ${targetSampleRate}. Must be a positive finite number.`);
  }

  if (inputSampleRate === targetSampleRate) {
    return new Float32Array(inputData);
  }
  if (inputData.length === 0) {
    return new Float32Array(0);
  }

  // Anti-aliasing pre-filtering: when downsampling, attenuate frequencies above Nyquist limit
  let filteredData = inputData;
  if (inputSampleRate > targetSampleRate) {
    const nyquist = targetSampleRate / 2;
    const filterCutoff = nyquist * 0.90; // 7.2kHz cutoff for 16kHz target
    filteredData = applyButterworthLowPass(inputData, inputSampleRate, filterCutoff);
  }

  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.max(1, Math.round(filteredData.length / ratio));
  const output = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const originalPos = i * ratio;
    const indexLow = Math.floor(originalPos);
    const indexHigh = Math.min(indexLow + 1, filteredData.length - 1);
    const weight = originalPos - indexLow;

    const valLow = filteredData[indexLow] ?? 0;
    const valHigh = filteredData[indexHigh] ?? 0;
    output[i] = valLow * (1 - weight) + valHigh * weight;
  }

  return output;
}

/**
 * Downsamples media audio to 16,000 Hz Mono Float32Array via Web Audio API.
 */
export async function decodeAndResampleTo16kHzMono(
  rawBuffer: ArrayBuffer,
  createAudioContext: () => AudioContextLike,
  createOfflineContext: (channels: number, length: number, sampleRate: number) => OfflineAudioContextLike
): Promise<Float32Array> {
  const tempCtx = createAudioContext();
  try {
    const decodedBuffer = await tempCtx.decodeAudioData(rawBuffer.slice(0));
    const targetSampleRate = 16000;
    const targetLength = Math.ceil(decodedBuffer.duration * targetSampleRate);

    const offlineCtx = createOfflineContext(1, Math.max(1, targetLength), targetSampleRate);
    const bufferSource = offlineCtx.createBufferSource();
    bufferSource.buffer = decodedBuffer;
    bufferSource.connect(offlineCtx.destination);
    bufferSource.start(0);

    const renderedBuffer = await offlineCtx.startRendering();
    return renderedBuffer.getChannelData(0);
  } finally {
    await tempCtx.close();
  }
}

/**
 * Enforces strict timestamp monotonicity and minimum duration on raw Whisper chunks
 * to produce clean, well-formed WordToken[] records.
 *
 * Monotonicity contract (ADR-001 Section 2.2):
 * s_i = max(e_{i-1}, chunk_i.start)
 * e_i = max(s_i + 0.04, chunk_i.end)
 */
export function alignWhisperChunksToWordTokens(
  chunks: WhisperWordChunk[],
  mediaId?: string
): WordToken[] {
  if (!chunks || chunks.length === 0) {
    return [];
  }

  const tokens: WordToken[] = [];
  let prevEnd = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) continue;

    const trimmedText = (chunk.text ?? '').trim();
    if (trimmedText.length === 0) continue;

    const rawT0 = chunk.timestamp[0];
    const rawT1 = chunk.timestamp[1];

    const rawStart = (rawT0 !== null && rawT0 !== undefined && Number.isFinite(rawT0))
      ? Math.max(0, rawT0)
      : prevEnd;

    const rawEnd = (rawT1 !== null && rawT1 !== undefined && Number.isFinite(rawT1))
      ? Math.max(rawStart + 0.04, rawT1)
      : rawStart + 0.35;

    // Guard against runaway backward jumps: clamp start monotonically to prevEnd
    const clampedStart = Math.max(prevEnd, rawStart);
    const clampedEnd = Math.max(clampedStart + 0.04, rawEnd);

    tokens.push({
      id: `tok_${mediaId ? `${mediaId}_` : ''}${tokens.length + 1}`,
      text: trimmedText,
      start: asSourceSeconds(Number(clampedStart.toFixed(3))),
      end: asSourceSeconds(Number(clampedEnd.toFixed(3))),
      deleted: false,
      mediaId,
    });

    prevEnd = clampedEnd;
  }

  return tokens;
}

/**
 * WebGPU Offline Whisper Engine Configuration & Self-Healing Pipeline
 */
export interface WhisperEngineConfig {
  modelId?: string;
  preferredDevice?: 'webgpu' | 'wasm' | 'cpu';
  dtype?: 'q8' | 'fp32' | 'fp16';
  chunkLengthSec?: number;
  strideLengthSec?: number;
}

export type WhisperPipelineRunner = (
  audioPcm: Float32Array,
  options: {
    return_timestamps: 'word' | boolean;
    chunk_length_s: number;
    stride_length_s: number;
  }
) => Promise<WhisperOutput>;

export type WhisperRunnerFactory = (
  device: 'webgpu' | 'wasm' | 'cpu'
) => Promise<WhisperPipelineRunner> | WhisperPipelineRunner;

/**
 * Inspects whether an error originated from WebGPU hardware, adapter, or shader execution.
 */
export function isWebGpuHardwareError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /webgpu|device[\s._-]?lost|adapter|vram|out of memory|shader compilation|hardware acceleration/i.test(message);
}

export class OfflineWhisperEngine {
  private config: Required<WhisperEngineConfig>;
  private activeDevice: 'webgpu' | 'wasm' | 'cpu';

  constructor(config: WhisperEngineConfig = {}) {
    this.config = {
      modelId: config.modelId ?? 'onnx-community/whisper-tiny.en',
      preferredDevice: config.preferredDevice ?? 'webgpu',
      dtype: config.dtype ?? 'q8',
      chunkLengthSec: config.chunkLengthSec ?? 30,
      strideLengthSec: config.strideLengthSec ?? 5,
    };
    this.activeDevice = this.config.preferredDevice;
  }

  public getActiveDevice(): 'webgpu' | 'wasm' | 'cpu' {
    return this.activeDevice;
  }

  /**
   * Transcribes normalized 16kHz mono audio PCM with device-aware runner factory
   * and self-healing WebGPU fallback.
   *
   * If a runnerFactory is provided and WebGPU encounters hardware context loss,
   * it builds a dedicated WASM runner and automatically re-executes.
   */
  public async transcribe(
    audioPcm: Float32Array,
    runnerOrFactory: WhisperPipelineRunner | WhisperRunnerFactory,
    mediaId?: string,
    onFallback?: (fromDevice: string, toDevice: string, error: unknown) => void
  ): Promise<{ tokens: WordToken[]; rawText: string; deviceUsed: string }> {
    if (audioPcm.length === 0) {
      return { tokens: [], rawText: '', deviceUsed: this.activeDevice };
    }

    const getRunner = async (device: 'webgpu' | 'wasm' | 'cpu'): Promise<WhisperPipelineRunner> => {
      if (typeof runnerOrFactory === 'function') {
        const result = (runnerOrFactory as WhisperRunnerFactory)(device);
        if (typeof result === 'function') {
          return result;
        }
        return await result;
      }
      return runnerOrFactory;
    };

    let runner = await getRunner(this.activeDevice);

    try {
      const output = await runner(audioPcm, {
        return_timestamps: 'word',
        chunk_length_s: this.config.chunkLengthSec,
        stride_length_s: this.config.strideLengthSec,
      });

      const chunks = output.chunks ?? (output.text ? [{ text: output.text, timestamp: [0, audioPcm.length / 16000] }] : []);
      const tokens = alignWhisperChunksToWordTokens(chunks, mediaId);

      return {
        tokens,
        rawText: output.text,
        deviceUsed: this.activeDevice,
      };
    } catch (err) {
      // Only trigger self-healing fallback if error is an actual GPU/WebGPU hardware fault
      if (this.activeDevice === 'webgpu' && isWebGpuHardwareError(err)) {
        onFallback?.('webgpu', 'wasm', err);
        this.activeDevice = 'wasm';

        // Re-obtain a pipeline runner specifically instantiated for the WASM device
        runner = await getRunner('wasm');

        const fallbackOutput = await runner(audioPcm, {
          return_timestamps: 'word',
          chunk_length_s: this.config.chunkLengthSec,
          stride_length_s: this.config.strideLengthSec,
        });

        const chunks = fallbackOutput.chunks ?? (fallbackOutput.text ? [{ text: fallbackOutput.text, timestamp: [0, audioPcm.length / 16000] }] : []);
        const tokens = alignWhisperChunksToWordTokens(chunks, mediaId);

        return {
          tokens,
          rawText: fallbackOutput.text,
          deviceUsed: 'wasm',
        };
      }

      // If not a GPU error (e.g. invalid arguments or non-recoverable runtime failure), throw immediately
      throw err;
    }
  }
}
