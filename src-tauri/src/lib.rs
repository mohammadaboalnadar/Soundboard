mod hotkeys;
mod settings;

use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "wav", "ogg", "oga", "opus", "flac", "m4a", "aac", "webm"];

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
    for p in paths {
        let _ = scope.allow_file(Path::new(p));
    }
}

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
    let audio: Vec<String> = paths
        .into_iter()
        .filter(|p| {
            Path::new(p)
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| AUDIO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
                .unwrap_or(false)
        })
        .collect();
    allow(&app, &audio);
}

#[tauri::command]
fn check_paths(paths: Vec<String>) -> Vec<bool> {
    paths.iter().map(|p| Path::new(p).is_file()).collect()
}

#[tauri::command]
fn set_hotkeys(app: AppHandle, map: HashMap<String, String>) -> hotkeys::SetResult {
    hotkeys::set(&app, map)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // A second launch focuses the running window instead of starting another
        // copy that would fight over the global hotkeys.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .manage(hotkeys::Hotkeys::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| hotkeys::handle(app, shortcut, event))
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            settings_get,
            settings_save,
            pick_audio_files,
            allow_paths,
            check_paths,
            set_hotkeys
        ])
        .run(tauri::generate_context!())
        .expect("error while running Soundboard");
}
