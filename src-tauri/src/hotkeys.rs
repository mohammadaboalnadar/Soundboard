//! Global hotkeys. The frontend sends the full `{ soundId: accelerator }` map;
//! we register only what changed and keep a shortcut-id -> sound-id table so the
//! plugin handler can report which sound to fire, on press and on release.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

#[derive(Default)]
pub struct Hotkeys {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    /// shortcut id -> (shortcut, owning sound id)
    active: HashMap<u32, (Shortcut, String)>,
}

#[derive(serde::Serialize, Clone)]
pub struct HotkeyEvent {
    pub id: String,
    pub state: &'static str,
}

#[derive(serde::Serialize)]
pub struct SetResult {
    pub failed: Vec<String>,
}

/// Turn a frontend accelerator ("Ctrl+Shift+A", "Numpad1") into a plugin Shortcut.
pub fn parse(acc: &str) -> Option<Shortcut> {
    acc.parse::<Shortcut>().ok()
}

pub fn handle(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
    let state = app.state::<Hotkeys>();
    let owner = state.inner.lock().unwrap().active.get(&shortcut.id()).map(|(_, id)| id.clone());
    if let Some(id) = owner {
        let state = match event.state() {
            ShortcutState::Pressed => "down",
            ShortcutState::Released => "up",
        };
        let _ = app.emit("hotkey", HotkeyEvent { id, state });
    }
}

pub fn set(app: &AppHandle, map: HashMap<String, String>) -> SetResult {
    let gs = app.global_shortcut();
    let hotkeys = app.state::<Hotkeys>();
    let mut inner = hotkeys.inner.lock().unwrap();

    // desired: shortcut id -> (shortcut, sound id); first owner wins on duplicates
    let mut desired: HashMap<u32, (Shortcut, String)> = HashMap::new();
    let mut failed = Vec::new();
    let mut ids: Vec<_> = map.into_iter().collect();
    ids.sort();
    for (sound_id, acc) in ids {
        if acc.is_empty() {
            continue;
        }
        match parse(&acc) {
            Some(sc) => {
                desired.entry(sc.id()).or_insert((sc, sound_id));
            }
            None => failed.push(sound_id),
        }
    }

    let current: HashSet<u32> = inner.active.keys().copied().collect();
    let wanted: HashSet<u32> = desired.keys().copied().collect();

    for gone in current.difference(&wanted) {
        if let Some((sc, _)) = inner.active.remove(gone) {
            let _ = gs.unregister(sc);
        }
    }
    for (sid, (sc, sound_id)) in desired {
        if let Some(entry) = inner.active.get_mut(&sid) {
            entry.1 = sound_id; // same keys, maybe a different sound now
            continue;
        }
        match gs.register(sc) {
            Ok(()) => {
                inner.active.insert(sid, (sc, sound_id));
            }
            Err(_) => failed.push(sound_id),
        }
    }
    SetResult { failed }
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn parses_frontend_accelerators() {
        for acc in ["Ctrl+A", "Ctrl+Alt+Shift+F13", "Numpad1", "NumpadAdd", "NumpadSubtract", "NumpadMultiply", "NumpadDivide", "NumpadDecimal", "NumpadEnter", "Shift+1", "Alt+Space", "Ctrl+Up", "Super+Escape", "F24", "Ctrl+-", "Ctrl+="] {
            assert!(parse(acc).is_some(), "failed to parse {acc}");
        }
    }

    #[test]
    fn same_combo_same_id() {
        assert_eq!(parse("Ctrl+Shift+A").unwrap().id(), parse("Shift+Ctrl+A").unwrap().id());
    }
}
