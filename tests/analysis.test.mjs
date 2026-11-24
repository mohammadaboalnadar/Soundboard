import test from "node:test";
import assert from "node:assert/strict";
import { computePeaks, encodePeaks, decodePeaks, measureLoudness, autoLevelGain } from "../src/js/peaks.js";
import { LruCache } from "../src/js/cache.js";

const sine = (n, amp = 1) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = amp * Math.sin(i / 7); return a; };

test("computePeaks: 256 points, full-scale sine hits 255", () => {
  const p = computePeaks([sine(48000)], 256);
  assert.equal(p.length, 256);
  assert.equal(Math.max(...p), 255);
});

test("computePeaks: silence is zeros, short input still 256", () => {
  const p = computePeaks([new Float32Array(10)], 256);
  assert.equal(p.length, 256);
  assert.equal(Math.max(...p), 0);
});

test("peaks base64 round-trip", () => {
  const p = computePeaks([sine(1000, 0.5)]);
  assert.deepEqual(decodePeaks(encodePeaks(p)), p);
  assert.equal(decodePeaks("").length, 0);
});

test("measureLoudness of a 0.5 sine", () => {
  const { rmsDb, peakDb } = measureLoudness([sine(48000, 0.5)]);
  assert.ok(Math.abs(peakDb - -6.02) < 0.1, String(peakDb));
  assert.ok(Math.abs(rmsDb - -9.03) < 0.2, String(rmsDb));
});

test("autoLevelGain: peak ceiling wins", () => {
  const g = autoLevelGain({ rmsDb: -30, peakDb: -6 });
  assert.ok(Math.abs(g - 10 ** (5 / 20)) < 1e-6, String(g));
});

test("autoLevelGain: rms target wins, silence stays 1", () => {
  const g = autoLevelGain({ rmsDb: -10, peakDb: -1 });
  assert.ok(Math.abs(g - 10 ** (-6 / 20)) < 1e-6);
  assert.equal(autoLevelGain({ rmsDb: -Infinity, peakDb: -Infinity }), 1);
});

test("LruCache evicts oldest unpinned", () => {
  const c = new LruCache(100);
  c.set("a", 1, 40); c.set("b", 2, 40);
  c.get("a");               // a is now newest
  c.set("c", 3, 40);        // over budget → evict b
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("a"), 1);
  assert.equal(c.usedBytes, 80);
});

test("LruCache never evicts pinned, overshoots instead", () => {
  const c = new LruCache(50);
  c.set("a", 1, 40); c.pin("a");
  c.set("b", 2, 40); c.pin("b");
  assert.equal(c.usedBytes, 80);
  c.unpin("a");
  c.set("c", 3, 1);
  assert.equal(c.get("a"), undefined);
  assert.equal(c.get("b"), 2);
});

test("LruCache setBudget shrinks and delete works", () => {
  const c = new LruCache(100);
  c.set("a", 1, 30); c.set("b", 2, 30); c.set("c", 3, 30);
  c.setBudget(40);
  assert.equal(c.usedBytes, 30);
  assert.equal(c.get("c"), 3);
  c.delete("c");
  assert.equal(c.usedBytes, 0);
});
