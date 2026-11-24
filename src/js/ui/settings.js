// Settings sheet: microphone & ducking, hotkeys & banks, auto push-to-talk,
// phone remote, and app behaviour. Opens from the transport (Ctrl+,).
import { h, icon, setFill } from "./dom.js";
import { formatKey } from "../keys.js";
import { micChoices } from "../devices.js";

const DUCK = [
  [0, "Off"],
  [-6, "−6 dB"],
  [-12, "−12 dB"],
  [-20, "−20 dB"]
];
const LEAD = [0, 60, 120, 200, 300];
const CACHE = [32, 64, 128, 256];

export function createSettings(dialog, app) {
  const { store, ui } = app;
  const A = app.actions;
  let autostart = null;
  const body = h("div", { class: "sheet-body" });
  const close = h("button", { class: "btn ghost icon", type: "button", "aria-label": "Close settings" }, icon("i-close"));
  close.addEventListener("click", () => dialog.close());
  dialog.append(h("header", { class: "sheet-head" }, h("h2", {}, "Settings"), close), body);
  dialog.addEventListener("click", (e) => e.target === dialog && dialog.close());
  dialog.addEventListener("close", () => {
    if (ui.capture === "__ptt__" || ui.capture === "__stop_all__") A.cancelCapture();
  });

  const row = (title, hint, control) =>
    h("div", { class: "set-row" }, h("div", { class: "copy" }, h("span", { class: "set-title" }, title), hint ? h("span", { class: "hint" }, hint) : null), control);

  function sw(checked, onChange, label) {
    const input = h("input", { class: "switch", type: "checkbox", role: "switch", "aria-label": label });
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    return input;
  }

  function seg(options, value, onPick, label) {
    const el = h("div", { class: "seg seg-text", role: "radiogroup", "aria-label": label });
    for (const [v, text] of options) {
      const b = h("button", { type: "button", role: "radio", "aria-checked": String(v === value) }, text);
      b.addEventListener("click", () => onPick(v));
      el.append(b);
    }
    return el;
  }

  function keyButton(id, current, emptyLabel) {
    const listening = ui.capture === id;
    const b = h(
      "button",
      { class: `btn key-btn${listening ? " listening" : ""}`, type: "button" },
      h("span", { class: "kbd" }, listening ? "Press keys…" : current ? formatKey(current) : emptyLabel)
    );
    b.addEventListener("click", () => (listening ? A.cancelCapture() : A.captureKey(id)));
    return b;
  }

  function section(title, ...rows) {
    return h("section", { class: "set-section" }, h("h3", {}, title), ...rows);
  }

  function render() {
    if (!dialog.open) return;
    const s = store.state;

    // microphone
    const micSel = h("select", { class: "field", "aria-label": "Microphone" });
    micSel.append(h("option", { value: "default" }, "System default"));
    micChoices(app.devices.inputs).forEach((d, i) => micSel.append(h("option", { value: d.deviceId }, d.label || `Input ${i + 1}`)));
    micSel.value = [...micSel.options].some((o) => o.value === s.mic.deviceId) ? s.mic.deviceId : "default";
    micSel.addEventListener("change", () => A.setMic({ deviceId: micSel.value }));
    const micGain = h("input", { class: "fader", type: "range", min: "0", max: "2", step: "0.05", value: String(s.mic.gain), "aria-label": "Microphone level" });
    setFill(micGain);
    micGain.addEventListener("input", () => setFill(micGain));
    micGain.addEventListener("change", () => A.setMic({ gain: Number(micGain.value) }));

    // remote
    const remoteRows = [row("Allow phone control", "Play pads from your phone on the same Wi-Fi. Windows may ask to allow network access the first time.", sw(s.remote.enabled, (on) => A.setRemote(on), "Phone remote"))];
    if (s.remote.enabled && ui.remoteUrl) {
      const regen = h("button", { class: "btn", type: "button" }, "New PIN");
      regen.addEventListener("click", () => A.setRemote(true, { regenerate: true }));
      remoteRows.push(
        h(
          "div",
          { class: "remote-card" },
          h("div", { class: "remote-line" }, h("span", { class: "hint" }, "Open on your phone"), h("span", { class: "remote-url num", title: "Select to copy" }, ui.remoteUrl)),
          h("div", { class: "remote-line" }, h("span", { class: "hint" }, "PIN"), h("span", { class: "remote-pin num" }, s.remote.pin.replace(/(\d{3})(\d{3})/, "$1 $2")), regen)
        )
      );
    }

    // app
    const autoSw = sw(Boolean(autostart), async (on) => {
      try {
        autostart = await app.platform.autostartSet(on);
      } catch (e) {
        autostart = false;
      }
      render();
    }, "Start with Windows");
    autoSw.disabled = autostart === null;

    body.replaceChildren(
      section(
        "Microphone",
        row("Input", "Used for Mic to cable and the recorder.", micSel),
        row("Level", "", micGain),
        row("Duck mic while sounds play", "Lowers your voice in the cable mix so clips cut through.", seg(DUCK, s.mic.duck, (v) => A.setMic({ duck: v }), "Mic ducking"))
      ),
      section(
        "Hotkeys and banks",
        row("Numpad slots", "Num 1–9 play the first nine pads of the active bank. Num + and Num − switch banks.", sw(s.slotKeys, (on) => A.setSlotKeys(on), "Numpad slots")),
        row("Stop all", "Works from any app.", keyButton("__stop_all__", s.stopAllKey, "Set key"))
      ),
      section(
        "Auto push-to-talk",
        row("Push-to-talk key", app.pttConflict ? "This key is also one of your hotkeys here, so that hotkey is switched off. Pick a key nothing else uses." : "Hold this key for you while a sound plays into the cable. Use the same key as Discord. Mouse 4 and 5 work too.", h("div", { class: "key-pair" }, keyButton("__ptt__", s.ptt.key, "Off"), s.ptt.key ? clearPtt() : null)),
        row("Lead-in", "Time for the voice app to open the mic before the sound starts.", seg(LEAD.map((v) => [v, `${v} ms`]), s.ptt.leadMs, (v) => A.setPtt({ leadMs: v }), "Lead-in"))
      ),
      section("Phone remote", ...remoteRows),
      section(
        "App",
        row("Start with Windows", "Starts in the tray, hotkeys ready.", autoSw),
        row("Close to tray", "The close button hides the window; hotkeys keep working.", sw(s.closeToTray, (on) => A.setCloseToTray(on), "Close to tray")),
        row("Theme", "", seg([["dark", "Dark"], ["light", "Light"]], s.theme, (v) => A.setTheme(v), "Theme")),
        row("Updates", app.version ? `You have version ${app.version}. New versions are offered here when they come out.` : "New versions are offered here when they come out.", updatesBtn()),
        row("Tour", "The six-step walkthrough from your first launch.", tourBtn()),
        row("Audio cache", "Clips kept decoded for instant playback. Lower uses less memory; long clips always stream.", seg(CACHE.map((v) => [v, `${v} MB`]), s.cacheMB, (v) => A.setCacheMB(v), "Audio cache"))
      )
    );
  }

  function updatesBtn() {
    const b = h("button", { class: "btn", type: "button" }, "Check for updates");
    b.addEventListener("click", () => A.checkUpdates());
    return b;
  }

  function tourBtn() {
    const b = h("button", { class: "btn", type: "button" }, "Replay tour");
    b.addEventListener("click", () => A.startTour());
    return b;
  }

  function clearPtt() {
    const b = h("button", { class: "btn ghost icon", type: "button", "aria-label": "Turn off auto push-to-talk", title: "Turn off" }, icon("i-close"));
    b.addEventListener("click", () => A.setPtt({ key: "" }));
    return b;
  }

  async function open() {
    if (dialog.open) return;
    dialog.showModal();
    render();
    if (autostart === null) {
      try {
        autostart = await app.platform.autostartGet();
      } catch {
        autostart = false;
      }
      render();
    }
  }

  return { open, render, isOpen: () => dialog.open };
}
