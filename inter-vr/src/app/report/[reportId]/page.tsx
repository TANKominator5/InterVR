"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
    Trophy, TrendingUp, TrendingDown, Star, Clock,
    MessageSquare, ChevronDown, ChevronUp, Loader2, ArrowLeft,
    ShieldCheck, ShieldAlert, Eye
} from "lucide-react";

export default function ReportPage() {
    const params = useParams();
    const router = useRouter();
    const reportId = params.reportId as string;
    const supabase = createClient();

    const [report, setReport] = useState<any>(null);
    const [session, setSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [expandedQ, setExpandedQ] = useState<number | null>(null);

    useEffect(() => {
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push("/login");
                return;
            }

            const { data: rep } = await supabase
                .from("interview_reports")
                .select("*, interview_sessions(*)")
                .eq("id", reportId)
                .single();

            if (rep) {
                setReport(rep);
                setSession(rep.interview_sessions);
            }
            setLoading(false);
        };
        load();
    }, [reportId]);

    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-12 h-12 text-brand-purple animate-spin" />
                <p className="text-slate-400">Loading your report...</p>
            </div>
        </div>
    );

    if (!report) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <p className="text-red-400">Report not found.</p>
        </div>
    );

    const scoreColor = report.overall_score >= 75 ? "text-emerald-400" :
        report.overall_score >= 50 ? "text-yellow-400" : "text-red-400";

    const scoreGlow = report.overall_score >= 75 ? "shadow-[0_0_40px_rgba(16,185,129,0.3)]" :
        report.overall_score >= 50 ? "shadow-[0_0_40px_rgba(234,179,8,0.3)]" : "shadow-[0_0_40px_rgba(239,68,68,0.3)]";

    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 font-sans">
            <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">

                {/* Header */}
                <div className="flex items-center gap-3">
                    <button onClick={() => router.push("/dashboard")}
                        className="text-slate-500 hover:text-slate-300 transition flex items-center gap-1 text-sm">
                        <ArrowLeft className="w-4 h-4" /> Dashboard
                    </button>
                </div>

                {/* Score Card */}
                <div className={`bg-slate-900/60 border border-slate-800 rounded-3xl p-8 text-center ${scoreGlow}`}>
                    <div className="flex items-center justify-center gap-3 mb-2">
                        <Trophy className="w-6 h-6 text-brand-neon" />
                        <h1 className="text-xl font-bold text-slate-300">Interview Report</h1>
                    </div>
                    <div className={`text-7xl font-extrabold ${scoreColor} my-4`}>
                        {report.overall_score}<span className="text-3xl text-slate-500">/100</span>
                    </div>
                    <p className="text-slate-400 text-sm mb-6">{report.summary}</p>
                    <div className="flex justify-center gap-8 text-sm text-slate-500">
                        <div className="flex items-center gap-1.5">
                            <MessageSquare className="w-4 h-4" />
                            {report.questions_answered} questions
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            {report.duration_minutes || "—"} min
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Star className="w-4 h-4" />
                            {session?.topic}
                        </div>
                    </div>
                </div>

                {/* Strengths & Areas */}
                <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <TrendingUp className="w-5 h-5 text-emerald-400" />
                            <h3 className="font-bold text-emerald-400">Strengths</h3>
                        </div>
                        <ul className="space-y-2">
                            {(report.strengths || []).map((s: string, i: number) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                    <span className="text-emerald-400 mt-0.5">✓</span> {s}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <TrendingDown className="w-5 h-5 text-orange-400" />
                            <h3 className="font-bold text-orange-400">Areas to Improve</h3>
                        </div>
                        <ul className="space-y-2">
                            {(report.areas_to_improve || []).map((s: string, i: number) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                    <span className="text-orange-400 mt-0.5">→</span> {s}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Integrity Report */}
                {report.browser_anti_cheat && (
                    <div className={`border rounded-2xl p-5 ${report.browser_anti_cheat.isFlagged
                            ? "bg-red-500/5 border-red-500/20"
                            : "bg-emerald-500/5 border-emerald-500/20"
                        }`}>
                        <div className="flex items-center gap-2 mb-4">
                            {report.browser_anti_cheat.isFlagged
                                ? <ShieldAlert className="w-5 h-5 text-red-400" />
                                : <ShieldCheck className="w-5 h-5 text-emerald-400" />
                            }
                            <h3 className={`font-bold ${report.browser_anti_cheat.isFlagged ? "text-red-400" : "text-emerald-400"}`}>
                                Session Integrity
                            </h3>
                            <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full ${report.browser_anti_cheat.isFlagged
                                    ? "bg-red-500/20 text-red-400"
                                    : "bg-emerald-500/20 text-emerald-400"
                                }`}>
                                {report.browser_anti_cheat.isFlagged ? "Flagged" : "Clean"}
                            </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <div className="bg-slate-900/60 rounded-xl p-3">
                                <div className={`text-2xl font-extrabold ${report.browser_anti_cheat.tabSwitchCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                                    {report.browser_anti_cheat.tabSwitchCount}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">Tab Switches</div>
                            </div>
                            <div className="bg-slate-900/60 rounded-xl p-3">
                                <div className={`text-2xl font-extrabold ${report.browser_anti_cheat.windowBlurCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                                    {report.browser_anti_cheat.windowBlurCount}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">Focus Lost</div>
                            </div>
                            <div className="bg-slate-900/60 rounded-xl p-3">
                                <div className={`text-2xl font-extrabold ${report.browser_anti_cheat.pasteCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                                    {report.browser_anti_cheat.pasteCount}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">Paste Events</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Question Breakdown */}
                <div className="space-y-3">
                    <h2 className="text-lg font-bold text-white">Question Breakdown</h2>
                    {(report.breakdown || []).map((item: any, i: number) => {
                        const avg = item.score
                            ? Math.round(((item.score.accuracy + item.score.depth + item.score.communication) / 3) * 10)
                            : null;

                        return (
                            <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                                <button
                                    className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-800/30 transition"
                                    onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="w-6 h-6 rounded-full bg-brand-purple/20 text-brand-purple text-xs font-bold flex items-center justify-center">
                                            {i + 1}
                                        </span>
                                        <p className="text-sm text-slate-300 font-medium line-clamp-1">{item.question}</p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        {avg !== null && (
                                            <span className={`text-sm font-bold ${avg >= 70 ? "text-emerald-400" : avg >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                                                {avg}%
                                            </span>
                                        )}
                                        {expandedQ === i ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                                    </div>
                                </button>

                                {expandedQ === i && (
                                    <div className="px-4 pb-4 space-y-3 border-t border-slate-800">
                                        {item.answer_transcript && (
                                            <div className="mt-3">
                                                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Your Answer</p>
                                                <p className="text-sm text-slate-300 leading-relaxed">{item.answer_transcript}</p>
                                            </div>
                                        )}
                                        {item.score && (
                                            <div className="grid grid-cols-3 gap-2 mt-2">
                                                {[
                                                    { label: "Accuracy", v: item.score.accuracy },
                                                    { label: "Depth", v: item.score.depth },
                                                    { label: "Communication", v: item.score.communication },
                                                ].map(({ label, v }) => (
                                                    <div key={label} className="bg-slate-800/50 rounded-lg p-2 text-center">
                                                        <div className="text-base font-bold text-brand-purple">{v}/10</div>
                                                        <div className="text-xs text-slate-500">{label}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {item.feedback && (
                                            <div>
                                                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Feedback</p>
                                                <p className="text-sm text-slate-300 leading-relaxed">{item.feedback}</p>
                                            </div>
                                        )}
                                        {item.code_submission && (
                                            <div className="mt-3">
                                                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                                                    Code Submission ({item.code_language})
                                                </p>
                                                <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-xs text-slate-300 overflow-x-auto font-mono">
                                                    <code>{item.code_submission}</code>
                                                </pre>
                                                {item.code_analysis && (
                                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                                        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                                                            <div className="text-sm font-bold text-purple-400">
                                                                {item.code_analysis.correctness_score}/10
                                                            </div>
                                                            <div className="text-xs text-slate-500">Correctness</div>
                                                        </div>
                                                        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                                                            <div className="text-sm font-bold text-fuchsia-400">
                                                                {item.code_analysis.time_complexity}
                                                            </div>
                                                            <div className="text-xs text-slate-500">Time Complexity</div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="text-center pt-4">
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="px-8 py-3 bg-brand-purple/20 border border-brand-purple/30 rounded-xl text-brand-purple font-semibold hover:bg-brand-purple/30 transition"
                    >
                        Back to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}
