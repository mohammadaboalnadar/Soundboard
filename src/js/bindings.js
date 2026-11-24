// One collision pass over every global binding: Stop all, Numpad slots / bank keys,
// and per-sound hotkeys, plus the auto push-to-talk key (which we press ourselves,
// so anything sharing its main key would fire on every push-to-talk).
// Priority: Stop all > slots > sounds in board order. Pure, unit-tested.

const MOD_ORDER = ["Ctrl", "Alt", "Shift", "Super"];

export function canonicalKey(acc) {
  if (!acc) return "";
  const parts = acc.split("+");
  const key = parts.pop();
  const mods = MOD_ORDER.filter((m) => parts.includes(m));
  return [...mods, key].join("+");
}

export function mainKey(acc) {
  return acc ? acc.split("+").pop() : "";
}

/**
 * @returns {{ map: Record<string,string>, blocked: Set<string>, pttConflict: boolean }}
 *   map: binding id -> accelerator to register; blocked: ids that lost a collision.
 */
export function resolveBindings(state, slotMap) {
  const map = {};
  const blocked = new Set();
  const taken = new Set();
  const pttMain = mainKey(state.ptt?.key || "");
  let pttConflict = false;

  const claim = (id, acc) => {
    if (!acc) return;
    const key = canonicalKey(acc);
    if (pttMain && mainKey(key) === pttMain) {
      blocked.add(id);
      pttConflict = true;
      return;
    }
    if (taken.has(key)) {
      blocked.add(id);
      return;
    }
    taken.add(key);
    map[id] = key;
  };

  claim("__stop_all__", state.stopAllKey);
  if (state.slotKeys) for (const [id, acc] of Object.entries(slotMap)) claim(id, acc);
  for (const s of state.sounds) claim(s.id, s.key);
  return { map, blocked, pttConflict };
}
