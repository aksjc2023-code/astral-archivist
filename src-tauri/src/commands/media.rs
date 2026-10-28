use crate::utils::VaultStore;
use std::fs;
use std::path::{Path, PathBuf};

fn validate_safe_media_path(path_str: &str) -> Result<PathBuf, String> {
    let p = Path::new(path_str);
    if !p.exists() {
        return Err(format!("Media file does not exist: {}", path_str));
    }
    let canonical = p.canonicalize().map_err(|e| format!("Invalid path: {}", e))?;

    let vault = VaultStore::new().map_err(|e| e.to_string())?;
    let vault_dir = vault.get_vault_dir().canonicalize().unwrap_or_else(|_| vault.get_vault_dir().to_path_buf());
    let temp_dir = std::env::temp_dir().canonicalize().unwrap_or_else(|_| std::env::temp_dir());

    if canonical.starts_with(&vault_dir) || canonical.starts_with(&temp_dir) {
        Ok(canonical)
    } else {
        // Also allow files inside workspace or current project if running in development
        if let Ok(cwd) = std::env::current_dir() {
            if let Ok(canon_cwd) = cwd.canonicalize() {
                if canonical.starts_with(&canon_cwd) {
                    return Ok(canonical);
                }
            }
        }
        Err(format!("Access denied: Path is outside authorized media directories: {}", path_str))
    }
}

#[tauri::command]
pub async fn read_thumbnail_base64(path: String) -> Result<String, String> {
    let safe_path = validate_safe_media_path(&path)?;
    let bytes = fs::read(&safe_path).map_err(|e| format!("Failed to read thumbnail: {}", e))?;
    let b64 = base64_encode(&bytes);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

#[tauri::command]
pub async fn read_media_bytes(path: String) -> Result<Vec<u8>, String> {
    let safe_path = validate_safe_media_path(&path)?;
    fs::read(&safe_path).map_err(|e| format!("Failed to read media bytes: {}", e))
}

fn base64_encode(data: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);

    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };

        let n = (b0 << 16) | (b1 << 8) | b2;

        result.push(CHARSET[(n >> 18) & 63] as char);
        result.push(CHARSET[(n >> 12) & 63] as char);
        if chunk.len() > 1 {
            result.push(CHARSET[(n >> 6) & 63] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARSET[n & 63] as char);
        } else {
            result.push('=');
        }
    }

    result
}
