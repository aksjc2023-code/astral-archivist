use crate::commands::models::VaultItem;
use crate::utils::VaultStore;

#[tauri::command]
pub async fn get_vault_recordings() -> Result<Vec<VaultItem>, String> {
    let vault = VaultStore::new().map_err(|e| e.to_string())?;
    vault.get_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_recording(id: String, new_title: String) -> Result<(), String> {
    let vault = VaultStore::new().map_err(|e| e.to_string())?;
    vault.rename(&id, &new_title).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_recording(id: String) -> Result<(), String> {
    let vault = VaultStore::new().map_err(|e| e.to_string())?;
    vault.delete(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_all_vault_recordings() -> Result<usize, String> {
    let vault = VaultStore::new().map_err(|e| e.to_string())?;
    vault.delete_all().map_err(|e| e.to_string())
}
