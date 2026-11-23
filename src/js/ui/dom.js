// Tiny DOM helpers: element builder, icons, toasts, context menus, formatting.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const SVG = "http://www.w3.org/2000/svg";
export function icon(name, cls = "i") {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG, "use");
  use.setAttribute("href", `#${name}`);
  svg.append(use);
  return svg;
}

export const led = (color) => `var(--led-${color || "amber"})`;

export function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "--";
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtTime(sec) {
  return Number.isFinite(sec) ? sec.toFixed(2) : "0.00";
}

export function gainToDb(g) {
  return g <= 0.0001 ? -Infinity : 20 * Math.log10(g);
}
export function dbToGain(db) {
  return db <= -60 ? 0 : 10 ** (db / 20);
}
export function fmtDb(g) {
  const db = gainToDb(g);
  if (!Number.isFinite(db)) return "-inf dB";
  const r = Math.round(db * 10) / 10;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(1)} dB`;
}
export function fmtMB(bytes) {
  return `${(bytes / 1048576).toFixed(1)}`;
}

// ---------- toasts ----------

export function toast(message, { action, onAction, error = false, ms = 5000 } = {}) {
  const host = document.getElementById("toasts");
  const close = () => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 180);
  };
  const el = h(
    "div",
    { class: `toast${error ? " err" : ""}`, role: error ? "alert" : "status" },
    h("span", {}, message),
    action ? h("button", { class: "btn ghost", type: "button", onclick: () => { onAction?.(); close(); } }, action) : null
  );
  host.append(el);
  while (host.children.length > 3) host.firstChild.remove();
  setTimeout(close, ms);
  return close;
}

// ---------- context menu ----------

let closeMenu = null;

export function openMenu(x, y, items) {
  closeMenu?.();
  const layer = document.getElementById("menu-layer");
  const menu = h("div", { class: "menu", role: "menu" });
  for (const it of items) {
    if (it === "-") menu.append(h("hr"));
    else if (it.title) menu.append(h("div", { class: "sub-title" }, it.title));
    else
      menu.append(
        h(
          "button",
          {
            type: "button",
            role: "menuitem",
            class: it.danger ? "danger" : "",
            onclick: () => {
              close();
              it.run();
            }
          },
          it.icon ? icon(it.icon) : null,
          it.label,
          it.kbd ? h("span", { class: "kbd" }, it.kbd) : null
        )
      );
  }
  layer.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
  menu.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
  menu.querySelector("button")?.focus();

  const onDown = (e) => {
    if (!menu.contains(e.target)) close();
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const btns = [...menu.querySelectorAll("button")];
      const i = btns.indexOf(document.activeElement);
      btns[(i + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length].focus();
    }
  };
  function close() {
    menu.remove();
    removeEventListener("pointerdown", onDown, true);
    removeEventListener("keydown", onKey, true);
    removeEventListener("blur", close);
    closeMenu = null;
  }
  addEventListener("pointerdown", onDown, true);
  addEventListener("keydown", onKey, true);
  addEventListener("blur", close);
  closeMenu = close;
}

export function setFill(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 1;
  input.style.setProperty("--fill", `${((Number(input.value) - min) / (max - min)) * 100}%`);
}
