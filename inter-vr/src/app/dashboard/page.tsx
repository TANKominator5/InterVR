"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { createClient } from "@/utils/supabase/client";
import {
    LayoutDashboard,
    History,
    Trophy,
    Settings,
    Mic,
    Video,
    Wifi,
    Brain,
    Eye,
    Flame,
    Menu,
    X,
    PlayCircle,
    User as UserIcon,
    FileText
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// Dummy Data to mock Supabase connection for now
const userStats = {
    name: "Alex Developer",
    targetRole: "Next.js Fullstack Engineer",
    confidenceScore: 82,
    gazeScore: 94,
    streak: 3,
    totalMocks: 5,
    config: {
        persona: "The Strict Manager",
        techStack: "MERN",
        resume: "attached"
    }
};

const recentInterviews = [
    { id: 1, date: "Oct 12, 2026", type: "System Design", persona: "Strict", score: "88%", status: "completed" },
    { id: 2, date: "Oct 10, 2026", type: "Behavioral", persona: "Casual", score: "92%", status: "completed" },
    { id: 3, date: "Oct 05, 2026", type: "React Frontend", persona: "Friendly", score: "78%", status: "completed" },
];

export default function DashboardPage() {
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const [topic, setTopic] = useState("Next.js");
    const [difficulty, setDifficulty] = useState("Medium");
    const [duration, setDuration] = useState("Short (15m)");
    const [tone, setTone] = useState("Strict");
    const [isStarting, setIsStarting] = useState(false);

    const router = useRouter();
    const supabase = createClient();

    const startSimulation = async () => {
        setIsStarting(true);
        try {
            // 1. Get current user
            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) throw new Error("Please sign in first.");

            // 2. Create interview session in DB
            const { data: session, error: sessionError } = await supabase
                .from("interview_sessions")
                .insert({
                    user_id: user.id,
                    topic,
                    difficulty,
                    duration,
                    tone,
                    status: "pending",
                })
                .select()
                .single();

            if (sessionError || !session) throw new Error(sessionError?.message || "Failed to create session");

            toast.loading("Generating interview questions...", { id: "gen-questions" });

            // 3. Trigger question generation
            const genResponse = await fetch("/api/generate-questions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: session.id }),
            });

            if (!genResponse.ok) {
                const errData = await genResponse.json();
                throw new Error(errData.error || "Failed to generate questions");
            }

            toast.success("Interview ready! Entering room...", { id: "gen-questions" });

            // 4. Redirect to interview page
            router.push(`/interview/${session.id}`);

        } catch (error: any) {
            toast.dismiss("gen-questions");
            toast.error(error.message || "Something went wrong.");
        } finally {
            setIsStarting(false);
        }
    };

    const [micStatus, setMicStatus] = useState<'testing' | 'ready' | 'error'>('testing');
    const [camStatus, setCamStatus] = useState<'testing' | 'ready' | 'error'>('testing');
    const [latency, setLatency] = useState<number | null>(null);

    useEffect(() => {
        let mounted = true;

        const checkHardware = async () => {
            // Check Microphone
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (mounted) setMicStatus('ready');
                audioStream.getTracks().forEach(track => track.stop()); // Clean up immediately after test
            } catch (err) {
                console.error("Mic access denied:", err);
                if (mounted) setMicStatus('error');
            }

            // Check Camera
            try {
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (mounted) setCamStatus('ready');
                videoStream.getTracks().forEach(track => track.stop()); // Clean up immediately after test
            } catch (err) {
                console.error("Camera access denied:", err);
                if (mounted) setCamStatus('error');
            }

            // Simulate Ping / Network check (we can't easily ping from browser JS without a dedicated endpoint)
            setTimeout(() => {
                if (mounted) {
                    const fakePing = Math.floor(Math.random() * 30) + 15; // 15ms - 45ms
                    setLatency(fakePing);
                }
            }, 1500);
        };

        checkHardware();

        return () => { mounted = false; };
    }, []);

    return (
        <div className="flex min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-brand-purple/30">

            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 md:hidden backdrop-blur-sm"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar Navigation */}
            <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-950/80 backdrop-blur-md border-r border-slate-800 transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
                <div className="flex h-16 items-center justify-between px-6 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-brand-purple/20 text-brand-neon flex items-center justify-center">
                            <Brain className="h-5 w-5" />
                        </div>
                        <span className="text-xl font-bold tracking-tight">Inter<span className="text-brand-purple">VR</span></span>
                    </div>
                    <button className="md:hidden text-slate-400 hover:text-white" onClick={() => setSidebarOpen(false)}>
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <nav className="p-4 space-y-2">
                    <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-brand-purple/10 text-brand-neon font-medium">
                        <LayoutDashboard className="h-5 w-5" />
                        Dashboard
                    </a>
                    <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-slate-900 hover:text-slate-200 transition-colors">
                        <History className="h-5 w-5" />
                        Interview History
                    </a>
                    <a href="#" className="flex items-center justify-between px-3 py-2.5 rounded-lg text-slate-500 cursor-not-allowed">
                        <div className="flex items-center gap-3">
                            <Trophy className="h-5 w-5" />
                            Leaderboard
                        </div>
                        <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-500">Soon</Badge>
                    </a>
                    <div className="pt-4 mt-4 border-t border-slate-800/50">
                        <a href="/profile" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-slate-900 hover:text-slate-200 transition-colors">
                            <Settings className="h-5 w-5" />
                            Settings
                        </a>
                    </div>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden relative">
                {/* Background glow effects */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-purple/10 rounded-full blur-[120px] pointer-events-none -mr-40 -mt-20 mix-blend-screen" />
                <div className="absolute bottom-40 left-20 w-[400px] h-[400px] bg-brand-neon/5 rounded-full blur-[100px] pointer-events-none mix-blend-screen" />

                {/* Top Bar */}
                <header className="sticky top-0 z-30 flex h-16 items-center justify-between px-4 md:px-8 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <button className="md:hidden text-slate-400 hover:text-white" onClick={() => setSidebarOpen(true)}>
                            <Menu className="h-6 w-6" />
                        </button>
                        <div>
                            <h1 className="text-lg md:text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 antialiased">Welcome back, {userStats.name.split(' ')[0]}</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden md:flex flex-col items-end">
                            <span className="text-sm font-medium text-slate-200">{userStats.name}</span>
                            <span className="text-xs text-brand-neon">{userStats.targetRole}</span>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-slate-800 border-2 border-brand-purple flex items-center justify-center font-bold text-brand-neon">
                            {userStats.name.charAt(0)}
                        </div>
                    </div>
                </header>

                {/* Dashboard Content */}
                <div className="flex-1 p-4 md:p-8 space-y-8 max-w-7xl mx-auto w-full z-10">

                    {/* Primary Action Card: Enter VR Room */}
                    <Card className="relative overflow-hidden border-slate-700/60 bg-slate-950/40 backdrop-blur-xl shadow-2xl">
                        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-brand-purple to-transparent opacity-50" />

                        <CardHeader className="text-center md:text-left">
                            <CardTitle className="text-2xl md:text-3xl font-extrabold tracking-tight">Enter the VR Interview Room</CardTitle>
                            <CardDescription className="text-base text-slate-400">Configure your simulation parameters. The AI will adapt dynamically to your answers.</CardDescription>

                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-4">
                                <Badge variant="purple" className="flex items-center gap-1.5 px-3 py-1"><UserIcon className="w-3 h-3" /> {userStats.config.persona}</Badge>
                                <Badge variant="neon" className="flex items-center gap-1.5 px-3 py-1"><Brain className="w-3 h-3" /> Tech: {userStats.config.techStack}</Badge>
                                <Badge variant="outline" className="flex items-center gap-1.5 px-3 py-1 bg-slate-800/50"><FileText className="w-3 h-3" /> Resume: {userStats.config.resume}</Badge>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Topic</label>
                                    <select
                                        value={topic} onChange={(e) => setTopic(e.target.value)}
                                        className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple transition-all outline-none appearance-none"
                                    >
                                        <option>Next.js & React</option>
                                        <option>Flutter & Dart</option>
                                        <option>PostgreSQL</option>
                                        <option>Docker & K8s</option>
                                        <option>System Design</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Difficulty</label>
                                    <select
                                        value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
                                        className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple transition-all outline-none appearance-none"
                                    >
                                        <option>Easy (Intern)</option>
                                        <option>Medium (Junior/Mid)</option>
                                        <option>Hard (Senior)</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Duration</label>
                                    <select
                                        value={duration} onChange={(e) => setDuration(e.target.value)}
                                        className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple transition-all outline-none appearance-none"
                                    >
                                        <option>Short (15m)</option>
                                        <option>Medium (30m)</option>
                                        <option>Long (45m)</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Interviewer Tone</label>
                                    <select
                                        value={tone} onChange={(e) => setTone(e.target.value)}
                                        className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple transition-all outline-none appearance-none"
                                    >
                                        <option>Strict</option>
                                        <option>Casual</option>
                                        <option>Friendly</option>
                                    </select>
                                </div>
                            </div>

                            <div className="pt-4 flex flex-col items-center gap-6">
                                <Button
                                    onClick={startSimulation}
                                    disabled={isStarting}
                                    className="w-full md:w-2/3 h-16 text-lg font-bold rounded-2xl bg-gradient-to-r from-brand-purple to-brand-neon hover:from-brand-purple-dark hover:to-brand-purple border-0 shadow-[0_0_30px_rgba(168,85,247,0.4)] hover:shadow-[0_0_50px_rgba(217,70,239,0.6)] transition-all flex items-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isStarting ? (
                                        <>
                                            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            PREPARING INTERVIEW...
                                        </>
                                    ) : (
                                        <>
                                            <PlayCircle className="w-6 h-6 fill-white/20" />
                                            START SIMULATION
                                        </>
                                    )}
                                </Button>

                                <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-slate-400 bg-slate-900/50 px-6 py-3 rounded-full border border-slate-800/80">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${micStatus === 'ready' ? 'bg-emerald-500 animate-pulse' : micStatus === 'testing' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
                                        <Mic className="w-4 h-4 text-slate-300" />
                                        <span>
                                            {micStatus === 'ready' ? 'Microphone Ready' :
                                                micStatus === 'testing' ? 'Testing Mic...' :
                                                    'Mic Denied'}
                                        </span>
                                    </div>
                                    <div className="w-1 h-1 rounded-full bg-slate-700 hidden sm:block" />
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${camStatus === 'ready' ? 'bg-emerald-500 animate-pulse' : camStatus === 'testing' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
                                        <Video className="w-4 h-4 text-slate-300" />
                                        <span>
                                            {camStatus === 'ready' ? 'Camera Ready' :
                                                camStatus === 'testing' ? 'Testing Cam...' :
                                                    'Cam Denied'}
                                        </span>
                                    </div>
                                    <div className="w-1 h-1 rounded-full bg-slate-700 hidden sm:block" />
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${latency ? 'bg-emerald-500 animate-pulse' : 'bg-yellow-500 animate-pulse'}`} />
                                        <Wifi className="w-4 h-4 text-slate-300" />
                                        <span>{latency ? `${latency}ms Latency` : 'Testing Ping...'}</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Dummy Statistics & Analytics Grid */}
                    <div>
                        <h3 className="text-lg font-bold mb-4 tracking-tight">Behavioral & Anti-Cheating Analytics</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                            <Card className="bg-slate-900/40 border-slate-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-400 flex items-center justify-between">
                                        Confidence Score
                                        <Brain className="w-4 h-4 text-brand-purple" />
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold text-white">{userStats.confidenceScore}%</div>
                                    <Progress value={userStats.confidenceScore} className="mt-3 bg-slate-800" />
                                    <p className="text-[10px] text-slate-500 mt-3 leading-tight">Based on voice modulation and sentiment analysis.</p>
                                </CardContent>
                            </Card>

                            <Card className="bg-slate-900/40 border-slate-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-400 flex items-center justify-between">
                                        Focus / Gaze Score
                                        <Eye className="w-4 h-4 text-brand-neon" />
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold text-white">{userStats.gazeScore}%</div>
                                    <Progress value={userStats.gazeScore} className="mt-3 bg-slate-800 [&>div]:bg-brand-neon" />
                                    <p className="text-[10px] text-slate-500 mt-3 leading-tight">Eye contact and attention tracking.</p>
                                </CardContent>
                            </Card>

                            <Card className="bg-slate-900/40 border-slate-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-400 flex items-center justify-between">
                                        Interview Streak
                                        <Flame className="w-4 h-4 text-orange-500" />
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold text-white flex items-center gap-2">
                                        <span className="text-orange-500">🔥</span> {userStats.streak} Days
                                    </div>
                                    <p className="text-xs text-slate-400 mt-3">You're doing great! Keep practicing.</p>
                                </CardContent>
                            </Card>

                            <Card className="bg-slate-900/40 border-slate-800">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-400 flex items-center justify-between">
                                        Mocks Completed
                                        <History className="w-4 h-4 text-emerald-400" />
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold text-white">{userStats.totalMocks}</div>
                                    <p className="text-xs text-slate-400 mt-3">Total full-length interviews completed.</p>
                                </CardContent>
                            </Card>

                        </div>
                    </div>

                    {/* Recent Interviews List */}
                    <div>
                        <h3 className="text-lg font-bold mb-4 tracking-tight">Recent Sessions</h3>
                        <Card className="bg-slate-900/40 border-slate-800 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-400 uppercase bg-slate-950/50 border-b border-slate-800">
                                        <tr>
                                            <th className="px-6 py-4 font-semibold">Date</th>
                                            <th className="px-6 py-4 font-semibold">Type</th>
                                            <th className="px-6 py-4 font-semibold">Persona</th>
                                            <th className="px-6 py-4 font-semibold text-center">Score</th>
                                            <th className="px-6 py-4 font-semibold text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentInterviews.map((interview) => (
                                            <tr key={interview.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                                                <td className="px-6 py-4 text-slate-300 font-medium whitespace-nowrap">{interview.date}</td>
                                                <td className="px-6 py-4 text-slate-400">{interview.type}</td>
                                                <td className="px-6 py-4">
                                                    <Badge variant="outline" className="border-slate-700 bg-slate-900 font-normal">
                                                        {interview.persona}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 font-bold text-center">
                                                    <span className={parseInt(interview.score) > 85 ? "text-emerald-400" : "text-brand-purple"}>{interview.score}</span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <Button variant="secondary" size="sm" className="h-8 shadow-sm">
                                                        View Report
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                        {recentInterviews.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                                                    No interviews completed yet. Start your first mock today!
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>

                </div>
            </main>
        </div>
    );
}
