import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

export async function POST(request: NextRequest) {
    try {
        const { sessionId, userId, userName } = await request.json();

        if (!sessionId || !userId) {
            return NextResponse.json({ error: "Missing sessionId or userId" }, { status: 400 });
        }

        const apiKey = process.env.LIVEKIT_API_KEY!;
        const apiSecret = process.env.LIVEKIT_API_SECRET!;
        const wsUrl = process.env.LIVEKIT_URL!;

        const roomName = `interview-${sessionId}`;

        const at = new AccessToken(apiKey, apiSecret, {
            identity: userId,
            name: userName || "Candidate",
        });

        at.addGrant({
            room: roomName,
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
        });

        const token = await at.toJwt();

        return NextResponse.json({
            token,
            wsUrl,
            roomName,
        });
    } catch (error: any) {
        console.error("LiveKit token error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to generate token" },
            { status: 500 }
        );
    }
}
