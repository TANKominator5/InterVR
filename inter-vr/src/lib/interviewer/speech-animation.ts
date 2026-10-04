import { OCULUS_TO_ARKIT, OCULUS_TO_PROCEDURAL, type OculusViseme } from "./viseme-map";

// Authored visemes carry the lip shape; audio energy supplies emphasis, rather
// than replacing consonants with an always-open, volume-driven jaw.
export function buildSpeechPose(weights: Record<string, number>, level: number, speaking: boolean, allowAudioFallback = false) {
  const visemes: Record<string, number> = {};
  const arkit: Record<string, number> = {};
  let jawBoost = 0;
  if (!speaking) return { visemes, arkit, jawBoost };

  const energy = Math.min(1, Math.max(0, level));
  for (const [name, weight] of Object.entries(weights)) {
    const viseme = name as OculusViseme;
    const mouth = OCULUS_TO_PROCEDURAL[viseme];
    if (!mouth || viseme === "sil" || weight <= 0) continue;
    const gain = viseme === "PP" ? 1 : (viseme === "aa" ? 1.08 : 1.02) * (0.98 + energy * 0.14);
    const strength = Math.min(1.15, weight * gain);
    visemes[viseme] = strength;
    for (const [key, value] of Object.entries(OCULUS_TO_ARKIT[viseme])) {
      arkit[key] = (arkit[key] ?? 0) + value * strength;
    }
    jawBoost += mouth.jawOpen * weight * (0.035 + energy * 0.055);
  }
  jawBoost *= 1 - Math.min(1, weights.PP ?? 0);

  // A voice without phoneme metadata still gets audible articulation. Timed
  // silence has zero energy and therefore remains at the neutral bind pose.
  if (allowAudioFallback && Object.keys(visemes).length === 0) {
    arkit.jawOpen = energy * 0.5;
    jawBoost = arkit.jawOpen;
  }
  return { visemes, arkit, jawBoost };
}
