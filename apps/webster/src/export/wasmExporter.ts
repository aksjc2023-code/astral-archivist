/**
 * Browser-Native FFmpeg WASM Video Exporter with Deterministic MEMFS GC
 * Zero Server-Side Rendering Mandate (Argon ADR-001 Section 2.4)
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import {
  PlaybackSegment,
  WordToken,
  generateConcatDemuxerList,
  generateFfmpegFilterComplex,
  generateAssSubtitleScript,
} from '@astral/core';

export const MAX_BROWSER_WASM_INPUT_BYTES = 750 * 1024 * 1024; // 750 MB pre-flight limit

export interface WasmExportProgress {
  stage: string;
  percent: number;
  memfsAllocatedMb?: number;
  log?: string;
}

export interface WasmExportOptions {
  mode: 'stream-copy' | 'filter-complex-ass';
  includeSubtitles?: boolean;
  resolution?: '1080p' | '720p' | 'original';
  aspectRatio?: '16:9' | '9:16' | '1:1';
  onProgress?: (progress: WasmExportProgress) => void;
  onLog?: (log: string) => void;
}

// Reusable FFmpeg instance
let ffmpegInstance: FFmpeg | null = null;
let isLoaded = false;

/**
 * Initializes and loads the FFmpeg WASM core runtime.
 */
export async function getLoadedFFmpeg(
  onProgress?: (p: WasmExportProgress) => void,
  onLog?: (log: string) => void
): Promise<FFmpeg> {
  if (ffmpegInstance && isLoaded) {
    return ffmpegInstance;
  }

  onProgress?.({ stage: 'Loading FFmpeg WebAssembly Core (Single-Thread / MT)...', percent: 5 });
  const ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    onLog?.(message);
  });

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: `${baseURL}/ffmpeg-core.js`,
    wasmURL: `${baseURL}/ffmpeg-core.wasm`,
  });

  ffmpegInstance = ffmpeg;
  isLoaded = true;
  onProgress?.({ stage: 'FFmpeg WASM Core loaded successfully!', percent: 12 });
  return ffmpeg;
}

/**
 * Exports video entirely inside the browser using client-side FFmpeg WebAssembly.
 * Guarantees zero memory leaks through deterministic MEMFS cleanup.
 */
export async function exportVideoWithFfmpegWasm(
  mediaBlob: Blob,
  segments: PlaybackSegment[],
  tokens: WordToken[],
  options: WasmExportOptions
): Promise<{ outputBlob: Blob; durationSec: number; modeUsed: string }> {
  // Pre-flight memory safety check (Section 2.4)
  if (mediaBlob.size > MAX_BROWSER_WASM_INPUT_BYTES) {
    const sizeMb = (mediaBlob.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Media input exceeds browser WebAssembly 750MB safe limit (${sizeMb} MB). Please use Stream-Copy fast-path or the Desktop build.`
    );
  }

  const {
    mode = 'filter-complex-ass',
    includeSubtitles = true,
    onProgress,
    onLog,
  } = options;

  const allocatedFiles = new Set<string>();
  const inputFileName = 'input_media.mp4';
  const outputFileName = 'scarletcut_export.mp4';
  const inputSizeMb = Number((mediaBlob.size / (1024 * 1024)).toFixed(1));

  onProgress?.({
    stage: 'Initializing WebAssembly Environment...',
    percent: 3,
    memfsAllocatedMb: inputSizeMb,
  });

  const ffmpeg = await getLoadedFFmpeg(onProgress, onLog);

  // Hook progress event for encoding feedback
  const progressHandler = ({ progress }: { progress: number; time: number }) => {
    const pct = Math.min(95, Math.max(15, Math.round(progress * 80) + 15));
    onProgress?.({
      stage: mode === 'stream-copy'
        ? 'Executing fast stream-copy (-c copy)...'
        : 'Rendering frame pipeline with ASS subtitle burn-in...',
      percent: pct,
      memfsAllocatedMb: inputSizeMb,
    });
  };

  ffmpeg.on('progress', progressHandler);

  try {
    // 1. Write media file to virtual MEMFS
    onProgress?.({ stage: `Allocating MEMFS virtual file: ${inputFileName} (${inputSizeMb} MB)...`, percent: 15 });
    const mediaData = await fetchFile(mediaBlob);
    await ffmpeg.writeFile(inputFileName, mediaData);
    allocatedFiles.add(inputFileName);

    let ffmpegArgs: string[] = [];

    // 2. Select execution path based on mode and cuts
    if (mode === 'stream-copy' && segments.length > 0) {
      // Lossless fast-path using concat demuxer
      const concatList = generateConcatDemuxerList(segments, inputFileName);
      const concatFileName = 'concat_manifest.txt';
      await ffmpeg.writeFile(concatFileName, new TextEncoder().encode(concatList));
      allocatedFiles.add(concatFileName);

      ffmpegArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFileName,
        '-c', 'copy',
        '-movflags', '+faststart',
        outputFileName,
      ];
    } else {
      // Single-pass re-encode with optional ASS subtitle burn-in and filter_complex
      let subFileName: string | undefined;

      if (includeSubtitles && tokens.length > 0) {
        const assScript = generateAssSubtitleScript(tokens);
        subFileName = 'subtitles.ass';
        await ffmpeg.writeFile(subFileName, new TextEncoder().encode(assScript));
        allocatedFiles.add(subFileName);
      }

      if (segments.length > 0) {
        const { filterComplex, videoMap, audioMap } = generateFfmpegFilterComplex(segments, {
          subtitleVirtualFileName: subFileName,
        });

        ffmpegArgs = [
          '-i', inputFileName,
          '-filter_complex', filterComplex,
          '-map', videoMap,
          '-map', audioMap,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '22',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-movflags', '+faststart',
          outputFileName,
        ];
      } else {
        // Fallback: direct copy / encode
        ffmpegArgs = [
          '-i', inputFileName,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '22',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-movflags', '+faststart',
          outputFileName,
        ];
      }
    }

    allocatedFiles.add(outputFileName);

    onProgress?.({ stage: 'Executing FFmpeg pipeline in browser WebAssembly...', percent: 25 });
    await ffmpeg.exec(ffmpegArgs);

    // 3. Read output file and create detached buffer copy
    onProgress?.({ stage: 'Extracting detached buffer copy & reclaiming MEMFS heap...', percent: 96 });
    const rawOutputData = await ffmpeg.readFile(outputFileName);

    const dataBytes = typeof rawOutputData === 'string'
      ? new TextEncoder().encode(rawOutputData)
      : rawOutputData;

    const copyBuffer = new ArrayBuffer(dataBytes.byteLength);
    new Uint8Array(copyBuffer).set(dataBytes);

    const outputBlob = new Blob([copyBuffer], { type: 'video/mp4' });
    const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);

    onProgress?.({ stage: 'Export Complete!', percent: 100, memfsAllocatedMb: 0 });

    return {
      outputBlob,
      durationSec: totalDuration,
      modeUsed: mode,
    };
  } finally {
    // 4. Deterministic MEMFS GC: clean up all virtual descriptors
    for (const vFile of allocatedFiles) {
      try {
        await ffmpeg.deleteFile(vFile);
      } catch {
        // Catch and ignore if execution aborted prior to file creation
      }
    }
    allocatedFiles.clear();
  }
}
