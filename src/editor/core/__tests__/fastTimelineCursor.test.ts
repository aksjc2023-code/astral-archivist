import { describe, it, expect } from 'vitest';
import { FastTimelineCursor } from '../fastTimelineCursor';

describe('FastTimelineCursor (O(1) & O(log N) Playhead Lookup)', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({
    id: `item_${i}`,
    start: i * 2,
    end: i * 2 + 1.8,
    text: `token_${i}`,
  }));

  it('handles empty collection gracefully', () => {
    const cursor = new FastTimelineCursor([]);
    expect(cursor.findAtTime(1.0)).toBeNull();
  });

  it('finds exact item at time boundary', () => {
    const cursor = new FastTimelineCursor(items);
    const match = cursor.findAtTime(10.5); // inside item_5 (10.0 to 11.8)
    expect(match).not.toBeNull();
    expect(match?.id).toBe('item_5');
  });

  it('returns null during dead gaps between items', () => {
    const cursor = new FastTimelineCursor(items);
    // Gap between item_0 (0 to 1.8) and item_1 (2.0 to 3.8) at 1.9s
    expect(cursor.findAtTime(1.9)).toBeNull();
  });

  it('accelerates sequential forward playback in O(1)', () => {
    const cursor = new FastTimelineCursor(items);
    // Play item 1
    cursor.findAtTime(2.5);
    // Advance into item 2
    const next = cursor.findAtTime(4.2);
    expect(next?.id).toBe('item_2');
  });

  it('handles random access seeking via binary search', () => {
    const cursor = new FastTimelineCursor(items);
    const jumped = cursor.findAtTime(180.5); // item_90 (180 to 181.8)
    expect(jumped?.id).toBe('item_90');

    // Leap back to beginning
    const start = cursor.findAtTime(0.5);
    expect(start?.id).toBe('item_0');
  });
});
