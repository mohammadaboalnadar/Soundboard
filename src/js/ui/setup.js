// Voice chat setup: a guided check that finds the virtual cable, picks a microphone, proves
// the cable carries sound, and says exactly what to set in Discord. It changes nothing until
// "Finish" is pressed, and it never touches another app's settings.
import { h, toast } from "./dom.js";
import { micChoices, findCable, findCableCapture } from "../devices.js";

const CABLE_URL = "https://vb-audio.com/Cable/";
const STEP_COUNT = 4;

async function listDevices() {
  const read = async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    return { all, labelled: all.some((d) => d.label) };
  };
  let { all, labelled } = await read();
  if (!labelled) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {}
    ({ all, labelled } = await read());
  }
  return {
    outputs: all.filter((d) => d.kind === "audiooutput"),
    inputs: all.filter((d) => d.kind === "audioinput"),
    labelled
  };
}

const RAW = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
/** Browser errors in words a person can act on. */
function explain(e) {
  const name = e?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Windows or the app blocked microphone access. Check Settings → Privacy & security → Microphone.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "That device isn't available any more. Unplug and replug it, or pick another one.";
  if (name === "NotReadableError") return "Another app is holding that device. Close it and try again.";
  return e?.message || String(e);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function createSetup(app) {
  const { store, engine } = app;
  let layer = null;
  let card = null;
  let lastFocus = null;
  let i = 0;
  let devs = { outputs: [], inputs: [], labelled: false };
  let cable = null;
  let micId = "default";
  let soundsOnly = false;
  let stopMeter = () => {};
  let testResult = null; // { ok, text }
  let testing = false;
  let scanning = false;

  function close() {
    if (!layer) return;
    stopMeter();
    layer.remove();
    removeEventListener("keydown", onKey, true);
    layer = card = null;
    lastFocus?.focus?.();
  }

  async function scan() {
    scanning = true;
    render();
    try {
      devs = await listDevices();
    } catch {}
    cable = findCable(devs.outputs);
    scanning = false;
    render();
  }

  /** Live level of the chosen microphone, so "is it hearing me?" is answered by looking. */
  async function startMeter(fill, msg) {
    stopMeter();
    let stream = null;
    let ctx = null;
    let raf = 0;
    let dead = false;
    stopMeter = () => {
      dead = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
      stopMeter = () => {};
    };
    fill.parentElement.removeAttribute("data-error");
    msg.hidden = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: micId === "default" ? undefined : { exact: micId }, ...RAW } });
      if (dead) return stream.getTracks().forEach((t) => t.stop());
      ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      const tick = () => {
        an.getFloatTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v));
        fill.style.width = `${Math.min(100, Math.round(Math.sqrt(peak) * 140))}%`;
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      if (dead) return;
      fill.parentElement.dataset.error = "1";
      msg.hidden = false;
      msg.textContent = `Can't open this microphone. ${explain(e)}`;
    }
  }

  /** Play a short quiet tone into the cable and listen on CABLE Output. */
  async function runTest() {
    if (testing || !cable) return;
    testing = true;
    testResult = null;
    render();
    const capture = findCableCapture(devs.inputs);
    let stream = null;
    let rc = null;
    let pc = null;
    try {
      if (!capture) throw new Error("CABLE Output isn't listed. Reinstall VB-CABLE and restart Windows.");
      stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: capture.deviceId }, ...RAW } });
      rc = new AudioContext();
      const an = rc.createAnalyser();
      an.fftSize = 2048;
      rc.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      const peak = () => {
        an.getFloatTimeDomainData(buf);
        let p = 0;
        for (const v of buf) p = Math.max(p, Math.abs(v));
        return p;
      };
      pc = new AudioContext();
      await pc.setSinkId(cable.deviceId);
      const osc = pc.createOscillator();
      const gain = pc.createGain();
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0, pc.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, pc.currentTime + 0.05);
      gain.gain.setValueAtTime(0.08, pc.currentTime + 0.7);
      gain.gain.linearRampToValueAtTime(0, pc.currentTime + 0.8);
      osc.connect(gain).connect(pc.destination);
      await wait(250);
      const quiet = peak();
      osc.start();
      let loud = 0;
      for (let t = 0; t < 8; t++) {
        await wait(100);
        loud = Math.max(loud, peak());
      }
      osc.stop();
      testResult =
        loud > 0.01 && loud > quiet * 3
          ? { ok: true, text: "The cable carried the tone. Sounds will reach any app that listens on CABLE Output." }
          : { ok: false, text: "Nothing came out of CABLE Output. Check that the cable isn't muted in Windows Sound settings, then test again." };
    } catch (e) {
      testResult = { ok: false, text: `The test couldn't run. ${explain(e)}` };
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      rc?.close().catch(() => {});
      pc?.close().catch(() => {});
      testing = false;
      render();
    }
  }

  function apply() {
    store.update((s) => {
      s.outputs.cableId = cable.deviceId;
    }, "outputs");
    engine.setOutputs(store.state.outputs);
    app.actions.setMic({ deviceId: micId, enabled: !soundsOnly });
    // let the top bar re-read the device lists
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  }

  function body() {
    if (i === 0) {
      if (scanning) return [h("p", {}, "Looking for a virtual cable…")];
      if (cable) {
        return [
          h("p", {}, "Found the cable sounds will be sent into:"),
          h("p", { class: "setup-device" }, cable.label),
          h("p", { class: "setup-note" }, "Discord, OBS and games will listen to it as a microphone. Nothing changes until you finish.")
        ];
      }
      const open = h("button", { class: "btn", type: "button" }, "Open download page");
      open.addEventListener("click", () => app.platform.openUrl(CABLE_URL).catch((e) => toast(String(e), { error: true })));
      const again = h("button", { class: "btn", type: "button" }, "Check again");
      again.addEventListener("click", scan);
      return [
        h("p", {}, "Sonic Dominion sends sounds into a free virtual cable so voice chat can hear them. No cable is installed yet."),
        h("p", { class: "setup-note" }, "Install VB-CABLE, restart Windows if the installer asks, then check again."),
        h("div", { class: "setup-row" }, open, again)
      ];
    }
    if (i === 1) {
      const choices = micChoices(devs.inputs);
      const sel = h("select", { class: "field setup-field", "aria-label": "Microphone" }, h("option", { value: "default" }, "System default"));
      choices.forEach((d, n) => sel.append(h("option", { value: d.deviceId }, d.label || `Input ${n + 1}`)));
      sel.value = [...sel.options].some((o) => o.value === micId) ? micId : "default";
      micId = sel.value;
      const fill = h("i");
      const meter = h("div", { class: "setup-meter", "aria-label": "Microphone level" }, fill);
      const msg = h("p", { class: "setup-note setup-error", role: "status", hidden: true });
      const only = h("input", { type: "checkbox", checked: soundsOnly });
      only.addEventListener("change", () => {
        soundsOnly = only.checked;
        sel.disabled = soundsOnly;
        if (soundsOnly) stopMeter();
        else startMeter(fill, msg);
      });
      sel.disabled = soundsOnly;
      sel.addEventListener("change", () => {
        micId = sel.value;
        startMeter(fill, msg);
      });
      if (!soundsOnly) requestAnimationFrame(() => startMeter(fill, msg));
      return [
        h("p", {}, "Choose the microphone your friends should hear. Talk: the bar should move."),
        sel,
        meter,
        msg,
        h("label", { class: "setup-check" }, only, h("span", {}, "Sounds only. Don't send my microphone."))
      ];
    }
    if (i === 2) {
      const btn = h("button", { class: "btn", type: "button", disabled: testing }, testing ? "Testing…" : testResult ? "Test again" : "Play test tone");
      btn.addEventListener("click", runTest);
      return [
        h("p", {}, "A short quiet tone goes into the cable. If it comes out of CABLE Output, the pipe works. Anyone listening on it hears one beep."),
        h("div", { class: "setup-row" }, btn),
        testResult ? h("p", { class: `setup-result ${testResult.ok ? "ok" : "bad"}`, role: "status" }, testResult.text) : null
      ];
    }
    const capture = findCableCapture(devs.inputs);
    const name = capture ? capture.label : "CABLE Output (VB-Audio Virtual Cable)";
    return [
      h("p", {}, "One step is yours: voice apps choose their own microphone."),
      h(
        "ol",
        { class: "setup-steps" },
        h("li", {}, "Discord → Settings → Voice & Video → Input Device:", h("strong", {}, name)),
        h("li", {}, "Turn off “Automatically determine input sensitivity” and drag the slider to the far left."),
        h("li", {}, "Turn off Noise Suppression and Echo Cancellation while testing."),
        h("li", {}, "Click Let's Check, talk, then play a pad. The bar should move for both.")
      ),
      h("p", { class: "setup-note" }, "The same device works in OBS, games and any app with a microphone setting.")
    ];
  }

  function canNext() {
    if (i === 0) return Boolean(cable) && !scanning;
    return true;
  }

  function render() {
    if (!layer) return;
    if (i !== 1) stopMeter();
    const last = i === STEP_COUNT - 1;
    const back = h("button", { class: "btn ghost", type: "button", disabled: i === 0 }, "Back");
    back.addEventListener("click", () => go(i - 1));
    const next = h("button", { class: "btn primary", type: "button", disabled: !canNext() }, last ? "Finish setup" : "Next");
    next.addEventListener("click", () => {
      if (last) {
        apply();
        close();
        toast("Voice chat is set up. Pick CABLE Output as the input in Discord.");
      } else go(i + 1);
    });
    const skip = h("button", { class: "tour-skip", type: "button" }, "Close");
    skip.addEventListener("click", close);
    card.replaceChildren(
      h("div", { class: "tour-top" }, h("span", { class: "tour-count num" }, `SETUP ${String(i + 1).padStart(2, "0")} / ${String(STEP_COUNT).padStart(2, "0")}`), skip),
      h("h2", { id: "setup-title" }, ["Find your cable", "Pick your microphone", "Test the cable", "Tell Discord"][i]),
      ...body().filter(Boolean),
      h("div", { class: "tour-actions" }, back, next)
    );
  }

  function go(n) {
    i = Math.max(0, Math.min(STEP_COUNT - 1, n));
    render();
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      const f = [...card.querySelectorAll("button:not([disabled]), select:not([disabled]), input:not([disabled])")];
      if (!f.length) return;
      const at = f.indexOf(document.activeElement);
      if (e.shiftKey && at <= 0) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && at === f.length - 1) {
        e.preventDefault();
        f[0].focus();
      }
    }
  }

  function start() {
    if (layer) return;
    lastFocus = document.activeElement;
    i = 0;
    testResult = null;
    soundsOnly = false;
    micId = store.state.mic.deviceId || "default";
    card = h("div", { class: "tour-card setup-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "setup-title" });
    layer = h("div", { class: "tour centered" }, card);
    document.body.append(layer);
    addEventListener("keydown", onKey, true);
    scan();
  }

  return { start, isOpen: () => Boolean(layer) };
}
