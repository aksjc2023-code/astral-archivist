/**
 * Effects & Overlays Catalog Definition
 *
 * Provides static catalog data, category presets, and metadata
 * for filters, transitions, titles, and stickers in Scarlet NLE.
 */

export type EffectType = 'filters' | 'transitions' | 'titles' | 'stickers';

export interface EffectItem {
  name: string;
  color: string;
  sub: string;
  category: string;
}

export interface EffectCategoryConfig {
  title: string;
  count: string;
  categories: string[];
  items: EffectItem[];
}

export const DEFAULT_FAVORITES = new Set<string>([
  'Retro Film',
  'Cross Dissolve',
  'Minimal Modern',
]);

export const EFFECTS_CONFIG: Record<EffectType, EffectCategoryConfig> = {
  filters: {
    title: 'Filters',
    count: '172 filters',
    categories: ['All', 'Favorites', 'Featured', 'Cinematic', 'Retro', 'Glitch', 'Blur'],
    items: [
      { name: 'Retro Film', color: '#B53471', sub: 'Warm 35mm grain', category: 'Retro' },
      { name: 'Cyberpunk Neon', color: '#168BFF', sub: 'High contrast cyan', category: 'Glitch' },
      { name: 'Golden Sunset', color: '#FFA502', sub: 'Amber highlights', category: 'Cinematic' },
      { name: 'Moody B&W', color: '#747D8C', sub: 'Silver haloid', category: 'Cinematic' },
      { name: 'VHS Distortion', color: '#8854D0', sub: 'Magnetic tape tracking', category: 'Retro' },
      { name: 'Teal & Orange', color: '#00D2D3', sub: 'Blockbuster grade', category: 'Cinematic' },
      { name: 'Soft Bloom', color: '#A29BFE', sub: 'Dreamy haze', category: 'Blur' },
      { name: 'Featured Punch', color: '#FF6B81', sub: 'Curated highlight grade', category: 'Featured' },
      { name: 'RGB Split', color: '#FF4757', sub: 'Chromatic aberration', category: 'Glitch' },
      { name: 'Noir Fade', color: '#2F3542', sub: 'Lifted blacks', category: 'Cinematic' },
      { name: 'Polaroid Warm', color: '#E17055', sub: 'Instant film look', category: 'Retro' },
      { name: 'Motion Blur Soft', color: '#70A1FF', sub: 'Directional smear', category: 'Blur' },
    ],
  },
  transitions: {
    title: 'Transitions',
    count: '113 transitions',
    categories: ['All', 'Favorites', 'Featured', 'Wipe', 'Zoom', 'Geometric', 'Ripple'],
    items: [
      { name: 'Cross Dissolve', color: '#3867D6', sub: 'Smooth overlap', category: 'Featured' },
      { name: 'Whip Pan Right', color: '#2ED573', sub: 'Fast kinetic leap', category: 'Wipe' },
      { name: 'Glitch Flash', color: '#FF4757', sub: 'RGB offset frame', category: 'Featured' },
      { name: 'Zoom Spin In', color: '#8854D0', sub: 'Dynamic barrel roll', category: 'Zoom' },
      { name: 'Iris Circle', color: '#FFA502', sub: 'Classic film closure', category: 'Geometric' },
      { name: 'Split Slide', color: '#168BFF', sub: 'Horizontal parting', category: 'Wipe' },
      { name: 'Ripple Push', color: '#00CEC9', sub: 'Wave distortion', category: 'Ripple' },
      { name: 'Hard Cut Flash', color: '#FD79A8', sub: 'White flash cut', category: 'Featured' },
      { name: 'Cube Spin', color: '#6C5CE7', sub: '3D geometric flip', category: 'Geometric' },
      { name: 'Zoom Blur Out', color: '#0984E3', sub: 'Radial smear exit', category: 'Zoom' },
    ],
  },
  titles: {
    title: 'Titles & Captions',
    count: '132 titles',
    categories: ['All', 'Favorites', 'Minimal', 'Cinematic', 'Social Media', 'Subtitles'],
    items: [
      { name: 'Minimal Modern', color: '#8854D0', sub: 'Clean sans-serif lower', category: 'Minimal' },
      { name: 'Typewriter Pop', color: '#168BFF', sub: 'Character by character', category: 'Minimal' },
      { name: 'Karaoke Glow', color: '#2ED573', sub: 'Word sync highlight', category: 'Subtitles' },
      { name: 'Cinematic Trailer', color: '#FFA502', sub: 'Tracked serif intro', category: 'Cinematic' },
      { name: 'Social Subscribe', color: '#FF4757', sub: 'Animated pill callout', category: 'Social Media' },
      { name: 'Vlog Chapter Marker', color: '#00D2D3', sub: 'Timecode stamp badge', category: 'Social Media' },
      { name: 'Lower Third News', color: '#74B9FF', sub: 'Broadcast caption bar', category: 'Subtitles' },
      { name: 'Epic Serif Open', color: '#FDCB6E', sub: 'Trailer title card', category: 'Cinematic' },
    ],
  },
  stickers: {
    title: 'Stickers & Overlays',
    count: '120 stickers',
    categories: ['All', 'Favorites', 'Emojis', 'Arrows', 'Shapes', 'Social'],
    items: [
      { name: 'Pointing Arrow', color: '#FF4757', sub: 'Red accent locator', category: 'Arrows' },
      { name: 'Like Button Pulse', color: '#168BFF', sub: 'Thumbs up motion', category: 'Social' },
      { name: 'Sparkle Burst', color: '#FFA502', sub: 'Gold starlight flash', category: 'Emojis' },
      { name: 'Heart React', color: '#EB3B5A', sub: 'Animated heartbeat', category: 'Emojis' },
      { name: 'Fire Flame', color: '#FF7F50', sub: 'Burning intensity', category: 'Emojis' },
      { name: 'Checkmark Circle', color: '#2ED573', sub: 'Green verified badge', category: 'Shapes' },
      { name: 'Subscribe Bell', color: '#FFD32A', sub: 'Notification callout', category: 'Social' },
      { name: 'Circle Outline', color: '#70A1FF', sub: 'Highlight ring', category: 'Shapes' },
      { name: 'Curved Arrow', color: '#A29BFE', sub: 'Soft callout path', category: 'Arrows' },
    ],
  },
};

/**
 * Returns a human-friendly icon character for drag ghost representations
 */
export const getEffectTypeIcon = (type: EffectType): string => {
  switch (type) {
    case 'filters':
      return '⚡';
    case 'transitions':
      return '⧉';
    case 'titles':
      return '🔤';
    case 'stickers':
      return '★';
    default:
      return '✦';
  }
};
