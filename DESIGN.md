---
name: Sonic Dominion
description: Every sound is a white-label test pressing you stamped yourself, filed in a crate and spun the second you hit the key.
colors:
  paper: "oklch(14.5% 0.004 70)"
  paper-2: "oklch(17.5% 0.005 70)"
  paper-3: "oklch(20.5% 0.006 70)"
  paper-4: "oklch(24% 0.006 70)"
  paper-5: "oklch(28% 0.007 70)"
  well: "oklch(11% 0.004 70)"
  groove: "oklch(9% 0.003 70)"
  rule: "oklch(27% 0.006 70)"
  rule-strong: "oklch(36% 0.007 70)"
  ink: "oklch(95% 0.004 140)"
  muted: "oklch(79% 0.006 100)"
  neutral: "oklch(66% 0.008 80)"
  faint: "oklch(56% 0.008 75)"
  label: "oklch(95% 0.004 140)"
  label-ink: "oklch(16% 0.005 70)"
  kraft: "oklch(66% 0.075 70)"
  kraft-2: "oklch(58% 0.07 68)"
  kraft-ink: "oklch(24% 0.04 60)"
  accent: "oklch(62% 0.205 28)"
  accent-ink: "oklch(97% 0.004 140)"
  accent-soft: "oklch(62% 0.205 28 / 0.16)"
  focus: "oklch(68% 0.19 28)"
  danger: "oklch(64% 0.205 28)"
  danger-soft: "oklch(64% 0.205 28 / 0.14)"
  ok: "oklch(72% 0.15 150)"
  led-amber: "oklch(85% 0.165 92)"
  led-ember: "oklch(72% 0.18 50)"
  led-rose: "oklch(68% 0.2 358)"
  led-violet: "oklch(62% 0.18 300)"
  led-azure: "oklch(62% 0.17 255)"
  led-teal: "oklch(74% 0.13 190)"
  led-moss: "oklch(70% 0.17 148)"
  led-sand: "oklch(87% 0.17 125)"
typography:
  display:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "0.02em"
  headline:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 900
    letterSpacing: "0.02em"
  title:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "0.01em"
  body:
    fontFamily: "Schibsted Grotesk, Segoe UI Variable Text, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Martian Mono, Cascadia Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 87.5"
rounded:
  sm: "3px"
  md: "4px"
  lg: "8px"
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
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "30px"
  button-hover:
    backgroundColor: "{colors.paper-4}"
  button-primary:
    backgroundColor: "{colors.paper-4}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "30px"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  stop-all:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
  stop-all-hover:
    backgroundColor: "{colors.accent-soft}"
  stop-all-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
  field:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "28px"
  bank-divider:
    backgroundColor: "{colors.kraft}"
    textColor: "{colors.kraft-ink}"
    height: "40px"
  bank-divider-hover:
    backgroundColor: "{colors.kraft-2}"
  bank-divider-active:
    backgroundColor: "{colors.label}"
    textColor: "{colors.label-ink}"
  pad:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px"
    height: "112px"
  pad-pressed:
    backgroundColor: "{colors.paper-2}"
  pad-label:
    backgroundColor: "{colors.label}"
    textColor: "{colors.label-ink}"
  pad-label-pressed:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
  keycap:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "0 5px"
    height: "18px"
  chip:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "24px"
---

# Design System: Sonic Dominion

## Overview

**Creative North Star: "The White Label Crate"**

Every sound is a white-label test pressing the user stamped themselves: a black sleeve holding a round white label, filed in a crate of kraft dividers and spun the moment its key is hit. The shell is matte sleeve-black card stock in five weights of board; on it sit three printed materials (cool white label stock, kraft crate brown, one rubber-stamp red) and the user's own saturated cue stickers. Nothing glows and nothing floats; the world is paper, ink and vinyl.

The system serves a tool fired mid-game, so density is high and motion is functional. The one continuous motion is the signature: the playing pressing's label turns at 33 1/3 rpm while a red stylus arc tracks progress around the disc. Every state is a printed mark rather than a lighting effect: a hairline ring on hover, an inked label on press, a strike-through when disabled, corner brackets on focus. The world rejects the grey rounded-card soundboard dashboard and the neon gamer panel.

A light theme inverts the sleeves (white sleeves, black labels) while the crate kraft and the stamp red stay put. The phone remote carries the same pressings, dividers and stamp at touch scale.

**Key Characteristics:**
- Sleeve-black warm-neutral shell (hue 70, chroma under 0.01) layered by board weight, not shadow.
- Pads are pressings: grooved disc, white label with an SD-nn catalog number, cue-sticker dot, stamped name.
- Groove band width encodes clip length: the label inset runs from 8% (a blip) to 36% (6 s and longer) of the disc.
- Banks are kraft divider cards with one dog-eared corner; the active one is pulled forward in label white.
- Stamp red is a signal, never a decoration.
- Three voices of type: stamped condensed caps, a plain grotesk for UI, a narrow mono for catalog data.

## Colors

A near-black warm sleeve palette with three printed materials and a set of user-owned cue colours.

### Primary
- **Rubber-Stamp Red** (accent): the only interface signal. On air (playing pad border, stylus arc), the active bank's letter and LED, the Stop all stamp, the pressed label's ink, the VOID stamp, hotkey conflicts, and focus (via the slightly lighter **Focus Red**). **Danger Red** is the same stamp used for destructive and error states; **Stamp Wash** (accent-soft) is the 16% tint for stamp hover and switch tracks.

### Secondary
- **Crate Kraft** (kraft): bank divider cards in the rail, compact bank keys and phone bank tabs. **Worn Kraft** (kraft-2) is its hover. **Kraft Ink** (kraft-ink) prints the bank name, letter box and LED ring on kraft.

### Tertiary
- **Label Stock** (label): the round pad label and the pulled-forward active bank. **Label Ink** (label-ink) prints the catalog number and spindle on it.

### Neutral
- **Sleeve Black** (paper): app background. **paper-2 to paper-5** are heavier boards: inspector and sheets (paper-2), pads, chips and menus (paper-3), toasts and primary buttons (paper-4), menu hover and the vinyl between grooves (paper-5).
- **Well** (well): recessed input fields and meters. **Groove** (groove): the cut grooves and spindle hole.
- **Rule** / **Strong Rule** (rule, rule-strong): 1px borders; the strong rule is the hairline hover ring.
- **Ink, Muted, Neutral, Faint**: text from primary to placeholder; muted carries numpad slots, neutral carries play mode.
- **Signal Green** (ok): the one positive state.

### Cue Stickers
The eight led-* colours are user content: each pad's chosen sticker colour, painted only on the disc's sticker dot, the list-view label and the now-playing chip. Saved settings use eight fixed colour names; the `sand` key is kept for compatibility but renders as lime so it never reads as kraft.

### Named Rules
**The One Stamp Rule.** Red is reserved for on air, the active bank, VOID (missing files only), hotkey conflicts, destructive actions and focus. It is never a brand colour, a hover tint on ordinary controls, or a decoration.

**The Sticker Rule.** Cue colours belong to the user's pressings. They never colour chrome, buttons, headings or state.

## Typography

**Display Font:** Big Shoulders Display (with Arial Narrow)
**Body Font:** Schibsted Grotesk (with Segoe UI Variable Text, system-ui)
**Label/Mono Font:** Martian Mono at 87.5% width (with Cascadia Mono, ui-monospace)

**Character:** Condensed stamped caps for anything the user named, a quiet grotesk for everything the app says, and a narrow tabular mono for anything a catalog would print.

### Hierarchy
- **Display** (900, 2.25rem, 0.95): the active bank heading above the pad grid, uppercase.
- **Headline** (900, 1.75rem): sheet and empty-state headings, uppercase. Inspector clip name uses 800 at 1.625rem.
- **Title** (900, clamp 1.05rem to 1.5rem by container, 0.92): pad names, uppercase, never broken mid-word; 1.125rem in list and compact views. Stop all, VOID and bank dividers use the same face at 1.0625 to 1.125rem.
- **Body** (400, 0.875rem, 1.4): all UI copy, buttons (500, 0.8125rem), menus and notices.
- **Label** (mono 700, 0.5625 to 0.75rem, tabular): SD-nn catalog numbers, N1 to N9 slot marks, lengths, dB, keycaps (0.625rem) and counts.

### Named Rules
**The Stamp Is for Names Rule.** Big Shoulders sets user-named things and section heads only (pad, bank, deck, sheet, wordmark, Stop all, VOID). Interface copy stays in Schibsted.

**The Catalog Rule.** Any number a record sleeve would print (catalog, slot, time, gain, key) is mono with tabular figures.

## Layout

A fixed desktop shell grid: a 56px transport bar across the top, a 232px rail on the left, the deck in the middle, a 340px inspector on the right and a 34px status bar with now-playing chips at the bottom. Spacing is a 4pt scale (4 to 40px).

The deck is an auto-fill grid of pads in three sizes: S (min 180px wide, 76px tall, 54px disc), M (232 / 112 / 86) and L (280 / 140 / 112), 12px gap. Each pad is a two-column sleeve: disc on the left, then the name over one data row (slot, length, mode, then the keycap pushed right). List view collapses each pad to a 44px row (26px disc, name, keycap, length, gain, mode). Compact always-on-top mode shrinks pads (176 / 84 / 58) and replaces the rail with kraft bank keys.

Rail dividers are 40px kraft cards stacked 6px apart; every even card is indented 10px so the crate reads as staggered tabs. The phone remote scrolls its dividers horizontally and stacks pressings in a touch grid (64px disc, 88px min height).

## Elevation & Depth

Depth is material, not lift. The shell is flat; surfaces separate by board weight (paper to paper-5) and 1px rules. Pads carry no drop shadow at rest; their only edges are inset hairlines that appear with state. The disc itself is depth by pattern: a repeating radial groove (1.2px groove, 1.2px vinyl). Shadows exist only on things that truly sit above the page.

### Shadow Vocabulary
- **Hairline ring** (`box-shadow: inset 0 0 0 1px var(--color-rule-strong)`): pad hover.
- **Ink ring** (`box-shadow: inset 0 0 0 1px var(--color-ink)`): pad pressed.
- **Sticker cut** (`box-shadow: 0 0 0 2px var(--color-paper-3)`): separates the cue sticker from the disc edge.
- **Toast** (`box-shadow: 0 8px 24px var(--color-shadow)`), **Menu** (`0 10px 30px`), **Dialog** (`0 24px 60px`), **Sheet** (`-16px 0 40px`): floating layers only.

### Named Rules
**The Paper Not Light Rule.** No glows, no coloured shadows, no blur. A state shows as ink on paper.

## Shapes

Corners are barely softened card stock: 3px for fields, keycaps, chips and stamps, 4px for buttons and pads, 8px reserved for larger floating layers. Two shapes break the rectangle and carry the world: the circle (disc, label, spindle, cue sticker, bank LED, chip pip) and the crate divider, a card with one dog-eared top-right corner (`3px 14px 3px 3px` in the rail, `3px 10px 3px 3px` for compact keys, `3px 12px 3px 3px` on the phone). The VOID stamp is a 2px red outlined box rotated -14 degrees.

## Components

### Buttons
Quiet, printed, rectangular.
- **Shape:** gently cornered (4px), 30px tall, 1px strong rule border.
- **Default:** paper-3 board, ink text, Schibsted 500.
- **Primary:** paper-4 board with a muted border; on hover it inverts to an ink slab with sleeve-black text.
- **Ghost:** transparent, muted text; paper-4 on hover. Icon buttons are 30px square.
- **Pressed:** drops 1px onto paper-2. **Disabled:** struck through at 60% opacity.
- **Focus:** 2px Focus Red outline, 2px offset.

### Stop All (signature stamp)
A rubber stamp: 2px red outline, transparent, Big Shoulders 900 uppercase. Hover washes with Stamp Wash; pressed inks solid red with label-white text. Same on the phone remote.

### Crate Dividers (bank navigation)
Kraft cards with a dog-eared corner, stamped uppercase bank names, a 24px kraft-ink letter box and a hollow LED ring. Hover darkens to Worn Kraft. The active bank pulls forward in Label Stock with label-ink text, its letter box and LED turned stamp red. A drop target shows a 2px inset red ring.

### Pressings (pads)
The core component.
- **Sleeve:** paper-3, 4px corners, 12px padding, no rest shadow.
- **Disc:** grooved circle; the white label's inset is `8% + min(1, seconds / 6) × 28%`, so the groove band encodes clip length. The label carries an `SD-nn` mono catalog number (hidden at S and compact) and a groove-coloured spindle; the cue sticker sits on the lower right rim.
- **Name and data row:** stamped uppercase name, then mono slot (N1 to N9, muted), length, mode (neutral) and the keycap.
- **States:** hover shows a hairline ring; press drops 1px, rings in ink and inks the label stamp red; selected takes a muted border; on air takes a red border, the label spins at one turn per 1.8s, and a 3px red conic stylus arc grows around the disc. Reduced motion stops the spin; the arc still tracks.
- **Focus:** four 12px by 2px Focus Red corner brackets inset 3px from the corners.
- **Missing:** paper-2, neutral name, "File missing" in the data row, and a red VOID stamp low on the label until the pad is opened.

### Keycaps
Mono 0.625rem on paper-2 with a 2px bottom border, 3px corners, 18px tall. A conflicting hotkey turns border and text red.

### Inputs / Fields
- **Style:** recessed well, 1px rule, 3px corners, 28px tall; numeric fields right-aligned mono.
- **Focus:** border and a 1px ring in Focus Red. **Invalid:** red border. Caret is stamp red.

### Chips (now playing)
24px paper-3 chips with a strong rule, a round cue-sticker pip, the clip name and a stop control.

## Do's and Don'ts

### Do:
- **Do** print every state as a mark: hairline ring (hover), inked label (press), strike-through (disabled), corner brackets or a 2px red outline (focus).
- **Do** keep stamp red to on air, active bank, VOID, conflicts, destructive actions and focus.
- **Do** set user-named things in Big Shoulders uppercase and catalog data in tabular Martian Mono.
- **Do** derive the label inset from clip length (8% to 36% of the disc); never fix it per pad.
- **Do** keep the label spin at 33 1/3 (1.8s per turn) and only while the pressing is on air; stop it under reduced motion.
- **Do** separate surfaces by board weight and 1px rules.

### Don't:
- **Don't** use cue-sticker colours for chrome, headings or state; they belong to the user's pads.
- **Don't** add glows, coloured shadows, blur or drop shadows on resting pads.
- **Don't** stamp VOID on anything but a pressing that cannot play.
- **Don't** set interface copy, labels or helper text in the stamp face.
- **Don't** round pads or buttons beyond 4px or turn the crate dividers into pills.
