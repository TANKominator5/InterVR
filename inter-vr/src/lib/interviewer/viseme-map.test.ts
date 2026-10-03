import assert from "node:assert/strict";
import { test } from "node:test";
import { sampleVisemeWeights, type TimedViseme } from "./viseme-map";

const cues: TimedViseme[] = [
  { viseme: "PP", startMs: 200, durationMs: 100 },
  { viseme: "aa", startMs: 300, durationMs: 150 },
  { viseme: "FF", startMs: 700, durationMs: 100 },
];

test("initial silence, a long pause and completed audio restore a neutral face", () => {
  for (const time of [0, 199, 500, 650, 801, 5000]) {
    assert.deepEqual(sampleVisemeWeights(cues, time), {});
  }
});

test("bilabial and labiodental sounds retain their authored poses", () => {
  assert.deepEqual(sampleVisemeWeights(cues, 220), { PP: 1 });
  assert.deepEqual(sampleVisemeWeights(cues, 720), { FF: 1 });
});

test("adjacent sounds blend without overdriving the facial rig", () => {
  const weights = sampleVisemeWeights(cues, 285);
  assert.ok(weights.PP > 0 && weights.PP < 1);
  assert.ok(weights.aa > 0 && weights.aa < 1);
  assert.equal(weights.PP + weights.aa, 1);
});

test("silence cues do not hold an open mouth", () => {
  assert.deepEqual(sampleVisemeWeights([{ viseme: "sil", startMs: 0, durationMs: 500 }], 250), {});
});
