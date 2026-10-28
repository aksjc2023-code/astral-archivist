/**
 * Real-Time Web Audio API Audio Ducking Engine
 * Smooth, pop-free volume attenuation scheduling with zero UI-thread blocking.
 * Argon ADR-001 / ADR-003 Audio Subsystem Specification
 */

import { AudioDuckingConfig, TimeRange } from './types';

export class AudioDuckingEngine {
  private audioCtx: AudioContext | null = null;
  private sourceNode: AudioNode | null = null;
  private gainNode: GainNode | null = null;
  private destinationNode: AudioNode | null = null;
  private config: AudioDuckingConfig;
  private currentVolume: number = 0.75;

  constructor(config?: Partial<AudioDuckingConfig>) {
    this.config = {
      id: config?.id || 'ducking_engine_default',
      baseVolume: config?.baseVolume ?? 0.75,
      duckedVolume: config?.duckedVolume ?? 0.15,
      rampDownTime: config?.rampDownTime ?? 0.2,
      rampUpTime: config?.rampUpTime ?? 0.4,
      duckOnSpeech: config?.duckOnSpeech ?? true,
      duckKeywords: config?.duckKeywords ?? [],
      duckSpans: config?.duckSpans ?? [],
    };
    this.currentVolume = this.config.baseVolume;
  }

  /**
   * Initializes Web Audio Context and GainNode if not already initialized
   */
  public init(context?: AudioContext): { audioContext: AudioContext; gainNode: GainNode } {
    if (!this.audioCtx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = context || new AudioCtxClass();
    }

    if (!this.gainNode) {
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.setValueAtTime(this.config.baseVolume, this.audioCtx.currentTime);
      this.currentVolume = this.config.baseVolume;
    }

    return { audioContext: this.audioCtx, gainNode: this.gainNode };
  }

  /**
   * Attaches an HTMLMediaElement (audio or video) to the Web Audio ducking graph
   */
  public attachMediaElement(element: HTMLMediaElement): GainNode {
    const { audioContext, gainNode } = this.init();

    // Ensure we don't recreate createMediaElementSource twice on same element
    if (!(element as any).__duckingSourceNode) {
      try {
        const source = audioContext.createMediaElementSource(element);
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        (element as any).__duckingSourceNode = source;
      } catch (err) {
        console.warn('[AudioDuckingEngine] createMediaElementSource failed or already connected:', err);
      }
    }

    return gainNode;
  }

  /**
   * Updates configuration dynamically
   */
  public updateConfig(config: Partial<AudioDuckingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Evaluates whether audio should be ducked at `currentTimeSec`.
   * Checks explicit duck spans, designated keyword spans, and active speech intervals.
   */
  public isDuckedAtTime(
    currentTimeSec: number,
    speechRanges: readonly TimeRange[] = []
  ): boolean {
    // 1. Check explicit duck spans
    if (this.config.duckSpans && this.config.duckSpans.length > 0) {
      for (const span of this.config.duckSpans) {
        if (currentTimeSec >= span.start && currentTimeSec <= span.end) {
          return true;
        }
      }
    }

    // 2. Check active speech intervals if duckOnSpeech is enabled
    if (this.config.duckOnSpeech && speechRanges.length > 0) {
      for (const range of speechRanges) {
        // Add 50ms pre-roll and 150ms release tail
        if (currentTimeSec >= range.start - 0.05 && currentTimeSec <= range.end + 0.15) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Schedules smooth pop-free linear volume transition using cancelScheduledValues
   * and linearRampToValueAtTime for the given playhead timestamp.
   */
  public evaluateDucking(
    currentTimeSec: number,
    speechRanges: readonly TimeRange[] = []
  ): number {
    const shouldDuck = this.isDuckedAtTime(currentTimeSec, speechRanges);
    const targetVol = shouldDuck ? this.config.duckedVolume : this.config.baseVolume;
    const rampTime = shouldDuck ? this.config.rampDownTime : this.config.rampUpTime;

    if (this.gainNode && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      if (Math.abs(this.currentVolume - targetVol) > 0.01) {
        try {
          this.gainNode.gain.cancelScheduledValues(now);
          this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
          this.gainNode.gain.linearRampToValueAtTime(targetVol, now + Math.max(0.05, rampTime));
          this.currentVolume = targetVol;
        } catch {
          this.gainNode.gain.value = targetVol;
          this.currentVolume = targetVol;
        }
      }
    } else {
      this.currentVolume = targetVol;
    }

    return this.currentVolume;
  }

  /**
   * Generates FFmpeg volume filter expression for timeline export:
   * e.g. volume='if(between(t,1.2,3.5)+between(t,5.0,8.2), 0.15, 0.75)':eval=frame
   */
  public generateFfmpegVolumeExpression(
    speechRanges: readonly TimeRange[] = [],
    totalDuration: number = 30
  ): string {
    const intervals: TimeRange[] = [];

    // Collect all duck spans
    if (this.config.duckSpans) {
      for (const span of this.config.duckSpans) {
        intervals.push({ start: span.start, end: span.end });
      }
    }

    if (this.config.duckOnSpeech) {
      for (const range of speechRanges) {
        intervals.push({ start: Math.max(0, range.start - 0.05), end: Math.min(totalDuration, range.end + 0.15) });
      }
    }

    if (intervals.length === 0) {
      return `volume=${this.config.baseVolume}`;
    }

    // Sort and merge intervals
    intervals.sort((a, b) => a.start - b.start);
    const merged: TimeRange[] = [];
    let current = { ...intervals[0]! };

    for (let i = 1; i < intervals.length; i++) {
      const next = intervals[i]!;
      if (next.start <= current.end + 0.1) {
        current.end = Math.max(current.end, next.end);
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    merged.push(current);

    const conditions = merged
      .map(iv => `between(t,${iv.start.toFixed(2)},${iv.end.toFixed(2)})`)
      .join('+');

    return `volume='if(${conditions}, ${this.config.duckedVolume}, ${this.config.baseVolume})':eval=frame`;
  }

  public destroy(): void {
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {}
      this.gainNode = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
  }
}
