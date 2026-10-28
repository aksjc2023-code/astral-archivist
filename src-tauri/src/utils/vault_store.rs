use crate::commands::models::VaultItem;
use crate::utils::{AppError, AppResult};
use rusqlite::{params, Connection};
use std::fs;
use std::path::{Path, PathBuf};

pub struct VaultStore {
    db_path: PathBuf,
    vault_dir: PathBuf,
}

impl VaultStore {
    pub fn new() -> AppResult<Self> {
        let app_dir = dirs_fallback();
        let vault_dir = app_dir.join("AstralArchivist").join("Vault");
        fs::create_dir_all(&vault_dir).map_err(AppError::Io)?;

        let db_path = vault_dir.join("vault.db");
        let conn = Connection::open(&db_path)?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS recordings (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                filepath TEXT NOT NULL,
                thumbnail_path TEXT NOT NULL,
                duration_ms INTEGER NOT NULL,
                file_size_bytes INTEGER NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                fps INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                has_transcript INTEGER NOT NULL
            )",
            [],
        )?;

        Ok(Self { db_path, vault_dir })
    }

    pub fn get_vault_dir(&self) -> &Path {
        &self.vault_dir
    }

    pub fn insert_recording(&self, item: &VaultItem) -> AppResult<()> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute(
            "INSERT INTO recordings (
                id, title, filepath, thumbnail_path, duration_ms,
                file_size_bytes, width, height, fps, created_at, has_transcript
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                item.id,
                item.title,
                item.filepath,
                item.thumbnail_path,
                item.duration_ms,
                item.file_size_bytes,
                item.width,
                item.height,
                item.fps,
                item.created_at,
                if item.has_transcript { 1 } else { 0 },
            ],
        )?;
        Ok(())
    }

    pub fn get_all(&self) -> AppResult<Vec<VaultItem>> {
        let conn = Connection::open(&self.db_path)?;
        let mut stmt = conn.prepare(
            "SELECT id, title, filepath, thumbnail_path, duration_ms,
                    file_size_bytes, width, height, fps, created_at, has_transcript
             FROM recordings ORDER BY created_at DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            let has_tr: i32 = row.get(10)?;
            Ok(VaultItem {
                id: row.get(0)?,
                title: row.get(1)?,
                filepath: row.get(2)?,
                thumbnail_path: row.get(3)?,
                duration_ms: row.get(4)?,
                file_size_bytes: row.get(5)?,
                width: row.get(6)?,
                height: row.get(7)?,
                fps: row.get(8)?,
                created_at: row.get(9)?,
                has_transcript: has_tr == 1,
            })
        })?;

        let mut items = Vec::new();
        for row in rows {
            items.push(row?);
        }
        Ok(items)
    }

    pub fn rename(&self, id: &str, new_title: &str) -> AppResult<()> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute(
            "UPDATE recordings SET title = ?1 WHERE id = ?2",
            params![new_title, id],
        )?;
        Ok(())
    }

    pub fn delete(&self, id: &str) -> AppResult<()> {
        let conn = Connection::open(&self.db_path)?;
        // Fetch file paths to delete files on disk
        let mut stmt = conn.prepare("SELECT filepath, thumbnail_path FROM recordings WHERE id = ?1")?;
        let res = stmt.query_row(params![id], |row| {
            let fp: String = row.get(0)?;
            let tp: String = row.get(1)?;
            Ok((fp, tp))
        });

        if let Ok((fp, tp)) = res {
            let _ = fs::remove_file(fp);
            let _ = fs::remove_file(tp);
        }

        conn.execute("DELETE FROM recordings WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn delete_all(&self) -> AppResult<usize> {
        let conn = Connection::open(&self.db_path)?;
        // 1. Delete all physical recording and thumbnail files on disk
        let mut stmt = conn.prepare("SELECT filepath, thumbnail_path FROM recordings")?;
        let rows = stmt.query_map([], |row| {
            let fp: String = row.get(0)?;
            let tp: String = row.get(1)?;
            Ok((fp, tp))
        })?;

        let mut count = 0;
        for row in rows {
            if let Ok((fp, tp)) = row {
                let _ = fs::remove_file(fp);
                let _ = fs::remove_file(tp);
                count += 1;
            }
        }

        // 2. Clear all rows from database
        conn.execute("DELETE FROM recordings", [])?;
        Ok(count)
    }
}

fn dirs_fallback() -> PathBuf {
    if let Ok(app_data) = std::env::var("LOCALAPPDATA") {
        PathBuf::from(app_data)
    } else {
        PathBuf::from(".")
    }
}
