// Single mutable state object + subscribers + debounced persistence.
import { normalizeSettings, normalizeSound } from "./model.js";

export function createStore(platform, { delay = 400 } = {}) {
  const listeners = new Set();
  let timer = 0;
  let saving = Promise.resolve();

  const store = {
    state: normalizeSettings(null),

    async load() {
      const raw = await platform.getSettings();
      store.state = normalizeSettings(raw);
      return store.state;
    },

    /** Mutate state in place, notify, and schedule a save. `hint` tells views what changed. */
    update(fn, hint = "all") {
      fn(store.state);
      for (const l of listeners) l(hint);
      clearTimeout(timer);
      timer = setTimeout(() => store.flush(), delay);
    },

    /** Notify without persisting (selection, playback, transient UI). */
    emit(hint) {
      for (const l of listeners) l(hint);
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    snapshot() {
      const s = store.state;
      const folderIds = new Set(s.folders.map((f) => f.id));
      return { ...s, sounds: s.sounds.map((x) => normalizeSound(x, folderIds)) };
    },

    flush() {
      clearTimeout(timer);
      timer = 0;
      const snap = store.snapshot();
      saving = saving.then(() => platform.saveSettings(snap)).catch((e) => console.error("save failed", e));
      return saving;
    }
  };
  return store;
}
