"use client";

import { useState, useEffect, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type BrowserEventType =
    | "tab_hidden" // user switched tab or minimized
    | "tab_visible" // user came back to tab
    | "window_blur" // user clicked outside window (not a tab switch)
    | "window_focus" // user clicked back into window
    | "paste"; // user pasted text

export interface BrowserAntiCheatEvent {
    type: BrowserEventType;
    timestamp: number; // Date.now()
    detail?: string; // For paste: first 40 chars of pasted text. For others: undefined.
}

export interface BrowserAntiCheatStatus {
    isTabVisible: boolean; // current document.hidden state (inverted)
    isWindowFocused: boolean; // current window focus state
    tabSwitchCount: number; // count of "tab_hidden" events only
    windowBlurCount: number; // count of "window_blur" events only
    pasteCount: number; // count of "paste" events
    lastEvent: BrowserAntiCheatEvent | null;
    events: BrowserAntiCheatEvent[]; // full ordered log, max 200 entries
    isFlagged: boolean; // true if tabSwitchCount >= 1 OR pasteCount >= 1
    showWarning: boolean; // true for 5 seconds after an event
}

// ── Initial State ──────────────────────────────────────────────────────────────

const INITIAL_STATUS: BrowserAntiCheatStatus = {
    isTabVisible: true,
    isWindowFocused: true,
    tabSwitchCount: 0,
    windowBlurCount: 0,
    pasteCount: 0,
    lastEvent: null,
    events: [],
    isFlagged: false,
    showWarning: false,
};

// ── The Hook ───────────────────────────────────────────────────────────────────

export function useBrowserAntiCheat(
    enabled: boolean = true,
): BrowserAntiCheatStatus {
    const [status, setStatus] =
        useState<BrowserAntiCheatStatus>(INITIAL_STATUS);
    const isFirstFocusRef = useRef(true);
    const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;

        if (!enabled) {
            setStatus(INITIAL_STATUS);
            return;
        }

        // Skip the very first focus event that fires on mount
        isFirstFocusRef.current = true;
        setTimeout(() => {
            isFirstFocusRef.current = false;
        }, 200);

        // ── Helper to add events ──────────────────────────────────────────────
        const addEvent = (type: BrowserEventType, detail?: string) => {
            const event: BrowserAntiCheatEvent = {
                type,
                timestamp: Date.now(),
                detail,
            };
            setStatus((prev) => {
                const newEvents = [...prev.events, event].slice(-200); // keep max 200
                const tabSwitchCount =
                    type === "tab_hidden"
                        ? prev.tabSwitchCount + 1
                        : prev.tabSwitchCount;
                const windowBlurCount =
                    type === "window_blur"
                        ? prev.windowBlurCount + 1
                        : prev.windowBlurCount;
                const pasteCount =
                    type === "paste" ? prev.pasteCount + 1 : prev.pasteCount;

                if (warningTimeoutRef.current) {
                    clearTimeout(warningTimeoutRef.current);
                }
                
                warningTimeoutRef.current = setTimeout(() => {
                    setStatus(s => ({ ...s, showWarning: false }));
                }, 5000);

                return {
                    ...prev,
                    tabSwitchCount,
                    windowBlurCount,
                    pasteCount,
                    lastEvent: event,
                    events: newEvents,
                    isFlagged: tabSwitchCount >= 1 || pasteCount >= 1,
                    showWarning: true,
                };
            });
        };

        // ── Event 1 — visibilitychange ────────────────────────────────────────
        const handleVisibility = () => {
            if (document.hidden) {
                addEvent("tab_hidden");
                setStatus((prev) => ({ ...prev, isTabVisible: false }));
            } else {
                addEvent("tab_visible");
                setStatus((prev) => ({ ...prev, isTabVisible: true }));
            }
        };
        document.addEventListener("visibilitychange", handleVisibility);

        // ── Event 2 — window blur (only if tab is still visible) ──────────────
        const handleBlur = () => {
            if (!document.hidden) {
                addEvent("window_blur");
                setStatus((prev) => ({ ...prev, isWindowFocused: false }));
            }
        };
        window.addEventListener("blur", handleBlur);

        // ── Event 3 — window focus (skip first mount focus) ───────────────────
        const handleFocus = () => {
            setTimeout(() => {
                if (isFirstFocusRef.current) {
                    isFirstFocusRef.current = false;
                    return;
                }
                if (!document.hidden) {
                    addEvent("window_focus");
                    setStatus((prev) => ({ ...prev, isWindowFocused: true }));
                }
            }, 100);
        };
        window.addEventListener("focus", handleFocus);

        // ── Event 4 — paste ──────────────────────────────────────────────────
        const handlePaste = (e: ClipboardEvent) => {
            try {
                const text =
                    (
                        e.clipboardData ||
                        (window as unknown as { clipboardData: DataTransfer })
                            .clipboardData
                    )?.getData("text") || "";
                const preview =
                    text.length > 40 ? text.substring(0, 40) + "…" : text;
                addEvent("paste", preview || "(non-text content)");
            } catch {
                addEvent("paste", "(clipboard read failed)");
            }
        };
        document.addEventListener("paste", handlePaste);

        // ── Cleanup ──────────────────────────────────────────────────────────
        return () => {
            document.removeEventListener("visibilitychange", handleVisibility);
            window.removeEventListener("blur", handleBlur);
            window.removeEventListener("focus", handleFocus);
            document.removeEventListener("paste", handlePaste);
            if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
        };
    }, [enabled]);

    return status;
}

export default useBrowserAntiCheat;
