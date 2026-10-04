import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ provider: "unrealspeech", configured: Boolean(process.env.UNREAL_SPEECH_API_KEY) }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { text, voice } = await request.json();
    if (typeof text !== "string" || !text.trim() || text.length > 1000) {
      return NextResponse.json({ error: "TTS requires 1–1000 characters of text." }, { status: 400 });
    }
    if (!process.env.UNREAL_SPEECH_API_KEY) {
      return NextResponse.json({ error: "Dedicated voice is unavailable: UNREAL_SPEECH_API_KEY is not configured." }, { status: 503 });
    }

    const response = await fetch("https://api.v8.unrealspeech.com/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.UNREAL_SPEECH_API_KEY}`,
      },
      body: JSON.stringify({
        // v8 uses Kokoro voice IDs; the old v7 "Dan" voice returns HTTP 400.
        Text: text.trim(), VoiceId: voice || "am_michael", Bitrate: "192k", Speed: "0", Pitch: "1", Codec: "libmp3lame",
      }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok || !response.body) {
      console.error("[TTS] Unreal Speech request failed:", response.status);
      return NextResponse.json({ error: `Dedicated voice request failed (${response.status}).` }, { status: 502 });
    }
    // Forward bytes as they arrive instead of buffering the provider's stream.
    return new NextResponse(response.body, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Speech-Provider": "unrealspeech" },
    });
  } catch (error) {
    console.error("[TTS] Request failed:", error);
    return NextResponse.json({ error: "Dedicated voice request failed or timed out." }, { status: 502 });
  }
}
