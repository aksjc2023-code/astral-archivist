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
pub async fn toggle_grimoire_window(app: tauri::AppHandle, show: Option<bool>) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("grimoire") {
        let is_visible = window.is_visible().unwrap_or(false);
        let next_state = show.unwrap_or(!is_visible);
        if next_state {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
            let _ = set_window_capture_affinity(true).await;
            Ok(true)
        } else {
            let _ = window.hide();
            Ok(false)
        }
    } else {
        // Build window if not already active
        let webview_builder = tauri::WebviewWindowBuilder::new(
            &app,
            "grimoire",
            tauri::WebviewUrl::App("/?window=grimoire".into()),
        )
        .title("The Invisible Grimoire")
        .inner_size(440.0, 640.0)
        .always_on_top(true)
        .resizable(true);

        if let Ok(new_win) = webview_builder.build() {
            let _ = new_win.show();
            let _ = new_win.set_focus();
            let _ = set_window_capture_affinity(true).await;
            Ok(true)
        } else {
            Ok(false)
        }
    }
}

#[tauri::command]
pub async fn is_grimoire_window_visible(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("grimoire") {
        Ok(window.is_visible().unwrap_or(false))
    } else {
        Ok(false)
    }
}

