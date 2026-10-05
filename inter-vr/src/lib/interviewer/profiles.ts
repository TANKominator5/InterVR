export type InterviewerId = "male" | "female";

export const DEFAULT_INTERVIEWER: InterviewerId = "male";

export const INTERVIEWERS = {
  male: {
    name: "Michael",
    label: "Male interviewer",
    modelUrl: "/models/interviewer.glb",
    portrait: "/models/interviewer-male-original.png",
    voice: "am_michael",
    outfitColor: "#293646",
    browserVoiceNames: /\b(male|David|Mark|Daniel|George|James|Alex|Michael|Guy)\b/i,
  },
  female: {
    name: "Bella",
    label: "Female interviewer",
    modelUrl: "/models/interviewer-female-photo.glb",
    portrait: "/models/interviewer-female-photo.png",
    voice: "af_bella",
    outfitColor: "#463343",
    browserVoiceNames: /\b(female|Samantha|Zira|Susan|Victoria|Karen|Moira|Hazel|Jenny|Aria|Bella)\b/i,
  },
} as const;

export function isInterviewerId(value: unknown): value is InterviewerId {
  return value === "male" || value === "female";
}

// Sessions created before interviewer selection keep the original default.
export function normalizeInterviewer(value: unknown): InterviewerId {
  return isInterviewerId(value) ? value : DEFAULT_INTERVIEWER;
}

export function selectBrowserVoice<T extends { name: string; lang: string }>(voices: T[], interviewer: InterviewerId): T | undefined {
  const english = voices.filter((voice) => voice.lang.startsWith("en"));
  return english.find((voice) => INTERVIEWERS[interviewer].browserVoiceNames.test(voice.name))
    ?? english.find((voice) => voice.name.includes("Google"))
    ?? english[0];
}
