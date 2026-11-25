import test from "node:test";
import assert from "node:assert/strict";
import { acceleratorFromEvent, formatKey, assignKey, fromLegacyKey, mouseChord } from "../src/js/keys.js";

const ev = (o) => ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...o });

test("acceleratorFromEvent: modifier + letter", () => {
  assert.equal(acceleratorFromEvent(ev({ key: "a", code: "KeyA", ctrlKey: true })), "Ctrl+A");
  assert.equal(acceleratorFromEvent(ev({ key: "A", code: "KeyA", ctrlKey: true, shiftKey: true, altKey: true })), "Ctrl+Alt+Shift+A");
});

test("acceleratorFromEvent: numpad uses code names", () => {
  assert.equal(acceleratorFromEvent(ev({ key: "1", code: "Numpad1" })), "Numpad1");
  assert.equal(acceleratorFromEvent(ev({ key: "+", code: "NumpadAdd" })), "NumpadAdd");
  assert.equal(acceleratorFromEvent(ev({ key: "Enter", code: "NumpadEnter" })), "NumpadEnter");
});

test("acceleratorFromEvent: bare modifier yields empty", () => {
  assert.equal(acceleratorFromEvent(ev({ key: "Shift", code: "ShiftLeft", shiftKey: true })), "");
  assert.equal(acceleratorFromEvent(ev({ key: "Control", code: "ControlLeft", ctrlKey: true })), "");
});

test("acceleratorFromEvent: digits, F-keys, named keys", () => {
  assert.equal(acceleratorFromEvent(ev({ key: "!", code: "Digit1", shiftKey: true })), "Shift+1");
  assert.equal(acceleratorFromEvent(ev({ key: "F13", code: "F13" })), "F13");
  assert.equal(acceleratorFromEvent(ev({ key: " ", code: "Space", altKey: true })), "Alt+Space");
  assert.equal(acceleratorFromEvent(ev({ key: "ArrowUp", code: "ArrowUp", ctrlKey: true })), "Ctrl+Up");
});

test("formatKey: compact labels", () => {
  assert.equal(formatKey("Ctrl+Shift+A"), "Ctrl Shift A");
  assert.equal(formatKey("Numpad1"), "Num 1");
  assert.equal(formatKey("NumpadAdd"), "Num +");
  assert.equal(formatKey(""), "");
  assert.equal(formatKey("Mouse4"), "Mouse 4");
  assert.equal(formatKey("Ctrl+Mouse4+Mouse5"), "Ctrl Mouse 4 Mouse 5");
});

test("mouseChord: modifiers first, buttons in order", () => {
  assert.equal(mouseChord({}, new Set([5, 4])), "Mouse4+Mouse5");
  assert.equal(mouseChord({ ctrlKey: true, shiftKey: true }, new Set([4])), "Ctrl+Shift+Mouse4");
  assert.equal(mouseChord({ ctrlKey: true }, new Set()), "");
});

test("fromLegacyKey: electron accelerators", () => {
  assert.equal(fromLegacyKey("Control+num5"), "Ctrl+Numpad5");
  assert.equal(fromLegacyKey("numadd"), "NumpadAdd");
  assert.equal(fromLegacyKey("Super+Esc"), "Super+Escape");
  assert.equal(fromLegacyKey(""), "");
});

test("assignKey: steals the key from another sound", () => {
  const sounds = [{ id: "a", key: "F1" }, { id: "b", key: "" }];
  const out = assignKey(sounds, "b", "F1");
  assert.equal(out.find((s) => s.id === "a").key, "");
  assert.equal(out.find((s) => s.id === "b").key, "F1");
});
