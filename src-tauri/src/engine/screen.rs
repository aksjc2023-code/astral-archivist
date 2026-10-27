use crate::commands::models::{CaptureSource, CaptureTargetType};
use crate::utils::AppResult;

pub struct ScreenEngine;

impl ScreenEngine {
    pub fn enumerate_sources() -> AppResult<Vec<CaptureSource>> {
        let mut sources = Vec::new();

        // 1. Primary Desktop Monitor
        sources.push(CaptureSource {
            id: "monitor_0".to_string(),
            name: "Primary Display (1920x1080)".to_string(),
            target_type: CaptureTargetType::Monitor,
            thumbnail_base64: None,
            is_primary: Some(true),
            width: 1920,
            height: 1080,
        });

        // 2. Active Windows via Win32
        #[cfg(target_os = "windows")]
        {
            Self::enumerate_windows_win32(&mut sources);
        }

        Ok(sources)
    }

    #[cfg(target_os = "windows")]
    fn enumerate_windows_win32(sources: &mut Vec<CaptureSource>) {
        use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
        use windows::Win32::UI::WindowsAndMessaging::{
            EnumWindows, GetWindowTextW, IsWindowVisible,
        };

        unsafe extern "system" fn enum_window_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let sources = &mut *(lparam.0 as *mut Vec<CaptureSource>);
            if IsWindowVisible(hwnd).as_bool() {
                let mut title_buf = [0u16; 512];
                let len = GetWindowTextW(hwnd, &mut title_buf);
                if len > 0 {
                    let title = String::from_utf16_lossy(&title_buf[..len as usize]);
                    let trimmed = title.trim();
                    if !trimmed.is_empty()
                        && trimmed != "The Astral Archivist"
                        && trimmed != "The Invisible Grimoire"
                        && trimmed != "Program Manager"
                        && trimmed != "Settings"
                    {
                        sources.push(CaptureSource {
                            id: format!("hwnd_{}", hwnd.0 as usize),
                            name: trimmed.to_string(),
                            target_type: CaptureTargetType::Window,
                            thumbnail_base64: None,
                            is_primary: Some(false),
                            width: 1920,
                            height: 1080,
                        });
                    }
                }
            }
            BOOL(1)
        }

        unsafe {
            let ptr = sources as *mut Vec<CaptureSource>;
            let _ = EnumWindows(Some(enum_window_proc), LPARAM(ptr as isize));
        }
    }
}
