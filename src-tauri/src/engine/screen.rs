use crate::commands::models::{CaptureSource, CaptureTargetType};
use crate::utils::AppResult;

pub struct ScreenEngine;

impl ScreenEngine {
    pub fn enumerate_sources() -> AppResult<Vec<CaptureSource>> {
        let mut sources = Vec::new();

        // 1. Enumerate Monitors
        #[cfg(target_os = "windows")]
        {
            Self::enumerate_monitors_win32(&mut sources);
        }

        #[cfg(not(target_os = "windows"))]
        {
            sources.push(CaptureSource {
                id: "monitor_0".to_string(),
                name: "Entire Screen (Primary Display)".to_string(),
                target_type: CaptureTargetType::Monitor,
                thumbnail_base64: None,
                is_primary: Some(true),
                width: 1920,
                height: 1080,
            });
        }

        // 2. Enumerate Active Windows via Win32 DWM
        #[cfg(target_os = "windows")]
        {
            Self::enumerate_windows_win32(&mut sources);
        }

        Ok(sources)
    }

    #[cfg(target_os = "windows")]
    fn enumerate_monitors_win32(sources: &mut Vec<CaptureSource>) {
        use windows::Win32::Foundation::{BOOL, LPARAM, RECT};
        use windows::Win32::Graphics::Gdi::{
            EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO,
        };

        unsafe extern "system" fn enum_monitor_proc(
            hmonitor: HMONITOR,
            _hdc: HDC,
            _rect: *mut RECT,
            lparam: LPARAM,
        ) -> BOOL {
            let sources = &mut *(lparam.0 as *mut Vec<CaptureSource>);
            let mut mi = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };

            if GetMonitorInfoW(hmonitor, &mut mi).as_bool() {
                let w = (mi.rcMonitor.right - mi.rcMonitor.left).abs() as u32;
                let h = (mi.rcMonitor.bottom - mi.rcMonitor.top).abs() as u32;
                let is_primary = (mi.dwFlags & 1) != 0;
                let count = sources.len() + 1;

                sources.push(CaptureSource {
                    id: format!("monitor_{}", sources.len()),
                    name: if is_primary {
                        format!("Entire Screen (Display {} - Primary {}x{})", count, w, h)
                    } else {
                        format!("Entire Screen (Display {} - {}x{})", count, w, h)
                    },
                    target_type: CaptureTargetType::Monitor,
                    thumbnail_base64: None,
                    is_primary: Some(is_primary),
                    width: w.max(1280),
                    height: h.max(720),
                });
            }
            BOOL(1)
        }

        unsafe {
            let ptr = sources as *mut Vec<CaptureSource>;
            let _ = EnumDisplayMonitors(None, None, Some(enum_monitor_proc), LPARAM(ptr as isize));
        }

        // Fallback if no monitor was returned
        if sources.is_empty() {
            sources.push(CaptureSource {
                id: "monitor_0".to_string(),
                name: "Entire Screen (Primary Display 1920x1080)".to_string(),
                target_type: CaptureTargetType::Monitor,
                thumbnail_base64: None,
                is_primary: Some(true),
                width: 1920,
                height: 1080,
            });
        }
    }

    #[cfg(target_os = "windows")]
    fn enumerate_windows_win32(sources: &mut Vec<CaptureSource>) {
        use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
        use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
        use windows::Win32::UI::WindowsAndMessaging::{
            EnumWindows, GetWindow, GetWindowLongW, GetWindowRect, GetWindowTextW,
            IsIconic, IsWindowVisible, GWL_EXSTYLE, GWL_STYLE, GW_OWNER, WS_CHILD,
            WS_EX_APPWINDOW, WS_EX_TOOLWINDOW, WS_VISIBLE,
        };

        unsafe extern "system" fn enum_window_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let sources = &mut *(lparam.0 as *mut Vec<CaptureSource>);

            // 1. Basic visibility check
            if !IsWindowVisible(hwnd).as_bool() {
                return BOOL(1);
            }

            // 2. Filter out cloaked windows (suspended UWP apps, virtual desktop hidden windows)
            let mut cloaked: u32 = 0;
            let dwm_res = DwmGetWindowAttribute(
                hwnd,
                DWMWA_CLOAKED,
                &mut cloaked as *mut _ as *mut _,
                std::mem::size_of::<u32>() as u32,
            );
            if dwm_res.is_ok() && cloaked != 0 {
                return BOOL(1);
            }

            // 3. Window style validation: must be a top-level window, not a child
            let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
            if (style & WS_VISIBLE.0) == 0 || (style & WS_CHILD.0) != 0 {
                return BOOL(1);
            }

            let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
            // Tool windows are excluded unless explicitly promoted to AppWindow
            if (ex_style & WS_EX_TOOLWINDOW.0) != 0 && (ex_style & WS_EX_APPWINDOW.0) == 0 {
                return BOOL(1);
            }

            // 4. Must not be owned by another visible window unless it's an AppWindow
            let owner = GetWindow(hwnd, GW_OWNER);
            if let Ok(owner_hwnd) = owner {
                if !owner_hwnd.0.is_null() && (ex_style & WS_EX_APPWINDOW.0) == 0 && IsWindowVisible(owner_hwnd).as_bool() {
                    return BOOL(1);
                }
            }

            // 5. Must have real desktop dimensions (skip zero-size background message windows)
            let mut rect = RECT::default();
            if GetWindowRect(hwnd, &mut rect).is_ok() {
                let width = (rect.right - rect.left).abs() as u32;
                let height = (rect.bottom - rect.top).abs() as u32;

                // Minimized windows can have negative or tiny coords, allow minimized application windows
                let is_minimized = IsIconic(hwnd).as_bool();
                if !is_minimized && (width < 120 || height < 120) {
                    return BOOL(1);
                }

                // 6. Window title extraction
                let mut title_buf = [0u16; 512];
                let len = GetWindowTextW(hwnd, &mut title_buf);
                if len > 0 {
                    let title = String::from_utf16_lossy(&title_buf[..len as usize]);
                    let trimmed = title.trim();

                    // Filter out system shell & internal windows
                    if !trimmed.is_empty()
                        && trimmed != "The Astral Archivist"
                        && trimmed != "The Invisible Grimoire"
                        && trimmed != "Program Manager"
                        && trimmed != "Windows Input Experience"
                        && trimmed != "Settings"
                        && trimmed != "Default IME"
                        && trimmed != "MSCTFIME UI"
                    {
                        sources.push(CaptureSource {
                            id: format!("hwnd_{}", hwnd.0 as usize),
                            name: trimmed.to_string(),
                            target_type: CaptureTargetType::Window,
                            thumbnail_base64: None,
                            is_primary: Some(false),
                            width: width.max(1280),
                            height: height.max(720),
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
