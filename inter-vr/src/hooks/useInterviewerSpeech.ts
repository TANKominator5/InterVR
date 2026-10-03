"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  normalizeViseme,
  sampleVisemes,
  sampleVisemeWeights,
  type ProceduralMouthPose,
  type TimedViseme,
  NEUTRAL_MOUTH,
  wordsToTimedVisemes,
} from "@/lib/interviewer/viseme-map";

export type SpeechEngine = "headtts" | "browser" | "uninitialized";
export type InterviewerMood = "speaking" | "listening" | "thinking" | "idle";

export interface SpeechFrame {
  speaking: boolean;
  timeMs: number;
  mouth: ProceduralMouthPose;
  level: number; // 0..1 audio amplitude (fallback jaw drive)
  engine: SpeechEngine;
  visemeWeights: Record<string, number>;
}

// Shared mutable frame read by the R3F useFrame loop (no React re-render per frame).
export function createSpeechFrame(): { current: SpeechFrame } {
  return {
    current: {
      speaking: false,
      timeMs: 0,
      mouth: NEUTRAL_MOUTH,
      level: 0,
      engine: "uninitialized",
      visemeWeights: {},
    },
  };
}

interface HeadTTSMessageData {
  audio?: ArrayBuffer | null;
  audioEncoding?: string;
  words?: string[];
  wtimes?: number[];
  wdurations?: number[];
  visemes?: string[];
  vtimes?: number[];
  vdurations?: number[];
}

// Minimal typing for the CDN/npm HeadTTS class (we lazy-load it).
interface HeadTTSInstance {
  connect: () => Promise<void>;
  setup: (s: Record<string, unknown>) => void;
  synthesize: (s: Record<string, unknown>) => Promise<{ type: string; data: HeadTTSMessageData }[]>;
  onmessage: ((m: { type: string; data: HeadTTSMessageData }) => void) | null;
  clear?: () => void;
  ww?: Worker | null;
}

async function loadHeadTTS(): Promise<new (o: Record<string, unknown>) => HeadTTSInstance> {
  // Use dynamic CDN import so the ~100MB+ ONNX/transformers payload stays out
  // of the Next.js bundle. webpackIgnore equivalent: indirect import via Function.
  const CDN =
    "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.3/modules/headtts.mjs";
  const importer = new Function("u", "return import(u)") as (u: string) => Promise<Record<string, unknown>>;
  const mod = await importer(CDN);
  const Cls = (mod.HeadTTS ?? mod.default) as new (o: Record<string, unknown>) => HeadTTSInstance;
  if (!Cls) throw new Error("HeadTTS module did not export HeadTTS");
  return Cls;
}

function decodeWavToAudioBuffer(ctx: BaseAudioContext, wavBytes: ArrayBuffer): Promise<AudioBuffer> {
  // WAV from HeadTTS is 24kHz mono; AudioContext decodes it directly.
  const copy = wavBytes.slice(0);
  return ctx.decodeAudioData(copy);
}

export function useInterviewerSpeech(frameRef: { current: SpeechFrame }) {
  const [engine, setEngine] = useState<SpeechEngine>("uninitialized");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const headttsRef = useRef<HeadTTSInstance | null>(null);
  const pendingHeadttsRef = useRef<HeadTTSInstance | null>(null);
  const initializingRef = useRef(false);
  const mountedRef = useRef(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const cuesRef = useRef<TimedViseme[]>([]);
  const startStampRef = useRef(0);
  const speakingRef = useRef(false);
  const resolveRef = useRef<(() => void) | null>(null);
  const cancelledRef = useRef(false);

  const stopFrameLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const finishSpeak = useCallback(() => {
    speakingRef.current = false;
    frameRef.current.speaking = false;
    frameRef.current.mouth = NEUTRAL_MOUTH;
    frameRef.current.visemeWeights = {};
    frameRef.current.level = 0;
    stopFrameLoop();
    try { sourceRef.current?.stop(); } catch { /* already stopped */ }
    sourceRef.current = null;
    const r = resolveRef.current;
    resolveRef.current = null;
    if (r) r();
  }, [frameRef, stopFrameLoop]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    try {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    } catch { /* noop */ }
    try { headttsRef.current?.clear?.(); } catch { /* noop */ }
    finishSpeak();
  }, [finishSpeak]);

  // Preload HeadTTS model (WebGPU preferred, WASM fallback). Safe to call
  // from the interview "ready" screen; shows progress without blocking.
  const preload = useCallback(async () => {
    if (headttsRef.current || initializingRef.current) return;
    initializingRef.current = true;
    setLoading(true);
    setProgress("Loading local voice model (one-time download)…");
    try {
      if (!audioCtxRef.current) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AC();
      }
      const HeadTTS = await loadHeadTTS();
      const headtts = new HeadTTS({
        endpoints: ["webgpu", "wasm"],
        audioCtx: audioCtxRef.current,
        languages: ["en-us"],
        voices: ["af_bella"],
        workerModule:
          "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.3/modules/worker-tts.mjs",
        dictionaryURL:
          "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.3/dictionaries/",
      });
      pendingHeadttsRef.current = headtts;
      await headtts.connect();
      await headtts.setup({ voice: "af_bella", language: "en-us", speed: 1, audioEncoding: "wav" });
      // Stopping an utterance must not discard a voice that has just finished
      // loading. Only component unmount cancels initialization.
      if (!mountedRef.current) {
        headtts.ww?.terminate();
        return;
      }
      headttsRef.current = headtts;
      pendingHeadttsRef.current = null;
      setEngine("headtts");
      setReady(true);
      setProgress("");
      frameRef.current.engine = "headtts";
    } catch (e) {
      pendingHeadttsRef.current?.ww?.terminate();
      pendingHeadttsRef.current = null;
      if (!mountedRef.current) return;
      console.warn("[InterviewerSpeech] HeadTTS preload failed, using browser TTS:", e);
      setEngine("browser");
      setReady(true);
      setError("");
      setProgress("");
      frameRef.current.engine = "browser";
    } finally {
      initializingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [frameRef]);

  // Drive mouth from HeadTTS viseme cues using the audio clock.
  // Note: HeadTTS already decodes WAV to an AudioBuffer using the AudioContext
  // we pass in `preload`, so here we accept AudioBuffer directly and only
  // decode as a fallback (base64 / raw bytes / PCM).
  const playHeadTTSAudio = useCallback(
    async (msgs: { type: string; data: HeadTTSMessageData }[]): Promise<void> => {
      const audioMsg = msgs.find((m) => m.type === "audio");
      if (!audioMsg || !audioMsg.data.audio) throw new Error("No audio in HeadTTS response");
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AC();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") await ctx.resume();

      const rawAudio = audioMsg.data.audio as unknown;
      let buffer: AudioBuffer;
      if (typeof AudioBuffer !== "undefined" && rawAudio instanceof AudioBuffer) {
        buffer = rawAudio;
      } else if (rawAudio instanceof ArrayBuffer) {
        // Could be WAV bytes (wav encoding) — decode.
        try {
          buffer = await decodeWavToAudioBuffer(ctx, rawAudio.slice(0));
        } catch {
          // Fallback: treat as 24kHz mono PCM16.
          const view = new Int16Array(rawAudio);
          buffer = ctx.createBuffer(1, view.length, 24000);
          const ch = buffer.getChannelData(0);
          for (let i = 0; i < view.length; i++) ch[i] = view[i] / 32768;
        }
      } else if (typeof rawAudio === "string") {
        const bin = atob(rawAudio);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        buffer = await decodeWavToAudioBuffer(ctx, bytes.buffer);
      } else {
        throw new Error("Unsupported HeadTTS audio format");
      }

      const d = audioMsg.data;
      const cues: TimedViseme[] = (d.visemes ?? []).map((v, i) => ({
        viseme: normalizeViseme(v),
        startMs: d.vtimes?.[i] ?? 0,
        durationMs: Math.max(40, d.vdurations?.[i] ?? 80),
      }));
      cuesRef.current = cues;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      sourceRef.current = src;

      const levelBuf = new Uint8Array(analyser.frequencyBinCount);

      return new Promise<void>((resolve) => {
        resolveRef.current = resolve;
        speakingRef.current = true;
        frameRef.current.speaking = true;
        // The audio clock pauses with AudioContext suspension; wall-clock time
        // would let the face race ahead while the sound is paused.
        startStampRef.current = ctx.currentTime;

        const tick = () => {
          if (!speakingRef.current) return;
          const t = (ctx.currentTime - startStampRef.current) * 1000;
          frameRef.current.timeMs = t;
          frameRef.current.mouth = sampleVisemes(cuesRef.current, t);
          frameRef.current.visemeWeights = sampleVisemeWeights(cuesRef.current, t);
          try {
            analyser.getByteFrequencyData(levelBuf);
            let sum = 0;
            for (let i = 0; i < levelBuf.length; i++) sum += levelBuf[i];
            frameRef.current.level = Math.min(1, sum / levelBuf.length / 90);
          } catch { frameRef.current.level = 0; }

          if (t >= buffer.duration * 1000 + 120) {
            finishSpeak();
            return;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        src.onended = () => {
          // Let the trailing viseme settle briefly before resolving.
          setTimeout(() => { if (speakingRef.current) finishSpeak(); }, 120);
        };
        src.start();
        tick();
      });
    },
    [finishSpeak, frameRef]
  );

  const speakViaBrowser = useCallback(
    (text: string): Promise<void> => {
      return new Promise((resolve) => {
        if (!("speechSynthesis" in window)) {
          resolve();
          return;
        }
        cancelledRef.current = false;
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.rate = 0.95;
        utt.pitch = 1;
        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find((v) => v.name.includes("Google") && v.lang.startsWith("en")) ||
          voices.find((v) => v.lang.startsWith("en"));
        if (preferred) utt.voice = preferred;

        // Word-boundary fallback: build heuristic visemes as words arrive.
        const words = text.split(/\s+/).filter(Boolean);
        const estPerWord = Math.max(180, Math.min(420, (text.length / Math.max(1, words.length)) * 55));
        let wordIdx = 0;
        const start = performance.now();
        const approxCues: TimedViseme[] = wordsToTimedVisemes(
          words.map((w, i) => ({ word: w, startMs: i * estPerWord, durationMs: estPerWord }))
        );
        cuesRef.current = approxCues;
        speakingRef.current = true;
        frameRef.current.speaking = true;
        resolveRef.current = resolve;

        utt.onboundary = (e: SpeechSynthesisEvent) => {
          // e.charIndex lets us advance the word cursor for tighter sync.
          if (typeof e.charIndex === "number") {
            const upto = text.slice(0, e.charIndex).split(/\s+/).filter(Boolean).length;
            wordIdx = Math.min(words.length - 1, Math.max(0, upto));
            const elapsed = performance.now() - start;
            // Re-anchor remaining cues to the real clock.
            const remapped = approxCues.map((c, i) => {
              if (i < wordIdx) return c;
              if (i === wordIdx) return { ...c, startMs: elapsed, durationMs: Math.max(90, c.durationMs) };
              return { ...c, startMs: elapsed + (i - wordIdx) * estPerWord, durationMs: estPerWord };
            });
            cuesRef.current = remapped;
          }
        };

        const tick = () => {
          if (!speakingRef.current) return;
          const t = performance.now() - start;
          frameRef.current.timeMs = t;
          frameRef.current.mouth = sampleVisemes(cuesRef.current, t);
          frameRef.current.visemeWeights = sampleVisemeWeights(cuesRef.current, t);
          // No audio tap for speechSynthesis; use a gentle oscillation so the
          // jaw never looks frozen if boundary events are missing (Chrome-only).
          frameRef.current.level = 0.35 + 0.25 * Math.sin(t / 130);
          rafRef.current = requestAnimationFrame(tick);
        };

        utt.onend = () => finishSpeak();
        utt.onerror = () => finishSpeak();
        window.speechSynthesis.speak(utt);
        tick();
      });
    },
    [finishSpeak, frameRef]
  );

  const speak = useCallback(
    async (text: string): Promise<void> => {
      cancelledRef.current = false;
      const clean = text.trim(); // HeadTTS splits long input into sentence chunks.
      if (!clean) return;
      // Prefer HeadTTS timed visemes; fall back to browser TTS.
      if (headttsRef.current) {
        try {
          const msgs = await headttsRef.current.synthesize({ input: clean });
          if (cancelledRef.current) return;
          const audio = msgs.filter((m) => m.type === "audio");
          if (audio.length === 0) throw new Error("empty synthesis");
          // Long text is split into sentence chunks — play sequentially so the
          // mouth stays in sync across the whole question.
          for (const chunk of audio) {
            if (cancelledRef.current) return;
            await playHeadTTSAudio([chunk]);
          }
          return;
        } catch (e) {
          console.warn("[InterviewerSpeech] HeadTTS speak failed, falling back:", e);
        }
      } else if (engine === "uninitialized") {
        // Best-effort background upgrade for the next question.
        void preload();
      }
      await speakViaBrowser(clean);
    },
    [engine, playHeadTTSAudio, preload, speakViaBrowser]
  );

  useEffect(() => {
    frameRef.current.engine = engine;
  }, [engine, frameRef]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      try { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch { /* noop */ }
      stopFrameLoop();
      try { sourceRef.current?.stop(); } catch { /* noop */ }
      headttsRef.current?.ww?.terminate();
      pendingHeadttsRef.current?.ww?.terminate();
      try { audioCtxRef.current?.close(); } catch { /* noop */ }
    };
  }, [stopFrameLoop]);

  return { engine, ready, loading, progress, error, preload, speak, cancel, frameRef };
}
