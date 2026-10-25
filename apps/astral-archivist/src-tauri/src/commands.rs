use crate::ffmpeg::{self, ExportRequest, ExportResult};
use crate::vault::VaultItem;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PermissionPreflight {
    pub platform: String,
    pub display_capture_supported: bool,
    pub microphone_supported: bool,
    pub camera_supported: bool,
    pub vault_directory: String,
    pub ffmpeg_available: bool,
    pub ffprobe_available: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveSessionPayload {
    pub id: String,
    pub title: String,
    pub duration_seconds: f64,
    pub source_type: String,
    pub video_bytes_base64: Option<String>,
}

#[tauri::command]
pub fn check_preflight(app: AppHandle) -> Result<PermissionPreflight, String> {
    let vault_dir = crate::vault::get_vault_dir(&app)?;
    let ffmpeg_ok = std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    let ffprobe_ok = std::process::Command::new("ffprobe")
        .arg("-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    Ok(PermissionPreflight {
        platform: std::env::consts::OS.to_string(),
        display_capture_supported: true,
        microphone_supported: true,
        camera_supported: true,
        vault_directory: vault_dir.to_string_lossy().to_string(),
        ffmpeg_available: ffmpeg_ok,
        ffprobe_available: ffprobe_ok,
    })
}

#[tauri::command]
pub fn list_vault_items(app: AppHandle) -> Result<Vec<VaultItem>, String> {
    let vault_dir = crate::vault::get_vault_dir(&app)?;
    let mut items = crate::vault::load_manifest(&vault_dir);
    items.retain(|item| PathBuf::from(&item.file_path).exists());
    Ok(items)
}

#[tauri::command]
pub fn save_capture_session(app: AppHandle, payload: SaveSessionPayload) -> Result<VaultItem, String> {
    crate::vault::save_session(&app, payload)
}

#[tauri::command]
pub fn rename_vault_item(app: AppHandle, id: String, new_title: String) -> Result<bool, String> {
    crate::vault::rename_item(&app, id, new_title)
}

#[tauri::command]
pub fn delete_vault_item(app: AppHandle, id: String) -> Result<bool, String> {
    crate::vault::delete_item(&app, id)
}

#[tauri::command]
pub fn export_project(app: AppHandle, req: ExportRequest) -> Result<ExportResult, String> {
    let vault_dir = crate::vault::get_vault_dir(&app)?;
    ffmpeg::render_export(&vault_dir, req)
}
