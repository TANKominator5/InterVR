"use client";

import { useMemo, useRef, useState } from "react";
import InterviewerPanel from "@/components/interviewer/InterviewerPanel";
import { createSpeechFrame, useInterviewerSpeech, type InterviewerMood } from "@/hooks/useInterviewerSpeech";
import type { OculusViseme } from "@/lib/interviewer/viseme-map";

// Public asset/speech preview so facial controls can be checked without starting
// a monitored interview, signing in, or granting camera/microphone access.
export default function InterviewerPreviewPage() {
  const frame = useMemo(() => createSpeechFrame(), []);
  const speech = useInterviewerSpeech(frame);
  const [mood, setMood] = useState<InterviewerMood>("idle");
  const [text, setText] = useState("Welcome. Tell me about a project you are proud of, and how you solved its biggest challenge.");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  const speak = async () => {
    const current = ++generation.current;
    setBusy(true);
    setMood("speaking");
    try { await speech.speak(text); }
    finally {
      if (generation.current === current) {
        setBusy(false);
        setMood("listening");
      }
    }
  };
  const stop = () => {
    generation.current++;
    speech.cancel();
    setBusy(false);
    setMood("idle");
  };
  const pose = (viseme: OculusViseme) => {
    stop();
    frame.current.speaking = viseme !== "sil";
    frame.current.visemeWeights = viseme === "sil" ? {} : { [viseme]: 1 };
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Interviewer preview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Test the human model and speech without starting an interview.</p>
      </div>
      <InterviewerPanel frameRef={frame} mood={mood} phaseLabel={mood} engine={speech.engine}
        modelLoading={speech.loading} modelProgress={speech.progress} onPreloadVoice={() => void speech.preload()} />
      <label className="block text-sm font-medium">
        Preview question
        <textarea className="mt-2 min-h-24 w-full rounded-xl border border-border bg-card p-3" value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" onClick={() => void speak()} disabled={busy || !text.trim()}>Speak question</button>
        <button className="rounded-lg border border-border px-4 py-2 text-sm" onClick={stop}>Stop / neutral</button>
        <button className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50" disabled={speech.loading || speech.engine === "headtts"} onClick={() => void speech.preload()}>Load free local voice</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Facial checks:</span>
        {(["PP", "FF", "aa", "E", "O", "U"] as OculusViseme[]).map((viseme) => (
          <button key={viseme} className="rounded-md border border-border px-3 py-1.5" onClick={() => pose(viseme)}>{viseme}</button>
        ))}
      </div>
    </div>
  );
}
