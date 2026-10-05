import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSpeechPose } from "./speech-animation";

test("loud bilabial consonants stay shut instead of becoming a generic open jaw", () => {
  const pose = buildSpeechPose({ PP: 1 }, 1, true);
  assert.equal(pose.visemes.PP, 1);
  assert.equal(pose.arkit.mouthClose, 1);
  assert.equal(pose.arkit.jawOpen, 0);
  assert.equal(pose.jawBoost, 0);
});

test("open vowels follow emphasis without overdriving the lips or double-opening the jaw", () => {
  const quiet = buildSpeechPose({ aa: 1 }, 0.1, true);
  const emphasized = buildSpeechPose({ aa: 1 }, 0.8, true);
  assert.ok(quiet.visemes.aa > 0.5);
  assert.ok(emphasized.visemes.aa > quiet.visemes.aa);
  assert.ok(emphasized.visemes.aa <= 0.62);
  assert.equal(emphasized.jawBoost, 0);
  assert.ok(emphasized.arkit.jawOpen < 0.5);
});

test("every vowel stays within a conversational range even with overdriven input", () => {
  for (const vowel of ["aa", "E", "I", "O", "U"]) {
    const pose = buildSpeechPose({ [vowel]: 2 }, 2, true);
    assert.ok(pose.visemes[vowel] <= 0.65, vowel);
    assert.equal(pose.jawBoost, 0);
  }
});

test("overlapping syllables share one budget and preserve bilabial closure", () => {
  const overlapping = buildSpeechPose({ aa: 1, E: 1, O: 1 }, 1, true);
  assert.ok(Object.values(overlapping.visemes).reduce((sum, weight) => sum + weight, 0) <= 0.65);
  const closing = buildSpeechPose({ aa: 0.5, PP: 0.5 }, 1, true);
  assert.equal(closing.visemes.PP, 0.5);
  assert.ok(closing.arkit.jawOpen < buildSpeechPose({ aa: 0.5 }, 1, true).arkit.jawOpen);
});

test("invalid animation inputs cannot corrupt morph buffers", () => {
  const pose = buildSpeechPose({ aa: NaN, O: Infinity, unknown: 1, PP: -1 }, NaN, true);
  assert.deepEqual(pose, { visemes: {}, arkit: {}, jawBoost: 0 });
});

test("timed silence stays neutral despite residual audio energy", () => {
  assert.deepEqual(buildSpeechPose({}, 0.6, true), { visemes: {}, arkit: {}, jawBoost: 0 });
  assert.deepEqual(buildSpeechPose({ sil: 1 }, 0.6, true), { visemes: {}, arkit: {}, jawBoost: 0 });
  assert.deepEqual(buildSpeechPose({ aa: 1 }, 1, false), { visemes: {}, arkit: {}, jawBoost: 0 });
});

test("audio-only articulation is enabled only when no phoneme timeline exists", () => {
  const pose = buildSpeechPose({}, 0.6, true, true);
  assert.equal(pose.arkit.jawOpen, 0.6 * 0.22);
  assert.equal(pose.jawBoost, 0.6 * 0.22);
  assert.equal(buildSpeechPose({}, 0, true, true).jawBoost, 0);
});
