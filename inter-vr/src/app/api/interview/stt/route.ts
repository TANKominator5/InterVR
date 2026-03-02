import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const audioFile = formData.get("audio") as File;

        if (!audioFile) {
            return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
        }

        const audioBuffer = await audioFile.arrayBuffer();

        // Step 1: Upload audio to AssemblyAI
        const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
            method: "POST",
            headers: {
                "Authorization": process.env.ASSEMBLYAI_API_KEY!,
                "Content-Type": "application/octet-stream",
            },
            body: audioBuffer,
        });

        if (!uploadResponse.ok) {
            throw new Error(`Upload failed: ${uploadResponse.status}`);
        }

        const { upload_url } = await uploadResponse.json();

        // Step 2: Request transcription
        const transcriptResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
            method: "POST",
            headers: {
                "Authorization": process.env.ASSEMBLYAI_API_KEY!,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                audio_url: upload_url,
                speech_model: "nano",
            }),
        });

        if (!transcriptResponse.ok) {
            throw new Error(`Transcription request failed: ${transcriptResponse.status}`);
        }

        const { id: transcriptId } = await transcriptResponse.json();

        // Step 3: Poll for completion
        let transcript = null;
        const maxAttempts = 60;
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise((r) => setTimeout(r, 1000));

            const pollResponse = await fetch(
                `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
                {
                    headers: {
                        "Authorization": process.env.ASSEMBLYAI_API_KEY!,
                    },
                }
            );

            const result = await pollResponse.json();

            if (result.status === "completed") {
                transcript = result.text;
                break;
            } else if (result.status === "error") {
                throw new Error(`Transcription error: ${result.error}`);
            }
        }

        if (!transcript) {
            throw new Error("Transcription timed out");
        }

        return NextResponse.json({ transcript });
    } catch (error: any) {
        console.error("STT error:", error);
        return NextResponse.json(
            { error: error.message || "Transcription failed" },
            { status: 500 }
        );
    }
}
