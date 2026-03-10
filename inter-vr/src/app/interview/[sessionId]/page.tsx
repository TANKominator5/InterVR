"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  Mic,
  MicOff,
  Square,
  Volume2,
  ChevronRight,
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
  XCircle,
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
  grading?: any;
}

interface GradingResult {
  accuracy_score: number;
  depth_score: number;
  communication_score: number;
  overall_score: number;
  feedback: string;
  needs_followup: boolean;
  followup_question?: string;
  is_complete: boolean;
}

export default function InterviewRoomPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const supabase = createClient();

  const [phase, setPhase] = useState<InterviewPhase>("loading");
  const [session, setSession] = useState<any>(null);
  const [userContext, setUserContext] = useState<any>(null);
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const antiCheatVideoRef = useRef<HTMLVideoElement>(null);
  const lastFlushedEventIndexRef = useRef(0);

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
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen();
      else if ((el as any).mozRequestFullScreen) await (el as any).mozRequestFullScreen();
      else if ((el as any).msRequestFullscreen) await (el as any).msRequestFullscreen();
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
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
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
  }, [phase, router]);

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
        window.AudioContext || (window as any).webkitAudioContext
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
        window.AudioContext || (window as any).webkitAudioContext
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

  // ── TTS: Speak text (browser-native, instant) ───────────────────────────────
  const speak = useCallback(async (text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) {
        resolve(); // Fallback: skip TTS if not supported
        return;
      }
      setAudioPlaying(true);
      window.speechSynthesis.cancel(); // Clear any pending speech

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;

      // Prefer a natural English voice
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find(
          (v) => v.name.includes("Google") && v.lang.startsWith("en"),
        ) || voices.find((v) => v.lang.startsWith("en"));
      if (preferred) utterance.voice = preferred;

      utterance.onend = () => {
        setAudioPlaying(false);
        resolve();
      };
      utterance.onerror = () => {
        setAudioPlaying(false);
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }, []);

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

  // ── Recording (audio) + Live Transcription (SpeechRecognition) ────────────
  const recognitionRef = useRef<any>(null);
  const liveTranscriptRef = useRef<string>("");

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      liveTranscriptRef.current = "";

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(1000);

      // Start browser SpeechRecognition for live transcription
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onresult = (event: any) => {
          let finalText = "";
          for (let i = 0; i < event.results.length; i++) {
            finalText += event.results[i][0].transcript;
          }
          liveTranscriptRef.current = finalText;
        };
        recognition.onerror = () => { }; // Silently handle
        recognition.start();
        recognitionRef.current = recognition;
      }

      setPhase("recording");
    } catch {
      setError("Microphone access denied. Please allow microphone access.");
      setPhase("error");
    }
  };

  const stopRecording = (): Promise<Blob> => {
    return new Promise((resolve) => {
      // Stop SpeechRecognition
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch { }
      }

      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        resolve(new Blob());
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        // NOTE: We only stop audio tracks here now, because we want the video feed to stay alive for anti-cheat
        streamRef.current?.getAudioTracks().forEach((t) => t.stop());
        resolve(blob);
      };
      recorder.stop();
    });
  };

  // ── Submit Answer ──────────────────────────────────────────────────────────
  const submitAnswer = async () => {
    setPhase("processing");

    // 1. Stop recording + get audio blob
    const audioBlob = await stopRecording();

    // Decode WebM blob to raw PCM float32 for Meyda analysis
    let voiceAnalysisData = { confidenceScore: null, details: {} };
    try {
      const audioCtx = new AudioContext();
      const encodedBuffer = await audioBlob.arrayBuffer();
      const decodedAudio = await audioCtx.decodeAudioData(encodedBuffer);
      const pcmData = decodedAudio.getChannelData(0); // mono float32
      await audioCtx.close();

      const voiceAnalysis = await fetch("/api/analyze-audio", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: pcmData.buffer,
      });
      voiceAnalysisData = await voiceAnalysis.json();
    } catch (e) {
      console.warn("Voice analysis failed:", e);
    }
    console.log(voiceAnalysisData);
    // 2. Get transcript — prefer browser SpeechRecognition (instant)
    let transcribedText = liveTranscriptRef.current.trim();

    // If browser STT failed, try AssemblyAI as fallback
    if (!transcribedText && audioBlob.size > 0) {
      try {
        const formData = new FormData();
        formData.append("audio", audioBlob, "answer.webm");
        const sttRes = await fetch("/api/interview/stt", {
          method: "POST",
          body: formData,
        });
        const sttData = await sttRes.json();
        if (sttData.transcript) transcribedText = sttData.transcript;
      } catch { }
    }

    if (!transcribedText) {
      setTranscript("[Could not transcribe audio]");
    } else {
      setTranscript(transcribedText);
    }

    const answerText = transcribedText || "[No answer detected]";

    // 3. Grade with Groq
    const questionToGrade = isFollowup
      ? { ...currentQuestion, question: followupText }
      : currentQuestion;

    const gradeRes = await fetch("/api/interview/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
      body: JSON.stringify({
        sessionId,
        questionIndex: currentQIndex,
        question: questionToGrade,
        answer: answerText,
        userContext,
      }),
    });
    const { grading: gradingResult } = await gradeRes.json();
    setGrading(gradingResult);
    setAnsweredCount((c) => c + 1);
    setCumulativeScore((s) => s + ((gradingResult?.overall_score || 0) * 10));
    setPhase("feedback");
  };

  // ── Next Question ──────────────────────────────────────────────────────────
  const proceedNext = async () => {
    // If grading says follow-up needed and we havent done one yet
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

    // Reset sandbox state
    setCodeAnalysis(null);
    setIsAnalyzingCode(false);
    setCodeCounterQuestion("");
    setIsCodeCounterActive(false);
    setSubmittedCode("");

    const nextIndex = currentQIndex + 1;

    if (nextIndex >= questions.length) {
      // Interview complete — generate report
      setPhase("speaking");
      await speak(
        "Excellent! That concludes our interview. Let me prepare your performance report now.",
      );
      setPhase("completed");
      generateReport();
      return;
    }

    setCurrentQIndex(nextIndex);
    setCurrentQuestion(questions[nextIndex]);
    setPhase("speaking");
    await speak(`Question ${nextIndex + 1}: ${questions[nextIndex].question}`);
    setPhase("listening");
  };

  // ── Generate Report ────────────────────────────────────────────────────────
  const generateReport = async () => {
    const res = await fetch("/api/interview/report", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
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
    if (data.reportId) setReportId(data.reportId);
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
          <p className="text-slate-500 text-lg font-medium">Loading interview session...</p>
        </div>
      </div>
    );

  if (phase === "error")
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500" />
          <p className="text-slate-900 text-xl font-bold">Something went wrong</p>
          <p className="text-slate-600">{error}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-4 px-6 py-3 bg-orange-500 rounded-xl text-white font-semibold shadow-sm hover:bg-orange-600 transition"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );

  if (phase === "completed")
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 text-center max-w-md px-4">
          <div className="w-24 h-24 rounded-full bg-[linear-gradient(to_bottom_right,var(--color-orange-400),var(--color-orange-600))] flex items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.3)]">
            <Trophy className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">
            Interview Complete!
          </h1>
          <p className="text-slate-600 font-medium">
            You answered {answeredCount} questions with an average score of{" "}
            <span className="text-orange-600 font-bold">{avgScore}%</span>
          </p>
          {reportId ? (
            <button
              onClick={() => router.push(`/report/${reportId}`)}
              className="mt-2 px-8 py-4 bg-[linear-gradient(to_right,var(--color-orange-400),var(--color-orange-600))] rounded-2xl text-white font-bold text-lg hover:opacity-90 transition shadow-md"
            >
              View Full Report →
            </button>
          ) : (
            <div className="flex items-center gap-2 text-slate-500 font-medium">
              <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
              Generating your report...
            </div>
          )}
          <button
            onClick={() => router.push("/dashboard")}
            className="text-slate-500 hover:text-slate-700 text-sm font-semibold transition"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar */}
      <div className="border-b border-slate-200 bg-white/80 backdrop-blur px-6 py-4 flex items-center justify-between shadow-sm relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[linear-gradient(to_bottom_right,var(--color-orange-400),var(--color-orange-600))] flex items-center justify-center shadow-sm">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-900">
            InterVR{" "}
            <span className="text-slate-500 font-normal text-sm">
              / Live Session
            </span>
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm text-slate-600 font-medium">
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
            <div className="flex items-center gap-1.5 text-emerald-600">
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
                ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                : violationCount === 1
                ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                : "text-red-400 border-red-500/30 bg-red-500/10"
            }`}>
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{violationCount}/{MAX_VIOLATIONS} violations</span>
            </div>
          )}

          {/* Fullscreen Re-enter Button */}
          {(phase === "speaking" || phase === "listening" || phase === "recording" || phase === "processing" || phase === "feedback" || phase === "followup") && (
            <button
              onClick={enterFullscreen}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-purple/20 border border-brand-purple/40 rounded-lg text-brand-purple text-xs font-semibold hover:bg-brand-purple/30 transition"
            >
              <Maximize className="w-3.5 h-3.5" />
              Fullscreen
            </button>
          )}

          {/* Anti-Cheat Overlay */}
          <div className="flex items-center gap-4 border-l border-slate-200 pl-4 ml-2">
            <div className="relative">
              <video
                ref={antiCheatVideoRef}
                autoPlay
                playsInline
                muted
                className="w-24 h-16 rounded-lg object-cover bg-slate-100 border border-slate-200 shadow-inner"
              />
              {!antiCheatStatus.isReady && webcamEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 rounded-lg">
                  <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1 w-32 border border-slate-200 bg-white/60 shadow-sm p-2 rounded relative overflow-hidden backdrop-blur-sm">
              {antiCheatStatus.isFlagged && (
                <div className="absolute inset-0 bg-red-500/10 animate-pulse pointer-events-none" />
              )}
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-slate-500">YAW</span>
                <span
                  className={
                    Math.abs(antiCheatStatus.yaw) > 15
                      ? "text-red-500 font-bold"
                      : "text-slate-700"
                  }
                >
                  {antiCheatStatus.yaw.toFixed(0)}°
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-slate-500">PITCH</span>
                <span
                  className={
                    Math.abs(antiCheatStatus.pitch) > 12
                      ? "text-red-500 font-bold"
                      : "text-slate-700"
                  }
                >
                  {antiCheatStatus.pitch.toFixed(0)}°
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono mt-0.5 pt-0.5 border-t border-slate-200">
                <span className="text-slate-500 flex items-center gap-1">
                  <Activity className="w-3 h-3" /> GAZE
                </span>
                {antiCheatStatus.isGazeOffCenter ? (
                  <AlertTriangle className="w-3 h-3 text-red-500 animate-pulse" />
                ) : (
                  <span className="text-emerald-600 font-semibold">OK</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-slate-200 z-10 relative">
        <div
          className="h-full bg-[linear-gradient(to_right,var(--color-orange-400),var(--color-orange-600))] transition-all duration-700"
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
              <div className="w-full bg-white/80 border border-slate-200 shadow-sm rounded-2xl p-6 space-y-3 backdrop-blur">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-orange-600">
                    {isFollowup ? "Follow-up" : `Question ${currentQIndex + 1}`}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-slate-100 rounded-full text-slate-600 font-medium border border-slate-200">
                    {currentQuestion.category}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-slate-100 rounded-full text-slate-600 font-medium border border-slate-200">
                    {currentQuestion.difficulty}
                  </span>
                </div>
                <p className="text-slate-900 text-lg font-bold leading-relaxed">
                  {isFollowup ? followupText : currentQuestion.question}
                </p>
              </div>

              {/* Live Browser Activity Log */}
              {browserAntiCheat.events.length > 0 && (
                <div className="w-full bg-white/60 border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2 bg-slate-50/50">
                    <Activity className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Activity Log</span>
                  </div>
                  <ul className="divide-y divide-slate-100 max-h-32 overflow-y-auto">
                    {[...browserAntiCheat.events].reverse().slice(0, 8).map((event, i) => (
                      <li key={i} className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${event.type === "tab_hidden" || event.type === "window_blur" ? "bg-red-500" :
                              event.type === "paste" ? "bg-orange-500" :
                                "bg-emerald-500"
                            }`} />
                          <span className="text-xs text-slate-600 font-medium">
                            {event.type === "tab_hidden" && "Tab switched away"}
                            {event.type === "tab_visible" && "Returned to tab"}
                            {event.type === "window_blur" && "Window lost focus"}
                            {event.type === "window_focus" && "Window focused"}
                            {event.type === "paste" && `Pasted text`}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono tabular-nums">
                          {new Date(event.timestamp).toLocaleTimeString("en-US", {
                            hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit"
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {phase === "speaking" && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex items-center gap-2 px-5 py-3 bg-orange-500/10 border border-orange-500/30 rounded-full shadow-sm">
                    <Volume2 className="w-5 h-5 text-orange-600 animate-pulse" />
                    <span className="text-orange-600 text-sm font-semibold">AI Interviewer is speaking...</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="w-1 bg-orange-500 rounded-full animate-bounce" style={{ height: `${8 + (i % 3) * 8}px`, animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                </div>
              )}

              {phase === "listening" && (
                <div className="flex flex-col items-center gap-5">
                  <p className="text-slate-600 font-medium text-sm">Your turn to answer. Press the button to start recording.</p>
                  <button onClick={startRecording} className="w-20 h-20 rounded-full bg-[linear-gradient(to_bottom_right,var(--color-orange-400),var(--color-orange-600))] flex items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.4)] hover:shadow-[0_0_60px_rgba(249,115,22,0.6)] transition-all hover:scale-105">
                    <Mic className="w-8 h-8 text-white" />
                  </button>
                  <p className="text-xs text-slate-500 font-medium">Press & hold, or click to start</p>
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
                  <button onClick={submitAnswer} className="flex items-center gap-2 px-8 py-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 font-semibold hover:bg-red-500/30 transition">
                    <Square className="w-4 h-4 fill-current" />
                    Stop & Submit
                  </button>
                </div>
              )}

              {phase === "processing" && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex items-center gap-3 px-6 py-3 bg-white border border-slate-200 shadow-sm rounded-xl">
                    <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                    <span className="text-slate-700 font-medium text-sm">Transcribing and grading your answer...</span>
                  </div>
                </div>
              )}

              {phase === "feedback" && grading && (
                <div className="w-full space-y-4">
                  {transcript && (
                    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
                      <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-bold">Your Answer (Transcribed)</p>
                      <p className="text-slate-700 text-sm font-medium leading-relaxed">{transcript}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    {[{ label: "Accuracy", value: grading.accuracy_score, color: "text-blue-500" }, { label: "Depth", value: grading.depth_score, color: "text-orange-500" }, { label: "Communication", value: grading.communication_score, color: "text-orange-600" }].map(({ label, value, color }) => (
                      <div key={label} className="bg-slate-50 border border-slate-200 shadow-sm rounded-xl p-4 text-center">
                        <div className={`text-2xl font-black ${color}`}>{value}<span className="text-sm text-slate-500">/10</span></div>
                        <div className="text-xs text-slate-600 font-semibold mt-1">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
                    <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider font-bold">AI Feedback</p>
                    <p className="text-slate-700 text-sm font-medium leading-relaxed">{grading.feedback}</p>
                  </div>
                  <button onClick={proceedNext} className="w-full flex items-center justify-center gap-2 py-4 bg-[linear-gradient(to_right,var(--color-orange-400),var(--color-orange-600))] shadow-md rounded-xl text-white font-bold hover:opacity-90 transition">
                    {currentQIndex + 1 >= questions.length ? "Finish Interview" : grading.needs_followup ? "Answer Follow-up" : "Next Question"}
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}

              {/* Code counter question banner */}
              {isCodeCounterActive && (
                <div className="bg-orange-500/10 border border-orange-500/40 rounded-xl p-4 text-sm text-orange-700">
                  <p className="font-bold mb-1">📣 Answer verbally:</p>
                  <p className="font-medium">{codeCounterQuestion}</p>
                </div>
              )}
            </div>
          </Panel>

          {/* RESIZE HANDLE */}
          <PanelResizeHandle className="w-1.5 bg-slate-200 hover:bg-orange-400/50 transition-colors cursor-col-resize relative z-20" />

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
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 max-w-3xl mx-auto w-full gap-8">
          {phase === "ready" && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mx-auto border border-orange-200 shadow-sm">
                <Brain className="w-10 h-10 text-orange-500" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Ready to Begin?</h2>
              <p className="text-slate-600 font-medium">
                {session?.topic} • {session?.difficulty} • {session?.duration}
              </p>
              <p className="text-slate-500 text-sm">
                {questions.length} questions prepared. The AI interviewer will
                speak each question aloud.
              </p>
              <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-sm">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  Clicking &quot;Start Interview&quot; will enter <strong>fullscreen mode</strong>.
                  Tab switching and minimizing are not allowed. 3 violations will terminate the session.
                </span>
              </div>
              <button
                onClick={startInterview}
                className="px-10 py-4 bg-[linear-gradient(to_right,var(--color-orange-400),var(--color-orange-600))] rounded-2xl text-white font-bold text-lg hover:opacity-90 transition shadow-md"
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

                <div className="w-full bg-white/80 border border-slate-200 shadow-sm rounded-2xl p-6 space-y-3 backdrop-blur">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-orange-600">
                      {isFollowup ? "Follow-up" : `Question ${currentQIndex + 1}`}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-slate-100 rounded-full text-slate-600 font-medium border border-slate-200">
                      {currentQuestion.category}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-slate-100 rounded-full text-slate-600 font-medium border border-slate-200">
                      {currentQuestion.difficulty}
                    </span>
                  </div>
                  <p className="text-slate-900 text-lg font-bold leading-relaxed">
                    {isFollowup ? followupText : currentQuestion.question}
                  </p>
                </div>

                {/* Live Browser Activity Log */}
                {browserAntiCheat.events.length > 0 && (
                  <div className="w-full bg-white/60 border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2 bg-slate-50/50">
                      <Activity className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Activity Log</span>
                    </div>
                    <ul className="divide-y divide-slate-100 max-h-32 overflow-y-auto">
                      {[...browserAntiCheat.events].reverse().slice(0, 8).map((event, i) => (
                        <li key={i} className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${event.type === "tab_hidden" || event.type === "window_blur" ? "bg-red-500" :
                                event.type === "paste" ? "bg-orange-500" :
                                  "bg-emerald-500"
                              }`} />
                            <span className="text-xs text-slate-600 font-medium">
                              {event.type === "tab_hidden" && "Tab switched away"}
                              {event.type === "tab_visible" && "Returned to tab"}
                              {event.type === "window_blur" && "Window lost focus"}
                              {event.type === "window_focus" && "Window focused"}
                              {event.type === "paste" && `Pasted text`}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono tabular-nums">
                            {new Date(event.timestamp).toLocaleTimeString("en-US", {
                              hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit"
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {phase === "speaking" && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2 px-5 py-3 bg-orange-500/10 border border-orange-500/30 rounded-full shadow-sm">
                      <Volume2 className="w-5 h-5 text-orange-600 animate-pulse" />
                      <span className="text-orange-600 text-sm font-semibold">
                        AI Interviewer is speaking...
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className="w-1 bg-orange-500 rounded-full animate-bounce"
                          style={{
                            height: `${8 + (i % 3) * 8}px`,
                            animationDelay: `${i * 0.1}s`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {phase === "listening" && (
                  <div className="flex flex-col items-center gap-5">
                    <p className="text-slate-600 font-medium text-sm">
                      Your turn to answer. Press the button to start recording.
                    </p>
                    <button
                      onClick={startRecording}
                      className="w-20 h-20 rounded-full bg-[linear-gradient(to_bottom_right,var(--color-orange-400),var(--color-orange-600))] flex items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.4)] hover:shadow-[0_0_60px_rgba(249,115,22,0.6)] transition-all hover:scale-105"
                    >
                      <Mic className="w-8 h-8 text-white" />
                    </button>
                    <p className="text-xs text-slate-500 font-medium">
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
                    <button
                      onClick={submitAnswer}
                      className="flex items-center gap-2 px-8 py-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 font-semibold hover:bg-red-500/30 transition"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      Stop & Submit
                    </button>
                  </div>
                )}

                {phase === "processing" && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-3 px-6 py-3 bg-white border border-slate-200 shadow-sm rounded-xl">
                      <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                      <span className="text-slate-700 font-medium text-sm">
                        Transcribing and grading your answer...
                      </span>
                    </div>
                  </div>
                )}

                {phase === "feedback" && grading && (
                  <div className="w-full space-y-4">
                    {transcript && (
                      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
                        <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-bold">
                          Your Answer (Transcribed)
                        </p>
                        <p className="text-slate-700 text-sm font-medium leading-relaxed">
                          {transcript}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Accuracy", value: grading.accuracy_score, color: "text-blue-500" },
                        { label: "Depth", value: grading.depth_score, color: "text-orange-500" },
                        { label: "Communication", value: grading.communication_score, color: "text-orange-600" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="bg-slate-50 border border-slate-200 shadow-sm rounded-xl p-4 text-center">
                          <div className={`text-2xl font-black ${color}`}>
                            {value}
                            <span className="text-sm text-slate-500">/10</span>
                          </div>
                          <div className="text-xs text-slate-600 font-semibold mt-1">{label}</div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
                      <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider font-bold">
                        AI Feedback
                      </p>
                      <p className="text-slate-700 text-sm font-medium leading-relaxed">
                        {grading.feedback}
                      </p>
                    </div>

                    <button
                      onClick={proceedNext}
                      className="w-full flex items-center justify-center gap-2 py-4 bg-[linear-gradient(to_right,var(--color-orange-400),var(--color-orange-600))] shadow-md rounded-xl text-white font-bold hover:opacity-90 transition"
                    >
                      {currentQIndex + 1 >= questions.length
                        ? "Finish Interview"
                        : grading.needs_followup
                          ? "Answer Follow-up"
                          : "Next Question"}
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
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
