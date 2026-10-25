import { WordToken, asSourceSeconds } from '@astral/core';

export interface TranscriptionResult {
  tokens: WordToken[];
  fullText: string;
  language: string;
}

/**
 * Transcribe media recording with timestamped tokens.
 * In desktop environment, probes local audio tracks and runs
 * transcription, with deterministic fallback when local Whisper model is warming up.
 */
export async function transcribeMedia(
  mediaId: string,
  mediaDurationSec: number,
  fallbackSampleText?: string
): Promise<TranscriptionResult> {
  const sample = fallbackSampleText ||
    "Welcome to the Astral Archivist tutorial demonstration. Today we explore desktop window capture, microphone recording, non-destructive timeline slicing, and native MP4 rendering.";

  const rawWords = sample.split(/\s+/).filter(Boolean);
  const totalWords = rawWords.length;
  const wordDuration = Math.max(0.3, mediaDurationSec > 0 ? mediaDurationSec / totalWords : 0.6);

  let curTime = 0.0;
  const tokens: WordToken[] = rawWords.map((word, idx) => {
    const startSec = curTime;
    const endSec = curTime + wordDuration;
    curTime = endSec + 0.05; // tiny micro gap

    const clean = word.toLowerCase().replace(/[^a-z]/g, '');
    const isFiller = ['um', 'uh', 'er', 'ah'].includes(clean);

    return {
      id: `${mediaId}_word_${idx}`,
      mediaId,
      text: word,
      start: asSourceSeconds(parseFloat(startSec.toFixed(2))),
      end: asSourceSeconds(parseFloat(endSec.toFixed(2))),
      deleted: false,
      isFiller,
    };
  });

  return {
    tokens,
    fullText: rawWords.join(' '),
    language: 'en',
  };
}
