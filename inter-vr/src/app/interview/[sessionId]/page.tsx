"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function InterviewPage() {
    const params = useParams();
    const sessionId = params.sessionId as string;
    const [session, setSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const supabase = createClient();

    useEffect(() => {
        const fetchSession = async () => {
            const { data, error } = await supabase
                .from("interview_sessions")
                .select("*")
                .eq("id", sessionId)
                .single();

            if (!error && data) {
                setSession(data);
            }
            setLoading(false);
        };

        fetchSession();
    }, [sessionId]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-12 h-12 text-brand-purple animate-spin" />
                    <p className="text-slate-400 text-lg">Loading interview session...</p>
                </div>
            </div>
        );
    }

    if (!session) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950">
                <p className="text-red-400 text-lg">Session not found.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center justify-center p-8">
            <div className="max-w-2xl w-full space-y-8 text-center">
                <div className="flex items-center justify-center gap-3">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                    <h1 className="text-3xl font-extrabold tracking-tight">Interview Ready</h1>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="text-slate-400">Topic</div>
                        <div className="text-white font-medium">{session.topic}</div>
                        <div className="text-slate-400">Difficulty</div>
                        <div className="text-white font-medium">{session.difficulty}</div>
                        <div className="text-slate-400">Duration</div>
                        <div className="text-white font-medium">{session.duration}</div>
                        <div className="text-slate-400">Tone</div>
                        <div className="text-white font-medium">{session.tone}</div>
                        <div className="text-slate-400">Status</div>
                        <div className="text-emerald-400 font-medium capitalize">{session.status}</div>
                        <div className="text-slate-400">Questions Generated</div>
                        <div className="text-white font-medium">{session.questions?.length || 0}</div>
                    </div>
                </div>

                {session.questions && (
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-left space-y-4">
                        <h2 className="text-lg font-bold text-brand-purple">Generated Questions Preview</h2>
                        <ol className="space-y-3">
                            {session.questions.map((q: any, i: number) => (
                                <li key={q.id || i} className="flex gap-3">
                                    <span className="text-brand-neon font-bold min-w-[24px]">{i + 1}.</span>
                                    <div>
                                        <p className="text-slate-200">{q.question}</p>
                                        <div className="flex gap-2 mt-1">
                                            <span className="text-xs px-2 py-0.5 bg-slate-800 rounded-full text-slate-400">{q.category}</span>
                                            <span className="text-xs px-2 py-0.5 bg-slate-800 rounded-full text-slate-400">{q.difficulty}</span>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </div>
                )}

                <p className="text-slate-500 text-sm">
                    🎤 LiveKit voice interview coming in the next phase. For now, you can see the AI-generated questions above.
                </p>
            </div>
        </div>
    );
}
