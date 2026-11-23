// Left rail: search, library views (All, Favorites, Recent, Unsorted) and banks.
// Banks carry sampler-style letters; the active bank (the one Numpad slots and the
// phone remote use) shows a lit LED. Choosing a bank makes it active.
import { h, icon, openMenu } from "./dom.js";
import { bankLetter } from "../model.js";

export function createRail(root, app) {
  const { store, ui } = app;

  const search = h("input", { class: "field", type: "search", placeholder: "Search", "aria-label": "Search sounds", spellcheck: "false" });
  search.addEventListener("input", () => {
    ui.query = search.value;
    store.emit("filter");
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      search.value = "";
      ui.query = "";
      store.emit("filter");
      search.blur();
    }
    if (e.key === "Enter") app.actions.playFirstVisible();
  });

  const list = h("div", { class: "rail-list" });
  const newBtn = h("button", { class: "btn ghost", type: "button" }, icon("i-plus"), "New bank");
  newBtn.addEventListener("click", () => app.actions.newBoard());

  root.append(
    h("div", { class: "rail-search" }, icon("i-search"), search, h("span", { class: "kbd" }, "Ctrl F")),
    list,
    h("div", { class: "rail-foot" }, newBtn)
  );

  let renaming = "";
  let dragBoard = "";

  function view(id, label, iconName, count) {
    const el = h(
      "button",
      { class: "rail-item", type: "button", "aria-current": ui.board === id ? "true" : "false", dataset: { id } },
      icon(iconName),
      h("span", { class: "label" }, label),
      h("span", { class: "count" }, String(count))
    );
    el.addEventListener("click", () => {
      ui.board = id;
      store.emit("board");
    });
    if (id === "") acceptSounds(el, "");
    return el;
  }

  function acceptSounds(el, folderId) {
    el.addEventListener("dragover", (e) => {
      if (app.drag.sound) {
        e.preventDefault();
        el.classList.add("drop-target");
      } else if (dragBoard && folderId && dragBoard !== folderId) {
        e.preventDefault();
        el.classList.add("insert-before");
      }
    });
    el.addEventListener("dragleave", () => el.classList.remove("drop-target", "insert-before"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("drop-target", "insert-before");
      if (app.drag.sound) app.actions.moveToBoard(app.drag.ids(), folderId);
      else if (dragBoard && folderId) app.actions.reorderBoard(dragBoard, folderId);
    });
  }

  function bank(f, i, count) {
    const active = store.state.activeBank === f.id;
    const el = h(
      "button",
      {
        class: `rail-item bank${active ? " active" : ""}`,
        type: "button",
        draggable: "true",
        "aria-current": ui.board === f.id ? "true" : "false",
        title: active ? "Active bank: Numpad slots and the phone remote play from here" : "Click to make this the active bank",
        dataset: { id: f.id }
      },
      h("span", { class: "bank-letter num" }, bankLetter(i)),
      h("span", { class: "label" }, f.name),
      h("span", { class: "bank-led", "aria-hidden": "true" }),
      h("span", { class: "count" }, String(count))
    );
    el.addEventListener("click", () => app.actions.setActiveBank(f.id, { show: true }));
    acceptSounds(el, f.id);
    el.addEventListener("dragstart", (e) => {
      if (app.drag.sound) return;
      dragBoard = f.id;
      el.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", f.id);
    });
    el.addEventListener("dragend", () => {
      dragBoard = "";
      el.classList.remove("dragging");
    });
    el.addEventListener("dblclick", () => startRename(f.id));
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openMenu(e.clientX, e.clientY, [
        { label: "Make active", run: () => app.actions.setActiveBank(f.id) },
        { label: "Rename", run: () => startRename(f.id) },
        "-",
        { label: "Delete bank", danger: true, icon: "i-trash", run: () => app.actions.deleteBoard(f.id) }
      ]);
    });
    return el;
  }

  function startRename(id) {
    renaming = id;
    render();
  }

  function renameField(f, i) {
    const input = h("input", { class: "field", value: f.name, "aria-label": "Bank name", spellcheck: "false" });
    let done = false;
    const commit = (save) => {
      if (done) return;
      done = true;
      renaming = "";
      const name = input.value.trim();
      if (save && name && name !== f.name) store.update((s) => (s.folders.find((x) => x.id === f.id).name = name), "folders");
      else render();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit(true);
      if (e.key === "Escape") commit(false);
    });
    input.addEventListener("blur", () => commit(true));
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
    return h("div", { class: "rail-item bank", "aria-current": "true" }, h("span", { class: "bank-letter num" }, bankLetter(i)), input);
  }

  function render() {
    const s = store.state;
    const counts = new Map();
    let favs = 0;
    for (const snd of s.sounds) {
      counts.set(snd.folderId, (counts.get(snd.folderId) || 0) + 1);
      if (snd.fav) favs++;
    }
    const nodes = [view("all", "All sounds", "i-all", s.sounds.length)];
    if (favs) nodes.push(view("fav", "Favorites", "i-star", favs));
    if (s.recent.length) nodes.push(view("recent", "Recent", "i-clock", s.recent.length));
    if (counts.get("")) nodes.push(view("", "Unsorted", "i-inbox", counts.get("")));
    if (s.folders.length) {
      nodes.push(
        h(
          "div",
          { class: "rail-group" },
          h("span", {}, "Banks"),
          s.slotKeys ? h("span", { class: "rail-hint", title: "Numpad 1–9 play the active bank; Num + / − switch" }, "Num 1–9") : null
        )
      );
    }
    s.folders.forEach((f, i) => nodes.push(renaming === f.id ? renameField(f, i) : bank(f, i, counts.get(f.id) || 0)));
    list.replaceChildren(...nodes);
  }

  render();
  return { render, focusSearch: () => { search.focus(); search.select(); }, startRename };
}
