use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CaptureTargetType {
    #[serde(rename = "monitor")]
    Monitor,
    #[serde(rename = "window")]
    Window,
    #[serde(rename = "audio_only")]
    AudioOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureSource {
    pub id: String,
    pub name: String,
    pub target_type: CaptureTargetType,
    pub thumbnail_base64: Option<String>,
    pub is_primary: Option<bool>,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingConfig {
    pub source_id: String,
    pub target_type: CaptureTargetType,
    pub include_microphone: bool,
    pub microphone_device_id: Option<String>,
    pub include_system_audio: bool,
    pub webcam_device_id: Option<String>,
    pub fps: u32,
    pub resolution_scale: f32,
    pub output_format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingSession {
    pub session_id: String,
    pub output_filepath: String,
    pub started_at_unix_ms: u64,
    pub fps: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingMetricsEvent {
    pub session_id: String,
    pub duration_ms: u64,
    pub current_fps: f32,
    pub dropped_frames: u64,
    pub mic_level_db: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultItem {
    pub id: String,
    pub title: String,
    pub filepath: String,
    pub thumbnail_path: String,
    pub duration_ms: u64,
    pub file_size_bytes: u64,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub created_at: String,
    pub has_transcript: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipSegment {
    pub segment_id: String,
    pub source_vault_id: String,
    pub source_start_ms: u64,
    pub source_end_ms: u64,
    pub timeline_start_ms: u64,
    pub timeline_end_ms: u64,
    pub is_muted: bool,
    pub speed_ratio: f32,
    pub overdub_audio_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineTrack {
    pub track_id: String,
    pub track_type: String,
    pub segments: Vec<ClipSegment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectEdl {
    pub project_id: String,
    pub title: String,
    pub duration_ms: u64,
    pub tracks: Vec<TimelineTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportEdlRequest {
    pub edl: ProjectEdl,
    pub output_filename: String,
    pub format: String,
    pub use_hardware_accel: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordToken {
    pub word: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub confidence: f32,
    pub is_filler: bool,
    pub is_deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub id: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub speaker: String,
    pub text: String,
    pub words: Vec<WordToken>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyTopic {
    pub topic: String,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredSummary {
    pub overview: String,
    pub action_items: Vec<String>,
    pub key_topics: Vec<KeyTopic>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptData {
    pub recording_id: String,
    pub language: String,
    pub segments: Vec<TranscriptSegment>,
    pub summary: StructuredSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverdubRequest {
    pub segment_id: String,
    pub original_start_ms: u64,
    pub original_end_ms: u64,
    pub replacement_text: String,
    pub voice_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverdubResponse {
    pub overdub_audio_path: String,
    pub duration_ms: u64,
    pub time_stretch_applied: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeRange {
    pub start_ms: u64,
    pub end_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FillerWordMatch {
    pub word: String,
    pub start_ms: u64,
    pub end_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnomalyDetectionResult {
    pub recording_id: String,
    pub silences: Vec<TimeRange>,
    pub filler_words: Vec<FillerWordMatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DenoiseRequest {
    pub recording_id: String,
    pub method: String,
    pub intensity: String,
}
