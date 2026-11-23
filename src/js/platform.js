// Thin bridge over Tauri. In a plain browser (UI development) a mock stands in.

function tauriPlatform(T) {
  const { invoke, convertFileSrc } = T.core;
  return {
    kind: "tauri",
    getSettings: () => invoke("settings_get"),
    saveSettings: (settings) => invoke("settings_save", { settings }),
    pickAudioFiles: () => invoke("pick_audio_files"),
    allowPaths: (paths) => invoke("allow_paths", { paths }),
    checkPaths: (paths) => invoke("check_paths", { paths }),
    setHotkeys: (map) => invoke("set_hotkeys", { map }),
    fileUrl: (path) => convertFileSrc(path),
    onHotkey: (fn) => T.event.listen("hotkey", (e) => fn(e.payload)),
    onFileDrop: (fn) =>
      T.webview.getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === "drop") fn({ type: "drop", paths: p.paths || [] });
        else if (p.type === "over" || p.type === "enter") fn({ type: "over" });
        else fn({ type: "leave" });
      })
  };
}

// ---------- browser mock ----------

function wavBlob(seconds, makeSample, rate = 22050) {
  const n = Math.floor(seconds * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, makeSample(i / rate, seconds)));
    v.setInt16(44 + i * 2, s * 32767, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

const DEMO = [
  ["Air horn", 1.6, (t) => 0.6 * Math.sign(Math.sin(2 * Math.PI * 440 * t)) * Math.min(1, t * 20) * (t < 1.4 ? 1 : (1.6 - t) * 5)],
  ["Rimshot", 0.9, (t) => (Math.random() * 2 - 1) * Math.exp(-t * 9) * 0.8],
  ["Sad trombone", 2.8, (t) => 0.5 * Math.sin(2 * Math.PI * (300 - t * 60) * t) * (1 - t / 2.8)],
  ["Crowd cheer", 3.2, (t, d) => (Math.random() * 2 - 1) * 0.35 * Math.sin(Math.PI * t / d)],
  ["Bruh", 0.7, (t) => 0.7 * Math.sin(2 * Math.PI * 110 * t) * Math.exp(-t * 3)],
  ["Ding", 1.2, (t) => 0.6 * Math.sin(2 * Math.PI * 1320 * t) * Math.exp(-t * 4)],
  ["Drumroll", 2.4, (t) => (Math.random() * 2 - 1) * 0.4 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 18 * t)) * (t / 2.4)],
  ["Wrong answer buzzer", 1.1, (t) => 0.4 * Math.sign(Math.sin(2 * Math.PI * 120 * t))],
  ["Clap", 0.5, (t) => (Math.random() * 2 - 1) * Math.exp(-t * 18)],
  ["Intro sting", 4.5, (t) => 0.3 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277 * t) + Math.sin(2 * Math.PI * 330 * t)) * Math.min(1, t) * Math.exp(-Math.max(0, t - 3))]
];

function mockPlatform() {
  const urls = new Map();
  const key = "soundboard.mock.settings";
  let hotkeyHandler = null;
  let hotkeys = {};
  const demo = new URLSearchParams(location.search).has("demo");

  function seed() {
    const folders = [{ id: "b1", name: "Stream", collapsed: false }, { id: "b2", name: "Memes", collapsed: false }];
    const keys = ["F1", "F2", "F3", "Ctrl+1", "Numpad1", "Numpad2", "", "Numpad3", "", "Ctrl+Shift+I"];
    const modes = ["restart", "overlap", "toggle", "restart", "restart", "overlap", "loop", "restart", "overlap", "hold"];
    const sounds = DEMO.map(([name, dur, fn], i) => {
      const path = `C:\\Users\\you\\Sounds\\${name.toLowerCase().replace(/ /g, "-")}.wav`;
      urls.set(path, URL.createObjectURL(wavBlob(dur, fn)));
      return { id: `d${i}`, path, name, folderId: i < 4 ? "b1" : i < 8 ? "b2" : "", start: 0, end: 0, duration: 0, key: keys[i], mode: modes[i], gain: 1 };
    });
    sounds.push({ id: "dx", path: "C:\\Users\\you\\Sounds\\moved-away.mp3", name: "Moved away", start: 0, end: 2, duration: 2, folderId: "b2" });
    return { version: 2, outputs: { monitorId: "default", cableId: "", monitorVol: 0.8, cableVol: 1 }, folders, sounds };
  }

  window.addEventListener("keydown", (e) => {
    if (!hotkeyHandler || e.repeat) return;
    import("./keys.js").then(({ acceleratorFromEvent }) => {
      const acc = acceleratorFromEvent(e);
      for (const [id, k] of Object.entries(hotkeys)) if (k && k === acc) hotkeyHandler({ id, state: "down" });
    });
  });

  return {
    kind: "mock",
    async getSettings() {
      if (demo) return seed();
      try {
        return JSON.parse(localStorage.getItem(key) || "null");
      } catch {
        return null;
      }
    },
    async saveSettings(s) {
      if (demo) return;
      try {
        localStorage.setItem(key, JSON.stringify(s));
      } catch {}
    },
    pickAudioFiles() {
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "audio/*";
        input.multiple = true;
        input.onchange = () => {
          const paths = [...input.files].map((f) => {
            const p = `C:\\Picked\\${f.name}`;
            urls.set(p, URL.createObjectURL(f));
            return p;
          });
          resolve(paths);
        };
        input.click();
      });
    },
    async allowPaths() {},
    async checkPaths(paths) {
      return paths.map((p) => urls.has(p));
    },
    async setHotkeys(map) {
      hotkeys = map;
      return { failed: [] };
    },
    fileUrl: (path) => urls.get(path) || "about:blank",
    async onHotkey(fn) {
      hotkeyHandler = fn;
    },
    async onFileDrop() {}
  };
}

export const platform = window.__TAURI__ ? tauriPlatform(window.__TAURI__) : mockPlatform();
