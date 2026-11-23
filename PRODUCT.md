# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (desktop app: Tauri 2 shell on Windows WebView2; UI is plain HTML/CSS/ES modules)

## Users

Streamers and people in Discord or game voice chat. They fire short clips mid-game or mid-stream, usually from global hotkeys while another app has focus, and set the board up between sessions.

## Product Purpose

Sonic Dominion plays sound clips instantly to two outputs at once, your headphones (monitor) and a virtual audio cable that feeds Discord, OBS or a game. Success is a clip firing with no perceptible delay from any app, with nothing to think about during a match.

## Positioning

Every feature people buy Soundpad or Voicemod for, in the lightest soundboard there is. A Rust core on the system WebView keeps memory and install size far below Electron-based or bundled-runtime boards. It's meant to feel like a hardware sampler: pads, LEDs, banks, numpad slots.

## Operating Context

- Used alongside a full-screen game or streaming software, so hotkeys matter more than the window.
- Typical routing: Monitor = headphones; Cable = VB-Audio Cable (or similar) selected as the microphone in Discord/OBS.
- Setup happens in the window: importing clips, trimming, assigning keys, organizing banks.
- Phone remote is used from the same Wi-Fi network.

## Capabilities and Constraints

- Dual output (monitor + cable) with separate devices, levels and meters; optional mic-to-cable passthrough.
- Global hotkeys including numpad, press and release; play modes restart / overlap / toggle / loop / hold.
- Banks (boards) with Numpad 1–9 slot keys and bank switching.
- Trim, fades, gain (−30 to +6 dB), auto-level, speed/pitch per clip.
- Recorder (mic to new pad), tray, start with Windows, compact always-on-top mode.
- Auto push-to-talk: holds the user's voice-app PTT key while a clip plays to the cable.
- Phone remote over LAN, off by default, protected by a PIN.
- Memory is a first-class constraint: bounded decoded-audio cache, streaming for long clips, no GPU process, no idle rendering.
- Settings from the earlier Electron "Soundboard" import automatically.

## Brand Commitments

- Name: **Sonic Dominion**.
- Tone confirmed by the user: precise pro-audio hardware. Dark, exact, restrained colour; power shows in details, not decoration.
