// Right panel: edit the selected sound — trim, fades, gain, mode, auto-level, colour, hotkey.
import { h, icon, led, fmtTime, fmtDb, gainToDb, dbToGain, setFill } from "./dom.js";
import { decodePeaks } from "../peaks.js";
import { formatKey } from "../keys.js";
import { PAD_COLORS, PLAY_MODES, MAX_GAIN, baseName } from "../model.js";

const MODE_ICON = { restart: "m-restart", overlap: "m-overlap", toggle: "m-toggle", loop: "m-loop", hold: "m-hold" };
const MODE_HELP = {
  restart: "Each press starts the sound again from the top.",
  overlap: "Each press adds another copy on top of the last.",
  toggle: "First press plays, second press stops.",
  loop: "Plays on repeat until you press again.",
  hold: "Plays only while the key or pad is held down."
};
const MIN_SEG = 0.02;

export function createInspector(root, app) {
  const { store, engine, ui } = app;
  let current = null; // the sound object being edited
  let refs = null;

  function sound() {
    return store.state.sounds.find((s) => s.id === ui.selectedId) || null;
  }

  function edit(fn, { invalidate = false, quiet = false } = {}) {
    const s = sound();
    if (!s) return;
    store.update(() => fn(s), quiet ? "sound-quiet" : "sound");
    if (invalidate) engine.invalidate(s.id);
    engine.refresh(s);
  }

  // ---------- waveform ----------

  function drawWave() {
    const s = current;
    if (!s || !refs) return;
    const canvas = refs.canvas;
    const dpr = devicePixelRatio || 1;
    const w = refs.wave.clientWidth;
    const hgt = refs.wave.clientHeight;
    if (!w || !hgt) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
    }
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hgt);
    const css = getComputedStyle(refs.wave);
    const ledColor = css.getPropertyValue(`--led-${s.color}`).trim();
    const faint = css.getPropertyValue("--color-rule-strong").trim();
    const accent = css.getPropertyValue("--color-accent").trim();
    const peaks = decodePeaks(s.peaks);
    const dur = s.duration || 1;
    const mid = hgt / 2;
    if (peaks.length) {
      let max = 1;
      for (const p of peaks) if (p > max) max = p;
      const scale = (mid - 6) / max; // normalise display so quiet clips stay readable
      const bw = w / peaks.length;
      for (let i = 0; i < peaks.length; i++) {
        const t = ((i + 0.5) / peaks.length) * dur;
        g.fillStyle = t >= s.start && t <= s.end ? ledColor : faint;
        const bh = Math.max(1, peaks[i] * scale);
        g.fillRect(i * bw + 0.5, mid - bh, Math.max(1, bw - 1), bh * 2);
      }
    } else {
      g.fillStyle = faint;
      g.fillRect(0, mid - 0.5, w, 1);
    }
    // gain envelope
    const x = (t) => (t / dur) * w;
    const top = 6;
    const bottom = hgt - 4;
    g.strokeStyle = accent;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x(s.start), s.fadeIn > 0 ? bottom : top);
    g.lineTo(x(s.start + s.fadeIn), top);
    g.lineTo(x(s.end - s.fadeOut), top);
    g.lineTo(x(s.end), s.fadeOut > 0 ? bottom : top);
    g.stroke();
  }

  function placeHandles() {
    const s = current;
    if (!s || !refs) return;
    const dur = s.duration || 1;
    const pct = (t) => `${(Math.max(0, Math.min(dur, t)) / dur) * 100}%`;
    refs.hStart.style.left = pct(s.start);
    refs.hEnd.style.left = pct(s.end);
    refs.fIn.style.left = pct(s.start + s.fadeIn);
    refs.fOut.style.left = pct(s.end - s.fadeOut);
    refs.startIn.value = fmtTime(s.start);
    refs.endIn.value = fmtTime(s.end);
    refs.fadeInIn.value = fmtTime(s.fadeIn);
    refs.fadeOutIn.value = fmtTime(s.fadeOut);
    refs.lenLabel.textContent = `${fmtTime(s.end - s.start)}s of ${fmtTime(dur)}s`;
  }

  function clampFades(s) {
    const seg = s.end - s.start;
    s.fadeIn = Math.max(0, Math.min(s.fadeIn, seg));
    s.fadeOut = Math.max(0, Math.min(s.fadeOut, seg - s.fadeIn));
  }

  function dragHandle(el, which) {
    el.addEventListener("pointerdown", (e) => {
      if (!current?.duration) return;
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      el.classList.add("active");
      const rect = refs.wave.getBoundingClientRect();
      const move = (ev) => {
        const t = ((ev.clientX - rect.left) / rect.width) * current.duration;
        edit(
          (s) => {
            if (which === "start") s.start = Math.max(0, Math.min(t, s.end - MIN_SEG));
            else if (which === "end") s.end = Math.min(s.duration, Math.max(t, s.start + MIN_SEG));
            else if (which === "fadeIn") s.fadeIn = Math.max(0, t - s.start);
            else if (which === "fadeOut") s.fadeOut = Math.max(0, s.end - t);
            if (which === "fadeOut") {
              const seg = s.end - s.start;
              s.fadeOut = Math.min(s.fadeOut, seg);
              s.fadeIn = Math.min(s.fadeIn, seg - s.fadeOut);
            } else clampFades(s);
          },
          { quiet: true }
        );
        placeHandles();
        drawWave();
      };
      const up = () => {
        el.classList.remove("active");
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        if (which === "start" || which === "end") engine.invalidate(current.id);
        store.emit("sound");
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
  }

  function numField(label, key, { onCommit }) {
    const input = h("input", { class: "field num", type: "text", inputmode: "decimal", "aria-label": label, spellcheck: "false" });
    const commit = () => {
      const v = Number(input.value.replace(",", "."));
      if (!Number.isFinite(v) || v < 0) {
        input.setAttribute("aria-invalid", "true");
        return;
      }
      input.removeAttribute("aria-invalid");
      onCommit(v);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        commit();
        input.blur();
      } else if (e.key === "Escape") {
        input.removeAttribute("aria-invalid");
        placeHandles();
        input.blur();
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const step = e.shiftKey ? 0.1 : 0.01;
        input.value = fmtTime(Math.max(0, Number(input.value) + (e.key === "ArrowUp" ? step : -step)));
        commit();
      }
    });
    input.addEventListener("blur", commit);
    return { wrap: h("label", {}, label, input), input };
  }

  // ---------- render ----------

  function renderEmpty() {
    current = null;
    refs = null;
    root.replaceChildren(
      h(
        "div",
        { class: "insp-empty" },
        h("p", {}, "Select a pad to trim it, set fades, change how it plays, or give it a hotkey."),
        h("p", { class: "hint" }, "Ctrl K finds anything.")
      )
    );
  }

  function render() {
    const s = sound();
    if (!s) return renderEmpty();
    current = s;

    const nameIn = h("input", { class: "field", value: s.name || baseName(s.path), "aria-label": "Sound name", spellcheck: "false" });
    const saveName = () => {
      const v = nameIn.value.trim();
      if (v !== s.name) edit((x) => (x.name = v || baseName(x.path)));
    };
    nameIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") nameIn.blur();
      if (e.key === "Escape") {
        nameIn.value = s.name;
        nameIn.blur();
      }
    });
    nameIn.addEventListener("blur", saveName);

    const closeBtn = h("button", { class: "btn ghost icon", type: "button", "aria-label": "Close editor", title: "Close" }, icon("i-close"));
    closeBtn.addEventListener("click", () => app.actions.select(""));

    // waveform
    const canvas = h("canvas");
    const hStart = h("div", { class: "handle", role: "slider", "aria-label": "Trim start", tabindex: "-1" });
    const hEnd = h("div", { class: "handle", role: "slider", "aria-label": "Trim end", tabindex: "-1" });
    const fIn = h("div", { class: "fade-handle", title: "Fade in" });
    const fOut = h("div", { class: "fade-handle", title: "Fade out" });
    const playhead = h("div", { style: { position: "absolute", top: "0", bottom: "0", left: "0", width: "1px", background: "var(--color-ink)", opacity: "0", "pointer-events": "none" } });
    const wave = h("div", { class: `wave${s.peaks ? "" : " loading"}` }, canvas, playhead, hStart, hEnd, fIn, fOut);
    [hStart, hEnd, fIn, fOut].forEach((el, i) => dragHandle(el, ["start", "end", "fadeIn", "fadeOut"][i]));

    const lenLabel = h("span", { class: "num" });
    const start = numField("Start", "start", {
      onCommit: (v) => edit((x) => { x.start = Math.max(0, Math.min(v, x.end - MIN_SEG)); clampFades(x); }, { invalidate: true })
    });
    const end = numField("End", "end", {
      onCommit: (v) => edit((x) => { x.end = Math.min(x.duration || v, Math.max(v, x.start + MIN_SEG)); clampFades(x); }, { invalidate: true })
    });
    const fadeIn = numField("Fade in", "", { onCommit: (v) => edit((x) => { x.fadeIn = v; clampFades(x); }) });
    const fadeOut = numField("Fade out", "", {
      onCommit: (v) => edit((x) => { const seg = x.end - x.start; x.fadeOut = Math.min(v, seg); x.fadeIn = Math.min(x.fadeIn, seg - x.fadeOut); })
    });

    // gain in dB
    const gainLabel = h("span", { class: "num" }, fmtDb(s.gain));
    const maxDb = gainToDb(MAX_GAIN);
    const gainIn = h("input", { class: "fader", type: "range", min: "-30", max: String(maxDb.toFixed(1)), step: "0.5", value: String(Math.max(-30, gainToDb(s.gain))), "aria-label": "Volume" });
    setFill(gainIn);
    gainIn.addEventListener("input", () => {
      const v = Number(gainIn.value);
      setFill(gainIn);
      const g = v <= -30 ? 0 : dbToGain(v);
      gainLabel.textContent = fmtDb(g);
      edit((x) => (x.gain = g), { quiet: true });
    });
    gainIn.addEventListener("change", () => store.emit("sound"));
    gainIn.addEventListener("dblclick", () => {
      gainIn.value = "0";
      gainIn.dispatchEvent(new Event("input"));
    });

    // mode
    const modeHelp = h("span", { class: "hint" }, MODE_HELP[s.mode]);
    const seg = h("div", { class: "seg", role: "radiogroup", "aria-label": "Play mode" });
    for (const m of PLAY_MODES) {
      const b = h("button", { type: "button", role: "radio", "aria-checked": String(m === s.mode), title: MODE_HELP[m] }, icon(MODE_ICON[m]), m[0].toUpperCase() + m.slice(1));
      b.addEventListener("click", () => {
        engine.stop(s.id, { fade: false });
        edit((x) => (x.mode = m));
      });
      seg.append(b);
    }

    // auto-level
    const loud = app.loudness.get(s.id);
    const autoSw = h("input", { class: "switch", type: "checkbox", role: "switch", "aria-label": "Auto-level" });
    autoSw.checked = s.autoLevel;
    autoSw.addEventListener("change", () => edit((x) => (x.autoLevel = autoSw.checked)));
    const autoRow = h(
      "label",
      { class: "toggle-row" },
      h(
        "span",
        { class: "copy" },
        h("span", {}, "Auto-level"),
        h("span", { class: "hint" }, loud && Number.isFinite(loud.rmsDb) ? `Measured ${loud.rmsDb.toFixed(1)} dB RMS, adjusts by ${fmtDb(s.normGain)}` : "Matches loudness with your other sounds")
      ),
      autoSw
    );

    // colour
    const swatches = h("div", { class: "swatches", role: "radiogroup", "aria-label": "Pad colour" });
    for (const c of PAD_COLORS) {
      const b = h("button", { class: "swatch", type: "button", role: "radio", "aria-checked": String(c === s.color), "aria-label": c, title: c, style: { "--led": led(c) } });
      b.addEventListener("click", () => edit((x) => (x.color = c)));
      swatches.append(b);
    }

    // hotkey
    const listening = ui.capture === s.id;
    const keyBtn = h(
      "button",
      { class: `btn${listening ? " listening" : ""}`, type: "button" },
      listening ? "Press a key combination" : s.key ? "Hotkey" : "Set hotkey",
      h("span", { class: "kbd" }, listening ? "Esc to cancel" : s.key ? formatKey(s.key) : "None")
    );
    keyBtn.addEventListener("click", () => (listening ? app.actions.cancelCapture() : app.actions.captureKey(s.id)));
    const clearKey = h("button", { class: "btn ghost icon", type: "button", "aria-label": "Clear hotkey", title: "Clear hotkey", disabled: !s.key }, icon("i-close"));
    clearKey.addEventListener("click", () => app.actions.setKey(s.id, ""));
    const keyHint = app.keyFailed.has(s.id)
      ? h("span", { class: "hint err" }, "Windows refused this hotkey. Another app probably owns it.")
      : h("span", { class: "hint" }, "Works while you are in a game. Numpad keys work too.");

    // actions
    const auditionBtn = h("button", { class: "btn", type: "button", title: "Play to your headphones only" }, icon("i-headphones"), "Audition");
    auditionBtn.addEventListener("click", () => app.actions.fire(s, "down", { monitorOnly: true }));
    const removeBtn = h("button", { class: "btn danger", type: "button" }, icon("i-trash"), "Remove");
    removeBtn.addEventListener("click", () => app.actions.remove(s.id));

    const missing = app.missing.has(s.id);

    root.replaceChildren(
      h("div", { class: "insp-head" }, nameIn, closeBtn),
      h("div", { class: "insp-path", title: s.path }, s.path),
      h(
        "div",
        { class: "insp-body" },
        missing ? h("p", { class: "hint err" }, "This file is no longer at this path. Remove the pad or put the file back.") : null,
        h("section", { class: "insp-section" }, h("div", { class: "insp-label" }, h("span", {}, "Trim"), lenLabel), wave, h("div", { class: "insp-row" }, start.wrap, end.wrap), h("div", { class: "insp-row" }, fadeIn.wrap, fadeOut.wrap)),
        h("section", { class: "insp-section" }, h("div", { class: "insp-label" }, h("span", {}, "Volume"), gainLabel), gainIn, autoRow),
        h("section", { class: "insp-section" }, h("div", { class: "insp-label" }, h("span", {}, "Play mode")), seg, modeHelp),
        h("section", { class: "insp-section" }, h("div", { class: "insp-label" }, h("span", {}, "Hotkey")), h("div", { class: "key-capture" }, keyBtn, clearKey), keyHint),
        h("section", { class: "insp-section" }, h("div", { class: "insp-label" }, h("span", {}, "Colour")), swatches),
        h("div", { class: "insp-actions" }, auditionBtn, removeBtn)
      )
    );

    refs = { canvas, wave, hStart, hEnd, fIn, fOut, playhead, lenLabel, startIn: start.input, endIn: end.input, fadeInIn: fadeIn.input, fadeOutIn: fadeOut.input };
    placeHandles();
    requestAnimationFrame(drawWave);
  }

  /** Per-frame: move the playhead while the selected sound plays. */
  function paint() {
    if (!refs || !current) return;
    const p = engine.progress(current.id);
    if (p === null) {
      refs.playhead.style.opacity = "0";
      return;
    }
    const dur = current.duration || 1;
    const t = current.start + p * (current.end - current.start);
    refs.playhead.style.opacity = "1";
    refs.playhead.style.transform = `translateX(${(t / dur) * refs.wave.clientWidth}px)`;
  }

  new ResizeObserver(() => drawWave()).observe(root);
  renderEmpty();
  return { render, paint, redraw: drawWave };
}
