use crate::commands::SaveSessionPayload;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VaultItem {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub duration_seconds: f64,
    pub source_type: String,
    pub file_path: String,
    pub thumb_path: Option<String>,
    pub file_size_bytes: u64,
}

pub fn get_vault_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app_data_dir: {}", e))?;
    let vault_dir = app_dir.join("astral_vault");
    if !vault_dir.exists() {
        fs::create_dir_all(&vault_dir)
            .map_err(|e| format!("Failed to create vault directory: {}", e))?;
    }
    Ok(vault_dir)
}

pub fn get_manifest_path(vault_dir: &PathBuf) -> PathBuf {
    vault_dir.join("manifest.json")
}

pub fn load_manifest(vault_dir: &PathBuf) -> Vec<VaultItem> {
    let manifest_path = get_manifest_path(vault_dir);
    if let Ok(content) = fs::read_to_string(&manifest_path) {
        if let Ok(items) = serde_json::from_str::<Vec<VaultItem>>(&content) {
            return items;
        }
    }
    Vec::new()
}

pub fn save_manifest(vault_dir: &PathBuf, items: &[VaultItem]) -> Result<(), String> {
    let manifest_path = get_manifest_path(vault_dir);
    let tmp_path = vault_dir.join("manifest.json.tmp");
    let json_data = serde_json::to_string_pretty(items)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    fs::write(&tmp_path, json_data)
        .map_err(|e| format!("Failed to write manifest tmp: {}", e))?;
    fs::rename(&tmp_path, &manifest_path)
        .map_err(|e| format!("Failed to commit manifest rename: {}", e))?;
    Ok(())
}

pub fn save_session(app: &AppHandle, payload: SaveSessionPayload) -> Result<VaultItem, String> {
    let vault_dir = get_vault_dir(app)?;
    let recordings_dir = vault_dir.join("recordings");
    fs::create_dir_all(&recordings_dir)
        .map_err(|e| format!("Failed to create recordings folder: {}", e))?;

    let file_name = format!("{}_{}.webm", payload.source_type, payload.id);
    let file_path = recordings_dir.join(&file_name);

    let mut size_bytes = 0u64;
    if let Some(b64) = payload.video_bytes_base64 {
        use std::io::Write;
        let raw_bytes = b64.as_bytes();
        let mut file = fs::File::create(&file_path)
            .map_err(|e| format!("Failed to create video file: {}", e))?;
        file.write_all(raw_bytes)
            .map_err(|e| format!("Failed to write video bytes: {}", e))?;
        size_bytes = raw_bytes.len() as u64;
    } else {
        let _ = fs::File::create(&file_path);
    }

    use std::time::{SystemTime, UNIX_EPOCH};
    let epoch = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let now = format!("{}", epoch.as_secs());

    let new_item = VaultItem {
        id: payload.id,
        title: payload.title,
        created_at: now,
        duration_seconds: payload.duration_seconds,
        source_type: payload.source_type,
        file_path: file_path.to_string_lossy().to_string(),
        thumb_path: None,
        file_size_bytes: size_bytes,
    };

    let mut items = load_manifest(&vault_dir);
    items.retain(|i| i.id != new_item.id);
    items.insert(0, new_item.clone());
    save_manifest(&vault_dir, &items)?;

    Ok(new_item)
}

pub fn rename_item(app: &AppHandle, id: String, new_title: String) -> Result<bool, String> {
    let vault_dir = get_vault_dir(app)?;
    let mut items = load_manifest(&vault_dir);
    let mut found = false;
    for item in &mut items {
        if item.id == id {
            item.title = new_title.clone();
            found = true;
            break;
        }
    }
    if found {
        save_manifest(&vault_dir, &items)?;
    }
    Ok(found)
}

pub fn delete_item(app: &AppHandle, id: String) -> Result<bool, String> {
    let vault_dir = get_vault_dir(app)?;
    let mut items = load_manifest(&vault_dir);
    let mut target_file: Option<String> = None;

    items.retain(|item| {
        if item.id == id {
            target_file = Some(item.file_path.clone());
            false
        } else {
            true
        }
    });

    if let Some(path_str) = target_file {
        let p = PathBuf::from(path_str);
        if p.exists() {
            let _ = fs::remove_file(p);
        }
        save_manifest(&vault_dir, &items)?;
        Ok(true)
    } else {
        Ok(false)
    }
}
