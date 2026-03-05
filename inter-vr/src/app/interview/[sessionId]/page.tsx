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
} from "lucide-react";

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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
    };
    load();
  }, [sessionId]);

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
    // Preload voices (some browsers load them lazily)
    window.speechSynthesis?.getVoices();

    const q = questions[0];
    if (!q) return;
    setPhase("speaking");
    setCurrentQuestion(q);
    await speak(`Question 1: ${q.question}`);
    setPhase("listening");
  }, [questions, speak]);

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
        recognition.onerror = () => {}; // Silently handle
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
        } catch {}
      }

      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        resolve(new Blob());
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        streamRef.current?.getTracks().forEach((t) => t.stop());
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
      } catch {}
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
      headers: { "Content-Type": "application/json" },
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
    setCumulativeScore((s) => s + (gradingResult?.overall_score || 0));
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json();
    if (data.reportId) setReportId(data.reportId);
  };

  // ── UI ─────────────────────────────────────────────────────────────────────
  const progressPct =
    questions.length > 0 ? (currentQIndex / questions.length) * 100 : 0;
  const avgScore =
    answeredCount > 0 ? Math.round((cumulativeScore / answeredCount) * 10) : 0;

  if (phase === "loading")
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-brand-purple animate-spin" />
          <p className="text-slate-400 text-lg">Loading interview session...</p>
        </div>
      </div>
    );

  if (phase === "error")
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-400" />
          <p className="text-red-400 text-xl font-bold">Something went wrong</p>
          <p className="text-slate-500">{error}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-4 px-6 py-3 bg-brand-purple rounded-xl text-white font-semibold"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );

  if (phase === "completed")
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 text-center max-w-md px-4">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-brand-purple to-brand-neon flex items-center justify-center shadow-[0_0_40px_rgba(168,85,247,0.5)]">
            <Trophy className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white">
            Interview Complete!
          </h1>
          <p className="text-slate-400">
            You answered {answeredCount} questions with an average score of{" "}
            <span className="text-brand-neon font-bold">{avgScore}%</span>
          </p>
          {reportId ? (
            <button
              onClick={() => router.push(`/report/${reportId}`)}
              className="mt-2 px-8 py-4 bg-gradient-to-r from-brand-purple to-brand-neon rounded-2xl text-white font-bold text-lg hover:opacity-90 transition"
            >
              View Full Report →
            </button>
          ) : (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating your report...
            </div>
          )}
          <button
            onClick={() => router.push("/dashboard")}
            className="text-slate-500 hover:text-slate-300 text-sm transition"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      {/* Top Bar */}
      <div className="border-b border-slate-800/60 bg-slate-900/50 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-purple to-brand-neon flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white">
            InterVR{" "}
            <span className="text-slate-500 font-normal text-sm">
              / Live Session
            </span>
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm text-slate-400">
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
            <div className="flex items-center gap-1.5 text-brand-neon">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-bold">{avgScore}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-slate-800">
        <div
          className="h-full bg-gradient-to-r from-brand-purple to-brand-neon transition-all duration-700"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 max-w-3xl mx-auto w-full gap-8">
        {/* Question Card */}
        {phase === "ready" && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-brand-purple/20 flex items-center justify-center mx-auto border border-brand-purple/30">
              <Brain className="w-10 h-10 text-brand-purple" />
            </div>
            <h2 className="text-2xl font-bold text-white">Ready to Begin?</h2>
            <p className="text-slate-400">
              {session?.topic} • {session?.difficulty} • {session?.duration}
            </p>
            <p className="text-slate-400 text-sm">
              {questions.length} questions prepared. The AI interviewer will
              speak each question aloud.
            </p>
            <button
              onClick={startInterview}
              className="px-10 py-4 bg-gradient-to-r from-brand-purple to-brand-neon rounded-2xl text-white font-bold text-lg hover:opacity-90 transition shadow-[0_0_30px_rgba(168,85,247,0.4)]"
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
              {/* Question Display */}
              <div className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3 backdrop-blur">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-purple">
                    {isFollowup ? "Follow-up" : `Question ${currentQIndex + 1}`}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-slate-800 rounded-full text-slate-400">
                    {currentQuestion.category}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-slate-800 rounded-full text-slate-400">
                    {currentQuestion.difficulty}
                  </span>
                </div>
                <p className="text-white text-lg font-medium leading-relaxed">
                  {isFollowup ? followupText : currentQuestion.question}
                </p>
              </div>

              {/* AI Speaking Indicator */}
              {phase === "speaking" && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex items-center gap-2 px-5 py-3 bg-brand-purple/10 border border-brand-purple/30 rounded-full">
                    <Volume2 className="w-5 h-5 text-brand-purple animate-pulse" />
                    <span className="text-brand-purple text-sm font-medium">
                      AI Interviewer is speaking...
                    </span>
                  </div>
                  {/* Audio wave animation */}
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="w-1 bg-brand-purple rounded-full animate-bounce"
                        style={{
                          height: `${8 + (i % 3) * 8}px`,
                          animationDelay: `${i * 0.1}s`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Listening / Record Controls */}
              {phase === "listening" && (
                <div className="flex flex-col items-center gap-5">
                  <p className="text-slate-400 text-sm">
                    Your turn to answer. Press the button to start recording.
                  </p>
                  <button
                    onClick={startRecording}
                    className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-purple to-brand-neon flex items-center justify-center shadow-[0_0_40px_rgba(168,85,247,0.5)] hover:shadow-[0_0_60px_rgba(217,70,239,0.7)] transition-all hover:scale-105"
                  >
                    <Mic className="w-8 h-8 text-white" />
                  </button>
                  <p className="text-xs text-slate-600">
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
                  <div className="flex items-center gap-3 px-6 py-3 bg-slate-900 border border-slate-700 rounded-xl">
                    <Loader2 className="w-5 h-5 text-brand-purple animate-spin" />
                    <span className="text-slate-300 text-sm">
                      Transcribing and grading your answer...
                    </span>
                  </div>
                </div>
              )}

              {/* Feedback Panel */}
              {phase === "feedback" && grading && (
                <div className="w-full space-y-4">
                  {/* Transcript */}
                  {transcript && (
                    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                      <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-semibold">
                        Your Answer (Transcribed)
                      </p>
                      <p className="text-slate-300 text-sm leading-relaxed">
                        {transcript}
                      </p>
                    </div>
                  )}

                  {/* Scores */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      {
                        label: "Accuracy",
                        value: grading.accuracy_score,
                        color: "text-blue-400",
                      },
                      {
                        label: "Depth",
                        value: grading.depth_score,
                        color: "text-brand-purple",
                      },
                      {
                        label: "Communication",
                        value: grading.communication_score,
                        color: "text-brand-neon",
                      },
                    ].map(({ label, value, color }) => (
                      <div
                        key={label}
                        className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center"
                      >
                        <div className={`text-2xl font-extrabold ${color}`}>
                          {value}
                          <span className="text-sm text-slate-500">/10</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Feedback */}
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                    <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider font-semibold">
                      AI Feedback
                    </p>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      {grading.feedback}
                    </p>
                  </div>

                  <button
                    onClick={proceedNext}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-brand-purple to-brand-neon rounded-xl text-white font-bold hover:opacity-90 transition"
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
    </div>
  );
}
