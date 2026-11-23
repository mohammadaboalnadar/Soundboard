//! Settings file I/O. The frontend owns the schema (and migration from the
//! Electron v1 file); this side only reads, writes atomically, and lists the
//! audio paths that the asset protocol must be allowed to serve.

use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub const FILE_NAME: &str = "settings.json";

/// Read `primary` if it exists, otherwise fall back to `legacy` (the old Electron
/// settings file). Returns `Value::Null` when neither is readable JSON.
pub fn load(primary: &Path, legacy: Option<&Path>) -> Value {
    if let Some(v) = read_json(primary) {
        return v;
    }
    if let Some(path) = legacy {
        if let Some(v) = read_json(path) {
            return v;
        }
    }
    Value::Null
}

fn read_json(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Write via a temp file in the same directory and rename over the target, so a
/// crash mid-write never leaves a truncated settings file.
pub fn save_atomic(path: &Path, value: &Value) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp: PathBuf = path.with_extension("json.tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(serde_json::to_string_pretty(value)?.as_bytes())?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path)
}

/// Every sound path mentioned in a v2 (`path`) or v1 (`filePath`) settings value.
pub fn sound_paths(value: &Value) -> Vec<String> {
    value
        .get("sounds")
        .and_then(Value::as_array)
        .map(|sounds| {
            sounds
                .iter()
                .filter_map(|s| s.get("path").or_else(|| s.get("filePath")))
                .filter_map(Value::as_str)
                .filter(|p| !p.is_empty())
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn save_then_load_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join(FILE_NAME);
        let v = json!({"version": 2, "sounds": [{"path": "C:/a.wav"}]});
        save_atomic(&path, &v).unwrap();
        assert_eq!(load(&path, None), v);
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn falls_back_to_legacy_then_null() {
        let dir = tempfile::tempdir().unwrap();
        let primary = dir.path().join("v2.json");
        let legacy = dir.path().join("v1.json");
        assert_eq!(load(&primary, Some(&legacy)), Value::Null);
        fs::write(&legacy, r#"{"sounds":[{"filePath":"D:/old.mp3"}]}"#).unwrap();
        let v = load(&primary, Some(&legacy));
        assert_eq!(sound_paths(&v), vec!["D:/old.mp3".to_string()]);
    }

    #[test]
    fn corrupt_primary_falls_back() {
        let dir = tempfile::tempdir().unwrap();
        let primary = dir.path().join("v2.json");
        fs::write(&primary, "{not json").unwrap();
        assert_eq!(load(&primary, None), Value::Null);
    }

    #[test]
    fn sound_paths_skips_empty_and_missing() {
        let v = json!({"sounds": [{"path": ""}, {"name": "x"}, {"path": "C:/b.ogg"}]});
        assert_eq!(sound_paths(&v), vec!["C:/b.ogg".to_string()]);
        assert!(sound_paths(&Value::Null).is_empty());
    }
}
