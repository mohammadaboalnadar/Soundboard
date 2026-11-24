// Microphone choices: real inputs only. The virtual cable's own capture side is left out,
// because picking it as the mic would feed everything you play straight back into itself.
const ALIASES = new Set(["default", "communications"]);
const VIRTUAL_CABLE = /vb-audio|cable (output|in 16ch)/i;

export function micChoices(inputs) {
  return inputs.filter((d) => !ALIASES.has(d.deviceId) && !VIRTUAL_CABLE.test(d.label || ""));
}
