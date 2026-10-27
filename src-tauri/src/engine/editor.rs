use crate::commands::models::ProjectEdl;
use crate::engine::FFmpegEngine;
use crate::utils::{AppError, AppResult, VaultStore};
use std::process::Command;

pub struct EditorEngine;

impl EditorEngine {
    pub fn render_edl(edl: &ProjectEdl, output_filename: &str) -> AppResult<String> {
        let vault = VaultStore::new()?;
        let output_path = vault.get_vault_dir().join(output_filename);
        let ffmpeg = FFmpegEngine::get_ffmpeg_path();

        // Extract video track segments
        let video_track = edl.tracks.iter().find(|t| t.track_type == "video");
        let segments = match video_track {
            Some(t) if !t.segments.is_empty() => &t.segments,
            _ => return Err(AppError::FFmpeg("No valid video segments to render".into())),
        };

        // Locate source video file from Vault
        let source_id = &segments[0].source_vault_id;
        let all_recordings = vault.get_all()?;
        let source_item = all_recordings.iter().find(|r| &r.id == source_id)
            .ok_or_else(|| AppError::FFmpeg("Source recording not found in Vault".into()))?;

        // Build filter_complex with PTS alignment
        let mut filter_complex = String::new();
        let mut concat_inputs = String::new();

        for (i, seg) in segments.iter().enumerate() {
            let start_sec = (seg.source_start_ms as f64) / 1000.0;
            let end_sec = (seg.source_end_ms as f64) / 1000.0;

            filter_complex.push_str(&format!(
                "[0:v]trim=start={:.3}:end={:.3},setpts=PTS-STARTPTS[v{}];\n",
                start_sec, end_sec, i
            ));

            if seg.is_muted {
                filter_complex.push_str(&format!(
                    "[0:a]atrim=start={:.3}:end={:.3},asetpts=PTS-STARTPTS,volume=0[a{}];\n",
                    start_sec, end_sec, i
                ));
            } else {
                filter_complex.push_str(&format!(
                    "[0:a]atrim=start={:.3}:end={:.3},asetpts=PTS-STARTPTS[a{}];\n",
                    start_sec, end_sec, i
                ));
            }

            concat_inputs.push_str(&format!("[v{}][a{}]", i, i));
        }

        filter_complex.push_str(&format!(
            "{}concat=n={}:v=1:a=1[outv][outa]",
            concat_inputs,
            segments.len()
        ));

        let status = Command::new(ffmpeg)
            .args([
                "-y",
                "-i",
                &source_item.filepath,
                "-filter_complex",
                &filter_complex,
                "-map",
                "[outv]",
                "-map",
                "[outa]",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "21",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                output_path.to_str().unwrap_or_default(),
            ])
            .status()
            .map_err(|e| AppError::FFmpeg(format!("Failed to spawn export ffmpeg: {}", e)))?;

        if !status.success() {
            return Err(AppError::FFmpeg("EDL render export failed".into()));
        }

        Ok(output_path.to_str().unwrap_or_default().to_string())
    }
}
