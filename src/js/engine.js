// Audio engine: two AudioContexts (monitor + cable), a byte-budgeted cache of trimmed
// segments, sample-accurate fades via AudioParam ramps, and per-sound play modes.
import { LruCache } from "./cache.js";
import { computePeaks, encodePeaks, measureLoudness } from "./peaks.js";

const STREAM_THRESHOLD = 12 * 1024 * 1024; // decoded bytes above which a segment streams
export const ANALYZE_MAX_SECONDS = 10 * 60; // longer files are never fully decoded
const IDLE_SUSPEND_MS = 30_000;
const START_OFFSET = 0.004;

export function createEngine({ fileUrl, cacheMB = 64 }) {
  const cache = new LruCache(cacheMB * 1024 * 1024);
  const pending = new Map(); // cacheKey -> Promise<segment>
  const voices = new Map(); // voiceId -> voice
  const listeners = new Map();
  let voiceSeq = 0;
  let idleTimer = 0;

  const outputs = { monitorId: "default", cableId: "", monitorVol: 1, cableVol: 1 };
  const buses = { monitor: null, cable: null };
  let cableError = "";
  const mic = { enabled: false, deviceId: "default", gain: 1, duck: 0, stream: null, node: null, gainNode: null };
  let cableActive = false;

  /** Cable activity drives auto push-to-talk and mic ducking. Fading voices still count. */
  function updateCableActivity() {
    let active = false;
    for (const v of voices.values()) if (v.cable) active = true;
    if (active === cableActive) return;
    cableActive = active;
    applyDuck();
    emit("cable", { active });
  }

  function applyDuck() {
    if (!mic.gainNode || !buses.cable) return;
    const ducked = cableActive && mic.duck < 0;
    const target = mic.gain * (ducked ? 10 ** (mic.duck / 20) : 1);
    mic.gainNode.gain.setTargetAtTime(target, buses.cable.ctx.currentTime, ducked ? 0.03 : 0.25);
  }

  function emit(evt, data) {
    for (const fn of listeners.get(evt) || []) fn(data);
  }

  function makeBus(kind) {
    const ctx = new AudioContext({ latencyHint: "interactive" });
    const input = ctx.createGain();
    const master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    input.connect(master).connect(limiter).connect(analyser).connect(ctx.destination);
    master.gain.value = kind === "monitor" ? outputs.monitorVol : outputs.cableVol;
    return { kind, ctx, input, master, analyser, meterBuf: new Float32Array(analyser.fftSize) };
  }

  async function applySink(bus, id) {
    if (typeof bus.ctx.setSinkId !== "function") return;
    await bus.ctx.setSinkId(!id || id === "default" ? "" : id);
  }

  async function ensureBuses() {
    if (!buses.monitor) {
      buses.monitor = makeBus("monitor");
      try {
        await applySink(buses.monitor, outputs.monitorId);
      } catch (e) {
        emit("error", { scope: "monitor", message: String(e && e.message || e) });
      }
    }
    if (outputs.cableId && !buses.cable && !cableError) {
      buses.cable = makeBus("cable");
      try {
        await applySink(buses.cable, outputs.cableId);
        cableError = "";
      } catch (e) {
        cableError = String(e && e.message || e);
        emit("error", { scope: "cable", message: cableError });
        await closeBus("cable");
      }
    }
    const resumes = [];
    for (const bus of activeBuses()) if (bus.ctx.state === "suspended") resumes.push(bus.ctx.resume());
    await Promise.all(resumes);
  }

  async function closeBus(kind) {
    const bus = buses[kind];
    if (!bus) return;
    buses[kind] = null;
    try {
      await bus.ctx.close();
    } catch {}
  }

  function activeBuses() {
    return [buses.monitor, buses.cable].filter(Boolean);
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (voices.size === 0 && !mic.stream) {
        for (const bus of activeBuses()) bus.ctx.suspend().catch(() => {});
      }
    }, IDLE_SUSPEND_MS);
  }

  // ---------- loading ----------

  const segKey = (s) => `${s.id}|${(+s.start).toFixed(3)}|${(+s.end).toFixed(3)}`;

  async function fetchAndDecode(path) {
    const res = await fetch(fileUrl(path));
    if (!res.ok) throw new Error(`Cannot read file (${res.status})`);
    const data = await res.arrayBuffer();
    if (!buses.monitor) await ensureBuses();
    return buses.monitor.ctx.decodeAudioData(data);
  }

  function sliceBuffer(full, start, end) {
    const rate = full.sampleRate;
    const a = Math.max(0, Math.floor(start * rate));
    const b = Math.min(full.length, Math.max(a + 1, Math.floor(end * rate)));
    const ctx = buses.monitor.ctx;
    const seg = ctx.createBuffer(full.numberOfChannels, b - a, rate);
    const chans = [];
    for (let c = 0; c < full.numberOfChannels; c++) {
      const data = full.getChannelData(c).subarray(a, b);
      seg.copyToChannel(data, c);
      chans.push(data);
    }
    return { seg, chans };
  }

  function estimateBytes(sound) {
    const rate = buses.monitor ? buses.monitor.ctx.sampleRate : 48000;
    return Math.max(0, sound.end - sound.start) * rate * 2 * 4;
  }

  /** Duration from container metadata only: nothing is decoded. Rejects if unreadable. */
  function probeDuration(path) {
    return new Promise((resolve, reject) => {
      const a = new Audio();
      const done = (fn, v) => {
        clearTimeout(timer);
        a.removeAttribute("src");
        a.load();
        fn(v);
      };
      const timer = setTimeout(() => done(reject, Object.assign(new Error("Timed out reading the file"), { missing: true })), 10000);
      a.preload = "metadata";
      a.onloadedmetadata = () => done(resolve, Number.isFinite(a.duration) ? a.duration : 0);
      a.onerror = () => done(reject, Object.assign(new Error("The file can’t be read."), { missing: true }));
      a.src = fileUrl(path);
    });
  }

  async function getSegment(sound) {
    const key = segKey(sound);
    const hit = cache.get(key);
    if (hit) return hit;
    if (pending.has(key)) return pending.get(key);
    const job = (async () => {
      let end = sound.end;
      if (!(end > 0)) end = await probeDuration(sound.path); // not analyzed yet
      if (end > 0 && estimateBytes({ start: sound.start, end }) > STREAM_THRESHOLD) {
        return { key, kind: "stream", duration: end - sound.start };
      }
      const full = await fetchAndDecode(sound.path);
      const segEnd = Math.min(end > 0 ? end : full.duration, full.duration);
      const { seg, chans } = sliceBuffer(full, sound.start, segEnd);
      const loud = measureLoudness(chans);
      emit("measured", { id: sound.id, ...loud });
      const entry = { key, kind: "buffer", buffer: seg, duration: seg.duration };
      cache.set(key, entry, seg.length * seg.numberOfChannels * 4);
      emit("cache", stats());
      return entry;
    })();
    pending.set(key, job);
    try {
      return await job;
    } finally {
      pending.delete(key);
    }
  }

  /** Decode a file once to get duration, waveform and loudness. Nothing is cached: the full decode is dropped. */
  async function analyze(sound) {
    const probed = await probeDuration(sound.path);
    if (probed > ANALYZE_MAX_SECONDS) {
      // A full decode of a long file costs hundreds of MB: keep it streaming, no waveform.
      return { duration: probed, peaks: "", rmsDb: -Infinity, peakDb: -Infinity };
    }
    const full = await fetchAndDecode(sound.path);
    const duration = full.duration;
    const chans = [];
    for (let c = 0; c < full.numberOfChannels; c++) chans.push(full.getChannelData(c));
    const peaks = duration <= ANALYZE_MAX_SECONDS ? encodePeaks(computePeaks(chans, 256)) : "";
    const end = sound.end > 0 ? Math.min(sound.end, duration) : duration;
    const s = { ...sound, end };
    let loud = measureLoudness(chans);
    if (s.end - s.start > 0 && (s.start > 0 || s.end < duration)) {
      const a = Math.floor(s.start * full.sampleRate);
      const b = Math.floor(s.end * full.sampleRate);
      loud = measureLoudness(chans.map((c) => c.subarray(a, b)));
    }
    return { duration, peaks, ...loud };
  }

  /** Warm the cache for sounds the user is likely to fire (those with hotkeys). */
  async function preload(sounds, fraction = 0.5) {
    for (const s of sounds) {
      if (cache.usedBytes > cache.budget * fraction) break;
      if (!s.path || !(s.end > 0) || estimateBytes(s) > STREAM_THRESHOLD) continue;
      try {
        await getSegment(s);
      } catch {}
      await new Promise((r) => (globalThis.requestIdleCallback || setTimeout)(r));
    }
  }

  // ---------- playback ----------

  const voiceGainOf = (sound) => sound.gain * (sound.autoLevel ? sound.normGain : 1);

  /** segDur is wall-clock seconds; fades are clip seconds, so they scale with playback rate. */
  function scheduleEnvelope(param, t0, sound, segDur, loop, rate = 1) {
    const g = voiceGainOf(sound);
    const fi = Math.min(sound.fadeIn / rate, segDur);
    const fo = Math.min(sound.fadeOut / rate, Math.max(0, segDur - fi));
    param.cancelScheduledValues(0);
    param.setValueAtTime(fi > 0 ? 0 : g, t0);
    if (fi > 0) param.linearRampToValueAtTime(g, t0 + fi);
    if (!loop && fo > 0) {
      param.setValueAtTime(g, t0 + segDur - fo);
      param.linearRampToValueAtTime(0, t0 + segDur);
    }
  }

  function finishVoice(voice) {
    if (voice.done) return;
    voice.done = true;
    clearTimeout(voice.timer);
    for (const n of voice.nodes) {
      try {
        n.src.disconnect();
        n.gain.disconnect();
      } catch {}
      if (n.el) {
        n.el.pause();
        n.el.removeAttribute("src");
        n.el.load();
      }
    }
    cache.unpin(voice.key);
    voices.delete(voice.vid);
    emit("voiceend", { id: voice.id });
    updateCableActivity();
    if (voices.size === 0) scheduleIdle();
  }

  async function start(sound, { monitorOnly = false } = {}) {
    await ensureBuses();
    const seg = await getSegment(sound);
    const loop = sound.mode === "loop";
    const rate = Math.min(2, Math.max(0.5, Number(sound.rate) || 1));
    const wallDur = seg.duration / rate;
    const vid = ++voiceSeq;
    const voice = { vid, id: sound.id, name: sound.name, key: seg.key, nodes: [], loop, segDur: wallDur, done: false, timer: 0, t0: 0, cable: false };
    cache.pin(seg.key);

    for (const bus of monitorOnly ? [buses.monitor] : activeBuses()) {
      const ctx = bus.ctx;
      const gain = ctx.createGain();
      gain.connect(bus.input);
      const t0 = ctx.currentTime + START_OFFSET;
      let src;
      let el = null;
      if (seg.kind === "buffer") {
        src = ctx.createBufferSource();
        src.buffer = seg.buffer;
        src.playbackRate.value = rate;
        if (loop) {
          src.loop = true;
          src.start(t0, 0);
        } else {
          src.start(t0, 0, seg.duration);
        }
        if (bus === buses.monitor) src.onended = () => finishVoice(voice);
      } else {
        el = new Audio();
        el.crossOrigin = "anonymous";
        el.preload = "auto";
        el.src = fileUrl(sound.path);
        el.currentTime = sound.start;
        el.preservesPitch = false;
        el.playbackRate = rate;
        src = ctx.createMediaElementSource(el);
        const fail = (e) => {
          if (voice.done) return;
          finishVoice(voice);
          emit("error", { scope: "play", id: sound.id, missing: true, message: e?.message || "The file can’t be read." });
        };
        el.addEventListener("error", () => fail(el.error), { once: true });
        el.play().catch(fail);
      }
      src.connect(gain);
      scheduleEnvelope(gain.gain, t0, sound, wallDur, loop, rate);
      voice.nodes.push({ bus, src, gain, el });
      if (bus === buses.cable) voice.cable = true;
      if (bus === buses.monitor) voice.t0 = t0;
    }

    if (seg.kind === "stream") {
      const tick = () => {
        if (voice.done) return;
        if (voice.loop) {
          for (const n of voice.nodes) n.el.currentTime = sound.start;
          voice.t0 = buses.monitor.ctx.currentTime;
          voice.timer = setTimeout(tick, wallDur * 1000);
        } else {
          finishVoice(voice);
        }
      };
      voice.timer = setTimeout(tick, wallDur * 1000 + 30);
    }

    voices.set(vid, voice);
    clearTimeout(idleTimer);
    emit("voicestart", { id: sound.id });
    updateCableActivity();
    return voice;
  }

  function stopVoice(voice, fadeSeconds) {
    if (voice.done || voice.stopping) return;
    voice.stopping = true;
    const d = Math.max(0.012, fadeSeconds);
    for (const n of voice.nodes) {
      const now = n.bus.ctx.currentTime;
      const p = n.gain.gain;
      if (typeof p.cancelAndHoldAtTime === "function") p.cancelAndHoldAtTime(now);
      else {
        p.cancelScheduledValues(now);
        p.setValueAtTime(p.value, now);
      }
      p.linearRampToValueAtTime(0, now + d);
      if (!n.el) {
        try {
          n.src.stop(now + d + 0.01);
        } catch {}
      }
    }
    clearTimeout(voice.timer);
    voice.timer = setTimeout(() => finishVoice(voice), d * 1000 + 40);
  }

  function voicesOf(id) {
    return [...voices.values()].filter((v) => v.id === id && !v.stopping);
  }

  // Starts still in flight (lead-in, resume, decode). Stop, release and toggle cancel them.
  const inflight = new Map(); // sound id -> Set<{ cancelled }>
  function cancelPending(id) {
    for (const t of inflight.get(id) || []) t.cancelled = true;
  }

  function stop(id, { fade = true, seconds } = {}) {
    cancelPending(id);
    for (const v of voicesOf(id)) stopVoice(v, seconds ?? (fade ? fadeOutFor(v) : 0.012));
  }

  const fadeTimes = new Map();
  function fadeOutFor(v) {
    return Math.min(1.5, Math.max(0.06, fadeTimes.get(v.id) || 0.12));
  }

  function stopAll({ fade = true } = {}) {
    for (const id of inflight.keys()) cancelPending(id);
    for (const v of voices.values()) stopVoice(v, fade ? fadeOutFor(v) : 0.012);
  }

  /**
   * Fire a sound according to its play mode. `state` is "down" or "up" (hotkey release).
   */
  async function trigger(sound, { state = "down", monitorOnly = false, delayMs = 0 } = {}) {
    if (!sound || !sound.path) return;
    fadeTimes.set(sound.id, sound.fadeOut);
    const playing = voicesOf(sound.id).length > 0;
    const pendingNow = (inflight.get(sound.id)?.size || 0) > 0;
    const mode = sound.mode;
    if (state === "up") {
      if (mode === "hold") stop(sound.id, { fade: true });
      return;
    }
    if ((mode === "toggle" || mode === "loop") && (playing || pendingNow)) return stop(sound.id, { fade: true });
    if (mode === "hold" && (playing || pendingNow)) return;
    if (mode === "restart" && playing) stop(sound.id, { fade: false });
    const token = { cancelled: false };
    if (!inflight.has(sound.id)) inflight.set(sound.id, new Set());
    inflight.get(sound.id).add(token);
    try {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      if (token.cancelled) return;
      const voice = await start(sound, { monitorOnly });
      if (token.cancelled) stopVoice(voice, 0.012); // released or stopped while it was loading
    } catch (e) {
      emit("error", { scope: "play", id: sound.id, missing: Boolean(e && e.missing), message: String((e && e.message) || e) });
    } finally {
      const set = inflight.get(sound.id);
      set.delete(token);
      if (!set.size) inflight.delete(sound.id);
    }
  }

  const hasPending = () => inflight.size > 0;

  /** Apply gain edits to voices that are already playing. */
  function refresh(sound) {
    const g = voiceGainOf(sound);
    for (const v of voicesOf(sound.id)) {
      for (const n of v.nodes) n.gain.gain.setTargetAtTime(g, n.bus.ctx.currentTime, 0.02);
    }
  }

  function isPlaying(id) {
    return voicesOf(id).length > 0;
  }

  /** 0..1 progress of the newest voice for `id`, or null when silent. */
  function progress(id) {
    let newest = null;
    for (const v of voices.values()) if (v.id === id && !v.stopping && (!newest || v.vid > newest.vid)) newest = v;
    if (!newest || !buses.monitor) return null;
    const t = buses.monitor.ctx.currentTime - newest.t0;
    if (t < 0) return 0;
    if (newest.loop) return (t % newest.segDur) / newest.segDur;
    return Math.min(1, t / newest.segDur);
  }

  /** Active voices for the now-playing strip, newest first. */
  function nowPlaying() {
    const out = [];
    for (const v of voices.values()) if (!v.stopping) out.push({ vid: v.vid, id: v.id, name: v.name, loop: v.loop });
    return out.reverse();
  }

  function stopVoiceById(vid) {
    const v = voices.get(vid);
    if (v) stopVoice(v, 0.08);
  }

  function playingIds() {
    const ids = new Set();
    for (const v of voices.values()) if (!v.stopping) ids.add(v.id);
    return ids;
  }

  function invalidate(id) {
    for (const key of [...cache.map.keys()]) if (key.startsWith(`${id}|`)) cache.delete(key);
    emit("cache", stats());
  }

  // ---------- outputs, mic, meters ----------

  async function setOutputs(next) {
    const prev = { ...outputs };
    Object.assign(outputs, next);
    if (buses.monitor) {
      buses.monitor.master.gain.setTargetAtTime(outputs.monitorVol, buses.monitor.ctx.currentTime, 0.015);
      if (prev.monitorId !== outputs.monitorId) {
        try {
          await applySink(buses.monitor, outputs.monitorId);
        } catch (e) {
          emit("error", { scope: "monitor", message: String(e && e.message || e) });
        }
      }
    }
    if (prev.cableId !== outputs.cableId) {
      await closeBus("cable");
      cableError = "";
      if (outputs.cableId && buses.monitor) await ensureBuses();
      if (mic.enabled) await setMic({ ...mic });
    } else if (buses.cable) {
      buses.cable.master.gain.setTargetAtTime(outputs.cableVol, buses.cable.ctx.currentTime, 0.015);
    }
    emit("outputs", outputStatus());
  }

  function outputStatus() {
    return { cableActive: Boolean(buses.cable), cableError };
  }

  async function setMic({ enabled, deviceId, gain, duck = mic.duck }) {
    mic.duck = Math.min(0, Number(duck) || 0);
    mic.deviceId = deviceId || "default";
    mic.gain = gain ?? mic.gain;
    if (mic.gainNode) applyDuck();
    const staleContext = Boolean(mic.node && buses.cable && mic.node.context !== buses.cable.ctx);
    const wantRestart = enabled !== mic.enabled || mic.stream?.__deviceId !== mic.deviceId || !buses.cable || staleContext;
    mic.enabled = Boolean(enabled);
    if (!wantRestart && mic.stream) return;
    if (mic.stream) {
      mic.stream.getTracks().forEach((t) => t.stop());
      try {
        mic.node.disconnect();
        mic.gainNode.disconnect();
      } catch {}
      mic.stream = mic.node = mic.gainNode = null;
    }
    if (!mic.enabled) return scheduleIdle();
    await ensureBuses();
    if (!buses.cable) {
      emit("error", { scope: "mic", message: "Pick a cable output first" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: mic.deviceId === "default" ? undefined : { exact: mic.deviceId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      stream.__deviceId = mic.deviceId;
      const ctx = buses.cable.ctx;
      mic.stream = stream;
      mic.node = ctx.createMediaStreamSource(stream);
      mic.gainNode = ctx.createGain();
      mic.gainNode.gain.value = mic.gain;
      mic.node.connect(mic.gainNode).connect(buses.cable.master);
      applyDuck();
    } catch (e) {
      mic.enabled = false;
      emit("error", { scope: "mic", message: String(e && e.message || e) });
    }
  }

  function readPeak(bus) {
    if (!bus || bus.ctx.state !== "running") return 0;
    bus.analyser.getFloatTimeDomainData(bus.meterBuf);
    let peak = 0;
    for (let i = 0; i < bus.meterBuf.length; i++) {
      const a = Math.abs(bus.meterBuf[i]);
      if (a > peak) peak = a;
    }
    return peak;
  }

  function meters() {
    return { monitor: readPeak(buses.monitor), cable: readPeak(buses.cable) };
  }

  function stats() {
    return { cacheBytes: cache.usedBytes, budget: cache.budget, voices: voices.size, entries: cache.map.size };
  }

  function setCacheMB(mb) {
    cache.setBudget(mb * 1024 * 1024);
    emit("cache", stats());
  }

  function on(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
    return () => listeners.get(evt).delete(fn);
  }

  return {
    analyze,
    preload,
    trigger,
    stop,
    stopAll,
    refresh,
    isPlaying,
    playingIds,
    nowPlaying,
    stopVoiceById,
    isCableActive: () => cableActive,
    progress,
    invalidate,
    setOutputs,
    outputStatus,
    setMic,
    meters,
    stats,
    setCacheMB,
    hasActivity: () => voices.size > 0 || Boolean(mic.stream),
    hasPending,
    on
  };
}
