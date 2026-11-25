import test from "node:test";
import assert from "node:assert/strict";
import { resolveBindings, canonicalKey, mainKey } from "../src/js/bindings.js";

const SLOTS = { __slot_1: "Numpad1", __slot_2: "Numpad2", __bank_next: "NumpadAdd" };
const st = (over = {}) => ({ stopAllKey: "", slotKeys: false, ptt: { key: "" }, sounds: [], ...over });

test("canonicalKey orders modifiers; mainKey strips them", () => {
  assert.equal(canonicalKey("Shift+Ctrl+A"), "Ctrl+Shift+A");
  assert.equal(canonicalKey("Alt+Super+Ctrl+F1"), "Ctrl+Alt+Super+F1");
  assert.equal(mainKey("Ctrl+Shift+F13"), "F13");
});

test("duplicate sound keys: first wins, later blocked", () => {
  const r = resolveBindings(st({ sounds: [{ id: "a", key: "F1" }, { id: "b", key: "F1" }, { id: "c", key: "Shift+Ctrl+X" }] }), SLOTS);
  assert.deepEqual(r.map, { a: "F1", c: "Ctrl+Shift+X" });
  assert.deepEqual([...r.blocked], ["b"]);
});

test("stop-all outranks slots and sounds", () => {
  const r = resolveBindings(st({ stopAllKey: "Numpad1", slotKeys: true, sounds: [{ id: "a", key: "Numpad1" }] }), SLOTS);
  assert.equal(r.map.__stop_all__, "Numpad1");
  assert.equal(r.map.__slot_1, undefined);
  assert.ok(r.blocked.has("__slot_1"));
  assert.ok(r.blocked.has("a"));
});

test("clip key registers only while Clip that is on, and outranks sounds", () => {
  const sounds = [{ id: "a", key: "F9" }];
  const off = resolveBindings(st({ clip: { enabled: false, key: "F9" }, sounds }), SLOTS);
  assert.equal(off.map.__clip__, undefined);
  assert.equal(off.map.a, "F9");
  const on = resolveBindings(st({ clip: { enabled: true, key: "F9" }, sounds }), SLOTS);
  assert.equal(on.map.__clip__, "F9");
  assert.ok(on.blocked.has("a"));
});

test("PTT key blocks any binding on the same main key", () => {
  const r = resolveBindings(st({ slotKeys: true, ptt: { key: "Numpad2" }, stopAllKey: "Ctrl+Numpad2", sounds: [{ id: "a", key: "Ctrl+F13" }, { id: "b", key: "F14" }] }), SLOTS);
  assert.ok(r.blocked.has("__slot_2"));
  assert.ok(r.blocked.has("__stop_all__"));
  assert.equal(r.pttConflict, true);
  const r2 = resolveBindings(st({ ptt: { key: "F13" }, sounds: [{ id: "a", key: "Ctrl+F13" }, { id: "b", key: "F14" }] }), SLOTS);
  assert.ok(r2.blocked.has("a"));
  assert.equal(r2.map.b, "F14");
});

test("slots off: numpad keys are free for sounds", () => {
  const r = resolveBindings(st({ sounds: [{ id: "a", key: "Numpad1" }] }), SLOTS);
  assert.equal(r.map.a, "Numpad1");
  assert.equal(r.blocked.size, 0);
  assert.equal(r.pttConflict, false);
});
