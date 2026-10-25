import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { TimeRange, computeKeepRanges } from '../store/useTimelineStore';

/**
 * Builds an FFmpeg filter_complex command that trims the kept segments
 * and seamlessly concatenates them into one continuous stream.
 */
export function buildTrimConcatFilter(keepRanges: TimeRange[]): {
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

/**
 * Exports the final video by slicing out skipped parts and merging kept parts.
 */
export async function exportEditedVideo(
  ffmpeg: FFmpeg,
  sourceFile: File | Blob,
  totalDuration: number,
  skipRanges: TimeRange[],
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const keepRanges = computeKeepRanges(totalDuration, skipRanges);

  if (keepRanges.length === 0) {
    throw new Error('Cannot export: All segments have been deleted.');
  }

  const inputName = 'input_media.mp4';
  const outputName = 'exported_video.mp4';

  // Load input file into FFmpeg virtual filesystem
  await ffmpeg.writeFile(inputName, await fetchFile(sourceFile));

  // Build the concat graph
  const { filterComplex, outputMap } = buildTrimConcatFilter(keepRanges);

  // Setup progress callback if supported
  if (onProgress) {
    ffmpeg.on('progress', ({ progress }) => {
      onProgress(Math.min(100, Math.round(progress * 100)));
    });
  }

  // Execute FFmpeg
  await ffmpeg.exec([
    '-i', inputName,
    '-filter_complex', filterComplex,
    ...outputMap,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '22',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    outputName,
  ]);

  const outputData = await ffmpeg.readFile(outputName);
  const dataBytes = typeof outputData === 'string'
    ? new TextEncoder().encode(outputData)
    : outputData;
  const copyBuffer = new ArrayBuffer(dataBytes.byteLength);
  new Uint8Array(copyBuffer).set(dataBytes);
  return new Blob([copyBuffer], { type: 'video/mp4' });
}
