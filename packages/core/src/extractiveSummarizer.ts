/**
 * Local TF-IDF Extractive Transcript Summarizer
 * Zero-DOM pure TypeScript implementation for @astral/core
 */

import { WordToken } from './types';
import { cleanPunctuation } from './fillerDetector';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'it',
  'this', 'that', 'we', 'you', 'they', 'i', 'so', 'as', 'from',
]);

/**
 * Groups active WordTokens into sentences and ranks the top K key sentences
 * using normalized TF-IDF term weights.
 */
export function summarizeTranscriptTokens(
  tokens: readonly WordToken[],
  maxSentences = 3
): string[] {
  const active = tokens.filter(t => !t.deleted && !t.isPause && !t.isFiller);
  if (active.length === 0) return [];

  const sentences: WordToken[][] = [];
  let current: WordToken[] = [];

  for (const tok of active) {
    current.push(tok);
    if (/[.!?]$/.test(tok.text.trim()) || current.length >= 14) {
      sentences.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    sentences.push(current);
  }

  if (sentences.length <= maxSentences) {
    return sentences.map(s => s.map(t => t.replacementText ?? t.text).join(' '));
  }

  const docFreq = new Map<string, number>();
  const sentenceTerms: string[][] = sentences.map(sent => {
    const terms = sent
      .map(t => cleanPunctuation(t.replacementText ?? t.text))
      .filter(w => w.length > 1 && !STOP_WORDS.has(w));
    const unique = new Set(terms);
    unique.forEach(term => docFreq.set(term, (docFreq.get(term) ?? 0) + 1));
    return terms;
  });

  const numSentences = sentences.length;
  const scored = sentences.map((sent, idx) => {
    const terms = sentenceTerms[idx] ?? [];
    if (terms.length === 0) {
      return { idx, score: 0, text: sent.map(t => t.replacementText ?? t.text).join(' ') };
    }

    let score = 0;
    for (const term of terms) {
      const df = docFreq.get(term) ?? 1;
      const idf = Math.log(1 + numSentences / df);
      score += idf;
    }
    return {
      idx,
      score: score / Math.sqrt(terms.length),
      text: sent.map(t => t.replacementText ?? t.text).join(' '),
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.idx - b.idx)
    .map(s => s.text);
}

/**
 * Returns the Set of WordToken IDs corresponding to the top-scoring sentences.
 * Tokens NOT in this Set can be cleanly ripple-cut to produce an instant summarized highlight reel.
 */
export function getSummarizedKeyTokenIds(
  tokens: readonly WordToken[],
  keepRatio = 0.5
): Set<string> {
  const active = tokens.filter(t => !t.deleted && !t.isPause && !t.isFiller);
  if (active.length === 0) return new Set();

  const sentences: WordToken[][] = [];
  let current: WordToken[] = [];

  for (const tok of active) {
    current.push(tok);
    if (/[.!?]$/.test(tok.text.trim()) || current.length >= 14) {
      sentences.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    sentences.push(current);
  }

  const numKeep = Math.max(1, Math.round(sentences.length * keepRatio));
  if (sentences.length <= numKeep) {
    return new Set(active.map(t => t.id));
  }

  const docFreq = new Map<string, number>();
  const sentenceTerms: string[][] = sentences.map(sent => {
    const terms = sent
      .map(t => cleanPunctuation(t.replacementText ?? t.text))
      .filter(w => w.length > 1 && !STOP_WORDS.has(w));
    const unique = new Set(terms);
    unique.forEach(term => docFreq.set(term, (docFreq.get(term) ?? 0) + 1));
    return terms;
  });

  const numSentences = sentences.length;
  const scored = sentences.map((sent, idx) => {
    const terms = sentenceTerms[idx] ?? [];
    if (terms.length === 0) {
      return { idx, score: 0, sent };
    }
    let score = 0;
    for (const term of terms) {
      const df = docFreq.get(term) ?? 1;
      const idf = Math.log(1 + numSentences / df);
      score += idf;
    }
    return {
      idx,
      score: score / Math.sqrt(terms.length),
      sent,
    };
  });

  const topSentences = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, numKeep);

  const keyIds = new Set<string>();
  topSentences.forEach(s => {
    s.sent.forEach(tok => keyIds.add(tok.id));
  });
  return keyIds;
}
