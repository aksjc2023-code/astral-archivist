use crate::commands::models::ExportEdlRequest;
use crate::engine::EditorEngine;

#[tauri::command]
pub async fn export_timeline_edl(request: ExportEdlRequest) -> Result<String, String> {
    EditorEngine::render_edl(&request.edl, &request.output_filename).map_err(|e| e.to_string())
}
