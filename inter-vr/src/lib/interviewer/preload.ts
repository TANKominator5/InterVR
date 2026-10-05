// Keep the dashboard's initial bundle light; load the renderer and its decoder
// once in the background, then share the GLTF cache with the interview room.
let pending: Promise<void> | undefined;

export function preloadInterviewer() {
  if (typeof window === "undefined") return Promise.resolve();
  pending ??= import("@/components/interviewer/InterviewerAvatar")
    .then(({ preloadInterviewerModel }) => { preloadInterviewerModel(); })
    .catch((error: unknown) => {
      pending = undefined;
      console.warn("[InterviewerAvatar] Background preload failed", error);
    });
  return pending;
}
