import {
  MediaAsset,
  WordToken,
  TimelineClip,
  MarkerFlag,
  ToolSettings,
  asSeconds,
  asSourceSeconds,
  asTimelineSeconds,
} from './types';

/**
 * 9 Media Assets from Page 1 & 2 of Movavi 2020 Redesign PDF
 */
const RAW_MEDIA_ASSETS: (Omit<MediaAsset, 'duration'> & { duration: number })[] = [
  {
    id: 'asset_1',
    name: 'Great Festival Colors.mov',
    type: 'video',
    duration: 10.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400&q=80',
    videoUrl: '/sample_festival.mp4',
    isUsedOnTimeline: true,
    resolution: '1920x1080',
    category: 'Landscape',
    fileSizeMb: 14.5,
  },
  {
    id: 'asset_2',
    name: 'Girls-team_Forever.mov',
    type: 'video',
    duration: 5.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400&q=80',
    videoUrl: '/sample_team.mp4',
    isUsedOnTimeline: false,
    resolution: '1920x1080',
    category: 'Landscape',
    fileSizeMb: 8.2,
  },
  {
    id: 'asset_3',
    name: "Alan's Feet XD.avi",
    type: 'video',
    duration: 12.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=400&q=80',
    videoUrl: '/sample_festival.mp4',
    isUsedOnTimeline: false,
    resolution: '1280x720',
    category: 'Nature',
    fileSizeMb: 11.0,
  },
  {
    id: 'asset_4',
    name: 'Cocktails.jpeg',
    type: 'image',
    duration: 5.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&q=80',
    isUsedOnTimeline: false,
    resolution: '3840x2160',
    category: 'Nature',
    fileSizeMb: 4.8,
  },
  {
    id: 'asset_5',
    name: 'My world today.mp4',
    type: 'video',
    duration: 15.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80',
    videoUrl: '/sample_festival.mp4',
    isUsedOnTimeline: true,
    resolution: '1920x1080',
    category: 'Landscape',
    fileSizeMb: 15.4,
  },
  {
    id: 'asset_6',
    name: "Green Lagune's concert.mp4",
    type: 'video',
    duration: 10.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80',
    videoUrl: '/sample_festival.mp4',
    isUsedOnTimeline: true,
    resolution: '1920x1080',
    category: 'Nature',
    fileSizeMb: 12.1,
  },
  {
    id: 'asset_7',
    name: 'Neon City.mp4',
    type: 'video',
    duration: 5.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=400&q=80',
    videoUrl: '/sample_team.mp4',
    isUsedOnTimeline: false,
    resolution: '1920x1080',
    category: 'Nature',
    fileSizeMb: 6.0,
  },
  {
    id: 'asset_8',
    name: 'Summer Vibes.mp4',
    type: 'video',
    duration: 12.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=400&q=80',
    videoUrl: '/sample_festival.mp4',
    isUsedOnTimeline: false,
    resolution: '1920x1080',
    category: 'Landscape',
    fileSizeMb: 14.5,
  },
  {
    id: 'asset_9',
    name: 'Beach Walk.mov',
    type: 'video',
    duration: 15.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&q=80',
    videoUrl: '/sample_team.mp4',
    isUsedOnTimeline: false,
    resolution: '1920x1080',
    category: 'Nature',
    fileSizeMb: 16.2,
  },
];

export const INITIAL_MEDIA_ASSETS: MediaAsset[] = RAW_MEDIA_ASSETS.map(a => ({
  ...a,
  duration: asSeconds(a.duration),
}));

/** Library stock packs keyed by SubNavSection category labels */
const RAW_LIBRARY_ASSETS: (Omit<MediaAsset, 'duration'> & { duration: number })[] = [
  {
    id: 'lib_vid_1',
    name: 'Stock City Timelapse.mp4',
    type: 'video',
    duration: 8.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1477959858617-67f85b6b5c6f?w=400&q=80',
    videoUrl: '/sample_festival.mp4',
    isUsedOnTimeline: false,
    resolution: '1920x1080',
    category: 'Sample video',
    fileSizeMb: 9.2,
  },
  {
    id: 'lib_vid_2',
    name: 'Ocean Drone Clip.mp4',
    type: 'video',
    duration: 12.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=400&q=80',
    videoUrl: '/sample_team.mp4',
    isUsedOnTimeline: false,
    resolution: '1920x1080',
    category: 'Sample video',
    fileSizeMb: 11.4,
  },
  {
    id: 'lib_aud_1',
    name: 'Voiceover Sample.mp3',
    type: 'audio',
    duration: 30.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80',
    videoUrl: '/sample_audio.wav',
    isUsedOnTimeline: false,
    category: 'Sample audio',
    fileSizeMb: 2.1,
  },
  {
    id: 'lib_mus_1',
    name: 'Upbeat Indie Loop.mp3',
    type: 'audio',
    duration: 45.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80',
    videoUrl: '/sample_audio.wav',
    isUsedOnTimeline: false,
    category: 'Sample music',
    fileSizeMb: 3.4,
  },
  {
    id: 'lib_mus_2',
    name: 'Cinematic Pad.mp3',
    type: 'audio',
    duration: 60.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&q=80',
    videoUrl: '/sample_audio.wav',
    isUsedOnTimeline: false,
    category: 'Sample music',
    fileSizeMb: 4.0,
  },
  {
    id: 'lib_bg_1',
    name: 'Gradient Mesh Background.png',
    type: 'image',
    duration: 5.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=400&q=80',
    isUsedOnTimeline: false,
    resolution: '3840x2160',
    category: 'Backgrounds',
    fileSizeMb: 1.8,
  },
  {
    id: 'lib_bg_2',
    name: 'Soft Bokeh Lights.png',
    type: 'image',
    duration: 5.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1493612276216-ee3925520721?w=400&q=80',
    isUsedOnTimeline: false,
    resolution: '3840x2160',
    category: 'Backgrounds',
    fileSizeMb: 2.2,
  },
  {
    id: 'lib_photo_1',
    name: 'Mountain Peak.jpg',
    type: 'image',
    duration: 5.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&q=80',
    isUsedOnTimeline: false,
    resolution: '4000x3000',
    category: 'Stock photos',
    fileSizeMb: 3.1,
  },
  {
    id: 'lib_photo_2',
    name: 'Urban Street.jpg',
    type: 'image',
    duration: 5.0,
    thumbnailUrl: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=400&q=80',
    isUsedOnTimeline: false,
    resolution: '4000x3000',
    category: 'Stock photos',
    fileSizeMb: 2.8,
  },
];

export const LIBRARY_MEDIA_ASSETS: MediaAsset[] = RAW_LIBRARY_ASSETS.map(a => ({
  ...a,
  duration: asSeconds(a.duration),
}));

/**
 * 42 Word Tokens Spanning the Summer Festival Story
 * Embedded with 5 fillers, 4 pauses, and B-roll keyword anchors
 */
const RAW_WORD_TOKENS: (Omit<WordToken, 'start' | 'end'> & { start: number; end: number })[] = [
  { id: 'w_1', text: 'Welcome', start: 0.00, end: 0.65, deleted: false },
  { id: 'w_2', text: 'back', start: 0.70, end: 1.05, deleted: false },
  { id: 'w_3', text: 'everyone.', start: 1.10, end: 1.80, deleted: false },
  { id: 'p_1', text: '[0.65s pause]', start: 1.80, end: 2.45, deleted: false, isPause: true },
  { id: 'w_4', text: 'Today', start: 2.45, end: 2.90, deleted: false },
  { id: 'w_5', text: 'we', start: 2.95, end: 3.15, deleted: false },
  { id: 'w_6', text: 'are', start: 3.20, end: 3.40, deleted: false },
  { id: 'w_7', text: 'exploring', start: 3.45, end: 4.10, deleted: false },
  { id: 'w_8', text: 'the', start: 4.15, end: 4.30, deleted: false },
  { id: 'w_9', text: 'summer', start: 4.35, end: 4.90, deleted: false },
  { id: 'w_10', text: 'festival', start: 4.95, end: 5.70, deleted: false, brollKeyword: 'festival' },
  { id: 'f_1', text: 'um', start: 5.75, end: 6.25, deleted: false, isFiller: true },
  { id: 'w_11', text: 'in', start: 6.30, end: 6.50, deleted: false },
  { id: 'w_12', text: 'the', start: 6.55, end: 6.70, deleted: false },
  { id: 'w_13', text: 'valley.', start: 6.75, end: 7.45, deleted: false },
  { id: 'p_2', text: '[0.80s pause]', start: 7.45, end: 8.25, deleted: false, isPause: true },
  { id: 'w_14', text: 'The', start: 8.25, end: 8.50, deleted: false },
  { id: 'w_15', text: 'lights', start: 8.55, end: 9.10, deleted: false },
  { id: 'w_16', text: 'were', start: 9.15, end: 9.40, deleted: false },
  { id: 'w_17', text: 'absolutely', start: 9.45, end: 10.20, deleted: false },
  { id: 'w_18', text: 'gorgeous', start: 10.25, end: 11.00, deleted: false },
  { id: 'f_2', text: 'like', start: 11.05, end: 11.45, deleted: false, isFiller: true },
  { id: 'w_19', text: 'golden', start: 11.50, end: 12.10, deleted: false },
  { id: 'w_20', text: 'stars', start: 12.15, end: 12.75, deleted: false },
  { id: 'w_21', text: 'everywhere.', start: 12.80, end: 13.70, deleted: false },
  { id: 'p_3', text: '[1.10s pause]', start: 13.70, end: 14.80, deleted: false, isPause: true },
  { id: 'w_22', text: 'Later', start: 14.80, end: 15.25, deleted: false },
  { id: 'w_23', text: 'that', start: 15.30, end: 15.55, deleted: false },
  { id: 'w_24', text: 'evening,', start: 15.60, end: 16.30, deleted: false },
  { id: 'f_3', text: 'uh', start: 16.35, end: 16.85, deleted: false, isFiller: true },
  { id: 'w_25', text: 'we', start: 16.90, end: 17.10, deleted: false },
  { id: 'w_26', text: 'walked', start: 17.15, end: 17.70, deleted: false },
  { id: 'w_27', text: 'down', start: 17.75, end: 18.05, deleted: false },
  { id: 'w_28', text: 'towards', start: 18.10, end: 18.60, deleted: false },
  { id: 'w_29', text: 'the', start: 18.65, end: 18.80, deleted: false },
  { id: 'w_30', text: 'sunset', start: 18.85, end: 19.60, deleted: false, brollKeyword: 'sunset' },
  { id: 'w_31', text: 'beach.', start: 19.65, end: 20.35, deleted: false },
  { id: 'f_4', text: 'you know', start: 20.40, end: 21.05, deleted: false, isFiller: true },
  { id: 'p_4', text: '[0.55s pause]', start: 21.05, end: 21.60, deleted: false, isPause: true },
  { id: 'w_32', text: 'The', start: 21.60, end: 21.85, deleted: false },
  { id: 'w_33', text: 'music', start: 21.90, end: 22.40, deleted: false },
  { id: 'w_34', text: 'started', start: 22.45, end: 23.00, deleted: false },
  { id: 'w_35', text: 'playing,', start: 23.05, end: 23.75, deleted: false },
  { id: 'w_36', text: 'and', start: 23.80, end: 24.00, deleted: false },
  { id: 'w_37', text: 'everyone', start: 24.05, end: 24.70, deleted: false },
  { id: 'w_38', text: 'began', start: 24.75, end: 25.20, deleted: false },
  { id: 'w_39', text: 'dancing.', start: 25.25, end: 26.00, deleted: false },
  { id: 'f_5', text: 'basically', start: 26.05, end: 26.65, deleted: false, isFiller: true },
  { id: 'w_40', text: 'It', start: 26.70, end: 26.90, deleted: false },
  { id: 'w_41', text: 'was', start: 26.95, end: 27.20, deleted: false },
  { id: 'w_42', text: 'unforgettable.', start: 27.25, end: 28.50, deleted: false },
];

export const INITIAL_WORD_TOKENS: WordToken[] = RAW_WORD_TOKENS.map(t => ({
  ...t,
  mediaId: 'asset_1',
  start: asSourceSeconds(t.start),
  end: asSourceSeconds(t.end),
}));

/**
 * Pre-populated Transcripts for all Default Demo Assets
 */
export const INITIAL_TOKENS_BY_MEDIA: Record<string, WordToken[]> = {
  asset_1: INITIAL_WORD_TOKENS,
  asset_2: [
    { id: 'w_201', mediaId: 'asset_2', text: 'Hey', start: asSourceSeconds(0.00), end: asSourceSeconds(0.40), deleted: false },
    { id: 'w_202', mediaId: 'asset_2', text: 'team,', start: asSourceSeconds(0.45), end: asSourceSeconds(0.85), deleted: false },
    { id: 'w_203', mediaId: 'asset_2', text: 'we', start: asSourceSeconds(0.90), end: asSourceSeconds(1.10), deleted: false },
    { id: 'w_204', mediaId: 'asset_2', text: 'finally', start: asSourceSeconds(1.15), end: asSourceSeconds(1.65), deleted: false },
    { id: 'f_201', mediaId: 'asset_2', text: 'um', start: asSourceSeconds(1.70), end: asSourceSeconds(2.10), deleted: false, isFiller: true },
    { id: 'w_205', mediaId: 'asset_2', text: 'reached', start: asSourceSeconds(2.15), end: asSourceSeconds(2.65), deleted: false },
    { id: 'w_206', mediaId: 'asset_2', text: 'the', start: asSourceSeconds(2.70), end: asSourceSeconds(2.85), deleted: false },
    { id: 'w_207', mediaId: 'asset_2', text: 'summit!', start: asSourceSeconds(2.90), end: asSourceSeconds(3.60), deleted: false },
    { id: 'p_201', mediaId: 'asset_2', text: '[0.45s pause]', start: asSourceSeconds(3.60), end: asSourceSeconds(4.05), deleted: false, isPause: true },
    { id: 'w_208', mediaId: 'asset_2', text: 'Incredible', start: asSourceSeconds(4.05), end: asSourceSeconds(4.60), deleted: false },
    { id: 'w_209', mediaId: 'asset_2', text: 'view.', start: asSourceSeconds(4.65), end: asSourceSeconds(5.00), deleted: false },
  ],
  asset_3: [
    { id: 'w_301', mediaId: 'asset_3', text: "What's", start: asSourceSeconds(0.00), end: asSourceSeconds(0.35), deleted: false },
    { id: 'w_302', mediaId: 'asset_3', text: 'up', start: asSourceSeconds(0.40), end: asSourceSeconds(0.60), deleted: false },
    { id: 'w_303', mediaId: 'asset_3', text: 'everyone,', start: asSourceSeconds(0.65), end: asSourceSeconds(1.25), deleted: false },
    { id: 'p_301', mediaId: 'asset_3', text: '[0.50s pause]', start: asSourceSeconds(1.25), end: asSourceSeconds(1.75), deleted: false, isPause: true },
    { id: 'w_304', mediaId: 'asset_3', text: 'check', start: asSourceSeconds(1.75), end: asSourceSeconds(2.10), deleted: false },
    { id: 'w_305', mediaId: 'asset_3', text: 'out', start: asSourceSeconds(2.15), end: asSourceSeconds(2.35), deleted: false },
    { id: 'w_306', mediaId: 'asset_3', text: 'this', start: asSourceSeconds(2.40), end: asSourceSeconds(2.60), deleted: false },
    { id: 'w_307', mediaId: 'asset_3', text: 'kickflip', start: asSourceSeconds(2.65), end: asSourceSeconds(3.25), deleted: false },
    { id: 'w_308', mediaId: 'asset_3', text: 'line', start: asSourceSeconds(3.30), end: asSourceSeconds(3.70), deleted: false },
    { id: 'f_301', mediaId: 'asset_3', text: 'you know', start: asSourceSeconds(3.75), end: asSourceSeconds(4.35), deleted: false, isFiller: true },
    { id: 'w_309', mediaId: 'asset_3', text: 'at', start: asSourceSeconds(4.40), end: asSourceSeconds(4.55), deleted: false },
    { id: 'w_310', mediaId: 'asset_3', text: 'the', start: asSourceSeconds(4.60), end: asSourceSeconds(4.75), deleted: false },
    { id: 'w_311', mediaId: 'asset_3', text: 'skatepark.', start: asSourceSeconds(4.80), end: asSourceSeconds(5.50), deleted: false },
    { id: 'p_302', mediaId: 'asset_3', text: '[0.60s pause]', start: asSourceSeconds(5.50), end: asSourceSeconds(6.10), deleted: false, isPause: true },
    { id: 'w_312', mediaId: 'asset_3', text: 'First', start: asSourceSeconds(6.10), end: asSourceSeconds(6.45), deleted: false },
    { id: 'w_313', mediaId: 'asset_3', text: 'try', start: asSourceSeconds(6.50), end: asSourceSeconds(6.85), deleted: false },
    { id: 'w_314', mediaId: 'asset_3', text: 'clean', start: asSourceSeconds(6.90), end: asSourceSeconds(7.30), deleted: false },
    { id: 'w_315', mediaId: 'asset_3', text: 'landing', start: asSourceSeconds(7.35), end: asSourceSeconds(7.95), deleted: false },
    { id: 'f_302', mediaId: 'asset_3', text: 'basically.', start: asSourceSeconds(8.00), end: asSourceSeconds(8.60), deleted: false, isFiller: true },
    { id: 'w_316', mediaId: 'asset_3', text: "Let's", start: asSourceSeconds(8.65), end: asSourceSeconds(9.00), deleted: false },
    { id: 'w_317', mediaId: 'asset_3', text: 'keep', start: asSourceSeconds(9.05), end: asSourceSeconds(9.35), deleted: false },
    { id: 'w_318', mediaId: 'asset_3', text: 'shredding.', start: asSourceSeconds(9.40), end: asSourceSeconds(10.20), deleted: false },
  ],
  asset_5: [
    { id: 'w_501', mediaId: 'asset_5', text: 'Good', start: asSourceSeconds(0.00), end: asSourceSeconds(0.35), deleted: false },
    { id: 'w_502', mediaId: 'asset_5', text: 'morning', start: asSourceSeconds(0.40), end: asSourceSeconds(0.85), deleted: false },
    { id: 'w_503', mediaId: 'asset_5', text: 'from', start: asSourceSeconds(0.90), end: asSourceSeconds(1.10), deleted: false },
    { id: 'w_504', mediaId: 'asset_5', text: 'the', start: asSourceSeconds(1.15), end: asSourceSeconds(1.30), deleted: false },
    { id: 'w_505', mediaId: 'asset_5', text: 'coastline.', start: asSourceSeconds(1.35), end: asSourceSeconds(2.10), deleted: false },
    { id: 'p_501', mediaId: 'asset_5', text: '[0.70s pause]', start: asSourceSeconds(2.10), end: asSourceSeconds(2.80), deleted: false, isPause: true },
    { id: 'w_506', mediaId: 'asset_5', text: 'The', start: asSourceSeconds(2.80), end: asSourceSeconds(3.00), deleted: false },
    { id: 'w_507', mediaId: 'asset_5', text: 'waves', start: asSourceSeconds(3.05), end: asSourceSeconds(3.65), deleted: false },
    { id: 'w_508', mediaId: 'asset_5', text: 'are', start: asSourceSeconds(3.70), end: asSourceSeconds(3.85), deleted: false },
    { id: 'w_509', mediaId: 'asset_5', text: 'crashing', start: asSourceSeconds(3.90), end: asSourceSeconds(4.55), deleted: false },
    { id: 'f_501', mediaId: 'asset_5', text: 'like', start: asSourceSeconds(4.60), end: asSourceSeconds(4.95), deleted: false, isFiller: true },
    { id: 'w_510', mediaId: 'asset_5', text: 'pure', start: asSourceSeconds(5.00), end: asSourceSeconds(5.35), deleted: false },
    { id: 'w_511', mediaId: 'asset_5', text: 'magic', start: asSourceSeconds(5.40), end: asSourceSeconds(5.90), deleted: false },
    { id: 'w_512', mediaId: 'asset_5', text: 'today.', start: asSourceSeconds(5.95), end: asSourceSeconds(6.50), deleted: false },
    { id: 'p_502', mediaId: 'asset_5', text: '[0.65s pause]', start: asSourceSeconds(6.50), end: asSourceSeconds(7.15), deleted: false, isPause: true },
    { id: 'w_513', mediaId: 'asset_5', text: 'Take', start: asSourceSeconds(7.15), end: asSourceSeconds(7.45), deleted: false },
    { id: 'w_514', mediaId: 'asset_5', text: 'a', start: asSourceSeconds(7.50), end: asSourceSeconds(7.60), deleted: false },
    { id: 'w_515', mediaId: 'asset_5', text: 'deep', start: asSourceSeconds(7.65), end: asSourceSeconds(8.05), deleted: false },
    { id: 'w_516', mediaId: 'asset_5', text: 'breath', start: asSourceSeconds(8.10), end: asSourceSeconds(8.60), deleted: false },
    { id: 'w_517', mediaId: 'asset_5', text: 'and', start: asSourceSeconds(8.65), end: asSourceSeconds(8.85), deleted: false },
    { id: 'w_518', mediaId: 'asset_5', text: 'enjoy', start: asSourceSeconds(8.90), end: asSourceSeconds(9.35), deleted: false },
    { id: 'w_519', mediaId: 'asset_5', text: 'this', start: asSourceSeconds(9.40), end: asSourceSeconds(9.60), deleted: false },
    { id: 'w_520', mediaId: 'asset_5', text: 'peaceful', start: asSourceSeconds(9.65), end: asSourceSeconds(10.30), deleted: false },
    { id: 'w_521', mediaId: 'asset_5', text: 'moment.', start: asSourceSeconds(10.35), end: asSourceSeconds(11.00), deleted: false },
    { id: 'f_502', mediaId: 'asset_5', text: 'you know', start: asSourceSeconds(11.05), end: asSourceSeconds(11.60), deleted: false, isFiller: true },
    { id: 'w_522', mediaId: 'asset_5', text: "It's", start: asSourceSeconds(11.65), end: asSourceSeconds(11.90), deleted: false },
    { id: 'w_523', mediaId: 'asset_5', text: 'simply', start: asSourceSeconds(11.95), end: asSourceSeconds(12.45), deleted: false },
    { id: 'w_524', mediaId: 'asset_5', text: 'wonderful.', start: asSourceSeconds(12.50), end: asSourceSeconds(13.50), deleted: false },
  ],
  asset_6: [
    { id: 'w_601', mediaId: 'asset_6', text: 'Thank', start: asSourceSeconds(0.00), end: asSourceSeconds(0.35), deleted: false },
    { id: 'w_602', mediaId: 'asset_6', text: 'you', start: asSourceSeconds(0.40), end: asSourceSeconds(0.60), deleted: false },
    { id: 'w_603', mediaId: 'asset_6', text: 'so', start: asSourceSeconds(0.65), end: asSourceSeconds(0.90), deleted: false },
    { id: 'w_604', mediaId: 'asset_6', text: 'much', start: asSourceSeconds(0.95), end: asSourceSeconds(1.30), deleted: false },
    { id: 'w_605', mediaId: 'asset_6', text: 'everyone!', start: asSourceSeconds(1.35), end: asSourceSeconds(2.05), deleted: false },
    { id: 'p_601', mediaId: 'asset_6', text: '[0.55s pause]', start: asSourceSeconds(2.05), end: asSourceSeconds(2.60), deleted: false, isPause: true },
    { id: 'f_601', mediaId: 'asset_6', text: 'um', start: asSourceSeconds(2.60), end: asSourceSeconds(2.95), deleted: false, isFiller: true },
    { id: 'w_606', mediaId: 'asset_6', text: 'This', start: asSourceSeconds(3.00), end: asSourceSeconds(3.25), deleted: false },
    { id: 'w_607', mediaId: 'asset_6', text: 'next', start: asSourceSeconds(3.30), end: asSourceSeconds(3.65), deleted: false },
    { id: 'w_608', mediaId: 'asset_6', text: 'track', start: asSourceSeconds(3.70), end: asSourceSeconds(4.15), deleted: false },
    { id: 'w_609', mediaId: 'asset_6', text: 'is', start: asSourceSeconds(4.20), end: asSourceSeconds(4.35), deleted: false },
    { id: 'w_610', mediaId: 'asset_6', text: 'for', start: asSourceSeconds(4.40), end: asSourceSeconds(4.55), deleted: false },
    { id: 'w_611', mediaId: 'asset_6', text: 'all', start: asSourceSeconds(4.60), end: asSourceSeconds(4.80), deleted: false },
    { id: 'w_612', mediaId: 'asset_6', text: 'of', start: asSourceSeconds(4.85), end: asSourceSeconds(5.00), deleted: false },
    { id: 'w_613', mediaId: 'asset_6', text: 'you.', start: asSourceSeconds(5.05), end: asSourceSeconds(5.50), deleted: false },
    { id: 'p_602', mediaId: 'asset_6', text: '[0.70s pause]', start: asSourceSeconds(5.50), end: asSourceSeconds(6.20), deleted: false, isPause: true },
    { id: 'w_614', mediaId: 'asset_6', text: 'Sing', start: asSourceSeconds(6.20), end: asSourceSeconds(6.60), deleted: false },
    { id: 'w_615', mediaId: 'asset_6', text: 'it', start: asSourceSeconds(6.65), end: asSourceSeconds(6.80), deleted: false },
    { id: 'w_616', mediaId: 'asset_6', text: 'with', start: asSourceSeconds(6.85), end: asSourceSeconds(7.10), deleted: false },
    { id: 'w_617', mediaId: 'asset_6', text: 'us!', start: asSourceSeconds(7.15), end: asSourceSeconds(7.70), deleted: false },
  ],
};

/**
 * Intelligent Instant Transcript Generator for newly uploaded or custom media files
 */
export function generateDefaultTokensForAsset(mediaId: string, name: string, durationSec: number): WordToken[] {
  const baseWords = name.replace(/\.[^/.]+$/, '').split(/[-_ ]+/).filter(Boolean);
  const sampleSentences = [
    ['Hello', 'and', 'welcome', 'to', ...baseWords],
    ['Today', 'we', 'are', 'reviewing', 'this', 'take', 'together'],
    ['The', 'audio', 'waveform', 'and', 'video', 'timing', 'look', 'fantastic'],
    ['Everything', 'is', 'synced', 'seamlessly', 'across', 'all', 'timeline', 'tracks'],
    ['Thank', 'you', 'for', 'watching', 'this', 'preview'],
  ];

  const tokens: WordToken[] = [];
  let t = 0.5;
  let wordIdx = 0;

  for (const sentence of sampleSentences) {
    if (t >= durationSec - 1.0) break;
    for (let i = 0; i < sentence.length; i++) {
      if (t >= durationSec - 0.5) break;
      const word = sentence[i] ?? 'word';
      const wDur = Math.min(0.55, Number((0.25 + (word.length * 0.04)).toFixed(2)));
      const wStart = Number(t.toFixed(2));
      const wEnd = Number((t + wDur).toFixed(2));

      tokens.push({
        id: `w_gen_${mediaId}_${wordIdx++}`,
        mediaId,
        text: word,
        start: asSourceSeconds(wStart),
        end: asSourceSeconds(wEnd),
        deleted: false,
      });

      t += wDur + 0.08;

      // Inject natural filler occasionally
      if (wordIdx === 5) {
        tokens.push({
          id: `f_gen_${mediaId}_${wordIdx++}`,
          mediaId,
          text: 'um',
          start: asSourceSeconds(Number(t.toFixed(2))),
          end: asSourceSeconds(Number((t + 0.4).toFixed(2))),
          deleted: false,
          isFiller: true,
        });
        t += 0.48;
      }
    }

    // Add brief pause between sentences
    if (t < durationSec - 1.5) {
      tokens.push({
        id: `p_gen_${mediaId}_${wordIdx++}`,
        mediaId,
        text: '[0.60s pause]',
        start: asSourceSeconds(Number(t.toFixed(2))),
        end: asSourceSeconds(Number((t + 0.60).toFixed(2))),
        deleted: false,
        isPause: true,
      });
      t += 0.70;
    }
  }

  return tokens;
}

/**
 * Initial Timeline Multi-Track Configuration Matching Page 1
 */
const RAW_TIMELINE_CLIPS: (Omit<TimelineClip, 'timelineStart' | 'timelineDuration' | 'sourceIn' | 'sourceOut' | 'sourceStart' | 'duration'> & {
  timelineStart: number;
  timelineDuration: number;
  sourceIn: number;
  sourceOut: number;
  sourceStart?: number;
  duration: number;
})[] = [
  // Track 1: Purple Titles
  {
    id: 'clip_title_1',
    trackId: 'track_title',
    title: 'TT My summer story',
    timelineStart: 0,
    timelineDuration: 12.0,
    sourceIn: 0,
    sourceOut: 12.0,
    sourceStart: 0,
    duration: 12.0,
    color: '#8854D0',
    titleData: {
      text: 'My Summer Story',
      stylePreset: 'Cinematic Trailer',
      position: { x: 50, y: 80 },
      fontSize: 22,
      scale: 1.0,
      color: '#FFD700',
      alignment: 'center',
    },
  },
  {
    id: 'clip_title_2',
    trackId: 'track_title',
    title: 'TT The beautiful sunrise',
    timelineStart: 20.0,
    timelineDuration: 14.0,
    sourceIn: 0,
    sourceOut: 14.0,
    sourceStart: 20.0,
    duration: 14.0,
    color: '#8854D0',
    titleData: {
      text: 'The Beautiful Sunrise',
      stylePreset: 'Lower Third News',
      position: { x: 30, y: 85 },
      fontSize: 18,
      scale: 1.0,
      color: '#FFFFFF',
      alignment: 'left',
    },
  },
  // Track 2: Composite Video Segments with Real Playable CC0 URLs
  {
    id: 'clip_video_1',
    trackId: 'track_video',
    title: 'Great Festival Colors.mov',
    timelineStart: 0,
    timelineDuration: 10.0,
    sourceIn: 0,
    sourceOut: 10.0,
    sourceStart: 0,
    duration: 10.0,
    color: '#4B6584',
    mediaId: 'asset_1',
    locator: '/sample_festival.mp4',
    videoUrl: '/sample_festival.mp4',
    isSelected: true,
    hasWaveform: true,
    transitionOut: 'Cross Dissolve',
  },
  {
    id: 'clip_video_2',
    trackId: 'track_video',
    title: "Green Lagune's concert.mp4",
    timelineStart: 10.0,
    timelineDuration: 5.0,
    sourceIn: 0,
    sourceOut: 5.0,
    sourceStart: 10.0,
    duration: 5.0,
    color: '#4B6584',
    mediaId: 'asset_6',
    locator: '/sample_team.mp4',
    videoUrl: '/sample_team.mp4',
    hasWaveform: true,
    transitionIn: 'Cross Dissolve',
    transitionDuration: 1.2,
    transitionOut: 'Glitch Flash',
  },
  {
    id: 'clip_video_3',
    trackId: 'track_video',
    title: 'My world today.mp4',
    timelineStart: 15.0,
    timelineDuration: 12.0,
    sourceIn: 0,
    sourceOut: 12.0,
    sourceStart: 15.0,
    duration: 12.0,
    color: '#4B6584',
    mediaId: 'asset_5',
    locator: '/sample_festival.mp4',
    videoUrl: '/sample_festival.mp4',
    hasWaveform: true,
    transitionIn: 'Glitch Flash',
    transitionDuration: 1.0,
    filter: 'Retro Film',
    filterData: { filterName: 'Retro Film', intensity: 100 },
  },
  {
    id: 'clip_video_4',
    trackId: 'track_video',
    title: 'Girls-team_Forever.mov',
    timelineStart: 27.0,
    timelineDuration: 15.0,
    sourceIn: 0,
    sourceOut: 15.0,
    sourceStart: 27.0,
    duration: 15.0,
    color: '#4B6584',
    mediaId: 'asset_2',
    locator: '/sample_team.mp4',
    videoUrl: '/sample_team.mp4',
    hasWaveform: true,
    transitionIn: '][',
  },
  // Track 3: Emerald Audio
  {
    id: 'clip_audio_1',
    trackId: 'track_audio',
    title: 'GGT - My_world_today.mp3',
    timelineStart: 0,
    timelineDuration: 42.0,
    sourceIn: 0,
    sourceOut: 42.0,
    sourceStart: 0,
    duration: 42.0,
    color: '#10AC84',
    hasWaveform: true,
  },
];

export const INITIAL_TIMELINE_CLIPS: TimelineClip[] = RAW_TIMELINE_CLIPS.map(c => ({
  ...c,
  timelineStart: asTimelineSeconds(c.timelineStart),
  timelineDuration: asSeconds(c.timelineDuration),
  sourceIn: asSourceSeconds(c.sourceIn),
  sourceOut: asSourceSeconds(c.sourceOut),
  sourceStart: c.sourceStart !== undefined ? asTimelineSeconds(c.sourceStart) : undefined,
  duration: asSeconds(c.duration),
}));

/**
 * 4 Marker Flags Along Timeline Ruler
 */
export const INITIAL_MARKERS: MarkerFlag[] = [
  { id: 'm_1', time: 5.0, color: '#2ED573', label: 'Intro Hook' },
  { id: 'm_2', time: 10.0, color: '#FFD32A', label: 'Flower Bloom' },
  { id: 'm_3', time: 18.0, color: '#168BFF', label: 'Bear Solo' },
  { id: 'm_4', time: 30.0, color: '#8854D0', label: 'Dance Outro' },
];

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
