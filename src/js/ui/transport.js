// Top strip: monitor + cable outputs (device, fader, meter), mic, theme, stop all.
import { h, icon, setFill } from "./dom.js";
import { formatKey } from "../keys.js";

export function createTransport(root, app) {
  const { store, engine } = app;
  let devices = { outputs: [], inputs: [], labelled: false };

  const dot = h("span", { class: "led-dot" });
  const wordmark = h("div", { class: "wordmark", title: "Sonic Dominion" }, dot, h("span", { class: "wm-full" }, "SONIC DOMINION"), h("span", { class: "wm-short" }, "SD"));

  function bus(kind, label, iconName) {
    const select = h("select", { class: "field", "aria-label": `${label} device` });
    const fader = h("input", { class: "fader", type: "range", min: "0", max: "1", step: "0.01", "aria-label": `${label} level` });
    const meterFill = h("i");
    const vol = h("span", { class: "vol num" });
    const el = h(
      "div",
      { class: "bus", dataset: { kind } },
      h("span", { class: "bus-name" }, icon(iconName), h("span", { class: "label" }, label)),
      select,
      h("div", { class: "fader-wrap" }, fader, h("div", { class: "meter" }, meterFill)),
      vol
    );
    select.addEventListener("change", async () => {
      if (select.value === "__reveal__") {
        select.value = current(kind);
        await revealLabels();
        return;
      }
      store.update((s) => {
        if (kind === "monitor") s.outputs.monitorId = select.value;
        else s.outputs.cableId = select.value;
      }, "outputs");
      engine.setOutputs(store.state.outputs);
    });
    fader.addEventListener("input", () => {
      const v = Number(fader.value);
      setFill(fader);
      vol.textContent = `${Math.round(v * 100)}`;
      store.update((s) => {
        if (kind === "monitor") s.outputs.monitorVol = v;
        else s.outputs.cableVol = v;
      }, "outputs");
      engine.setOutputs(store.state.outputs);
    });
    return { el, select, fader, meterFill, vol };
  }

  const current = (kind) => (kind === "monitor" ? store.state.outputs.monitorId : store.state.outputs.cableId);

  const monitor = bus("monitor", "Monitor", "i-headphones");
  const cable = bus("cable", "Cable", "i-cable");

  const micSwitch = h("input", { class: "switch", type: "checkbox", role: "switch", "aria-label": "Send microphone to cable" });
  const micWrap = h("label", { class: "mic-toggle", title: "Mix your microphone into the cable output" }, icon("i-mic"), h("span", { class: "label" }, "Mic to cable"), micSwitch);
  micSwitch.addEventListener("change", () => {
    store.update((s) => (s.mic.enabled = micSwitch.checked), "mic");
    engine.setMic(store.state.mic);
  });

  const compactBtn = h("button", { class: "btn ghost icon", type: "button" }, icon("i-compact"));
  compactBtn.addEventListener("click", () => app.actions.setCompact(!app.ui.compact));
  const settingsBtn = h("button", { class: "btn ghost icon", type: "button", title: "Settings (Ctrl ,)", "aria-label": "Settings" }, icon("i-gear"));
  settingsBtn.addEventListener("click", () => app.actions.openSettings());

  const stopKey = h("span", { class: "kbd" });
  const stopBtn = h("button", { class: "btn stop-all", type: "button", title: "Stop every sound (right-click to set a hotkey)" }, icon("i-stop"), "Stop all", stopKey);
  stopBtn.addEventListener("click", () => engine.stopAll());
  stopBtn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    app.actions.captureKey("__stop_all__");
  });

  root.append(wordmark, monitor.el, cable.el, h("div", { class: "spacer" }), micWrap, settingsBtn, compactBtn, stopBtn);

  function fillSelect(sel, list, value, { allowNone }) {
    sel.replaceChildren();
    if (allowNone) sel.append(h("option", { value: "" }, "Off"));
    sel.append(h("option", { value: "default" }, "System default"));
    list.forEach((d, i) => {
      if (d.deviceId === "default" || d.deviceId === "communications") return;
      sel.append(h("option", { value: d.deviceId }, d.label || `Output ${i + 1}`));
    });
    if (!devices.labelled) sel.append(h("option", { value: "__reveal__" }, "Show device names…"));
    const has = [...sel.options].some((o) => o.value === value);
    if (value && !has) sel.append(h("option", { value }, "Unavailable device"));
    sel.value = value || (allowNone ? "" : "default");
  }

  async function loadDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    devices = {
      outputs: all.filter((d) => d.kind === "audiooutput"),
      inputs: all.filter((d) => d.kind === "audioinput"),
      labelled: all.some((d) => d.label)
    };
    app.devices = devices;
    app.store.emit("devices");
    render();
  }

  async function revealLabels() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {}
    await loadDevices();
  }

  navigator.mediaDevices?.addEventListener?.("devicechange", loadDevices);

  function render() {
    const s = store.state;
    fillSelect(monitor.select, devices.outputs, s.outputs.monitorId, { allowNone: false });
    fillSelect(cable.select, devices.outputs, s.outputs.cableId, { allowNone: true });
    monitor.fader.value = String(s.outputs.monitorVol);
    cable.fader.value = String(s.outputs.cableVol);
    monitor.vol.textContent = `${Math.round(s.outputs.monitorVol * 100)}`;
    cable.vol.textContent = `${Math.round(s.outputs.cableVol * 100)}`;
    setFill(monitor.fader);
    setFill(cable.fader);
    cable.fader.disabled = !s.outputs.cableId;
    const st = engine.outputStatus();
    cable.el.classList.toggle("offline", Boolean(s.outputs.cableId && st.cableError));
    cable.el.title = st.cableError ? `Cable output unavailable: ${st.cableError}` : "Second output, usually a virtual audio cable";
    micSwitch.checked = s.mic.enabled;
    micWrap.classList.toggle("on", s.mic.enabled);
    const compactLabel = app.ui.compact ? "Leave compact mode" : "Compact mode: small window that stays on top";
    compactBtn.title = compactLabel;
    compactBtn.setAttribute("aria-label", compactLabel);
    compactBtn.setAttribute("aria-pressed", String(app.ui.compact));
    stopKey.textContent = s.stopAllKey ? formatKey(s.stopAllKey) : "";
    stopKey.hidden = !s.stopAllKey;
    stopKey.classList.toggle("conflict", app.keyFailed.has("__stop_all__"));
    stopBtn.title = app.keyFailed.has("__stop_all__") ? "The Stop all hotkey is not active: another binding or app uses it" : "Stop every sound (right-click to set a hotkey)";
  }

  const meterState = { monitor: 0, cable: 0 };
  function setMeters(m, active) {
    for (const [kind, ui] of [["monitor", monitor], ["cable", cable]]) {
      const v = Math.max(m[kind], meterState[kind] * 0.86);
      meterState[kind] = v;
      ui.meterFill.style.transform = `scaleX(${Math.min(1, v).toFixed(3)})`;
      ui.meterFill.classList.toggle("hot", m[kind] > 0.89);
    }
    dot.classList.toggle("on", active);
    return meterState.monitor > 0.002 || meterState.cable > 0.002;
  }

  loadDevices();
  render();
  return { render, setMeters, loadDevices };
}
