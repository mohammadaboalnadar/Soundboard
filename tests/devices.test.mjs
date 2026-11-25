import test from "node:test";
import assert from "node:assert/strict";
import { findCable, findCableCapture, micChoices } from "../src/js/devices.js";

const out = (label, deviceId = label) => ({ kind: "audiooutput", label, deviceId });

test("the plain CABLE Input wins over the 16ch pipe, whatever the list order", () => {
  const list = [out("Speakers"), out("CABLE In 16ch (VB-Audio Virtual Cable)"), out("CABLE Input (VB-Audio Virtual Cable)")];
  assert.equal(findCable(list).label, "CABLE Input (VB-Audio Virtual Cable)");
});

test("the 16ch pipe is used only when it is the only cable", () => {
  assert.equal(findCable([out("Speakers"), out("CABLE In 16ch (VB-Audio Virtual Cable)")]).label, "CABLE In 16ch (VB-Audio Virtual Cable)");
});

test("no cable means null, and default aliases are never returned", () => {
  assert.equal(findCable([out("Default - Virtual Speakers", "default"), out("Speakers")]), null);
});

test("other virtual cables are recognised", () => {
  assert.equal(findCable([out("Speakers"), out("VoiceMeeter Input (VB-Audio VoiceMeeter VAIO)")]).label, "VoiceMeeter Input (VB-Audio VoiceMeeter VAIO)");
});

test("the capture side is found by name", () => {
  const inputs = [{ label: "Microphone Array", deviceId: "a" }, { label: "CABLE Output (VB-Audio Virtual Cable)", deviceId: "b" }];
  assert.equal(findCableCapture(inputs).deviceId, "b");
  assert.equal(findCableCapture([inputs[0]]), null);
});

test("the cable's capture side is never offered as a microphone", () => {
  const inputs = [
    { label: "Default - Mic", deviceId: "default" },
    { label: "Microphone Array", deviceId: "a" },
    { label: "CABLE Output (VB-Audio Virtual Cable)", deviceId: "b" },
    { label: "CABLE 16ch Output (VB-Audio Virtual Cable)", deviceId: "c" }
  ];
  assert.deepEqual(micChoices(inputs).map((d) => d.deviceId), ["a"]);
});
