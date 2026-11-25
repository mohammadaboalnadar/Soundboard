//! Mouse side buttons (Mouse 4 / Mouse 5) as global hotkeys. The shortcut plugin
//! only knows keyboard keys, so a low-level mouse hook reports these. The hook runs
//! on its own thread and is installed only while at least one side button is bound.
//! Presses we synthesize ourselves (auto push-to-talk) are ignored.

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::AppHandle;

/// "Mouse4" -> X button 1, "Mouse5" -> X button 2.
pub fn button(acc: &str) -> Option<u16> {
    match acc {
        "Mouse4" => Some(1),
        "Mouse5" => Some(2),
        _ => None,
    }
}

struct State {
    app: Option<AppHandle>,
    /// X button -> binding id
    map: HashMap<u16, String>,
    /// hook thread id, while the hook is installed
    thread: Option<u32>,
}

static STATE: Mutex<Option<State>> = Mutex::new(None);

/// Replace the side-button bindings; installs or removes the hook as needed.
pub fn set(app: &AppHandle, map: HashMap<u16, String>) {
    let mut guard = STATE.lock().unwrap();
    let st = guard.get_or_insert_with(|| State { app: None, map: HashMap::new(), thread: None });
    st.app = Some(app.clone());
    st.map = map;
    if st.map.is_empty() {
        if let Some(t) = st.thread.take() {
            imp::stop(t);
        }
    } else if st.thread.is_none() {
        st.thread = imp::start();
    }
}

fn fire(button: u16, down: bool) {
    let (app, id) = {
        let guard = STATE.lock().unwrap();
        match guard.as_ref().map(|st| (st.app.clone(), st.map.get(&button).cloned())) {
            Some((Some(a), Some(id))) => (a, id),
            _ => return,
        }
    };
    crate::hotkeys::emit(&app, id, down);
}

#[cfg(windows)]
mod imp {
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Threading::GetCurrentThreadId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, PostThreadMessageW, SetWindowsHookExW, UnhookWindowsHookEx, LLMHF_INJECTED, MSG, MSLLHOOKSTRUCT, WH_MOUSE_LL, WM_QUIT,
        WM_XBUTTONDOWN, WM_XBUTTONUP,
    };

    unsafe extern "system" fn hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 && (wparam as u32 == WM_XBUTTONDOWN || wparam as u32 == WM_XBUTTONUP) {
            let info = &*(lparam as *const MSLLHOOKSTRUCT);
            if info.flags & LLMHF_INJECTED == 0 {
                let button = (info.mouseData >> 16) as u16;
                let down = wparam as u32 == WM_XBUTTONDOWN;
                // never block the system mouse: report from another thread
                std::thread::spawn(move || super::fire(button, down));
            }
        }
        CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
    }

    pub fn start() -> Option<u32> {
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::Builder::new()
            .name("mouse-hotkeys".into())
            .spawn(move || unsafe {
                let h = SetWindowsHookExW(WH_MOUSE_LL, Some(hook), GetModuleHandleW(std::ptr::null()), 0);
                let _ = tx.send(if h.is_null() { None } else { Some(GetCurrentThreadId()) });
                if h.is_null() {
                    return;
                }
                let mut msg: MSG = std::mem::zeroed();
                while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {}
                UnhookWindowsHookEx(h);
            })
            .ok()?;
        rx.recv().ok().flatten()
    }

    pub fn stop(thread: u32) {
        unsafe {
            PostThreadMessageW(thread, WM_QUIT, 0, 0);
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn start() -> Option<u32> {
        None
    }
    pub fn stop(_: u32) {}
}

#[cfg(test)]
mod tests {
    #[test]
    fn side_buttons_only() {
        assert_eq!(super::button("Mouse4"), Some(1));
        assert_eq!(super::button("Mouse5"), Some(2));
        assert_eq!(super::button("Ctrl+Mouse4"), None);
        assert_eq!(super::button("F9"), None);
    }
}
