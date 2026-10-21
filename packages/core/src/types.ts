/**
 * Core Domain Contracts & Math Interfaces for ScarletCut
 * Strictly typed with noUncheckedIndexedAccess compatibility
 * Environment-neutral: zero DOM / React dependencies
 */

declare const __brand: unique symbol;

/** Branded / Semantic time units in seconds */
export type Seconds = number;
export type TimelineSeconds = number & { readonly [__brand]: 'TimelineSeconds' };
export type SourceSeconds = number & { readonly [__brand]: 'SourceSeconds' };
export type VirtualSeconds = number & { readonly [__brand]: 'VirtualSeconds' };

/** Type-safe constructors at domain input boundaries */
export const asTimelineSeconds = (s: number): TimelineSeconds => s as TimelineSeconds;
export const asSourceSeconds = (s: number): SourceSeconds => s as SourceSeconds;
export const asVirtualSeconds = (s: number): VirtualSeconds => s as VirtualSeconds;
export const asSeconds = (s: number): Seconds => s;

export interface WordToken {
  id: string;
  text: string;
  start: SourceSeconds;       // Source timestamp in seconds
  end: SourceSeconds;         // Source timestamp in seconds
  deleted: boolean;           // Soft-deletion flag for ripple cuts
  isFiller?: boolean;         // Lexical filler: "um", "uh", "like", "you know"
  isPause?: boolean;          // Synthetic silence pause >0.5s
  isEdited?: boolean;         // Softablitz A2: AI audio overdub flag
  replacementText?: string;
  replacementAudioUrl?: string;
  brollKeyword?: string;
}

export interface PlaybackSegment {
  id: string;
  sourceStart: SourceSeconds;  // Interval [a_k, b_k] in raw source media
  sourceEnd: SourceSeconds;
  virtualStart: VirtualSeconds; // Interval [v_k^start, v_k^end] in rippled virtual timeline
  virtualEnd: VirtualSeconds;
  duration: Seconds;          // b_k - a_k
}

export interface MediaAsset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  duration: Seconds;          // in seconds
  thumbnailUrl: string;
  locator?: string;           // Environment-neutral media locator (file:// path, asset:// URI, or URL)
  videoUrl?: string;          // Direct stream URL for browser preview
  isUsedOnTimeline: boolean;
  resolution?: string;
  category?: string;
  fileSizeMb?: number;
}

export interface TimelineClip {
  id: string;
  trackId: string;
  title: string;
  timelineStart: TimelineSeconds;   // Placement on the composition timeline (in seconds)
  timelineDuration: Seconds;        // Duration on the composition timeline (in seconds)
  sourceIn: SourceSeconds;          // In-point inside the source media (in seconds)
  sourceOut: SourceSeconds;         // Out-point inside the source media (in seconds; sourceOut - sourceIn = timelineDuration)
  color: string;
  mediaId?: string;
  locator?: string;                 // Media locator abstraction for Phase 2
  videoUrl?: string;                // Direct stream URL for browser preview
  isSelected?: boolean;
  hasWaveform?: boolean;
  transitionIn?: string;
  transitionOut?: string;

  /** @deprecated Compatibility alias for timelineStart */
  sourceStart?: TimelineSeconds;
  /** @deprecated Compatibility alias for timelineDuration */
  duration?: Seconds;
}

/**
 * Domain boundary validation functions
 */
export function validateWordToken(token: WordToken): void {
  if (!Number.isFinite(token.start) || token.start < 0) {
    throw new Error(`Invalid token start: ${token.start}`);
  }
  if (!Number.isFinite(token.end) || token.end < token.start) {
    throw new Error(`Invalid token end: ${token.end} (must be >= start: ${token.start})`);
  }
}

export function validateTimelineClip(clip: TimelineClip): void {
  const start = clip.timelineStart ?? clip.sourceStart ?? asTimelineSeconds(0);
  const dur = clip.timelineDuration ?? clip.duration ?? asSeconds(0);
  if (!Number.isFinite(start) || start < 0) {
    throw new Error(`Invalid clip timelineStart: ${start}`);
  }
  if (!Number.isFinite(dur) || dur <= 0) {
    throw new Error(`Invalid clip timelineDuration: ${dur}`);
  }
  if (clip.sourceIn !== undefined && (!Number.isFinite(clip.sourceIn) || clip.sourceIn < 0)) {
    throw new Error(`Invalid clip sourceIn: ${clip.sourceIn}`);
  }
  if (clip.sourceOut !== undefined) {
    if (!Number.isFinite(clip.sourceOut) || clip.sourceOut < (clip.sourceIn ?? asSourceSeconds(0))) {
      throw new Error(`Invalid clip sourceOut: ${clip.sourceOut}`);
    }
    // Verify source range matches composition duration for a 1x clip
    if (clip.sourceIn !== undefined) {
      const sourceDur = clip.sourceOut - clip.sourceIn;
      if (Math.abs(sourceDur - dur) > 0.05) {
        throw new Error(
          `Clip source range [${clip.sourceIn}, ${clip.sourceOut}] duration (${sourceDur.toFixed(2)}s) does not match composition duration (${dur.toFixed(2)}s)`
        );
      }
    }
  }
}

export function validatePlaybackSegment(segment: PlaybackSegment): void {
  if (!Number.isFinite(segment.sourceStart) || segment.sourceStart < 0) {
    throw new Error(`Invalid segment sourceStart: ${segment.sourceStart}`);
  }
  if (!Number.isFinite(segment.sourceEnd) || segment.sourceEnd < segment.sourceStart) {
    throw new Error(`Invalid segment sourceEnd: ${segment.sourceEnd}`);
  }
  if (!Number.isFinite(segment.virtualStart) || segment.virtualStart < 0) {
    throw new Error(`Invalid segment virtualStart: ${segment.virtualStart}`);
  }
  if (!Number.isFinite(segment.virtualEnd) || segment.virtualEnd < segment.virtualStart) {
    throw new Error(`Invalid segment virtualEnd: ${segment.virtualEnd}`);
  }
}

export interface MarkerFlag {
  id: string;
  time: number;         // in seconds
  color: string;        // e.g. '#2ED573', '#FFD32A', '#168BFF', '#FF4757'
  label: string;
}

export type FailureMode = 'none' | 'seek-lock' | 'heap-guard' | 'webgpu-loss';

export interface TelemetryState {
  searchLatencyMs: number;
  rippleRebuildMs: number;
  memfsHeapMb: number;
  memfsMaxMb: number;
  timeSavedSec: number;
  activeFailureMode: FailureMode;
  recoveryLog: string;
}

export type ActivityDockTab = 'media' | 'filters' | 'transitions' | 'titles' | 'stickers' | 'tools';

export type SubNavSection = 
  | 'import' 
  | 'my-files' 
  | 'folder-landscape' 
  | 'folder-nature' 
  | 'transcript' 
  | 'sample-video' 
  | 'sample-audio' 
  | 'sample-music' 
  | 'backgrounds' 
  | 'stock-photos';

export type ToolDrawerTab = 
  | 'chroma' 
  | 'color' 
  | 'animation' 
  | 'equalizer' 
  | 'overlay' 
  | 'highlight';

export interface ToolSettings {
  chromaKey: {
    color: 'green' | 'blue';
    tolerance: number;
    noise: number;
    edges: number;
    opacity: number;
    enabled?: boolean;
  };
  colorAdjustments: {
    brightness: number;
    contrast: number;
    saturation: number;
    highlights: number;
    gamma: number;
    shadows: number;
    whitebalance: boolean;
  };
  animation: {
    selectedPreset: string;
  };
  equalizer: {
    preset: string;
    bands: number[]; // 10 bands from 31Hz to 16kHz
    vocalPurifierEnabled: boolean; // 85Hz HPF + noise gate
  };
  overlay: {
    mode: 'pip' | 'logo' | 'triplet' | 'side-left' | 'side-right' | 'top-bottom';
  };
  highlightConceal: {
    mode: 'highlight' | 'conceal';
    opacity: number;
    feathering: number;
    outline: boolean;
  };
  activeFilter?: string;      // E.g. 'Retro Film', 'Cyberpunk Neon', etc.
  rotationAngle?: number;     // 0, 90, 180, 270
  playbackSpeed?: number;     // 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0
}

export interface ExportSettings {
  title: string;
  description: string;
  resolution: '720p' | '1080p' | '4k';
  category: string;
  privacy: 'Public' | 'Unlisted' | 'Private';
  tags: string;
  outputPath: string;
  wasmMode: 'stream-copy' | 'filter-complex-ass';
}
