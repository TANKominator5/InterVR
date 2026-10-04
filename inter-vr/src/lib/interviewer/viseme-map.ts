// Free browser-only viseme mapping.
// HeadTTS emits Oculus visemes: sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, I, O, U
// We map those to:
//  1) ARKit blendshape weights (for GLB models with morph targets)
//  2) Procedural mouth params (for the built-in stylized avatar, no model file needed)

export type OculusViseme =
  | "sil"
  | "PP"
  | "FF"
  | "TH"
  | "DD"
  | "kk"
  | "CH"
  | "SS"
  | "nn"
  | "RR"
  | "aa"
  | "E"
  | "I"
  | "O"
  | "U";

export interface ProceduralMouthPose {
  jawOpen: number; // 0 closed .. 1 fully open
  mouthWide: number; // 0 narrow/rounded .. 1 stretched wide (E/I smile)
  mouthRound: number; // 0 slit .. 1 rounded O/U
  lipClose: number; // 0 open .. 1 pressed shut (M/B/P)
  teeth: number; // 0 hidden .. 1 visible (F/V, E, I)
}

export const NEUTRAL_MOUTH: ProceduralMouthPose = {
  jawOpen: 0,
  mouthWide: 0,
  mouthRound: 0,
  lipClose: 0,
  teeth: 0,
};

// Tuned for readability on a stylized character, not a 1:1 phonetics model.
export const OCULUS_TO_PROCEDURAL: Record<OculusViseme, ProceduralMouthPose> = {
  sil: { jawOpen: 0.06, mouthWide: 0.3, mouthRound: 0.12, lipClose: 0.25, teeth: 0.0 },
  PP: { jawOpen: 0.0, mouthWide: 0.25, mouthRound: 0.05, lipClose: 1.0, teeth: 0.0 }, // M/B/P
  FF: { jawOpen: 0.14, mouthWide: 0.4, mouthRound: 0.05, lipClose: 0.35, teeth: 1.0 }, // F/V
  TH: { jawOpen: 0.16, mouthWide: 0.35, mouthRound: 0.05, lipClose: 0.1, teeth: 0.9 },
  DD: { jawOpen: 0.22, mouthWide: 0.4, mouthRound: 0.05, lipClose: 0.05, teeth: 0.85 }, // D/T/N
  kk: { jawOpen: 0.3, mouthWide: 0.35, mouthRound: 0.1, lipClose: 0.0, teeth: 0.25 }, // K/G
  CH: { jawOpen: 0.24, mouthWide: 0.38, mouthRound: 0.35, lipClose: 0.0, teeth: 0.4 },
  SS: { jawOpen: 0.12, mouthWide: 0.42, mouthRound: 0.05, lipClose: 0.1, teeth: 0.85 }, // S/Z
  nn: { jawOpen: 0.18, mouthWide: 0.38, mouthRound: 0.08, lipClose: 0.05, teeth: 0.6 },
  RR: { jawOpen: 0.2, mouthWide: 0.3, mouthRound: 0.3, lipClose: 0.0, teeth: 0.3 },
  aa: { jawOpen: 0.65, mouthWide: 0.5, mouthRound: 0.25, lipClose: 0.0, teeth: 0.5 },
  E: { jawOpen: 0.32, mouthWide: 0.85, mouthRound: 0.05, lipClose: 0.0, teeth: 0.75 },
  I: { jawOpen: 0.26, mouthWide: 0.9, mouthRound: 0.02, lipClose: 0.0, teeth: 0.8 },
  O: { jawOpen: 0.45, mouthWide: 0.2, mouthRound: 1.0, lipClose: 0.0, teeth: 0.2 },
  U: { jawOpen: 0.3, mouthWide: 0.15, mouthRound: 0.9, lipClose: 0.0, teeth: 0.1 },
};

// ARKit targets used for mouth/lips. We keep the mapping sparse so unknown
// models degrade gracefully (missing keys are skipped at apply time).
export const OCULUS_TO_ARKIT: Record<OculusViseme, Record<string, number>> = {
  sil: { jawOpen: 0.05, mouthClose: 0.25 },
  PP: { jawOpen: 0.0, mouthClose: 1.0, mouthPressLeft: 0.4, mouthPressRight: 0.4 },
  FF: {
    jawOpen: 0.15,
    mouthLowerDownLeft: 0.7,
    mouthLowerDownRight: 0.7,
    mouthUpperUpLeft: 0.35,
    mouthUpperUpRight: 0.35,
    mouthPressLeft: 0.25,
    mouthPressRight: 0.25,
  },
  TH: { jawOpen: 0.18, tongueOut: 0.6, mouthLowerDownLeft: 0.4, mouthLowerDownRight: 0.4 },
  DD: { jawOpen: 0.22, tongueOut: 0.35, mouthOpen: 0.4 },
  kk: { jawOpen: 0.35, mouthOpen: 0.5 },
  CH: { jawOpen: 0.28, mouthPucker: 0.55, mouthFunnel: 0.4 },
  SS: { jawOpen: 0.12, mouthPressLeft: 0.4, mouthPressRight: 0.4, mouthStretchLeft: 0.4, mouthStretchRight: 0.4 },
  nn: { jawOpen: 0.2, tongueOut: 0.25 },
  RR: { jawOpen: 0.22, mouthPucker: 0.35, mouthFunnel: 0.25 },
  aa: { jawOpen: 0.75, mouthOpen: 0.7, mouthStretchLeft: 0.2, mouthStretchRight: 0.2 },
  E: { jawOpen: 0.35, mouthStretchLeft: 0.75, mouthStretchRight: 0.75 },
  I: { jawOpen: 0.28, mouthStretchLeft: 0.85, mouthStretchRight: 0.85 },
  O: { jawOpen: 0.5, mouthPucker: 0.9, mouthFunnel: 0.7 },
  U: { jawOpen: 0.32, mouthPucker: 1.0, mouthFunnel: 0.5 },
};

export function normalizeViseme(v: string): OculusViseme {
  const key = v.trim() as OculusViseme;
  if (key in OCULUS_TO_PROCEDURAL) return key;
  return "sil";
}

export function lerpPose(a: ProceduralMouthPose, b: ProceduralMouthPose, t: number): ProceduralMouthPose {
  const c = Math.min(1, Math.max(0, t));
  return {
    jawOpen: a.jawOpen + (b.jawOpen - a.jawOpen) * c,
    mouthWide: a.mouthWide + (b.mouthWide - a.mouthWide) * c,
    mouthRound: a.mouthRound + (b.mouthRound - a.mouthRound) * c,
    lipClose: a.lipClose + (b.lipClose - a.lipClose) * c,
    teeth: a.teeth + (b.teeth - a.teeth) * c,
  };
}

export interface TimedViseme {
  viseme: OculusViseme;
  startMs: number;
  durationMs: number;
}

// Preserve the model's authored consonant/vowel poses rather than reducing all
// phonemes to a generic open jaw. In silence, zero weights restore the bind face.
export function sampleVisemeWeights(cues: TimedViseme[], timeMs: number): Record<string, number> {
  const ease = (t: number) => t * t * (3 - 2 * t);
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const next = cues[i + 1];
    // HeadTTS pads cue edges, so consecutive cues can overlap. Do not let an
    // earlier cue mask a short consonant that has already started.
    const end = Math.min(cue.startMs + cue.durationMs, next?.startMs ?? Infinity);
    if (timeMs < cue.startMs) return {};
    if (timeMs >= end) continue;

    const nextIsAdjacent = next && next.startMs <= end;
    // Keep a readable hold even for fast consonants. Longer vowels have more
    // time to prepare the lips for the following sound (coarticulation).
    const durationMs = end - cue.startMs;
    const blendMs = Math.min(55, durationMs * 0.4, (next?.durationMs ?? 100) * 0.5);
    const transitionStart = Math.max(cue.startMs, end - blendMs);
    const amount = cue.viseme !== "sil" && nextIsAdjacent && timeMs > transitionStart
      ? ease(Math.min(1, (timeMs - transitionStart) / Math.max(1, end - transitionStart)))
      : 0;
    const previous = cues[i - 1];
    const startsAfterPause = !previous || previous.viseme === "sil" || previous.startMs + previous.durationMs < cue.startMs;
    const attack = startsAfterPause ? ease(Math.min(1, (timeMs - cue.startMs) / Math.max(1, Math.min(18, durationMs * 0.2)))) : 1;
    const release = nextIsAdjacent ? 1 : ease(Math.min(1, (end - timeMs) / Math.max(1, Math.min(28, durationMs * 0.25))));
    const weights: Record<string, number> = {};
    if (cue.viseme !== "sil") weights[cue.viseme] = (1 - amount) * attack * release;
    if (nextIsAdjacent && next.viseme !== "sil" && amount > 0) {
      weights[next.viseme] = (weights[next.viseme] ?? 0) + amount;
    }
    return weights;
  }
  return {};
}

// Sample timed visemes at a playback time. Returns blended procedural pose.
export function sampleVisemes(cues: TimedViseme[], timeMs: number): ProceduralMouthPose {
  const pose = { ...NEUTRAL_MOUTH };
  for (const [viseme, weight] of Object.entries(sampleVisemeWeights(cues, timeMs))) {
    const shape = OCULUS_TO_PROCEDURAL[viseme as OculusViseme];
    for (const key of Object.keys(pose) as (keyof ProceduralMouthPose)[]) {
      pose[key] += shape[key] * weight;
    }
  }
  return pose;
}

// Blend ARKit weights for a GLB model at a playback time.
export function sampleARKitWeights(cues: TimedViseme[], timeMs: number): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const [viseme, weight] of Object.entries(sampleVisemeWeights(cues, timeMs))) {
    for (const [key, value] of Object.entries(OCULUS_TO_ARKIT[viseme as OculusViseme])) {
      weights[key] = (weights[key] ?? 0) + value * weight;
    }
  }
  return weights;
}

// Fallback heuristic when only word timings (browser TTS) are available.
// Picks a dominant mouth shape per word so the jaw still varies with content.
const WORD_VISEME_HINTS: { match: RegExp; viseme: OculusViseme }[] = [
  { match: /[mbp]/i, viseme: "PP" },
  { match: /[fv]/i, viseme: "FF" },
  { match: /[ou]/i, viseme: "O" },
  { match: /[ei]/i, viseme: "E" },
  { match: /[a]/i, viseme: "aa" },
  { match: /[sz]/i, viseme: "SS" },
  { match: /[tdn]/i, viseme: "DD" },
  { match: /[kg]/i, viseme: "kk" },
  { match: /[r]/i, viseme: "RR" },
];

export function wordToViseme(word: string): OculusViseme {
  for (const h of WORD_VISEME_HINTS) {
    if (h.match.test(word)) return h.viseme;
  }
  return "aa";
}

export function wordsToTimedVisemes(words: { word: string; startMs: number; durationMs: number }[]): TimedViseme[] {
  // Approximate syllable-level articulation, rather than holding one dominant
  // pose (often closed PP) for a whole word. Browser TTS exposes no phonemes.
  return words.flatMap(({ word, startMs, durationMs }) => {
    const tokens = word.toLowerCase().match(/th|sh|ch|ph|ee|oo|ou|ow|[a-z]/g) ?? [];
    const shapes: OculusViseme[] = tokens.map((token) => {
      if (token === "th") return "TH";
      if (token === "sh" || token === "ch") return "CH";
      if (token === "ph") return "FF";
      if (token === "oo") return "U";
      if (token === "ou" || token === "ow") return "O";
      if (token === "ee") return "I";
      if (token === "u" || token === "w") return "U";
      if (token === "n" || token === "l") return "nn";
      if (token === "i" || token === "y") return "I";
      return wordToViseme(token);
    }).filter((shape, index, all) => index === 0 || shape !== all[index - 1]);
    if (shapes.length === 0) shapes.push("sil");
    if (/[.,!?;:]$/.test(word)) shapes.push("sil");
    const length = (shape: OculusViseme) => ["aa", "E", "I", "O", "U"].includes(shape) ? 1.6 : shape === "PP" ? 0.7 : 1;
    const total = shapes.reduce((sum, shape) => sum + length(shape), 0);
    let cursor = startMs;
    return shapes.map((viseme) => {
      const duration = Math.max(1, durationMs) * length(viseme) / total;
      const cue = { viseme, startMs: cursor, durationMs: duration };
      cursor += duration;
      return cue;
    });
  });
}
