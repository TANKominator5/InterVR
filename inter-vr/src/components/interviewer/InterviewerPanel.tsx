"use client";

import dynamic from "next/dynamic";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Volume2, Ear, Brain, CheckCircle2, Loader2 } from "lucide-react";
import type { SpeechFrame, InterviewerMood } from "@/hooks/useInterviewerSpeech";
import { DEFAULT_INTERVIEWER, INTERVIEWERS, type InterviewerId } from "@/lib/interviewer/profiles";

const InterviewerAvatar = dynamic(() => import("./InterviewerAvatar"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-white/60">Preparing interviewer…</div>,
});

class AvatarBoundary extends Component<{ children: ReactNode; onStatusChange?: Props["onAvatarStatusChange"] }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[InterviewerAvatar] Could not render human model", error, info.componentStack);
    this.props.onStatusChange?.("error");
  }
  render() {
    if (this.state.failed) return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-white/70">
        <p className="text-sm">The interviewer model could not load.</p>
        <button className="rounded-full border border-white/20 px-4 py-2 text-xs hover:bg-white/10" onClick={() => this.setState({ failed: false })}>Retry model</button>
      </div>
    );
    return this.props.children;
  }
}

interface Props {
  frameRef: { current: SpeechFrame };
  mood: InterviewerMood;
  interviewer?: InterviewerId;
  phaseLabel: string;
  engine: string;
  modelLoading: boolean;
  modelProgress: string;
  onPreloadVoice: () => void;
  voiceError?: string;
  onAvatarStatusChange?: (status: "loading" | "ready" | "error") => void;
}

const MOOD_META: Record<InterviewerMood, { icon: typeof Volume2; label: string }> = {
  speaking: { icon: Volume2, label: "Asking a question" },
  listening: { icon: Ear, label: "Listening to you" },
  thinking: { icon: Brain, label: "Considering your answer" },
  idle: { icon: CheckCircle2, label: "Ready when you are" },
};

export default function InterviewerPanel({
  frameRef,
  mood,
  interviewer = DEFAULT_INTERVIEWER,
  phaseLabel,
  engine,
  modelLoading,
  modelProgress,
  onPreloadVoice,
  voiceError,
  onAvatarStatusChange,
}: Props) {
  const meta = MOOD_META[mood] ?? MOOD_META.idle;
  const Icon = meta.icon;

  return (
    <div className="w-full bg-card/80 border border-border shadow-sm rounded-2xl overflow-hidden backdrop-blur">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${
                mood === "speaking" ? "bg-primary" : "bg-emerald-500"
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                mood === "speaking" ? "bg-primary" : "bg-emerald-500"
              }`}
            />
          </span>
          <span className="text-sm font-semibold tracking-tight">{INTERVIEWERS[interviewer].name} · Your interviewer</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted border border-border font-mono">
            {phaseLabel}
          </span>
        </div>
        <span className="hidden text-xs text-muted-foreground sm:inline" title={engine === "unrealspeech" ? "Unreal Speech API voice with audio-driven lip animation" : engine === "browser" ? "Browser fallback voice uses approximate lip timing" : "Speech is generated locally on your device"}>
          {engine === "unrealspeech" ? "Unreal Speech voice" : engine === "headtts" ? "Local fallback voice" : engine === "browser" ? "Browser fallback voice" : "Preparing voice"}
        </span>
      </div>

      <div className="relative h-[340px] sm:h-[380px]" style={{ background: "radial-gradient(ellipse at 40% 35%, #666d67 0%, #3a423e 45%, #232c29 100%)" }}>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-[12%] w-px bg-white/10" />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-[24%] w-px bg-white/5" />
        <AvatarBoundary key={`${interviewer}:${INTERVIEWERS[interviewer].modelUrl}`} onStatusChange={onAvatarStatusChange}>
          <InterviewerAvatar frameRef={frameRef} mood={mood} interviewer={interviewer} onStatusChange={onAvatarStatusChange} />
        </AvatarBoundary>
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/55 border border-white/10 backdrop-blur">
            <Icon className="w-4 h-4 text-white" />
            <span className="text-white text-xs font-medium">{meta.label}</span>
          </div>
        </div>
      </div>

      {voiceError && <p role="status" className="border-t border-border px-4 py-2 text-xs text-amber-500">{voiceError}</p>}
      {modelLoading ? (
        <div className="px-4 py-2.5 flex items-center gap-2 text-xs text-muted-foreground border-t border-border">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {modelProgress || "Preparing voice…"}
        </div>
      ) : engine !== "unrealspeech" ? (
        <button
          onClick={onPreloadVoice}
          className="w-full px-4 py-2 text-xs text-primary hover:bg-primary/5 border-t border-border transition-colors"
        >
          Retry dedicated voice →
        </button>
      ) : null}
    </div>
  );
}
