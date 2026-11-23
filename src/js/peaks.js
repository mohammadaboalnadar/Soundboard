// Waveform peaks and loudness analysis. Pure functions over Float32Array channels.

export function computePeaks(channels, points = 256) {
  const out = new Uint8Array(points);
  const len = channels.length ? channels[0].length : 0;
  if (!len) return out;
  const block = len / points;
  for (let p = 0; p < points; p++) {
    const from = Math.floor(p * block);
    const to = Math.max(from + 1, Math.floor((p + 1) * block));
    let max = 0;
    for (const ch of channels) {
      for (let i = from; i < to && i < len; i++) {
        const v = ch[i] < 0 ? -ch[i] : ch[i];
        if (v > max) max = v;
      }
    }
    out[p] = Math.min(255, Math.round(max * 255));
  }
  return out;
}

export function encodePeaks(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

export function decodePeaks(b64) {
  if (!b64) return new Uint8Array(0);
  try {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array(0);
  }
}

const toDb = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);

export function measureLoudness(channels) {
  let sum = 0;
  let count = 0;
  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i];
      sum += v * v;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
    count += ch.length;
  }
  return { rmsDb: toDb(Math.sqrt(sum / Math.max(1, count))), peakDb: toDb(peak) };
}

/** Linear gain that brings RMS to `target` dBFS without the peak exceeding `ceiling` dBFS. */
export function autoLevelGain({ rmsDb, peakDb }, target = -16, ceiling = -1) {
  if (!Number.isFinite(rmsDb) || !Number.isFinite(peakDb)) return 1;
  const db = Math.min(target - rmsDb, ceiling - peakDb);
  return 10 ** (db / 20);
}
