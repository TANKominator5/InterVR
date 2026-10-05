// Keep the dashboard's initial bundle light; load the renderer and its decoder
// once in the background, then share the GLTF cache with the interview room.
import { DEFAULT_INTERVIEWER, INTERVIEWERS, type InterviewerId } from "./profiles";

const pending = new Map<string, Promise<void>>();

export function preloadInterviewer(interviewer: InterviewerId = DEFAULT_INTERVIEWER) {
  if (typeof window === "undefined") return Promise.resolve();
  const url = INTERVIEWERS[interviewer].modelUrl;
  const existing = pending.get(url);
  if (existing) return existing;
  const loading = import("@/components/interviewer/InterviewerAvatar")
    .then(({ preloadInterviewerModel }) => { preloadInterviewerModel(interviewer); })
    .catch((error: unknown) => {
      pending.delete(url);
      console.warn("[InterviewerAvatar] Background preload failed", error);
    });
  pending.set(url, loading);
  return loading;
}
