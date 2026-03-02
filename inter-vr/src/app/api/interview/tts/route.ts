import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const { text, voice } = await request.json();

        if (!text) {
            return NextResponse.json({ error: "Missing text" }, { status: 400 });
        }

        // Unreal Speech API - /stream endpoint for fast streaming audio
        const response = await fetch("https://api.v8.unrealspeech.com/stream", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.UNREAL_SPEECH_API_KEY}`,
            },
            body: JSON.stringify({
                Text: text,
                VoiceId: voice || "Dan", // Dan = professional male voice
                Bitrate: "192k",
                Speed: "0",
                Pitch: "1",
                Codec: "libmp3lame",
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("Unreal Speech error:", response.status, errText);
            throw new Error(`TTS failed: ${response.status}`);
        }

        // Stream the audio back as MP3
        const audioBuffer = await response.arrayBuffer();

        return new NextResponse(audioBuffer, {
            headers: {
                "Content-Type": "audio/mpeg",
                "Content-Length": audioBuffer.byteLength.toString(),
            },
        });
    } catch (error: any) {
        console.error("TTS error:", error);
        return NextResponse.json(
            { error: error.message || "TTS failed" },
            { status: 500 }
        );
    }
}
