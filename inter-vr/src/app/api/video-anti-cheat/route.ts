import { NextRequest, NextResponse } from "next/server";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AntiCheatEvent {
  sessionId: string;
  timestamp: number;
  yaw: number;
  pitch: number;
  roll?: number;
  gazeX: number;
  gazeY: number;
  isFlagged: boolean;
  isLookingAway?: boolean;
  isGazeOffCenter?: boolean;
}

// ── POST Handler ───────────────────────────────────────────────────────────────

/**
 * Receives anti-cheat status snapshots from the client-side hook.
 * Acts as an event sink for logging / persisting flagged events.
 *
 * In production, this would write to a database or audit log.
 * For now, it validates the payload and acknowledges receipt.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AntiCheatEvent;

    // ── Validate required fields ───────────────────────────────────────────
    if (!body.sessionId || typeof body.sessionId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid sessionId" },
        { status: 400 },
      );
    }

    if (typeof body.timestamp !== "number") {
      return NextResponse.json(
        { error: "Missing or invalid timestamp" },
        { status: 400 },
      );
    }

    if (typeof body.yaw !== "number" || typeof body.pitch !== "number") {
      return NextResponse.json(
        { error: "Missing or invalid yaw/pitch values" },
        { status: 400 },
      );
    }

    if (typeof body.gazeX !== "number" || typeof body.gazeY !== "number") {
      return NextResponse.json(
        { error: "Missing or invalid gazeX/gazeY values" },
        { status: 400 },
      );
    }

    // ── Server-side validation of flags ────────────────────────────────────
    // Re-check the thresholds server-side so the client can't lie about flags
    const YAW_THRESHOLD = 15;
    const PITCH_THRESHOLD = 12;
    const GAZE_EDGE = 0.15;

    const serverIsLookingAway =
      Math.abs(body.yaw) > YAW_THRESHOLD ||
      Math.abs(body.pitch) > PITCH_THRESHOLD;

    const serverIsGazeOffCenter =
      body.gazeX < GAZE_EDGE ||
      body.gazeX > 1 - GAZE_EDGE ||
      body.gazeY < GAZE_EDGE ||
      body.gazeY > 1 - GAZE_EDGE;

    const serverIsFlagged = serverIsLookingAway || serverIsGazeOffCenter;

    // ── Log the event (replace with DB write in production) ────────────────
    if (serverIsFlagged) {
      console.log(
        `[VideoAntiCheat] FLAGGED session=${body.sessionId} ` +
          `yaw=${body.yaw.toFixed(1)}° pitch=${body.pitch.toFixed(1)}° ` +
          `gaze=(${body.gazeX.toFixed(2)}, ${body.gazeY.toFixed(2)}) ` +
          `lookAway=${serverIsLookingAway} gazeOff=${serverIsGazeOffCenter}`,
      );
    }

    return NextResponse.json({
      received: true,
      serverValidation: {
        isFlagged: serverIsFlagged,
        isLookingAway: serverIsLookingAway,
        isGazeOffCenter: serverIsGazeOffCenter,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Processing failed", details: message },
      { status: 500 },
    );
  }
}
