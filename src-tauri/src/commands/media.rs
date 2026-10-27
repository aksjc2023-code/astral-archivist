use std::fs;
use std::path::Path;

#[tauri::command]
pub async fn read_thumbnail_base64(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Thumbnail file does not exist: {}", path));
    }

    let bytes = fs::read(p).map_err(|e| format!("Failed to read thumbnail: {}", e))?;
    let b64 = base64_encode(&bytes);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

#[tauri::command]
pub async fn read_media_bytes(path: String) -> Result<Vec<u8>, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Media file does not exist: {}", path));
    }
    fs::read(p).map_err(|e| format!("Failed to read media bytes: {}", e))
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
