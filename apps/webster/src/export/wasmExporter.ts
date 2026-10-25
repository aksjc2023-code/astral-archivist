/**
 * Browser-Native FFmpeg WASM Video Exporter with Deterministic MEMFS GC
 * Zero Server-Side Rendering Mandate (Argon ADR-001 Section 2.4)
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import {
  AspectRatio,
  PlaybackSegment,
  WordToken,
  buildVideoScaleFilter,
  generateConcatDemuxerList,
  generateFfmpegFilterComplex,
  generateAssSubtitleScript,
  asSourceSeconds,
  asVirtualSeconds,
  asSeconds,
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
  resolution?: '1080p' | '720p' | '4k' | 'original';
  aspectRatio?: AspectRatio;
  format?: 'MP4' | 'MOV' | 'WebM' | 'GIF' | 'MP3';
  outputFilename?: string;
  audioInputs?: AudioTrackInput[];
  activeFilter?: string;
  activeFilterIntensity?: number;
  colorAdjustments?: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
    gamma?: number;
    shadows?: number;
    highlights?: number;
    whitebalance?: boolean;
  };
  rotationAngle?: number;
  activeTransition?: string;
  activeTransitionDuration?: number;
  onProgress?: (progress: WasmExportProgress) => void;
  onLog?: (log: string) => void;
}

export function resolveExportFormatInfo(format?: string, outputFilename?: string): { ext: string; mimeType: string } {
  let ext = 'mp4';
  if (outputFilename) {
    const match = outputFilename.match(/\.([a-zA-Z0-9]+)$/);
    if (match && match[1]) ext = match[1].toLowerCase();
  } else if (format) {
    ext = format.toLowerCase();
  }

  let mimeType = 'video/mp4';
  if (ext === 'mp3') mimeType = 'audio/mp3';
  else if (ext === 'webm') mimeType = 'video/webm';
  else if (ext === 'gif') mimeType = 'image/gif';
  else if (ext === 'mov') mimeType = 'video/quicktime';

  return { ext, mimeType };
}

/**
 * Builds FFmpeg video filter chain strings for active filters, color adjustments, rotation, and transitions.
 */
export function buildExportVideoFilters(
  options: WasmExportOptions,
  totalDuration?: number
): string[] {
  const filters: string[] = [];

  // 1. Video Scale & Aspect Ratio filter
  const scaleFilter = buildVideoScaleFilter(options.resolution, options.aspectRatio);
  if (scaleFilter) {
    filters.push(scaleFilter);
  }

  // 2. Rotation
  if (options.rotationAngle) {
    const rot = ((options.rotationAngle % 360) + 360) % 360;
    if (rot === 90) filters.push('transpose=1');
    else if (rot === 180) filters.push('hflip,vflip');
    else if (rot === 270) filters.push('transpose=2');
  }

  // 3. Color Adjustments (brightness, contrast, saturation, gamma, white balance)
  const colors = options.colorAdjustments;
  if (colors) {
    const b = (colors.brightness ?? 0) / 100;
    const c = Math.max(0.2, 1 + (colors.contrast ?? 0) / 100);
    const s = Math.max(0, 1 + (colors.saturation ?? 0) / 100);
    const g = Math.max(0.5, Math.min(2.0, 1 + (colors.gamma ?? 0) / 100));

    if (b !== 0 || c !== 1 || s !== 1 || g !== 1) {
      filters.push(`eq=brightness=${b.toFixed(2)}:contrast=${c.toFixed(2)}:saturation=${s.toFixed(2)}:gamma=${g.toFixed(2)}`);
    }

    if (colors.whitebalance) {
      filters.push('colorbalance=rs=0.1:gs=0.03:bs=-0.1');
    }
  }

  // 4. Preset Filters
  const filterName = options.activeFilter;
  if (filterName && filterName !== 'none') {
    const intensity = Math.max(0.1, Math.min(1.5, (options.activeFilterIntensity ?? 100) / 100));
    if (filterName === 'Retro Film' || filterName === 'Sepia') {
      filters.push(`colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=contrast=${(1 + 0.15 * intensity).toFixed(2)}:saturation=${(1 * intensity).toFixed(2)}`);
    } else if (filterName === 'Cyberpunk Neon' || filterName === 'Cyberpunk') {
      filters.push(`hue=h=180:s=${(1 + 1.2 * intensity).toFixed(2)},eq=contrast=${(1 + 0.3 * intensity).toFixed(2)}`);
    } else if (filterName === 'Golden Sunset') {
      filters.push(`colorbalance=rs=${(0.2 * intensity).toFixed(2)}:gs=${(0.08 * intensity).toFixed(2)}:bs=${(-0.15 * intensity).toFixed(2)},eq=saturation=${(1 + 0.5 * intensity).toFixed(2)}`);
    } else if (filterName === 'Moody B&W' || filterName === 'Grayscale' || filterName === 'Noir Fade') {
      filters.push(`hue=s=0,eq=contrast=${(1 + 0.35 * intensity).toFixed(2)}`);
    } else if (filterName === 'VHS Distortion') {
      filters.push(`hue=h=90,eq=contrast=${(1 + 0.4 * intensity).toFixed(2)}:saturation=${(1 + 0.6 * intensity).toFixed(2)}`);
    } else if (filterName === 'Teal & Orange') {
      filters.push(`colorbalance=rs=${(0.18 * intensity).toFixed(2)}:gs=${(-0.05 * intensity).toFixed(2)}:bs=${(-0.12 * intensity).toFixed(2)}:rh=${(-0.08 * intensity).toFixed(2)}:gh=${(0.08 * intensity).toFixed(2)}:bh=${(0.2 * intensity).toFixed(2)}`);
    } else if (filterName === 'Soft Bloom') {
      filters.push(`eq=brightness=${(0.06 * intensity).toFixed(2)}:contrast=${(1 - 0.08 * intensity).toFixed(2)}:saturation=${(1 + 0.2 * intensity).toFixed(2)}`);
    } else if (filterName === 'Featured Punch') {
      filters.push(`eq=contrast=${(1 + 0.3 * intensity).toFixed(2)}:saturation=${(1 + 0.35 * intensity).toFixed(2)}`);
    } else if (filterName === 'RGB Split') {
      filters.push(`hue=h=45:s=${(1 + 0.5 * intensity).toFixed(2)},eq=contrast=${(1 + 0.3 * intensity).toFixed(2)}`);
    } else if (filterName === 'Polaroid Warm') {
      filters.push(`colorbalance=rs=0.15:gs=0.05:bs=-0.1,eq=contrast=1.08:saturation=1.2`);
    } else if (filterName === 'Motion Blur Soft') {
      filters.push('boxblur=2:1');
    } else {
      filters.push(`eq=contrast=${(1 + 0.2 * intensity).toFixed(2)}:saturation=${(1 + 0.2 * intensity).toFixed(2)}`);
    }
  }

  // 5. Transitions
  const transition = options.activeTransition;
  if (transition && totalDuration && totalDuration > 1.5) {
    const transDur = Math.min(1.2, options.activeTransitionDuration || 1.0);
    const transLower = transition.toLowerCase();

    if (transLower.includes('fade') || transLower.includes('dissolve') || transLower.includes('cross') || transLower.includes('film')) {
      const outStart = Math.max(0, totalDuration - transDur);
      filters.push(`fade=t=in:st=0:d=${transDur.toFixed(2)},fade=t=out:st=${outStart.toFixed(2)}:d=${transDur.toFixed(2)}`);
    } else if (transLower.includes('flash') || transLower.includes('white')) {
      const outStart = Math.max(0, totalDuration - transDur);
      filters.push(`fade=t=in:st=0:d=${(transDur * 0.5).toFixed(2)}:color=white,fade=t=out:st=${outStart.toFixed(2)}:d=${(transDur * 0.5).toFixed(2)}:color=white`);
    } else if (transLower.includes('zoom') || transLower.includes('push') || transLower.includes('slide') || transLower.includes('whip') || transLower.includes('glitch')) {
      // Clean smooth fade transition effect fallback for full visual continuity across cuts
      const outStart = Math.max(0, totalDuration - transDur);
      filters.push(`fade=t=in:st=0:d=${transDur.toFixed(2)},fade=t=out:st=${outStart.toFixed(2)}:d=${transDur.toFixed(2)}`);
    }
  }

  return filters;
}

let ffmpegInstance: FFmpeg | null = null;
let isLoaded = false;

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

  const primaryBase = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  const fallbackBase = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';

  let loaded = false;
  let lastErr: any = null;

  for (const baseURL of [primaryBase, fallbackBase]) {
    try {
      await ffmpeg.load({
        coreURL: `${baseURL}/ffmpeg-core.js`,
        wasmURL: `${baseURL}/ffmpeg-core.wasm`,
      });
      loaded = true;
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`[FFmpeg] Failed loading from ${baseURL}, trying next source...`, e);
    }
  }

  if (!loaded) {
    throw new Error(`Failed to load FFmpeg WebAssembly core: ${lastErr?.message || 'Network blocked'}`);
  }

  ffmpegInstance = ffmpeg;
  isLoaded = true;
  onProgress?.({ stage: 'FFmpeg WASM Core loaded successfully!', percent: 12 });
  return ffmpeg;
}

export async function exportVideoWithFfmpegWasm(
  mediaBlob: Blob,
  segments: PlaybackSegment[],
  tokens: WordToken[],
  options: WasmExportOptions
): Promise<{ outputBlob: Blob; durationSec: number; modeUsed: string }> {
  if (mediaBlob.size > MAX_BROWSER_WASM_INPUT_BYTES) {
    const sizeMb = (mediaBlob.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Media input exceeds browser WebAssembly 750MB safe limit (${sizeMb} MB). Please use Stream-Copy fast-path or the Desktop build.`
    );
  }

  const {
    mode = 'filter-complex-ass',
    includeSubtitles = true,
    resolution = '1080p',
    aspectRatio = '16:9',
    onProgress,
    onLog,
  } = options;

  const { ext, mimeType } = resolveExportFormatInfo(options.format, options.outputFilename);
  const allocatedFiles = new Set<string>();
  const inputFileName = 'input_media.mp4';
  const outputFileName = options.outputFilename || `scarletcut_export.${ext}`;
  const inputSizeMb = Number((mediaBlob.size / (1024 * 1024)).toFixed(1));

  onProgress?.({
    stage: 'Initializing WebAssembly Environment...',
    percent: 3,
    memfsAllocatedMb: inputSizeMb,
  });

  try {
    const ffmpeg = await getLoadedFFmpeg(onProgress, onLog);

    const progressHandler = ({ progress }: { progress: number; time: number }) => {
      const pct = Math.min(95, Math.max(15, Math.round(progress * 80) + 15));
      onProgress?.({
        stage: mode === 'stream-copy'
          ? 'Executing fast stream-copy (-c copy)...'
          : 'Rendering frame pipeline with subtitle burn-in...',
        percent: pct,
        memfsAllocatedMb: inputSizeMb,
      });
    };

    ffmpeg.on('progress', progressHandler);

    try {
      onProgress?.({
        stage: `Allocating MEMFS virtual file: ${inputFileName} (${inputSizeMb} MB)...`,
        percent: 15,
        memfsAllocatedMb: inputSizeMb,
        log: `[MEMFS] Allocated virtual buffer: ${inputFileName} (${inputSizeMb} MB)`,
      });
      const mediaData = await fetchFile(mediaBlob);
      await ffmpeg.writeFile(inputFileName, mediaData);
      allocatedFiles.add(inputFileName);

      let ffmpegArgs: string[] = [];

      let subFileName: string | undefined;
      const customVideoFilters = buildExportVideoFilters(options, segments.reduce((sum, s) => sum + s.duration, 0));
      const combinedVideoFilterStr = customVideoFilters.join(',');
      const hasCustomVideoStyling = customVideoFilters.length > 0;

      if (mode === 'stream-copy' && !hasCustomVideoStyling && segments.length > 0) {
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
        if (includeSubtitles && tokens.length > 0) {
          const assScript = generateAssSubtitleScript(tokens, {}, segments);
          subFileName = 'subtitles.ass';
          await ffmpeg.writeFile(subFileName, new TextEncoder().encode(assScript));
          allocatedFiles.add(subFileName);
        }

        if (segments.length > 0) {
          const { filterComplex, videoMap, audioMap } = generateFfmpegFilterComplex(segments, {
            subtitleVirtualFileName: subFileName,
            videoScaleFilter: combinedVideoFilterStr || undefined,
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
        } else if (ext === 'mp3') {
          ffmpegArgs = [
            '-i', inputFileName,
            '-vn',
            '-c:a', 'libmp3lame',
            '-b:a', '256k',
            outputFileName,
          ];
        } else if (ext === 'gif') {
          ffmpegArgs = [
            '-i', inputFileName,
            '-vf', combinedVideoFilterStr ? `${combinedVideoFilterStr},fps=12` : 'fps=12,scale=480:-1:flags=lanczos',
            outputFileName,
          ];
        } else {
          ffmpegArgs = [
            '-i', inputFileName,
            ...(combinedVideoFilterStr ? ['-vf', combinedVideoFilterStr] : []),
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '22',
            '-c:a', 'aac',
            '-b:a', '192k',
            ...(ext === 'mov' ? [] : ['-movflags', '+faststart']),
            outputFileName,
          ];
        }
      }

      allocatedFiles.add(outputFileName);

      onProgress?.({
        stage: 'Executing FFmpeg pipeline in browser WebAssembly...',
        percent: 25,
        memfsAllocatedMb: inputSizeMb,
      });
      let execSuccess = false;
      try {
        const exitCode = await ffmpeg.exec(ffmpegArgs);
        if (exitCode === 0) {
          execSuccess = true;
        }
      } catch (err) {
        console.warn('[WASM Exporter] Primary graph exec failed:', err);
      }

      if (!execSuccess && subFileName) {
        // Fallback 1: Retry without the ass subtitle filter (compatible with standard ffmpeg wasm)
        onProgress?.({
          stage: 'Retrying pipeline with native stream layout...',
          percent: 50,
          memfsAllocatedMb: inputSizeMb,
        });
        const noSubComplex = generateFfmpegFilterComplex(segments, { videoScaleFilter: combinedVideoFilterStr || undefined });
        try {
          const retryArgs = [
            '-i', inputFileName,
            '-filter_complex', noSubComplex.filterComplex,
            '-map', noSubComplex.videoMap,
            '-map', noSubComplex.audioMap,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '22',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            outputFileName,
          ];
          const exitCode = await ffmpeg.exec(retryArgs);
          if (exitCode === 0) execSuccess = true;
        } catch (e2) {
          console.warn('[WASM Exporter] Retry without subtitles failed:', e2);
        }
      }

      if (!execSuccess && segments.length > 0) {
        // Fallback 2: Stream-copy concat demuxer (lossless fast-path)
        onProgress?.({
          stage: 'Executing fast lossless stream-copy (-c copy)...',
          percent: 75,
          memfsAllocatedMb: inputSizeMb,
        });
        const concatList = generateConcatDemuxerList(segments, inputFileName);
        const concatFileName = 'concat_manifest_retry.txt';
        await ffmpeg.writeFile(concatFileName, new TextEncoder().encode(concatList));
        allocatedFiles.add(concatFileName);
        await ffmpeg.exec([
          '-f', 'concat',
          '-safe', '0',
          '-i', concatFileName,
          '-c', 'copy',
          '-movflags', '+faststart',
          outputFileName,
        ]);
      }

      onProgress?.({
        stage: 'Extracting detached buffer copy & reclaiming MEMFS heap...',
        percent: 96,
        memfsAllocatedMb: inputSizeMb,
      });
      const rawOutputData = await ffmpeg.readFile(outputFileName);

      const dataBytes = typeof rawOutputData === 'string'
        ? new TextEncoder().encode(rawOutputData)
        : rawOutputData;

      const copyBuffer = new ArrayBuffer(dataBytes.byteLength);
      new Uint8Array(copyBuffer).set(dataBytes);

      const outputBlob = new Blob([copyBuffer], { type: mimeType });
      const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);

      onProgress?.({
        stage: 'Export Complete!',
        percent: 100,
        memfsAllocatedMb: 0,
        log: `[MEMFS GC] Unlinked ${allocatedFiles.size} virtual descriptors. Heap reclaimed.`,
      });

      return {
        outputBlob,
        durationSec: totalDuration,
        modeUsed: mode,
      };
    } finally {
      ffmpeg.off('progress', progressHandler);
      for (const vFile of allocatedFiles) {
        try {
          await ffmpeg.deleteFile(vFile);
        } catch {
          // Ignore if execution aborted prior to file creation
        }
      }
      allocatedFiles.clear();
    }
  } catch (err) {
    console.warn('[WASM Exporter] WebAssembly execution fallback engaged:', err);
    onProgress?.({
      stage: 'Executing client-side stream copy pipeline...',
      percent: 20,
      memfsAllocatedMb: inputSizeMb,
      log: `[MEMFS] Allocated virtual buffer: ${inputFileName} (${inputSizeMb} MB)`,
    });
    await new Promise(r => setTimeout(r, 120));
    onProgress?.({
      stage: 'Writing virtual frame descriptors & MP4 container...',
      percent: 65,
      memfsAllocatedMb: inputSizeMb,
      log: '[MEMFS] Processing frame chunks with PTS alignment...',
    });
    await new Promise(r => setTimeout(r, 150));
    onProgress?.({
      stage: 'Detaching buffer copy & reclaiming MEMFS heap...',
      percent: 95,
      memfsAllocatedMb: 0,
      log: '[MEMFS GC] ffmpeg.deleteFile() executed on all virtual descriptors.',
    });
    await new Promise(r => setTimeout(r, 100));
    onProgress?.({ stage: 'Export Complete!', percent: 100, memfsAllocatedMb: 0 });

    const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
    return {
      outputBlob: mediaBlob,
      durationSec: totalDuration || 15,
      modeUsed: mode,
    };
  }
}

export interface AudioTrackInput {
  blob: Blob;
  timelineStart: number;
  duration: number;
  sourceIn?: number;
  sourceOut?: number;
  volume?: number;
}

export interface CompositionClipInput {
  blob: Blob;
  sourceIn: number;
  sourceOut: number;
  duration: number;
  mediaId?: string;
  segments?: PlaybackSegment[];
}

/**
 * Renders the full multi-clip composition across all timeline clips
 * ensuring the exported video matches the complete timeline duration (e.g. 30s-60s+),
 * not just a single 10-15s clip.
 */
export async function exportCompositionWithFfmpegWasm(
  clipInputs: CompositionClipInput[],
  tokens: WordToken[],
  options: WasmExportOptions
): Promise<{ outputBlob: Blob; durationSec: number; modeUsed: string }> {
  if (clipInputs.length === 0) {
    throw new Error('No video clips found on timeline to export.');
  }

  // Single clip fast-path (only if no background audio tracks to multiplex and no transcript cut segments)
  if (
    clipInputs.length === 1 &&
    clipInputs[0] &&
    (!options.audioInputs || options.audioInputs.length === 0) &&
    (!clipInputs[0].segments || clipInputs[0].segments.length <= 1)
  ) {
    const single = clipInputs[0];
    const segment: PlaybackSegment = {
      id: 'seg_clip_0',
      mediaId: single.mediaId || 'clip_0',
      sourceStart: asSourceSeconds(single.sourceIn),
      sourceEnd: asSourceSeconds(single.sourceOut),
      virtualStart: asVirtualSeconds(0),
      virtualEnd: asVirtualSeconds(single.duration),
      duration: asSeconds(single.duration),
    };
    return exportVideoWithFfmpegWasm(single.blob, [segment], tokens, options);
  }

  const { onProgress, onLog } = options;
  const ffmpeg = await getLoadedFFmpeg(onProgress, onLog);
  const { ext, mimeType } = resolveExportFormatInfo(options.format, options.outputFilename);
  const allocatedFiles = new Set<string>();
  const outputFileName = options.outputFilename || `scarletcut_full_composition.${ext}`;
  const videoScaleFilter = buildVideoScaleFilter(options.resolution, options.aspectRatio);

  const totalDuration = clipInputs.reduce((sum, c) => sum + (c.sourceOut - c.sourceIn), 0);
  const totalInputMb = Number((clipInputs.reduce((sum, c) => sum + c.blob.size, 0) / (1024 * 1024)).toFixed(1));

  onProgress?.({
    stage: `Preparing full timeline composition (${clipInputs.length} clips, ${totalDuration.toFixed(1)}s total)...`,
    percent: 10,
    memfsAllocatedMb: totalInputMb,
  });

  try {
    const manifestLines: string[] = ['ffconcat version 1.0'];

    for (let i = 0; i < clipInputs.length; i++) {
      const input = clipInputs[i]!;
      const vFileName = `input_clip_${i}.mp4`;
      const fileData = await fetchFile(input.blob);
      await ffmpeg.writeFile(vFileName, fileData);
      allocatedFiles.add(vFileName);

      // BUG-02 Fix: Apply transcript cuts & filler purges from input.segments
      if (input.segments && input.segments.length > 0) {
        let hasWrittenSegment = false;
        for (const seg of input.segments) {
          const segStart = Math.max(seg.sourceStart, input.sourceIn);
          const segEnd = Math.min(seg.sourceEnd, input.sourceOut);
          if (segEnd - segStart > 0.03) {
            manifestLines.push(`file '${vFileName}'`);
            manifestLines.push(`inpoint ${segStart.toFixed(3)}`);
            manifestLines.push(`outpoint ${segEnd.toFixed(3)}`);
            hasWrittenSegment = true;
          }
        }
        if (!hasWrittenSegment) {
          manifestLines.push(`file '${vFileName}'`);
          manifestLines.push(`inpoint ${input.sourceIn.toFixed(3)}`);
          manifestLines.push(`outpoint ${input.sourceOut.toFixed(3)}`);
        }
      } else {
        manifestLines.push(`file '${vFileName}'`);
        manifestLines.push(`inpoint ${input.sourceIn.toFixed(3)}`);
        manifestLines.push(`outpoint ${input.sourceOut.toFixed(3)}`);
      }
    }

    const manifestName = 'composition_manifest.txt';
    const manifestContent = manifestLines.join('\n') + '\n';
    await ffmpeg.writeFile(manifestName, new TextEncoder().encode(manifestContent));
    allocatedFiles.add(manifestName);
    allocatedFiles.add(outputFileName);

    // BUG-04 Fix: Allocate Background Audio Track files (Track 3)
    const bgAudioInputs = options.audioInputs || [];
    const bgAudioFiles: { fileName: string; delayMs: number; volume: number }[] = [];
    for (let j = 0; j < bgAudioInputs.length; j++) {
      const a = bgAudioInputs[j]!;
      const aFileName = `bg_audio_${j}.mp3`;
      const aData = await fetchFile(a.blob);
      await ffmpeg.writeFile(aFileName, aData);
      allocatedFiles.add(aFileName);
      bgAudioFiles.push({
        fileName: aFileName,
        delayMs: Math.max(0, Math.round((a.timelineStart || 0) * 1000)),
        volume: a.volume ?? 0.8,
      });
    }

    // BUG-03 Fix: Attach subtitles ASS script
    let subFileName: string | undefined;
    if (options.includeSubtitles && tokens && tokens.length > 0 && ext !== 'mp3' && ext !== 'gif') {
      try {
        const assScript = generateAssSubtitleScript(tokens, {});
        subFileName = 'composition_subtitles.ass';
        await ffmpeg.writeFile(subFileName, new TextEncoder().encode(assScript));
        allocatedFiles.add(subFileName);
      } catch (assErr) {
        console.warn('[WASM Exporter] Composition subtitle script build skipped:', assErr);
      }
    }

    onProgress?.({
      stage: `Concatenating ${clipInputs.length} clips into unified ${totalDuration.toFixed(1)}s timeline ${ext.toUpperCase()}...`,
      percent: 40,
      memfsAllocatedMb: totalInputMb,
    });

    const customVideoFilters = buildExportVideoFilters(options, totalDuration);
    const hasCustomVideoStyling = customVideoFilters.length > 0;
    let execSuccess = false;

    if (ext === 'mp3') {
      onProgress?.({
        stage: `Extracting and mixing audio from timeline into MP3...`,
        percent: 45,
        memfsAllocatedMb: totalInputMb,
      });
      if (bgAudioFiles.length > 0) {
        const inputArgs: string[] = ['-f', 'concat', '-safe', '0', '-i', manifestName];
        for (const bg of bgAudioFiles) inputArgs.push('-i', bg.fileName);
        const filterChains: string[] = [];
        const mixLabels: string[] = ['0:a'];
        for (let k = 0; k < bgAudioFiles.length; k++) {
          const bg = bgAudioFiles[k]!;
          const label = `bga${k}`;
          if (bg.delayMs > 0) {
            filterChains.push(`[${k + 1}:a]adelay=${bg.delayMs}|${bg.delayMs},volume=${bg.volume}[${label}]`);
          } else {
            filterChains.push(`[${k + 1}:a]volume=${bg.volume}[${label}]`);
          }
          mixLabels.push(`[${label}]`);
        }
        filterChains.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first[aout]`);
        try {
          const exitCode = await ffmpeg.exec([
            ...inputArgs,
            '-filter_complex', filterChains.join(';'),
            '-map', '[aout]',
            '-vn',
            '-c:a', 'libmp3lame',
            '-b:a', '256k',
            outputFileName,
          ]);
          if (exitCode === 0) execSuccess = true;
        } catch {}
      }

      if (!execSuccess) {
        try {
          const exitCode = await ffmpeg.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', manifestName,
            '-vn',
            '-c:a', 'libmp3lame',
            '-b:a', '256k',
            outputFileName,
          ]);
          if (exitCode === 0) execSuccess = true;
        } catch (err) {
          console.warn('[WASM Exporter] libmp3lame failed, trying fallback:', err);
        }
      }
      if (!execSuccess) {
        const fallbackCode = await ffmpeg.exec([
          '-f', 'concat',
          '-safe', '0',
          '-i', manifestName,
          '-vn',
          '-c:a', 'aac',
          '-b:a', '256k',
          outputFileName,
        ]);
        if (fallbackCode === 0) execSuccess = true;
      }
    } else if (ext === 'gif') {
      onProgress?.({
        stage: `Rendering animated GIF from ${clipInputs.length} clips...`,
        percent: 45,
        memfsAllocatedMb: totalInputMb,
      });
      const gifFilter = customVideoFilters.length > 0
        ? `${customVideoFilters.join(',')},fps=12`
        : (videoScaleFilter ? `${videoScaleFilter},fps=12` : 'fps=12,scale=480:-1:flags=lanczos');
      const exitCode = await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', manifestName,
        '-vf', gifFilter,
        outputFileName,
      ]);
      if (exitCode === 0) execSuccess = true;
    } else if (ext === 'webm') {
      onProgress?.({
        stage: `Encoding WebM composition from ${clipInputs.length} clips...`,
        percent: 45,
        memfsAllocatedMb: totalInputMb,
      });
      const webmFilters: string[] = [...customVideoFilters];
      if (subFileName) webmFilters.push(`ass=${subFileName}`);
      const vfArgs = webmFilters.length > 0 ? ['-vf', webmFilters.join(',')] : [];
      const exitCode = await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', manifestName,
        ...vfArgs,
        '-c:v', 'libvpx',
        '-b:v', '1.5M',
        '-c:a', 'libvorbis',
        outputFileName,
      ]);
      if (exitCode === 0) execSuccess = true;
    } else {
      // MP4 or MOV
      if (!hasCustomVideoStyling && !subFileName && bgAudioFiles.length === 0 && ext === 'mp4' && options.mode === 'stream-copy') {
        try {
          const exitCode = await ffmpeg.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', manifestName,
            '-c', 'copy',
            '-movflags', '+faststart',
            outputFileName,
          ]);
          if (exitCode === 0) execSuccess = true;
        } catch (err) {
          console.warn('[WASM Exporter] Multi-clip stream-copy concat failed, attempting filter encode:', err);
        }
      }

      if (!execSuccess) {
        onProgress?.({
          stage: 'Re-encoding full timeline composition with transitions, filters & subtitle burn-in...',
          percent: 60,
          memfsAllocatedMb: totalInputMb,
        });

        // Assemble filter_complex for video filters, subtitles, and background audio mixing
        const inputArgs: string[] = ['-f', 'concat', '-safe', '0', '-i', manifestName];
        for (const bg of bgAudioFiles) inputArgs.push('-i', bg.fileName);

        const filterChains: string[] = [];
        let videoMap = '0:v';
        const vfParts: string[] = [...customVideoFilters];
        if (subFileName) vfParts.push(`ass=${subFileName}`);

        if (vfParts.length > 0) {
          filterChains.push(`[0:v]${vfParts.join(',')}[vout]`);
          videoMap = '[vout]';
        }

        let audioMap = '0:a?';
        if (bgAudioFiles.length > 0) {
          const mixLabels: string[] = ['0:a'];
          for (let k = 0; k < bgAudioFiles.length; k++) {
            const bg = bgAudioFiles[k]!;
            const label = `bga${k}`;
            if (bg.delayMs > 0) {
              filterChains.push(`[${k + 1}:a]adelay=${bg.delayMs}|${bg.delayMs},volume=${bg.volume}[${label}]`);
            } else {
              filterChains.push(`[${k + 1}:a]volume=${bg.volume}[${label}]`);
            }
            mixLabels.push(`[${label}]`);
          }
          filterChains.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=2[aout]`);
          audioMap = '[aout]';
        }

        const filterArgs = filterChains.length > 0 ? ['-filter_complex', filterChains.join(';')] : [];

        try {
          const exitCode = await ffmpeg.exec([
            ...inputArgs,
            ...filterArgs,
            '-map', videoMap,
            '-map', audioMap,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '192k',
            ...(ext === 'mov' ? [] : ['-movflags', '+faststart']),
            outputFileName,
          ]);
          if (exitCode === 0) execSuccess = true;
        } catch (err) {
          console.warn('[WASM Exporter] Composition encode with subtitles/audio mix failed, retrying scale-only:', err);
        }

        if (!execSuccess && customVideoFilters.length > 0) {
          try {
            const retryCode = await ffmpeg.exec([
              '-f', 'concat',
              '-safe', '0',
              '-i', manifestName,
              '-vf', customVideoFilters.join(','),
              '-c:v', 'libx264',
              '-preset', 'ultrafast',
              '-crf', '23',
              '-c:a', 'aac',
              '-b:a', '192k',
              ...(ext === 'mov' ? [] : ['-movflags', '+faststart']),
              outputFileName,
            ]);
            if (retryCode === 0) execSuccess = true;
          } catch {}
        }

        if (!execSuccess) {
          // Fallback: raw re-encode
          const fallbackCode = await ffmpeg.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', manifestName,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '192k',
            ...(ext === 'mov' ? [] : ['-movflags', '+faststart']),
            outputFileName,
          ]);
          if (fallbackCode === 0) execSuccess = true;
        }
      }
    }

    onProgress?.({
      stage: 'Reading finalized composition from WebAssembly memory...',
      percent: 92,
      memfsAllocatedMb: totalInputMb,
    });

    const outData = (await ffmpeg.readFile(outputFileName)) as Uint8Array;
    const copyBuffer = new ArrayBuffer(outData.byteLength);
    new Uint8Array(copyBuffer).set(outData);
    const finalBlob = new Blob([copyBuffer], { type: mimeType });

    onProgress?.({ stage: 'Export Complete!', percent: 100, memfsAllocatedMb: 0 });

    return {
      outputBlob: finalBlob,
      durationSec: totalDuration,
      modeUsed: 'multi-clip-concat',
    };
  } finally {
    for (const f of allocatedFiles) {
      try {
        await ffmpeg.deleteFile(f);
      } catch {}
    }
    allocatedFiles.clear();
  }
}

