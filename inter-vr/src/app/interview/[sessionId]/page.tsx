"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import InterviewerPanel from "@/components/interviewer/InterviewerPanel";
import AnswerFeedback from "@/components/interviewer/AnswerFeedback";
import { parseGradingResult, type GradingResult } from "@/lib/interview/grading";
import { useAnswerRecording } from "@/hooks/useAnswerRecording";
import { useInterviewerSpeech, createSpeechFrame, type InterviewerMood } from "@/hooks/useInterviewerSpeech";
import {
  Mic,
  Square,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Brain,
  Clock,
  BarChart2,
  Trophy,
  Activity,
  AlertTriangle,
  ShieldAlert,
  Maximize,
} from "lucide-react";
import useVideoAntiCheat from "@/hooks/useVideoAntiCheat";
import useBrowserAntiCheat from "@/hooks/useBrowserAntiCheat";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { motion, AnimatePresence } from "framer-motion";
import CodeSandbox from "@/components/CodeSandbox";
import type { CodeAnalysis } from "@/components/CodeSandbox";
import IntegrityViolationOverlay from "@/components/IntegrityViolationOverlay";

type InterviewPhase =
  | "loading" // Fetching session
  | "ready" // Loaded, about to start
  | "speaking" // AI speaking question via TTS
  | "listening" // Waiting for user to record
  | "recording" // User is recording answer
  | "processing" // Transcribing + grading
  | "feedback" // Showing grading feedback
  | "followup" // AI asking a follow-up
  | "completed" // All questions done
  | "error";

interface Question {
  id: number;
  question: string;
  category: string;
  difficulty: string;
  expected_answer_outline: string;
  follow_up_hint: string;
  answer_transcript?: string;
  grading?: GradingResult;
}

interface InterviewSession {
  id: string;
  questions: Question[];
  topic: string;
  difficulty: string;
  duration: string;
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
  mozRequestFullScreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
};
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element;
  mozFullScreenElement?: Element;
  msFullscreenElement?: Element;
};
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

export default function InterviewRoomPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const supabase = createClient();

  const [phase, setPhase] = useState<InterviewPhase>("loading");
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [userContext, setUserContext] = useState<Record<string, unknown> | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [transcript, setTranscript] = useState("");
  const [grading, setGrading] = useState<GradingResult | null>(null);
  const [followupText, setFollowupText] = useState("");
  const [isFollowup, setIsFollowup] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [cumulativeScore, setCumulativeScore] = useState(0);
  const [error, setError] = useState("");
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState("");
  const [answerError, setAnswerError] = useState("");
  const [processingLabel, setProcessingLabel] = useState("");
  const [reportError, setReportError] = useState("");
  const recording = useAnswerRecording();
  const lastAnswerRef = useRef<{ audio: Blob; transcript: string } | null>(null);
  const submittingRef = useRef(false);
  const advancingRef = useRef(false);
  const answerAbortRef = useRef<AbortController | null>(null);

  // ── Fullscreen / Integrity Lock ────────────────────────────────────────────
  const [violationCount, setViolationCount] = useState(0);
  const [showViolationOverlay, setShowViolationOverlay] = useState(false);
  const [isInterviewTerminated, setIsInterviewTerminated] = useState(false);
  const [phaseBeforeViolation, setPhaseBeforeViolation] = useState<InterviewPhase | null>(null);
  const MAX_VIOLATIONS = 1; // Terminates immediately on 1st violation

  // ── Code Sandbox State ──────────────────────────────────────────────────
  const [codeAnalysis, setCodeAnalysis] = useState<CodeAnalysis | null>(null);
  const [isAnalyzingCode, setIsAnalyzingCode] = useState(false);
  const [codeCounterQuestion, setCodeCounterQuestion] = useState("");
  const [isCodeCounterActive, setIsCodeCounterActive] = useState(false);
  const [submittedCode, setSubmittedCode] = useState("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const antiCheatVideoRef = useRef<HTMLVideoElement>(null);
  const lastFlushedEventIndexRef = useRef(0);

  // ── 3D Interviewer ──────────────────────────────────────────────────────
  // Shared mutable speech frame: API/local/browser audio writes mouth poses here,
  // the R3F avatar reads them every frame without React re-renders.
  const interviewerFrameRef = useMemo(() => createSpeechFrame(), []);
  const interviewerSpeech = useInterviewerSpeech(interviewerFrameRef);
  const interviewerMood: InterviewerMood =
    phase === "speaking" || phase === "followup"
      ? "speaking"
      : phase === "listening" || phase === "recording"
        ? "listening"
        : phase === "processing"
          ? "thinking"
          : "idle";

  // ── Video Anti-Cheat ───────────────────────────────────────────────────────
  const [webcamEnabled, setWebcamEnabled] = useState(false);
  const [webcamError, setWebcamError] = useState("");

  const antiCheatStatus = useVideoAntiCheat(
    antiCheatVideoRef,
    webcamEnabled && phase !== "completed" && phase !== "error",
  );

  // ── Browser Anti-Cheat ──────────────────────────────────────────────────────
  const browserAntiCheat = useBrowserAntiCheat(
    phase !== "loading" &&
    phase !== "ready" &&
    phase !== "completed" &&
    phase !== "error"
  );

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (
      phase === "listening" ||
      phase === "recording" ||
      phase === "speaking"
    ) {
      timerRef.current = setInterval(
        () => setElapsedSeconds((s) => s + 1),
        1000,
      );
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ── Fullscreen Helpers ─────────────────────────────────────────────────────
  const enterFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement as FullscreenElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      else if (el.mozRequestFullScreen) await el.mozRequestFullScreen();
      else if (el.msRequestFullscreen) await el.msRequestFullscreen();
    } catch (err) {
      console.warn("[Fullscreen] Could not enter fullscreen:", err);
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch (err) {
      console.warn("[Fullscreen] Could not exit fullscreen:", err);
    }
  }, []);

  const isFullscreen = useCallback(() => {
    return !!(
      document.fullscreenElement ||
      (document as FullscreenDocument).webkitFullscreenElement ||
      (document as FullscreenDocument).mozFullScreenElement ||
      (document as FullscreenDocument).msFullscreenElement
    );
  }, []);

  // ── Handle Integrity Violation ─────────────────────────────────────────────
  const handleViolation = useCallback(() => {
    if (
      phase === "loading" ||
      phase === "ready" ||
      phase === "completed" ||
      phase === "error"
    ) return;

    // Instantly stop the AI interviewer's voice if they are currently speaking
    try {
      interviewerSpeech.cancel();
    } catch { /* noop */ }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setAudioPlaying(false);
    }

    setViolationCount(prev => {
      const newCount = prev + 1;

      if (newCount >= MAX_VIOLATIONS) {
        setIsInterviewTerminated(true);
        setShowViolationOverlay(true);
        setTimeout(() => {
          router.push("/dashboard");
        }, 4000);
      } else {
        setShowViolationOverlay(true);
      }

      return newCount;
    });
  }, [phase, router, interviewerSpeech]);

  // ── Handle Resume After Violation ─────────────────────────────────────────
  const handleResumeAfterViolation = useCallback(async () => {
    await enterFullscreen();
    setShowViolationOverlay(false);
  }, [enterFullscreen]);

  // ── Load Session ───────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Not authenticated");
        setPhase("error");
        return;
      }

      const { data: { session: authSession } } = await supabase.auth.getSession();
      setAuthToken(authSession?.access_token || "");

      const { data: sess } = await supabase
        .from("interview_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .single();

      if (!sess || !sess.questions?.length) {
        setError("Session not found or questions missing");
        setPhase("error");
        return;
      }

      const { data: ctx } = await supabase
        .from("users")
        .select(
          "full_name, institution_name, year_of_study, tech_stack, processed_resume",
        )
        .eq("id", user.id)
        .single();

      setSession(sess);
      setQuestions(sess.questions);
      setCurrentQuestion(sess.questions[0]);
      setUserContext(ctx);
      setPhase("ready");

      // Start the webcam for anti-cheat
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        });
        if (antiCheatVideoRef.current) {
          antiCheatVideoRef.current.srcObject = stream;
        }
        setWebcamEnabled(true);
      } catch (err) {
        console.warn("Could not start webcam for anti-cheat:", err);
        setWebcamError("Camera access required for anti-cheat.");
      }
    };
    load();
  }, [sessionId, supabase]);

  // ── Anti-Cheat Periodic Reporting ──────────────────────────────────────────
  useEffect(() => {
    // Only report when actively testing/interviewing
    if (
      phase === "loading" ||
      phase === "ready" ||
      phase === "completed" ||
      phase === "error"
    ) {
      return;
    }

    // Interval to sporadically report flagged state to server
    const interval = setInterval(() => {
      // If they are flagged (looking away or looking off center), POST to server
      if (antiCheatStatus.isFlagged && session?.id) {
        fetch("/api/video-anti-cheat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.id,
            timestamp: Date.now(),
            yaw: antiCheatStatus.yaw,
            pitch: antiCheatStatus.pitch,
            gazeX: antiCheatStatus.gazeX,
            gazeY: antiCheatStatus.gazeY,
            isFlagged: antiCheatStatus.isFlagged,
          }),
        }).catch((err) =>
          console.error("Failed to report anti-cheat event", err),
        );
      }
    }, 5000); // Check every 5s

    return () => clearInterval(interval);
  }, [antiCheatStatus, phase, session?.id]);

  // ── Browser Anti-Cheat Periodic Flush ─────────────────────────────────────
  useEffect(() => {
    if (
      phase === "loading" ||
      phase === "ready" ||
      phase === "completed" ||
      phase === "error"
    ) return;

    const interval = setInterval(async () => {
      const allEvents = browserAntiCheat.events;
      const newEvents = allEvents.slice(lastFlushedEventIndexRef.current);
      if (newEvents.length === 0 || !session?.id || !authToken) return;

      try {
        await fetch("/api/browser-anti-cheat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            sessionId: session.id,
            newEvents,
            summary: {
              tabSwitchCount: browserAntiCheat.tabSwitchCount,
              windowBlurCount: browserAntiCheat.windowBlurCount,
              pasteCount: browserAntiCheat.pasteCount,
              isFlagged: browserAntiCheat.isFlagged,
            },
          }),
        });
        lastFlushedEventIndexRef.current = allEvents.length;
      } catch (err) {
        console.error("[BrowserAntiCheat] Flush failed:", err);
      }
    }, 10_000); // flush every 10 seconds

    return () => clearInterval(interval);
  }, [browserAntiCheat, phase, session?.id, authToken]);

  // ── Browser Anti-Cheat Warning Chime ──────────────────────────────────────
  useEffect(() => {
    if (
      !browserAntiCheat.showWarning ||
      phase === "completed" ||
      phase === "error"
    ) {
      return;
    }

    let audioCtx: AudioContext | null = null;
    let osc: OscillatorNode | null = null;
    let gainNode: GainNode | null = null;
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    try {
      audioCtx = new (
        window.AudioContext || (window as AudioWindow).webkitAudioContext!
      )();
    } catch (e) {
      console.warn("Web Audio API not supported", e);
      return;
    }

    const playChime = () => {
      if (!active || !audioCtx) return;

      osc = audioCtx.createOscillator();
      gainNode = audioCtx.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(400, audioCtx.currentTime);
      osc.frequency.linearRampToValueAtTime(600, audioCtx.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        audioCtx.currentTime + 0.3,
      );

      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);

      timeoutId = setTimeout(playChime, 500);
    };

    if (audioCtx.state === "suspended") {
      audioCtx.resume().then(playChime);
    } else {
      playChime();
    }

    return () => {
      active = false;
      clearTimeout(timeoutId);
      if (osc) {
        try {
          osc.stop();
        } catch (e) { }
      }
      if (audioCtx) {
        audioCtx.close();
      }
    };
  }, [browserAntiCheat.isFlagged, phase]);

  // ── Anti-Cheat Chime Audio ─────────────────────────────────────────────────
  useEffect(() => {
    // Only play chime when actively flagged and not completed
    if (
      !antiCheatStatus.isFlagged ||
      phase === "completed" ||
      phase === "error"
    ) {
      return;
    }

    let audioCtx: AudioContext | null = null;
    let osc: OscillatorNode | null = null;
    let gainNode: GainNode | null = null;
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    try {
      audioCtx = new (
        window.AudioContext || (window as AudioWindow).webkitAudioContext!
      )();
    } catch (e) {
      console.warn("Web Audio API not supported", e);
      return;
    }

    const playChime = () => {
      if (!active || !audioCtx) return;

      osc = audioCtx.createOscillator();
      gainNode = audioCtx.createGain();

      // Warning tone parameters (two-tone dissonant alert)
      osc.type = "square";
      osc.frequency.setValueAtTime(400, audioCtx.currentTime); // start at 400Hz
      osc.frequency.linearRampToValueAtTime(600, audioCtx.currentTime + 0.1); // ramp to 600Hz

      // Envelope to make it a distinct "beep"
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.05); // low volume (0.1) so it doesn't blast
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        audioCtx.currentTime + 0.3,
      );

      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);

      // Repeat chime every 500ms while flagged
      timeoutId = setTimeout(playChime, 500);
    };

    // Ensure audio context is resumed (browsers require user interaction,
    // but the interview start button provides this)
    if (audioCtx.state === "suspended") {
      audioCtx.resume().then(playChime);
    } else {
      playChime();
    }

    return () => {
      active = false;
      clearTimeout(timeoutId);
      if (osc) {
        try {
          osc.stop();
        } catch (e) { }
      }
      if (audioCtx) {
        audioCtx.close();
      }
    };
  }, [antiCheatStatus.isFlagged, phase]);

  // ── Fullscreen Lock & Violation Detection ──────────────────────────────────
  useEffect(() => {
    if (
      phase === "loading" ||
      phase === "ready" ||
      phase === "completed" ||
      phase === "error" ||
      isInterviewTerminated
    ) return;

    const handleFullscreenChange = () => {
      if (!isFullscreen() && !showViolationOverlay) {
        handleViolation();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && !showViolationOverlay) {
        handleViolation();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (isCtrl && (e.key === "w" || e.key === "W")) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.key === "Tab" && isCtrl) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.key === "F11") {
        e.preventDefault();
      }
      if (e.key === "Escape" && isFullscreen()) {
        e.preventDefault();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [phase, isInterviewTerminated, showViolationOverlay, isFullscreen, handleViolation]);

  // ── TTS: dedicated API voice with visible fallback status ───────────────
  // The interviewer avatar reads mouth poses from interviewerFrameRef while
  // this promise is pending; it resolves when audio playback finishes.
  const speak = useCallback(
    async (text: string): Promise<void> => {
      setAudioPlaying(true);
      try {
        await interviewerSpeech.speak(text);
      } finally {
        setAudioPlaying(false);
      }
    },
    [interviewerSpeech],
  );

  // Check the configured API voice without downloading a local model.
  useEffect(() => {
    if (phase === "ready") {
      window.speechSynthesis?.getVoices();
      void interviewerSpeech.preload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Stop interviewer speech if the user leaves mid-question.
  useEffect(() => {
    if (phase === "completed" || phase === "error") {
      try {
        interviewerSpeech.cancel();
      } catch { /* noop */ }
      setAudioPlaying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Start Interview ────────────────────────────────────────────────────────
  const startInterview = useCallback(async () => {
    // Enter fullscreen when interview starts
    await enterFullscreen();

    // Preload voices (some browsers load them lazily)
    window.speechSynthesis?.getVoices();

    const q = questions[0];
    if (!q) return;
    setPhase("speaking");
    setCurrentQuestion(q);
    await speak(`Question 1: ${q.question}`);
    setPhase("listening");
  }, [questions, speak, enterFullscreen]);

  // ── Recording + live transcription ──────────────────────────────────────
  const startRecording = async () => {
    try {
      setAnswerError("");
      setGrading(null);
      setTranscript("");
      lastAnswerRef.current = null;
      await recording.start();
      setPhase("recording");
    } catch {
      setError("Microphone access denied. Please allow microphone access.");
      setPhase("error");
    }
  };

  // ── Submit Answer ──────────────────────────────────────────────────────────
  const submitAnswer = async (retry = false) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    const controller = new AbortController();
    answerAbortRef.current = controller;
    setAnswerError("");
    setGrading(null);
    setPhase("processing");
    try {
      setProcessingLabel("Finishing your recording…");
      const answer = retry ? lastAnswerRef.current : await recording.stop();
      if (!answer) throw new Error("No recorded answer is available. Please record again.");
      lastAnswerRef.current = answer;
      let answerText = answer.transcript.trim();

      // The live transcript is already available at Stop; skip decoding and
      // uploading unused PCM analysis before transcription or grading.
      if (!answerText) {
        if (!answer.audio.size) throw new Error("No audio was recorded. Please record again.");
        setProcessingLabel("Transcribing your recording…");
        const formData = new FormData();
        formData.append("audio", answer.audio, answer.audio.type.includes("mp4") ? "answer.mp4" : "answer.webm");
        const response = await fetch("/api/interview/stt", {
          method: "POST", body: formData,
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Transcription failed. Please retry.");
        answerText = typeof data.transcript === "string" ? data.transcript.trim() : "";
        if (!answerText) throw new Error("No speech was detected. Please record your answer again.");
        lastAnswerRef.current = { ...answer, transcript: answerText };
      }
      setTranscript(answerText);
      setProcessingLabel("Grading your answer…");

      // Refresh the token for long interviews rather than reusing an expired
      // token captured when the room was first opened.
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;
      if (!token) throw new Error("Your sign-in has expired. Please sign in again.");
      setAuthToken(token);
      const questionToGrade = isFollowup ? { ...currentQuestion, question: followupText } : currentQuestion;
      const response = await fetch("/api/interview/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId, questionIndex: currentQIndex, question: questionToGrade, answer: answerText, userContext }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(40_000)]),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Grading failed. Please retry.");
      const result = parseGradingResult(data.grading);
      if (controller.signal.aborted) return;
      setGrading(result);
      setAnsweredCount((count) => count + 1);
      setCumulativeScore((score) => score + result.overall_score * 10);
    } catch (error) {
      if (controller.signal.aborted) return;
      setAnswerError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "This request took too long. Your recording is saved; please retry.");
    } finally {
      submittingRef.current = false;
      if (!controller.signal.aborted) setPhase("feedback");
    }
  };

  useEffect(() => () => { answerAbortRef.current?.abort(); }, []);

  // ── Next Question ──────────────────────────────────────────────────────────
  const proceedNext = async () => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    setAnswerError("");
    lastAnswerRef.current = null;
    try {
      // Ask at most one follow-up per question, including the last question.
      if (grading?.needs_followup && grading.followup_question && !isFollowup) {
        setIsFollowup(true);
        setFollowupText(grading.followup_question);
        setGrading(null);
        setTranscript("");
        setPhase("speaking");
        await speak(`Follow-up: ${grading.followup_question}`);
        setPhase("listening");
        return;
      }

      setIsFollowup(false);
      setFollowupText("");
      setGrading(null);
      setTranscript("");
      setCodeAnalysis(null);
      setIsAnalyzingCode(false);
      setCodeCounterQuestion("");
      setIsCodeCounterActive(false);
      setSubmittedCode("");

      const nextIndex = currentQIndex + 1;
      if (nextIndex >= questions.length) {
        setPhase("speaking");
        await speak("Excellent! That concludes our interview. Let me prepare your performance report now.");
        setPhase("completed");
        void generateReport();
        return;
      }
      setCurrentQIndex(nextIndex);
      setCurrentQuestion(questions[nextIndex]);
      setPhase("speaking");
      await speak(`Question ${nextIndex + 1}: ${questions[nextIndex].question}`);
      setPhase("listening");
    } finally {
      advancingRef.current = false;
    }
  };

  // ── Generate Report ────────────────────────────────────────────────────────
  const generateReport = async () => {
    setReportError("");
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const res = await fetch("/api/interview/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authSession?.access_token || authToken}` },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({
          sessionId,
          browserAntiCheatSummary: {
            tabSwitchCount: browserAntiCheat.tabSwitchCount,
            windowBlurCount: browserAntiCheat.windowBlurCount,
            pasteCount: browserAntiCheat.pasteCount,
            isFlagged: browserAntiCheat.isFlagged,
            totalEvents: browserAntiCheat.events.length,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.reportId) throw new Error(data.error || "Could not generate your report.");
      setReportId(data.reportId);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Report generation failed. Please retry.");
    }
  };

  // ── Code Sandbox Handler ──────────────────────────────────────────────────
  const handleCodeSubmit = async (code: string, language: string) => {
    setIsAnalyzingCode(true);
    setSubmittedCode(code);

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token || "";

      const res = await fetch("/api/interview/analyze-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          questionIndex: currentQIndex,
          question: currentQuestion?.question,
          code,
          language,
          userContext,
          expectedAnswerOutline: currentQuestion?.expected_answer_outline,
        }),
      });

      const data = await res.json();
      setCodeAnalysis(data.analysis);

      // Blended score: if verbal grading also exists, blend code + verbal scores
      if (grading && data.analysis) {
        const blendedScore = Math.round(
          (grading.overall_score * 0.4) +
          (data.analysis.correctness_score * 0.4) +
          (data.analysis.quality_score * 0.2)
        );
        setCumulativeScore(prev =>
          prev - (grading.overall_score * 10) + (blendedScore * 10)
        );
      }

      // If AI generated a counter question, activate it
      if (data.analysis?.has_counter_question && data.analysis?.counter_question) {
        setCodeCounterQuestion(data.analysis.counter_question);
        setIsCodeCounterActive(true);
        // Also trigger the standard verbal follow-up flow so they can answer it
        setIsFollowup(true);
        setFollowupText(data.analysis.counter_question);
        setPhase("speaking");
        await speak(`Interesting approach. Here is a follow-up: ${data.analysis.counter_question}`);
        setPhase("listening");
      }
    } catch (err) {
      console.error("Code analysis failed:", err);
    } finally {
      setIsAnalyzingCode(false);
    }
  };

  // ── Language helper ────────────────────────────────────────────────────────
  function inferLanguageFromTopic(topic: string): string {
    const t = topic.toLowerCase();
    if (t.includes("python") || t.includes("django") || t.includes("flask"))
      return "python";
    if ((t.includes("java") && !t.includes("javascript")) || t.includes("spring"))
      return "java";
    if (t.includes("typescript") || t.includes("next") || t.includes("react"))
      return "typescript";
    if (t.includes("c++") || t.includes("cpp"))
      return "cpp";
    if (t.includes("go") || t.includes("golang"))
      return "go";
    return "javascript";
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  const isCodingQuestion = currentQuestion?.category === "coding";
  const progressPct =
    questions.length > 0 ? (currentQIndex / questions.length) * 100 : 0;
  const avgScore =
    answeredCount > 0 ? Math.round(cumulativeScore / answeredCount) : 0;

  if (phase === "loading")
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="text-muted-foreground text-lg font-medium">Loading interview session...</p>
        </div>
      </div>
    );

  if (phase === "error")
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-destructive" />
          <p className="text-foreground text-xl font-bold">Something went wrong</p>
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-4 px-6 py-3 bg-primary rounded-xl text-primary-foreground font-semibold shadow-sm hover:bg-primary/90 transition"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );

  if (phase === "completed")
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 text-center max-w-md px-4">
          <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.3)]">
            <Trophy className="w-12 h-12 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-extrabold text-foreground">
            Interview Complete!
          </h1>
          <p className="text-muted-foreground font-medium">
            You answered {answeredCount} questions with an average score of{" "}
            <span className="text-primary font-bold">{avgScore}%</span>
          </p>
          {reportId ? (
            <button
              onClick={() => router.push(`/report/${reportId}`)}
              className="mt-2 px-8 py-4 bg-primary rounded-2xl text-primary-foreground font-bold text-lg hover:opacity-90 transition shadow-md"
            >
              View Full Report →
            </button>
          ) : reportError ? (
            <div role="alert" className="space-y-3 text-sm">
              <p className="text-amber-500">{reportError}</p>
              <button onClick={() => void generateReport()} className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">Retry report</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground font-medium">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              Generating your report...
            </div>
          )}
          <button
            onClick={() => router.push("/dashboard")}
            className="text-muted-foreground hover:text-foreground text-sm font-semibold transition"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Bar */}
      <div className="border-b border-border bg-card/80 backdrop-blur px-6 py-4 flex items-center justify-between shadow-sm relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm">
            <Brain className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-foreground">
            InterVR{" "}
            <span className="text-muted-foreground font-normal text-sm">
              / Live Session
            </span>
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted-foreground font-medium">
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            <span className="font-mono">{formatTime(elapsedSeconds)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <BarChart2 className="w-4 h-4" />
            <span>
              Q {Math.min(currentQIndex + 1, questions.length)}/
              {questions.length}
            </span>
          </div>
          {answeredCount > 0 && (
            <div className="flex items-center gap-1.5 text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-bold">{avgScore}%</span>
            </div>
          )}

          {/* Browser Anti-Cheat Counter */}
          {(browserAntiCheat.tabSwitchCount > 0 || browserAntiCheat.pasteCount > 0) && (
            <div className="flex items-center gap-1.5 text-amber-400 text-xs font-mono">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>
                {[
                  browserAntiCheat.tabSwitchCount > 0 && `${browserAntiCheat.tabSwitchCount} switch${browserAntiCheat.tabSwitchCount !== 1 ? "es" : ""}`,
                  browserAntiCheat.pasteCount > 0 && `${browserAntiCheat.pasteCount} paste${browserAntiCheat.pasteCount !== 1 ? "s" : ""}`,
                ].filter(Boolean).join(" · ")}
              </span>
            </div>
          )}

          {/* Violation Counter Badge */}
          {(phase === "speaking" || phase === "listening" || phase === "recording" || phase === "processing" || phase === "feedback" || phase === "followup") && (
            <div className={`flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-lg border ${
              violationCount === 0
                ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
                : violationCount === 1
                ? "text-amber-500 border-amber-500/30 bg-amber-500/10"
                : "text-red-500 border-red-500/30 bg-red-500/10"
            }`}>
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{violationCount}/{MAX_VIOLATIONS} violations</span>
            </div>
          )}

          {/* Fullscreen Re-enter Button */}
          {(phase === "speaking" || phase === "listening" || phase === "recording" || phase === "processing" || phase === "feedback" || phase === "followup") && (
            <button
              onClick={enterFullscreen}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 border border-primary/40 rounded-lg text-primary text-xs font-semibold hover:bg-primary/30 transition"
            >
              <Maximize className="w-3.5 h-3.5" />
              Fullscreen
            </button>
          )}

          {/* Anti-Cheat Overlay */}
          <div className="flex items-center gap-4 border-l border-border pl-4 ml-2">
            <div className="relative">
              <video
                ref={antiCheatVideoRef}
                autoPlay
                playsInline
                muted
                className="w-24 h-16 rounded-lg object-cover bg-muted border border-border shadow-inner"
              />
              {!antiCheatStatus.isReady && webcamEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/80 rounded-lg">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1 w-32 border border-border bg-card/60 shadow-sm p-2 rounded relative overflow-hidden backdrop-blur-sm">
              {antiCheatStatus.isFlagged && (
                <div className="absolute inset-0 bg-red-500/10 animate-pulse pointer-events-none" />
              )}
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-muted-foreground">YAW</span>
                <span
                  className={
                    Math.abs(antiCheatStatus.yaw) > 15
                      ? "text-red-500 font-bold"
                      : "text-foreground"
                  }
                >
                  {antiCheatStatus.yaw.toFixed(0)}°
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-muted-foreground">PITCH</span>
                <span
                  className={
                    Math.abs(antiCheatStatus.pitch) > 12
                      ? "text-red-500 font-bold"
                      : "text-foreground"
                  }
                >
                  {antiCheatStatus.pitch.toFixed(0)}°
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono mt-0.5 pt-0.5 border-t border-border">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Activity className="w-3 h-3" /> GAZE
                </span>
                {antiCheatStatus.isGazeOffCenter ? (
                  <AlertTriangle className="w-3 h-3 text-red-500 animate-pulse" />
                ) : (
                  <span className="text-emerald-500 font-semibold">OK</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-muted z-10 relative">
        <div
          className="h-full bg-primary transition-all duration-700"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Main Content */}
      {isCodingQuestion && (phase === "speaking" || phase === "listening" || phase === "recording" || phase === "processing" || phase === "feedback" || phase === "followup") && currentQuestion ? (
        /* ── Side-by-side layout for coding questions ──────────────── */
        <PanelGroup orientation="horizontal" className="flex-1 flex min-h-0">
          {/* LEFT PANEL — Question + voice controls */}
          <Panel defaultSize="40%" minSize="30%">
            <div className="h-full overflow-y-auto p-6 flex flex-col gap-6">
              <InterviewerPanel
                frameRef={interviewerFrameRef}
                mood={interviewerMood}
                phaseLabel={phase}
                engine={interviewerSpeech.engine}
                modelLoading={interviewerSpeech.loading}
                modelProgress={interviewerSpeech.progress}
                voiceError={interviewerSpeech.error}
                onPreloadVoice={() => void interviewerSpeech.preload()}
              />
              {/* Browser Anti-Cheat Warning Banner */}
              {browserAntiCheat.showWarning && (
                <div className="w-full flex items-start gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-red-400 text-sm font-semibold">Integrity Warning</span>
                    <span className="text-red-400/80 text-xs">
                      {browserAntiCheat.tabSwitchCount > 0 && `Tab switched ${browserAntiCheat.tabSwitchCount}×. `}
                      {browserAntiCheat.pasteCount > 0 && `Paste detected ${browserAntiCheat.pasteCount}×. `}
                      This activity has been logged.
                    </span>
                  </div>
                </div>
              )}

              {/* Question Display */}
              <div className="w-full bg-card/80 border border-border shadow-sm rounded-2xl p-6 space-y-3 backdrop-blur">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    {isFollowup ? "Follow-up" : `Question ${currentQIndex + 1}`}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground font-medium border border-border">
                    {currentQuestion.category}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground font-medium border border-border">
                    {currentQuestion.difficulty}
                  </span>
                </div>
                <p className="text-foreground text-lg font-bold leading-relaxed">
                  {isFollowup ? followupText : currentQuestion.question}
                </p>
              </div>

              {/* Live Browser Activity Log */}
              {browserAntiCheat.events.length > 0 && (
                <div className="w-full bg-card/60 border border-border shadow-sm rounded-xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-border flex items-center gap-2 bg-muted/50">
                    <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity Log</span>
                  </div>
                  <ul className="divide-y divide-border max-h-32 overflow-y-auto">
                    {[...browserAntiCheat.events].reverse().slice(0, 8).map((event, i) => (
                      <li key={i} className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${event.type === "tab_hidden" || event.type === "window_blur" ? "bg-red-500" :
                              event.type === "paste" ? "bg-orange-500" :
                                "bg-emerald-500"
                            }`} />
                          <span className="text-xs text-muted-foreground font-medium">
                            {event.type === "tab_hidden" && "Tab switched away"}
                            {event.type === "tab_visible" && "Returned to tab"}
                            {event.type === "window_blur" && "Window lost focus"}
                            {event.type === "window_focus" && "Window focused"}
                            {event.type === "paste" && `Pasted text`}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                          {new Date(event.timestamp).toLocaleTimeString("en-US", {
                            hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit"
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {phase === "listening" && (
                <div className="flex flex-col items-center gap-5">
                  <p className="text-muted-foreground font-medium text-sm">Your turn to answer. Press the button to start recording.</p>
                  <button onClick={startRecording} className="w-20 h-20 rounded-full bg-primary flex items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.4)] hover:shadow-[0_0_60px_rgba(249,115,22,0.6)] transition-all hover:scale-105">
                    <Mic className="w-8 h-8 text-primary-foreground" />
                  </button>
                  <p className="text-xs text-muted-foreground font-medium">Press & hold, or click to start</p>
                </div>
              )}

              {phase === "recording" && (
                <div className="flex flex-col items-center gap-5">
                  <div className="flex items-center gap-2 text-red-400">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm font-medium">Recording... speak your answer</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                      <div key={i} className="w-1 bg-red-500 rounded-full animate-bounce" style={{ height: `${6 + Math.sin(i) * 10 + 10}px`, animationDelay: `${i * 0.08}s` }} />
                    ))}
                  </div>
                  {recording.liveTranscript && <p role="status" className="max-w-xl text-sm text-muted-foreground">{recording.liveTranscript}</p>}
                  <button onClick={() => void submitAnswer()} className="flex items-center gap-2 px-8 py-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 font-semibold hover:bg-red-500/30 transition">
                    <Square className="w-4 h-4 fill-current" />
                    Stop & Submit
                  </button>
                </div>
              )}

              {phase === "processing" && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex items-center gap-3 px-6 py-3 bg-card border border-border shadow-sm rounded-xl">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    <span role="status" className="text-foreground font-medium text-sm">{processingLabel}</span>
                  </div>
                </div>
              )}

              {phase === "feedback" && (
                <AnswerFeedback grading={grading} transcript={transcript} error={answerError}
                  isFollowup={isFollowup} isLastQuestion={currentQIndex + 1 >= questions.length}
                  onRetry={() => void submitAnswer(true)} onRecordAgain={() => setPhase("listening")}
                  onContinue={() => void proceedNext()} />
              )}

              {/* Code counter question banner */}
              {isCodeCounterActive && (
                <div className="bg-primary/10 border border-primary/40 rounded-xl p-4 text-sm text-primary">
                  <p className="font-bold mb-1">📣 Answer verbally:</p>
                  <p className="font-medium">{codeCounterQuestion}</p>
                </div>
              )}
            </div>
          </Panel>

          {/* RESIZE HANDLE */}
          <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/50 transition-colors cursor-col-resize relative z-20" />

          {/* RIGHT PANEL — Code Sandbox */}
          <Panel defaultSize="60%" minSize="40%">
            <AnimatePresence>
              <motion.div
                key="sandbox"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className="h-full"
              >
                <CodeSandbox
                  language={inferLanguageFromTopic(session?.topic || "")}
                  questionContext={currentQuestion?.question || ""}
                  onCodeSubmit={handleCodeSubmit}
                  isAnalyzing={isAnalyzingCode}
                  analysisResult={codeAnalysis}
                />
              </motion.div>
            </AnimatePresence>
          </Panel>
        </PanelGroup>
      ) : (
        /* ── Single-column layout for non-coding / ready / etc ─────── */
        <div className="flex-1 flex flex-col items-center px-4 py-6 max-w-4xl mx-auto w-full gap-5">
          {phase === "ready" && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto border border-primary/20 shadow-sm">
                <Brain className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Ready to Begin?</h2>
              <p className="text-muted-foreground font-medium">
                {session?.topic} • {session?.difficulty} • {session?.duration}
              </p>
              <p className="text-muted-foreground text-sm">
                {questions.length} questions prepared. The AI interviewer will
                speak each question aloud.
              </p>
              <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-500 text-sm">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  Clicking &quot;Start Interview&quot; will enter <strong>fullscreen mode</strong>.
                  Tab switching and minimizing are not allowed. 3 violations will terminate the session.
                </span>
              </div>
              <button
                onClick={startInterview}
                className="px-10 py-4 bg-primary rounded-2xl text-primary-foreground font-bold text-lg hover:bg-primary/90 transition shadow-md"
              >
                Start Interview
              </button>
            </div>
          )}

          {(phase === "speaking" ||
            phase === "listening" ||
            phase === "recording" ||
            phase === "processing" ||
            phase === "feedback" ||
            phase === "followup") &&
            currentQuestion && (
              <>
                <InterviewerPanel
                  frameRef={interviewerFrameRef}
                  mood={interviewerMood}
                  phaseLabel={phase}
                  engine={interviewerSpeech.engine}
                  modelLoading={interviewerSpeech.loading}
                  modelProgress={interviewerSpeech.progress}
                  voiceError={interviewerSpeech.error}
                  onPreloadVoice={() => void interviewerSpeech.preload()}
                />
                {/* Browser Anti-Cheat Warning Banner */}
                {browserAntiCheat.showWarning && (
                  <div className="w-full flex items-start gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-red-400 text-sm font-semibold">Integrity Warning</span>
                      <span className="text-red-400/80 text-xs">
                        {browserAntiCheat.tabSwitchCount > 0 && `Tab switched ${browserAntiCheat.tabSwitchCount}×. `}
                        {browserAntiCheat.pasteCount > 0 && `Paste detected ${browserAntiCheat.pasteCount}×. `}
                        This activity has been logged.
                      </span>
                    </div>
                  </div>
                )}

                <div className="w-full bg-card/80 border border-border shadow-sm rounded-2xl p-6 space-y-3 backdrop-blur">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">
                      {isFollowup ? "Follow-up" : `Question ${currentQIndex + 1}`}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground font-medium border border-border">
                      {currentQuestion.category}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground font-medium border border-border">
                      {currentQuestion.difficulty}
                    </span>
                  </div>
                  <p className="text-foreground text-lg font-bold leading-relaxed">
                    {isFollowup ? followupText : currentQuestion.question}
                  </p>
                </div>

                {/* Live Browser Activity Log */}
                {browserAntiCheat.events.length > 0 && (
                  <div className="w-full bg-card/60 border border-border shadow-sm rounded-xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-border flex items-center gap-2 bg-muted/50">
                      <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity Log</span>
                    </div>
                    <ul className="divide-y divide-border max-h-32 overflow-y-auto">
                      {[...browserAntiCheat.events].reverse().slice(0, 8).map((event, i) => (
                        <li key={i} className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${event.type === "tab_hidden" || event.type === "window_blur" ? "bg-red-500" :
                                event.type === "paste" ? "bg-orange-500" :
                                  "bg-emerald-500"
                              }`} />
                            <span className="text-xs text-muted-foreground font-medium">
                              {event.type === "tab_hidden" && "Tab switched away"}
                              {event.type === "tab_visible" && "Returned to tab"}
                              {event.type === "window_blur" && "Window lost focus"}
                              {event.type === "window_focus" && "Window focused"}
                              {event.type === "paste" && `Pasted text`}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                            {new Date(event.timestamp).toLocaleTimeString("en-US", {
                              hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit"
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {phase === "listening" && (
                  <div className="flex flex-col items-center gap-5">
                    <p className="text-muted-foreground font-medium text-sm">
                      Your turn to answer. Press the button to start recording.
                    </p>
                    <button
                      onClick={startRecording}
                      className="w-20 h-20 rounded-full bg-primary flex items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.4)] hover:shadow-[0_0_60px_rgba(249,115,22,0.6)] transition-all hover:scale-105"
                    >
                      <Mic className="w-8 h-8 text-primary-foreground" />
                    </button>
                    <p className="text-xs text-muted-foreground font-medium">
                      Press & hold, or click to start
                    </p>
                  </div>
                )}

                {phase === "recording" && (
                  <div className="flex flex-col items-center gap-5">
                    <div className="flex items-center gap-2 text-red-400">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-sm font-medium">
                        Recording... speak your answer
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <div
                          key={i}
                          className="w-1 bg-red-500 rounded-full animate-bounce"
                          style={{
                            height: `${6 + Math.sin(i) * 10 + 10}px`,
                            animationDelay: `${i * 0.08}s`,
                          }}
                        />
                      ))}
                    </div>
                    {recording.liveTranscript && <p role="status" className="max-w-xl text-sm text-muted-foreground">{recording.liveTranscript}</p>}
                    <button
                      onClick={() => void submitAnswer()}
                      className="flex items-center gap-2 px-8 py-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 font-semibold hover:bg-red-500/30 transition"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      Stop & Submit
                    </button>
                  </div>
                )}

                {phase === "processing" && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-3 px-6 py-3 bg-card border border-border shadow-sm rounded-xl">
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      <span role="status" className="text-foreground font-medium text-sm">
                        {processingLabel}
                      </span>
                    </div>
                  </div>
                )}

                {phase === "feedback" && (
                  <AnswerFeedback grading={grading} transcript={transcript} error={answerError}
                    isFollowup={isFollowup} isLastQuestion={currentQIndex + 1 >= questions.length}
                    onRetry={() => void submitAnswer(true)} onRecordAgain={() => setPhase("listening")}
                    onContinue={() => void proceedNext()} />
                )}
              </>
            )}
        </div>
      )}
      {/* Integrity Violation Overlay */}
      {showViolationOverlay && (
        <IntegrityViolationOverlay
          violationCount={violationCount}
          maxViolations={MAX_VIOLATIONS}
          onResume={handleResumeAfterViolation}
          isTerminated={isInterviewTerminated}
        />
      )}
    </div>
  );
}
