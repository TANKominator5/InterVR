import { AlertCircle, ChevronRight } from "lucide-react";
import { continuationLabel, type GradingResult } from "../../lib/interview/grading";

interface Props {
  grading: GradingResult | null;
  transcript: string;
  error: string;
  isFollowup: boolean;
  isLastQuestion: boolean;
  onRetry: () => void;
  onRecordAgain: () => void;
  onContinue: () => void;
}

export default function AnswerFeedback({ grading, transcript, error, isFollowup, isLastQuestion, onRetry, onRecordAgain, onContinue }: Props) {
  return (
    <div className="w-full space-y-4">
      {transcript && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Your Answer (Transcribed)</p>
          <p className="text-sm font-medium leading-relaxed text-foreground">{transcript}</p>
        </div>
      )}
      {grading ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Accuracy", value: grading.accuracy_score, color: "text-blue-500" },
              { label: "Depth", value: grading.depth_score, color: "text-primary" },
              { label: "Communication", value: grading.communication_score, color: "text-orange-600" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-border bg-muted p-4 text-center shadow-sm">
                <div className={`text-2xl font-black ${color}`}>{value}<span className="text-sm text-muted-foreground">/10</span></div>
                <div className="mt-1 text-xs font-semibold text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">AI Feedback</p>
            <p className="text-sm font-medium leading-relaxed text-foreground">{grading.feedback}</p>
          </div>
        </>
      ) : (
        <div role="alert" className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="flex items-start gap-2 text-sm text-amber-500"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error || "Feedback was not received. Retry your answer or continue the interview."}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={onRetry} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold">{transcript ? "Retry grading" : "Retry transcription"}</button>
            <button onClick={onRecordAgain} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold">Record answer again</button>
          </div>
          <p className="text-xs text-muted-foreground">Continuing without feedback leaves this answer ungraded.</p>
        </div>
      )}
      <div className="sticky bottom-4 z-10 rounded-xl bg-card shadow-lg">
        <button onClick={onContinue} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-bold text-primary-foreground transition hover:opacity-90">
          {continuationLabel(grading, isFollowup, isLastQuestion)}<ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
