"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface RecognitionResult { readonly [index: number]: { transcript: string } }
interface RecognitionEvent { results: ArrayLike<RecognitionResult> }
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export function useAnswerRecording() {
  const [liveTranscript, setLiveTranscript] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeRef = useRef(false);
  const transcriptRef = useRef({ committed: "", segment: "" });
  const finalRecognitionRef = useRef<(() => void) | null>(null);
  const recognitionReliableRef = useRef(false);

  const text = useCallback(() => [transcriptRef.current.committed, transcriptRef.current.segment].filter(Boolean).join(" ").trim(), []);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    streamRef.current = stream;
    try {
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });
      recorderRef.current = recorder;
      chunksRef.current = [];
      transcriptRef.current = { committed: "", segment: "" };
      setLiveTranscript("");
      activeRef.current = true;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.start(250);

      const browser = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
      const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
      recognitionReliableRef.current = Boolean(Constructor);
      if (Constructor) {
        const recognition = new Constructor();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        let restartAllowed = true;
        recognition.onresult = (event) => {
          transcriptRef.current.segment = Array.from(event.results, (result) => result[0].transcript.trim()).filter(Boolean).join(" ");
          setLiveTranscript(text());
        };
        recognition.onerror = (event) => {
          if (["not-allowed", "service-not-allowed", "audio-capture", "network"].includes(event.error)) {
            restartAllowed = false;
            recognitionReliableRef.current = false;
          }
        };
        recognition.onend = () => {
          transcriptRef.current.committed = text();
          transcriptRef.current.segment = "";
          // Chrome ends recognition during pauses even in continuous mode.
          // Preserve the completed segment and keep transcribing the recording.
          if (activeRef.current && restartAllowed) {
            try { recognition.start(); } catch { restartAllowed = false; recognitionReliableRef.current = false; }
          } else {
            finalRecognitionRef.current?.();
          }
        };
        // Recognition failure should fall back to API transcription, not fail
        // an otherwise healthy microphone recording.
        try { recognition.start(); } catch { recognitionRef.current = null; recognitionReliableRef.current = false; }
      }
    } catch (error) {
      activeRef.current = false;
      stream.getTracks().forEach((track) => track.stop());
      throw error;
    }
  }, [text]);

  const stop = useCallback(async () => {
    activeRef.current = false;
    const recognition = recognitionRef.current;
    const finalized = new Promise<void>((resolve) => {
      if (!recognition) { resolve(); return; }
      const timeout = setTimeout(() => { finalRecognitionRef.current = null; resolve(); }, 350);
      finalRecognitionRef.current = () => { clearTimeout(timeout); finalRecognitionRef.current = null; resolve(); };
      try { recognition.stop(); } catch { finalRecognitionRef.current(); }
    });
    const audio = new Promise<Blob>((resolve, reject) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(new Blob(chunksRef.current, { type: recorder?.mimeType || "audio/webm" }));
        return;
      }
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType }));
      recorder.onerror = () => reject(new Error("Could not finish the audio recording. Please record again."));
      recorder.stop();
    });
    try {
      const [blob] = await Promise.all([audio, finalized]);
      return { audio: blob, transcript: recognitionReliableRef.current ? text() : "" };
    } finally {
      if (recognition) {
        recognition.onend = null;
        recognition.onresult = null;
        try { recognition.abort(); } catch { /* already stopped */ }
      }
      recognitionRef.current = null;
      recorderRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, [text]);

  useEffect(() => () => {
    activeRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      try { recognitionRef.current.abort(); } catch { /* already stopped */ }
    }
    if (recorderRef.current?.state !== "inactive") {
      try { recorderRef.current?.stop(); } catch { /* already stopped */ }
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    finalRecognitionRef.current?.();
  }, []);

  return { start, stop, liveTranscript };
}
