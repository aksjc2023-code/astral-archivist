/**
 * DualDecoderLookaheadPool: 2-Slot A-Roll + 2-Slot B-Roll Video Element Pool
 * Performs 500ms lookahead pre-seeking so cut boundaries & B-Roll overlays swap instantly in 0ms with zero stutter.
 */

export interface VideoSlot {
  video: HTMLVideoElement;
  currentSrc: string;
  isReady: boolean;
  preseekTime: number | null;
}

export class DualDecoderLookaheadPool {
  private aRollSlots: [VideoSlot, VideoSlot];
  private bRollSlots: [VideoSlot, VideoSlot];
  private activeARollIdx: 0 | 1 = 0;
  private activeBRollIdx: 0 | 1 = 0;

  constructor() {
    this.aRollSlots = [this.createSlot('a_roll_0'), this.createSlot('a_roll_1')];
    this.bRollSlots = [this.createSlot('b_roll_0'), this.createSlot('b_roll_1')];
  }

  private createSlot(id: string): VideoSlot {
    const video = document.createElement('video');
    video.id = `decoder_pool_${id}`;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.style.display = 'none';
    video.style.position = 'fixed';
    video.style.pointerEvents = 'none';
    video.style.opacity = '0';
    video.crossOrigin = 'anonymous';
    document.body.appendChild(video);

    return {
      video,
      currentSrc: '',
      isReady: false,
      preseekTime: null,
    };
  }

  public getActiveARollVideo(): HTMLVideoElement {
    return this.aRollSlots[this.activeARollIdx].video;
  }

  public getInactiveARollVideo(): HTMLVideoElement {
    return this.aRollSlots[this.activeARollIdx === 0 ? 1 : 0].video;
  }

  public getActiveBRollVideo(): HTMLVideoElement {
    return this.bRollSlots[this.activeBRollIdx].video;
  }

  public getInactiveBRollVideo(): HTMLVideoElement {
    return this.bRollSlots[this.activeBRollIdx === 0 ? 1 : 0].video;
  }

  /**
   * Sets source URL for the active A-Roll slot
   */
  public setARollSource(url: string): void {
    const active = this.aRollSlots[this.activeARollIdx];
    if (active.currentSrc !== url) {
      active.currentSrc = url;
      active.video.src = url;
      active.video.load();
    }
  }

  /**
   * Sets source URL for the active B-Roll slot
   */
  public setBRollSource(url: string): void {
    const active = this.bRollSlots[this.activeBRollIdx];
    if (active.currentSrc !== url) {
      active.currentSrc = url;
      active.video.src = url;
      active.video.load();
    }
  }

  /**
   * 500ms Lookahead Pre-Seek:
   * Instructs the inactive video element to prime its hardware decoder at `targetTimestamp`
   */
  public preseekNextARoll(targetSrc: string, targetTimestamp: number): void {
    const inactive = this.aRollSlots[this.activeARollIdx === 0 ? 1 : 0];
    if (inactive.currentSrc !== targetSrc) {
      inactive.currentSrc = targetSrc;
      inactive.video.src = targetSrc;
      inactive.video.load();
    }
    if (inactive.preseekTime === null || Math.abs(inactive.preseekTime - targetTimestamp) > 0.05) {
      inactive.preseekTime = targetTimestamp;
      inactive.video.currentTime = targetTimestamp;
    }
  }

  public preseekNextBRoll(targetSrc: string, targetTimestamp: number): void {
    const inactive = this.bRollSlots[this.activeBRollIdx === 0 ? 1 : 0];
    if (inactive.currentSrc !== targetSrc) {
      inactive.currentSrc = targetSrc;
      inactive.video.src = targetSrc;
      inactive.video.load();
    }
    if (inactive.preseekTime === null || Math.abs(inactive.preseekTime - targetTimestamp) > 0.05) {
      inactive.preseekTime = targetTimestamp;
      inactive.video.currentTime = targetTimestamp;
    }
  }

  /**
   * Instant 0ms Swap at Cut or Transition Boundary
   */
  public swapARoll(): HTMLVideoElement {
    const nextIdx = this.activeARollIdx === 0 ? 1 : 0;
    const currentActive = this.aRollSlots[this.activeARollIdx].video;
    const newActive = this.aRollSlots[nextIdx].video;

    // Start playback on new active if current was playing
    if (!currentActive.paused) {
      newActive.play().catch(() => {});
      currentActive.pause();
    }

    this.activeARollIdx = nextIdx;
    return newActive;
  }

  public swapBRoll(): HTMLVideoElement {
    const nextIdx = this.activeBRollIdx === 0 ? 1 : 0;
    const currentActive = this.bRollSlots[this.activeBRollIdx].video;
    const newActive = this.bRollSlots[nextIdx].video;

    if (!currentActive.paused) {
      newActive.play().catch(() => {});
      currentActive.pause();
    }

    this.activeBRollIdx = nextIdx;
    return newActive;
  }

  public destroy(): void {
    for (const slot of [...this.aRollSlots, ...this.bRollSlots]) {
      try {
        slot.video.pause();
        slot.video.src = '';
        if (slot.video.parentNode) {
          slot.video.parentNode.removeChild(slot.video);
        }
      } catch {}
    }
  }
}
