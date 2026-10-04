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

test("open vowels have readable articulation that follows vocal emphasis", () => {
  const quiet = buildSpeechPose({ aa: 1 }, 0.1, true);
  const emphasized = buildSpeechPose({ aa: 1 }, 0.8, true);
  assert.ok(quiet.visemes.aa > 1);
  assert.ok(emphasized.visemes.aa > quiet.visemes.aa);
  assert.ok(emphasized.jawBoost > quiet.jawBoost);
  assert.ok(emphasized.visemes.aa <= 1.15);
  assert.ok(emphasized.jawBoost < 0.1);
});

test("timed silence stays neutral despite residual audio energy", () => {
  assert.deepEqual(buildSpeechPose({}, 0.6, true), { visemes: {}, arkit: {}, jawBoost: 0 });
  assert.deepEqual(buildSpeechPose({ sil: 1 }, 0.6, true), { visemes: {}, arkit: {}, jawBoost: 0 });
  assert.deepEqual(buildSpeechPose({ aa: 1 }, 1, false), { visemes: {}, arkit: {}, jawBoost: 0 });
});

test("audio-only articulation is enabled only when no phoneme timeline exists", () => {
  const pose = buildSpeechPose({}, 0.6, true, true);
  assert.equal(pose.arkit.jawOpen, 0.3);
  assert.equal(pose.jawBoost, 0.3);
  assert.equal(buildSpeechPose({}, 0, true, true).jawBoost, 0);
});
