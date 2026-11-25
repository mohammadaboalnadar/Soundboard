// Settings schema (v2), defaults, validation and migration from the Electron v1 file.
import { fromLegacyKey } from "./keys.js";

export const PAD_COLORS = ["amber", "ember", "rose", "violet", "azure", "teal", "moss", "sand"];
export const PLAY_MODES = ["restart", "overlap", "toggle", "loop", "hold"];
export const MAX_GAIN = 2; // +6 dB

const MIN_SEGMENT = 0.02;

/** Bank letters like hardware samplers: A..Z, then AA, AB... */
export function bankLetter(i) {
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : fallback);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const str = (v, fallback = "") => (v === undefined || v === null ? fallback : String(v));

export function defaultSettings() {
  return {
    version: 2,
    theme: "dark",
    view: "grid",
    padSize: "m",
    cacheMB: 64,
    stopAllKey: "",
    outputs: { monitorId: "default", cableId: "", monitorVol: 1, cableVol: 1 },
    mic: { enabled: false, deviceId: "default", gain: 1, duck: 0 },
    ptt: { key: "", leadMs: 120 },
    clip: { enabled: false, seconds: 30, key: "" },
    remote: { enabled: false, port: 7878, pin: "" },
    slotKeys: false,
    closeToTray: true,
    activeBank: "",
    recent: [],
    cableTipDismissed: false,
    onboarded: false,
    folders: [],
    sounds: []
  };
}

export function baseName(path) {
  const file = str(path).replace(/\\/g, "/").split("/").pop() || "";
  return file.replace(/\.[^.]+$/, "") || file;
}

function colorFor(id) {
  let h = 0;
  for (const ch of str(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PAD_COLORS[h % PAD_COLORS.length];
}

export function newSound(path, duration = 0) {
  const id = uid();
  return normalizeSound({ id, path, name: baseName(path), duration, start: 0, end: duration }, new Set());
}

export function normalizeSound(raw, folderIds) {
  const s = raw && typeof raw === "object" ? raw : {};
  const id = str(s.id) || uid();
  const duration = Math.max(0, num(s.duration, 0));
  let start = Math.max(0, num(s.start, 0));
  let end = Math.max(0, num(s.end, 0));
  if (duration > 0) {
    if (end <= 0) end = duration;
    start = clamp(start, 0, duration);
    end = clamp(end, 0, duration);
  }
  if (end > 0 && end - start < MIN_SEGMENT) {
    if (duration > 0 && start + MIN_SEGMENT <= duration) end = start + MIN_SEGMENT;
    else start = Math.max(0, end - MIN_SEGMENT);
    if (end <= start) end = start + MIN_SEGMENT;
  }
  const segment = end > 0 ? end - start : Infinity;
  const fadeIn = clamp(num(s.fadeIn, 0), 0, segment);
  const fadeOut = clamp(num(s.fadeOut, 0), 0, Math.max(0, segment - fadeIn));
  const folderId = str(s.folderId);
  return {
    id,
    path: str(s.path),
    name: str(s.name),
    folderId: folderIds.has(folderId) ? folderId : "",
    color: PAD_COLORS.includes(s.color) ? s.color : colorFor(id),
    start,
    end,
    duration,
    gain: clamp(num(s.gain, 1), 0, MAX_GAIN),
    rate: clamp(num(s.rate, 1), 0.5, 2),
    fav: Boolean(s.fav),
    fadeIn,
    fadeOut,
    mode: PLAY_MODES.includes(s.mode) ? s.mode : "restart",
    autoLevel: Boolean(s.autoLevel),
    normGain: clamp(num(s.normGain, 1), 0.05, 8),
    key: str(s.key),
    peaks: typeof s.peaks === "string" ? s.peaks : ""
  };
}

export function migrateV1(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const out = defaultSettings();
  out.outputs.cableId = str(r.outputDeviceId) === "default" ? "" : str(r.outputDeviceId);
  out.outputs.monitorVol = clamp(num(r.localVolume, 1), 0, 1);
  out.outputs.cableVol = clamp(num(r.soundboardVolume, 1), 0, 1);
  out.stopAllKey = fromLegacyKey(str(r.stopAllKeybind));
  out.folders = Array.isArray(r.folders) ? r.folders : [];
  out.sounds = (Array.isArray(r.sounds) ? r.sounds : []).map((s) => ({
    id: s.id,
    path: s.filePath,
    name: s.displayName,
    folderId: s.folderId,
    start: s.start,
    end: s.end,
    gain: s.volume,
    fadeIn: s.fadeIn,
    fadeOut: s.fadeOut,
    key: fromLegacyKey(str(s.keybind))
  }));
  return normalizeSettings({ ...out, version: 2 });
}

export function normalizeSettings(raw) {
  if (!raw || typeof raw !== "object") return defaultSettings();
  // v1 (Electron) files have no version; newer files are read as v2, never through v1 field names
  if (raw.version === undefined || raw.version < 2) return migrateV1(raw);
  const d = defaultSettings();
  const o = raw.outputs || {};
  const m = raw.mic || {};
  const p = raw.ptt || {};
  const r = raw.remote || {};
  const c = raw.clip || {};
  const pinOk = /^\d{6}$/.test(str(r.pin));
  const folders = (Array.isArray(raw.folders) ? raw.folders : []).map((f) => ({
    id: str(f && f.id) || uid(),
    name: str(f && f.name, "Board").trim() || "Board",
    collapsed: Boolean(f && f.collapsed)
  }));
  const folderIds = new Set(folders.map((f) => f.id));
  const seen = new Set();
  const sounds = [];
  for (const s of Array.isArray(raw.sounds) ? raw.sounds : []) {
    const n = normalizeSound(s, folderIds);
    if (seen.has(n.id)) n.id = uid();
    seen.add(n.id);
    sounds.push(n);
  }
  return {
    version: 2,
    theme: raw.theme === "light" ? "light" : d.theme,
    view: raw.view === "list" ? "list" : d.view,
    padSize: ["s", "m", "l"].includes(raw.padSize) ? raw.padSize : d.padSize,
    cacheMB: clamp(Math.round(num(raw.cacheMB, d.cacheMB)), 16, 512),
    stopAllKey: str(raw.stopAllKey),
    outputs: {
      monitorId: str(o.monitorId, "default") || "default",
      cableId: str(o.cableId),
      monitorVol: clamp(num(o.monitorVol, 1), 0, 1),
      cableVol: clamp(num(o.cableVol, 1), 0, 1)
    },
    mic: {
      enabled: Boolean(m.enabled),
      deviceId: str(m.deviceId, "default") || "default",
      gain: clamp(num(m.gain, 1), 0, MAX_GAIN),
      duck: clamp(num(m.duck, 0), -40, 0)
    },
    ptt: { key: str(p.key), leadMs: clamp(Math.round(num(p.leadMs, 120)), 0, 500) },
    clip: { enabled: Boolean(c.enabled), seconds: clamp(Math.round(num(c.seconds, 30)), 5, 60), key: str(c.key) },
    remote: {
      enabled: Boolean(r.enabled) && pinOk,
      port: clamp(Math.round(num(r.port, 7878)), 1024, 65535),
      pin: pinOk ? str(r.pin) : ""
    },
    slotKeys: Boolean(raw.slotKeys),
    closeToTray: raw.closeToTray === undefined ? true : Boolean(raw.closeToTray),
    activeBank: folderIds.has(str(raw.activeBank)) ? str(raw.activeBank) : folders[0]?.id || "",
    recent: [...new Set((Array.isArray(raw.recent) ? raw.recent : []).map((x) => str(x)))].filter((id) => seen.has(id)).slice(0, 16),
    cableTipDismissed: Boolean(raw.cableTipDismissed),
    onboarded: Boolean(raw.onboarded),
    folders,
    sounds
  };
}

export const SLOT_COUNT = 9;

/** The sounds that Numpad 1..9 fire in a bank: its first nine pads, in board order. */
export function slotSounds(state, bankId) {
  return state.sounds.filter((s) => s.folderId === bankId).slice(0, SLOT_COUNT);
}

/** Next/previous bank id, wrapping. With no banks the unsorted pool ("") is the only bank. */
export function cycleBank(state, currentId, dir) {
  const ids = state.folders.map((f) => f.id);
  if (!ids.length) return "";
  const i = ids.indexOf(currentId);
  return ids[(((i < 0 ? 0 : i) + dir) % ids.length + ids.length) % ids.length];
}
