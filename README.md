# Soundboard

A small, fast desktop soundboard for streaming and voice chat. Fire clips from global hotkeys while you're in a game, and send them to your headphones and a virtual audio cable at the same time.

Built with [Tauri 2](https://tauri.app) and the Web Audio API. It runs on the WebView2 that ships with Windows instead of bundling Chromium, so it starts quickly and stays light on memory.

## Features

- **Pad grid or list.** Each pad shows its hotkey, its length and play mode, plus a progress bar while it plays. Three pad sizes.
- **Two outputs.** *Monitor* (your headphones) and *Cable* (for example VB-Audio Cable into Discord or OBS), each with its own device, level and meter.
- **Mic to cable.** Optionally mix your microphone into the cable output so your voice and the sounds share one input.
- **Global hotkeys**, including the numpad and press/release handling. A key that's already taken by another app is flagged on the pad.
- **Play modes per sound:** restart, overlap, toggle, loop, or hold (plays only while the key is down).
- **Editor:** drag the trim handles and fade handles on the waveform, or type exact values. Volume runs from −30 dB to +6 dB, with a limiter on each output.
- **Auto-level** matches loudness across clips (−16 dB RMS target, peaks kept under −1 dBFS).
- **Boards** (folders) with drag-and-drop for pads and boards.
- **Ctrl+K command palette**, search, drag files in from Explorer, and Undo for removals.
- Dark and light themes.

## Keyboard

| Key | Action |
| --- | --- |
| `Ctrl K` | Command palette (Enter plays, Alt+Enter selects) |
| `Ctrl F` | Search |
| `Ctrl O` | Add sounds |
| `Esc` | Stop everything (in the window) |
| `Delete` | Remove the selected sound (with Undo) |
| Arrow keys, `Enter` / `Space` | Move between pads and play the focused one |

## Memory

- The audio engine keeps only the **trimmed part** of each clip, decoded once, in a cache with a byte budget (64 MB by default). When the budget is full, the least recently played clips are dropped first. Clips that are playing are never dropped.
- Clips over about 12 MB decoded (roughly a minute of stereo audio) **stream** from disk instead of being cached.
- The cache is pre-warmed with the sounds that have hotkeys, so they fire instantly.
- Waveforms are stored as 256-byte summaries in the settings file, so no files are decoded at launch.
- Audio devices suspend after 30 seconds of silence, and the UI draws frames only while something is playing.

The status bar shows how full the cache is.

## Development

Prerequisites (Windows): [Rust](https://rustup.rs), the Visual Studio C++ Build Tools, and Node.js 18+.

```bash
npm install
npm run dev        # run the app with live reload of src/
npm run build      # release build + NSIS installer in src-tauri/target/release/bundle
npm test           # JS unit tests (keys, settings migration, cache, analysis)
npm run test:rust  # Rust unit tests (settings file, hotkey parsing)
npm run ui         # UI only, in a normal browser: http://localhost:5174/?demo
```

## Project layout

```
src/                 frontend (plain ES modules, no bundler)
  js/engine.js       audio engine: outputs, cache, fades, play modes
  js/model.js        settings schema + migration from the old Electron version
  js/store.js        state + debounced saving
  js/keys.js         hotkey capture and formatting
  js/ui/*.js         transport, rail, pads, inspector, palette
  styles/tokens.css  colour, type, spacing, motion tokens
src-tauri/           Rust: settings file, file dialog, asset scope, global hotkeys
tests/               node --test suites
```

Settings from the previous Electron version (`%APPDATA%\soundboard-app\settings.json`) are imported automatically on first launch.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. Schibsted Grotesk and Martian Mono are under the SIL Open Font License (`src/fonts/OFL-*.txt`).
