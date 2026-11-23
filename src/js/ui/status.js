// Bottom strip: what is playing right now (each stoppable), then system state —
// audio cache, active bank, remote and push-to-talk.
import { h, icon, led } from "./dom.js";
import { bankLetter } from "../model.js";

const MAX_CHIPS = 4;

export function createStatus(root, app) {
  const { engine, store } = app;

  function chip(v) {
    const snd = store.state.sounds.find((s) => s.id === v.id);
    const stop = h("button", { class: "chip-stop", type: "button", "aria-label": `Stop ${v.name}`, title: "Stop" }, icon("i-close"));
    stop.addEventListener("click", () => engine.stopVoiceById(v.vid));
    return h(
      "span",
      { class: "chip", style: { "--led": led(snd?.color) } },
      h("span", { class: "pip", "aria-hidden": "true" }),
      h("span", { class: "chip-name" }, v.name || "Sound"),
      v.loop ? icon("m-loop") : null,
      stop
    );
  }

  function render() {
    const s = store.state;
    const st = engine.stats();
    const now = engine.nowPlaying();
    const playing = now.length
      ? h("div", { class: "now" }, ...now.slice(0, MAX_CHIPS).map(chip), now.length > MAX_CHIPS ? h("span", { class: "more num" }, `+${now.length - MAX_CHIPS}`) : null)
      : h("div", { class: "now idle" }, "Nothing playing");

    const bi = s.folders.findIndex((f) => f.id === s.activeBank);
    const fill = h("i", { style: { transform: `scaleX(${Math.min(1, st.cacheBytes / st.budget).toFixed(3)})` } });

    root.replaceChildren(
      playing,
      h(
        "div",
        { class: "sys" },
        bi >= 0 ? h("span", { class: "item", title: s.slotKeys ? "Numpad 1–9 play this bank, Num + / − switch" : "Active bank" }, "Bank", h("b", { class: "num" }, bankLetter(bi))) : null,
        s.remote.enabled ? h("span", { class: "item on", title: app.ui.remoteUrl }, h("span", { class: "dot" }), "Remote") : null,
        s.ptt.key ? h("span", { class: "item", title: "Auto push-to-talk is on" }, "PTT") : null,
        h("span", { class: "item", title: "Decoded audio kept in memory for instant playback" }, "Cache", h("span", { class: "cachebar" }, fill), h("span", { class: "num" }, `${(st.cacheBytes / 1048576).toFixed(1)}/${Math.round(st.budget / 1048576)} MB`))
      )
    );
  }

  return { render };
}
