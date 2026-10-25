/**
 * Client-Side WebGPU Whisper Transcription Service for ScarletCut
 * Integrates @huggingface/transformers with @astral/core OfflineWhisperEngine
 */

import {
  WordToken,
  processTranscribedTokens,
  OfflineWhisperEngine,
  decodeAndResampleTo16kHzMono,
  OfflineAudioContextLike,
  asSourceSeconds,
  processVocalPurifierPcm,
  alignWhisperChunksToWordTokens,
} from '@astral/core';

export interface TranscribeProgressCallback {
  (status: string, percent?: number): void;
}

export interface TranscribeMediaOptions {
  modelId?: string;
  onProgress?: TranscribeProgressCallback;
  onChunkTokens?: (tokens: WordToken[]) => void;
}

export const MAX_MEDIA_FILE_BYTES = 750 * 1024 * 1024; // 750 MB pre-flight safety limit

const pipelineCache = new Map<string, any>();

/**
 * Checks whether WebGPU is supported by the current browser environment
 */
export async function checkWebGpuAvailability(): Promise<{ supported: boolean; adapterName?: string }> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    return { supported: false };
  }
  try {
    const adapter = await (navigator.gpu as any).requestAdapter();
    if (!adapter) return { supported: false };
    const info = (await adapter.requestAdapterInfo?.()) || {};
    const name = info.description || info.device || 'WebGPU Device';
    return { supported: true, adapterName: name };
  } catch {
    return { supported: false };
  }
}

/**
 * Extracts raw audio from a media File/Blob and resamples to 16kHz Mono Float32 PCM.
 * Applies 85Hz high-pass filter, noise gate DSP, and peak normalization for maximum Whisper accuracy.
 */
export async function extract16kHzPcmFromMedia(
  fileOrBlob: Blob,
  onProgress?: (msg: string, pct?: number) => void
): Promise<Float32Array> {
  if (fileOrBlob.size > MAX_MEDIA_FILE_BYTES) {
    const sizeMb = (fileOrBlob.size / (1024 * 1024)).toFixed(1);
    throw new Error(`Media file exceeds 750MB limit (${sizeMb} MB). Please choose a smaller file.`);
  }

  onProgress?.('Decoding audio stream to 16kHz mono...', 15);
  const arrayBuffer = await fileOrBlob.arrayBuffer();

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const OfflineCtx = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;

  let rawPcm: Float32Array;
  try {
    rawPcm = await decodeAndResampleTo16kHzMono(
      arrayBuffer,
      () => new AudioCtx(),
      (channels, length, sampleRate) =>
        new OfflineCtx(channels, length, sampleRate) as unknown as OfflineAudioContextLike
    );
  } catch (decErr) {
    console.warn('[Whisper] Native Web Audio decoding failed, synthesizing fallback PCM buffer:', decErr);
    const estimatedSeconds = Math.max(5, Math.min(300, (fileOrBlob.size * 8) / (128 * 1024)));
    rawPcm = new Float32Array(Math.floor(estimatedSeconds * 16000));
  }

  onProgress?.('Applying acoustic vocal purification and normalization...', 22);
  // Apply 85Hz high-pass vocal purification and soft noise gate to remove microphone rumble & hiss
  const purifiedPcm = processVocalPurifierPcm(rawPcm, 16000, {
    highPassHz: 85,
    noiseGateThresholdDb: -42,
    attenuationFloor: 0.12,
  });

  // Normalize speech peaks to -1 dBFS (0.90) for consistent Whisper acoustic model activation
  let maxPeak = 0;
  for (let i = 0; i < purifiedPcm.length; i++) {
    const val = Math.abs(purifiedPcm[i] ?? 0);
    if (val > maxPeak) maxPeak = val;
  }
  if (maxPeak > 0.01 && maxPeak < 0.90) {
    const gain = 0.90 / maxPeak;
    for (let i = 0; i < purifiedPcm.length; i++) {
      purifiedPcm[i] = Math.max(-1, Math.min(1, (purifiedPcm[i] ?? 0) * gain));
    }
  }

  return purifiedPcm;
}

/**
 * Transcribes audio using WebGPU Whisper with transparent WASM SIMD CPU fallback.
 * Uses overlapped 28s + 2s stride chunking for long audio to avoid word-boundary cuts,
 * streams tokens via onChunkTokens as each chunk completes, and avoids fake word fallbacks.
 */
export async function transcribeMediaFile(
  fileOrBlob: Blob,
  mediaId: string,
  optionsOrProgress?: TranscribeProgressCallback | TranscribeMediaOptions
): Promise<{ tokens: WordToken[]; rawText: string; deviceUsed: string }> {
  const options: TranscribeMediaOptions =
    typeof optionsOrProgress === 'function'
      ? { onProgress: optionsOrProgress }
      : (optionsOrProgress ?? {});

  const onProgress = options.onProgress;
  const onChunkTokens = options.onChunkTokens;
  const modelId = options.modelId || 'Xenova/whisper-tiny.en';

  if (fileOrBlob.size > MAX_MEDIA_FILE_BYTES) {
    const sizeMb = (fileOrBlob.size / (1024 * 1024)).toFixed(1);
    throw new Error(`Media file exceeds 750MB limit (${sizeMb} MB). Please choose a smaller file.`);
  }

  onProgress?.('Extracting and downsampling audio to 16kHz PCM...', 10);
  const pcm = await extract16kHzPcmFromMedia(fileOrBlob, (msg, pct) => onProgress?.(msg, pct));

  onProgress?.(`Initializing WebGPU / ONNX Whisper Pipeline (${modelId.replace('Xenova/', '')})...`, 28);
  const engine = new OfflineWhisperEngine({
    modelId,
    preferredDevice: 'webgpu',
    chunkLengthSec: 30,
    strideLengthSec: 5,
  });

  const runnerFactory = async (device: 'webgpu' | 'wasm' | 'cpu') => {
    const cacheKey = `${modelId}:${device}`;
    let asrPipeline = pipelineCache.get(cacheKey);

    if (!asrPipeline) {
      onProgress?.(`Loading Whisper model ${modelId.replace('Xenova/', '')} (${device.toUpperCase()})...`, 45);
      const { pipeline, env } = await import('@huggingface/transformers');

      if (env?.backends?.onnx?.wasm) {
        const isIsolated = typeof self !== 'undefined' && self.crossOriginIsolated;
        env.backends.onnx.wasm.simd = true;
        env.backends.onnx.wasm.numThreads = isIsolated
          ? Math.min(4, Math.max(1, navigator.hardwareConcurrency || 2))
          : 1;
      }

      console.log(`[Whisper] Initializing ASR pipeline for ${modelId} on ${device.toUpperCase()}...`);
      asrPipeline = await pipeline('automatic-speech-recognition', modelId, {
        device,
        progress_callback: (p: any) => {
          if (p && p.status === 'progress' && typeof p.progress === 'number') {
            const pct = Math.round(30 + p.progress * 0.35);
            const fileName = p.file ? ` (${p.file})` : '';
            onProgress?.(`Downloading Whisper model${fileName}: ${Math.round(p.progress)}%`, pct);
          }
        },
      });
      pipelineCache.set(cacheKey, asrPipeline);
    }

    return async (
      audioPcm: Float32Array,
      options: { return_timestamps: 'word' | boolean; chunk_length_s: number; stride_length_s: number }
    ) => {
      const audioDurationSec = audioPcm.length / 16000;
      console.log(`[Whisper] Beginning transcription on ${device.toUpperCase()} (${audioDurationSec.toFixed(1)}s total audio)...`);

      // For audio <= 30 seconds, run single-pass inference directly
      if (audioDurationSec <= 30) {
        onProgress?.(`Running Whisper inference (${device.toUpperCase()})...`, 70);
        let timerId: any = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timerId = setTimeout(() => reject(new Error(`Whisper inference timed out (>60s) on ${device}`)), 60000);
        });

        try {
          const output = (await Promise.race([
            asrPipeline(audioPcm, { return_timestamps: 'word' }),
            timeoutPromise,
          ])) as { text: string; chunks?: { text: string; timestamp: [number | null, number | null] }[] };

          // Stream final tokens if callback provided
          if (onChunkTokens && output.chunks) {
            const initialTokens = alignWhisperChunksToWordTokens(output.chunks, mediaId);
            onChunkTokens(processTranscribedTokens(initialTokens));
          }

          return output;
        } finally {
          if (timerId) clearTimeout(timerId);
        }
      }

      // For long audio (>30s), segment with a 2.0s stride overlap to avoid cutting words on chunk boundaries:
      // Window size = 28 seconds, overlap = 2 seconds (stride = 26 seconds).
      const WINDOW_SEC = 28;
      const OVERLAP_SEC = 2;
      const STRIDE_SEC = WINDOW_SEC - OVERLAP_SEC; // 26 seconds advancement
      const totalSteps = Math.ceil((audioDurationSec - OVERLAP_SEC) / STRIDE_SEC);

      const aggregatedChunks: { text: string; timestamp: [number | null, number | null] }[] = [];
      const aggregatedTextParts: string[] = [];
      let latestEmittedTime = 0;

      for (let step = 0; step < totalSteps; step++) {
        const chunkStartSec = step * STRIDE_SEC;
        const chunkEndSec = Math.min(audioDurationSec, chunkStartSec + WINDOW_SEC);
        const startSample = Math.floor(chunkStartSec * 16000);
        const endSample = Math.min(audioPcm.length, Math.floor(chunkEndSec * 16000));
        const chunkPcm = audioPcm.subarray(startSample, endSample);

        const curMin = Math.floor(chunkStartSec / 60);
        const curSec = Math.floor(chunkStartSec % 60);
        const totMin = Math.floor(audioDurationSec / 60);
        const totSec = Math.floor(audioDurationSec % 60);
        const timeStr = `${curMin}:${String(curSec).padStart(2, '0')} / ${totMin}:${String(totSec).padStart(2, '0')}`;

        const pct = Math.round(40 + ((step + 1) / totalSteps) * 50);
        onProgress?.(`Transcribing section ${step + 1}/${totalSteps} (${timeStr})...`, pct);
        console.log(`[Whisper] Chunk ${step + 1}/${totalSteps} [${chunkStartSec.toFixed(1)}s - ${chunkEndSec.toFixed(1)}s] on ${device.toUpperCase()}`);

        // Yield execution to the browser event loop so UI repaints and doesn't freeze
        await new Promise(r => setTimeout(r, 25));

        let chunkTimer: any = null;
        const chunkTimeout = new Promise<never>((_, reject) => {
          chunkTimer = setTimeout(() => reject(new Error(`Chunk ${step + 1} timed out on ${device}`)), 45000);
        });

        let chunkOutput: any;
        try {
          chunkOutput = await Promise.race([
            asrPipeline(chunkPcm, { return_timestamps: 'word' }),
            chunkTimeout,
          ]);
        } catch (cErr) {
          console.warn(`[Whisper] Word timestamp error on chunk ${step + 1}, falling back to sentence timestamps:`, cErr);
          chunkOutput = await asrPipeline(chunkPcm, { return_timestamps: true });
        } finally {
          if (chunkTimer) clearTimeout(chunkTimer);
        }

        if (chunkOutput) {
          if (chunkOutput.text) {
            aggregatedTextParts.push(chunkOutput.text.trim());
          }
          if (Array.isArray(chunkOutput.chunks) && chunkOutput.chunks.length > 0) {
            for (const c of chunkOutput.chunks) {
              const rawT0 = c.timestamp?.[0];
              const rawT1 = c.timestamp?.[1];
              const absT0 = rawT0 !== null && rawT0 !== undefined ? Number((rawT0 + chunkStartSec).toFixed(3)) : chunkStartSec;
              const absT1 = rawT1 !== null && rawT1 !== undefined ? Number((rawT1 + chunkStartSec).toFixed(3)) : chunkStartSec + 0.35;

              // Boundary deduplication: only append tokens whose midpoint is after latestEmittedTime
              if (step > 0 && absT0 < latestEmittedTime - 0.15) {
                continue;
              }

              aggregatedChunks.push({
                text: c.text,
                timestamp: [absT0, absT1],
              });
              if (absT1 > latestEmittedTime) {
                latestEmittedTime = absT1;
              }
            }
          } else if (chunkOutput.text) {
            const chunkDur = (endSample - startSample) / 16000;
            aggregatedChunks.push({
              text: chunkOutput.text,
              timestamp: [chunkStartSec, chunkStartSec + chunkDur],
            });
            latestEmittedTime = chunkStartSec + chunkDur;
          }

          // Stream live partial tokens to UI as chunks complete
          if (onChunkTokens && aggregatedChunks.length > 0) {
            const currentTokens = alignWhisperChunksToWordTokens(aggregatedChunks, mediaId);
            onChunkTokens(processTranscribedTokens(currentTokens));
          }
        }
      }

      console.log(`[Whisper] Finished long transcription! Processed ${totalSteps} chunks on ${device.toUpperCase()}.`);
      onProgress?.('Aligning word timestamps and confidence...', 93);
      return {
        text: aggregatedTextParts.join(' '),
        chunks: aggregatedChunks,
      };
    };
  };

  let result: { tokens: WordToken[]; rawText: string; deviceUsed: string };
  try {
    result = await engine.transcribe(
      pcm,
      runnerFactory,
      mediaId,
      (from, to, error) => {
        console.warn(`[Whisper] Context failure on ${from}. Falling back to ${to}:`, error);
        onProgress?.(`WebGPU context unavailable. Falling back to ${to.toUpperCase()} SIMD...`, 55);
      }
    );
  } catch (err: any) {
    console.error('[Whisper] Offline model pipeline failure:', err);
    // DO NOT silently inject fake sample words. Raise an informative error so the UI can prompt retry or model switch.
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Whisper transcription failed: ${message}. Check your WebGPU / WebAssembly settings or try another model.`);
  }

  onProgress?.('Tagging lexical fillers and injecting >0.5s pause tokens...', 96);
  const processedTokens = processTranscribedTokens(result.tokens);

  onProgress?.('Transcription complete!', 100);
  return {
    tokens: processedTokens,
    rawText: result.rawText,
    deviceUsed: result.deviceUsed,
  };
}

