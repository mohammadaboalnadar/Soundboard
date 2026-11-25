//! Mouse side buttons (Mouse 4 / Mouse 5) as global hotkeys, alone, together
//! ("Mouse4+Mouse5") or with modifiers ("Ctrl+Mouse4"). The shortcut plugin only
//! knows keyboard keys, so a low-level mouse hook reports these. The hook runs on
//! its own thread and is installed only while at least one side button is bound.
//! Presses we synthesize ourselves (auto push-to-talk) are ignored.

use std::collections::HashSet;
use std::sync::Mutex;
use tauri::AppHandle;

pub const CTRL: u8 = 1;
pub const ALT: u8 = 2;
pub const SHIFT: u8 = 4;
pub const SUPER: u8 = 8;
const M4: u8 = 1;
const M5: u8 = 2;

/// A side-button chord: modifier bits and button bits (Mouse4 = 1, Mouse5 = 2).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Combo {
    pub mods: u8,
    pub buttons: u8,
}

/// Parse "Mouse4", "Mouse4+Mouse5", "Ctrl+Shift+Mouse5"... Anything with a
/// keyboard key in it is not ours.
pub fn combo(acc: &str) -> Option<Combo> {
    let mut c = Combo { mods: 0, buttons: 0 };
    for part in acc.split('+') {
        match part {
            "Ctrl" => c.mods |= CTRL,
            "Alt" => c.mods |= ALT,
            "Shift" => c.mods |= SHIFT,
            "Super" => c.mods |= SUPER,
            "Mouse4" => c.buttons |= M4,
            "Mouse5" => c.buttons |= M5,
            _ => return None,
        }
    }
    (c.buttons != 0).then_some(c)
}

fn bit(xbutton: u16) -> u8 {
    match xbutton {
        1 => M4,
        2 => M5,
        _ => 0,
    }
}

/// What the hook knows: bindings, which buttons are held, and which bindings fired.
#[derive(Default)]
pub struct Chords {
    bindings: Vec<(Combo, String)>,
    held: u8,
    active: HashSet<usize>,
}

impl Chords {
    /// A button went down or up with these modifiers held. Returns (binding id, down) events.
    pub fn on(&mut self, button: u8, down: bool, mods: u8) -> Vec<(String, bool)> {
        let mut out = Vec::new();
        if down {
            if self.held & button != 0 {
                return out; // auto-repeat
            }
            self.held |= button;
            for (i, (c, id)) in self.bindings.iter().enumerate() {
                if c.buttons == self.held && c.mods == mods && self.active.insert(i) {
                    out.push((id.clone(), true));
                }
            }
        } else {
            self.held &= !button;
            let ended: Vec<usize> = self.active.iter().copied().filter(|&i| self.bindings[i].0.buttons & button != 0).collect();
            for i in ended {
                self.active.remove(&i);
                out.push((self.bindings[i].1.clone(), false));
            }
        }
        out
    }
}

struct State {
    app: Option<AppHandle>,
    chords: Chords,
    /// hook thread id, while the hook is installed
    thread: Option<u32>,
}

static STATE: Mutex<Option<State>> = Mutex::new(None);

/// Replace the side-button bindings; installs or removes the hook as needed.
pub fn set(app: &AppHandle, bindings: Vec<(Combo, String)>) {
    let mut guard = STATE.lock().unwrap();
    let st = guard.get_or_insert_with(|| State { app: None, chords: Chords::default(), thread: None });
    st.app = Some(app.clone());
    st.chords = Chords { bindings, ..Default::default() };
    if st.chords.bindings.is_empty() {
        if let Some(t) = st.thread.take() {
            imp::stop(t);
        }
    } else if st.thread.is_none() {
        st.thread = imp::start();
    }
}

fn input(xbutton: u16, down: bool, mods: u8) {
    let b = bit(xbutton);
    if b == 0 {
        return;
    }
    let (app, events) = {
        let mut guard = STATE.lock().unwrap();
        let Some(st) = guard.as_mut() else { return };
        (st.app.clone(), st.chords.on(b, down, mods))
    };
    if let Some(app) = app {
        for (id, down) in events {
            crate::hotkeys::emit(&app, id, down);
        }
    }
}

#[cfg(windows)]
mod imp {
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Threading::GetCurrentThreadId;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, PostThreadMessageW, SetWindowsHookExW, UnhookWindowsHookEx, LLMHF_INJECTED, MSG, MSLLHOOKSTRUCT, WH_MOUSE_LL, WM_QUIT,
        WM_XBUTTONDOWN, WM_XBUTTONUP,
    };

    fn mods() -> u8 {
        let held = |vk: u16| unsafe { GetAsyncKeyState(vk as i32) } as u16 & 0x8000 != 0;
        let mut m = 0;
        if held(VK_CONTROL) {
            m |= super::CTRL;
        }
        if held(VK_MENU) {
            m |= super::ALT;
        }
        if held(VK_SHIFT) {
            m |= super::SHIFT;
        }
        if held(VK_LWIN) || held(VK_RWIN) {
            m |= super::SUPER;
        }
        m
    }

    unsafe extern "system" fn hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 && (wparam as u32 == WM_XBUTTONDOWN || wparam as u32 == WM_XBUTTONUP) {
            let info = &*(lparam as *const MSLLHOOKSTRUCT);
            if info.flags & LLMHF_INJECTED == 0 {
                let button = (info.mouseData >> 16) as u16;
                let down = wparam as u32 == WM_XBUTTONDOWN;
                let m = mods();
                // never block the system mouse: report from another thread
                std::thread::spawn(move || super::input(button, down, m));
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
    use super::*;

    #[test]
    fn parses_side_button_combos_only() {
        assert_eq!(combo("Mouse4"), Some(Combo { mods: 0, buttons: M4 }));
        assert_eq!(combo("Mouse4+Mouse5"), Some(Combo { mods: 0, buttons: M4 | M5 }));
        assert_eq!(combo("Ctrl+Shift+Mouse5"), Some(Combo { mods: CTRL | SHIFT, buttons: M5 }));
        assert_eq!(combo("Ctrl"), None);
        assert_eq!(combo("F9"), None);
        assert_eq!(combo("Ctrl+A+Mouse4"), None);
    }

    fn chords(list: &[(&str, &str)]) -> Chords {
        Chords { bindings: list.iter().map(|(a, id)| (combo(a).unwrap(), id.to_string())).collect(), ..Default::default() }
    }

    #[test]
    fn both_buttons_fire_the_pair_in_either_order() {
        let mut c = chords(&[("Mouse4+Mouse5", "clip")]);
        assert!(c.on(M4, true, 0).is_empty());
        assert_eq!(c.on(M5, true, 0), vec![("clip".to_string(), true)]);
        assert_eq!(c.on(M4, false, 0), vec![("clip".to_string(), false)]);
        assert!(c.on(M5, false, 0).is_empty());
        assert!(c.on(M5, true, 0).is_empty());
        assert_eq!(c.on(M4, true, 0), vec![("clip".to_string(), true)]);
    }

    #[test]
    fn modifiers_must_match_exactly() {
        let mut c = chords(&[("Ctrl+Mouse4", "a"), ("Mouse4", "b")]);
        assert_eq!(c.on(M4, true, CTRL), vec![("a".to_string(), true)]);
        assert_eq!(c.on(M4, false, CTRL), vec![("a".to_string(), false)]);
        assert_eq!(c.on(M4, true, 0), vec![("b".to_string(), true)]);
    }

    #[test]
    fn single_button_binding_is_not_fired_by_a_held_pair() {
        let mut c = chords(&[("Mouse5", "five")]);
        c.on(M4, true, 0);
        assert!(c.on(M5, true, 0).is_empty());
    }
}
