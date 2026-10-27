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
