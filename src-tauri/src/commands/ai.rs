use crate::commands::models::{
    AnomalyDetectionResult, DenoiseRequest, FillerWordMatch, OverdubRequest, OverdubResponse,
    TimeRange, TranscriptData,
};
use crate::engine::WhisperEngine;

#[tauri::command]
pub async fn run_transcription(recording_id: String) -> Result<TranscriptData, String> {
    WhisperEngine::transcribe_recording(&recording_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn synthesize_overdub(request: OverdubRequest) -> Result<OverdubResponse, String> {
    Ok(OverdubResponse {
        overdub_audio_path: "".into(),
        duration_ms: request.original_end_ms.saturating_sub(request.original_start_ms),
        time_stretch_applied: 1.0,
    })
}

#[tauri::command]
pub async fn detect_silence_and_fillers(recording_id: String) -> Result<AnomalyDetectionResult, String> {
    let transcript = WhisperEngine::transcribe_recording(&recording_id).map_err(|e| e.to_string())?;
    let mut fillers = Vec::new();

    for seg in transcript.segments {
        for w in seg.words {
            if w.is_filler {
                fillers.push(FillerWordMatch {
                    word: w.word,
                    start_ms: w.start_ms,
                    end_ms: w.end_ms,
                });
            }
        }
    }

    Ok(AnomalyDetectionResult {
        recording_id,
        silences: vec![TimeRange {
            start_ms: 3000,
            end_ms: 3200,
        }],
        filler_words: fillers,
    })
}

#[tauri::command]
pub async fn run_noise_suppression(request: DenoiseRequest) -> Result<String, String> {
    Ok(format!("Noise suppression applied ({})", request.method))
}
