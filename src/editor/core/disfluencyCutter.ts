/**
 * LLM-Powered Speech Disfluency Cutter for ScarletCut
 *
 * Formats transcript WordTokens into an indexed prompt, invokes a local LLM
 * (e.g. Ollama at localhost:11434) to detect fumbles / fillers / stutters,
 * and returns the token indices flagged for ripple-deletion.
 *
 * Self-contained: zero server-side or cloud dependencies beyond a local
 * inference endpoint.
 */

import { WordToken, SourceSeconds } from './types';
import {
  HARD_FILLERS_REGEX,
  DISCOURSE_MARKERS_REGEX,
  MULTI_WORD_FILLER_PHRASES,
  cleanPunctuation,
} from './fillerDetector';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default local Ollama API endpoint */
export const DEFAULT_LLM_ENDPOINT = 'http://localhost:11434/api/generate';

/** Vite proxy endpoint when running in browser */
export const BROWSER_PROXY_ENDPOINT = '/api/ollama/api/generate';

/** Default model to request from Ollama */
export const DEFAULT_LLM_MODEL = 'qwen2.5:3b';

// ---------------------------------------------------------------------------
// System prompt (single-shot, zero-commentary JSON output)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert audio-video editor specializing in non-linear speech disfluency cleanup.

TASK:
Analyze the indexed transcript and identify words that represent speech fumbles, vocalized hesitations, false starts, or accidental word repetitions so they can be ripple-deleted from the timeline.

INPUT FORMAT:
A sequence of space-separated tokens where each word is prefixed by its zero-based integer index in brackets:
[<index>]<word>

DETECTION TARGETS:
1. Vocalized Pauses: Non-lexical fillers ("um", "uh", "er", "ah", "hmm").
2. Immediate Repetitions / Stutters: Accidental back-to-back repetitions (e.g., "[1]we [2]we" -> flag 1, keep 2).
3. Cut-offs: Words ending abruptly in dashes or incomplete syllables.
4. Abandoned False Starts: Sentence starts that the speaker aborts and restarts.
5. Conversational Fillers: Extraneous crutches ("like", "you know") used purely as verbal padding, NOT when used as verbs or comparisons.

CONSTRAINTS:
- Keep all words necessary for grammatical validity and intended meaning.
- Output MUST be strictly a valid, raw JSON array of integers containing ONLY the indices of the words to delete. No explanation, markdown fences, or extra text.

EXAMPLE INPUT:
[0]Well [1]I [2]uh [3]I [4]think [5]we [6]should [7]like [8]ship [9]it.

EXAMPLE OUTPUT:
[1, 2, 7]`;

// ---------------------------------------------------------------------------
// Public Interfaces
// ---------------------------------------------------------------------------

export interface DisfluencyCutterOptions {
  /** Full URL of the LLM generate endpoint (default: Ollama localhost or browser proxy) */
  endpoint?: string;
  /** Model identifier to request (default: qwen2.5:3b) */
  model?: string;
  /** Sampling temperature – keep low for deterministic JSON (default: 0.1) */
  temperature?: number;
  /** AbortSignal for user-initiated cancellation */
  signal?: AbortSignal;
  /** Maximum ms to wait for LLM response before falling back to local heuristic (default: 2000ms) */
  timeoutMs?: number;
  /** Whether to fall back to the built-in deterministic disfluency detector when offline / fetch fails (default: true) */
  fallbackToHeuristic?: boolean;
}

export interface CutRange {
  start: SourceSeconds;
  end: SourceSeconds;
}

// ---------------------------------------------------------------------------
// Local Heuristic Disfluency Analyzer (Browser-native fallback)
// ---------------------------------------------------------------------------

/**
 * Deterministic, high-precision speech disfluency detector that identifies:
 * 1. Vocalized pauses ("um", "uh", "er", "ah", "hmm", "mhm")
 * 2. Cut-offs and syllable stems ("th-", "w-", words ending in dash)
 * 3. Immediate repetitions & stutters ("we we" -> flag 1st, keep 2nd)
 * 4. Stutters across hesitations ("I uh I" -> flag first "I" and "uh")
 * 5. Multi-word verbal filler phrases ("you know", "i mean", "sort of", "kind of")
 * 6. Conversational crutches ("like", "basically", "actually") used as verbal padding
 *
 * Runs instantaneously in-browser with zero network dependencies.
 */
export function detectDisfluenciesHeuristic(words: WordToken[]): number[] {
  if (!words || words.length === 0) return [];

  const flagged = new Set<number>();

  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const raw = w.text.trim();
    const clean = cleanPunctuation(raw).toLowerCase();

    // 1. Cut-offs and syllable stems (words ending with dash or hyphen)
    if (raw.endsWith('-') || raw.endsWith('—') || raw.endsWith('–') || raw.endsWith('..')) {
      flagged.add(i);
      continue;
    }

    // 2. Vocalized pauses (um, uh, er, ah, hmm, etc.)
    if (HARD_FILLERS_REGEX.test(clean) || clean === 'mhm' || clean === 'uhhuh' || clean === 'uh-huh') {
      flagged.add(i);
      continue;
    }

    // 3. Stutters & False Starts across a single vocalized filler (e.g. "[1]I [2]uh [3]I")
    if (i + 2 < words.length) {
      const midToken = words[i + 1]!;
      const midClean = cleanPunctuation(midToken.text).toLowerCase();
      const nextToken = words[i + 2]!;
      const nextClean = cleanPunctuation(nextToken.text).toLowerCase();

      if (
        clean &&
        clean === nextClean &&
        (HARD_FILLERS_REGEX.test(midClean) || midClean === 'like')
      ) {
        flagged.add(i);     // Flag first attempted word
        flagged.add(i + 1); // Flag intervening filler
        continue;
      }
    }

    // 4. Immediate back-to-back repetitions (e.g. "[0]we [1]we" -> flag 0, keep 1)
    if (i + 1 < words.length) {
      const nextToken = words[i + 1]!;
      const nextClean = cleanPunctuation(nextToken.text).toLowerCase();

      if (clean && clean === nextClean) {
        // Flag first instance and keep the second
        flagged.add(i);
        continue;
      }

      // Syllable stem repetition (e.g. "th" followed by "the" within 400ms)
      if (
        clean.length >= 1 &&
        clean.length <= 3 &&
        nextClean.startsWith(clean) &&
        nextClean.length > clean.length &&
        nextToken.start - w.end <= 0.4
      ) {
        flagged.add(i);
        continue;
      }
    }

    // 5. Two-word repeated phrase (e.g. "we have we have" -> flag first pair)
    if (i + 3 < words.length) {
      const w0 = clean;
      const w1 = cleanPunctuation(words[i + 1]!.text).toLowerCase();
      const w2 = cleanPunctuation(words[i + 2]!.text).toLowerCase();
      const w3 = cleanPunctuation(words[i + 3]!.text).toLowerCase();
      if (w0 && w1 && w0 === w2 && w1 === w3) {
        flagged.add(i);
        flagged.add(i + 1);
        continue;
      }
    }

    // 6. Multi-word filler phrases ("you know", "i mean", "sort of", "kind of")
    if (i + 1 < words.length) {
      const nextClean = cleanPunctuation(words[i + 1]!.text).toLowerCase();
      let isMultiWord = false;
      for (const phrase of MULTI_WORD_FILLER_PHRASES) {
        if (phrase[0] === clean && phrase[1] === nextClean) {
          flagged.add(i);
          flagged.add(i + 1);
          isMultiWord = true;
          break;
        }
      }
      if (isMultiWord) continue;
    }

    // 7. Conversational crutches used as verbal padding ("like", "basically", "actually")
    if (clean === 'like') {
      // Flag "like" when used as filler (preceded or followed by filler/stutter, or at utterance start)
      const prevFlagged = i > 0 && flagged.has(i - 1);
      const nextIsFiller =
        i + 1 < words.length &&
        HARD_FILLERS_REGEX.test(cleanPunctuation(words[i + 1]!.text).toLowerCase());
      const isIntroductoryLike = i === 0 || (i > 0 && w.start - words[i - 1]!.end >= 0.5);

      if (prevFlagged || nextIsFiller || isIntroductoryLike) {
        flagged.add(i);
      }
    } else if (DISCOURSE_MARKERS_REGEX.test(clean)) {
      // "basically", "actually", "literally", "honestly" when isolated or padding
      if (
        i === 0 ||
        (i > 0 && flagged.has(i - 1)) ||
        (i + 1 < words.length && flagged.has(i + 1))
      ) {
        flagged.add(i);
      }
    }
  }

  return [...flagged].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Core: predict disfluent indices via local LLM with automatic fallback
// ---------------------------------------------------------------------------

/**
 * Sends the indexed transcript to the local LLM runner and extracts token
 * indices that should be ripple-deleted.
 *
 * If the local LLM endpoint is unreachable, offline, or blocked by CORS,
 * it seamlessly and gracefully falls back to `detectDisfluenciesHeuristic`
 * so speech cleanup always succeeds without breaking the user experience.
 *
 * @param words  - The WordToken array from the current transcript.
 * @param opts   - Optional overrides for endpoint, model, timeout, fallback.
 * @returns        A sorted, deduplicated array of zero-based token indices.
 */
export async function predictDisfluentIndices(
  words: WordToken[],
  opts: DisfluencyCutterOptions = {},
): Promise<number[]> {
  if (!words || words.length === 0) return [];

  const {
    model = DEFAULT_LLM_MODEL,
    temperature = 0.1,
    signal,
    timeoutMs = 2000,
    fallbackToHeuristic = true,
  } = opts;

  // Determine endpoint: prefer explicit option -> browser proxy -> direct localhost
  const endpoint =
    opts.endpoint ??
    (typeof window !== 'undefined' ? BROWSER_PROXY_ENDPOINT : DEFAULT_LLM_ENDPOINT);

  try {
    // Build the indexed text: "[0]So [1]we [2]um [3]need..."
    const indexedText = words
      .map((w, idx) => `[${idx}]${w.text.trim()}`)
      .join(' ');

    const prompt = `${SYSTEM_PROMPT}\n\nINPUT TRANSCRIPT:\n${indexedText}\n\nOUTPUT:`;

    // Setup timeout controller so browser never hangs on an inactive local port
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature,
          },
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(
        `Disfluency LLM request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    const rawText: string = (data.response ?? '').trim();

    // Guard: extract a JSON integer array even if the model wrapped it in
    // markdown fences, backticks, or surrounding prose.
    const jsonMatch = rawText.match(/\[\s*(?:\d+\s*,\s*)*\d*\s*\]/);
    if (!jsonMatch) {
      console.warn(
        '[disfluencyCutter] Could not parse JSON integer array from LLM output:',
        rawText,
      );
      if (fallbackToHeuristic) {
        return detectDisfluenciesHeuristic(words);
      }
      return [];
    }

    const indices: number[] = JSON.parse(jsonMatch[0]);

    // Sanity filter: only keep valid in-range integer indices
    const valid = indices.filter(
      (i) => Number.isInteger(i) && i >= 0 && i < words.length,
    );

    // Deduplicate and sort ascending
    return [...new Set(valid)].sort((a, b) => a - b);
  } catch (err: unknown) {
    if (fallbackToHeuristic) {
      console.info(
        `[disfluencyCutter] Local LLM unreachable (${err instanceof Error ? err.message : String(err)}). Using built-in speech disfluency analyzer.`,
      );
      return detectDisfluenciesHeuristic(words);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Utility: merge adjacent cut ranges with tolerance to prevent micro-stutters
// ---------------------------------------------------------------------------

/**
 * Converts flagged token indices into merged time ranges suitable for
 * ripple-deletion on the timeline.
 *
 * Adjacent or near-adjacent words (within `toleranceSec`) are combined into
 * a single contiguous cut block so the demuxer doesn't choke on tiny gaps.
 *
 * @param words         - Full token array.
 * @param cutIndices    - Indices of tokens to remove.
 * @param toleranceSec  - Max gap between tokens to still merge (default 30ms).
 * @returns               Merged, sorted CutRange list.
 */
export function getMergedCutRanges(
  words: WordToken[],
  cutIndices: number[],
  toleranceSec = 0.03,
): CutRange[] {
  if (cutIndices.length === 0) return [];

  // Deduplicate & sort chronologically by source start time
  const sortedIndices = [...new Set(cutIndices)].sort(
    (a, b) => (words[a]?.start ?? 0) - (words[b]?.start ?? 0),
  );

  const first = words[sortedIndices[0]!];
  if (!first) return [];

  const rawRanges: CutRange[] = sortedIndices
    .map((idx) => {
      const w = words[idx];
      return w ? { start: w.start, end: w.end } : null;
    })
    .filter((r): r is CutRange => r !== null);

  if (rawRanges.length === 0) return [];

  const merged: CutRange[] = [{ ...rawRanges[0]! }];

  for (let i = 1; i < rawRanges.length; i++) {
    const prev = merged[merged.length - 1]!;
    const curr = rawRanges[i]!;

    // Merge if the next word starts within tolerance of the previous end
    if (curr.start <= prev.end + toleranceSec) {
      prev.end = Math.max(prev.end, curr.end) as SourceSeconds;
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}
