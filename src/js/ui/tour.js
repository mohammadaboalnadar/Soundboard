// First-run tour: a few steps that point at the real controls. Shown once
// (settings.onboarded), replayable from Settings or the command palette.
import { h } from "./dom.js";

const STEPS = [
  {
    title: "Welcome to Sonic Dominion",
    body: "Fire sounds into your headphones and into voice chat at the same time, from any game. Five quick stops and you're set.",
    target: null
  },
  {
    title: "Send sounds into voice chat",
    body: "Pick your virtual cable here (VB-CABLE, for example), then choose that same device as your microphone in Discord or OBS. Monitor is what you hear.",
    target: '.bus[data-kind="cable"]'
  },
  {
    title: "Add your sounds",
    body: "Add MP3, WAV, OGG, FLAC or M4A files here, or drop them anywhere on the window. Record makes a pad straight from your mic.",
    target: ".deck-tools .btn:last-child"
  },
  {
    title: "Fire, edit, assign a key",
    body: "Click a pad to play it. Select it to trim, set fades, pick a play mode and give it a hotkey that works inside games. Right-click for more.",
    target: ".pads .pad, .pads-scroll"
  },
  {
    title: "Banks and Numpad slots",
    body: "Keep sounds in banks. Turn on Numpad slots in Settings and Num 1 to 9 fire the active bank's first nine pads; Num + and Num − switch banks.",
    target: ".rail-list"
  },
  {
    title: "Stop everything",
    body: "Stop all cuts every sound. Esc does the same in this window; set a global key with right-click. Settings has push-to-talk, the phone remote and the tray.",
    target: ".stop-all"
  }
];

export function createTour(app) {
  let i = 0;
  let layer = null;
  let ring = null;
  let card = null;
  let lastFocus = null;

  function finish() {
    if (!layer) return;
    layer.remove();
    removeEventListener("resize", place);
    removeEventListener("keydown", onKey, true);
    layer = ring = card = null;
    if (!app.store.state.onboarded) app.store.update((s) => (s.onboarded = true), "settings");
    lastFocus?.focus?.();
  }

  function targetEl(step) {
    if (!step.target) return null;
    for (const sel of step.target.split(",")) {
      const el = document.querySelector(sel.trim());
      if (el && el.getClientRects().length) return el;
    }
    return null;
  }

  function place() {
    if (!layer) return;
    const step = STEPS[i];
    const el = targetEl(step);
    const pad = 6;
    if (el) {
      const r = el.getBoundingClientRect();
      ring.hidden = false;
      ring.style.left = `${r.left - pad}px`;
      ring.style.top = `${r.top - pad}px`;
      ring.style.width = `${Math.min(r.width, innerWidth - 24) + pad * 2}px`;
      ring.style.height = `${Math.min(r.height, 260) + pad * 2}px`;
      // card below the target when there is room, otherwise above; clamped to the window
      const cr = card.getBoundingClientRect();
      const below = r.bottom + 14 + cr.height < innerHeight;
      const top = below ? r.bottom + 14 : Math.max(12, r.top - 14 - cr.height);
      const left = Math.min(Math.max(12, r.left), innerWidth - cr.width - 12);
      card.style.left = `${left}px`;
      card.style.top = `${Math.min(top, innerHeight - cr.height - 12)}px`;
      layer.classList.remove("centered");
    } else {
      ring.hidden = true;
      card.style.left = "";
      card.style.top = "";
      layer.classList.add("centered");
    }
  }

  function render() {
    const step = STEPS[i];
    const last = i === STEPS.length - 1;
    const back = h("button", { class: "btn ghost", type: "button", disabled: i === 0 }, "Back");
    back.addEventListener("click", () => go(i - 1));
    const next = h("button", { class: "btn primary", type: "button" }, last ? "Start playing" : "Next");
    next.addEventListener("click", () => (last ? finish() : go(i + 1)));
    const skip = h("button", { class: "tour-skip", type: "button" }, "Skip tour");
    skip.addEventListener("click", finish);
    card.replaceChildren(
      h("div", { class: "tour-top" }, h("span", { class: "tour-count num" }, `${String(i + 1).padStart(2, "0")} / ${String(STEPS.length).padStart(2, "0")}`), skip),
      h("h2", { id: "tour-title" }, step.title),
      h("p", {}, step.body),
      h("div", { class: "tour-actions" }, back, next)
    );
    requestAnimationFrame(() => {
      place();
      next.focus();
    });
  }

  function go(n) {
    i = Math.max(0, Math.min(STEPS.length - 1, n));
    render();
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish();
    } else if (e.key === "ArrowRight") go(i + 1);
    else if (e.key === "ArrowLeft") go(i - 1);
    else if (e.key === "Tab") {
      // keep focus inside the card
      const f = [...card.querySelectorAll("button:not([disabled])")];
      const at = f.indexOf(document.activeElement);
      if (e.shiftKey && at <= 0) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && at === f.length - 1) {
        e.preventDefault();
        f[0].focus();
      }
    }
  }

  function start() {
    if (layer) return;
    lastFocus = document.activeElement;
    i = 0;
    ring = h("div", { class: "tour-ring", "aria-hidden": "true" });
    card = h("div", { class: "tour-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "tour-title" });
    layer = h("div", { class: "tour" }, ring, card);
    document.body.append(layer);
    addEventListener("resize", place);
    addEventListener("keydown", onKey, true);
    render();
  }

  return { start, isOpen: () => Boolean(layer) };
}
