import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

// ── Types ──────────────────────────────────────────────────────────────────────

interface BrowserAntiCheatEvent {
    type: string;
    timestamp: number;
    detail?: string;
}

interface BrowserAntiCheatPayload {
    sessionId: string;
    newEvents: BrowserAntiCheatEvent[];
    summary: {
        tabSwitchCount: number;
        windowBlurCount: number;
        pasteCount: number;
        isFlagged: boolean;
    };
}

// ── POST Handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    try {
        // 1. Auth check
        const authHeader = req.headers.get("authorization");
        const token = authHeader?.replace("Bearer ", "");
        if (!token) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const supabase = createAdminClient();
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Parse & validate body
        const body = (await req.json()) as BrowserAntiCheatPayload;

        if (!body.sessionId || typeof body.sessionId !== "string") {
            return NextResponse.json(
                { error: "Missing or invalid sessionId" },
                { status: 400 },
            );
        }

        if (!Array.isArray(body.newEvents)) {
            return NextResponse.json(
                { error: "newEvents must be an array" },
                { status: 400 },
            );
        }

        // 3. Server-side re-validation of isFlagged (don't trust client)
        const serverTabSwitchCount = body.newEvents.filter(
            (e) => e.type === "tab_hidden",
        ).length;
        const serverPasteCount = body.newEvents.filter(
            (e) => e.type === "paste",
        ).length;
        const serverWindowBlurCount = body.newEvents.filter(
            (e) => e.type === "window_blur",
        ).length;

        // 4. Read existing record (if any)
        const { data: existing } = await supabase
            .from("browser_anti_cheat_logs")
            .select("tab_switch_count, window_blur_count, paste_count, events")
            .eq("session_id", body.sessionId)
            .single();

        const existingTabCount = existing?.tab_switch_count ?? 0;
        const existingBlurCount = existing?.window_blur_count ?? 0;
        const existingPasteCount = existing?.paste_count ?? 0;
        const existingEvents = (existing?.events as BrowserAntiCheatEvent[]) ?? [];

        const newTabTotal = existingTabCount + serverTabSwitchCount;
        const newBlurTotal = existingBlurCount + serverWindowBlurCount;
        const newPasteTotal = existingPasteCount + serverPasteCount;
        const mergedEvents = [...existingEvents, ...body.newEvents].slice(-500);
        const serverIsFlagged = newTabTotal >= 1 || newPasteTotal >= 1;

        // 5. Upsert
        const { error: upsertError } = await supabase
            .from("browser_anti_cheat_logs")
            .upsert(
                {
                    session_id: body.sessionId,
                    tab_switch_count: newTabTotal,
                    window_blur_count: newBlurTotal,
                    paste_count: newPasteTotal,
                    is_flagged: serverIsFlagged,
                    events: mergedEvents,
                    last_updated_at: new Date().toISOString(),
                },
                { onConflict: "session_id" },
            );

        if (upsertError) {
            console.error("[BrowserAntiCheat] Upsert failed:", upsertError);
            return NextResponse.json(
                { error: "Database write failed", details: upsertError.message },
                { status: 500 },
            );
        }

        // 6. Return
        return NextResponse.json({
            received: true,
            totalEvents: mergedEvents.length,
            isFlagged: serverIsFlagged,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[BrowserAntiCheat] Error:", message);
        return NextResponse.json(
            { error: "Processing failed", details: message },
            { status: 500 },
        );
    }
}
