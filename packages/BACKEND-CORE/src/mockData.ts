import {
  MediaAsset,
  WordToken,
  TimelineClip,
  MarkerFlag,
  ToolSettings,
} from './types';

export const INITIAL_MEDIA_ASSETS: MediaAsset[] = [];
export const LIBRARY_MEDIA_ASSETS: MediaAsset[] = [];
export const INITIAL_WORD_TOKENS: WordToken[] = [];
export const INITIAL_TOKENS_BY_MEDIA: Record<string, WordToken[]> = {};
export const INITIAL_TIMELINE_CLIPS: TimelineClip[] = [];
export const INITIAL_MARKERS: MarkerFlag[] = [];

export function generateDefaultTokensForAsset(
  _assetId: string,
  _nameOrDuration?: string | number,
  _durationSec?: number
): WordToken[] {
  return [];
}

/**
 * Movavi Page 7 Tool Drawer Settings Defaults
 */
export const INITIAL_TOOL_SETTINGS: ToolSettings = {
  chromaKey: {
    color: 'green',
    tolerance: 60,
    noise: 16,
    edges: 10,
    opacity: 85,
    enabled: false,
  },
  colorAdjustments: {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    highlights: 0,
    gamma: 0,
    shadows: 0,
    whitebalance: false,
  },
  animation: {
    selectedPreset: 'none',
    enabled: false,
  },
  equalizer: {
    preset: 'Vocal Purifier Active',
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    vocalPurifierEnabled: false,
  },
  overlay: {
    mode: 'none',
    enabled: false,
  },
  highlightConceal: {
    mode: 'none',
    opacity: 100,
    feathering: 35,
    outline: false,
    enabled: false,
  },
  activeFilter: 'none',
  rotationAngle: 0,
  playbackSpeed: 1.0,
};
