import assert from "node:assert/strict";
import { test } from "node:test";
import { sampleARKitWeights, sampleVisemes, sampleVisemeWeights, wordsToTimedVisemes, type TimedViseme } from "./viseme-map";

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
  const afterSilence: TimedViseme[] = [
    { viseme: "sil", startMs: 0, durationMs: 500 },
    { viseme: "aa", startMs: 500, durationMs: 150 },
  ];
  assert.deepEqual(sampleVisemeWeights(afterSilence, 499), {});
  assert.equal(sampleVisemeWeights(afterSilence, 500).aa, 0);
  assert.ok(sampleVisemeWeights(afterSilence, 510).aa > 0);
});

test("short consonants retain a full closure before transitioning into a vowel", () => {
  const fast: TimedViseme[] = [
    { viseme: "PP", startMs: 0, durationMs: 40 },
    { viseme: "aa", startMs: 40, durationMs: 100 },
  ];
  assert.equal(sampleVisemeWeights(fast, 15).PP, 1);
  const transition = sampleVisemeWeights(fast, 35);
  assert.ok(transition.PP > 0 && transition.aa > 0);
  assert.equal(transition.PP + transition.aa, 1);
  assert.ok(Math.abs(sampleVisemeWeights(fast, 39.99).aa - sampleVisemeWeights(fast, 40).aa) < 0.001);
});

test("all mouth representations release during pauses and at the end of speech", () => {
  for (const time of [0, 199, 500, 650, 801, 5000]) {
    assert.equal(sampleVisemes(cues, time).jawOpen, 0);
    assert.deepEqual(sampleARKitWeights(cues, time), {});
  }
  assert.ok(sampleVisemeWeights(cues, 790).FF < sampleVisemeWeights(cues, 750).FF);
});

test("padded HeadTTS cues do not mask the onset of a short consonant", () => {
  const overlapping: TimedViseme[] = [
    { viseme: "aa", startMs: 0, durationMs: 140 },
    { viseme: "PP", startMs: 100, durationMs: 35 },
    { viseme: "E", startMs: 135, durationMs: 120 },
  ];
  assert.deepEqual(sampleVisemeWeights(overlapping, 105), { PP: 1 });
  assert.deepEqual(sampleVisemeWeights(overlapping, 135), { E: 1 });
});

test("browser fallback articulates within a word instead of holding a closed M pose", () => {
  const fallback = wordsToTimedVisemes([{ word: "map", startMs: 100, durationMs: 300 }]);
  assert.deepEqual(fallback.map((cue) => cue.viseme), ["PP", "aa", "PP"]);
  assert.equal(fallback[0].startMs, 100);
  const last = fallback[fallback.length - 1];
  assert.ok(Math.abs(last.startMs + last.durationMs - 400) < 0.001);
  const vowel = fallback[1];
  assert.ok(sampleVisemes(fallback, vowel.startMs + vowel.durationMs * 0.4).jawOpen > 0.5);
});

test("browser fallback keeps word timing and punctuation pauses", () => {
  const fallback = wordsToTimedVisemes([
    { word: "choose,", startMs: 0, durationMs: 360 },
    { word: "then", startMs: 500, durationMs: 240 },
  ]);
  assert.equal(fallback[0].viseme, "CH");
  assert.ok(fallback.some((cue) => cue.viseme === "U"));
  assert.ok(fallback.some((cue) => cue.viseme === "sil"));
  assert.deepEqual(sampleVisemeWeights(fallback, 450), {});
  assert.equal(fallback.find((cue) => cue.viseme === "TH")?.startMs, 500);
});
