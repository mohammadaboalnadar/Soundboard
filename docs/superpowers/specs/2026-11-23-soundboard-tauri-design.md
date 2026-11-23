# Soundboard 2 — Tauri rewrite design

## Intent

A desktop soundboard for streamers and people on Discord. The one job: fire a sound
instantly, mid-game or mid-stream, to both your headphones and a virtual cable.
The rewrite must feel like a piece of audio hardware, look made (not generated),
and stay light on RAM.

## Goals

- Idle RAM far below Electron (target: < 80 MB total working set with ~50 short clips).
- Sample-accurate fades and trims, no polling timers on the audio path.
- Pad grid as the primary surface; everything reachable from the keyboard.
- Keep every existing feature: folders, trim, fades, per-sound volume, dual output
  (monitor + cable) with separate master levels, global hotkeys incl. numpad, stop-all
  hotkey, settings persistence, dark/light themes.

## Non-goals

- No cloud sync, accounts, sound store, or online browsing.
- No multi-track editing; the editor is trim + fades + gain only.
- No macOS/Linux packaging work (code stays portable, but only Windows is verified).

## Anti-goals (failure even if it works)

- Glass panels, purple gradients, glowing cards, emoji icons, bouncy motion.
- Any audio latency the user can feel between hotkey and sound.
- Memory that grows without bound as sounds are played.

## Approaches considered

1. **Tauri v2 + vanilla ES modules (picked by the user).** System WebView2, Rust core
   for settings, dialogs, global shortcuts, file-scope. ~5 MB installer, lowest RAM.
2. Electron, optimised. No new toolchain, but a 120–180 MB floor.
3. Tauri + a UI framework (Svelte/Preact). Nicer components, but a build step and more
   JS heap for an app with ~6 views. Rejected: vanilla modules are enough.

## Architecture

```
src-tauri/ (Rust)
  settings.rs   load/save JSON in app-data dir, atomic write (tmp + rename)
  hotkeys.rs    diff-based registration; emits `hotkey` {id, state: down|up}
  lib.rs        commands: settings_get, settings_save, pick_audio_files,
                allow_paths (asset-protocol scope), set_hotkeys
src/ (frontend, no bundler, withGlobalTauri)
  index.html, styles/tokens.css, styles/app.css, fonts/ (Geist + Geist Mono, local woff2)
  js/
    app.js        bootstrap + wiring
    store.js      state, debounced persistence (400 ms), undo for delete
    engine.js     audio engine
    peaks.js      waveform peak + loudness analysis
    ui/pads.js    pad grid + list view
    ui/inspector.js  waveform editor, fades, gain, mode, hotkey, colour
    ui/palette.js    Ctrl+K command palette
    ui/rail.js       boards (folders) rail + search
    ui/transport.js  outputs, meters, stop-all, mic
    keys.js       accelerator capture/format (Tauri accelerator syntax)
    platform.js   thin wrapper over window.__TAURI__ with a browser mock for UI dev
```

### Audio engine

- Two `AudioContext`s: **monitor** (default sink) and **cable** (`AudioContext.setSinkId`).
  Each: voice → master `GainNode` → `AnalyserNode` (meter) → destination.
- **Decode once, keep only the trimmed segment.** A file is fetched through the asset
  protocol, decoded, its peaks/loudness computed, then the trimmed range is copied into
  a fresh `AudioBuffer` and the full decode is dropped. One `AudioBuffer` feeds both
  contexts.
- **LRU cache with a byte budget** (default 64 MB, setting). Evicts least-recently-played
  segments; currently-playing ones are pinned. Status bar shows usage.
- **Long clips stream.** If a segment would exceed 12 MB decoded, it plays through
  `<audio>` elements + `MediaElementAudioSourceNode` instead of being cached.
- Fades: `linearRampToValueAtTime` on a per-voice gain. Stop = cancel + ramp to 0 over
  max(40 ms, fadeOut), then `stop()`. No `setInterval` anywhere in audio.
- Play modes per sound: `restart` (default), `overlap`, `toggle`, `loop`, `hold`
  (hotkey down plays, up stops — Rust plugin reports press/release).
- Auto-level (per sound, opt-in): gain to reach −16 dBFS RMS, capped so peak ≤ −1 dBFS.
- Contexts suspend after 30 s idle and resume on play.
- Mic passthrough (off by default): `getUserMedia` on a chosen input → gain → cable only.
  Only requested when the user turns it on.

### Persistence

`settings.json` v2: `{version:2, theme, view, outputs:{monitorId, cableId, monitorVol,
cableVol}, mic:{enabled, deviceId, gain}, cacheMB, stopAllKey, folders[], sounds[]}`.
Sound: `{id, path, name, folderId, color, start, end, duration, gain, fadeIn, fadeOut,
mode, autoLevel, normGain, key, peaks (base64 u8, 256 points)}`.
v1 files (old Electron app) are migrated on load: `filePath→path, displayName→name,
volume→gain, keybind→key, outputDeviceId→outputs.cableId`, numpad `num1→Numpad1`.

## Visual direction (Hallmark)

- Genre: atmospheric, tone: **technical** — "a hardware sampler on your desk".
- Custom-free catalog read: dark warm graphite paper, single signal-amber accent,
  Geist (UI) + Geist Mono (numbers, hotkeys, times). Tabular numerals everywhere.
- Layout: top transport strip · left boards rail · centre pad grid · right inspector.
  Pads are flat raised keys (one elevation step, no glow), a 3 px colour "LED" strip on
  the left edge, hotkey in mono top-right, a progress bar along the bottom edge
  (`transform: scaleX`). Playing pads get the accent outline; nothing pulses forever.
- Pad colours are user content: 8 low-chroma hues, used only on the LED strip and the
  waveform, never as fills.
- Motion: 120/220 ms, three named easings, transform/opacity only, reduced-motion respected.
- Light theme is a second token set with the same hue anchor.

## Left to the builder

Exact spacing values, icon drawing (inline SVG, one stroke set), copy for empty states,
how the inspector collapses at narrow widths.
