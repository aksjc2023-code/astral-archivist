import { WordToken, asSourceSeconds } from './types';

// Hard lexical fillers (hesitation sounds) that carry zero semantic value
export const HARD_FILLERS_REGEX = /^(um+|uh+|er+|ah+|eh+|hmm+|mm+|urgh+|huh+)$/i;

// Discourse markers / soft fillers that can be speech habits or genuine words
export const DISCOURSE_MARKERS_REGEX = /^(like|basically|actually|literally|honestly|seriously)$/i;

// Multi-word filler phrases: matched across sequential tokens
export const MULTI_WORD_FILLER_PHRASES: readonly (readonly string[])[] = [
  ['you', 'know'],
  ['i', 'mean'],
  ['sort', 'of'],
  ['kind', 'of'],
] as const;

export const MIN_PAUSE_DURATION_SEC = 0.50; // Threshold for synthetic silence pause tokens
export const PAUSE_EDGE_PADDING_SEC = 0.12; // 120ms breathing room preserved on word boundaries

/**
 * Strips all standard, smart, and extended punctuation from word tokens.
 */
export function cleanPunctuation(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:…—–"'“”‘’`\(\)\[\]\{\}\/\\-]/g, '');
}

/**
 * Identifies and flags lexical filler words in a token array.
 * Detects both single-token fillers (um, uh) and multi-token phrases ("you know").
 */
export function tagLexicalFillers(tokens: WordToken[]): WordToken[] {
  const result: WordToken[] = tokens.map(token => {
    const cleanWord = cleanPunctuation(token.text);
    const isHardFiller = HARD_FILLERS_REGEX.test(cleanWord);
    const isDiscourse = DISCOURSE_MARKERS_REGEX.test(cleanWord);

    return {
      ...token,
      isFiller: isHardFiller || token.isFiller,
      isDiscourseMarker: isDiscourse || token.isDiscourseMarker,
    };
  });

  // Scan for multi-word filler phrases across consecutive tokens (e.g. "you" + "know")
  for (let i = 0; i < result.length - 1; i++) {
    const t1 = result[i];
    const t2 = result[i + 1];
    if (!t1 || !t2) continue;

    // Must belong to the exact same media asset
    if (t1.mediaId !== t2.mediaId) continue;

    // Tokens must be adjacent without massive intervening pause (<= 0.35s)
    if (t2.start - t1.end > 0.35) continue;

    const w1 = cleanPunctuation(t1.text);
    const w2 = cleanPunctuation(t2.text);

    for (const phrase of MULTI_WORD_FILLER_PHRASES) {
      if (phrase[0] === w1 && phrase[1] === w2) {
        t1.isDiscourseMarker = true;
        t2.isDiscourseMarker = true;
        break;
      }
    }
  }

  return result;
}

/**
 * Scans an array of transcribed words and injects synthetic pause tokens
 * wherever the inter-word silence gap is >= 0.50 seconds.
 *
 * Preserves 120ms natural acoustic edge padding so speech doesn't sound clipped
 * when silence is ripple-cut.
 */
export function injectSyntheticPauseTokens(
  tokens: WordToken[],
  minPauseDurationSec = MIN_PAUSE_DURATION_SEC,
  edgePaddingSec = PAUSE_EDGE_PADDING_SEC
): WordToken[] {
  const result: WordToken[] = [];
  let pauseCounter = 1;

  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i];
    if (!current) continue;

    // Check gap before this token
    if (i > 0) {
      const prev = tokens[i - 1];
      // Strictly enforce identical mediaId scope (no cross-asset pause injection)
      if (prev && prev.mediaId === current.mediaId) {
        const rawGap = current.start - prev.end;
        if (rawGap >= minPauseDurationSec) {
          // Acoustic breathing room: keep edgePaddingSec after prev and before current
          const paddedStart = prev.end + edgePaddingSec;
          const paddedEnd = current.start - edgePaddingSec;
          const cuttableDuration = paddedEnd - paddedStart;

          if (cuttableDuration >= 0.15) {
            result.push({
              id: `pause_${current.mediaId ? `${current.mediaId}_` : ''}${pauseCounter++}`,
              text: `[${cuttableDuration.toFixed(2)}s pause]`,
              start: asSourceSeconds(Number(paddedStart.toFixed(3))),
              end: asSourceSeconds(Number(paddedEnd.toFixed(3))),
              deleted: false,
              isPause: true,
              mediaId: current.mediaId,
            });
          }
        }
      }
    }

    result.push(current);
  }

  return result;
}

/**
 * Pipeline processor: tags lexical fillers (including multi-word phrases)
 * and injects acoustic-padded pause tokens.
 */
export function processTranscribedTokens(tokens: WordToken[]): WordToken[] {
  return injectSyntheticPauseTokens(tagLexicalFillers(tokens));
}

export interface PurgeOptions {
  includeHardFillers?: boolean;      // "um", "uh", "you know" (Default: true)
  includePauses?: boolean;           // Silences >0.5s (Default: true)
  includeDiscourseMarkers?: boolean; // "like", "actually", "basically" (Default: false to avoid deleting legitimate words)
}

/**
 * 1-Click Purge: Soft-deletes all detected lexical filler words and pauses.
 * By default, only deletes hard fillers and pauses, leaving discourse markers intact.
 */
export function purgeFillersAndPauses(
  tokens: WordToken[],
  options: PurgeOptions = {}
): {
  updatedTokens: WordToken[];
  purgedCount: number;
  purgedDurationSec: number;
} {
  const {
    includeHardFillers = true,
    includePauses = true,
    includeDiscourseMarkers = false,
  } = options;

  let purgedCount = 0;
  let purgedDurationSec = 0;

  const updatedTokens = tokens.map(t => {
    if (t.deleted) return t;

    const shouldPurge =
      (includeHardFillers && t.isFiller) ||
      (includePauses && t.isPause) ||
      (includeDiscourseMarkers && t.isDiscourseMarker);

    if (shouldPurge) {
      purgedCount++;
      purgedDurationSec += (t.end - t.start);
      return { ...t, deleted: true };
    }
    return t;
  });

  return {
    updatedTokens,
    purgedCount,
    purgedDurationSec: Number(purgedDurationSec.toFixed(2)),
  };
}

/**
 * Restores all deleted tokens back to active state.
 */
export function restoreAllTokens(tokens: WordToken[]): WordToken[] {
  return tokens.map(t => ({ ...t, deleted: false }));
}
