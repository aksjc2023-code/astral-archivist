use crate::commands::models::{KeyTopic, StructuredSummary, TranscriptData, TranscriptSegment, WordToken};
use crate::utils::{AppError, AppResult, VaultStore};

pub struct WhisperEngine;

impl WhisperEngine {
    pub fn transcribe_recording(recording_id: &str) -> AppResult<TranscriptData> {
        let vault = VaultStore::new()?;
        let recordings = vault.get_all()?;
        let item = recordings
            .iter()
            .find(|r| r.id == recording_id)
            .ok_or_else(|| AppError::Inference("Recording not found for transcription".into()))?;

        let duration_ms = item.duration_ms;
        let mut segments = Vec::new();

        // High-precision simulated offline Whisper tokens with word-level timestamps
        let words_raw = vec![
            ("Welcome", 0, 800, false),
            ("to", 800, 1000, false),
            ("the", 1000, 1200, false),
            ("Astral", 1200, 1800, false),
            ("Archivist", 1800, 2400, false),
            ("sanctum.", 2400, 3000, false),
            ("Um", 3200, 3600, true), // Filler word
            ("this", 3600, 3900, false),
            ("is", 3900, 4100, false),
            ("an", 4100, 4300, false),
            ("offline", 4300, 4800, false),
            ("speech", 4800, 5200, false),
            ("transcription", 5200, 6000, false),
            ("running", 6000, 6400, false),
            ("uh", 6500, 6800, true), // Filler word
            ("locally.", 6800, 7500, false),
        ];

        let mut token_list = Vec::new();
        for (w, start, end, is_filler) in words_raw {
            if (end as u64) <= duration_ms {
                token_list.push(WordToken {
                    word: w.to_string(),
                    start_ms: start as u64,
                    end_ms: end as u64,
                    confidence: 0.98,
                    is_filler,
                    is_deleted: false,
                });
            }
        }

        let full_text: Vec<String> = token_list.iter().map(|t| t.word.clone()).collect();
        segments.push(TranscriptSegment {
            id: format!("seg_{}", recording_id),
            start_ms: 0,
            end_ms: duration_ms,
            speaker: "Archivist".into(),
            text: full_text.join(" "),
            words: token_list,
        });

        let summary = StructuredSummary {
            overview: "Archival record documenting local offline transcription and speech synthesis in The Astral Archivist workstation.".into(),
            action_items: vec![
                "Review recorded illusion in Vault".into(),
                "Perform transcript-driven timeline cuts".into(),
            ],
            key_topics: vec![
                KeyTopic {
                    topic: "Sanctum Initiation".into(),
                    timestamp_ms: 0,
                },
                KeyTopic {
                    topic: "Offline Intelligence".into(),
                    timestamp_ms: 4300,
                },
            ],
        };

        Ok(TranscriptData {
            recording_id: recording_id.to_string(),
            language: "en".into(),
            segments,
            summary,
        })
    }
}
