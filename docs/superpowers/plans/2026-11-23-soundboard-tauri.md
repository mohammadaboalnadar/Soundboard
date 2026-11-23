# Soundboard 2 (Tauri) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Electron soundboard with a Tauri v2 app: Web Audio engine with a bounded cache, pad-grid UI in a technical/hardware visual language.

**Architecture:** Rust core owns settings I/O, file dialog, asset-protocol scope and global shortcuts. The frontend is plain ES modules served from `src/` (no bundler) using `window.__TAURI__`. Pure logic (keys, migration, cache, peaks) is in DOM-free modules tested with `node --test`.

**Tech Stack:** Tauri 2, tauri-plugin-dialog, tauri-plugin-global-shortcut, serde_json; vanilla JS (ES2022), Web Audio API; Geist / Geist Mono (local woff2).

**Spec:** `docs/superpowers/specs/2026-11-23-soundboard-tauri-design.md`

## Global Constraints

- No `setInterval` on the audio path; fades via `AudioParam` ramps.
- Decoded cache default budget 64 MB; segments > 12 MB decoded stream via `<audio>`.
- Persist debounce 400 ms; settings written atomically (tmp + rename).
- Hotkeys registered by diff; events `hotkey` `{id, state: "down"|"up"}`; stop-all id `"__stop_all__"`.
- Colours only via tokens in `src/styles/tokens.css` (OKLCH). Fonts bundled locally.
- Motion: transform/opacity only, durations 120/220/420 ms, `prefers-reduced-motion` honoured.
- Electron files (`main.js`, `preload.js`, `renderer/`) removed only after the Tauri app reaches parity.

## Review Focus

- A sound file moved/deleted since last launch → pad shows "missing" state, never crashes the board; test in Task 2 (`resolveSound` marks missing) and Task 5 (UI state).
- Old Electron `settings.json` found → migrated without losing sounds/keys; test in Task 2 (`migrateV1`).
- Same hotkey assigned to two sounds → second assignment steals it, first is cleared; test in Task 1 (`assignKey`).
- Cache over budget while all entries are playing → no eviction of pinned voices, budget allowed to overshoot temporarily; test in Task 3 (`LruCache` pinned).
- Cable device unplugged → falls back to default sink and shows the output as offline; handled in Task 4 `engine.setCableDevice` catch path.

---

### Task 1: Key accelerators (`src/js/keys.js`)

**Interfaces — Produces:**
- `acceleratorFromEvent(e: KeyboardEvent-like) -> string` — Tauri syntax, modifiers ordered `Ctrl+Alt+Shift+Super`, numpad as `Numpad0..9`, `NumpadAdd`, `NumpadSubtract`, `NumpadMultiply`, `NumpadDivide`, `NumpadDecimal`, `NumpadEnter`; returns `""` for bare modifiers.
- `formatKey(acc: string) -> string` — short label (`Ctrl+Shift+A` → `⌃⇧A`, `Numpad1` → `Num1`).
- `assignKey(sounds, soundId, acc) -> sounds` — clears `acc` on any other sound.
- `fromLegacyKey(acc) -> string` — `Control→Ctrl`, `num1→Numpad1`, `numadd→NumpadAdd`, etc.

- [ ] Write `tests/keys.test.mjs` with cases: `{key:"a",code:"KeyA",ctrlKey:true}` → `"Ctrl+A"`; `{key:"1",code:"Numpad1"}` → `"Numpad1"`; `{key:"Shift",code:"ShiftLeft",shiftKey:true}` → `""`; `fromLegacyKey("Control+num5")` → `"Ctrl+Numpad5"`; `assignKey` steals duplicate.
- [ ] Run `node --test tests/` → FAIL. Implement. Run → PASS. Commit.

### Task 2: Store + migration (`src/js/store.js`, `src/js/model.js`)

**Interfaces — Produces:**
- `model.js`: `defaultSettings()`, `migrateV1(raw) -> SettingsV2`, `normalizeSettings(raw) -> SettingsV2`, `newSound(path, duration) -> Sound`, `PAD_COLORS` (8 names: `amber, ember, rose, violet, azure, teal, moss, sand`), `PLAY_MODES` (`restart, overlap, toggle, loop, hold`).
- `store.js`: `createStore(platform) -> { state, load(), update(fn), subscribe(fn), flush() }` — `update` mutates then schedules save in 400 ms.
- [ ] Tests `tests/model.test.mjs`: v1 sample from the old `main.js` shape migrates (`filePath→path`, `volume→gain`, `keybind→key` via `fromLegacyKey`, `outputDeviceId→outputs.cableId`, `localVolume→outputs.monitorVol`, `soundboardVolume→outputs.cableVol`); unknown folderId → `""`; `end<=start` repaired; fades clamped to segment.
- [ ] FAIL → implement → PASS → commit.

### Task 3: Analysis + cache (`src/js/peaks.js`, `src/js/cache.js`)

**Interfaces — Produces:**
- `computePeaks(channels: Float32Array[], points=256) -> Uint8Array`; `encodePeaks(u8)->base64`, `decodePeaks(b64)->Uint8Array`.
- `measureLoudness(channels) -> {rmsDb, peakDb}`; `autoLevelGain({rmsDb, peakDb}, target=-16, ceiling=-1) -> linear gain`.
- `class LruCache(budgetBytes)`: `get(key)`, `set(key, value, bytes)`, `pin(key)`, `unpin(key)`, `usedBytes`, `setBudget(bytes)`; evicts oldest unpinned until ≤ budget.
- [ ] Tests: peaks length 256 and max 255 for a full-scale sine; `autoLevelGain({rmsDb:-30,peakDb:-6})` → gain such that peak ≤ −1 dB (≈ 1.778); LRU evicts oldest, skips pinned, overshoots when all pinned.
- [ ] FAIL → implement → PASS → commit.

### Task 4: Audio engine (`src/js/engine.js`)

**Interfaces — Consumes:** `LruCache`, `computePeaks`, `measureLoudness`, `autoLevelGain`, `platform.fileUrl(path)`.
**Produces:** `createEngine({cacheMB}) -> { analyze(sound) -> {duration, peaks, rmsDb, peakDb}, trigger(sound, {fromKey, state}), stop(id, {fade}), stopAll(), isPlaying(id), progress(id) -> 0..1|null, setOutputs({monitorId, cableId, monitorVol, cableVol}), setMic({enabled, deviceId, gain}), meters() -> {monitor, cable}, stats() -> {cacheBytes, budget, voices}, invalidate(id), on(evt, fn) }` — events `voicestart`, `voiceend`, `error`.
- Segment buffer copied with `ctx.createBuffer` + `copyToChannel`; full decode dropped.
- Mode semantics: `restart` stops existing voices of the id; `toggle` and `loop` stop if playing; `hold` starts on `down`, stops on `up`.
- Verified manually in Task 7 (Web Audio has no node runtime here).
- [ ] Implement; commit.

### Task 5: UI shell + tokens (`src/index.html`, `src/styles/*.css`, `src/js/ui/*.js`, `src/js/app.js`, `src/js/platform.js`)

- `platform.js`: real Tauri bridge when `window.__TAURI__` exists; otherwise a browser mock (in-memory settings, `pickAudioFiles` via `<input type=file>` object URLs) so the UI runs in a plain browser for design checks.
- Views: transport (outputs with device select + fader + meter for Monitor and Cable, Stop all + key, mic toggle), rail (All sounds, folders with counts, new folder, search), pads (grid/list toggle, drag reorder & into folder, context menu), inspector (name, waveform canvas with trim handles + fade handles, gain, mode segmented control, auto-level, colour swatches, hotkey capture), palette (Ctrl+K), status bar (cache used/budget, voices).
- Keyboard: `Space` play selected, `Esc` stop all (in-window), `Ctrl+K` palette, `Ctrl+F` search, `Delete` remove with Undo toast.
- [ ] Build, open in browser pane via a static server, screenshot at 1280×800 and 960×640, both themes. Commit.

### Task 6: Rust core (`src-tauri/**`, `package.json`)

**Produces commands:** `settings_get() -> Value` (v2, migrating `%APPDATA%/soundboard-app/settings.json` from Electron if no v2 file), `settings_save(value)`, `pick_audio_files() -> Vec<String>`, `allow_paths(paths)`, `set_hotkeys(map: {id: accelerator})` → returns `{failed: [id]}`; event `hotkey`.
- `tauri.conf.json`: `withGlobalTauri: true`, `frontendDist: "../src"`, asset protocol enabled with empty static scope (paths added at runtime), CSP restricted to `self asset: http://asset.localhost blob: data:`.
- [ ] `cargo test` for settings atomic write round-trip; `npm run tauri build -- --debug` compiles. Commit.

### Task 7: Verify + clean up

- [ ] Run the built app; play sounds to both outputs; check hotkeys (incl. hold mode); measure working set of `Soundboard.exe` + `msedgewebview2.exe` children with ~20 clips loaded.
- [ ] Remove Electron files, update README (features, build, memory notes), `.gitignore` (`src-tauri/target`). Commit.
