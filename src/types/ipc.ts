/**
 * The Astral Archivist - Strongly Typed IPC Bridge
 * Mirrored contracts between React 19 Frontend and Tauri v2 Rust Backend.
 */

// ==========================================
// CAPTURE SUBSYSTEM (B1, B2, A3)
// ==========================================

export type CaptureTargetType = 'monitor' | 'window' | 'audio_only';

export interface CaptureSource {
  id: string;
  name: string;
  target_type: CaptureTargetType;
  thumbnail_base64?: string;
  is_primary?: boolean;
  width: number;
  height: number;
}

export type TargetFramerate = 30 | 60;
export type TargetResolutionScale = 1.0 | 0.75 | 0.5;
export type VideoBitrateTier = 4000000 | 10000000 | 25000000;

export type ProjectionSnapPreset = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'custom';
export type ProjectionMaskShape = 'mandala' | 'hexagon' | 'rounded';

export interface AstralProjectionConfig {
  isEnabled: boolean;
  deviceId: string;
  normX: number; // 0.0 - 1.0 (relative to canvas width)
  normY: number; // 0.0 - 1.0 (relative to canvas height)
  normDiameter: number; // 0.06 - 0.40 (relative to canvas width)
  isMirrored: boolean;
  maskShape: ProjectionMaskShape;
  snapPreset: ProjectionSnapPreset;
}

export interface RecordingConfig {
  source_id: string;
  target_type: CaptureTargetType;
  include_microphone: boolean;
  microphone_device_id?: string;
  include_system_audio: boolean;
  webcam_device_id?: string;
  fps: TargetFramerate;
  resolution_scale: TargetResolutionScale;
  output_format: 'mp4' | 'webm';
  video_bitrate_bps?: number;
}

export interface RecordingSession {
  session_id: string;
  output_filepath: string;
  started_at_unix_ms: number;
  fps: number;
}

export interface RecordingMetricsEvent {
  session_id: string;
  duration_ms: number;
  current_fps: number;
  dropped_frames: number;
  mic_level_db: number;
}

// ==========================================
// VAULT OF MEMORIES (B3)
// ==========================================

export interface VaultItem {
  id: string;
  title: string;
  filepath: string;
  thumbnail_path: string;
  duration_ms: number;
  file_size_bytes: number;
  width: number;
  height: number;
  fps: number;
  created_at: string; // ISO 8601
  has_transcript: boolean;
}

// ==========================================
// WEAVE THE TIMELINE & EDL (B4, A1)
// ==========================================

export interface ClipSegment {
  segment_id: string;
  source_vault_id: string;
  source_start_ms: number;
  source_end_ms: number;
  timeline_start_ms: number;
  timeline_end_ms: number;
  is_muted: boolean;
  speed_ratio: number;
  overdub_audio_path?: string;
}

export interface TimelineTrack {
  track_id: string;
  track_type: 'video' | 'audio' | 'overdub';
  segments: ClipSegment[];
}

export interface ProjectEdl {
  project_id: string;
  title: string;
  duration_ms: number;
  tracks: TimelineTrack[];
}

export interface ExportEdlRequest {
  edl: ProjectEdl;
  output_filename: string;
  format: 'mp4' | 'webm';
  use_hardware_accel: boolean;
}

export interface ExportProgressEvent {
  job_id: string;
  progress_percent: number;
  current_fps: number;
  eta_seconds: number;
}

// ==========================================
// THE SCRIBE OF KAMAR-TAJ (B5, A1, A2, A4)
// ==========================================

export interface WordToken {
  word: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
  is_filler: boolean;
  is_deleted: boolean;
}

export interface TranscriptSegment {
  id: string;
  start_ms: number;
  end_ms: number;
  speaker: string;
  text: string;
  words: WordToken[];
}

export interface StructuredSummary {
  overview: string;
  action_items: string[];
  key_topics: Array<{ topic: string; timestamp_ms: number }>;
}

export interface TranscriptData {
  recording_id: string;
  language: string;
  segments: TranscriptSegment[];
  summary: StructuredSummary;
}

export interface TranscriptionProgressEvent {
  recording_id: string;
  progress_percent: number;
  processed_seconds: number;
  total_seconds: number;
}

export interface OverdubRequest {
  segment_id: string;
  original_start_ms: number;
  original_end_ms: number;
  replacement_text: string;
  voice_id: string;
}

export interface OverdubResponse {
  overdub_audio_path: string;
  duration_ms: number;
  time_stretch_applied: number;
}

export interface AnomalyDetectionResult {
  recording_id: string;
  silences: Array<{ start_ms: number; end_ms: number }>;
  filler_words: Array<{ word: string; start_ms: number; end_ms: number }>;
}

export interface DenoiseRequest {
  recording_id: string;
  method: 'afftdn' | 'rnnoise';
  intensity: 'light' | 'moderate' | 'aggressive';
}
