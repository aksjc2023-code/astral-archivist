pub mod commands;
pub mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::check_preflight,
            commands::list_vault_items,
            commands::save_capture_session,
            commands::rename_vault_item,
            commands::delete_vault_item
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
