mod hotkeys;
mod ptt;
mod remote;
mod settings;

use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, Size, WindowEvent};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_dialog::DialogExt;

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "wav", "ogg", "oga", "opus", "flac", "m4a", "aac", "webm"];
const COMPACT: (f64, f64) = (420.0, 640.0);
const NORMAL_MIN: (f64, f64) = (900.0, 600.0);

#[derive(Default)]
struct AppState {
    close_to_tray: AtomicBool,
    normal_size: Mutex<Option<LogicalSize<f64>>>,
    ptt: Mutex<ptt::Ptt>,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(settings::FILE_NAME))
}

/// Where the Electron build kept its settings (userData = %APPDATA%/soundboard-app).
fn legacy_settings_path(app: &AppHandle) -> Option<PathBuf> {
    let roaming = app.path().data_dir().ok()?;
    Some(roaming.join("soundboard-app").join(settings::FILE_NAME))
}

fn allow(app: &AppHandle, paths: &[String]) {
    let scope = app.asset_protocol_scope();
    for p in paths.iter().filter(|p| is_audio(p)) {
        let _ = scope.allow_file(Path::new(p));
    }
}

fn is_audio(p: &str) -> bool {
    Path::new(p)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn show_main(app: &AppHandle) {
    apply_memory_level(app, false);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// ---------- settings & files ----------

#[tauri::command]
fn settings_get(app: AppHandle) -> Result<Value, String> {
    let primary = settings_path(&app)?;
    let legacy = legacy_settings_path(&app);
    let value = settings::load(&primary, legacy.as_deref());
    allow(&app, &settings::sound_paths(&value));
    Ok(value)
}

#[tauri::command]
fn settings_save(app: AppHandle, settings: Value) -> Result<(), String> {
    allow(&app, &settings::sound_paths(&settings));
    let path = settings_path(&app)?;
    settings::save_atomic(&path, &settings).map_err(|e| e.to_string())
}

#[tauri::command]
async fn pick_audio_files(app: AppHandle) -> Result<Vec<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Add sounds")
        .add_filter("Audio", AUDIO_EXTENSIONS)
        .blocking_pick_files();
    let paths: Vec<String> = picked
        .unwrap_or_default()
        .into_iter()
        .filter_map(|f| f.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    allow(&app, &paths);
    Ok(paths)
}

/// Paths dropped onto the window arrive via the webview event, so the frontend
/// asks for them to be served explicitly. Only audio files are allowed.
#[tauri::command]
fn allow_paths(app: AppHandle, paths: Vec<String>) {
    let audio: Vec<String> = paths.into_iter().filter(|p| is_audio(p)).collect();
    allow(&app, &audio);
}

#[tauri::command]
fn check_paths(paths: Vec<String>) -> Vec<bool> {
    paths.iter().map(|p| Path::new(p).is_file()).collect()
}

/// Store a mic recording (raw WebM/Opus bytes in the request body) under
/// %APPDATA%/<app>/recordings and return its path.
#[tauri::command]
fn save_recording(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw audio bytes".into());
    };
    if bytes.is_empty() || bytes.len() > 64 * 1024 * 1024 {
        return Err("Recording is empty or too large".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("recordings");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default();
    let path = dir.join(format!("recording-{stamp}.webm"));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    let s = path.to_string_lossy().into_owned();
    allow(&app, std::slice::from_ref(&s));
    Ok(s)
}

// ---------- hotkeys & push-to-talk ----------

#[tauri::command]
fn set_hotkeys(app: AppHandle, map: HashMap<String, String>) -> hotkeys::SetResult {
    hotkeys::set(&app, map)
}

#[tauri::command]
fn ptt_configure(state: tauri::State<'_, AppState>, key: String) -> Result<(), String> {
    let parsed = if key.is_empty() { None } else { Some(ptt::parse(&key).ok_or("That key can't be pressed automatically")?) };
    let held = state.ptt.lock().unwrap().configure(parsed);
    match held {
        Some(keys) => ptt::send(&keys, false),
        None => Ok(()),
    }
}

#[tauri::command]
fn ptt_set(state: tauri::State<'_, AppState>, down: bool) -> Result<(), String> {
    let step = state.ptt.lock().unwrap().set(down);
    match step {
        Some((keys, d)) => ptt::send(&keys, d),
        None => Ok(()),
    }
}

fn release_ptt(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Some(keys) = state.ptt.lock().unwrap().release_all() {
            let _ = ptt::send(&keys, false);
        }
    }
}

// ---------- window, tray, startup ----------

#[tauri::command]
fn set_compact(app: AppHandle, state: tauri::State<'_, AppState>, on: bool) -> Result<(), String> {
    let w = app.get_webview_window("main").ok_or("no window")?;
    let scale = w.scale_factor().map_err(|e| e.to_string())?;
    if on {
        if let Ok(size) = w.inner_size() {
            *state.normal_size.lock().unwrap() = Some(size.to_logical(scale));
        }
        w.set_min_size(Some(Size::Logical(LogicalSize::new(360.0, 420.0)))).map_err(|e| e.to_string())?;
        w.set_size(Size::Logical(LogicalSize::new(COMPACT.0, COMPACT.1))).map_err(|e| e.to_string())?;
        w.set_always_on_top(true).map_err(|e| e.to_string())?;
    } else {
        w.set_always_on_top(false).map_err(|e| e.to_string())?;
        w.set_min_size(Some(Size::Logical(LogicalSize::new(NORMAL_MIN.0, NORMAL_MIN.1)))).map_err(|e| e.to_string())?;
        let restore = state.normal_size.lock().unwrap().take().unwrap_or(LogicalSize::new(1240.0, 780.0));
        w.set_size(Size::Logical(restore)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// While the window is hidden or minimized, ask WebView2 to drop caches and
/// shrink to a low memory target; audio and hotkeys keep working.
#[tauri::command]
fn set_memory_low(app: AppHandle, low: bool) {
    apply_memory_level(&app, low);
}

fn apply_memory_level(app: &AppHandle, low: bool) {
    #[cfg(windows)]
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.with_webview(move |wv| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::{
                ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
            };
            use windows_core::Interface;
            if let Ok(core) = wv.controller().CoreWebView2() {
                if let Ok(core19) = core.cast::<ICoreWebView2_19>() {
                    let level = if low { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW } else { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL };
                    let _ = core19.SetMemoryUsageTargetLevel(level);
                }
            }
        });
    }
    #[cfg(not(windows))]
    let _ = (app, low);
}

#[tauri::command]
fn set_close_to_tray(state: tauri::State<'_, AppState>, on: bool) {
    state.close_to_tray.store(on, Ordering::Relaxed);
}

#[tauri::command]
fn autostart_get(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn autostart_set(app: AppHandle, on: bool) -> Result<bool, String> {
    let al = app.autolaunch();
    if on { al.enable() } else { al.disable() }.map_err(|e| e.to_string())?;
    Ok(al.is_enabled().unwrap_or(false))
}

// ---------- phone remote ----------

#[tauri::command(async)]
fn remote_start(app: AppHandle, remote: tauri::State<'_, remote::Remote>, port: u16, pin: String) -> Result<remote::RemoteInfo, String> {
    remote.start(app.clone(), port, pin)
}

#[tauri::command(async)]
fn remote_stop(remote: tauri::State<'_, remote::Remote>) {
    remote.stop();
}

#[tauri::command]
fn remote_sync(remote: tauri::State<'_, remote::Remote>, snapshot: String) {
    remote.set_snapshot(snapshot);
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Sonic Dominion", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "Stop all sounds", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &stop, &PredefinedMenuItem::separator(app)?, &quit])?;
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Sonic Dominion")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "stop" => {
                let _ = app.emit("tray", "stop-all");
            }
            "quit" => {
                release_ptt(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // A second launch focuses the running window instead of starting another
        // copy that would fight over the global hotkeys.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .manage(hotkeys::Hotkeys::default())
        .manage(remote::Remote::default())
        .manage(AppState { close_to_tray: AtomicBool::new(true), ..Default::default() })
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| hotkeys::handle(app, shortcut, event))
                .build(),
        )
        .setup(|app| {
            build_tray(app)?;
            if std::env::args().any(|a| a == "--minimized") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
                apply_memory_level(app.handle(), true);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if state.close_to_tray.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                    apply_memory_level(window.app_handle(), true);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            settings_get,
            settings_save,
            pick_audio_files,
            allow_paths,
            check_paths,
            save_recording,
            set_hotkeys,
            ptt_configure,
            ptt_set,
            set_compact,
            set_close_to_tray,
            set_memory_low,
            autostart_get,
            autostart_set,
            remote_start,
            remote_stop,
            remote_sync
        ])
        .build(tauri::generate_context!())
        .expect("error while building Sonic Dominion")
        .run(|app, event| {
            // Never leave the voice app's push-to-talk key held down after we go away.
            if let tauri::RunEvent::Exit = event {
                release_ptt(app);
                if let Some(r) = app.try_state::<remote::Remote>() {
                    r.stop();
                }
            }
        });
}
