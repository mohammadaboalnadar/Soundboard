const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const SETTINGS_FILE = "settings.json";
let mainWindow;
let settings = {
  outputDeviceId: "default",
  stopAllKeybind: "",
  localVolume: 1,
  soundboardVolume: 1,
  folders: [],
  sounds: []
};

function getSettingsPath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

function loadSettings() {
  const settingsPath = getSettingsPath();
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        settings = {
          outputDeviceId: parsed.outputDeviceId || "default",
          stopAllKeybind: parsed.stopAllKeybind ? String(parsed.stopAllKeybind) : "",
          localVolume: Number.isFinite(parsed.localVolume) ? parsed.localVolume : 1,
          soundboardVolume: Number.isFinite(parsed.soundboardVolume) ? parsed.soundboardVolume : 1,
          folders: Array.isArray(parsed.folders) ? parsed.folders : [],
          sounds: Array.isArray(parsed.sounds) ? parsed.sounds.map(normalizeSound) : []
        };
      }
    }
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
}

function saveSettings() {
  const settingsPath = getSettingsPath();
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSound(sound) {
  const fadeIn = Number(sound.fadeIn);
  const fadeOut = Number(sound.fadeOut);

  return {
    id: String(sound.id || generateId()),
    filePath: String(sound.filePath || ""),
    displayName: String(sound.displayName || ""),
    start: Number.isFinite(sound.start) ? sound.start : 0,
    end: Number.isFinite(sound.end) ? sound.end : 0,
    volume: Number.isFinite(sound.volume) ? Math.min(Math.max(sound.volume, 0), 1) : 1,
    fadeIn: Number.isFinite(fadeIn) ? Math.max(fadeIn, 0) : 0,
    fadeOut: Number.isFinite(fadeOut) ? Math.max(fadeOut, 0) : 0,
    folderId: String(sound.folderId || ""),
    keybind: sound.keybind ? String(sound.keybind) : ""
  };
}

function normalizeFolder(folder) {
  return {
    id: String(folder.id || generateId()),
    name: String(folder.name || "New Folder"),
    collapsed: Boolean(folder.collapsed)
  };
}

function registerShortcuts() {
  globalShortcut.unregisterAll();

  if (settings.stopAllKeybind) {
    try {
      const stopOk = globalShortcut.register(settings.stopAllKeybind, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("stop-all-sounds");
        }
      });

      if (!stopOk) {
        console.warn(`Failed to register stop-all keybind: ${settings.stopAllKeybind}`);
      }
    } catch (error) {
      console.warn(`Invalid stop-all keybind ignored: ${settings.stopAllKeybind}`, error);
    }
  }

  for (const sound of settings.sounds) {
    if (!sound.keybind) {
      continue;
    }

    try {
      const ok = globalShortcut.register(sound.keybind, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("play-sound-by-id", sound.id);
        }
      });

      if (!ok) {
        console.warn(`Failed to register keybind: ${sound.keybind}`);
      }
    } catch (error) {
      console.warn(`Invalid keybind ignored: ${sound.keybind}`, error);
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  loadSettings();
  createWindow();
  registerShortcuts();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("settings:get", async () => settings);

ipcMain.handle("settings:save", async (_event, nextSettings) => {
  settings = {
    outputDeviceId: nextSettings && typeof nextSettings.outputDeviceId === "string"
      ? nextSettings.outputDeviceId
      : "default",
    stopAllKeybind: nextSettings && nextSettings.stopAllKeybind
      ? String(nextSettings.stopAllKeybind)
      : "",
    localVolume: nextSettings && Number.isFinite(nextSettings.localVolume)
      ? nextSettings.localVolume
      : 1,
    soundboardVolume: nextSettings && Number.isFinite(nextSettings.soundboardVolume)
      ? nextSettings.soundboardVolume
      : 1,
    folders: Array.isArray(nextSettings && nextSettings.folders)
      ? nextSettings.folders.map(normalizeFolder)
      : [],
    sounds: Array.isArray(nextSettings && nextSettings.sounds)
      ? nextSettings.sounds.map(normalizeSound)
      : []
  };

  saveSettings();
  registerShortcuts();
  return settings;
});

ipcMain.handle("dialog:addSounds", async () => {
  const result = await dialog.showOpenDialog({
    title: "Add Sound Files",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Audio", extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (result.canceled) {
    return [];
  }

  return result.filePaths;
});

ipcMain.handle("util:pathToFileUrl", async (_event, filePath) => {
  try {
    return pathToFileURL(filePath).toString();
  } catch {
    return "";
  }
});


