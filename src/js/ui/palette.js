// Ctrl+K command palette: fuzzy-ish search over sounds and actions. Enter fires.
import { h, led } from "./dom.js";
import { formatKey } from "../keys.js";
import { baseName, bankLetter } from "../model.js";

function score(text, q) {
  const t = text.toLowerCase();
  if (!q) return 1;
  const i = t.indexOf(q);
  if (i === 0) return 3;
  if (i > 0) return 2;
  let j = 0;
  for (const ch of t) if (ch === q[j]) j++;
  return j === q.length ? 1 : 0;
}

export function createPalette(dialog, app) {
  const { store } = app;
  const input = h("input", { class: "field", type: "text", placeholder: "Play a sound or run a command", "aria-label": "Command", spellcheck: "false" });
  const list = h("ul", { role: "listbox" });
  dialog.append(input, list);
  let items = [];
  let active = 0;

  function commands() {
    const s = store.state;
    return [
      { label: "Add sounds", meta: "Command", run: () => app.actions.addSounds() },
      { label: "New board", meta: "Command", run: () => app.actions.newBoard() },
      { label: "Stop all sounds", meta: s.stopAllKey ? formatKey(s.stopAllKey) : "Command", run: () => app.engine.stopAll() },
      { label: s.theme === "light" ? "Use dark theme" : "Use light theme", meta: "Command", run: () => app.actions.toggleTheme() },
      { label: s.view === "grid" ? "Show as list" : "Show as pads", meta: "Command", run: () => store.update((x) => (x.view = x.view === "grid" ? "list" : "grid"), "view") },
      { label: "Set Stop all hotkey", meta: "Command", run: () => app.actions.captureKey("__stop_all__") },
      { label: "Record from mic", meta: "Ctrl R", run: () => app.actions.record() },
      { label: "Open settings", meta: "Ctrl ,", run: () => app.actions.openSettings() },
      { label: "Voice chat setup", meta: "Command", run: () => app.actions.startSetup() },
      { label: "Show the tour", meta: "Command", run: () => app.actions.startTour() },
      { label: "Check for updates", meta: "Command", run: () => app.actions.checkUpdates() },
      { label: app.ui.compact ? "Leave compact mode" : "Compact mode", meta: "Command", run: () => app.actions.setCompact(!app.ui.compact) },
      { label: s.slotKeys ? "Turn off Numpad slots" : "Turn on Numpad slots", meta: "Command", run: () => app.actions.setSlotKeys(!s.slotKeys) },
      { label: s.remote.enabled ? "Turn off phone remote" : "Turn on phone remote", meta: "Command", run: () => app.actions.setRemote(!s.remote.enabled) },
      ...s.folders.map((f, i) => ({ label: `Bank ${bankLetter(i)}: ${f.name}`, meta: "Bank", run: () => app.actions.setActiveBank(f.id, { show: true }) }))
    ];
  }

  function build() {
    const q = input.value.trim().toLowerCase();
    const sounds = store.state.sounds.map((snd) => ({
      label: snd.name || baseName(snd.path),
      meta: snd.key ? formatKey(snd.key) : "",
      color: snd.color,
      run: () => app.actions.fire(snd),
      alt: () => app.actions.select(snd.id)
    }));
    items = [...sounds, ...commands()]
      .map((it) => ({ it, sc: score(`${it.label} ${it.meta}`, q) }))
      .filter((x) => x.sc > 0)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 40)
      .map((x) => x.it);
    active = Math.min(active, Math.max(0, items.length - 1));
    if (!items.length) return list.replaceChildren(h("li", { class: "none" }, "Nothing found"));
    list.replaceChildren(
      ...items.map((it, i) => {
        const li = h(
          "li",
          { role: "option", "aria-selected": String(i === active), style: it.color ? { "--led": led(it.color) } : undefined },
          it.color ? h("span", { class: "led" }) : null,
          h("span", { class: "grow" }, it.label),
          it.meta ? h("span", { class: it.color ? "kbd" : "meta" }, it.meta) : null
        );
        li.addEventListener("pointermove", () => {
          if (active !== i) {
            active = i;
            mark();
          }
        });
        li.addEventListener("click", () => choose(i));
        return li;
      })
    );
  }

  function mark() {
    [...list.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
    list.children[active]?.scrollIntoView({ block: "nearest" });
  }

  function choose(i, alt = false) {
    const it = items[i];
    if (!it) return;
    close();
    (alt && it.alt ? it.alt : it.run)();
  }

  function open() {
    if (dialog.open) return;
    input.value = "";
    active = 0;
    build();
    dialog.showModal();
    input.focus();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  input.addEventListener("input", () => {
    active = 0;
    build();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(1, items.length);
      mark();
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active, e.altKey);
    }
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });

  return { open, close, isOpen: () => dialog.open };
}
