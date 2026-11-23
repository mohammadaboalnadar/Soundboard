// Bootstrap and controller: owns UI state, actions, hotkey sync and the frame loop.
import { platform } from "./platform.js";
import { createStore } from "./store.js";
import { createEngine } from "./engine.js";
import { newSound, uid, baseName } from "./model.js";
import { acceleratorFromEvent, assignKey } from "./keys.js";
import { autoLevelGain } from "./peaks.js";
import { toast } from "./ui/dom.js";
import { createTransport } from "./ui/transport.js";
import { createRail } from "./ui/rail.js";
import { createPads } from "./ui/pads.js";
import { createInspector } from "./ui/inspector.js";
import { createPalette } from "./ui/palette.js";

const STOP_ALL = "__stop_all__";

async function main() {
  const store = createStore(platform);
  await store.load();
  document.documentElement.dataset.theme = store.state.theme;

  const engine = createEngine({ fileUrl: platform.fileUrl, cacheMB: store.state.cacheMB });
  engine.setOutputs(store.state.outputs);

  const ui = { board: "all", query: "", selectedId: "", capture: "" };
  const app = {
    store,
    engine,
    platform,
    ui,
    missing: new Set(),
    keyFailed: new Set(),
    loudness: new Map(),
    drag: { sound: "", ids: () => (app.drag.sound ? [app.drag.sound] : []) },
    actions: {}
  };

  const byId = (id) => store.state.sounds.find((s) => s.id === id);

  // ---------- actions ----------

  const A = app.actions;

  A.select = (id, { quiet = false } = {}) => {
    if (ui.selectedId === id) return;
    ui.selectedId = id;
    if (ui.capture && ui.capture !== STOP_ALL) A.cancelCapture();
    store.emit(quiet ? "select-quiet" : "select");
  };

  A.fire = (snd, state = "down", opts = {}) => {
    if (!snd) return;
    if (app.missing.has(snd.id)) {
      if (state === "down") toast(`“${snd.name || baseName(snd.path)}” can’t play: the file is missing.`, { error: true });
      return;
    }
    engine.trigger(snd, { state, ...opts });
  };

  A.playFirstVisible = () => {
    const first = pads.visible()[0];
    if (first) A.fire(first);
  };

  A.addSounds = async () => {
    const paths = await platform.pickAudioFiles();
    if (paths?.length) await A.addPaths(paths);
  };

  A.addPaths = async (paths) => {
    const known = new Set(store.state.sounds.map((s) => s.path.toLowerCase()));
    const fresh = paths.filter((p) => !known.has(p.toLowerCase()) && /\.(mp3|wav|ogg|oga|opus|flac|m4a|aac|webm)$/i.test(p));
    if (!fresh.length) {
      if (paths.length) toast("Those files are already on the board, or aren’t audio.");
      return;
    }
    await platform.allowPaths(fresh);
    const folderId = ui.board === "all" ? "" : ui.board;
    const added = fresh.map((p) => ({ ...newSound(p, 0), folderId }));
    store.update((s) => s.sounds.push(...added), "sounds");
    if (added.length === 1) A.select(added[0].id);
    for (const s of added) queueAnalysis(s.id);
  };

  A.remove = (id) => {
    const index = store.state.sounds.findIndex((s) => s.id === id);
    if (index < 0) return;
    const removed = store.state.sounds[index];
    engine.stop(id, { fade: false });
    engine.invalidate(id);
    store.update((s) => s.sounds.splice(index, 1), "sounds");
    if (ui.selectedId === id) A.select("");
    syncHotkeys();
    toast(`Removed “${removed.name || baseName(removed.path)}”`, {
      action: "Undo",
      onAction: () => {
        store.update((s) => s.sounds.splice(Math.min(index, s.sounds.length), 0, removed), "sounds");
        syncHotkeys();
      }
    });
  };

  A.newBoard = () => {
    const names = new Set(store.state.folders.map((f) => f.name));
    let name = "New board";
    for (let i = 2; names.has(name); i++) name = `New board ${i}`;
    const id = uid();
    store.update((s) => s.folders.push({ id, name, collapsed: false }), "folders");
    ui.board = id;
    store.emit("board");
    rail.startRename(id);
  };

  A.deleteBoard = (id) => {
    const index = store.state.folders.findIndex((f) => f.id === id);
    if (index < 0) return;
    const board = store.state.folders[index];
    const members = store.state.sounds.filter((s) => s.folderId === id).map((s) => s.id);
    store.update((s) => {
      s.folders.splice(index, 1);
      for (const snd of s.sounds) if (snd.folderId === id) snd.folderId = "";
    }, "folders");
    if (ui.board === id) {
      ui.board = "all";
      store.emit("board");
    }
    toast(`Deleted board “${board.name}”. Its sounds moved to Unsorted.`, {
      action: "Undo",
      onAction: () =>
        store.update((s) => {
          s.folders.splice(index, 0, board);
          for (const snd of s.sounds) if (members.includes(snd.id)) snd.folderId = id;
        }, "folders")
    });
  };

  A.moveToBoard = (ids, folderId) => {
    store.update((s) => {
      for (const snd of s.sounds) if (ids.includes(snd.id)) snd.folderId = folderId;
    }, "folders");
  };

  A.reorder = (dragId, beforeId) => {
    store.update((s) => {
      const from = s.sounds.findIndex((x) => x.id === dragId);
      if (from < 0) return;
      const [moved] = s.sounds.splice(from, 1);
      const to = s.sounds.findIndex((x) => x.id === beforeId);
      if (ui.board !== "all") moved.folderId = ui.board;
      s.sounds.splice(to < 0 ? s.sounds.length : to, 0, moved);
    }, "sounds");
  };

  A.reorderBoard = (dragId, beforeId) => {
    store.update((s) => {
      const from = s.folders.findIndex((f) => f.id === dragId);
      if (from < 0) return;
      const [moved] = s.folders.splice(from, 1);
      const to = s.folders.findIndex((f) => f.id === beforeId);
      s.folders.splice(to < 0 ? s.folders.length : to, 0, moved);
    }, "folders");
  };

  A.toggleTheme = () => {
    store.update((s) => (s.theme = s.theme === "light" ? "dark" : "light"), "theme");
    document.documentElement.dataset.theme = store.state.theme;
    inspector.redraw();
  };

  A.captureKey = (id) => {
    ui.capture = id;
    platform.setHotkeys({}); // release global keys so the window can see the press
    if (id === STOP_ALL) toast("Press the key combination for Stop all. Esc cancels.", { ms: 4000 });
    store.emit("keys");
  };

  A.cancelCapture = () => {
    ui.capture = "";
    syncHotkeys(true);
    store.emit("keys");
  };

  A.setKey = (id, acc) => {
    store.update((s) => {
      if (id === STOP_ALL) {
        s.stopAllKey = acc;
        if (acc) s.sounds = s.sounds.map((x) => (x.key === acc ? { ...x, key: "" } : x));
      } else {
        s.sounds = assignKey(s.sounds, id, acc);
        if (acc && s.stopAllKey === acc) s.stopAllKey = "";
      }
    }, "keys");
    ui.capture = "";
    syncHotkeys(true);
    store.emit("keys");
  };

  // ---------- views ----------

  const transport = createTransport(document.getElementById("transport"), app);
  const rail = createRail(document.getElementById("rail"), app);
  const pads = createPads(document.getElementById("deck"), app);
  const inspector = createInspector(document.getElementById("inspector"), app);
  const palette = createPalette(document.getElementById("palette"), app);

  store.subscribe((hint) => {
    switch (hint) {
      case "sound-quiet":
        break;
      case "select-quiet":
        pads.updateSelection();
        inspector.render();
        break;
      case "select":
        pads.updateSelection();
        inspector.render();
        break;
      case "filter":
        pads.render();
        break;
      case "board":
      case "folders":
        rail.render();
        pads.render();
        break;
      case "view":
        pads.render();
        break;
      case "outputs":
      case "mic":
      case "theme":
        transport.render();
        break;
      case "keys":
        transport.render();
        pads.render();
        inspector.render();
        break;
      default:
        rail.render();
        pads.render();
        inspector.render();
    }
    kick();
  });

  // ---------- hotkeys ----------

  let lastKeyMap = "";
  async function syncHotkeys(force = false) {
    if (ui.capture) return;
    const map = {};
    for (const s of store.state.sounds) if (s.key) map[s.id] = s.key;
    if (store.state.stopAllKey) map[STOP_ALL] = store.state.stopAllKey;
    const sig = JSON.stringify(map);
    if (!force && sig === lastKeyMap) return;
    lastKeyMap = sig;
    try {
      const res = await platform.setHotkeys(map);
      const failed = new Set(res?.failed || []);
      const changed = failed.size !== app.keyFailed.size || [...failed].some((id) => !app.keyFailed.has(id));
      app.keyFailed = failed;
      if (changed) store.emit("keys");
    } catch (e) {
      console.warn("hotkeys", e);
    }
  }
  store.subscribe((hint) => {
    if (hint === "sounds" || hint === "keys" || hint === "all") syncHotkeys();
  });

  await platform.onHotkey(({ id, state }) => {
    if (id === STOP_ALL) {
      if (state === "down") engine.stopAll();
      return;
    }
    const snd = byId(id);
    if (snd) A.fire(snd, state);
  });

  // ---------- keyboard inside the window ----------

  addEventListener(
    "keydown",
    (e) => {
      if (ui.capture) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") return A.cancelCapture();
        if ((e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && !e.altKey) return A.setKey(ui.capture, "");
        const acc = acceleratorFromEvent(e);
        if (acc) A.setKey(ui.capture, acc);
        return;
      }
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        palette.isOpen() ? palette.close() : palette.open();
      } else if (e.ctrlKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        rail.focusSearch();
      } else if (e.ctrlKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        A.addSounds();
      } else if (typing || palette.isOpen()) {
        return;
      } else if (e.key === "Escape") {
        engine.stopAll();
      } else if (e.key === "Delete" && ui.selectedId) {
        A.remove(ui.selectedId);
      }
    },
    true
  );

  // ---------- engine events ----------

  engine.on("voicestart", kick);
  engine.on("voiceend", kick);
  engine.on("cache", () => renderStatus());
  engine.on("outputs", () => transport.render());
  engine.on("error", (e) => {
    if (e.scope === "cable") toast("The cable output isn’t available. Sounds will play on your monitor only.", { error: true });
    else if (e.scope === "mic") toast(`Microphone: ${e.message}`, { error: true });
    else if (e.scope === "play") {
      const snd = byId(e.id);
      toast(`Couldn’t play “${snd ? snd.name || baseName(snd.path) : "sound"}”. ${e.message}`, { error: true });
    }
    transport.render();
  });
  engine.on("measured", ({ id, rmsDb, peakDb }) => {
    app.loudness.set(id, { rmsDb, peakDb });
    const snd = byId(id);
    if (!snd) return;
    const g = autoLevelGain({ rmsDb, peakDb });
    if (Math.abs(g - snd.normGain) > 0.001) store.update(() => (snd.normGain = g), "sound-quiet");
  });

  // ---------- analysis queue ----------

  const queue = [];
  let analyzing = false;
  function queueAnalysis(id) {
    if (!queue.includes(id)) queue.push(id);
    if (!analyzing) runQueue();
  }
  async function runQueue() {
    analyzing = true;
    while (queue.length) {
      const id = queue.shift();
      const snd = byId(id);
      if (!snd || app.missing.has(id)) continue;
      try {
        const r = await engine.analyze(snd);
        app.loudness.set(id, { rmsDb: r.rmsDb, peakDb: r.peakDb });
        store.update(() => {
          snd.duration = r.duration;
          if (!(snd.end > 0) || snd.end > r.duration) snd.end = r.duration;
          if (snd.start >= snd.end) snd.start = 0;
          snd.peaks = r.peaks;
          snd.normGain = autoLevelGain(r);
        }, "sound");
      } catch (e) {
        app.missing.add(id);
        store.emit("sound");
      }
    }
    analyzing = false;
    engine.preload(store.state.sounds.filter((s) => s.key && !app.missing.has(s.id)));
  }

  // ---------- file drop ----------

  const veil = document.getElementById("drop-veil");
  await platform.onFileDrop(({ type, paths }) => {
    veil.hidden = type !== "over";
    if (type === "drop" && paths?.length) A.addPaths(paths);
  });

  // ---------- status bar + frame loop ----------

  const statusEl = document.getElementById("status");
  function renderStatus() {
    const st = engine.stats();
    const pct = Math.min(1, st.cacheBytes / st.budget);
    statusEl.innerHTML = "";
    const item = (...nodes) => {
      const d = document.createElement("span");
      d.className = "item";
      d.append(...nodes);
      return d;
    };
    const bar = document.createElement("span");
    bar.className = "cachebar";
    const fill = document.createElement("i");
    fill.style.transform = `scaleX(${pct.toFixed(3)})`;
    bar.append(fill);
    const num = (t) => {
      const s = document.createElement("span");
      s.className = "num";
      s.textContent = t;
      return s;
    };
    statusEl.append(
      item("Audio cache", bar, num(`${(st.cacheBytes / 1048576).toFixed(1)} / ${Math.round(st.budget / 1048576)} MB`)),
      item(num(String(st.voices)), st.voices === 1 ? "voice" : "voices"),
      Object.assign(document.createElement("span"), { className: "grow" }),
      item("Ctrl K", " commands"),
      item("Esc", " stops everything")
    );
  }

  let raf = 0;
  let lastVoices = -1;
  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame() {
    raf = 0;
    pads.paint();
    inspector.paint();
    const active = engine.hasActivity();
    const decaying = transport.setMeters(engine.meters(), active);
    const v = engine.stats().voices;
    if (v !== lastVoices) {
      lastVoices = v;
      renderStatus();
    }
    if (active || decaying) kick();
  }

  // ---------- startup ----------

  renderStatus();
  const paths = store.state.sounds.map((s) => s.path);
  if (paths.length) {
    try {
      const exists = await platform.checkPaths(paths);
      store.state.sounds.forEach((s, i) => exists[i] === false && app.missing.add(s.id));
    } catch {}
  }
  store.emit("all");
  if (store.state.mic.enabled) engine.setMic(store.state.mic);
  for (const s of store.state.sounds) if (!s.peaks || !(s.duration > 0)) queueAnalysis(s.id);
  if (!queue.length) engine.preload(store.state.sounds.filter((s) => s.key && !app.missing.has(s.id)));
  addEventListener("beforeunload", () => store.flush());
  window.__app = app;
}

main().catch((e) => {
  console.error(e);
  document.body.textContent = `Soundboard failed to start: ${e.message}`;
});
