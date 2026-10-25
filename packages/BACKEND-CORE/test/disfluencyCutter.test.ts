import test from 'node:test';
import assert from 'node:assert/strict';
import {
  predictDisfluentIndices,
  detectDisfluenciesHeuristic,
  getMergedCutRanges,
  WordToken,
  asSourceSeconds,
} from '../src/index';

function createMockTokens(): WordToken[] {
  return [
    { id: '1', text: 'So', start: asSourceSeconds(0.0), end: asSourceSeconds(0.3), deleted: false, mediaId: 'm1' },
    { id: '2', text: 'um', start: asSourceSeconds(0.32), end: asSourceSeconds(0.6), deleted: false, mediaId: 'm1' },
    { id: '3', text: 'we', start: asSourceSeconds(0.65), end: asSourceSeconds(0.85), deleted: false, mediaId: 'm1' },
    { id: '4', text: 'we', start: asSourceSeconds(0.87), end: asSourceSeconds(1.05), deleted: false, mediaId: 'm1' },
    { id: '5', text: 'should', start: asSourceSeconds(1.2), end: asSourceSeconds(1.5), deleted: false, mediaId: 'm1' },
    { id: '6', text: 'go', start: asSourceSeconds(1.52), end: asSourceSeconds(1.8), deleted: false, mediaId: 'm1' },
  ];
}

test('1. predictDisfluentIndices returns empty array for empty tokens', async () => {
  const indices = await predictDisfluentIndices([]);
  assert.deepEqual(indices, []);
});

test('2. predictDisfluentIndices sends correctly formatted prompt and parses clean JSON response', async () => {
  const originalFetch = globalThis.fetch;
  try {
    let capturedBody: any = null;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ response: '[1, 2]' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const tokens = createMockTokens();
    const result = await predictDisfluentIndices(tokens);

    assert.deepEqual(result, [1, 2]);
    assert.ok(capturedBody.prompt.includes('[0]So [1]um [2]we [3]we [4]should [5]go'));
    assert.equal(capturedBody.model, 'qwen2.5:3b');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('3. predictDisfluentIndices extracts JSON array from markdown-fenced or conversational LLM output', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (): Promise<Response> => {
      return new Response(
        JSON.stringify({
          response: 'Here are the disfluency indices:\n```json\n[1, 3, 99]\n```\nHope this helps!',
        }),
        { status: 200 },
      );
    };

    const tokens = createMockTokens();
    const result = await predictDisfluentIndices(tokens);

    // 99 is out of bounds (tokens.length is 6), so it should be filtered out
    assert.deepEqual(result, [1, 3]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('4. predictDisfluentIndices throws on HTTP error response when fallbackToHeuristic is false', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (): Promise<Response> => {
      return new Response('Not Found', { status: 404, statusText: 'Not Found' });
    };

    const tokens = createMockTokens();
    await assert.rejects(
      async () => {
        await predictDisfluentIndices(tokens, { fallbackToHeuristic: false });
      },
      /Disfluency LLM request failed: 404 Not Found/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('5. predictDisfluentIndices gracefully falls back to local heuristic on network failure (Fix for "Failed to fetch")', async () => {
  const originalFetch = globalThis.fetch;
  try {
    // Simulate browser "Failed to fetch" (TypeError thrown when port is closed or offline)
    globalThis.fetch = async (): Promise<Response> => {
      throw new TypeError('Failed to fetch');
    };

    const tokens = createMockTokens();
    // tokens has: [0]So [1]um [2]we [3]we [4]should [5]go
    // Heuristic flags: index 1 ("um" - vocal filler) and index 2 ("we" - stutter repetition)
    const result = await predictDisfluentIndices(tokens, { fallbackToHeuristic: true });

    assert.ok(result.includes(1), 'Flagged vocalized filler "um"');
    assert.ok(result.includes(2), 'Flagged first word of stutter "we we"');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('6. detectDisfluenciesHeuristic detects stutters, cut-offs, fillers, and false starts', () => {
  const tokens: WordToken[] = [
    { id: '1', text: 'Well', start: asSourceSeconds(0.0), end: asSourceSeconds(0.3), deleted: false, mediaId: 'm1' },
    { id: '2', text: 'I', start: asSourceSeconds(0.35), end: asSourceSeconds(0.5), deleted: false, mediaId: 'm1' },
    { id: '3', text: 'uh', start: asSourceSeconds(0.52), end: asSourceSeconds(0.8), deleted: false, mediaId: 'm1' },
    { id: '4', text: 'I', start: asSourceSeconds(0.82), end: asSourceSeconds(1.0), deleted: false, mediaId: 'm1' },
    { id: '5', text: 'th-', start: asSourceSeconds(1.05), end: asSourceSeconds(1.2), deleted: false, mediaId: 'm1' },
    { id: '6', text: 'think', start: asSourceSeconds(1.22), end: asSourceSeconds(1.5), deleted: false, mediaId: 'm1' },
    { id: '7', text: 'you', start: asSourceSeconds(1.55), end: asSourceSeconds(1.7), deleted: false, mediaId: 'm1' },
    { id: '8', text: 'know', start: asSourceSeconds(1.72), end: asSourceSeconds(1.9), deleted: false, mediaId: 'm1' },
    { id: '9', text: 'ship', start: asSourceSeconds(2.0), end: asSourceSeconds(2.3), deleted: false, mediaId: 'm1' },
  ];

  const flagged = detectDisfluenciesHeuristic(tokens);
  // Expected to detect:
  // [1] I (false start before 'uh I')
  // [2] uh (vocal filler)
  // [4] th- (cutoff dash)
  // [6, 7] you know (multi-word filler)
  assert.ok(flagged.includes(1), 'Detects false start "I"');
  assert.ok(flagged.includes(2), 'Detects vocal filler "uh"');
  assert.ok(flagged.includes(4), 'Detects cutoff "th-"');
  assert.ok(flagged.includes(6), 'Detects "you" in "you know"');
  assert.ok(flagged.includes(7), 'Detects "know" in "you know"');
});

test('7. getMergedCutRanges merges adjacent cuts within tolerance and splits across gaps', () => {
  const tokens = createMockTokens();
  // Cut tokens index 1 ("um", 0.32 - 0.6) and index 2 ("we", 0.65 - 0.85). Gap is 0.05s (50ms).
  // With tolerance 0.06s (60ms), they merge.
  const mergedWithTolerance = getMergedCutRanges(tokens, [1, 2], 0.06);
  assert.equal(mergedWithTolerance.length, 1);
  assert.equal(mergedWithTolerance[0]?.start, asSourceSeconds(0.32));
  assert.equal(mergedWithTolerance[0]?.end, asSourceSeconds(0.85));

  // With tight tolerance 0.01s (10ms), they stay separate.
  const splitWithTightTolerance = getMergedCutRanges(tokens, [1, 2], 0.01);
  assert.equal(splitWithTightTolerance.length, 2);
  assert.equal(splitWithTightTolerance[0]?.start, asSourceSeconds(0.32));
  assert.equal(splitWithTightTolerance[0]?.end, asSourceSeconds(0.6));
  assert.equal(splitWithTightTolerance[1]?.start, asSourceSeconds(0.65));
  assert.equal(splitWithTightTolerance[1]?.end, asSourceSeconds(0.85));
});

test('8. getMergedCutRanges handles empty indices and out-of-bounds indices gracefully', () => {
  const tokens = createMockTokens();
  assert.deepEqual(getMergedCutRanges(tokens, []), []);
  assert.deepEqual(getMergedCutRanges(tokens, [99, 100]), []);
});
