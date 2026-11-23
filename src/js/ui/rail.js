// Left rail: search, "All sounds", "Unsorted", boards (folders) with counts.
import { h, icon, openMenu } from "./dom.js";

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
  const newBtn = h("button", { class: "btn ghost", type: "button" }, icon("i-plus"), "New board");
  newBtn.addEventListener("click", () => app.actions.newBoard());

  root.append(
    h("div", { class: "rail-search" }, icon("i-search"), search, h("span", { class: "kbd" }, "Ctrl F")),
    list,
    h("div", { class: "rail-foot" }, newBtn)
  );

  let renaming = "";
  let dragBoard = "";

  function item(id, label, iconName, count, { board } = {}) {
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
    // sounds dropped onto a board move into it
    el.addEventListener("dragover", (e) => {
      if (app.drag.sound && id !== "all") {
        e.preventDefault();
        el.classList.add("drop-target");
      } else if (dragBoard && board && dragBoard !== id) {
        e.preventDefault();
        el.classList.add("insert-before");
      }
    });
    el.addEventListener("dragleave", () => el.classList.remove("drop-target", "insert-before"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("drop-target", "insert-before");
      if (app.drag.sound && id !== "all") app.actions.moveToBoard(app.drag.ids(), id);
      else if (dragBoard && board) app.actions.reorderBoard(dragBoard, id);
    });
    if (board) {
      el.draggable = true;
      el.addEventListener("dragstart", (e) => {
        dragBoard = id;
        el.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
      });
      el.addEventListener("dragend", () => {
        dragBoard = "";
        el.classList.remove("dragging");
      });
      el.addEventListener("dblclick", () => startRename(id));
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY, [
          { label: "Rename", run: () => startRename(id) },
          "-",
          { label: "Delete board", danger: true, icon: "i-trash", run: () => app.actions.deleteBoard(id) }
        ]);
      });
    }
    return el;
  }

  function startRename(id) {
    renaming = id;
    render();
  }

  function renameField(board) {
    const input = h("input", { class: "field", value: board.name, "aria-label": "Board name", spellcheck: "false" });
    let done = false;
    const commit = (save) => {
      if (done) return;
      done = true;
      renaming = "";
      const name = input.value.trim();
      if (save && name && name !== board.name) store.update((s) => (s.folders.find((f) => f.id === board.id).name = name), "folders");
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
    return h("div", { class: "rail-item", "aria-current": "true" }, icon("i-board"), input);
  }

  function render() {
    const s = store.state;
    const counts = new Map();
    for (const snd of s.sounds) counts.set(snd.folderId, (counts.get(snd.folderId) || 0) + 1);
    const nodes = [item("all", "All sounds", "i-all", s.sounds.length)];
    if (counts.get("")) nodes.push(item("", "Unsorted", "i-all", counts.get("")));
    if (s.folders.length) nodes.push(h("div", { class: "rail-group" }, "Boards"));
    for (const f of s.folders) {
      nodes.push(renaming === f.id ? renameField(f) : item(f.id, f.name, "i-board", counts.get(f.id) || 0, { board: true }));
    }
    list.replaceChildren(...nodes);
  }

  render();
  return { render, focusSearch: () => { search.focus(); search.select(); }, startRename };
}
