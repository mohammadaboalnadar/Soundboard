// Centre deck: toolbar + pad grid / list. Playback progress is painted by app's frame loop
// through `paint()`, which only touches pads that are playing.
import { h, icon, led, fmtDuration, openMenu, fmtDb } from "./dom.js";
import { formatKey } from "../keys.js";
import { baseName } from "../model.js";

const MODE_ICON = { restart: "m-restart", overlap: "m-overlap", toggle: "m-toggle", loop: "m-loop", hold: "m-hold" };
const MODE_LABEL = { restart: "Restart", overlap: "Overlap", toggle: "Toggle", loop: "Loop", hold: "Hold" };

export function createPads(root, app) {
  const { store, engine, ui } = app;
  const els = new Map(); // id -> { el, bar }
  const painted = new Set();

  const title = h("h1");
  const count = h("span", { class: "count num" });
  const addBtn = h("button", { class: "btn primary", type: "button" }, icon("i-plus"), "Add sounds");
  addBtn.addEventListener("click", () => app.actions.addSounds());
  const gridBtn = h("button", { class: "btn ghost icon", type: "button", title: "Pads", "aria-label": "Pad view" }, icon("i-grid"));
  const listBtn = h("button", { class: "btn ghost icon", type: "button", title: "List", "aria-label": "List view" }, icon("i-list"));
  gridBtn.addEventListener("click", () => store.update((s) => (s.view = "grid"), "view"));
  listBtn.addEventListener("click", () => store.update((s) => (s.view = "list"), "view"));
  const sizeBtns = ["s", "m", "l"].map((sz) => {
    const b = h("button", { class: "btn ghost icon mono", type: "button", title: `Pad size ${sz.toUpperCase()}`, "aria-label": `Pad size ${sz}` }, sz.toUpperCase());
    b.addEventListener("click", () => store.update((s) => (s.padSize = sz), "view"));
    return b;
  });

  const grid = h("div", { class: "pads", role: "listbox", "aria-label": "Sounds", "aria-multiselectable": "false" });
  const scroller = h("div", { class: "pads-scroll" }, grid);

  root.append(
    h(
      "div",
      { class: "deck-bar" },
      h("div", { class: "deck-title" }, title, count),
      h("div", { class: "deck-tools" }, ...sizeBtns, h("span", { class: "sep" }), gridBtn, listBtn, h("span", { class: "sep" }), addBtn)
    ),
    scroller
  );

  function visible() {
    const s = store.state;
    const q = ui.query.trim().toLowerCase();
    return s.sounds.filter((snd) => {
      if (ui.board !== "all" && snd.folderId !== ui.board) return false;
      if (!q) return true;
      return (snd.name || baseName(snd.path)).toLowerCase().includes(q) || formatKey(snd.key).toLowerCase().includes(q);
    });
  }

  function boardName() {
    if (ui.board === "all") return "All sounds";
    if (ui.board === "") return "Unsorted";
    return store.state.folders.find((f) => f.id === ui.board)?.name || "Board";
  }

  function padMenu(e, snd) {
    e.preventDefault();
    app.actions.select(snd.id);
    const boards = store.state.folders.filter((f) => f.id !== snd.folderId);
    openMenu(e.clientX, e.clientY, [
      { label: engine.isPlaying(snd.id) ? "Stop" : "Play", icon: engine.isPlaying(snd.id) ? "i-stop" : "i-play", run: () => (engine.isPlaying(snd.id) ? engine.stop(snd.id) : app.actions.fire(snd)) },
      { label: "Set hotkey", icon: "i-key", run: () => app.actions.captureKey(snd.id) },
      "-",
      ...(boards.length || snd.folderId ? [{ title: "Move to" }] : []),
      ...(snd.folderId ? [{ label: "Unsorted", run: () => app.actions.moveToBoard([snd.id], "") }] : []),
      ...boards.map((f) => ({ label: f.name, icon: "i-board", run: () => app.actions.moveToBoard([snd.id], f.id) })),
      "-",
      { label: "Remove", icon: "i-trash", danger: true, kbd: "Del", run: () => app.actions.remove(snd.id) }
    ]);
  }

  function pad(snd) {
    const missing = app.missing.has(snd.id);
    const conflict = app.keyFailed.has(snd.id);
    const bar = h("i", { class: "pad-progress" });
    const name = snd.name || baseName(snd.path);
    const el = h(
      "div",
      {
        class: `pad${missing ? " missing" : ""}`,
        role: "option",
        tabindex: "0",
        draggable: "true",
        "aria-selected": ui.selectedId === snd.id ? "true" : "false",
        "aria-label": `${name}${snd.key ? `, hotkey ${formatKey(snd.key)}` : ""}`,
        style: { "--led": led(snd.color) },
        dataset: { id: snd.id }
      },
      h(
        "div",
        { class: "pad-top" },
        h("span", { class: "pad-name" }, name),
        snd.key ? h("span", { class: `kbd${conflict ? " conflict" : ""}`, title: conflict ? "Another app already uses this hotkey" : "" }, formatKey(snd.key)) : null
      ),
      h("span", { class: "pad-gap" }),
      h(
        "div",
        { class: "pad-foot" },
        missing
          ? h("span", { class: "warn" }, "File missing")
          : h("span", { class: "dur num" }, fmtDuration(snd.end - snd.start)),
        store.state.view === "list" ? h("span", { class: "num" }, fmtDb(snd.gain)) : null,
        h("span", { title: MODE_LABEL[snd.mode] }, icon(MODE_ICON[snd.mode]))
      ),
      bar
    );

    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      el.classList.add("pressed");
      if (snd.mode === "hold") {
        app.actions.select(snd.id);
        app.actions.fire(snd, "down");
      }
    });
    const release = () => {
      if (!el.classList.contains("pressed")) return;
      el.classList.remove("pressed");
      if (snd.mode === "hold") app.actions.fire(snd, "up");
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointerleave", release);
    el.addEventListener("click", () => {
      app.actions.select(snd.id);
      if (snd.mode !== "hold") app.actions.fire(snd);
    });
    el.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
        e.preventDefault();
        app.actions.select(snd.id);
        app.actions.fire(snd, "down");
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        moveFocus(el, e.key);
      }
    });
    el.addEventListener("keyup", (e) => {
      if ((e.key === "Enter" || e.key === " ") && snd.mode === "hold") app.actions.fire(snd, "up");
    });
    el.addEventListener("focus", () => app.actions.select(snd.id, { quiet: true }));
    el.addEventListener("contextmenu", (e) => padMenu(e, snd));

    el.addEventListener("dragstart", (e) => {
      app.drag.sound = snd.id;
      el.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", snd.id);
    });
    el.addEventListener("dragend", () => {
      app.drag.sound = "";
      el.classList.remove("dragging", "pressed");
    });
    el.addEventListener("dragover", (e) => {
      if (!app.drag.sound || app.drag.sound === snd.id) return;
      e.preventDefault();
      el.classList.add("insert-before");
    });
    el.addEventListener("dragleave", () => el.classList.remove("insert-before"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("insert-before");
      if (app.drag.sound) app.actions.reorder(app.drag.sound, snd.id);
    });

    els.set(snd.id, { el, bar });
    return el;
  }

  function moveFocus(from, key) {
    const pads = [...grid.querySelectorAll(".pad")];
    const i = pads.indexOf(from);
    let cols = 1;
    if (store.state.view === "grid" && pads.length > 1) {
      const top = pads[0].offsetTop;
      cols = pads.findIndex((p) => p.offsetTop !== top);
      if (cols < 1) cols = pads.length;
    }
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[key];
    pads[Math.max(0, Math.min(pads.length - 1, i + step))]?.focus();
  }

  function emptyState() {
    if (store.state.sounds.length === 0) {
      const b = h("button", { class: "btn primary", type: "button" }, icon("i-plus"), "Add sounds");
      b.addEventListener("click", () => app.actions.addSounds());
      return h(
        "div",
        { class: "empty" },
        h("h2", {}, "No sounds yet"),
        h("p", {}, "Add MP3, WAV, OGG, FLAC or M4A files, or drop them anywhere on this window. Give each one a hotkey and fire it from any game."),
        h("div", { class: "row" }, b)
      );
    }
    if (ui.query) return h("div", { class: "empty" }, h("h2", {}, "No matches"), h("p", {}, `Nothing here is called “${ui.query}”.`));
    return h("div", { class: "empty" }, h("h2", {}, "This board is empty"), h("p", {}, "Drag pads onto it from the rail, or right-click a pad and choose Move to."));
  }

  function render() {
    const s = store.state;
    const list = visible();
    title.textContent = boardName();
    count.textContent = ui.query ? `${list.length} of ${s.sounds.length}` : `${list.length}`;
    grid.dataset.size = s.padSize;
    grid.classList.toggle("list", s.view === "list");
    gridBtn.setAttribute("aria-pressed", String(s.view === "grid"));
    listBtn.setAttribute("aria-pressed", String(s.view === "list"));
    sizeBtns.forEach((b, i) => {
      b.setAttribute("aria-pressed", String(["s", "m", "l"][i] === s.padSize));
      b.hidden = s.view === "list";
    });
    els.clear();
    painted.clear();
    if (list.length === 0) {
      grid.replaceChildren();
      scroller.replaceChildren(emptyState());
      return;
    }
    if (scroller.firstChild !== grid) scroller.replaceChildren(grid);
    grid.replaceChildren(...list.map(pad));
  }

  /** Called every animation frame while something plays. */
  function paint() {
    const playing = engine.playingIds();
    for (const id of painted) {
      if (playing.has(id)) continue;
      const p = els.get(id);
      if (p) {
        p.el.classList.remove("playing");
        p.bar.style.transform = "scaleX(0)";
      }
      painted.delete(id);
    }
    for (const id of playing) {
      const p = els.get(id);
      if (!p) continue;
      const prog = engine.progress(id);
      p.el.classList.add("playing");
      p.bar.style.transform = `scaleX(${(prog ?? 0).toFixed(4)})`;
      painted.add(id);
    }
  }

  function updateSelection() {
    for (const [id, p] of els) p.el.setAttribute("aria-selected", id === ui.selectedId ? "true" : "false");
  }

  render();
  return { render, paint, updateSelection, visible, focusPad: (id) => els.get(id)?.el.focus() };
}
