/**
 * Pure TypeScript FFmpeg filter_complex & ASS Subtitle Script Builder
 * Zero-DOM dependency (compatible with lib: ["ES2022"])
 */

import { AspectRatio, PlaybackSegment, WordToken, TimeRange, asSourceSeconds } from './types';
import { sourceToVirtualTime } from './timelineEngine';

export interface OverlayItem {
  text: string;
  startTime: number;
  endTime: number;
  style?: 'title' | 'sticker';
  posX?: number; // 0 to 100 percent
  posY?: number; // 0 to 100 percent
  fontSize?: number;
  colorHex?: string;
}

export interface AssScriptOptions {
  title?: string;
  fontSize?: number;
  fontName?: string;
  primaryColorHex?: string;  // e.g. '&H00FFFFFF' (AABBGGRR in ASS)
  outlineColorHex?: string;  // e.g. '&H00101010'
  shadowColorHex?: string;   // e.g. '&H80000000'
  playResX?: number;
  playResY?: number;
  wordsPerSentence?: number;
  overlays?: OverlayItem[];
}

/**
 * Formats time in seconds to ASS subtitle timestamp format: H:MM:SS.cc (centiseconds)
 */
export function formatAssTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00:00.00';
  }

  const totalHundredths = Math.round(seconds * 100);
  const hundredths = totalHundredths % 100;
  const totalSeconds = Math.floor(totalHundredths / 100);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return `${hours}:${pad(mins, 2)}:${pad(secs, 2)}.${pad(hundredths, 2)}`;
}

/**
 * Generates standard Advanced SubStation Alpha (ASS v4.00+) subtitle script
 * from active (non-deleted) WordTokens.
 *
 * When `segments` are provided, token source timestamps are projected through
 * the bijective virtual timeline mapping Phi(tau) so subtitles stay in sync
 * after ripple cuts.
 */
export function generateAssSubtitleScript(
  tokens: WordToken[],
  options: AssScriptOptions = {},
  segments?: readonly PlaybackSegment[]
): string {
  const {
    title = 'ScarletCut Dynamic Subtitles',
    fontSize = 52,
    fontName = 'Arial',
    primaryColorHex = '&H00FFFFFF',
    outlineColorHex = '&H00101010',
    shadowColorHex = '&H80000000',
    playResX = 1920,
    playResY = 1080,
    wordsPerSentence = 6,
  } = options;

  const activeTokens = tokens.filter(t => !t.deleted && !t.isPause && t.text.trim().length > 0);

  const lines: string[] = [
    '[Script Info]',
    `Title: ${title}`,
    'ScriptType: v4.00+',
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: ScarletDefault,${fontName},${fontSize},${primaryColorHex},&H000000FF,${outlineColorHex},${shadowColorHex},-1,0,0,0,100,100,0,0,1,3,1.5,2,40,40,65,1`,
    `Style: ScarletTitle,Arial,60,&H00FFFFFF,&H000000FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,3.5,2,2,40,40,80,1`,
    `Style: ScarletSticker,Arial,48,&H0000FFFF,&H000000FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,3.5,2,5,40,40,40,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  // Render Title and Sticker overlays if provided
  if (options.overlays && options.overlays.length > 0) {
    for (const ov of options.overlays) {
      if (!ov.text || !ov.text.trim()) continue;
      const sTime = formatAssTimestamp(Math.max(0, ov.startTime));
      const eTime = formatAssTimestamp(Math.max(ov.endTime, ov.startTime + 0.5));
      const styleName = ov.style === 'sticker' ? 'ScarletSticker' : 'ScarletTitle';
      const x = Math.round(((ov.posX ?? 50) / 100) * playResX);
      const y = Math.round(((ov.posY ?? (ov.style === 'sticker' ? 22 : 82)) / 100) * playResY);
      const fs = ov.fontSize ? `\\fs${ov.fontSize}` : '';
      const posTag = `{\\pos(${x},${y})${fs}\\b1}`;
      lines.push(`Dialogue: 1,${sTime},${eTime},${styleName},,0,0,0,,${posTag}${ov.text}`);
    }
  }

  if (activeTokens.length === 0) {
    return lines.join('\n');
  }

  const dialogueChunks: WordToken[][] = [];
  let currentChunk: WordToken[] = [];

  for (let i = 0; i < activeTokens.length; i++) {
    const token = activeTokens[i];
    if (!token) continue;

    if (currentChunk.length > 0) {
      const prev = currentChunk[currentChunk.length - 1];
      const gap = prev ? token.start - prev.end : 0;

      if (currentChunk.length >= wordsPerSentence || gap > 0.40) {
        dialogueChunks.push(currentChunk);
        currentChunk = [];
      }
    }

    currentChunk.push(token);
  }

  if (currentChunk.length > 0) {
    dialogueChunks.push(currentChunk);
  }

  const hasValidSegments = Array.isArray(segments) && segments.length > 0;

  for (const chunk of dialogueChunks) {
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    if (!first || !last) continue;

    const mappedStartSec = hasValidSegments
      ? Number(sourceToVirtualTime(asSourceSeconds(first.start), segments))
      : Number(first.start);
    const rawMappedEndSec = hasValidSegments
      ? Number(sourceToVirtualTime(asSourceSeconds(last.end), segments))
      : Number(last.end);

    const startTime = formatAssTimestamp(mappedStartSec);
    const endTime = formatAssTimestamp(Math.max(rawMappedEndSec, mappedStartSec + 0.3));
    const sentenceText = chunk.map(t => t.replacementText ?? t.text).join(' ');

    lines.push(`Dialogue: 0,${startTime},${endTime},ScarletDefault,,0,0,0,,${sentenceText}`);
  }

  return lines.join('\n');
}

/**
 * Generates an FFmpeg concat demuxer manifest file for lossless stream-copy (-c copy)
 * across non-deleted PlaybackSegments.
 */
export function generateConcatDemuxerList(
  segments: PlaybackSegment[],
  inputVirtualFileName: string
): string {
  const safeFilename = inputVirtualFileName.replace(/'/g, "'\\''");
  const lines: string[] = ['ffconcat version 1.0'];

  for (const seg of segments) {
    lines.push(`file '${safeFilename}'`);
    lines.push(`inpoint ${seg.sourceStart.toFixed(3)}`);
    lines.push(`outpoint ${seg.sourceEnd.toFixed(3)}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Builds an FFmpeg scale+pad filter expression for target resolution and aspect ratio.
 */
export function buildVideoScaleFilter(
  resolution: '720p' | '1080p' | '4k' | 'original' = '1080p',
  aspectRatio: AspectRatio = '16:9'
): string | undefined {
  if (resolution === 'original' && aspectRatio === '16:9') {
    return undefined;
  }

  const baseHeight = resolution === '4k' ? 2160 : resolution === '720p' ? 720 : 1080;
  let width = Math.round((baseHeight * 16) / 9);
  let height = baseHeight;

  if (aspectRatio === '9:16') {
    width = baseHeight;
    height = Math.round((baseHeight * 16) / 9);
  } else if (aspectRatio === '1:1') {
    width = baseHeight;
    height = baseHeight;
  } else if (aspectRatio === '4:5') {
    width = Math.round((baseHeight * 4) / 5);
    height = baseHeight;
  } else if (aspectRatio === '21:9') {
    width = Math.round((baseHeight * 21) / 9);
    height = baseHeight;
  } else if (aspectRatio === '4:3') {
    width = Math.round((baseHeight * 4) / 3);
    height = baseHeight;
  }

  const evenW = width % 2 === 0 ? width : width + 1;
  const evenH = height % 2 === 0 ? height : height + 1;

  return `scale=${evenW}:${evenH}:force_original_aspect_ratio=decrease,pad=${evenW}:${evenH}:(ow-iw)/2:(oh-ih)/2:black`;
}

export interface FilterComplexOptions {
  subtitleVirtualFileName?: string;
  videoScaleFilter?: string;
}

/**
 * Generates frame-accurate single-pass FFmpeg filter_complex for ripple playback segments.
 */
export function generateFfmpegFilterComplex(
  segments: PlaybackSegment[],
  options: FilterComplexOptions = {}
): {
  filterComplex: string;
  videoMap: string;
  audioMap: string;
  segmentCount: number;
} {
  if (segments.length === 0) {
    return {
      filterComplex: '',
      videoMap: '0:v',
      audioMap: '0:a',
      segmentCount: 0,
    };
  }

  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;

    const sStart = seg.sourceStart.toFixed(3);
    const sEnd = seg.sourceEnd.toFixed(3);

    filterParts.push(`[0:v]trim=start=${sStart}:end=${sEnd},setpts=PTS-STARTPTS[v${i}]`);
    filterParts.push(`[0:a]atrim=start=${sStart}:end=${sEnd},asetpts=PTS-STARTPTS[a${i}]`);

    concatInputs.push(`[v${i}][a${i}]`);
  }

  let finalVideoMap = '[outv]';
  const finalAudioMap = '[outa]';

  if (segments.length === 1) {
    let videoFilter = '[v0]';
    if (options.videoScaleFilter) {
      filterParts.push(`${videoFilter}${options.videoScaleFilter}[vscaled]`);
      videoFilter = '[vscaled]';
    }
    if (options.subtitleVirtualFileName) {
      const safeSub = options.subtitleVirtualFileName.replace(/'/g, "'\\''").replace(/:/g, '\\:');
      filterParts.push(`${videoFilter}ass='${safeSub}'[outv]`);
    } else {
      filterParts.push(`${videoFilter}null[outv]`);
    }
    filterParts.push(`[a0]anull[outa]`);
  } else {
    const concatFilter = `${concatInputs.join('')}concat=n=${segments.length}:v=1:a=1[vconcat][outa]`;
    filterParts.push(concatFilter);

    let postConcatVideo = '[vconcat]';
    if (options.videoScaleFilter) {
      filterParts.push(`${postConcatVideo}${options.videoScaleFilter}[vscaled]`);
      postConcatVideo = '[vscaled]';
    }
    if (options.subtitleVirtualFileName) {
      const safeSub = options.subtitleVirtualFileName.replace(/'/g, "'\\''").replace(/:/g, '\\:');
      filterParts.push(`${postConcatVideo}ass='${safeSub}'[outv]`);
    } else {
      finalVideoMap = postConcatVideo;
    }
  }

  return {
    filterComplex: filterParts.join(';\n'),
    videoMap: finalVideoMap,
    audioMap: finalAudioMap,
    segmentCount: segments.length,
  };
}

/**
 * Builds an FFmpeg filter_complex command that trims the kept segments
 * and seamlessly concatenates them into one continuous stream with reset PTS.
 */
export function buildTrimConcatFilter(keepRanges: readonly TimeRange[]): {
  filterComplex: string;
  outputMap: string[];
} {
  if (keepRanges.length === 0) {
    throw new Error('No video segments to export (entire video skipped).');
  }

  // If there's only 1 segment, just trim it directly
  if (keepRanges.length === 1) {
    const { start, end } = keepRanges[0]!;
    const filter = `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v];[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a]`;
    return { filterComplex: filter, outputMap: ['-map', '[v]', '-map', '[a]'] };
  }

  let filterComplex = '';
  const segmentLabels: string[] = [];

  keepRanges.forEach((range, idx) => {
    const vTag = `v${idx}`;
    const aTag = `a${idx}`;
    filterComplex += `[0:v]trim=start=${range.start}:end=${range.end},setpts=PTS-STARTPTS[${vTag}];`;
    filterComplex += `[0:a]atrim=start=${range.start}:end=${range.end},asetpts=PTS-STARTPTS[${aTag}];`;
    segmentLabels.push(`[${vTag}][${aTag}]`);
  });

  // Concat all segments into a single audio/video stream
  filterComplex += `${segmentLabels.join('')}concat=n=${keepRanges.length}:v=1:a=1[outv][outa]`;

  return {
    filterComplex,
    outputMap: ['-map', '[outv]', '-map', '[outa]'],
  };
}
