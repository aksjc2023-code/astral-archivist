/**
 * FastTimelineCursor: O(1) Linear Playback Cursor with O(log N) Binary Search Seek Fallback
 * Replaces expensive O(N) array.find() scans during 60fps playhead ticks across 5,000+ transcript tokens or EDL intervals.
 */

export interface TimestampedItem {
  id?: string;
  start: number;
  end: number;
  [key: string]: any;
}

export class FastTimelineCursor<T extends TimestampedItem> {
  private items: readonly T[] = [];
  private lastIndex: number = 0;

  constructor(items: readonly T[] = []) {
    this.setItems(items);
  }

  public setItems(items: readonly T[]): void {
    this.items = items;
    this.lastIndex = 0;
  }

  /**
   * Finds the item covering `timeSec` in:
   * - O(1) time during standard forward playback (checks lastIndex and lastIndex + 1)
   * - O(log N) binary search time during scrubbing / manual seeks
   */
  public findAtTime(timeSec: number): T | null {
    const len = this.items.length;
    if (len === 0) return null;

    // Fast-path 1: Current item matches (O(1))
    const current = this.items[this.lastIndex];
    if (current && timeSec >= current.start && timeSec <= current.end) {
      return current;
    }

    // Fast-path 2: Next immediate sequential item (O(1)) - typical linear playback tick
    const nextIdx = this.lastIndex + 1;
    if (nextIdx < len) {
      const next = this.items[nextIdx];
      if (next && timeSec >= next.start && timeSec <= next.end) {
        this.lastIndex = nextIdx;
        return next;
      }
    }

    // Fast-path 3: Previous item (scrubbing back slightly)
    const prevIdx = this.lastIndex - 1;
    if (prevIdx >= 0) {
      const prev = this.items[prevIdx];
      if (prev && timeSec >= prev.start && timeSec <= prev.end) {
        this.lastIndex = prevIdx;
        return prev;
      }
    }

    // Fallback: Binary search in O(log N) for manual seeks or cut leaps
    let low = 0;
    let high = len - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const midItem = this.items[mid];
      if (!midItem) break;

      if (timeSec < midItem.start) {
        high = mid - 1;
      } else if (timeSec > midItem.end) {
        low = mid + 1;
      } else {
        this.lastIndex = mid;
        return midItem;
      }
    }

    return null;
  }

  /**
   * Returns index of the item or -1
   */
  public findIndexAtTime(timeSec: number): number {
    const item = this.findAtTime(timeSec);
    return item ? this.lastIndex : -1;
  }

  public reset(): void {
    this.lastIndex = 0;
  }
}
