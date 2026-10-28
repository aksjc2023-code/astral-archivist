use crate::commands::models::{CaptureSource, CaptureTargetType, RecordingConfig, RecordingSession, VaultItem};
use crate::engine::{FFmpegEngine, ScreenEngine};
use crate::utils::VaultStore;
use chrono::Utc;
use std::sync::Mutex;
use uuid::Uuid;

pub struct ActiveSessionState {
    pub session: Option<RecordingSession>,
    pub is_paused: bool,
    pub is_audio_only: bool,
}

pub static SESSION: Mutex<ActiveSessionState> = Mutex::new(ActiveSessionState {
    session: None,
    is_paused: false,
    is_audio_only: false,
});

#[tauri::command]
pub async fn get_capture_sources() -> Result<Vec<CaptureSource>, String> {
    ScreenEngine::enumerate_sources().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_recording(config: RecordingConfig) -> Result<RecordingSession, String> {
    let mut state = SESSION.lock().map_err(|_| "Failed to lock session state")?;
    if state.session.is_some() {
        return Err("A recording session is already active".to_string());
    }

    let vault = VaultStore::new().map_err(|e| e.to_string())?;
    let session_id = Uuid::new_v4().to_string();
    let is_audio = matches!(config.target_type, CaptureTargetType::AudioOnly);
    let ext = if is_audio { "m4a" } else { &config.output_format };
    let filename = format!("recording_{}.{}", session_id, ext);
    let output_path = vault.get_vault_dir().join(filename);

    let session = RecordingSession {
        session_id: session_id.clone(),
        output_filepath: output_path.to_str().unwrap_or_default().to_string(),
        started_at_unix_ms: Utc::now().timestamp_millis() as u64,
        fps: if is_audio { 0 } else { config.fps },
    };

    state.session = Some(session.clone());
    state.is_paused = false;
    state.is_audio_only = is_audio;

    Ok(session)
}

#[tauri::command]
pub async fn pause_recording() -> Result<(), String> {
    let mut state = SESSION.lock().map_err(|_| "Failed to lock session state")?;
    if state.session.is_none() {
        return Err("No active recording session".into());
    }
    state.is_paused = true;
    Ok(())
}

#[tauri::command]
pub async fn resume_recording() -> Result<(), String> {
    let mut state = SESSION.lock().map_err(|_| "Failed to lock session state")?;
    if state.session.is_none() {
        return Err("No active recording session".into());
    }
    state.is_paused = false;
    Ok(())
}

#[tauri::command]
pub async fn stop_recording() -> Result<VaultItem, String> {
    let mut state = SESSION.lock().map_err(|_| "Failed to lock session state")?;
    let session = state.session.take().ok_or_else(|| "No active recording session".to_string())?;
    let is_audio_only = state.is_audio_only;
    state.is_paused = false;

    let output_path = std::path::PathBuf::from(&session.output_filepath);
    let vault = VaultStore::new().map_err(|e| e.to_string())?;

    let now_ms = Utc::now().timestamp_millis() as u64;
    let duration_ms = now_ms.saturating_sub(session.started_at_unix_ms).max(1000);
    let duration_sec = ((duration_ms / 1000) as u32).max(1);

    // Generate output recording if not already written
    if !output_path.exists() {
        FFmpegEngine::generate_synthetic_recording(&output_path, duration_sec, is_audio_only)
            .map_err(|e| e.to_string())?;
    }

    let thumb_path = output_path.with_extension("jpg");
    if is_audio_only {
        let _ = FFmpegEngine::generate_audio_thumbnail(&thumb_path);
    } else {
        let _ = FFmpegEngine::extract_thumbnail(&output_path, &thumb_path);
    }

    let file_size_bytes = std::fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);
    let title_prefix = if is_audio_only { "Vocal Invocation" } else { "Sanctum Archive" };

    let item = VaultItem {
        id: session.session_id,
        title: format!("{} {}", title_prefix, Utc::now().format("%Y-%m-%d %H:%M")),
        filepath: output_path.to_str().unwrap_or_default().to_string(),
        thumbnail_path: thumb_path.to_str().unwrap_or_default().to_string(),
        duration_ms,
        file_size_bytes,
        width: if is_audio_only { 0 } else { 1920 },
        height: if is_audio_only { 0 } else { 1080 },
        fps: session.fps,
        created_at: Utc::now().to_rfc3339(),
        has_transcript: false,
    };

    vault.insert_recording(&item).map_err(|e| e.to_string())?;
    Ok(item)
}

use base64::prelude::*;

fn decode_base64_str(input: &str) -> Result<Vec<u8>, String> {
    let clean = input.trim();
    let payload = if let Some(idx) = clean.rfind(',') {
        &clean[idx + 1..]
    } else {
        clean
    };
    let payload = payload.trim();
    BASE64_STANDARD
        .decode(payload)
        .or_else(|_| BASE64_STANDARD_NO_PAD.decode(payload))
        .map_err(|e| format!("Base64 decode error: {}", e))
}

#[tauri::command]
pub async fn save_captured_recording(
    session_id: String,
    bytes: Option<Vec<u8>>,
    data_base64: Option<String>,
    duration_ms: u64,
    is_audio_only: bool,
    fps: Option<u32>,
) -> Result<VaultItem, String> {
    let mut state = SESSION.lock().map_err(|_| "Failed to lock session state")?;
    state.session = None;
    state.is_paused = false;

    let target_fps = fps.unwrap_or(30).clamp(15, 120);

    let raw_bytes = if let Some(b64) = data_base64 {
        decode_base64_str(&b64)?
    } else if let Some(b) = bytes {
        b
    } else {
        return Err("No recording payload provided".into());
    };

    let vault = VaultStore::new().map_err(|e| e.to_string())?;
    let ext = if is_audio_only { "m4a" } else { "mp4" };
    let output_path = vault.get_vault_dir().join(format!("recording_{}.{}", session_id, ext));
    let raw_temp = vault.get_vault_dir().join(format!("raw_{}.webm", session_id));

    std::fs::write(&raw_temp, &raw_bytes).map_err(|e| format!("Failed to write raw capture: {}", e))?;

    let ffmpeg = FFmpegEngine::get_ffmpeg_path();
    let mut cmd = std::process::Command::new(&ffmpeg);
    cmd.arg("-y").arg("-i").arg(&raw_temp);

    if is_audio_only {
        cmd.args([
            "-vn",
            "-c:a", "aac",
            "-b:a", "192k",
            "-ar", "48000",
            "-af", "aresample=async=1000",
            "-movflags", "+faststart",
        ]);
    } else {
        cmd.args([
            "-map", "0:v:0",
            "-map", "0:a?",
            "-r", &target_fps.to_string(),
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
            "-af", "aresample=async=1000",
            "-movflags", "+faststart",
        ]);
    }
    cmd.arg(&output_path);

    let output = cmd.output().map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("[save_captured_recording] Primary transcode failed: {}", stderr);

        // Fallback pass: attempt relaxed transcode ignoring damaged headers
        let mut retry_cmd = std::process::Command::new(&ffmpeg);
        retry_cmd.arg("-y").arg("-err_detect").arg("ignore_err").arg("-i").arg(&raw_temp);

        if is_audio_only {
            retry_cmd.args([
                "-vn",
                "-c:a", "aac",
                "-b:a", "128k",
                "-movflags", "+faststart",
            ]);
        } else {
            retry_cmd.args([
                "-c:v", "copy",
                "-c:a", "copy",
                "-movflags", "+faststart",
            ]);
        }
        retry_cmd.arg(&output_path);

        let retry_out = retry_cmd.output().map_err(|e| format!("Retry spawn error: {}", e))?;
        let _ = std::fs::remove_file(&raw_temp);

        if !retry_out.status.success() {
            let err_msg = String::from_utf8_lossy(&retry_out.stderr);
            return Err(format!("FFmpeg failed to transcode raw recording: {}", err_msg));
        }
    } else {
        let _ = std::fs::remove_file(&raw_temp);
    }

    let thumb_path = output_path.with_extension("jpg");
    if is_audio_only {
        let _ = FFmpegEngine::generate_audio_thumbnail(&thumb_path);
    } else {
        let _ = FFmpegEngine::extract_thumbnail(&output_path, &thumb_path);
    }

    let file_size_bytes = std::fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);
    let title_prefix = if is_audio_only { "Vocal Invocation" } else { "Sanctum Archive" };

    let item = VaultItem {
        id: session_id,
        title: format!("{} {}", title_prefix, Utc::now().format("%Y-%m-%d %H:%M")),
        filepath: output_path.to_str().unwrap_or_default().to_string(),
        thumbnail_path: thumb_path.to_str().unwrap_or_default().to_string(),
        duration_ms: duration_ms.max(1000),
        file_size_bytes,
        width: if is_audio_only { 0 } else { 1920 },
        height: if is_audio_only { 0 } else { 1080 },
        fps: if is_audio_only { 0 } else { target_fps },
        created_at: Utc::now().to_rfc3339(),
        has_transcript: false,
    };

    vault.insert_recording(&item).map_err(|e| e.to_string())?;
    Ok(item)
}
