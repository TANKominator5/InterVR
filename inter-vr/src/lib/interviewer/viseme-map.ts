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
  const blendMs = 30;
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const end = cue.startMs + cue.durationMs;
    if (timeMs < cue.startMs) return {};
    if (timeMs >= end) continue;

    const next = cues[i + 1];
    const nextIsAdjacent = next && next.startMs <= end + 15;
    const transitionStart = Math.max(cue.startMs, end - blendMs);
    const amount = nextIsAdjacent && timeMs > transitionStart
      ? Math.min(1, (timeMs - transitionStart) / Math.max(1, end - transitionStart))
      : 0;
    const weights: Record<string, number> = {};
    if (cue.viseme !== "sil") weights[cue.viseme] = 1 - amount;
    if (nextIsAdjacent && next.viseme !== "sil" && amount > 0) {
      weights[next.viseme] = (weights[next.viseme] ?? 0) + amount;
    }
    return weights;
  }
  return {};
}

// Sample timed visemes at a playback time. Returns blended procedural pose.
export function sampleVisemes(cues: TimedViseme[], timeMs: number): ProceduralMouthPose {
  if (cues.length === 0) return NEUTRAL_MOUTH;
  // Find active cue; blend 40ms into the next cue to avoid snapping.
  const BLEND_MS = 45;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const end = c.startMs + c.durationMs;
    if (timeMs >= c.startMs && timeMs <= end) {
      const cur = OCULUS_TO_PROCEDURAL[c.viseme] ?? NEUTRAL_MOUTH;
      const next = cues[i + 1] ? (OCULUS_TO_PROCEDURAL[cues[i + 1].viseme] ?? NEUTRAL_MOUTH) : null;
      if (next && end - timeMs < BLEND_MS) {
        const t = 1 - (end - timeMs) / BLEND_MS;
        // Slight anticipation: ease toward next shape.
        return lerpPose(cur, next, t * t);
      }
      return cur;
    }
    if (timeMs < c.startMs) {
      // Gap = coarticulation toward upcoming shape.
      const prevPose = i > 0 ? (OCULUS_TO_PROCEDURAL[cues[i - 1].viseme] ?? NEUTRAL_MOUTH) : NEUTRAL_MOUTH;
      const nextPose = OCULUS_TO_PROCEDURAL[c.viseme] ?? NEUTRAL_MOUTH;
      const gap = c.startMs - (i > 0 ? cues[i - 1].startMs + cues[i - 1].durationMs : 0);
      const t = gap > 0 ? 1 - Math.min(1, (c.startMs - timeMs) / gap) : 1;
      return lerpPose(prevPose, nextPose, t);
    }
  }
  return NEUTRAL_MOUTH;
}

// Blend ARKit weights for a GLB model at a playback time.
export function sampleARKitWeights(cues: TimedViseme[], timeMs: number): Record<string, number> {
  if (cues.length === 0) return { jawOpen: 0.06, mouthClose: 0.2 };
  const BLEND_MS = 45;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const end = c.startMs + c.durationMs;
    if (timeMs >= c.startMs && timeMs <= end) {
      const cur = OCULUS_TO_ARKIT[c.viseme] ?? {};
      const nextCue = cues[i + 1];
      if (nextCue && end - timeMs < BLEND_MS) {
        const t = 1 - (end - timeMs) / BLEND_MS;
        const next = OCULUS_TO_ARKIT[nextCue.viseme] ?? {};
        const keys = new Set([...Object.keys(cur), ...Object.keys(next)]);
        const out: Record<string, number> = {};
        keys.forEach((k) => {
          out[k] = (cur[k] ?? 0) + ((next[k] ?? 0) - (cur[k] ?? 0)) * (t * t);
        });
        return out;
      }
      return cur;
    }
  }
  const last = cues[cues.length - 1];
  if (timeMs > last.startMs + last.durationMs) return { jawOpen: 0.06, mouthClose: 0.2 };
  return OCULUS_TO_ARKIT[cues[0].viseme] ?? {};
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
  return words.map((w) => ({ viseme: wordToViseme(w.word), startMs: w.startMs, durationMs: Math.max(90, w.durationMs) }));
}
