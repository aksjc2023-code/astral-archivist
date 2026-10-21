/**
 * Core Domain Contracts & Math Interfaces for ScarletCut
 * Strictly typed with noUncheckedIndexedAccess compatibility
 */

export interface WordToken {
  id: string;
  text: string;
  start: number;       // Source timestamp in seconds
  end: number;         // Source timestamp in seconds
  deleted: boolean;     // Soft-deletion flag for ripple cuts
  isFiller?: boolean;   // Lexical filler: "um", "uh", "like", "you know"
  isPause?: boolean;    // Synthetic silence pause >0.5s
  isEdited?: boolean;   // Softablitz A2: AI audio overdub flag
  replacementText?: string;
  replacementAudioUrl?: string;
  brollKeyword?: string;
}

export interface PlaybackSegment {
  id: string;
  sourceStart: number;  // Interval [a_k, b_k] in raw source media
  sourceEnd: number;
  virtualStart: number; // Interval [v_k^start, v_k^end] in rippled virtual timeline
  virtualEnd: number;
  duration: number;     // b_k - a_k
}

export interface MediaAsset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  duration: number;     // in seconds
  thumbnailUrl: string;
  isUsedOnTimeline: boolean;
  resolution?: string;
  category?: string;
  fileSizeMb?: number;
}

export interface TimelineClip {
  id: string;
  trackId: string;
  title: string;
  sourceStart: number;
  duration: number;
  color: string;
  mediaId?: string;
  isSelected?: boolean;
  hasWaveform?: boolean;
  transitionIn?: string;
  transitionOut?: string;
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
