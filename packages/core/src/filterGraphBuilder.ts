/**
 * Pure TypeScript FFmpeg filter_complex & ASS Subtitle Script Builder
 * Zero-DOM dependency (compatible with lib: ["ES2022"])
 */

import { PlaybackSegment, WordToken } from './types';

export interface AssScriptOptions {
  title?: string;
  fontSize?: number;
  fontName?: string;
  primaryColorHex?: string;  // e.g. '&H00FFFFFF' (AABBGGRR in ASS)
  outlineColorHex?: string;  // e.g. '&H00000000'
  shadowColorHex?: string;   // e.g. '&H80000000'
  playResX?: number;
  playResY?: number;
  wordsPerSentence?: number;
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
 */
export function generateAssSubtitleScript(
  tokens: WordToken[],
  options: AssScriptOptions = {}
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

  // Filter out deleted tokens, pause markers, and whitespace
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
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  if (activeTokens.length === 0) {
    return lines.join('\n');
  }

  // Chunk tokens into natural conversational phrase lines (by word count or pauses >0.4s)
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

  for (const chunk of dialogueChunks) {
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    if (!first || !last) continue;

    const startTime = formatAssTimestamp(first.start);
    const endTime = formatAssTimestamp(Math.max(last.end, first.start + 0.3));
    const sentenceText = chunk.map(t => t.text).join(' ');

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

export interface FilterComplexOptions {
  subtitleVirtualFileName?: string;
  videoScaleFilter?: string; // e.g. "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2"
}

/**
 * Generates frame-accurate single-pass FFmpeg filter_complex for ripple playback segments.
 *
 * Automatically stitches [trim] + [setpts] and [atrim] + [asetpts] into a consolidated
 * [concat=n=k:v=1:a=1] graph.
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

    // Video trim & PTS reset
    filterParts.push(`[0:v]trim=start=${sStart}:end=${sEnd},setpts=PTS-STARTPTS[v${i}]`);
    // Audio trim & PTS reset
    filterParts.push(`[0:a]atrim=start=${sStart}:end=${sEnd},asetpts=PTS-STARTPTS[a${i}]`);

    concatInputs.push(`[v${i}][a${i}]`);
  }

  let finalVideoMap = '[outv]';
  let finalAudioMap = '[outa]';

  if (segments.length === 1) {
    // Single segment: direct map or optional subtitle burn-in
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
    // Multi-segment concat
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
      finalVideoMap = '[vconcat]';
    }
  }

  return {
    filterComplex: filterParts.join(';\n'),
    videoMap: finalVideoMap,
    audioMap: finalAudioMap,
    segmentCount: segments.length,
  };
}
