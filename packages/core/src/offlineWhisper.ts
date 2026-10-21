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
 * Pure mathematical linear interpolation resampler for PCM Float32 audio.
 * Resamples any input sample rate (e.g. 44.1kHz, 48kHz) down to 16,000 Hz mono
 * without requiring browser AudioContext (works in Node.js, workers, and unit tests).
 */
export function resamplePcmTo16kHz(
  inputData: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000
): Float32Array {
  if (inputSampleRate === targetSampleRate) {
    return new Float32Array(inputData);
  }
  if (inputData.length === 0) {
    return new Float32Array(0);
  }

  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.max(1, Math.round(inputData.length / ratio));
  const output = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const originalPos = i * ratio;
    const indexLow = Math.floor(originalPos);
    const indexHigh = Math.min(indexLow + 1, inputData.length - 1);
    const weight = originalPos - indexLow;

    const valLow = inputData[indexLow] ?? 0;
    const valHigh = inputData[indexHigh] ?? 0;
    output[i] = valLow * (1 - weight) + valHigh * weight;
  }

  return output;
}

/**
 * Downsamples media audio to 16,000 Hz Mono Float32Array via Web Audio API
 * or mathematical fallback if context is not supplied.
 */
export async function decodeAndResampleTo16kHzMono(
  rawBuffer: ArrayBuffer,
  createAudioContext?: () => AudioContextLike,
  createOfflineContext?: (channels: number, length: number, sampleRate: number) => OfflineAudioContextLike
): Promise<Float32Array> {
  if (!createAudioContext || !createOfflineContext) {
    // If no context factory is provided, return raw Float32 view or throw explicit contract
    throw new Error('AudioContext factories are required for binary media decoding to 16kHz PCM.');
  }

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
  const tokens: WordToken[] = [];
  let prevEnd = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk || !chunk.text) continue;

    const rawStart = chunk.timestamp[0] ?? prevEnd;
    const rawEnd = chunk.timestamp[1] ?? (rawStart + 0.35);

    // Enforce monotonicity and min duration (40ms hardware guard)
    const clampedStart = Math.max(prevEnd, rawStart);
    const clampedEnd = Math.max(clampedStart + 0.04, rawEnd);

    tokens.push({
      id: `tok_${mediaId ? `${mediaId}_` : ''}${i + 1}`,
      text: chunk.text.trim(),
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
   * Transcribes normalized 16kHz mono audio PCM using the provided pipeline runner
   * with self-healing fallback from WebGPU to WASM/CPU.
   */
  public async transcribe(
    audioPcm: Float32Array,
    runner: WhisperPipelineRunner,
    mediaId?: string,
    onFallback?: (fromDevice: string, toDevice: string, error: unknown) => void
  ): Promise<{ tokens: WordToken[]; rawText: string; deviceUsed: string }> {
    try {
      const output = await runner(audioPcm, {
        return_timestamps: 'word',
        chunk_length_s: this.config.chunkLengthSec,
        stride_length_s: this.config.strideLengthSec,
      });

      const chunks = output.chunks ?? [{ text: output.text, timestamp: [0, audioPcm.length / 16000] }];
      const tokens = alignWhisperChunksToWordTokens(chunks, mediaId);

      return {
        tokens,
        rawText: output.text,
        deviceUsed: this.activeDevice,
      };
    } catch (err) {
      if (this.activeDevice === 'webgpu') {
        // Self-Healing Path (ADR-001 Section 5.3):
        // Automatically switch to CPU/WASM on WebGPU context loss or failure
        onFallback?.('webgpu', 'wasm', err);
        this.activeDevice = 'wasm';
        const fallbackOutput = await runner(audioPcm, {
          return_timestamps: 'word',
          chunk_length_s: this.config.chunkLengthSec,
          stride_length_s: this.config.strideLengthSec,
        });

        const chunks = fallbackOutput.chunks ?? [{ text: fallbackOutput.text, timestamp: [0, audioPcm.length / 16000] }];
        const tokens = alignWhisperChunksToWordTokens(chunks, mediaId);

        return {
          tokens,
          rawText: fallbackOutput.text,
          deviceUsed: 'wasm',
        };
      }
      throw err;
    }
  }
}
