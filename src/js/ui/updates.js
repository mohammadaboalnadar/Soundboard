// Update offers: checks GitHub Releases at startup and every 6 hours, shows a quiet
// card (never a modal, never during play by surprise), installs only on request.
import { h, toast } from "./dom.js";

const EVERY = 6 * 60 * 60 * 1000;

export function createUpdates(app) {
  const { platform, store } = app;
  let card = null;
  let offered = null; // version shown this session
  let snoozed = ""; // "Later" hides this version until the next launch
  let busy = false;
  app.version = "";

  platform.appVersion().then((v) => {
    app.version = v;
    store.emit("settings");
  }).catch(() => {});

  function close() {
    card?.remove();
    card = null;
  }

  function show(info) {
    close();
    offered = info.version;
    const progress = h("span", { class: "upd-progress num", hidden: true });
    const later = h("button", { class: "btn ghost", type: "button" }, "Later");
    const now = h("button", { class: "btn primary", type: "button" }, "Update now");
    later.addEventListener("click", () => {
      snoozed = info.version;
      close();
    });
    now.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      now.disabled = later.disabled = true;
      progress.hidden = false;
      progress.textContent = "Downloading…";
      await store.flush(); // keep every setting through the restart
      try {
        await platform.updateInstall(); // the app restarts into the new version
      } catch (e) {
        busy = false;
        now.disabled = later.disabled = false;
        progress.hidden = true;
        toast(`Update failed: ${e.message || e}. Your current version still works.`, { error: true });
      }
    });
    card = h(
      "aside",
      { class: "upd-card", role: "status", "aria-live": "polite" },
      h("span", { class: "upd-cat num" }, `NEW PRESSING · ${info.current} → ${info.version}`),
      h("h2", {}, `Version ${info.version} is ready`),
      info.notes ? h("p", {}, info.notes.split("\n").slice(0, 4).join(" ")) : null,
      h("div", { class: "upd-actions" }, progress, later, now)
    );
    document.body.append(card);
  }

  platform.onUpdateProgress(({ downloaded, total }) => {
    if (!card) return;
    const el = card.querySelector(".upd-progress");
    el.textContent = total ? `Downloading ${Math.round((downloaded / total) * 100)}%` : `Downloading ${(downloaded / 1048576).toFixed(1)} MB`;
  }).catch(() => {});

  /** manual=true answers even when there is nothing new (Settings button). */
  async function check({ manual = false } = {}) {
    try {
      const info = await platform.updateCheck();
      if (!info) {
        if (manual) toast(`You have the latest version (${app.version}).`);
        return null;
      }
      if (manual || (info.version !== snoozed && info.version !== offered)) show(info);
      return info;
    } catch (e) {
      if (manual) toast(`Couldn’t check for updates: ${e.message || e}`, { error: true });
      return null;
    }
  }

  setTimeout(() => check(), 8000); // after startup settles
  setInterval(() => check(), EVERY);
  return { check };
}
