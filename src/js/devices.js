// Microphone choices: real inputs only. The virtual cable's own capture side is left out,
// because picking it as the mic would feed everything you play straight back into itself.
const ALIASES = new Set(["default", "communications"]);
const VIRTUAL_CABLE = /vb-audio|cable (output|in 16ch)/i;

export function micChoices(inputs) {
  return inputs.filter((d) => !ALIASES.has(d.deviceId) && !VIRTUAL_CABLE.test(d.label || ""));
}

const CABLE_ANY = /cable|vb-audio|voicemeeter|virtual/i;

/** The virtual cable to send sounds into. The plain "CABLE Input" wins over VB's separate 16ch pipe. */
export function findCable(outputs) {
  const real = outputs.filter((d) => d.deviceId !== "default" && d.deviceId !== "communications");
  return (
    real.find((d) => /cable input/i.test(d.label)) ||
    real.find((d) => CABLE_ANY.test(d.label) && !/16ch/i.test(d.label)) ||
    real.find((d) => CABLE_ANY.test(d.label)) ||
    null
  );
}

/** The matching capture side other apps listen on ("CABLE Output"). */
export function findCableCapture(inputs) {
  return inputs.find((d) => /cable output/i.test(d.label)) || null;
}
