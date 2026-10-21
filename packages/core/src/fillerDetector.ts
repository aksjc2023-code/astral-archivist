import { WordToken } from './types';

export const LEXICAL_FILLER_REGEX = /^(um+|uh+|er+|ah+|like|you know|basically|actually|literally)$/i;
export const MIN_PAUSE_DURATION_SEC = 0.50; // Threshold for synthetic silence pause tokens

/**
 * Identifies and flags lexical filler words in a token array.
 */
export function tagLexicalFillers(tokens: WordToken[]): WordToken[] {
  return tokens.map(token => {
    const cleanWord = token.text.trim().toLowerCase().replace(/[.,!?;:]/g, '');
    const isFiller = LEXICAL_FILLER_REGEX.test(cleanWord);
    return {
      ...token,
      isFiller: isFiller || token.isFiller,
    };
  });
}

/**
 * Scans an array of transcribed words and injects synthetic pause tokens
 * wherever the inter-word silence gap is >= 0.50 seconds.
 */
export function injectSyntheticPauseTokens(tokens: WordToken[]): WordToken[] {
  const result: WordToken[] = [];
  let pauseCounter = 1;

  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i];
    if (!current) continue;

    // Check gap before this token
    if (i > 0) {
      const prev = tokens[i - 1];
      if (prev) {
        const gap = current.start - prev.end;
        if (gap >= MIN_PAUSE_DURATION_SEC) {
          result.push({
            id: `pause_${pauseCounter++}`,
            text: `[${gap.toFixed(2)}s pause]`,
            start: prev.end,
            end: current.start,
            deleted: false,
            isPause: true,
          });
        }
      }
    }

    result.push(current);
  }

  return result;
}

/**
 * 1-Click Purge: Soft-deletes all detected lexical filler words and pauses >0.5s.
 */
export function purgeFillersAndPauses(tokens: WordToken[]): {
  updatedTokens: WordToken[];
  purgedCount: number;
  purgedDurationSec: number;
} {
  let purgedCount = 0;
  let purgedDurationSec = 0;

  const updatedTokens = tokens.map(t => {
    if ((t.isFiller || t.isPause) && !t.deleted) {
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
