use tauri::Manager;

#[tauri::command]
pub async fn set_window_capture_affinity(exclude: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            FindWindowW, SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE,
        };

        let title: Vec<u16> = "The Invisible Grimoire\0".encode_utf16().collect();
        unsafe {
            if let Ok(hwnd) = FindWindowW(None, windows::core::PCWSTR(title.as_ptr())) {
                if !hwnd.0.is_null() {
                    let affinity = if exclude {
                        WDA_EXCLUDEFROMCAPTURE
                    } else {
                        WDA_NONE
                    };
                    let _ = SetWindowDisplayAffinity(hwnd, affinity);
                }
            }
        }
    }
    let _ = exclude;
    Ok(())
}

#[tauri::command]
pub async fn toggle_grimoire_window(app: tauri::AppHandle, show: bool) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("grimoire") {
        if show {
            let _ = window.show();
            let _ = window.set_focus();
            let _ = set_window_capture_affinity(true).await;
            Ok(true)
        } else {
            let _ = window.hide();
            Ok(false)
        }
    } else {
        Ok(false)
    }
}

