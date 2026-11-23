// Settings schema (v2), defaults, validation and migration from the Electron v1 file.
import { fromLegacyKey } from "./keys.js";

export const PAD_COLORS = ["amber", "ember", "rose", "violet", "azure", "teal", "moss", "sand"];
export const PLAY_MODES = ["restart", "overlap", "toggle", "loop", "hold"];
export const MAX_GAIN = 2; // +6 dB

const MIN_SEGMENT = 0.02;

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
    mic: { enabled: false, deviceId: "default", gain: 1 },
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
  if (raw.version !== 2) return migrateV1(raw);
  const d = defaultSettings();
  const o = raw.outputs || {};
  const m = raw.mic || {};
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
      gain: clamp(num(m.gain, 1), 0, MAX_GAIN)
    },
    folders,
    sounds
  };
}
