import { OCULUS_TO_ARKIT, type OculusViseme } from "./viseme-map";

// MPFB visemes are maximum articulation poses, not conversational targets.
// Wide/rounded vowels need less travel than lip-contact consonants.
const ARTICULATION: Record<OculusViseme, number> = {
  sil: 0, PP: 1, FF: 0.82, TH: 0.68, DD: 0.72, kk: 0.68,
  CH: 0.72, SS: 0.78, nn: 0.7, RR: 0.68,
  aa: 0.62, E: 0.65, I: 0.58, O: 0.65, U: 0.62,
};

export function buildSpeechPose(weights: Record<string, number>, level: number, speaking: boolean, allowAudioFallback = false) {
  const visemes: Record<string, number> = {};
  const arkit: Record<string, number> = {};
  let jawBoost = 0;
  if (!speaking) return { visemes, arkit, jawBoost };

  const energy = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  const valid = Object.entries(weights).filter(([name, weight]) =>
    Object.hasOwn(ARTICULATION, name) && name !== "sil" && Number.isFinite(weight) && weight > 0);
  // Overlapping cues share one budget instead of adding full-strength poses.
  const total = valid.reduce((sum, [, weight]) => sum + Math.min(1, weight), 0);
  const normalization = 1 / Math.max(1, total);
  const closure = (valid.find(([name]) => name === "PP")?.[1] ?? 0);
  for (const [name, weight] of valid) {
    const viseme = name as OculusViseme;
    const gain = viseme === "PP" ? 1 : ARTICULATION[viseme] * (0.9 + energy * 0.1);
    const strength = Math.min(1, weight) * normalization * gain;
    visemes[viseme] = strength;
    for (const [key, value] of Object.entries(OCULUS_TO_ARKIT[viseme])) {
      arkit[key] = (arkit[key] ?? 0) + value * strength;
    }
  }
  // Visemes already move the jaw; an extra jaw morph double-opens vowels.
  // Lip closure also takes priority in the ARKit-only fallback rig.
  if (arkit.jawOpen) arkit.jawOpen *= 1 - Math.min(1, closure) * normalization;

  // A voice without phoneme metadata still gets audible articulation. Timed
  // silence has zero energy and therefore remains at the neutral bind pose.
  if (allowAudioFallback && Object.keys(visemes).length === 0) {
    arkit.jawOpen = energy * 0.22;
    jawBoost = arkit.jawOpen;
  }
  return { visemes, arkit, jawBoost };
}
