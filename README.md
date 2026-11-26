<p align="center"><img src="src-tauri/icons/128x128@2x.png" width="128" alt="Sonic Dominion logo"></p>

<h1 align="center">Sonic Dominion</h1>

<p align="center"><b>The free, tiny soundboard for Discord, games and streaming.</b><br>Built in Rust. A 2 MB installer, about 10 MB for the app itself.</p>

<p align="center">
  <a href="https://github.com/Shalby-Industries/sonic-dominion/releases/latest"><img src="https://img.shields.io/github/v/release/Shalby-Industries/sonic-dominion?style=for-the-badge&label=Download&color=e5322d" alt="Download the latest release"></a>
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-1b1b1f?style=for-the-badge&logo=windows" alt="Windows 10 and 11">
  <img src="https://img.shields.io/badge/Rust-Tauri%202-1b1b1f?style=for-the-badge&logo=rust" alt="Rust and Tauri 2">
  <img src="https://img.shields.io/badge/License-MIT-1b1b1f?style=for-the-badge" alt="MIT license">
  <a href="https://ko-fi.com/omarshalby"><img src="https://img.shields.io/badge/Support%20us%20on-Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Support us on Ko-fi"></a>
</p>

<p align="center"><img src="docs/media/demo.gif" width="900" alt="Sonic Dominion playing pads, switching banks, trimming a sound and finding one with Ctrl K"></p>

Fire sounds from global hotkeys or your mouse side buttons while you're in a game, and send them to your headphones and into Discord at the same time. Missed the moment? **Clip that** turns the last seconds of what you just heard into a pad with one key.

The core is Rust ([Tauri 2](https://tauri.app)) running on the WebView2 that ships with Windows, with audio on the Web Audio API. There's no bundled browser and no GPU process, and the decoded-audio cache has a fixed budget.

## Download

Get **Sonic Dominion_x.y.z_x64-setup.exe** from the [latest release](https://github.com/Shalby-Industries/sonic-dominion/releases/latest) and run it. It installs for your user only (no admin prompt) and updates itself after that.

To play sounds into Discord you need a virtual cable such as the free [VB-CABLE](https://vb-audio.com/Cable/). The built-in **Voice chat setup** finds it, tests it and tells you what to set in Discord.

<table>
  <tr>
    <td align="center" width="50%"><img src="docs/media/setup-test.png" width="420" alt="Voice chat setup testing the virtual cable and showing PASS"><br><sub>Voice chat setup tests the cable for you</sub></td>
    <td align="center" width="50%"><img src="docs/media/phone-remote.png" width="220" alt="Phone remote showing banks and pads"><br><sub>Phone remote over Wi-Fi, with a PIN</sub></td>
  </tr>
</table>

## Features

**Playing**
- Pad grid or list, in three pad sizes. Each pad shows its hotkey, its slot, its length and play mode, plus a progress bar while it plays.
- Play modes per sound: restart, overlap, toggle, loop, or hold (plays only while the key is down).
- **Banks with Numpad slots:** Num 1–9 play the first nine pads of the active bank, and Num + / Num − switch banks, like a hardware sampler.
- Global hotkeys from any app, including numpad and key release. If a hotkey is taken, the pad shows it.
- **Mouse side buttons:** Mouse 4 and Mouse 5 work as hotkeys, alone, together, or with Ctrl, Alt, Shift or Win.
- **Clip that:** keeps the last 10–60 seconds of what plays on your speakers or headphones. One key saves it as a new pad, ready to trim and replay. Off by default; about 5.5 MB while on.
- A now-playing strip where you can stop each voice on its own, plus Stop all (hotkey, tray, or Esc in the window).

**Routing**
- Two outputs, *Monitor* (headphones) and *Cable* (for example VB-CABLE into Discord or OBS), each with its own device, level, meter and limiter.
- Mic to cable, with optional ducking so clips cut through your voice.
- **Auto push-to-talk:** holds your Discord PTT key (or Mouse 4/5) while a clip plays into the cable, with an adjustable lead-in.
- **Voice chat setup:** a four-step guide finds your virtual cable, picks your microphone, plays a test tone through the cable and shows what to set in Discord.

**Editing**
- Waveform trim and fade handles, or exact values.
- Volume −30 to +6 dB, auto-level (−16 dB RMS, peaks under −1 dBFS), and speed/pitch from 0.5× to 2×.
- **Recorder:** record from your mic straight into a new pad (Ctrl R).
- Favorites, Recent, search, the Ctrl K command palette, drag and drop from Explorer, and Undo.

**Control**
- **Phone remote:** play pads from your phone on the same Wi-Fi. It's off by default and protected by a 6-digit PIN.
- Tray icon, close to tray, start with Windows (starts hidden), and only one instance runs at a time.
- Compact mode: a small always-on-top window showing the active bank.
- Dark and light themes.

## Keyboard

| Key | Action |
| --- | --- |
| `Ctrl K` | Command palette (Enter plays, Alt+Enter selects) |
| `Ctrl F` | Search |
| `Ctrl O` | Add sounds |
| `Ctrl R` | Record from mic |
| `Ctrl ,` | Settings |
| `Esc` | Stop everything (in the window) |
| `Delete` | Remove the selected sound (with Undo) |
| `Num 1–9`, `Num +/−` | Slots and bank switching (when Numpad slots are on) |

## Memory

Measured on Windows 11 with 20 clips loaded: about **150 MB private memory** for the whole process tree (app + WebView2). Most of that is the WebView2 runtime itself; the app process is about 10 MB.

- The engine keeps only the **trimmed part** of each clip, decoded once, in an LRU cache with a byte budget (64 MB by default, adjustable in Settings). Clips that are playing are never evicted.
- Clips over about 12 MB decoded (roughly a minute of stereo audio) **stream** from disk instead.
- Only clips likely to fire are pre-warmed: those with hotkeys and the active bank's slots.
- Waveforms are stored as 256-byte summaries, so nothing is decoded at launch.
- GPU compositing is off (the UI is simple 2D), and frames are drawn only while something plays. Audio devices suspend after 30 s of silence.

## Development

Prerequisites (Windows): [Rust](https://rustup.rs), the Visual Studio C++ Build Tools, and Node.js 18+.

```bash
npm install
npm run dev        # run the app
npm run build      # release build + NSIS installer
npm test           # JS unit tests
npm run test:rust  # Rust unit tests
npm run ui         # UI only, in a browser with demo data: http://localhost:5174/?demo
```

## Releasing an update

Installed copies check GitHub Releases at startup and every 6 hours and offer new versions in a small card (Update now / Later). To ship one:

1. Bump `version` in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `package.json`, and push to `main`.
2. On GitHub, open **Actions → Release → Run workflow**, write what changed, and run it. It runs the tests, builds and signs the installer on a GitHub Windows machine, writes `latest.json` and publishes the release. Untick **Publish** for a test build: the installer is then only attached to the run.

The signing key lives in the repository secret `TAURI_SIGNING_PRIVATE_KEY`. To release from your own machine instead, run `npm run release -- --notes "What changed"` with the key at `~/.tauri/sonic-dominion.key`.

Every push and pull request also runs the JavaScript and Rust tests (**Actions → Tests**).

Keep the signing key safe and backed up: without it, installed copies cannot verify (and will refuse) future updates.

## Project layout

```
src/                 frontend (plain ES modules, no bundler)
  js/engine.js       audio engine: outputs, cache, fades, rate, ducking, play modes
  js/model.js        settings schema, banks/slots, migration from the old Electron version
  js/app.js          controller: hotkeys, push-to-talk, remote bridge, frame loop
  js/ui/*.js         transport, rail, pads, inspector, palette, status, settings, recorder
  styles/tokens.css  colour, type, spacing, motion tokens
src-tauri/           Rust: settings, dialogs, hotkeys, tray, autostart, push-to-talk, phone remote
  remote/index.html  the phone remote page
tests/               node --test suites
```

Settings from the earlier Electron "Soundboard" (`%APPDATA%\soundboard-app\settings.json`) are imported automatically on first launch.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Support

Sonic Dominion is free. If it saved your Discord call, you can buy us a coffee on [Ko-fi](https://ko-fi.com/omarshalby).

## License

MIT. Schibsted Grotesk and Martian Mono are under the SIL Open Font License (`src/fonts/OFL-*.txt`).
