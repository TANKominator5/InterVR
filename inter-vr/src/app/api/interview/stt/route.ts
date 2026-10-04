import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/interview/transcription";

export const maxDuration = 40;

export async function POST(request: NextRequest) {
  const started = performance.now();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
  try {
    if (!process.env.ASSEMBLYAI_API_KEY) {
      return NextResponse.json({ error: "API transcription is unavailable: ASSEMBLYAI_API_KEY is not configured." }, { status: 503 });
    }
    const formData = await request.formData();
    const audio = formData.get("audio");
    if (!(audio instanceof File) || !audio.size) {
      return NextResponse.json({ error: "Missing or empty audio recording." }, { status: 400 });
    }
    const transcript = await transcribeAudio(audio, process.env.ASSEMBLYAI_API_KEY, signal);
    const durationMs = Math.round(performance.now() - started);
    console.info("[STT] AssemblyAI universal-2 completed in", durationMs, "ms");
    return NextResponse.json({ transcript, provider: "assemblyai", durationMs }, {
      headers: { "Server-Timing": `transcription;dur=${durationMs}` },
    });
  } catch (error) {
    console.error("[STT] Request failed:", error);
    return NextResponse.json({
      error: signal.aborted ? "Transcription took too long. Your recording is saved; retry or record again." : error instanceof Error ? error.message : "Transcription failed. Please retry.",
    }, { status: signal.aborted ? 504 : 502 });
  }
}
