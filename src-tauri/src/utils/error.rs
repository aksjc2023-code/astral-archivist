use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Capture error: {0}")]
    Capture(String),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("FFmpeg process error: {0}")]
    FFmpeg(String),

    #[error("Inference engine error: {0}")]
    Inference(String),

    #[error("Window management error: {0}")]
    Window(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

// Convert AppError to a human-readable String over Tauri IPC
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_str())
    }
}

pub type AppResult<T> = Result<T, AppError>;
