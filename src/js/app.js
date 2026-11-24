// Sonic Dominion: bootstrap and controller. Owns UI state, actions, hotkey sync,
// push-to-talk, the phone remote bridge and the frame loop.
import { platform } from "./platform.js";
import { createStore } from "./store.js";
import { createEngine, ANALYZE_MAX_SECONDS } from "./engine.js";
import { newSound, uid, baseName, bankLetter, slotSounds, cycleBank, SLOT_COUNT } from "./model.js";
import { acceleratorFromEvent, assignKey } from "./keys.js";
import { resolveBindings } from "./bindings.js";
import { autoLevelGain } from "./peaks.js";
import { toast } from "./ui/dom.js";
import { createTransport } from "./ui/transport.js";
import { createRail } from "./ui/rail.js";
import { createPads } from "./ui/pads.js";
import { createInspector } from "./ui/inspector.js";
import { createPalette } from "./ui/palette.js";
import { createStatus } from "./ui/status.js";
import { createSettings } from "./ui/settings.js";
import { createRecorder } from "./ui/recorder.js";

const STOP_ALL = "__stop_all__";
const PTT_KEY = "__ptt__";
const SLOT_IDS = Array.from({ length: SLOT_COUNT }, (_, i) => `__slot_${i + 1}`);
const BANK_NEXT = "__bank_next";
const BANK_PREV = "__bank_prev";
const SLOT_MAP = {
  ...Object.fromEntries(SLOT_IDS.map((id, i) => [id, `Numpad${i + 1}`])),
  [BANK_NEXT]: "NumpadAdd",
  [BANK_PREV]: "NumpadSubtract"
};

async function main() {
  const store = createStore(platform);
  await store.load();
  const S = () => store.state;
  document.documentElement.dataset.theme = S().theme;

  const engine = createEngine({ fileUrl: platform.fileUrl, cacheMB: S().cacheMB });
  engine.setOutputs(S().outputs);

  const ui = { board: "all", query: "", selectedId: "", capture: "", compact: false, remoteUrl: "" };
  const app = {
    store,
    engine,
    platform,
    ui,
    missing: new Set(),
    voidSeen: new Set(), // VOID stamps stay until the pad is opened
    keyFailed: new Set(),
    loudness: new Map(),
    devices: { outputs: [], inputs: [], labelled: false },
    drag: { sound: "", ids: () => (app.drag.sound ? [app.drag.sound] : []) },
    actions: {}
  };

  const byId = (id) => S().sounds.find((s) => s.id === id);
  const A = app.actions;

  // ---------- selection & playback ----------

  A.select = (id, { quiet = false } = {}) => {
    if (ui.selectedId === id) return;
    if (id && !app.voidSeen.has(id) && (app.missing.has(id) || app.keyFailed.has(id))) {
      app.voidSeen.add(id);
      queueMicrotask(() => store.emit("view"));
    }
    ui.selectedId = id;
    if (ui.capture && ui.capture !== STOP_ALL && ui.capture !== PTT_KEY) A.cancelCapture();
    store.emit(quiet ? "select-quiet" : "select");
  };

  // push-to-talk: press before the first cable voice, release shortly after the last
  let pttDown = false;
  let pttRelease = 0;
  let firesInFlight = 0; // a release must never land while a start is still loading
  async function pttEngage() {
    clearTimeout(pttRelease);
    if (!S().ptt.key || !S().outputs.cableId || pttDown) return false;
    pttDown = true;
    try {
      await platform.pttSet(true);
    } catch (e) {
      pttDown = false;
      toast(`Push-to-talk: ${e}`, { error: true });
      return false;
    }
    return true;
  }
  function pttScheduleRelease() {
    clearTimeout(pttRelease);
    pttRelease = setTimeout(() => {
      if (pttDown && !engine.isCableActive() && firesInFlight === 0) {
        pttDown = false;
        platform.pttSet(false).catch(() => {});
      }
    }, 250);
  }
  engine.on("cable", ({ active }) => (active ? clearTimeout(pttRelease) : pttScheduleRelease()));

  A.fire = async (snd, state = "down", opts = {}) => {
    if (!snd) return;
    if (app.missing.has(snd.id)) {
      if (state === "down") toast(`“${snd.name || baseName(snd.path)}” can’t play: the file is missing.`, { error: true });
      return;
    }
    firesInFlight++;
    try {
      // the lead-in runs inside the engine, so a release or Stop all during it cancels the start
      const delayMs = state === "down" && !opts.monitorOnly && (await pttEngage()) ? S().ptt.leadMs : 0;
      await engine.trigger(snd, { state, ...opts, delayMs });
    } finally {
      firesInFlight--;
    }
    if (pttDown && !engine.isCableActive()) pttScheduleRelease();
    if (state === "down" && engine.isPlaying(snd.id)) noteRecent(snd.id);
  };

  // which sound each slot key started, so its release reaches that sound even after a bank switch
  const heldSlots = new Map();

  function noteRecent(id) {
    const r = S().recent;
    if (r[0] === id) return;
    store.update((s) => (s.recent = [id, ...s.recent.filter((x) => x !== id)].slice(0, 16)), "recent");
  }

  A.playFirstVisible = () => {
    const first = pads.visible()[0];
    if (first) A.fire(first);
  };

  A.fireSlot = (n) => {
    const snd = slotSounds(S(), S().activeBank)[n - 1];
    if (snd) A.fire(snd);
  };

  A.setActiveBank = (id, { show = false } = {}) => {
    if (S().activeBank !== id) store.update((s) => (s.activeBank = id), "bank");
    if (show || ui.compact) {
      ui.board = id;
      store.emit("board");
    }
  };

  A.cycleBank = (dir) => {
    const next = cycleBank(S(), S().activeBank, dir);
    if (!next) return;
    A.setActiveBank(next);
    const i = S().folders.findIndex((f) => f.id === next);
    toast(`Bank ${bankLetter(i)} · ${S().folders[i].name}`, { ms: 1400 });
  };

  // ---------- library ----------

  A.addSounds = async () => {
    const paths = await platform.pickAudioFiles();
    if (paths?.length) await A.addPaths(paths);
  };

  A.addPaths = async (paths, { names = [] } = {}) => {
    const known = new Set(S().sounds.map((s) => s.path.toLowerCase()));
    const fresh = paths.filter((p) => !known.has(p.toLowerCase()) && /\.(mp3|wav|ogg|oga|opus|flac|m4a|aac|webm)$/i.test(p));
    if (!fresh.length) {
      if (paths.length) toast("Those files are already on the board, or aren’t audio.");
      return [];
    }
    await platform.allowPaths(fresh);
    // new sounds land in the bank on screen; from All / Favorites / Recent they go to Unsorted
    const folderId = S().folders.some((f) => f.id === ui.board) ? ui.board : "";
    const added = fresh.map((p, i) => ({ ...newSound(p, 0), folderId, ...(names[i] ? { name: names[i] } : {}) }));
    store.update((s) => s.sounds.push(...added), "sounds");
    if (added.length === 1) A.select(added[0].id);
    for (const s of added) queueAnalysis(s.id);
    return added;
  };

  A.remove = (id) => {
    const index = S().sounds.findIndex((s) => s.id === id);
    if (index < 0) return;
    const removed = S().sounds[index];
    engine.stop(id, { fade: false });
    engine.invalidate(id);
    store.update((s) => s.sounds.splice(index, 1), "sounds");
    if (ui.selectedId === id) A.select("");
    toast(`Removed “${removed.name || baseName(removed.path)}”`, {
      action: "Undo",
      onAction: () => store.update((s) => s.sounds.splice(Math.min(index, s.sounds.length), 0, removed), "sounds")
    });
  };

  A.toggleFav = (id) => {
    const snd = byId(id);
    if (snd) store.update(() => (snd.fav = !snd.fav), "sound");
  };

  A.newBoard = () => {
    const names = new Set(S().folders.map((f) => f.name));
    let name = "New bank";
    for (let i = 2; names.has(name); i++) name = `New bank ${i}`;
    const id = uid();
    store.update((s) => s.folders.push({ id, name, collapsed: false }), "folders");
    A.setActiveBank(id, { show: true });
    rail.startRename(id);
  };

  A.deleteBoard = (id) => {
    const index = S().folders.findIndex((f) => f.id === id);
    if (index < 0) return;
    const board = S().folders[index];
    const members = S().sounds.filter((s) => s.folderId === id).map((s) => s.id);
    const wasActive = S().activeBank === id;
    store.update((s) => {
      s.folders.splice(index, 1);
      for (const snd of s.sounds) if (snd.folderId === id) snd.folderId = "";
      if (wasActive) s.activeBank = s.folders[0]?.id || "";
    }, "folders");
    if (ui.board === id) {
      ui.board = "all";
      store.emit("board");
    }
    toast(`Deleted bank “${board.name}”. Its sounds moved to Unsorted.`, {
      action: "Undo",
      onAction: () =>
        store.update((s) => {
          s.folders.splice(index, 0, board);
          for (const snd of s.sounds) if (members.includes(snd.id)) snd.folderId = id;
          if (wasActive) s.activeBank = id;
        }, "folders")
    });
  };

  A.moveToBoard = (ids, folderId) => store.update((s) => s.sounds.forEach((snd) => ids.includes(snd.id) && (snd.folderId = folderId)), "folders");

  A.reorder = (dragId, beforeId) => {
    store.update((s) => {
      const from = s.sounds.findIndex((x) => x.id === dragId);
      if (from < 0) return;
      const [moved] = s.sounds.splice(from, 1);
      const to = s.sounds.findIndex((x) => x.id === beforeId);
      if (ui.board !== "all" && ui.board !== "fav" && ui.board !== "recent") moved.folderId = ui.board;
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

  // ---------- preferences ----------

  A.setTheme = (theme) => {
    store.update((s) => (s.theme = theme), "theme");
    document.documentElement.dataset.theme = theme;
    inspector.redraw();
  };
  A.toggleTheme = () => A.setTheme(S().theme === "light" ? "dark" : "light");

  A.setCompact = async (on) => {
    ui.compact = on;
    document.getElementById("app").classList.toggle("compact", on);
    if (on && S().folders.length) ui.board = S().activeBank;
    store.emit("board");
    try {
      await platform.setCompact(on);
    } catch (e) {
      toast(`Compact mode: ${e}`, { error: true });
    }
  };

  A.setSlotKeys = (on) => store.update((s) => (s.slotKeys = on), "keys");

  A.setPtt = async (patch) => {
    const next = { ...S().ptt, ...patch };
    try {
      await platform.pttConfigure(next.key);
    } catch (e) {
      toast(String(e), { error: true });
      return;
    }
    store.update((s) => (s.ptt = next), "settings");
  };

  A.setCacheMB = (mb) => {
    store.update((s) => (s.cacheMB = mb), "settings");
    engine.setCacheMB(mb);
  };

  A.setCloseToTray = (on) => {
    store.update((s) => (s.closeToTray = on), "settings");
    platform.setCloseToTray(on);
  };

  A.setMic = (patch) => {
    store.update((s) => Object.assign(s.mic, patch), "mic");
    engine.setMic(S().mic);
  };

  // ---------- phone remote ----------

  const newPin = () => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return String(a[0] % 1_000_000).padStart(6, "0");
  };

  A.setRemote = async (on, { regenerate = false } = {}) => {
    if (!on) {
      await platform.remoteStop();
      ui.remoteUrl = "";
      store.update((s) => (s.remote.enabled = false), "settings");
      return;
    }
    const pin = regenerate || !S().remote.pin ? newPin() : S().remote.pin;
    try {
      const info = await platform.remoteStart(S().remote.port, pin);
      ui.remoteUrl = info.url;
      store.update((s) => Object.assign(s.remote, { enabled: true, pin }), "settings");
      syncRemote(true);
    } catch (e) {
      ui.remoteUrl = "";
      store.update((s) => (s.remote.enabled = false), "settings");
      toast(`Phone remote: ${e}`, { error: true });
    }
  };

  let remoteTimer = 0;
  function syncRemote(now = false) {
    if (!S().remote.enabled) return;
    clearTimeout(remoteTimer);
    remoteTimer = setTimeout(() => {
      const s = S();
      const slots = new Map(slotSounds(s, s.activeBank).map((x, i) => [x.id, i + 1]));
      const snapshot = {
        activeBank: s.folders.length ? s.activeBank : "",
        banks: s.folders.map((f, i) => ({ id: f.id, name: f.name, letter: bankLetter(i) })),
        sounds: s.sounds
          .filter((x) => !app.missing.has(x.id))
          .map((x) => ({ id: x.id, name: x.name || baseName(x.path), color: x.color, bank: x.folderId, mode: x.mode, slot: s.slotKeys ? slots.get(x.id) || 0 : 0 })),
        playing: [...engine.playingIds()]
      };
      platform.remoteSync(JSON.stringify(snapshot)).catch(() => {});
    }, now ? 0 : 200);
  }

  await platform.onRemote(({ action, id }) => {
    if (action === "stopall") return engine.stopAll();
    if (action === "stop" && id) return engine.stop(id);
    if (action === "bank" && id && S().folders.some((f) => f.id === id)) return A.setActiveBank(id);
    if (action === "play" && id) A.fire(byId(id));
  });

  await platform.onTray((what) => what === "stop-all" && engine.stopAll());

  // ---------- hotkey capture ----------

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
    if (id === PTT_KEY) {
      ui.capture = "";
      A.setPtt({ key: acc });
      syncHotkeys(true);
      store.emit("keys");
      return;
    }
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
  const status = createStatus(document.getElementById("status"), app);
  const settings = createSettings(document.getElementById("settings"), app);
  const recorder = createRecorder(app);
  A.openSettings = () => settings.open();
  A.record = () => recorder.start();

  const appEl = document.getElementById("app");
  store.subscribe((hint) => {
    appEl.classList.toggle("no-inspector", !ui.selectedId);
    switch (hint) {
      case "sound-quiet":
        break;
      case "select-quiet":
      case "select":
        pads.updateSelection();
        inspector.render();
        break;
      case "filter":
      case "view":
        pads.render();
        break;
      case "recent":
        rail.render();
        if (ui.board === "recent") pads.render();
        break;
      case "bank":
        rail.render();
        if (S().slotKeys) pads.render();
        syncRemote();
        break;
      case "board":
      case "folders":
        rail.render();
        pads.render();
        syncRemote();
        break;
      case "outputs":
      case "mic":
      case "theme":
        transport.render();
        pads.renderNotice();
        settings.render();
        break;
      case "devices":
        pads.renderNotice();
        settings.render();
        break;
      case "settings":
        settings.render();
        break;
      case "keys":
        transport.render();
        pads.render();
        inspector.render();
        settings.render();
        status.render();
        break;
      default:
        rail.render();
        pads.render();
        inspector.render();
        syncRemote();
    }
    kick();
  });

  // ---------- global hotkeys ----------

  let lastKeyMap = "";
  async function syncHotkeys(force = false) {
    if (ui.capture) return;
    const { map, blocked, pttConflict } = resolveBindings(S(), SLOT_MAP);
    app.pttConflict = pttConflict;
    const sig = JSON.stringify(map);
    if (!force && sig === lastKeyMap) return;
    lastKeyMap = sig;
    try {
      const res = await platform.setHotkeys(map);
      const failed = new Set([...(res?.failed || []), ...blocked]);
      const changed = failed.size !== app.keyFailed.size || [...failed].some((id) => !app.keyFailed.has(id));
      app.keyFailed = failed;
      if (changed) store.emit("keys");
    } catch (e) {
      console.warn("hotkeys", e);
    }
  }
  store.subscribe((hint) => {
    if (hint === "sounds" || hint === "keys" || hint === "all" || hint === "settings") syncHotkeys();
  });

  await platform.onHotkey(({ id, state }) => {
    if (id === STOP_ALL) return state === "down" && engine.stopAll();
    if (id === BANK_NEXT || id === BANK_PREV) return state === "down" && A.cycleBank(id === BANK_NEXT ? 1 : -1);
    const slot = SLOT_IDS.indexOf(id);
    if (slot >= 0) {
      if (state === "up") {
        const held = byId(heldSlots.get(id));
        heldSlots.delete(id);
        return held && A.fire(held, "up");
      }
      const snd = slotSounds(S(), S().activeBank)[slot];
      if (snd) heldSlots.set(id, snd.id);
      return snd && A.fire(snd, state);
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
      const k = e.key.toLowerCase();
      if (e.ctrlKey && !e.shiftKey && !e.altKey && k === "k") {
        e.preventDefault();
        palette.isOpen() ? palette.close() : palette.open();
      } else if (e.ctrlKey && k === "f") {
        e.preventDefault();
        rail.focusSearch();
      } else if (e.ctrlKey && k === "o") {
        e.preventDefault();
        A.addSounds();
      } else if (e.ctrlKey && k === "r") {
        e.preventDefault();
        A.record();
      } else if (e.ctrlKey && (k === "," || e.code === "Comma")) {
        e.preventDefault();
        A.openSettings();
      } else if (typing || palette.isOpen() || settings.isOpen()) {
        return;
      } else if (e.key === "Escape") {
        engine.stopAll();
      } else if (e.key === "Delete" && ui.selectedId) {
        A.remove(ui.selectedId);
      }
    },
    true
  );
  // mouse side buttons can be the push-to-talk key
  addEventListener(
    "pointerdown",
    (e) => {
      if (ui.capture === PTT_KEY && (e.button === 3 || e.button === 4)) {
        e.preventDefault();
        A.setKey(PTT_KEY, e.button === 3 ? "Mouse4" : "Mouse5");
      }
    },
    true
  );

  // ---------- engine events ----------

  engine.on("voicestart", () => {
    kick();
    status.render();
    syncRemote();
  });
  engine.on("voiceend", () => {
    kick();
    status.render();
    syncRemote();
  });
  engine.on("cache", () => status.render());
  engine.on("outputs", () => transport.render());
  engine.on("error", (e) => {
    if (e.scope === "cable") toast("The cable output isn’t available. Sounds will play on your monitor only.", { error: true });
    else if (e.scope === "mic") toast(`Microphone: ${e.message}`, { error: true });
    else if (e.scope === "play") {
      const snd = byId(e.id);
      if (snd && e.missing && !app.missing.has(snd.id)) {
        app.missing.add(snd.id);
        store.emit("sound");
      }
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
      } catch {
        app.missing.add(id);
        store.emit("sound");
      }
    }
    analyzing = false;
    preloadLikely();
  }

  /** Warm the cache with what's likely to fire: hotkeyed sounds and the active bank's slots. */
  function preloadLikely() {
    const s = S();
    const slots = s.slotKeys ? slotSounds(s, s.activeBank) : [];
    const keyed = s.sounds.filter((x) => x.key);
    engine.preload([...slots, ...keyed].filter((x) => !app.missing.has(x.id)));
  }

  // ---------- file drop ----------

  const veil = document.getElementById("drop-veil");
  await platform.onFileDrop(({ type, paths }) => {
    veil.hidden = type !== "over";
    if (type === "drop" && paths?.length) A.addPaths(paths);
  });

  // ---------- frame loop: runs only while something plays or meters decay ----------

  let raf = 0;
  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame() {
    raf = 0;
    pads.paint();
    inspector.paint();
    const active = engine.hasActivity();
    const decaying = transport.setMeters(engine.meters(), active);
    if (active || decaying) kick();
  }

  // ---------- startup ----------

  const paths = S().sounds.map((s) => s.path);
  if (paths.length) {
    try {
      const exists = await platform.checkPaths(paths);
      S().sounds.forEach((s, i) => exists[i] === false && app.missing.add(s.id));
    } catch {}
  }
  store.emit("all");
  status.render();
  platform.setCloseToTray(S().closeToTray).catch(() => {});
  if (S().ptt.key) platform.pttConfigure(S().ptt.key).catch(() => {});
  if (S().mic.enabled) engine.setMic(S().mic);
  if (S().remote.enabled) A.setRemote(true);
  if (platform.kind === "mock" && new URLSearchParams(location.search).has("compact")) A.setCompact(true);
  if (platform.kind === "mock" && new URLSearchParams(location.search).get("play")) {
    const name = new URLSearchParams(location.search).get("play");
    setTimeout(() => A.fire(S().sounds.find((x) => x.name === name)), 2500);
  }
  // long files are analyzed once (duration only) and never re-decoded on later launches
  for (const s of S().sounds) if (!(s.duration > 0) || (!s.peaks && s.duration <= ANALYZE_MAX_SECONDS)) queueAnalysis(s.id);
  if (!queue.length) preloadLikely();
  addEventListener("beforeunload", () => store.flush());
  window.__app = app;
}

main().catch((e) => {
  console.error(e);
  document.body.textContent = `Sonic Dominion failed to start: ${e.message}`;
});
