// Centre deck: toolbar + pad grid / list. Playback progress is painted by app's frame loop
// through `paint()`, which only touches pads that are playing.
import { h, icon, led, fmtDuration, openMenu, fmtDb } from "./dom.js";
import { formatKey } from "../keys.js";
import { baseName, bankLetter, slotSounds } from "../model.js";

const MODE_LABEL = { restart: "Restart", overlap: "Overlap", toggle: "Toggle", loop: "Loop", hold: "Hold" };

export function createPads(root, app) {
  const { store, engine, ui } = app;
  const els = new Map(); // id -> { el, bar }
  const painted = new Set();

  const title = h("h1");
  const letter = h("span", { class: "title-letter num", hidden: true });
  const bankKeys = h("div", { class: "bank-keys", role: "group", "aria-label": "Banks" });
  const notice = h("div", { class: "deck-notice" });
  const recBtn = h("button", { class: "btn", type: "button", title: "Record from your mic (Ctrl R)" }, icon("i-record"), "Record");
  recBtn.addEventListener("click", () => app.actions.record());
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
      h("div", { class: "deck-title" }, letter, title, count, bankKeys),
      h("div", { class: "deck-tools" }, h("span", { class: "sizes" }, ...sizeBtns), h("span", { class: "sep sizes-sep" }), gridBtn, listBtn, h("span", { class: "sep" }), recBtn, addBtn)
    ),
    notice,
    scroller
  );

  function visible() {
    const s = store.state;
    const q = ui.query.trim().toLowerCase();
    let pool = s.sounds;
    if (ui.board === "recent") {
      const byId = new Map(s.sounds.map((x) => [x.id, x]));
      pool = s.recent.map((id) => byId.get(id)).filter(Boolean);
    }
    return pool.filter((snd) => {
      if (ui.board === "fav") {
        if (!snd.fav) return false;
      } else if (ui.board !== "all" && ui.board !== "recent" && snd.folderId !== ui.board) return false;
      if (!q) return true;
      return (snd.name || baseName(snd.path)).toLowerCase().includes(q) || formatKey(snd.key).toLowerCase().includes(q);
    });
  }

  function boardName() {
    if (ui.board === "all") return "All sounds";
    if (ui.board === "") return "Unsorted";
    if (ui.board === "fav") return "Favorites";
    if (ui.board === "recent") return "Recent";
    return store.state.folders.find((f) => f.id === ui.board)?.name || "Board";
  }

  function padMenu(e, snd) {
    e.preventDefault();
    app.actions.select(snd.id);
    const boards = store.state.folders.filter((f) => f.id !== snd.folderId);
    openMenu(e.clientX, e.clientY, [
      { label: engine.isPlaying(snd.id) ? "Stop" : "Play", icon: engine.isPlaying(snd.id) ? "i-stop" : "i-play", run: () => (engine.isPlaying(snd.id) ? engine.stop(snd.id) : app.actions.fire(snd)) },
      { label: "Set hotkey", icon: "i-key", run: () => app.actions.captureKey(snd.id) },
      { label: snd.fav ? "Remove from favorites" : "Add to favorites", icon: "i-star", run: () => app.actions.toggleFav(snd.id) },
      "-",
      ...(boards.length || snd.folderId ? [{ title: "Move to" }] : []),
      ...(snd.folderId ? [{ label: "Unsorted", run: () => app.actions.moveToBoard([snd.id], "") }] : []),
      ...boards.map((f) => ({ label: f.name, icon: "i-board", run: () => app.actions.moveToBoard([snd.id], f.id) })),
      "-",
      { label: "Remove", icon: "i-trash", danger: true, kbd: "Del", run: () => app.actions.remove(snd.id) }
    ]);
  }

  /** Groove band width is proportional to clip length: a rimshot is a thin ring, a sting a wide one. */
  function groovePct(seconds) {
    const d = Number.isFinite(seconds) ? seconds : 0;
    return (8 + Math.min(1, d / 6) * 28).toFixed(1); // 8% ring for a blip, 36% for 6 s and longer
  }

  function pad(snd, slot, index) {
    const missing = app.missing.has(snd.id);
    const conflict = app.keyFailed.has(snd.id);
    const voided = missing && !app.voidSeen.has(snd.id); // VOID = the pressing cannot play
    const name = snd.name || baseName(snd.path);
    const length = snd.end - snd.start;
    const catalog = `SD-${String(slot || index + 1).padStart(2, "0")}`;
    const bar = h("i", { class: "pad-progress" });
    const el = h(
      "div",
      {
        class: `pad${missing ? " missing" : ""}`,
        role: "option",
        tabindex: "0",
        draggable: "true",
        "aria-selected": ui.selectedId === snd.id ? "true" : "false",
        "aria-label": `${name}${snd.key ? `, hotkey ${formatKey(snd.key)}` : ""}${slot ? `, Numpad ${slot}` : ""}`,
        style: { "--led": led(snd.color), "--groove": `${groovePct(length)}%` },
        dataset: { id: snd.id }
      },
      // the pressing: grooves (width = length), the white label with its catalog number and cue sticker
      h(
        "div",
        { class: "disc", "aria-hidden": "true" },
        h("span", { class: "label" }, h("span", { class: "cat num" }, catalog), h("span", { class: "spindle" })),
        h("span", { class: "pip" })
      ),
      h(
        "div",
        { class: "pad-body" },
        h("span", { class: "pad-name" }, name),
        // one catalog-sheet data row under the name: slot · length · mode ... keycap
        h(
          "div",
          { class: "pad-status" },
          slot ? h("span", { class: "slot num", title: `Numpad ${slot}` }, `N${slot}`) : null,
          missing ? h("span", { class: "warn" }, "File missing") : h("span", { class: "dur num" }, fmtDuration(length)),
          h("span", { class: "mode num", title: MODE_LABEL[snd.mode] }, MODE_LABEL[snd.mode].toLowerCase()),
          store.state.view === "list" ? h("span", { class: "gain num" }, fmtDb(snd.gain)) : null,
          h("span", { class: "grow" }),
          snd.key
            ? h("span", { class: `kbd${conflict ? " conflict" : ""}`, title: conflict ? "This hotkey isn’t active: another app owns it, or Numpad slots or push-to-talk use it" : "" }, formatKey(snd.key))
            : h("span", { class: "kbd-empty", "aria-hidden": "true" })
        )
      ),
      voided ? h("span", { class: "void", title: missing ? "The file is missing. Open the pad to see why." : "This hotkey is off. Open the pad to see why." }, "Void") : null,
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
    if (ui.board === "fav") return h("div", { class: "empty" }, h("h2", {}, "No favorites yet"), h("p", {}, "Right-click a pad and choose Add to favorites, or use the star in the editor."));
    if (ui.board === "recent") return h("div", { class: "empty" }, h("h2", {}, "Nothing played yet"), h("p", {}, "The last sixteen sounds you fire show up here."));
    return h("div", { class: "empty" }, h("h2", {}, "This bank is empty"), h("p", {}, "Drag pads onto it in the rail, record a clip, or right-click a pad and choose Move to. Its first nine pads become Numpad slots."));
  }

  /** Setup card: point new users at a virtual cable, or offer one we found. */
  function renderNotice() {
    const s = store.state;
    notice.replaceChildren();
    if (s.outputs.cableId || s.cableTipDismissed || ui.compact) return;
    const found = app.devices.outputs.find((d) => /cable|vb-audio|voicemeeter|virtual/i.test(d.label));
    const dismiss = h("button", { class: "btn ghost", type: "button" }, "Not now");
    dismiss.addEventListener("click", () => store.update((x) => (x.cableTipDismissed = true), "outputs"));
    let action = null;
    let text;
    if (found) {
      action = h("button", { class: "btn primary", type: "button" }, `Use ${found.label.split(" (")[0]}`);
      action.addEventListener("click", () => {
        store.update((x) => (x.outputs.cableId = found.deviceId), "outputs");
        engine.setOutputs(store.state.outputs);
      });
      text = "Found a virtual cable. Send sounds to it, then pick it as your microphone in Discord or OBS.";
    } else if (!app.devices.labelled && app.devices.outputs.length) {
      text = "Open the Cable menu above and choose Show device names to find your virtual cable.";
    } else {
      text = "To play sounds into Discord or a game, install a free virtual cable such as VB-CABLE, then pick it under Cable above and as your mic in the voice app.";
    }
    notice.append(h("div", { class: "notice" }, icon("i-cable"), h("div", { class: "notice-copy" }, h("strong", {}, "Send sounds into voice chat"), h("span", {}, text)), action, dismiss));
  }

  function render() {
    const s = store.state;
    const list = visible();
    title.textContent = boardName();
    const bi = s.folders.findIndex((f) => f.id === ui.board);
    letter.hidden = bi < 0;
    letter.textContent = bi < 0 ? "" : bankLetter(bi);
    letter.classList.toggle("active", bi >= 0 && s.activeBank === ui.board);
    // compact mode: the rail is hidden, so banks get their own keys beside the title
    bankKeys.replaceChildren(
      ...(ui.compact && s.folders.length > 1
        ? s.folders.map((f, i) => {
            const key = h(
              "button",
              { class: "bank-key", type: "button", "aria-pressed": String(s.activeBank === f.id), title: f.name },
              h("span", { class: "bank-led", "aria-hidden": "true" }),
              bankLetter(i)
            );
            key.addEventListener("click", () => app.actions.setActiveBank(f.id, { show: true }));
            return key;
          })
        : [])
    );
    const slots = s.slotKeys ? new Map(slotSounds(s, s.activeBank).map((x, i) => [x.id, i + 1])) : new Map();
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
      renderNotice();
      return;
    }
    if (scroller.firstChild !== grid) scroller.replaceChildren(grid);
    grid.replaceChildren(...list.map((snd, i) => pad(snd, slots.get(snd.id), i)));
    renderNotice();
  }

  /** Called every animation frame while something plays. */
  function paint() {
    const playing = engine.playingIds();
    for (const id of painted) {
      if (playing.has(id)) continue;
      const p = els.get(id);
      if (p) {
        p.el.classList.remove("playing");
        p.el.style.removeProperty("--p");
        p.bar.style.transform = "scaleX(0)";
      }
      painted.delete(id);
    }
    for (const id of playing) {
      const p = els.get(id);
      if (!p) continue;
      const prog = engine.progress(id);
      p.el.classList.add("playing");
      p.el.style.setProperty("--p", `${((prog ?? 0) * 360).toFixed(1)}deg`);
      p.bar.style.transform = `scaleX(${(prog ?? 0).toFixed(4)})`;
      painted.add(id);
    }
  }

  function updateSelection() {
    for (const [id, p] of els) p.el.setAttribute("aria-selected", id === ui.selectedId ? "true" : "false");
  }

  render();
  return { render, renderNotice, paint, updateSelection, visible, focusPad: (id) => els.get(id)?.el.focus() };
}
