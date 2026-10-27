use crate::utils::{AppError, AppResult};
use std::path::{Path, PathBuf};
use std::process::Command;

pub struct FFmpegEngine;

impl FFmpegEngine {
    pub fn get_ffmpeg_path() -> PathBuf {
        let candidates = [
            PathBuf::from("bin").join("win32").join("ffmpeg.exe"),
            PathBuf::from("..").join("bin").join("win32").join("ffmpeg.exe"),
            PathBuf::from("../../bin/win32/ffmpeg.exe"),
        ];
        for candidate in &candidates {
            if candidate.exists() {
                return candidate.clone();
            }
        }
        if let Ok(exe_dir) = std::env::current_exe() {
            if let Some(parent) = exe_dir.parent() {
                let candidate = parent.join("bin").join("win32").join("ffmpeg.exe");
                if candidate.exists() {
                    return candidate;
                }
            }
        }
        PathBuf::from("ffmpeg")
    }

    pub fn extract_thumbnail(video_path: &Path, output_thumb: &Path) -> AppResult<()> {
        let ffmpeg = Self::get_ffmpeg_path();
        let status = Command::new(ffmpeg)
            .args([
                "-y",
                "-ss",
                "00:00:00.200",
                "-i",
                video_path.to_str().unwrap_or_default(),
                "-vframes",
                "1",
                "-vf",
                "scale=480:-1",
                "-q:v",
                "2",
                output_thumb.to_str().unwrap_or_default(),
            ])
            .status()
            .map_err(|e| AppError::FFmpeg(format!("Failed to spawn ffmpeg for thumbnail: {}", e)))?;

        if !status.success() {
            return Err(AppError::FFmpeg("FFmpeg failed to extract thumbnail".into()));
        }

        Ok(())
    }

    pub fn generate_audio_thumbnail(output_thumb: &Path) -> AppResult<()> {
        let ffmpeg = Self::get_ffmpeg_path();
        let status = Command::new(ffmpeg)
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "gradients=s=480x270:r=1:c0=0x1e1b4b:c1=0xd97706",
                "-vframes",
                "1",
                "-q:v",
                "2",
                output_thumb.to_str().unwrap_or_default(),
            ])
            .status()
            .map_err(|e| AppError::FFmpeg(format!("Failed to generate audio thumb: {}", e)))?;

        if !status.success() {
            return Err(AppError::FFmpeg("FFmpeg failed to generate audio thumbnail".into()));
        }

        Ok(())
    }

    pub fn generate_synthetic_recording(output_path: &Path, duration_sec: u32, is_audio_only: bool) -> AppResult<()> {
        let ffmpeg = Self::get_ffmpeg_path();

        let mut cmd = Command::new(ffmpeg);
        cmd.arg("-y");

        // Hash filename to derive a deterministic, unique visual & acoustic theme
        let seed = output_path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.bytes().fold(0usize, |acc, b| acc.wrapping_add(b as usize)))
            .unwrap_or(0);

        if is_audio_only {
            let freqs = [330, 392, 440, 523, 587, 659];
            let freq = freqs[seed % freqs.len()];
            cmd.args([
                "-f",
                "lavfi",
                "-i",
                &format!("sine=frequency={}:sample_rate=48000", freq),
                "-t",
                &duration_sec.to_string(),
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                output_path.to_str().unwrap_or_default(),
            ]);
        } else {
            let visual_themes = [
                ("mandelbrot=size=1920x1080:rate=30:maxiter=100", 330),
                ("gradients=s=1920x1080:r=30:c0=0x022c22:c1=0x10b981", 392),
                ("plasma=s=1920x1080:r=30", 440),
                ("gradients=s=1920x1080:r=30:c0=0x2e1065:c1=0xa855f7", 523),
                ("cellauto=s=1920x1080:r=30:rule=30", 587),
                ("gradients=s=1920x1080:r=30:c0=0x082f49:c1=0x06b6d4", 659),
            ];
            let (visual_filter, audio_freq) = visual_themes[seed % visual_themes.len()];

            cmd.args([
                "-f",
                "lavfi",
                "-i",
                visual_filter,
                "-f",
                "lavfi",
                "-i",
                &format!("sine=frequency={}:sample_rate=48000", audio_freq),
                "-t",
                &duration_sec.to_string(),
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                output_path.to_str().unwrap_or_default(),
            ]);
        }

        let status = cmd.status().map_err(|e| AppError::FFmpeg(format!("Failed to spawn ffmpeg: {}", e)))?;
        if !status.success() {
            return Err(AppError::FFmpeg("FFmpeg recording failed".into()));
        }

        Ok(())
    }
}
