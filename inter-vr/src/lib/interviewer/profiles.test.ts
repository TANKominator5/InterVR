import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeInterviewer, selectBrowserVoice } from "./profiles";

test("legacy sessions default to Michael while saved female sessions retain Bella", () => {
  for (const value of [undefined, null, "", "unknown", {}, 5]) assert.equal(normalizeInterviewer(value), "male");
  assert.equal(normalizeInterviewer("female"), "female");
});

test("browser fallback chooses a matching English voice regardless of list order", () => {
  const voices = [
    { name: "Google US English", lang: "en-US" },
    { name: "Microsoft Zira - English (United States)", lang: "en-US" },
    { name: "Microsoft David - English (United States)", lang: "en-US" },
    { name: "Microsoft Susan", lang: "fr-FR" },
  ];
  assert.equal(selectBrowserVoice(voices, "female"), voices[1]);
  assert.equal(selectBrowserVoice(voices, "male"), voices[2]);
});

test("unavailable gender-specific browser voices fall back to an English voice", () => {
  const voices = [{ name: "Default", lang: "en-GB" }, { name: "Google US English", lang: "en-US" }];
  assert.equal(selectBrowserVoice(voices, "female"), voices[1]);
  assert.equal(selectBrowserVoice([], "male"), undefined);
});
