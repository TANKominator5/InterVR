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
import { approximateSpeechCues, estimateWordTimings, splitSpeechText } from "@/lib/interviewer/speech-timing";
import { DEFAULT_INTERVIEWER, INTERVIEWERS, selectBrowserVoice, type InterviewerId } from "@/lib/interviewer/profiles";

export type SpeechEngine = "unrealspeech" | "headtts" | "browser" | "uninitialized";
export type InterviewerMood = "speaking" | "listening" | "thinking" | "idle";

export interface SpeechFrame {
  speaking: boolean;
  timeMs: number;
  mouth: ProceduralMouthPose;
  level: number; // 0..1 audio amplitude (fallback jaw drive)
  engine: SpeechEngine;
  visemeWeights: Record<string, number>;
  hasVisemeTimeline: boolean;
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
      hasVisemeTimeline: false,
    },
  };
}

interface HeadTTSMessageData {
  audio?: ArrayBuffer | AudioBuffer | string | null;
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

export function useInterviewerSpeech(frameRef: { current: SpeechFrame }, interviewer: InterviewerId = DEFAULT_INTERVIEWER) {
  const voice = INTERVIEWERS[interviewer].voice;
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
  const apiAvailableRef = useRef<boolean | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const browserWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopFrameLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const finishSpeak = useCallback(() => {
    if (browserWatchdogRef.current) clearTimeout(browserWatchdogRef.current);
    browserWatchdogRef.current = null;
    speakingRef.current = false;
    frameRef.current.speaking = false;
    frameRef.current.mouth = NEUTRAL_MOUTH;
    frameRef.current.visemeWeights = {};
    frameRef.current.hasVisemeTimeline = false;
    frameRef.current.level = 0;
    stopFrameLoop();
    try { sourceRef.current?.stop(); } catch { /* already stopped */ }
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    sourceRef.current = null;
    const r = resolveRef.current;
    resolveRef.current = null;
    if (r) r();
  }, [frameRef, stopFrameLoop]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    generationRef.current++;
    requestAbortRef.current?.abort();
    try {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    } catch { /* noop */ }
    try { headttsRef.current?.clear?.(); } catch { /* noop */ }
    finishSpeak();
  }, [finishSpeak]);

  // Preload HeadTTS model (WebGPU preferred, WASM fallback). Safe to call
  // from the interview "ready" screen; shows progress without blocking.
  const preloadLocalVoice = useCallback(async () => {
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
        voices: [INTERVIEWERS.male.voice, INTERVIEWERS.female.voice],
        workerModule:
          "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.3/modules/worker-tts.mjs",
        dictionaryURL:
          "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.3/dictionaries/",
      });
      pendingHeadttsRef.current = headtts;
      await headtts.connect();
      await headtts.setup({ voice, language: "en-us", speed: 1, audioEncoding: "wav" });
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
      setError("Local voice could not load. Using the browser voice.");
      setProgress("");
      frameRef.current.engine = "browser";
    } finally {
      initializingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [frameRef, voice]);

  // Prepare the configured server voice without downloading a large local
  // model. Local HeadTTS remains an optional, explicitly loaded alternative.
  const preload = useCallback(async () => {
    setLoading(true);
    setProgress("Checking dedicated voice…");
    try {
      const response = await fetch("/api/interview/tts", { cache: "no-store", signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error("Could not check the dedicated voice service.");
      const status = await response.json();
      apiAvailableRef.current = status.configured === true;
      if (!mountedRef.current) return;
      if (apiAvailableRef.current) {
        setEngine("unrealspeech");
        setError("");
      } else {
        setEngine(headttsRef.current ? "headtts" : "browser");
        setError("Dedicated voice is unavailable: UNREAL_SPEECH_API_KEY is not configured.");
      }
      setReady(true);
    } catch {
      // An unavailable status check must not permanently disable POST attempts.
      apiAvailableRef.current = null;
      if (mountedRef.current) setError("Could not check dedicated voice. It will be retried when speaking.");
    } finally {
      if (mountedRef.current) { setLoading(false); setProgress(""); }
    }
  }, []);

  // Drive mouth from HeadTTS viseme cues using the audio clock.
  // Note: HeadTTS already decodes WAV to an AudioBuffer using the AudioContext
  // we pass in `preload`, so here we accept AudioBuffer directly and only
  // decode as a fallback (base64 / raw bytes / PCM).
  const playHeadTTSAudio = useCallback(
    async (msgs: { type: string; data: HeadTTSMessageData }[], approximateText?: string): Promise<void> => {
      const generation = generationRef.current;
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
          if (audioMsg.data.audioEncoding === "mp3") throw new Error("Could not decode the dedicated voice audio.");
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
      if (generation !== generationRef.current) return;

      const d = audioMsg.data;
      const cues: TimedViseme[] = (d.visemes ?? []).map((v, i) => ({
        viseme: normalizeViseme(v),
        startMs: d.vtimes?.[i] ?? 0,
        durationMs: Math.max(1, d.vdurations?.[i] ?? 80),
      }));
      cuesRef.current = cues.length ? cues : approximateText ? approximateSpeechCues(approximateText, buffer.duration * 1000) : wordsToTimedVisemes((d.words ?? []).map((word, i) => ({
        word, startMs: d.wtimes?.[i] ?? 0, durationMs: d.wdurations?.[i] ?? 250,
      })));
      frameRef.current.hasVisemeTimeline = cuesRef.current.length > 0;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      sourceRef.current = src;

      const levelBuf = new Float32Array(analyser.fftSize);

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
          try {
            // RMS follows syllable energy directly rather than averaging it
            // across mostly empty frequency bins.
            analyser.getFloatTimeDomainData(levelBuf);
            let sum = 0;
            for (let i = 0; i < levelBuf.length; i++) sum += levelBuf[i] * levelBuf[i];
            frameRef.current.level = Math.min(1, Math.sqrt(sum / levelBuf.length) * 5);
          } catch { frameRef.current.level = 0; }
          // /stream supplies audio, not phoneme timestamps. Scale approximate
          // cues to the decoded duration and let actual silence close the lips.
          const silent = approximateText && frameRef.current.level < 0.025;
          frameRef.current.mouth = silent ? NEUTRAL_MOUTH : sampleVisemes(cuesRef.current, t);
          frameRef.current.visemeWeights = silent ? {} : sampleVisemeWeights(cuesRef.current, t);

          if (t >= buffer.duration * 1000 + 120) {
            finishSpeak();
            return;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        src.onended = () => {
          // Let the trailing viseme settle briefly before resolving.
          setTimeout(() => { if (sourceRef.current === src && speakingRef.current) finishSpeak(); }, 120);
        };
        src.start();
        tick();
      });
    },
    [finishSpeak, frameRef]
  );

  const speakViaBrowser = useCallback(
    (text: string): Promise<void> => {
      const generation = generationRef.current;
      return new Promise((resolve) => {
        if (!("speechSynthesis" in window)) {
          resolve();
          return;
        }
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.rate = 0.95;
        utt.pitch = 1;
        const voices = window.speechSynthesis.getVoices();
        const preferred = selectBrowserVoice(voices, interviewer);
        if (preferred) utt.voice = preferred;

        // Word-boundary fallback: build heuristic visemes as words arrive.
        let start = 0;
        let lastBoundary = -1;
        const timedWords = estimateWordTimings(text);
        cuesRef.current = wordsToTimedVisemes(timedWords);
        frameRef.current.hasVisemeTimeline = true;
        resolveRef.current = resolve;

        utt.onboundary = (e: SpeechSynthesisEvent) => {
          // e.charIndex lets us advance the word cursor for tighter sync.
          if (generation === generationRef.current && start && (!e.name || e.name === "word") && typeof e.charIndex === "number") {
            const wordIdx = Math.max(0, timedWords.findIndex((word) => e.charIndex >= word.charIndex && e.charIndex < word.charIndex + word.word.length));
            if (wordIdx <= lastBoundary) return;
            lastBoundary = wordIdx;
            const elapsed = performance.now() - start;
            // Rebuild sub-word cues, anchored to this actual spoken word.
            cuesRef.current = wordsToTimedVisemes(timedWords.slice(wordIdx).map((word) => ({
              ...word, startMs: elapsed + word.startMs - timedWords[wordIdx].startMs,
            })));
          }
        };

        const tick = () => {
          if (!speakingRef.current) return;
          const t = performance.now() - start;
          frameRef.current.timeMs = t;
          frameRef.current.mouth = sampleVisemes(cuesRef.current, t);
          frameRef.current.visemeWeights = sampleVisemeWeights(cuesRef.current, t);
          // Use the changing phonetic pose as approximate syllable energy when
          // the browser cannot expose its speech audio to an analyser.
          frameRef.current.level = Math.min(1, frameRef.current.mouth.jawOpen * 1.3);
          rafRef.current = requestAnimationFrame(tick);
        };

        utt.onend = () => { if (generation === generationRef.current) finishSpeak(); };
        utt.onerror = () => { if (generation === generationRef.current) finishSpeak(); };
        utt.onstart = () => {
          if (generation !== generationRef.current || cancelledRef.current) return;
          start = performance.now();
          speakingRef.current = true;
          frameRef.current.speaking = true;
          tick();
        };
        // Some browser voices never emit onend, particularly for long text.
        // A bounded watchdog prevents speech from trapping the interview.
        const expectedMs = timedWords.reduce((sum, word) => sum + word.durationMs, 0);
        browserWatchdogRef.current = setTimeout(() => {
          utt.onend = null;
          utt.onerror = null;
          window.speechSynthesis.cancel();
          finishSpeak();
        }, Math.max(15_000, expectedMs * 2 + 5_000));
        window.speechSynthesis.speak(utt);
      });
    },
    [finishSpeak, frameRef, interviewer]
  );

  const speak = useCallback(
    async (text: string): Promise<void> => {
      cancel();
      cancelledRef.current = false;
      const generation = generationRef.current;
      const clean = text.trim(); // HeadTTS splits long input into sentence chunks.
      if (!clean) return;
      setError("");
      // The dedicated API is the primary voice. Use the same WebAudio playback
      // path as HeadTTS so the avatar still follows audio energy and its clock.
      if (apiAvailableRef.current !== false) {
        let playedChunks = 0;
        const chunks = splitSpeechText(clean);
        try {
          for (const chunk of chunks) {
            const controller = new AbortController();
            requestAbortRef.current = controller;
            const response = await fetch("/api/interview/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: chunk, interviewer }),
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
            });
            if (!response.ok) {
              const data = await response.json().catch(() => ({}));
              throw new Error(data.error || `Dedicated voice failed (${response.status}).`);
            }
            const audio = await response.arrayBuffer();
            if (generation !== generationRef.current) return;
            setEngine("unrealspeech");
            frameRef.current.engine = "unrealspeech";
            await playHeadTTSAudio([{ type: "audio", data: { audio, audioEncoding: "mp3" } }], chunk);
            if (generation !== generationRef.current) return;
            playedChunks++;
          }
          return;
        } catch (error) {
          if (generation !== generationRef.current) return;
          const reason = error instanceof Error ? error.message : "Dedicated voice failed.";
          console.warn("[InterviewerSpeech] Dedicated voice fallback:", reason);
          setError(`${reason} Using ${headttsRef.current ? "local" : "browser"} voice instead.`);
          // Do not repeat chunks that were already spoken successfully.
          text = chunks.slice(playedChunks).join(" ");
        }
      } else {
        setError("Dedicated voice is unavailable: UNREAL_SPEECH_API_KEY is not configured. Using fallback voice.");
      }
      if (headttsRef.current) {
        try {
          await headttsRef.current.setup({ voice, language: "en-us", speed: 1, audioEncoding: "wav" });
          if (generation !== generationRef.current) return;
          const msgs = await headttsRef.current.synthesize({ input: text.trim() });
          if (generation !== generationRef.current) return;
          const audio = msgs.filter((m) => m.type === "audio");
          if (audio.length === 0) throw new Error("empty synthesis");
          // Long text is split into sentence chunks — play sequentially so the
          // mouth stays in sync across the whole question.
          for (const chunk of audio) {
            if (generation !== generationRef.current) return;
            setEngine("headtts");
            frameRef.current.engine = "headtts";
            await playHeadTTSAudio([chunk]);
          }
          return;
        } catch (e) {
          console.warn("[InterviewerSpeech] HeadTTS speak failed, falling back:", e);
        }
      }
      if (generation !== generationRef.current) return;
      setEngine("browser");
      frameRef.current.engine = "browser";
      await speakViaBrowser(text.trim());
    },
    [cancel, frameRef, playHeadTTSAudio, speakViaBrowser, interviewer, voice]
  );

  useEffect(() => {
    frameRef.current.engine = engine;
  }, [engine, frameRef]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancel();
      headttsRef.current?.ww?.terminate();
      pendingHeadttsRef.current?.ww?.terminate();
      try { audioCtxRef.current?.close(); } catch { /* noop */ }
    };
  }, [cancel]);

  return { engine, ready, loading, progress, error, preload, preloadLocalVoice, speak, cancel, frameRef };
}
