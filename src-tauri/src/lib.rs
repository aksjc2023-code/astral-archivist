pub mod commands;
pub mod engine;
pub mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // Capture commands
            commands::capture::get_capture_sources,
            commands::capture::start_recording,
            commands::capture::pause_recording,
            commands::capture::resume_recording,
            commands::capture::stop_recording,
            commands::capture::save_captured_recording,
            // Vault commands
            commands::vault::get_vault_recordings,
            commands::vault::rename_recording,
            commands::vault::delete_recording,
            commands::vault::delete_all_vault_recordings,
            // Media commands
            commands::media::read_thumbnail_base64,
            commands::media::read_media_bytes,
            // Timeline & Export commands
            commands::editor::export_timeline_edl,
            // AI & Audio Processing commands
            commands::ai::run_transcription,
            commands::ai::synthesize_overdub,
            commands::ai::detect_silence_and_fillers,
            commands::ai::run_noise_suppression,
            // Window commands (A3 Invisible Grimoire)
            commands::window::set_window_capture_affinity,
            commands::window::toggle_grimoire_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
