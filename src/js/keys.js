// Keyboard accelerators in Tauri's global-shortcut syntax.
// Pure module: no DOM access, testable with node --test.

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "OS", "AltGraph"]);

const NUMPAD = {
  NumpadAdd: "NumpadAdd",
  NumpadSubtract: "NumpadSubtract",
  NumpadMultiply: "NumpadMultiply",
  NumpadDivide: "NumpadDivide",
  NumpadDecimal: "NumpadDecimal",
  NumpadEnter: "NumpadEnter"
};

const NAMED = {
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Escape",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Backquote: "`",
  PrintScreen: "PrintScreen",
  ScrollLock: "ScrollLock",
  Pause: "Pause"
};

function keyFromCode(code) {
  if (!code) return "";
  if (/^Numpad\d$/.test(code)) return code;
  if (NUMPAD[code]) return NUMPAD[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  return NAMED[code] || "";
}

export function acceleratorFromEvent(e) {
  if (!e || MODIFIER_KEYS.has(e.key)) return "";
  const key = keyFromCode(e.code);
  if (!key) return "";
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");
  parts.push(key);
  return parts.join("+");
}

/** Side-button chord from the modifiers held and the side buttons pressed (4 and/or 5). */
export function mouseChord(mods, buttons) {
  const parts = [];
  if (mods.ctrlKey) parts.push("Ctrl");
  if (mods.altKey) parts.push("Alt");
  if (mods.shiftKey) parts.push("Shift");
  if (mods.metaKey) parts.push("Super");
  for (const b of [4, 5]) if (buttons.has(b)) parts.push(`Mouse${b}`);
  return buttons.size ? parts.join("+") : "";
}

const NUMPAD_LABEL = {
  NumpadAdd: "+",
  NumpadSubtract: "-",
  NumpadMultiply: "*",
  NumpadDivide: "/",
  NumpadDecimal: ".",
  NumpadEnter: "Enter"
};

export function formatKey(acc) {
  if (!acc) return "";
  return acc
    .split("+")
    .map((part) => {
      if (/^Numpad\d$/.test(part)) return `Num ${part.slice(6)}`;
      if (NUMPAD_LABEL[part]) return `Num ${NUMPAD_LABEL[part]}`;
      if (part === "Super") return "Win";
      if (/^Mouse\d$/.test(part)) return `Mouse ${part.slice(5)}`;
      return part;
    })
    .join(" ");
}

const LEGACY_NUMPAD = {
  numadd: "NumpadAdd",
  numsub: "NumpadSubtract",
  nummult: "NumpadMultiply",
  numdiv: "NumpadDivide",
  numdec: "NumpadDecimal"
};

export function fromLegacyKey(acc) {
  if (!acc) return "";
  return String(acc)
    .split("+")
    .map((part) => {
      if (part === "Control" || part === "CommandOrControl" || part === "CmdOrCtrl") return "Ctrl";
      if (part === "Esc") return "Escape";
      if (/^num\d$/.test(part)) return `Numpad${part.slice(3)}`;
      if (LEGACY_NUMPAD[part]) return LEGACY_NUMPAD[part];
      return part;
    })
    .join("+");
}

export function assignKey(sounds, soundId, acc) {
  return sounds.map((s) => {
    if (s.id === soundId) return { ...s, key: acc };
    if (acc && s.key === acc) return { ...s, key: "" };
    return s;
  });
}
