const state = {
  outputDeviceId: "default",
  stopAllKeybind: "",
  localVolume: 1,
  soundboardVolume: 1,
  folders: [],
  sounds: [],
  selectedSoundId: "",
  draggingSoundId: "",
  draggingFolderId: "",
  activePlaybacks: [],
  previewAudio: null,
  previewSource: null,
  previewTick: 0,
  audioContext: null,
  analysisContext: null,
  analyser: null,
  animationFrame: 0,
  captureMode: "",
  timelineCursorTime: 0,
  draggingCursor: false,
  resumePreviewAfterDrag: false,
  scrubAudio: null,
  scrubStopTimeout: 0,
  lastScrubAt: 0,
  spectrumLevels: new Float32Array(72)
};

const els = {
  addSoundsBtn: document.getElementById("add-sounds-btn"),
  addFolderBtn: document.getElementById("add-folder-btn"),
  stopAllBtn: document.getElementById("stop-all-btn"),
  outputDeviceSelect: document.getElementById("output-device-select"),
  localVolumeSlider: document.getElementById("local-volume-slider"),
  localVolumeInput: document.getElementById("local-volume-input"),
  soundboardVolumeSlider: document.getElementById("soundboard-volume-slider"),
  soundboardVolumeInput: document.getElementById("soundboard-volume-input"),
  stopAllKeybindLabel: document.getElementById("stopall-keybind-label"),
  setStopAllKeybindBtn: document.getElementById("set-stopall-keybind-btn"),
  clearStopAllKeybindBtn: document.getElementById("clear-stopall-keybind-btn"),
  soundList: document.getElementById("sound-list"),
  previewEmpty: document.getElementById("preview-empty"),
  previewContent: document.getElementById("preview-content"),
  previewTitleInput: document.getElementById("preview-title-input"),
  startSlider: document.getElementById("start-slider"),
  endSlider: document.getElementById("end-slider"),
  fadeInSlider: document.getElementById("fadein-slider"),
  fadeOutSlider: document.getElementById("fadeout-slider"),
  volumeSlider: document.getElementById("volume-slider"),
  startInput: document.getElementById("start-input"),
  endInput: document.getElementById("end-input"),
  fadeInInput: document.getElementById("fadein-input"),
  fadeOutInput: document.getElementById("fadeout-input"),
  volumeInput: document.getElementById("volume-input"),
  playSelectedBtn: document.getElementById("play-selected-btn"),
  stopTopBtn: document.getElementById("stop-top-btn"),
  previewBtn: document.getElementById("preview-btn"),
  stopBottomBtn: document.getElementById("stop-bottom-btn"),
  timeline: document.getElementById("timeline"),
  spectrum: document.getElementById("spectrum"),
  keybindLabel: document.getElementById("keybind-label"),
  setKeybindBtn: document.getElementById("set-keybind-btn"),
  clearKeybindBtn: document.getElementById("clear-keybind-btn"),
  captureHint: document.getElementById("capture-hint"),
  previewFilePath: document.getElementById("preview-file-path")
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getFileName(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || filePath;
}

function displayTitle(sound) {
  return sound.displayName?.trim() || getFileName(sound.filePath);
}

function selectedSound() {
  return state.sounds.find((item) => item.id === state.selectedSoundId) || null;
}

function formatTime(value) {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toFixed(2);
}

function formatPercent(value) {
  const safe = Number.isFinite(value) ? value : 1;
  return String(Math.round(safe * 100));
}

function parseUnitValue(value, fallback = 1) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric, 0, 1) : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateInlineInputWidth(input, minChars = 2, maxChars = 10) {
  if (!input) {
    return;
  }

  const text = (input.value || "").trim();
  const charCount = text.length > 0 ? text.length : 1;
  const widthChars = clamp(charCount, minChars, maxChars);
  input.style.width = `${widthChars}ch`;
}

function syncAllInlineInputWidths() {
  updateInlineInputWidth(els.localVolumeInput, 2, 5);
  updateInlineInputWidth(els.soundboardVolumeInput, 2, 5);
  updateInlineInputWidth(els.startInput, 3, 9);
  updateInlineInputWidth(els.endInput, 3, 9);
  updateInlineInputWidth(els.fadeInInput, 3, 9);
  updateInlineInputWidth(els.fadeOutInput, 3, 9);
  updateInlineInputWidth(els.volumeInput, 2, 5);
}

function clampSound(sound) {
  const duration = Number.isFinite(sound.duration) && sound.duration > 0 ? sound.duration : 1;
  sound.start = Number.isFinite(sound.start) ? clamp(sound.start, 0, duration) : 0;
  sound.end = Number.isFinite(sound.end) ? clamp(sound.end, 0, duration) : duration;
  sound.volume = Number.isFinite(sound.volume) ? clamp(sound.volume, 0, 1) : 1;
  sound.fadeIn = Number.isFinite(sound.fadeIn) ? Math.max(sound.fadeIn, 0) : 0;
  sound.fadeOut = Number.isFinite(sound.fadeOut) ? Math.max(sound.fadeOut, 0) : 0;
  if (sound.end <= sound.start) {
    sound.end = clamp(sound.start + 0.05, 0.05, duration);
    sound.start = clamp(sound.end - 0.05, 0, sound.end - 0.01);
  }

  const segment = Math.max(0, sound.end - sound.start);
  sound.fadeIn = clamp(sound.fadeIn, 0, segment);
  sound.fadeOut = clamp(sound.fadeOut, 0, Math.max(0, segment - sound.fadeIn));
}

function parseNonNegative(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : fallback;
}

function applyFadeConstraints(sound, preferredFade = "fadeIn") {
  const segment = Math.max(0, Number(sound.end) - Number(sound.start));
  let fadeIn = parseNonNegative(sound.fadeIn, 0);
  let fadeOut = parseNonNegative(sound.fadeOut, 0);

  if (preferredFade === "fadeOut") {
    fadeOut = clamp(fadeOut, 0, segment);
    fadeIn = clamp(fadeIn, 0, Math.max(0, segment - fadeOut));
  } else {
    fadeIn = clamp(fadeIn, 0, segment);
    fadeOut = clamp(fadeOut, 0, Math.max(0, segment - fadeIn));
  }

  sound.fadeIn = fadeIn;
  sound.fadeOut = fadeOut;
}

function updateFadeSliderLimits(sound) {
  const segment = Math.max(0, Number(sound.end) - Number(sound.start));
  const maxFadeIn = Math.max(0, segment - parseNonNegative(sound.fadeOut, 0));
  const maxFadeOut = Math.max(0, segment - parseNonNegative(sound.fadeIn, 0));
  const sliderMaxIn = Math.min(5, maxFadeIn);
  const sliderMaxOut = Math.min(5, maxFadeOut);

  els.fadeInSlider.max = String(sliderMaxIn);
  els.fadeOutSlider.max = String(sliderMaxOut);
  els.fadeInSlider.value = String(clamp(parseNonNegative(sound.fadeIn, 0), 0, sliderMaxIn));
  els.fadeOutSlider.value = String(clamp(parseNonNegative(sound.fadeOut, 0), 0, sliderMaxOut));
}

async function persist() {
  const payload = {
    outputDeviceId: state.outputDeviceId,
    stopAllKeybind: state.stopAllKeybind,
    localVolume: parseUnitValue(state.localVolume, 1),
    soundboardVolume: parseUnitValue(state.soundboardVolume, 1),
    folders: state.folders.map((folder) => ({
      id: folder.id,
      name: folder.name || "New Folder",
      collapsed: Boolean(folder.collapsed)
    })),
    sounds: state.sounds.map((sound) => ({
      id: sound.id,
      filePath: sound.filePath,
      displayName: sound.displayName || "",
      start: Number(sound.start) || 0,
      end: Number(sound.end) || 0,
      volume: Number.isFinite(sound.volume) ? clamp(sound.volume, 0, 1) : 1,
      fadeIn: Number.isFinite(sound.fadeIn) ? Math.max(sound.fadeIn, 0) : 0,
      fadeOut: Number.isFinite(sound.fadeOut) ? Math.max(sound.fadeOut, 0) : 0,
      folderId: sound.folderId || "",
      keybind: sound.keybind || ""
    }))
  };

  const saved = await window.soundboardApi.saveSettings(payload);
  state.outputDeviceId = saved.outputDeviceId || "default";
  state.stopAllKeybind = saved.stopAllKeybind ? String(saved.stopAllKeybind) : "";
  state.localVolume = parseUnitValue(saved.localVolume, 1);
  state.soundboardVolume = parseUnitValue(saved.soundboardVolume, 1);
}

async function getDuration(filePath) {
  const url = await window.soundboardApi.pathToFileUrl(filePath);
  if (!url) {
    return 0;
  }

  return new Promise((resolve) => {
    const probe = new Audio();
    probe.preload = "metadata";
    probe.src = url;

    probe.onloadedmetadata = () => {
      resolve(Number.isFinite(probe.duration) ? probe.duration : 0);
      probe.src = "";
    };

    probe.onerror = () => {
      resolve(0);
      probe.src = "";
    };
  });
}

async function ensureEnvelope(sound) {
  if (Array.isArray(sound.envelope) && sound.envelope.length > 0) {
    return;
  }

  const url = await window.soundboardApi.pathToFileUrl(sound.filePath);
  if (!url) {
    sound.envelope = [];
    return;
  }

  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    if (!state.analysisContext) {
      state.analysisContext = new AudioContext();
    }
    const buffer = await state.analysisContext.decodeAudioData(arrayBuffer.slice(0));
    sound.duration = Number.isFinite(buffer.duration) && buffer.duration > 0 ? buffer.duration : sound.duration;
    const channel = buffer.getChannelData(0);
    const points = 220;
    const blockSize = Math.max(1, Math.floor(channel.length / points));
    const envelope = [];
    let maxRms = 0;

    for (let i = 0; i < points; i += 1) {
      const start = i * blockSize;
      const end = Math.min(channel.length, start + blockSize);
      let sum = 0;
      for (let j = start; j < end; j += 1) {
        const s = channel[j] || 0;
        sum += s * s;
      }
      const rms = Math.sqrt(sum / Math.max(1, end - start));
      envelope.push(rms);
      if (rms > maxRms) {
        maxRms = rms;
      }
    }

    sound.envelope = envelope.map((rms) => (maxRms > 0 ? rms / maxRms : 0));
  } catch (error) {
    console.warn("Failed envelope analysis", error);
    sound.envelope = [];
  }
}

function drawTimeline() {
  const sound = selectedSound();
  const canvas = els.timeline;
  const ctx = canvas.getContext("2d");
  if (!sound || !ctx) {
    return;
  }

  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#111b24";
  ctx.fillRect(0, 0, w, h);

  const envelope = Array.isArray(sound.envelope) ? sound.envelope : [];
  if (envelope.length > 0) {
    const barWidth = w / envelope.length;
    for (let i = 0; i < envelope.length; i += 1) {
      const v = envelope[i];
      const barHeight = Math.max(1, v * (h - 18));
      const x = i * barWidth;
      const y = (h - barHeight) / 2;
      ctx.fillStyle = "#3db4ff";
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    }
  }

  const duration = Math.max(0.01, Number(sound.duration) || 1);
  const startX = (clamp(sound.start, 0, duration) / duration) * w;
  const endX = (clamp(sound.end, 0, duration) / duration) * w;
  const cursorX = (clamp(state.timelineCursorTime, 0, duration) / duration) * w;

  ctx.fillStyle = "rgba(255, 80, 80, 0.25)";
  ctx.fillRect(0, 0, startX, h);
  ctx.fillRect(endX, 0, w - endX, h);

  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX, 0);
  ctx.lineTo(startX, h);
  ctx.moveTo(endX, 0);
  ctx.lineTo(endX, h);
  ctx.stroke();

  const fadeInEndX = (clamp(sound.start + sound.fadeIn, sound.start, sound.end) / duration) * w;
  const fadeOutStartX = (clamp(sound.end - sound.fadeOut, sound.start, sound.end) / duration) * w;

  if (fadeInEndX > startX) {
    ctx.fillStyle = "rgba(255, 168, 102, 0.18)";
    ctx.beginPath();
    ctx.moveTo(startX, h - 4);
    ctx.lineTo(fadeInEndX, 4);
    ctx.lineTo(fadeInEndX, h - 4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 168, 102, 0.98)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(startX, h - 4);
    ctx.lineTo(fadeInEndX, 4);
    ctx.stroke();
  }

  if (endX > fadeOutStartX) {
    ctx.fillStyle = "rgba(255, 168, 102, 0.18)";
    ctx.beginPath();
    ctx.moveTo(fadeOutStartX, 4);
    ctx.lineTo(endX, h - 4);
    ctx.lineTo(fadeOutStartX, h - 4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 168, 102, 0.98)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(fadeOutStartX, 4);
    ctx.lineTo(endX, h - 4);
    ctx.stroke();
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cursorX, 0);
  ctx.lineTo(cursorX, h);
  ctx.stroke();
}

function cursorTimeFromPointerEvent(event) {
  const sound = selectedSound();
  if (!sound) {
    return 0;
  }

  const rect = els.timeline.getBoundingClientRect();
  const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  return ratio * Math.max(0.01, Number(sound.duration) || 1);
}

function setTimelineCursorTime(time) {
  const sound = selectedSound();
  if (!sound) {
    return;
  }

  const duration = Math.max(0.01, Number(sound.duration) || 1);
  state.timelineCursorTime = clamp(time, 0, duration);
  drawTimeline();
}

function updatePreviewControls() {
  const isPlaying = Boolean(state.previewAudio && !state.previewAudio.paused);
  els.previewBtn.innerHTML = isPlaying ? "&#10074;&#10074;" : "&#9654;";
  els.previewBtn.title = isPlaying ? "Pause preview" : "Play preview";
  els.previewBtn.setAttribute("aria-label", isPlaying ? "Pause preview" : "Play preview");
  els.stopBottomBtn.innerHTML = "&#9632;";
  els.stopBottomBtn.title = "Reset preview cursor";
  els.stopBottomBtn.setAttribute("aria-label", "Reset preview cursor");
}

async function playScrubSnippetAt(time) {
  const sound = selectedSound();
  if (!sound) {
    return;
  }

  const now = performance.now();
  if ((now - state.lastScrubAt) < 45) {
    return;
  }
  state.lastScrubAt = now;

  if (state.scrubAudio) {
    state.scrubAudio.pause();
    state.scrubAudio.src = "";
    state.scrubAudio = null;
  }
  if (state.scrubStopTimeout) {
    clearTimeout(state.scrubStopTimeout);
    state.scrubStopTimeout = 0;
  }

  const fileUrl = await window.soundboardApi.pathToFileUrl(sound.filePath);
  if (!fileUrl) {
    return;
  }

  const audio = new Audio(fileUrl);
  state.scrubAudio = audio;
  const scrubVolume = clamp(parseUnitValue(sound.volume, 1) * 0.85, 0, 1);
  audio.volume = scrubVolume;

  if (state.outputDeviceId && state.outputDeviceId !== "default" && typeof audio.setSinkId === "function") {
    try {
      await audio.setSinkId(state.outputDeviceId);
    } catch (_error) {
      // If sink binding fails, fallback to default output.
    }
  }

  audio.currentTime = clamp(time, 0, Math.max(0.01, Number(sound.duration) || 1));

  try {
    await audio.play();
    state.scrubStopTimeout = setTimeout(() => {
      if (state.scrubAudio === audio) {
        audio.pause();
        audio.src = "";
        state.scrubAudio = null;
      }
      state.scrubStopTimeout = 0;
    }, 90);
  } catch (_error) {
    audio.src = "";
    if (state.scrubAudio === audio) {
      state.scrubAudio = null;
    }
  }
}

async function loadOutputDevices() {
  els.outputDeviceSelect.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "default";
  defaultOption.textContent = "System Default";
  els.outputDeviceSelect.appendChild(defaultOption);

  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    }
  } catch (_error) {
    // Device labels may remain generic if permission is denied.
  }

  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((device) => device.kind === "audiooutput");
      for (const output of outputs) {
        const opt = document.createElement("option");
        opt.value = output.deviceId;
        opt.textContent = output.label || `Audio Output ${output.deviceId.slice(0, 6)}`;
        els.outputDeviceSelect.appendChild(opt);
      }
    } catch (error) {
      console.warn("Unable to enumerate audio outputs", error);
    }
  }

  const exists = Array.from(els.outputDeviceSelect.options).some((opt) => opt.value === state.outputDeviceId);
  els.outputDeviceSelect.value = exists ? state.outputDeviceId : "default";
  state.outputDeviceId = els.outputDeviceSelect.value;
}

function stopPreview() {
  if (state.previewTick) {
    clearInterval(state.previewTick);
    state.previewTick = 0;
  }

  if (state.previewAudio) {
    state.previewAudio.pause();
    state.previewAudio.src = "";
    state.previewAudio = null;
  }
  if (state.previewSource) {
    try {
      state.previewSource.disconnect();
    } catch (_error) {
      // ignore
    }
    state.previewSource = null;
  }

  state.analyser = null;
  
  // Reset preview cursor to the sound's start time
  const sound = selectedSound();
  if (sound) {
    state.timelineCursorTime = Number(sound.start) || 0;
    drawTimeline();
  }
  
  updatePreviewControls();
}

function removePlayback(playback) {
  clearInterval(playback.tick);
  playback.audioOutputs.forEach((output) => {
    output.audio.pause();
    output.audio.src = "";
  });
  state.activePlaybacks = state.activePlaybacks.filter((p) => p !== playback);
}

function stopPlayback(playback, useFade = true) {
  if (playback.stopping) {
    return;
  }
  playback.stopping = true;
  playback.stopStartedAt = performance.now();
  playback.stopFadeSeconds = useFade ? Math.max(0.05, playback.fadeOut) : 0;
  if (!useFade || playback.stopFadeSeconds <= 0.001) {
    removePlayback(playback);
  }
}

function stopAllPlayback(useFade = true) {
  const playbacks = [...state.activePlaybacks];
  playbacks.forEach((playback) => stopPlayback(playback, useFade));
  stopPreview();

  if (state.scrubAudio) {
    state.scrubAudio.pause();
    state.scrubAudio.src = "";
    state.scrubAudio = null;
  }
  if (state.scrubStopTimeout) {
    clearTimeout(state.scrubStopTimeout);
    state.scrubStopTimeout = 0;
  }

  if (state.animationFrame) {
    // keep the draw loop alive so spectrum levels can visually decay.
  }
}

function stopPlaybacksForSound(soundId, useFade = false) {
  const matches = state.activePlaybacks.filter((playback) => playback.soundId === soundId);
  matches.forEach((playback) => stopPlayback(playback, useFade));
}

async function playSound(sound) {
  if (!sound) {
    return;
  }

  const fileUrl = await window.soundboardApi.pathToFileUrl(sound.filePath);
  if (!fileUrl) {
    return;
  }

  const start = Math.max(0, Number(sound.start) || 0);
  const end = Number(sound.end) || Number(sound.duration) || 0;
  const targetVolume = parseUnitValue(sound.volume, 1);
  const fadeIn = clamp(Number(sound.fadeIn) || 0, 0, 5);
  const fadeOut = clamp(Number(sound.fadeOut) || 0, 0, 5);

  const audioOutputs = [];
  const defaultAudio = new Audio(fileUrl);
  audioOutputs.push({ audio: defaultAudio, isSelectedDevice: false });

  if (state.outputDeviceId && state.outputDeviceId !== "default") {
    const selectedAudio = new Audio(fileUrl);
    if (typeof selectedAudio.setSinkId === "function") {
      try {
        await selectedAudio.setSinkId(state.outputDeviceId);
        audioOutputs.push({ audio: selectedAudio, isSelectedDevice: true });
      } catch (error) {
        console.warn("Failed to set selected output sink", error);
      }
    }
  }

  const playback = {
    soundId: sound.id,
    audioOutputs,
    start,
    end,
    targetVolume,
    fadeIn,
    fadeOut,
    startedAt: performance.now(),
    stopping: false,
    stopStartedAt: 0,
    stopFadeSeconds: 0,
    tick: 0
  };

  const applyVolume = (volume) => {
    const v = clamp(volume, 0, 1);
    playback.audioOutputs.forEach((output) => {
      const globalVolume = output.isSelectedDevice ? state.soundboardVolume : state.localVolume;
      output.audio.volume = clamp(v * globalVolume, 0, 1);
    });
  };

  playback.audioOutputs.forEach((output) => {
    output.audio.preload = "auto";
    output.audio.currentTime = start;
    output.audio.addEventListener("loadedmetadata", () => {
      output.audio.currentTime = Math.min(start, Math.max(0, end - 0.01));
    });
  });

  applyVolume(fadeIn > 0 ? 0 : targetVolume);
  state.activePlaybacks.push(playback);

  playback.tick = setInterval(() => {
    const lead = playback.audioOutputs[0].audio;
    if (!lead || Number.isNaN(lead.currentTime)) {
      return;
    }

    const liveSound = state.sounds.find((item) => item.id === playback.soundId);
    const liveTargetVolume = liveSound ? parseUnitValue(liveSound.volume, playback.targetVolume) : playback.targetVolume;
    const liveFadeIn = liveSound ? clamp(Number(liveSound.fadeIn) || 0, 0, 5) : playback.fadeIn;
    const liveFadeOut = liveSound ? clamp(Number(liveSound.fadeOut) || 0, 0, 5) : playback.fadeOut;

    const now = performance.now();
    const elapsed = Math.max(0, lead.currentTime - playback.start);
    const remaining = Math.max(0, playback.end - lead.currentTime);
    let gain = liveTargetVolume;

    if (liveFadeIn > 0 && !playback.stopping) {
      gain *= clamp(elapsed / liveFadeIn, 0, 1);
    }

    if (!playback.stopping && liveFadeOut > 0 && remaining <= liveFadeOut) {
      gain *= clamp(remaining / liveFadeOut, 0, 1);
    }

    if (playback.stopping) {
      const fadeSeconds = playback.stopFadeSeconds;
      if (fadeSeconds <= 0.001) {
        removePlayback(playback);
        return;
      }

      const stopElapsed = (now - playback.stopStartedAt) / 1000;
      const factor = clamp(1 - stopElapsed / fadeSeconds, 0, 1);
      gain *= factor;
      if (factor <= 0.001) {
        removePlayback(playback);
        return;
      }
    }

    applyVolume(gain);

    if (playback.end > 0 && lead.currentTime >= playback.end) {
      removePlayback(playback);
    }
  }, 30);

  try {
    await Promise.all(playback.audioOutputs.map((output) => output.audio.play()));
  } catch (error) {
    console.warn("Playback failed", error);
    removePlayback(playback);
  }
}

async function selectSoundById(soundId) {
  const sound = state.sounds.find((item) => item.id === soundId);
  if (!sound) {
    return;
  }
  if (state.selectedSoundId && state.selectedSoundId !== sound.id) {
    stopPreview();
  }
  state.selectedSoundId = sound.id;
  state.timelineCursorTime = Number(sound.start) || 0;
  await ensureEnvelope(sound);
  renderAll();
}

function soundsInFolder(folderId) {
  return state.sounds.filter((sound) => (sound.folderId || "") === folderId);
}

function createDropZone(folderId, index) {
  const zone = document.createElement("div");
  zone.className = "sound-drop-zone";
  zone.addEventListener("dragover", (event) => {
    if (!state.draggingSoundId) {
      return;
    }
    event.preventDefault();
    zone.classList.add("active");
  });
  zone.addEventListener("dragleave", () => {
    zone.classList.remove("active");
  });
  zone.addEventListener("drop", async (event) => {
    event.preventDefault();
    zone.classList.remove("active");
    await moveDraggedSound(folderId, index);
  });
  return zone;
}

function createFolderDropZone(index) {
  const zone = document.createElement("div");
  zone.className = "folder-drop-zone";
  zone.addEventListener("dragover", (event) => {
    if (state.draggingSoundId) {
      return;
    }
    if (!state.draggingFolderId) {
      return;
    }
    event.preventDefault();
    zone.classList.add("active");
  });
  zone.addEventListener("dragleave", () => {
    zone.classList.remove("active");
  });
  zone.addEventListener("drop", async (event) => {
    event.preventDefault();
    zone.classList.remove("active");
    if (state.draggingSoundId) {
      return;
    }
    await moveDraggedFolder(index);
  });
  return zone;
}

async function conditionallyPersistAndRender(shouldPersist) {
  if (shouldPersist) {
    await persist();
  }
  renderAll();
}

async function moveDraggedSound(targetFolderId, targetIndex) {
  const draggingSoundId = state.draggingSoundId;
  state.draggingSoundId = "";
  if (!draggingSoundId) {
    return;
  }
  const sourceIndex = state.sounds.findIndex((item) => item.id === draggingSoundId);
  if (sourceIndex < 0) {
    return;
  }

  const normalizedTargetFolderId = targetFolderId || "";
  const draggingSound = state.sounds[sourceIndex];
  const fromFolderId = draggingSound.folderId || "";
  const original = state.sounds.slice();
  const moving = original.splice(sourceIndex, 1)[0];
  moving.folderId = normalizedTargetFolderId;

  const beforeTarget = original.filter((sound) => (sound.folderId || "") === normalizedTargetFolderId);
  const boundedIndex = clamp(Number(targetIndex) || 0, 0, beforeTarget.length);
  let insertAt = original.length;
  if (boundedIndex < beforeTarget.length) {
    insertAt = original.findIndex((sound) => sound.id === beforeTarget[boundedIndex].id);
  }

  original.splice(insertAt, 0, moving);
  state.sounds = original;
  await conditionallyPersistAndRender(fromFolderId !== moving.folderId || sourceIndex !== insertAt);
}

async function moveDraggedFolder(targetIndex) {
  const draggingFolderId = state.draggingFolderId;
  state.draggingFolderId = "";
  if (!draggingFolderId) {
    return;
  }
  const sourceIndex = state.folders.findIndex((folder) => folder.id === draggingFolderId);
  if (sourceIndex < 0) {
    return;
  }
  const targetIndexValue = Number(targetIndex) || 0;
  const updated = state.folders.slice();
  const moving = updated.splice(sourceIndex, 1)[0];
  const maxInsertIndex = updated.length;
  let insertIndex = targetIndexValue;
  if (insertIndex > sourceIndex) {
    insertIndex -= 1;
  }
  insertIndex = clamp(insertIndex, 0, maxInsertIndex);
  if (insertIndex === sourceIndex) {
    await conditionallyPersistAndRender(false);
    return;
  }
  updated.splice(insertIndex, 0, moving);
  state.folders = updated;
  await conditionallyPersistAndRender(true);
}

function createSoundItem(sound) {
  const item = document.createElement("div");
  item.className = `sound-item${sound.id === state.selectedSoundId ? " active" : ""}`;
  item.draggable = true;

  item.addEventListener("dragstart", (event) => {
    state.draggingSoundId = sound.id;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", sound.id);
    }
  });
  item.addEventListener("dragend", () => {
    state.draggingSoundId = "";
  });
  item.addEventListener("click", async (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("button")) {
      return;
    }
    await selectSoundById(sound.id);
  });

  const head = document.createElement("div");
  head.className = "sound-item-head";

  const title = document.createElement("div");
  title.className = "sound-item-title";
  title.textContent = displayTitle(sound);

  head.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "sound-item-meta";
  const keyText = sound.keybind ? `Key: ${sound.keybind}` : "Key: None";
  const volText = `Vol: ${formatPercent(sound.volume)}%`;
  const fadeText = `Fades: ${formatTime(sound.fadeIn)}s/${formatTime(sound.fadeOut)}s`;
  meta.textContent = `${formatTime(sound.start)}s - ${formatTime(sound.end)}s | ${volText} | ${fadeText} | ${keyText}`;

  const buttons = document.createElement("div");
  buttons.className = "sound-item-buttons";

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.textContent = "Play";
  playBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    playSound(sound);
  });

  const stopBtn = document.createElement("button");
  stopBtn.type = "button";
  stopBtn.className = "stop-sound-btn";
  stopBtn.textContent = "Stop";
  stopBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    stopPlaybacksForSound(sound.id, true);
    if (state.selectedSoundId === sound.id) {
      stopPreview();
    }
  });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove-btn";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", async (event) => {
    event.stopPropagation();
    stopPlaybacksForSound(sound.id, false);
    if (state.selectedSoundId === sound.id) {
      stopPreview();
      if (state.animationFrame) {
        cancelAnimationFrame(state.animationFrame);
        state.animationFrame = 0;
      }
    }

    state.sounds = state.sounds.filter((item) => item.id !== sound.id);
    if (state.selectedSoundId === sound.id) {
      state.selectedSoundId = state.sounds[0]?.id || "";
    }
    await persist();
    renderAll();
  });

  buttons.appendChild(playBtn);
  buttons.appendChild(stopBtn);
  buttons.appendChild(removeBtn);

  item.appendChild(head);
  item.appendChild(meta);
  item.appendChild(buttons);
  return item;
}

function renderSoundGroup(container, folderId) {
  const sounds = soundsInFolder(folderId);
  container.appendChild(createDropZone(folderId, 0));
  sounds.forEach((sound, index) => {
    container.appendChild(createSoundItem(sound));
    container.appendChild(createDropZone(folderId, index + 1));
  });
}

function renderSoundList() {
  els.soundList.innerHTML = "";

  if (state.sounds.length === 0 && state.folders.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No sounds added yet.";
    els.soundList.appendChild(empty);
    return;
  }

  const rootGroup = document.createElement("div");
  renderSoundGroup(rootGroup, "");
  els.soundList.appendChild(rootGroup);

  if (state.folders.length > 0) {
    els.soundList.appendChild(createFolderDropZone(0));
  }

  state.folders.forEach((folder, folderIndex) => {
    const details = document.createElement("details");
    details.className = "sound-folder";
    details.open = !folder.collapsed;
    details.addEventListener("toggle", async () => {
      folder.collapsed = !details.open;
      await persist();
    });

    const summary = document.createElement("summary");
    summary.draggable = true;
    summary.addEventListener("dragstart", (event) => {
      if (state.draggingSoundId) {
        event.preventDefault();
        return;
      }
      state.draggingFolderId = folder.id;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", folder.id);
      }
    });
    summary.addEventListener("dragend", () => {
      state.draggingFolderId = "";
    });
    summary.addEventListener("dragover", (event) => {
      if (!state.draggingSoundId) {
        return;
      }
      event.preventDefault();
    });
    summary.addEventListener("drop", async (event) => {
      event.preventDefault();
      await moveDraggedSound(folder.id, soundsInFolder(folder.id).length);
    });

    const defaultFolderName = "New Folder";
    const renameFolderInput = document.createElement("input");
    renameFolderInput.type = "text";
    renameFolderInput.className = "folder-summary-name-input";
    renameFolderInput.value = folder.name || defaultFolderName;
    renameFolderInput.placeholder = "Folder name";
    renameFolderInput.setAttribute("aria-label", "Folder name");
    let skipNextBlurSave = false;
    const saveFolderName = async () => {
      const trimmedName = renameFolderInput.value.trim();
      const nextName = trimmedName || defaultFolderName;
      if (nextName === (folder.name || defaultFolderName)) {
        return;
      }
      folder.name = nextName;
      await persist();
      renderAll();
    };
    const onRenameBlur = async () => {
      if (skipNextBlurSave) {
        skipNextBlurSave = false;
        return;
      }
      await saveFolderName();
    };
    renameFolderInput.addEventListener("blur", onRenameBlur);
    renameFolderInput.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await saveFolderName();
      } else if (event.key === "Escape") {
        event.preventDefault();
        renameFolderInput.value = folder.name || defaultFolderName;
        skipNextBlurSave = true;
        renameFolderInput.blur();
      }
    });
    const preventSummaryToggle = (event) => {
      event.stopPropagation();
    };
    renameFolderInput.addEventListener("click", preventSummaryToggle);
    renameFolderInput.addEventListener("mousedown", preventSummaryToggle);
    renameFolderInput.addEventListener("dragstart", (event) => {
      event.preventDefault();
    });
    summary.appendChild(renameFolderInput);

    const body = document.createElement("div");
    body.className = "sound-folder-body";

    const actions = document.createElement("div");
    actions.className = "folder-actions";
    const removeFolderBtn = document.createElement("button");
    removeFolderBtn.type = "button";
    removeFolderBtn.className = "folder-remove-btn";
    removeFolderBtn.textContent = "Remove Folder";
    removeFolderBtn.addEventListener("click", async () => {
      state.folders = state.folders.filter((item) => item.id !== folder.id);
      state.sounds.forEach((sound) => {
        if ((sound.folderId || "") === folder.id) {
          sound.folderId = "";
        }
      });
      await persist();
      renderAll();
    });
    actions.appendChild(removeFolderBtn);
    body.appendChild(actions);
    renderSoundGroup(body, folder.id);

    details.appendChild(summary);
    details.appendChild(body);
    els.soundList.appendChild(details);
    els.soundList.appendChild(createFolderDropZone(folderIndex + 1));
  });
}

function updatePreviewPane() {
  const sound = selectedSound();
  const hasSelection = Boolean(sound);

  els.previewEmpty.classList.toggle("hidden", hasSelection);
  els.previewContent.classList.toggle("hidden", !hasSelection);
  els.stopAllKeybindLabel.textContent = state.stopAllKeybind || "None";

  if (!sound) {
    els.previewTitleInput.value = "Preview";
    els.previewTitleInput.disabled = true;
    els.previewFilePath.textContent = "";
    updatePreviewControls();
    return;
  }

  els.previewTitleInput.disabled = false;
  els.previewTitleInput.value = displayTitle(sound);
  els.previewFilePath.textContent = sound.filePath || "";

  const duration = Math.max(0.05, Number(sound.duration) || 1);
  state.timelineCursorTime = clamp(state.timelineCursorTime, 0, duration);
  els.startSlider.max = String(duration);
  els.endSlider.max = String(duration);
  els.startSlider.value = String(sound.start);
  els.endSlider.value = String(sound.end);
  els.volumeSlider.value = String(sound.volume);
  els.startInput.value = formatTime(sound.start);
  els.endInput.value = formatTime(sound.end);
  updateFadeSliderLimits(sound);
  els.fadeInInput.value = formatTime(sound.fadeIn);
  els.fadeOutInput.value = formatTime(sound.fadeOut);
  els.volumeInput.value = formatPercent(parseUnitValue(sound.volume, 1));
  syncAllInlineInputWidths();
  els.keybindLabel.textContent = sound.keybind || "None";
  drawTimeline();
  updatePreviewControls();
}

function renderAll() {
  els.localVolumeSlider.value = String(state.localVolume);
  els.localVolumeInput.value = formatPercent(state.localVolume);
  els.soundboardVolumeSlider.value = String(state.soundboardVolume);
  els.soundboardVolumeInput.value = formatPercent(state.soundboardVolume);
  syncAllInlineInputWidths();
  renderSoundList();
  updatePreviewPane();
}

function buildAccelerator(event) {
  const parts = [];
  if (event.ctrlKey) {
    parts.push("Control");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  if (event.metaKey) {
    parts.push("Super");
  }

  const key = normalizeKey(event);
  if (!key) {
    return "";
  }

  if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) {
    return "";
  }

  parts.push(key);
  return parts.join("+");
}

function normalizeKey(event) {
  const raw = event && event.key ? event.key : "";
  const code = event && event.code ? event.code : "";

  if (code.startsWith("Numpad")) {
    const numpadMap = {
      Numpad0: "num0",
      Numpad1: "num1",
      Numpad2: "num2",
      Numpad3: "num3",
      Numpad4: "num4",
      Numpad5: "num5",
      Numpad6: "num6",
      Numpad7: "num7",
      Numpad8: "num8",
      Numpad9: "num9",
      NumpadAdd: "numadd",
      NumpadSubtract: "numsub",
      NumpadMultiply: "nummult",
      NumpadDivide: "numdiv",
      NumpadDecimal: "numdec",
      NumpadEnter: "Enter"
    };

    if (numpadMap[code]) {
      return numpadMap[code];
    }
  }

  if (!raw) {
    return "";
  }

  const key = raw.length === 1 ? raw.toUpperCase() : raw;
  const map = {
    " ": "Space",
    Escape: "Esc",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Enter: "Enter",
    Backspace: "Backspace",
    Tab: "Tab",
    Delete: "Delete",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Insert: "Insert"
  };

  if (map[key]) {
    return map[key];
  }
  if (/^F\d{1,2}$/.test(key)) {
    return key;
  }
  if (/^[A-Z0-9]$/.test(key)) {
    return key;
  }
  return "";
}

async function onAddSounds() {
  const paths = await window.soundboardApi.addSoundsDialog();
  if (!paths || paths.length === 0) {
    return;
  }

  for (const filePath of paths) {
    const duration = await getDuration(filePath);
    const sound = {
      id: uid(),
      filePath,
      displayName: "",
      start: 0,
      end: duration || 1,
      duration: duration || 1,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      folderId: "",
      keybind: "",
      envelope: []
    };
    clampSound(sound);
    state.sounds.push(sound);
  }

  if (!state.selectedSoundId && state.sounds.length > 0) {
    state.selectedSoundId = state.sounds[0].id;
    state.timelineCursorTime = Number(state.sounds[0].start) || 0;
    await ensureEnvelope(state.sounds[0]);
  }

  await persist();
  renderAll();
}

async function onAddFolder() {
  const existingNames = new Set(state.folders.map((folder) => folder.name));
  let nextName = "New Folder";
  let suffix = 2;
  while (existingNames.has(nextName)) {
    nextName = `New Folder ${suffix}`;
    suffix += 1;
  }
  state.folders.push({
    id: uid(),
    name: nextName,
    collapsed: false
  });
  await persist();
  renderAll();
}

async function applySelectedSettings(source = "all") {
  const sound = selectedSound();
  if (!sound) {
    return;
  }

  if (source === "displayName") {
    sound.displayName = String(els.previewTitleInput.value || "").trim();
  }

  const duration = Math.max(0.05, Number(sound.duration) || 1);
  let nextStart = Number(els.startSlider.value);
  let nextEnd = Number(els.endSlider.value);

  if (source === "startInput") {
    nextStart = parseNonNegative(els.startInput.value, sound.start);
  } else if (source === "endInput") {
    nextEnd = parseNonNegative(els.endInput.value, sound.end);
  } else if (source === "startSlider") {
    nextStart = Number(els.startSlider.value);
  } else if (source === "endSlider") {
    nextEnd = Number(els.endSlider.value);
  }

  nextStart = clamp(nextStart, 0, duration);
  nextEnd = clamp(nextEnd, 0, duration);
  if (nextEnd <= nextStart) {
    if (source === "startInput" || source === "startSlider") {
      nextStart = clamp(nextEnd - 0.05, 0, duration - 0.05);
    } else {
      nextEnd = clamp(nextStart + 0.05, 0.05, duration);
    }
  }

  sound.start = nextStart;
  sound.end = nextEnd;

  clampSound(sound);

  if (source === "fadeInInput") {
    sound.fadeIn = parseNonNegative(els.fadeInInput.value, sound.fadeIn);
    applyFadeConstraints(sound, "fadeIn");
  } else if (source === "fadeOutInput") {
    sound.fadeOut = parseNonNegative(els.fadeOutInput.value, sound.fadeOut);
    applyFadeConstraints(sound, "fadeOut");
  } else if (source === "fadeInSlider") {
    const sliderValue = clamp(Number(els.fadeInSlider.value), 0, Number(els.fadeInSlider.max) || 5);
    sound.fadeIn = sliderValue;
    applyFadeConstraints(sound, "fadeIn");
  } else if (source === "fadeOutSlider") {
    const sliderValue = clamp(Number(els.fadeOutSlider.value), 0, Number(els.fadeOutSlider.max) || 5);
    sound.fadeOut = sliderValue;
    applyFadeConstraints(sound, "fadeOut");
  } else {
    sound.fadeIn = parseNonNegative(els.fadeInSlider.value, sound.fadeIn);
    sound.fadeOut = parseNonNegative(els.fadeOutSlider.value, sound.fadeOut);
    applyFadeConstraints(sound, "fadeIn");
  }

  if (source === "volumeInput") {
    const requestedPercent = Number(els.volumeInput.value);
    const safePercent = Number.isFinite(requestedPercent)
      ? clamp(requestedPercent, 0, 100)
      : Math.round(sound.volume * 100);
    sound.volume = clamp(safePercent / 100, 0, 1);
  } else {
    sound.volume = parseUnitValue(els.volumeSlider.value, sound.volume);
  }

  clampSound(sound);
  updateFadeSliderLimits(sound);
  await persist();
  updatePreviewPane();
  renderSoundList();
}

function setupSpectrum() {
  const canvas = els.spectrum;
  const ctx = canvas.getContext("2d");

  if (state.animationFrame) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = 0;
  }

  const draw = () => {
    if (!ctx) {
      return;
    }

    const levels = state.spectrumLevels;
    if (state.analyser) {
      const bins = state.analyser.frequencyBinCount;
      const data = new Uint8Array(bins);
      state.analyser.getByteFrequencyData(data);

      const barCount = levels.length;
      const step = Math.max(1, Math.floor(bins / barCount));
      for (let i = 0; i < barCount; i += 1) {
        const raw = data[Math.min(data.length - 1, i * step)] / 255;
        levels[i] = Math.max(raw, levels[i] * 0.92);
      }
    } else {
      for (let i = 0; i < levels.length; i += 1) {
        levels[i] *= 0.9;
      }
    }

    ctx.fillStyle = "#0f1720";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const barCount = levels.length;
    const barWidth = canvas.width / barCount;

    for (let i = 0; i < barCount; i += 1) {
      const v = levels[i];
      const h = Math.max(2, v * canvas.height);
      const x = i * barWidth;
      const y = canvas.height - h;
      const color = Math.round(180 + v * 75);
      ctx.fillStyle = `rgb(${color}, ${220 - Math.round(v * 80)}, 90)`;
      ctx.fillRect(x, y, barWidth - 1, h);
    }

    const stillActive = state.analyser || levels.some((value) => value > 0.01);
    if (stillActive) {
      state.animationFrame = requestAnimationFrame(draw);
    } else {
      state.animationFrame = 0;
    }
  };

  draw();
}

async function startPreviewWithSpectrum(startAtTime = null) {
  const sound = selectedSound();
  if (!sound) {
    return;
  }

  stopPreview();
  const fileUrl = await window.soundboardApi.pathToFileUrl(sound.filePath);
  if (!fileUrl) {
    return;
  }

  if (!state.audioContext) {
    state.audioContext = new AudioContext();
  }
  if (state.audioContext.state === "suspended") {
    await state.audioContext.resume();
  }

  const audio = new Audio(fileUrl);
  state.previewAudio = audio;

  const source = state.audioContext.createMediaElementSource(audio);
  state.previewSource = source;
  const analyser = state.audioContext.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  analyser.connect(state.audioContext.destination);
  state.analyser = analyser;

  const start = Number(sound.start) || 0;
  const end = Number(sound.end) || Number(sound.duration) || 0;
  const initialTime = clamp(startAtTime == null ? start : Number(startAtTime), start, Math.max(start, end - 0.01));
  const targetVolume = parseUnitValue(sound.volume, 1);
  const localVolume = parseUnitValue(state.localVolume, 1);
  audio.volume = sound.fadeIn > 0 ? 0 : clamp(targetVolume * localVolume, 0, 1);

  audio.addEventListener("loadedmetadata", () => {
    audio.currentTime = initialTime;
  });

  if (state.previewTick) {
    clearInterval(state.previewTick);
    state.previewTick = 0;
  }

  state.previewTick = setInterval(() => {
    const liveEnd = Number(sound.end) || Number(sound.duration) || 0;
    const elapsed = Math.max(0, audio.currentTime - initialTime);
    const remaining = Math.max(0, liveEnd - audio.currentTime);
    const liveSoundVolume = parseUnitValue(sound.volume, targetVolume);
    const liveLocalVolume = parseUnitValue(state.localVolume, localVolume);
    let gain = liveSoundVolume * liveLocalVolume;
    if (sound.fadeIn > 0) {
      gain *= clamp(elapsed / sound.fadeIn, 0, 1);
    }
    if (sound.fadeOut > 0 && remaining <= sound.fadeOut) {
      gain *= clamp(remaining / sound.fadeOut, 0, 1);
    }

    setTimelineCursorTime(audio.currentTime);

    if (liveEnd > 0 && audio.currentTime >= liveEnd) {
      stopPreview();
    } else {
      audio.volume = clamp(gain, 0, 1);
    }
  }, 30);

  setupSpectrum();

  try {
    audio.currentTime = initialTime;
    setTimelineCursorTime(initialTime);
    await audio.play();
    updatePreviewControls();
  } catch (error) {
    console.warn("Preview playback failed", error);
    stopPreview();
  }
}

async function onTogglePreview() {
  const sound = selectedSound();
  if (!sound) {
    return;
  }

  if (!state.previewAudio) {
    await startPreviewWithSpectrum(state.timelineCursorTime);
    return;
  }

  if (!state.previewAudio.paused) {
    state.previewAudio.pause();
    updatePreviewControls();
    return;
  }

  try {
    await state.previewAudio.play();
    updatePreviewControls();
  } catch (_error) {
    // Ignore resume failure.
  }
}

function onResetPreviewCursor() {
  const sound = selectedSound();
  if (!sound) {
    return;
  }

  const resetTime = clamp(Number(sound.start) || 0, 0, Math.max(0.01, Number(sound.duration) || 1));
  setTimelineCursorTime(resetTime);

  if (state.previewAudio) {
    state.previewAudio.pause();
    state.previewAudio.currentTime = resetTime;
  }

  stopPreview();
}

async function installEvents() {
  els.addSoundsBtn.addEventListener("click", onAddSounds);
  els.addFolderBtn.addEventListener("click", onAddFolder);
  els.stopAllBtn.addEventListener("click", () => stopAllPlayback(true));

  els.outputDeviceSelect.addEventListener("change", async () => {
    state.outputDeviceId = els.outputDeviceSelect.value || "default";
    await persist();
  });

  els.localVolumeSlider.addEventListener("input", async () => {
    state.localVolume = clamp(Number(els.localVolumeSlider.value), 0, 1);
    els.localVolumeInput.value = formatPercent(state.localVolume);
    updateInlineInputWidth(els.localVolumeInput, 2, 5);
    await persist();
  });

  els.soundboardVolumeSlider.addEventListener("input", async () => {
    state.soundboardVolume = clamp(Number(els.soundboardVolumeSlider.value), 0, 1);
    els.soundboardVolumeInput.value = formatPercent(state.soundboardVolume);
    updateInlineInputWidth(els.soundboardVolumeInput, 2, 5);
    await persist();
  });

  const commitGlobalVolumeInput = (input, slider, assign) => {
    input.addEventListener("input", () => {
      updateInlineInputWidth(input, 2, 5);
    });

    const commit = async () => {
      const requested = Number(input.value);
      const safePercent = Number.isFinite(requested) ? clamp(requested, 0, 100) : Math.round(assign() * 100);
      const unitValue = safePercent / 100;
      slider.value = String(unitValue);
      input.value = String(Math.round(safePercent));
      updateInlineInputWidth(input, 2, 5);
      assign(unitValue);
      await persist();
    };

    input.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await commit();
        input.blur();
      }
    });

    input.addEventListener("blur", async () => {
      await commit();
    });
  };

  commitGlobalVolumeInput(els.localVolumeInput, els.localVolumeSlider, (value) => {
    if (typeof value === "number") {
      state.localVolume = clamp(value, 0, 1);
    }
    return state.localVolume;
  });

  commitGlobalVolumeInput(els.soundboardVolumeInput, els.soundboardVolumeSlider, (value) => {
    if (typeof value === "number") {
      state.soundboardVolume = clamp(value, 0, 1);
    }
    return state.soundboardVolume;
  });

  els.previewTitleInput.addEventListener("input", () => {
    // Keep native full-width sizing for title input.
  });
  els.previewTitleInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await applySelectedSettings("displayName");
      els.previewTitleInput.blur();
    }
  });
  els.previewTitleInput.addEventListener("blur", async () => {
    await applySelectedSettings("displayName");
  });

  els.startSlider.addEventListener("input", async () => {
    await applySelectedSettings("startSlider");
  });

  els.endSlider.addEventListener("input", async () => {
    await applySelectedSettings("endSlider");
  });

  els.volumeSlider.addEventListener("input", async () => {
    await applySelectedSettings("volumeSlider");
  });
  els.fadeInSlider.addEventListener("input", async () => {
    await applySelectedSettings("fadeInSlider");
  });
  els.fadeOutSlider.addEventListener("input", async () => {
    await applySelectedSettings("fadeOutSlider");
  });

  const commitTextInput = (input, source) => {
    input.addEventListener("input", () => {
      updateInlineInputWidth(input, 2, 10);
    });

    input.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await applySelectedSettings(source);
        input.blur();
      }
    });

    input.addEventListener("blur", async () => {
      await applySelectedSettings(source);
    });
  };

  commitTextInput(els.fadeInInput, "fadeInInput");
  commitTextInput(els.fadeOutInput, "fadeOutInput");
  commitTextInput(els.volumeInput, "volumeInput");
  commitTextInput(els.startInput, "startInput");
  commitTextInput(els.endInput, "endInput");

  els.playSelectedBtn.addEventListener("click", async () => {
    await playSound(selectedSound());
  });

  els.previewBtn.addEventListener("click", onTogglePreview);
  els.stopTopBtn.addEventListener("click", () => {
    const sound = selectedSound();
    if (sound) {
      stopPlaybacksForSound(sound.id, true);
      stopPreview();
    }
  });
  els.stopBottomBtn.addEventListener("click", onResetPreviewCursor);

  const onTimelinePointerMove = async (event) => {
    if (!state.draggingCursor) {
      return;
    }

    const cursorTime = cursorTimeFromPointerEvent(event);
    setTimelineCursorTime(cursorTime);

    if (state.previewAudio) {
      state.previewAudio.currentTime = cursorTime;
    }

    await playScrubSnippetAt(cursorTime);
  };

  const onTimelinePointerUp = async (event) => {
    if (!state.draggingCursor) {
      return;
    }

    state.draggingCursor = false;
    if (els.timeline.hasPointerCapture(event.pointerId)) {
      els.timeline.releasePointerCapture(event.pointerId);
    }

    const cursorTime = cursorTimeFromPointerEvent(event);
    setTimelineCursorTime(cursorTime);

    if (state.previewAudio) {
      state.previewAudio.currentTime = cursorTime;
      if (state.resumePreviewAfterDrag) {
        try {
          await state.previewAudio.play();
          updatePreviewControls();
        } catch (_error) {
          // Ignore resume failure.
        }
      }
    }

    state.resumePreviewAfterDrag = false;
  };

  els.timeline.addEventListener("pointerdown", async (event) => {
    const sound = selectedSound();
    if (!sound) {
      return;
    }

    state.draggingCursor = true;
    els.timeline.setPointerCapture(event.pointerId);

    const cursorTime = cursorTimeFromPointerEvent(event);
    setTimelineCursorTime(cursorTime);

    if (state.previewAudio && !state.previewAudio.paused) {
      state.resumePreviewAfterDrag = true;
      state.previewAudio.pause();
      updatePreviewControls();
    } else {
      state.resumePreviewAfterDrag = false;
    }

    if (state.previewAudio) {
      state.previewAudio.currentTime = cursorTime;
    }

    await playScrubSnippetAt(cursorTime);
  });

  els.timeline.addEventListener("pointermove", onTimelinePointerMove);
  els.timeline.addEventListener("pointerup", onTimelinePointerUp);
  els.timeline.addEventListener("pointercancel", onTimelinePointerUp);

  els.setKeybindBtn.addEventListener("click", () => {
    state.captureMode = "sound";
    els.captureHint.textContent = "Press key combination for selected sound...";
    els.captureHint.classList.remove("hidden");
  });

  els.clearKeybindBtn.addEventListener("click", async () => {
    const sound = selectedSound();
    if (!sound) {
      return;
    }
    sound.keybind = "";
    await persist();
    renderAll();
  });

  els.setStopAllKeybindBtn.addEventListener("click", () => {
    state.captureMode = "stopAll";
    els.captureHint.textContent = "Press key combination for Stop All...";
    els.captureHint.classList.remove("hidden");
  });

  els.clearStopAllKeybindBtn.addEventListener("click", async () => {
    state.stopAllKeybind = "";
    await persist();
    renderAll();
  });

  window.addEventListener("keydown", async (event) => {
    if (!state.captureMode) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const accelerator = buildAccelerator(event);
    if (!accelerator) {
      return;
    }

    if (state.captureMode === "sound") {
      const sound = selectedSound();
      if (sound) {
        sound.keybind = accelerator;
      }
    } else if (state.captureMode === "stopAll") {
      state.stopAllKeybind = accelerator;
    }

    state.captureMode = "";
    els.captureHint.classList.add("hidden");
    await persist();
    renderAll();
  });

  window.soundboardApi.onPlaySoundById(async (soundId) => {
    const sound = state.sounds.find((item) => item.id === soundId);
    if (sound) {
      await playSound(sound);
    }
  });

  window.soundboardApi.onStopAllSounds(() => {
    stopAllPlayback(true);
  });
}

async function bootstrap() {
  const settings = await window.soundboardApi.getSettings();
  state.outputDeviceId = settings.outputDeviceId || "default";
  state.stopAllKeybind = settings.stopAllKeybind ? String(settings.stopAllKeybind) : "";
  state.localVolume = parseUnitValue(settings.localVolume, 1);
  state.soundboardVolume = parseUnitValue(settings.soundboardVolume, 1);
  const folders = Array.isArray(settings.folders) ? settings.folders : [];
  state.folders = folders.map((folder) => ({
    id: String(folder.id || uid()),
    name: String(folder.name || "New Folder"),
    collapsed: Boolean(folder.collapsed)
  }));
  const folderIds = new Set(state.folders.map((folder) => folder.id));

  const sounds = Array.isArray(settings.sounds) ? settings.sounds : [];
  state.sounds = [];
  for (const sound of sounds) {
    const duration = await getDuration(sound.filePath);
    const soundFolderId = String(sound.folderId || "");
    const next = {
      id: String(sound.id || uid()),
      filePath: String(sound.filePath || ""),
      displayName: String(sound.displayName || ""),
      start: Number(sound.start) || 0,
      end: Number(sound.end) || duration || 1,
      duration: duration || 1,
      volume: Number.isFinite(sound.volume) ? Number(sound.volume) : 1,
      fadeIn: Number.isFinite(sound.fadeIn) ? Number(sound.fadeIn) : 0,
      fadeOut: Number.isFinite(sound.fadeOut) ? Number(sound.fadeOut) : 0,
      folderId: folderIds.has(soundFolderId) ? soundFolderId : "",
      keybind: String(sound.keybind || ""),
      envelope: []
    };
    clampSound(next);
    state.sounds.push(next);
  }

  state.selectedSoundId = state.sounds[0]?.id || "";
  if (state.selectedSoundId) {
    const first = selectedSound();
    if (first) {
      state.timelineCursorTime = Number(first.start) || 0;
      await ensureEnvelope(first);
    }
  }

  await loadOutputDevices();
  await installEvents();
  renderAll();
}

bootstrap();
