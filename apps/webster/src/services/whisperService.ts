/**
 * Client-Side WebGPU Whisper Transcription Service for ScarletCut
 * Integrates @huggingface/transformers with @astral/core OfflineWhisperEngine
 */

import {
  WordToken,
  alignWhisperChunksToWordTokens,
  processTranscribedTokens,
  OfflineWhisperEngine,
  decodeAndResampleTo16kHzMono,
  AudioBufferLike,
  OfflineAudioContextLike,
} from '@astral/core';

export interface TranscribeProgressCallback {
  (status: string, percent?: number): void;
}

export const MAX_MEDIA_FILE_BYTES = 750 * 1024 * 1024; // 750 MB pre-flight safety limit

// Pipeline cache to avoid redownloading or re-instantiating models across transcriptions
const pipelineCache = new Map<string, any>();

/**
 * Extracts raw audio from a media File/Blob and resamples to 16kHz Mono Float32 PCM.
 */
export async function extract16kHzPcmFromMedia(
  fileOrBlob: Blob,
  onProgress?: (msg: string) => void
): Promise<Float32Array> {
  if (fileOrBlob.size > MAX_MEDIA_FILE_BYTES) {
    const sizeMb = (fileOrBlob.size / (1024 * 1024)).toFixed(1);
    throw new Error(`Media file exceeds 750MB limit (${sizeMb} MB). Please choose a smaller file.`);
  }

  onProgress?.('Decoding audio stream to 16kHz mono...');
  const arrayBuffer = await fileOrBlob.arrayBuffer();

  return decodeAndResampleTo16kHzMono(
    arrayBuffer,
    () => new window.AudioContext(),
    (channels, length, sampleRate) =>
      new window.OfflineAudioContext(channels, length, sampleRate) as unknown as OfflineAudioContextLike
  );
}

/**
 * Transcribes audio using WebGPU Whisper-tiny.en with transparent WASM CPU fallback
 */
export async function transcribeMediaFile(
  fileOrBlob: Blob,
  mediaId: string,
  onProgress?: TranscribeProgressCallback
): Promise<{ tokens: WordToken[]; rawText: string; deviceUsed: string }> {
  if (fileOrBlob.size > MAX_MEDIA_FILE_BYTES) {
    const sizeMb = (fileOrBlob.size / (1024 * 1024)).toFixed(1);
    throw new Error(`Media file exceeds 750MB limit (${sizeMb} MB). Please choose a smaller file.`);
  }

  onProgress?.('Extracting and downsampling audio...');
  const pcm = await extract16kHzPcmFromMedia(fileOrBlob, msg => onProgress?.(msg));

  onProgress?.('Initializing WebGPU Whisper Pipeline...');
  const modelId = 'onnx-community/whisper-tiny.en';
  const dtype = 'q8';
  const engine = new OfflineWhisperEngine({
    modelId,
    preferredDevice: 'webgpu',
    dtype,
    chunkLengthSec: 30,
    strideLengthSec: 5,
  });

  const runnerFactory = async (device: 'webgpu' | 'wasm' | 'cpu') => {
    const cacheKey = `${modelId}:${device}:${dtype}`;
    let asrPipeline = pipelineCache.get(cacheKey);

    if (!asrPipeline) {
      onProgress?.(`Loading Whisper model (${device.toUpperCase()})...`);
      const { pipeline } = await import('@huggingface/transformers');

      asrPipeline = await pipeline('automatic-speech-recognition', modelId, {
        device,
        dtype,
      });
      pipelineCache.set(cacheKey, asrPipeline);
    }

    return async (audioPcm: Float32Array, options: { return_timestamps: 'word' | boolean; chunk_length_s: number; stride_length_s: number }) => {
      onProgress?.('Transcribing speech segments...');
      const output = await asrPipeline(audioPcm, {
        return_timestamps: options.return_timestamps,
        chunk_length_s: options.chunk_length_s,
        stride_length_s: options.stride_length_s,
      });

      return output as { text: string; chunks?: { text: string; timestamp: [number | null, number | null] }[] };
    };
  };

  const result = await engine.transcribe(
    pcm,
    runnerFactory,
    mediaId,
    (from, to, error) => {
      console.warn(`[Whisper] Context failure on ${from}. Falling back to ${to}:`, error);
      onProgress?.(`WebGPU context unavailable. Falling back to ${to.toUpperCase()} CPU...`);
    }
  );

  onProgress?.('Tagging lexical fillers and injecting pause tokens...');
  // Post-process with lexical filler tagging and breathing-padded pause injection
  const processedTokens = processTranscribedTokens(result.tokens);

  onProgress?.('Transcription complete!', 100);
  return {
    tokens: processedTokens,
    rawText: result.rawText,
    deviceUsed: result.deviceUsed,
  };
}
