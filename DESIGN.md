---
name: Sonic Dominion
description: A dual-output soundboard built like a hardware sampler on your desk.
colors:
  paper: "oklch(16% 0.008 60)"
  paper-2: "oklch(19.5% 0.009 60)"
  paper-3: "oklch(23% 0.010 60)"
  paper-4: "oklch(26.5% 0.011 60)"
  paper-5: "oklch(30% 0.012 60)"
  well: "oklch(13% 0.007 60)"
  rule: "oklch(28% 0.010 60)"
  rule-strong: "oklch(36% 0.011 60)"
  ink: "oklch(94% 0.007 80)"
  muted: "oklch(76% 0.008 70)"
  neutral: "oklch(62% 0.010 65)"
  faint: "oklch(55% 0.010 60)"
  accent: "oklch(77% 0.155 64)"
  accent-ink: "oklch(21% 0.030 60)"
  accent-soft: "oklch(77% 0.155 64 / 0.14)"
  focus: "oklch(82% 0.140 64)"
  danger: "oklch(68% 0.170 28)"
  danger-soft: "oklch(68% 0.170 28 / 0.14)"
  ok: "oklch(74% 0.120 150)"
  led-amber: "oklch(78% 0.14 72)"
  led-ember: "oklch(70% 0.15 42)"
  led-rose: "oklch(72% 0.13 8)"
  led-violet: "oklch(70% 0.12 300)"
  led-azure: "oklch(72% 0.11 245)"
  led-teal: "oklch(75% 0.10 190)"
  led-moss: "oklch(76% 0.12 135)"
  led-sand: "oklch(80% 0.06 85)"
typography:
  headline:
    fontFamily: "Schibsted Grotesk, Segoe UI Variable Text, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Schibsted Grotesk, Segoe UI Variable Text, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Schibsted Grotesk, Segoe UI Variable Text, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
  control:
    fontFamily: "Schibsted Grotesk, Segoe UI Variable Text, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "Schibsted Grotesk, Segoe UI Variable Text, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
  wordmark:
    fontFamily: "Schibsted Grotesk, Segoe UI Variable Text, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 800
    letterSpacing: "0.08em"
  data:
    fontFamily: "Martian Mono, Cascadia Mono, ui-monospace, monospace"
    fontSize: "0.92em"
    fontWeight: 400
    letterSpacing: "-0.01em"
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 87.5"
  keycap:
    fontFamily: "Martian Mono, Cascadia Mono, ui-monospace, monospace"
    fontSize: "0.625rem"
    fontWeight: 400
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 87.5"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
components:
  button:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "30px"
  button-hover:
    backgroundColor: "{colors.paper-4}"
  button-primary:
    backgroundColor: "{colors.paper-4}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "30px"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    height: "30px"
  field:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "28px"
  kbd:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.muted}"
    typography: "{typography.keycap}"
    rounded: "{rounded.sm}"
    padding: "0 5px"
    height: "18px"
  pad:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "76px"
  pad-hover:
    backgroundColor: "{colors.paper-4}"
  pad-pressed:
    backgroundColor: "{colors.paper-2}"
  rail-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "32px"
  rail-item-current:
    backgroundColor: "{colors.paper-4}"
    textColor: "{colors.ink}"
  chip:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 2px 0 8px"
    height: "24px"
  bank-key:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.muted}"
    typography: "{typography.keycap}"
    rounded: "{rounded.sm}"
    padding: "0 7px"
    height: "26px"
---

# Design System: Sonic Dominion

## Overview

**Creative North Star: "The Sampler on the Desk"**

Sonic Dominion is a piece of pro-audio hardware rendered in a window. Pads are physical keys with a status row on top (LED pip, numpad slot, length, keycap) and an engraved label at the bottom; banks carry hardware letters with their own LED; numbers, times and keys are set in a narrow monospace like silkscreen on a faceplate. The window is dense and exact, built for a person who sets the board up between sessions and then fires it blind from hotkeys while a game has focus.

The material is warm graphite: one hue (60) stepped in lightness, with 1px rules doing the structural work. Colour is restrained to a single signal amber that means "live" and nothing else, plus eight low-chroma LED hues that belong to the user's content. Power shows in details (key travel, LED states, tabular numerals, a meter under each fader), never in decoration. The generic card-grid dashboard is the explicit anti-reference.

**Key Characteristics:**
- Warm graphite surfaces, five elevation steps about 3.5% lightness apart.
- One amber accent, reserved for live and active state.
- Grotesk for the interface, narrow Martian Mono for data and keys only.
- 1px rules and tonal steps for structure; soft shadow only on floating overlays.
- Small, square-ish corners (4/6/10px); LEDs are 2px-radius squares.
- Pads behave like keys: a 2px travel on press.

## Colors

A single-hue warm graphite ramp with one signal amber and a user-owned set of LED colours.

### Primary
- **Signal Amber** (`accent`): the live signal. Wordmark LED while audio runs, playing pad outline and progress bar, active bank LED and letter, current rail icon, meter fill, checked switch, listening key-capture, favourite star, text selection and caret. Its tint (`accent-soft`) backs a checked switch and a drag-drop target. Text on amber uses `accent-ink`.
- **Focus Amber** (`focus`): a lighter amber used only for the 2px `:focus-visible` ring (offset 2px) and the focused field border.

### Neutral
- **Graphite Paper** (`paper`): the base canvas and the deck behind the pads.
- **Graphite 2 to 5** (`paper-2` to `paper-5`): elevation by lightness. `paper-2` is chrome (transport, rail, inspector, status strip, sheets); `paper-3` is raised objects (pads, buttons, chips, menus, palette); `paper-4` is hover and current; `paper-5` is pressed/selected inside menus, empty meter and fader tracks.
- **Well** (`well`): the recessed tone below the canvas. Inputs, segmented controls, the waveform and the pad's key-travel shadow.
- **Rule / Rule Strong** (`rule`, `rule-strong`): 1px dividers and control outlines. `rule` separates regions; `rule-strong` outlines interactive objects (buttons, keycaps, chips, overlays).
- **Ink, Muted, Neutral, Faint** (`ink` to `faint`): the four text levels. Ink for names and values; muted for idle controls; neutral for secondary copy and status; faint for counts, paths and group labels.

### Status
- **Signal Red** (`danger`, `danger-soft`): offline device, clipping meter, hotkey conflict keycap, missing file, recording bar, destructive hover. Never decorative.
- **Go Green** (`ok`): the push-to-talk / remote active dot in the status strip only.

### Pad LEDs (user content)
- **Amber, Ember, Rose, Violet, Azure, Teal, Moss, Sand** (`led-*`): eight low-chroma hues the user assigns per pad. They appear on the pad pip, the waveform, the palette row LED, the swatch picker and the status chip pip. Nowhere else.

A light theme (`data-theme="light"`) remaps the same roles onto warm paper (hue 75) with a deeper amber; role assignments do not change.

### Named Rules
**The One Signal Rule.** Amber means live or active. At rest, with nothing playing or focused, the only amber on screen is the active bank's LED and letter; the wordmark LED and meters light only while audio is running.

**The User's Colour Rule.** LED hues are the user's content, not the interface's palette. They never tint a surface, a border, a button or text.

**The Ink Primary Rule.** The primary action is ink, never amber: it rests outlined in `muted` on `paper-4` and fills with ink on hover.

## Typography

**Body Font:** Schibsted Grotesk (with Segoe UI Variable Text, system-ui)
**Label/Mono Font:** Martian Mono at 87.5% width (with Cascadia Mono, ui-monospace)

**Character:** A crisp contemporary grotesk carries every word of the interface; a condensed monospace appears only where a faceplate would carry silkscreen: durations, dB values, slot numbers, keycaps, bank letters, PINs, paths.

### Hierarchy
- **Headline** (600, 1.25rem, -0.02em): deck title, settings sheet title, empty-state heading. One per region.
- **Title** (600, 0.875rem, 1.25 line height, -0.01em): the engraved pad label (two-line clamp; one line and 0.8125rem on small pads), settings section heads.
- **Body** (400, 0.875rem, 1.4): default copy.
- **Control** (500, 0.8125rem): button and menu labels.
- **Label** (500, 0.75rem): inspector labels, bus names, status strip, hints. Sentence case, never tracked uppercase.
- **Wordmark** (800, 0.8125rem, +0.08em): the product name in the transport and on the phone remote. The only tracked, heavy setting.
- **Data** (Martian Mono, 87.5% width, 0.92em of context, tabular): every number, time and key. **Keycap** is the same face at 0.625rem.

### Named Rules
**The Silkscreen Rule.** Mono is for data and keys only. If a string would change when a clip, key or level changes, it is mono; if it is a word, it is grotesk.

**The Tabular Rule.** Every live number uses tabular figures so meters, timers and counts never shift width.

## Layout

A fixed five-region instrument on a CSS grid: transport strip (56px) across the top, rail (224px) left, deck centre, inspector (340px) right, status strip (34px) across the bottom. Density is high and spacing follows a 4pt scale (4, 8, 12, 16, 20, 24, 32, 40px).

The pad grid is `auto-fill` with a minimum key width of 168px and a key height of 76px, 8px gaps; small keys are 136 x 62px and large 216 x 104px; list view collapses each key to a 40px ruled row. Below 1240px the buses shrink and drop their numeric readouts; below 1100px the inspector disappears until a pad is selected and pad-size controls hide; below 1080px rail and inspector narrow to 196/300px; below 900px the rail collapses to a 64px icon column.

Compact mode is a single column (transport, deck, status) for an always-on-top window: buses, rail, inspector and pad durations drop away, and lettered bank keys sit beside the title. The phone remote is a sticky top bar (wordmark, Stop all), a horizontally scrolling bank row, and a two-column key grid at 16px gutters with safe-area insets.

## Elevation & Depth

Depth is tonal. Each surface is one lightness step above or below its neighbour, separated by 1px rules; content regions never float. Shadows exist in exactly two forms.

### Shadow Vocabulary
- **Key travel** (`box-shadow: 0 1px 0 var(--color-rule-strong) inset, 0 2px 0 var(--color-well)`): pads only. A lit top edge and a 2px skirt in the well tone; on press the pad translates down 2px and the skirt collapses to 0. Keycaps (`.kbd`) express the same idea with a 2px bottom border.
- **Overlay lift** (`0 8px 24px` toast, `0 10px 30px` menu, `0 24px 60px` palette, `-16px 0 40px` sheet, all in `--color-shadow`): only for things that float above the instrument, with a scrim behind modal ones.

### Named Rules
**The Flat Instrument Rule.** Regions are flat and ruled. A shadow means either "this is a key you press" or "this floats above the board". No glow, no glass, no blur.

## Shapes

Corners are small and consistent: 4px for keycaps, fields, chips and swatches; 6px for buttons, pads, rail items, buses, menus and toasts; 10px only for the command palette and drop veil. LEDs, pips and bank LEDs are 2px-radius squares, never circles. Every edge is a 1px rule; the one exception is the keycap's 2px bottom edge. Faders are a 4px track with a 10 x 18px square cap.

## Components

### Buttons
Tactile and quiet, like panel switches.
- **Shape:** gently squared (6px), 30px tall, 12px side padding, 1px `rule-strong` outline on `paper-3`.
- **Hover / Active:** step to `paper-4`; on press move down 1px onto `paper-2`. Transitions 120ms ease-out.
- **Primary:** `muted` outline on `paper-4`; fills with ink (text turns `paper`) on hover. On the phone PIN gate it rests ink-filled.
- **Ghost:** no fill or outline, `muted` text, `paper-4` on hover. Icon buttons are 30px square.
- **Danger:** neutral at rest; red outline, text and tint on hover. Stop all carries a red stop glyph, not a red button.
- **Toggled** (`aria-pressed`): `paper-5` with ink text.

### Pads (signature)
The hardware key. `paper-3` body, 1px `rule`, 6px corners, key-travel shadow. Status row: LED pip (8px), `N1`-style slot, duration, spacer, keycap. Bottom: the engraved name in Title type with the play-mode glyph. Hover steps to `paper-4`; selected takes a `faint` border; playing takes an amber border and a 2px amber progress bar along the bottom edge, and the pip gains a 1px outline in its own LED colour. Missing files drop to `paper-2` with a red "File missing" in place of the duration.

### Keycaps
18px tall, mono keycap type, `paper-2` on a 1px `rule-strong` border with a 2px bottom edge, 4px corners. A conflicting hotkey turns border and text red.

### Inputs / Fields
- **Style:** recessed `well` fill, 1px `rule`, 4px corners, 28px tall.
- **Focus:** border becomes `focus` amber with a 1px matching ring.
- **Error:** red border (`aria-invalid`). Numeric fields right-align in mono.
- **Fader:** 4px track filled in `muted` up to the value over `paper-5`, ink square cap; a 2px meter runs beneath bus faders (amber, red when hot).
- **Switch:** 30 x 18px pill; checked is amber outline on amber tint with an amber knob.
- **Segmented:** `well` tray with 2px inset; the checked segment is `paper-4` with a 1px `rule-strong` underline.

### Navigation (rail)
32px rows, 6px corners, `muted` text. Hover `paper-3`; current `paper-4` with ink text and an amber icon. Banks lead with a 20 x 18px lettered plate and a 6px LED; the active bank lights both in amber. Group labels are faint 0.6875rem sentence case with a mono key hint. In compact mode the same letters become 26px bank keys beside the deck title.

### Chips (status strip)
Now-playing chips: 24px, `paper-3`, `rule-strong` border, 4px corners, LED pip, name, 20px stop button. They rise in over 220ms.

### Overlays
Menus, palette and toasts sit on `paper-3`/`paper-4` with a `rule-strong` border and overlay lift; menus and palette pop from 97% scale over 220ms; the settings sheet slides 24px in from the right over 420ms. Reduced motion clamps every animation to a 150ms fade and removes key travel.

## Do's and Don'ts

### Do:
- **Do** step surfaces by lightness on hue 60 (`paper` to `paper-5`) and separate regions with 1px `rule`.
- **Do** reserve amber for playing, active bank, focus, listening and checked states.
- **Do** set every number, time, slot and key in Martian Mono at 87.5% width with tabular figures.
- **Do** build new pads and key-like controls with the status-row-on-top, label-at-bottom anatomy and 2px key travel.
- **Do** draw LEDs as 8px (pads) or 6px (banks) squares with 2px corners.
- **Do** keep corners on the 4/6/10px scale.

### Don't:
- **Don't** make the primary action amber; primary is ink.
- **Don't** use LED hues on surfaces, borders, buttons or text.
- **Don't** add glow, glassmorphism or blur, or decorative gradients; hard-stop gradients that draw a select chevron or a fader fill are fine.
- **Don't** float content regions with shadows; shadow is for keys and overlays only.
- **Don't** set words in mono or set labels in tracked uppercase; only the wordmark is tracked.
- **Don't** fall back to a generic card-grid dashboard look: pads are keys, not cards.
