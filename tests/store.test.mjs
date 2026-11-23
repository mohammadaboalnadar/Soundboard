import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/js/store.js";

function fakePlatform(initial) {
  const saves = [];
  return { saves, getSettings: async () => initial, saveSettings: async (s) => { saves.push(structuredClone(s)); } };
}

test("load normalizes and update debounces saves", async () => {
  const p = fakePlatform({ version: 2, sounds: [{ id: "a", path: "x", duration: 1 }] });
  const store = createStore(p, { delay: 20 });
  await store.load();
  assert.equal(store.state.sounds[0].end, 1);
  let notified = 0;
  store.subscribe(() => notified++);
  store.update((s) => { s.theme = "light"; });
  store.update((s) => { s.view = "list"; });
  assert.equal(notified, 2);
  assert.equal(p.saves.length, 0);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(p.saves.length, 1);
  assert.equal(p.saves[0].theme, "light");
  assert.equal(p.saves[0].view, "list");
});

test("flush saves immediately and transient fields are not persisted", async () => {
  const p = fakePlatform(null);
  const store = createStore(p, { delay: 1000 });
  await store.load();
  store.update((s) => { s.sounds.push({ id: "z", path: "p", missing: true, duration: 2, start: 0, end: 2 }); });
  await store.flush();
  assert.equal(p.saves.length, 1);
  assert.equal("missing" in p.saves[0].sounds[0], false);
});
