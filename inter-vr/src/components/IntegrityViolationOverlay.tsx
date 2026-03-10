"use client";

import { ShieldAlert, XCircle, Loader2 } from "lucide-react";

interface IntegrityViolationOverlayProps {
  violationCount: number;
  maxViolations: number;
  onResume: () => void;
  isTerminated: boolean;
}

export default function IntegrityViolationOverlay({
  violationCount,
  maxViolations,
  onResume,
  isTerminated,
}: IntegrityViolationOverlayProps) {
  if (isTerminated) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex items-center justify-center">
        <div className="bg-slate-900 border border-red-500/40 rounded-3xl p-10 max-w-md w-full mx-4 text-center">
          <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-10 h-10 text-red-400" />
          </div>

          <h2 className="text-2xl font-extrabold text-white mb-2">
            Interview Terminated
          </h2>

          <p className="text-slate-400 text-sm mb-6">
            You exceeded the maximum number of integrity violations. Your
            progress has been saved.
          </p>

          <div className="flex items-center justify-center gap-2 mb-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="w-4 h-4 rounded-full bg-red-500 border-2 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]"
              />
            ))}
          </div>

          <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Redirecting to dashboard...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex items-center justify-center">
      <div className="bg-slate-900 border border-red-500/40 rounded-3xl p-10 max-w-md w-full mx-4 text-center shadow-[0_0_60px_rgba(239,68,68,0.2)]">
        {/* Pulsing red icon */}
        <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-6 animate-pulse">
          <ShieldAlert className="w-10 h-10 text-red-400" />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-extrabold text-white mb-2">
          Integrity Violation
        </h2>

        {/* Subtitle */}
        <p className="text-slate-400 text-sm mb-6">
          You left the interview screen. This has been recorded.
        </p>

        {/* Violation counter dots */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {Array.from({ length: maxViolations - 1 }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 ${
                i < violationCount
                  ? "bg-red-500 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]"
                  : "bg-slate-800 border-slate-700"
              }`}
            />
          ))}
        </div>

        {/* Warning text */}
        <p className="text-red-400 text-sm font-semibold mb-8">
          Warning {violationCount} of {maxViolations - 1} —{" "}
          {maxViolations - 1 - violationCount} remaining before termination
        </p>

        {/* Resume button */}
        <button
          onClick={onResume}
          className="w-full py-4 bg-gradient-to-r from-brand-purple to-brand-neon rounded-2xl text-white font-bold text-lg hover:opacity-90 transition shadow-[0_0_30px_rgba(168,85,247,0.4)]"
        >
          Re-enter Fullscreen &amp; Resume
        </button>

        <p className="text-slate-600 text-xs mt-4">
          The interview is paused until you return to fullscreen
        </p>
      </div>
    </div>
  );
}
