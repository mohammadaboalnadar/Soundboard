// Mic recorder: an inline strip at the top of the deck. Records WebM/Opus,
// saves through the Rust side and drops the result in as a new pad to trim.
import { h, icon, toast } from "./dom.js";

const MAX_SECONDS = 120;

export function createRecorder(app) {
  const { store, platform } = app;
  let session = null;

  function fmt(ms) {
    const s = ms / 1000;
    return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
  }

  async function start() {
    if (session) return;
    let stream;
    try {
      const deviceId = store.state.mic.deviceId;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: deviceId === "default" ? undefined : { exact: deviceId }, echoCancellation: false, autoGainControl: false }
      });
    } catch (e) {
      toast(`Recorder can’t use the microphone: ${e.message || e}`, { error: true });
      return;
    }
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 128000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    // level meter on a small, short-lived context
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);

    const time = h("span", { class: "rec-time num" }, "0:00.0");
    const fill = h("i");
    const save = h("button", { class: "btn primary", type: "button" }, icon("i-stop"), "Stop and add pad");
    const discard = h("button", { class: "btn ghost", type: "button" }, "Discard");
    const bar = h(
      "div",
      { class: "rec-bar", role: "status", "aria-live": "polite" },
      h("span", { class: "rec-dot", "aria-hidden": "true" }),
      h("span", { class: "rec-label" }, "Recording"),
      time,
      h("span", { class: "rec-meter", "aria-hidden": "true" }, fill),
      h("span", { class: "grow" }),
      discard,
      save
    );
    document.querySelector(".deck-bar").after(bar);

    const t0 = performance.now();
    let raf = 0;
    let level = 0;
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
      level = Math.max(peak, level * 0.88);
      fill.style.transform = `scaleX(${Math.min(1, level).toFixed(3)})`;
      const el = performance.now() - t0;
      time.textContent = fmt(el);
      if (el >= MAX_SECONDS * 1000) return finish(true);
      raf = requestAnimationFrame(tick);
    };

    session = { rec, stream, ctx, bar };
    rec.start(250);
    raf = requestAnimationFrame(tick);

    async function finish(keep) {
      if (!session) return;
      cancelAnimationFrame(raf);
      const s = session;
      session = null;
      const stopped = new Promise((r) => (s.rec.onstop = r));
      if (s.rec.state !== "inactive") s.rec.stop();
      await stopped;
      s.stream.getTracks().forEach((t) => t.stop());
      s.ctx.close().catch(() => {});
      s.bar.remove();
      if (!keep || !chunks.length) return;
      try {
        const bytes = new Uint8Array(await new Blob(chunks, { type: mime }).arrayBuffer());
        const path = await platform.saveRecording(bytes);
        const n = store.state.sounds.filter((x) => /^Recording \d+$/.test(x.name)).length + 1;
        await app.actions.addPaths([path], { names: [`Recording ${n}`] });
      } catch (e) {
        toast(`Couldn’t save the recording: ${e.message || e}`, { error: true });
      }
    }
    save.addEventListener("click", () => finish(true));
    discard.addEventListener("click", () => finish(false));
  }

  return { start, isRecording: () => Boolean(session) };
}
