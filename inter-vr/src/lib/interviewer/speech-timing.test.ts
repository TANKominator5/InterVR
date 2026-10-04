import assert from "node:assert/strict";
import { test } from "node:test";
import { approximateSpeechCues, estimateWordTimings, splitSpeechText } from "./speech-timing";

test("long questions stay within the API limit without losing words", () => {
  const text = "Explain your approach to database security. ".repeat(80).trim();
  const chunks = splitSpeechText(text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length > 0 && chunk.length <= 1000));
  assert.equal(chunks.join(" "), text);
});

test("an unusually long token is split safely and short questions are untouched", () => {
  assert.equal(splitSpeechText("x".repeat(2100)).join(""), "x".repeat(2100));
  assert.deepEqual(splitSpeechText("  Welcome.  "), ["Welcome."]);
  assert.deepEqual(splitSpeechText(""), []);
});

test("API lip timings cover the actual audio duration and retain word boundaries", () => {
  const text = "Welcome. Explain your implementation.";
  const words = estimateWordTimings(text, 4800);
  assert.equal(words[1].charIndex, text.indexOf("Explain"));
  const lastWord = words[words.length - 1];
  assert.ok(Math.abs(lastWord.startMs + lastWord.durationMs - 4800) < 0.001);
  const cues = approximateSpeechCues(text, 4800);
  const lastCue = cues[cues.length - 1];
  assert.ok(Math.abs(lastCue.startMs + lastCue.durationMs - 4800) < 0.001);
  assert.ok(cues.some((cue) => cue.viseme === "sil"));
});
