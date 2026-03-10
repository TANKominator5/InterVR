"use client";

import { useState, useMemo, useCallback } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { motion, AnimatePresence } from "framer-motion";
import {
    Terminal,
    Zap,
    CheckCircle,
    AlertTriangle,
    XCircle,
    MessageCircle,
    Lightbulb,
    Loader2,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface LineFeedback {
    line: number;
    comment: string;
    severity: "info" | "warning" | "error";
}

export interface CodeAnalysis {
    verdict: "pass" | "partial" | "fail";
    time_complexity: string;
    space_complexity: string;
    correctness_score: number;
    quality_score: number;
    line_feedback: LineFeedback[];
    overall_feedback: string;
    has_counter_question: boolean;
    counter_question: string;
    suggested_fix: string;
}

interface CodeSandboxProps {
    language: string;
    questionContext: string;
    onCodeSubmit: (code: string, language: string) => void;
    isAnalyzing: boolean;
    analysisResult: CodeAnalysis | null;
}

// ── Starter templates ────────────────────────────────────────────────────────

const STARTER_CODE: Record<string, string> = {
    javascript:
        "// Write your solution here\nfunction solution() {\n  \n}\n",
    python: "# Write your solution here\ndef solution():\n    pass\n",
    java: '// Write your solution here\npublic class Solution {\n    public static void main(String[] args) {\n        \n    }\n}\n',
    typescript:
        "// Write your solution here\nfunction solution(): void {\n  \n}\n",
    cpp: "// Write your solution here\n#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n",
};

const LANGUAGE_OPTIONS = [
    { label: "JavaScript", value: "javascript" },
    { label: "Python", value: "python" },
    { label: "Java", value: "java" },
    { label: "TypeScript", value: "typescript" },
    { label: "C++", value: "cpp" },
];

function getMonacoLang(lang: string): string {
    if (lang === "cpp") return "cpp";
    return lang;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CodeSandbox({
    language: initialLanguage,
    questionContext,
    onCodeSubmit,
    isAnalyzing,
    analysisResult,
}: CodeSandboxProps) {
    const [language, setLanguage] = useState(initialLanguage);
    const [code, setCode] = useState(STARTER_CODE[initialLanguage] || STARTER_CODE.javascript);
    const [showHint, setShowHint] = useState(false);

    const stats = useMemo(() => {
        const lines = code.split("\n").length;
        const chars = code.length;
        return { lines, chars };
    }, [code]);

    const handleLanguageChange = useCallback((newLang: string) => {
        setLanguage(newLang);
        setCode(STARTER_CODE[newLang] || "// Write your solution here\n");
    }, []);

    const handleEditorMount: OnMount = (editor) => {
        editor.focus();
    };

    const severityColor: Record<string, string> = {
        info: "bg-blue-500/20 text-blue-400 border-blue-500/30",
        warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
        error: "bg-red-500/20 text-red-400 border-red-500/30",
    };

    return (
        <div className="h-full flex flex-col bg-background border-l border-border">
            {/* ── Toolbar ──────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/60 shrink-0">
                <div className="flex items-center gap-3">
                    <select
                        value={language}
                        onChange={(e) => handleLanguageChange(e.target.value)}
                        className="bg-muted border border-border text-foreground/90 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-orange-500 appearance-none cursor-pointer"
                    >
                        {LANGUAGE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-600 text-xs font-bold">
                        <Terminal className="w-3.5 h-3.5" />
                        Coding Challenge
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-foreground0 font-mono hidden sm:block">
                        {stats.lines} lines · {stats.chars} chars
                    </span>
                    <button
                        onClick={() => onCodeSubmit(code, language)}
                        disabled={isAnalyzing || code.trim().length < 10}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white bg-[linear-gradient(to_right,var(--color-orange-400),var(--color-orange-600))] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_12px_rgba(249,115,22,0.3)]"
                    >
                        {isAnalyzing ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Analyzing...
                            </>
                        ) : (
                            <>
                                <Zap className="w-4 h-4" />
                                Analyze Code
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* ── Editor + Results Split ───────────────────────────────────────── */}
            <PanelGroup orientation="vertical" className="flex-1 min-h-0">
                <Panel defaultSize="60%" minSize="30%">
                    <Editor
                        theme="light"
                        language={getMonacoLang(language)}
                        value={code}
                        onChange={(val) => setCode(val || "")}
                        onMount={handleEditorMount}
                        options={{
                            fontSize: 14,
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            lineNumbers: "on",
                            renderLineHighlight: "all",
                            suggestOnTriggerCharacters: true,
                            tabSize: 2,
                            wordWrap: "on",
                            padding: { top: 16 },
                        }}
                    />
                </Panel>

                {analysisResult && (
                    <PanelResizeHandle className="h-1.5 bg-slate-200 hover:bg-orange-400/50 transition-colors cursor-row-resize shrink-0" />
                )}

                {analysisResult && (
                    <Panel defaultSize="40%" minSize="20%">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                            className="h-full overflow-y-auto p-4 space-y-4 bg-background"
                        >
                            {/* ── Row 1: Verdict Banner ─────────────────────────────── */}
                            <VerdictBanner verdict={analysisResult.verdict} />

                            {/* ── Row 2: Score Cards ────────────────────────────────── */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <ScoreCard label="Correctness" value={`${analysisResult.correctness_score}/10`} />
                                <ScoreCard label="Code Quality" value={`${analysisResult.quality_score}/10`} />
                                <ScoreCard label="Time" value={analysisResult.time_complexity} />
                                <ScoreCard label="Space" value={analysisResult.space_complexity} />
                            </div>

                            {/* ── Row 3: Overall Feedback ───────────────────────────── */}
                            <div className="bg-card border border-border rounded-xl p-4">
                                <p className="text-xs text-foreground0 uppercase tracking-wider mb-2 font-semibold">
                                    AI Analysis
                                </p>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    {analysisResult.overall_feedback}
                                </p>
                            </div>

                            {/* ── Row 4: Line Feedback ──────────────────────────────── */}
                            {analysisResult.line_feedback.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs text-foreground0 uppercase tracking-wider font-semibold">
                                        Line-by-Line Notes
                                    </p>
                                    {analysisResult.line_feedback.map((lf, i) => (
                                        <div
                                            key={i}
                                            className="flex items-start gap-2 text-sm"
                                        >
                                            <span
                                                className={`shrink-0 px-2 py-0.5 rounded text-xs font-mono border ${severityColor[lf.severity]}`}
                                            >
                                                Line {lf.line}
                                            </span>
                                            <span className="text-muted-foreground">{lf.comment}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ── Row 5: Counter Question ──────────────────────────── */}
                            {analysisResult.has_counter_question && analysisResult.counter_question && (
                                <div className="bg-orange-500/5 border border-orange-500/30 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <MessageCircle className="w-4 h-4 text-orange-600" />
                                        <span className="text-sm font-bold text-orange-600">
                                            Follow-up Question
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground font-medium">
                                        {analysisResult.counter_question}
                                    </p>
                                    <p className="text-xs text-foreground0 mt-2 font-semibold text-orange-700">
                                        Answer this question verbally — the interviewer is listening.
                                    </p>
                                </div>
                            )}

                            {/* ── Row 6: Suggested Fix (Hint) ──────────────────────── */}
                            {analysisResult.suggested_fix && (
                                <div>
                                    <button
                                        onClick={() => setShowHint(!showHint)}
                                        className="flex items-center gap-2 text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
                                    >
                                        <Lightbulb className="w-4 h-4" />
                                        {showHint ? "Hide hint" : "Need a hint?"}
                                    </button>
                                    <AnimatePresence>
                                        {showHint && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-2 bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3 text-sm text-yellow-200/80"
                                            >
                                                {analysisResult.suggested_fix}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </motion.div>
                    </Panel>
                )}
            </PanelGroup>
        </div>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function VerdictBanner({ verdict }: { verdict: "pass" | "partial" | "fail" }) {
    const config = {
        pass: {
            bg: "bg-emerald-500/10 border-emerald-500/30",
            icon: <CheckCircle className="w-5 h-5 text-emerald-400" />,
            text: "Solution Accepted",
            textColor: "text-emerald-400",
        },
        partial: {
            bg: "bg-yellow-500/10 border-yellow-500/30",
            icon: <AlertTriangle className="w-5 h-5 text-yellow-400" />,
            text: "Partially Correct",
            textColor: "text-yellow-400",
        },
        fail: {
            bg: "bg-red-500/10 border-red-500/30",
            icon: <XCircle className="w-5 h-5 text-red-400" />,
            text: "Needs Improvement",
            textColor: "text-red-400",
        },
    };

    const c = config[verdict];
    return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${c.bg}`}>
            {c.icon}
            <span className={`font-bold ${c.textColor}`}>{c.text}</span>
        </div>
    );
}

function ScoreCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-muted border border-border rounded-xl p-3 text-center">
            <div className="text-base font-bold text-white">{value}</div>
            <div className="text-xs text-foreground0 mt-0.5">{label}</div>
        </div>
    );
}
