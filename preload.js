const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("soundboardApi", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  addSoundsDialog: () => ipcRenderer.invoke("dialog:addSounds"),
  pathToFileUrl: (filePath) => ipcRenderer.invoke("util:pathToFileUrl", filePath),
  onPlaySoundById: (handler) => {
    const listener = (_event, soundId) => handler(soundId);
    ipcRenderer.on("play-sound-by-id", listener);
    return () => ipcRenderer.removeListener("play-sound-by-id", listener);
  },
  onStopAllSounds: (handler) => {
    const listener = () => handler();
    ipcRenderer.on("stop-all-sounds", listener);
    return () => ipcRenderer.removeListener("stop-all-sounds", listener);
  }
});
