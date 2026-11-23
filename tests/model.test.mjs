import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, migrateV1, normalizeSettings, newSound, PAD_COLORS, PLAY_MODES } from "../src/js/model.js";

const v1 = {
  outputDeviceId: "cable-123",
  stopAllKeybind: "Control+Esc",
  localVolume: 0.5,
  soundboardVolume: 0.8,
  folders: [{ id: "f1", name: "Memes", collapsed: true }],
  sounds: [
    { id: "s1", filePath: "C:/a/bruh.mp3", displayName: "Bruh", start: 0.2, end: 1.5, volume: 0.7,
      fadeIn: 0.1, fadeOut: 0.2, folderId: "f1", keybind: "num1" },
    { id: "s2", filePath: "C:/a/x.wav", displayName: "", start: 0, end: 0, volume: 1,
      fadeIn: 0, fadeOut: 0, folderId: "ghost", keybind: "" }
  ]
};

test("constants", () => {
  assert.deepEqual(PAD_COLORS, ["amber", "ember", "rose", "violet", "azure", "teal", "moss", "sand"]);
  assert.deepEqual(PLAY_MODES, ["restart", "overlap", "toggle", "loop", "hold"]);
});

test("migrateV1 maps every field", () => {
  const s = migrateV1(v1);
  assert.equal(s.version, 2);
  assert.equal(s.outputs.cableId, "cable-123");
  assert.equal(s.outputs.monitorId, "default");
  assert.equal(s.outputs.monitorVol, 0.5);
  assert.equal(s.outputs.cableVol, 0.8);
  assert.equal(s.stopAllKey, "Ctrl+Escape");
  assert.equal(s.folders[0].name, "Memes");
  const a = s.sounds[0];
  assert.equal(a.path, "C:/a/bruh.mp3");
  assert.equal(a.name, "Bruh");
  assert.equal(a.gain, 0.7);
  assert.equal(a.key, "Numpad1");
  assert.equal(a.folderId, "f1");
  assert.equal(a.mode, "restart");
  assert.ok(PAD_COLORS.includes(a.color));
});

test("normalize: unknown folder dropped, bad trims repaired", () => {
  const s = normalizeSettings(migrateV1(v1));
  assert.equal(s.sounds[1].folderId, "");
  const b = normalizeSettings({ version: 2, sounds: [{ id: "x", path: "p", start: 2, end: 1, duration: 3, fadeIn: 9, fadeOut: 9 }] }).sounds[0];
  assert.ok(b.end > b.start);
  assert.ok(b.fadeIn + b.fadeOut <= b.end - b.start + 1e-9);
});

test("normalize: end 0 with known duration means full length", () => {
  const b = normalizeSettings({ version: 2, sounds: [{ id: "x", path: "p", start: 0, end: 0, duration: 4 }] }).sounds[0];
  assert.equal(b.end, 4);
});

test("normalize: garbage input gives defaults", () => {
  const s = normalizeSettings(null);
  assert.deepEqual(s, defaultSettings());
  const t = normalizeSettings({ version: 2, sounds: [{ path: "p", mode: "weird", gain: 5 }] });
  assert.equal(t.sounds[0].mode, "restart");
  assert.equal(t.sounds[0].gain, 2);
  assert.ok(t.sounds[0].id);
});

test("normalize detects v1 shape automatically", () => {
  const s = normalizeSettings(v1);
  assert.equal(s.sounds[0].key, "Numpad1");
});

test("newSound", () => {
  const s = newSound("C:/clips/air horn.ogg", 2.5);
  assert.equal(s.name, "air horn");
  assert.equal(s.end, 2.5);
  assert.equal(s.gain, 1);
});
