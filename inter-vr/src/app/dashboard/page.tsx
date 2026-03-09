"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { createClient } from "@/utils/supabase/client";
import {
    History,
    Mic,
    Video,
    Wifi,
    Brain,
    Eye,
    Flame,
    PlayCircle,
    User as UserIcon,
    FileText,
    ChevronDown,
    X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const supabase = createClient();


export default function DashboardPage() {
    const [selectedTopics, setSelectedTopics] = useState<string[]>(["Next.js & React"]);
    const [isTopicDropdownOpen, setIsTopicDropdownOpen] = useState(false);

    // Constant list of topics
    const availableTopics = [
        "Next.js & React",
        "Flutter & Dart",
        "PostgreSQL",
        "Docker & K8s",
        "System Design",
        "Behavioral",
        "Python & Django",
        "Go & Microservices",
        "Java & Spring Boot"
    ];
    const [difficulty, setDifficulty] = useState("Medium (Junior/Mid)");
    const [duration, setDuration] = useState("Short (15m)");
    const [tone, setTone] = useState("Strict");
    const [isStarting, setIsStarting] = useState(false);

    const [userData, setUserData] = useState<any>(null);
    const [recentInterviews, setRecentInterviews] = useState<any[]>([]);
    const [stats, setStats] = useState({
        confidenceScore: 0,
        gazeScore: 0,
        streak: 0,
        totalMocks: 0
    });
    const [loading, setLoading] = useState(true);

    const router = useRouter();

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    router.push("/login");
                    return;
                }

                // Fetch user profile
                const { data: profile } = await supabase
                    .from("users")
                    .select("*")
                    .eq("id", user.id)
                    .single();
                setUserData(profile);

                // Fetch recent sessions and their reports
                const { data: sessData, error: sessError } = await supabase
                    .from("interview_sessions")
                    .select(`
                        *,
                        reports: interview_reports(*)
                    `)
                    .eq("user_id", user.id)
                    .order("created_at", { ascending: false })
                    .limit(10);

                if (sessError) throw sessError;

                // Map sessions to UI format
                const mappedInterviews = (sessData || []).map((sess: any) => {
                    const report = sess.reports?.[0];
                    return {
                        id: sess.id,
                        reportId: report?.id || null,
                        date: new Date(sess.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                        }),
                        type: sess.topic,
                        persona: sess.tone,
                        score: report ? `${report.overall_score}%` : "Pending",
                        rawScore: report?.overall_score || 0,
                        status: sess.status
                    };
                });
                setRecentInterviews(mappedInterviews);

                // Calculate Stats
                const completedMocks = sessData?.filter(s => s.status === 'completed').length || 0;
                const reports = sessData?.flatMap(s => s.reports || []).filter(r => r) || [];

                const avgScore = reports.length > 0
                    ? Math.round(reports.reduce((acc, curr) => acc + (curr.overall_score || 0), 0) / reports.length)
                    : 0;

                // Extract gaze/confidence from breakdown if available, else use avgScore as proxy
                let totalGaze = 0;
                let reportsWithGaze = 0;
                reports.forEach(r => {
                    const breakdown = r.breakdown as any;
                    if (breakdown?.behavioral?.gaze_score) {
                        totalGaze += breakdown.behavioral.gaze_score;
                        reportsWithGaze++;
                    }
                });

                setStats({
                    confidenceScore: avgScore,
                    gazeScore: reportsWithGaze > 0 ? Math.round(totalGaze / reportsWithGaze) : (avgScore > 0 ? avgScore + 5 : 0),
                    streak: 0, // logic for streak can be added later
                    totalMocks: completedMocks
                });

            } catch (error: any) {
                console.error("Error fetching dashboard data:", error);
                toast.error("Failed to load dashboard data");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [router]);

    const startSimulation = async () => {
        setIsStarting(true);
        try {
            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) throw new Error("Please sign in first.");

            const { data: { session: authSession } } = await supabase.auth.getSession();
            const token = authSession?.access_token || "";

            const { data: session, error: sessionError } = await supabase
                .from("interview_sessions")
                .insert({
                    user_id: user.id,
                    topic: selectedTopics.join(", "),
                    difficulty,
                    duration,
                    tone,
                    status: "pending",
                })
                .select()
                .single();

            if (sessionError || !session) throw new Error(sessionError?.message || "Failed to create session");

            toast.loading("Generating interview questions...", { id: "gen-questions" });

            const genResponse = await fetch("/api/generate-questions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ sessionId: session.id }),
            });

            if (!genResponse.ok) {
                const errData = await genResponse.json();
                throw new Error(errData.error || "Failed to generate questions");
            }

            toast.success("Interview ready! Entering room...", { id: "gen-questions" });
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
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (mounted) setMicStatus('ready');
                audioStream.getTracks().forEach(track => track.stop());
            } catch (err) {
                if (mounted) setMicStatus('error');
            }

            try {
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (mounted) setCamStatus('ready');
                videoStream.getTracks().forEach(track => track.stop());
            } catch (err) {
                if (mounted) setCamStatus('error');
            }

            const pingStart = performance.now();
            try {
                await fetch("/api/ping", { method: "HEAD", cache: "no-store" });
                const rtt = Math.round(performance.now() - pingStart);
                if (mounted) setLatency(rtt);
            } catch {
                if (mounted) setLatency(null);
            }
        };

        checkHardware();
        return () => { mounted = false; };
    }, []);

    const userFirstName = userData?.full_name?.split(' ')[0] || "Guest";
    const userRole = userData?.tech_stack || "Candidate";
    const userInitial = userData?.full_name?.charAt(0) || "G";
    const hasResume = !!userData?.processed_resume;

    return (
        <div className="flex min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-brand-purple/30">

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden relative">
                {/* Background glow effects */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-purple/10 rounded-full blur-[120px] pointer-events-none -mr-40 -mt-20 mix-blend-screen" />
                <div className="absolute bottom-40 left-20 w-[400px] h-[400px] bg-brand-neon/5 rounded-full blur-[100px] pointer-events-none mix-blend-screen" />

                {/* Dashboard Content */}
                <div className="flex-1 p-4 md:p-8 space-y-8 max-w-7xl mx-auto w-full z-10">
                    <div className="mb-2 md:mb-4">
                        <h1 className="text-3xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 tracking-tight">Welcome back, {userFirstName}</h1>
                    </div>

                    {/* Primary Action Card: Enter VR Room */}
                    <Card className="relative overflow-hidden border-slate-700/60 bg-slate-950/40 backdrop-blur-xl shadow-2xl">
                        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-brand-purple to-transparent opacity-50" />

                        <CardHeader className="text-center md:text-left">
                            <CardTitle className="text-2xl md:text-3xl font-extrabold tracking-tight">Enter the VR Interview Room</CardTitle>
                            <CardDescription className="text-base text-slate-400">Configure your simulation parameters. The AI will adapt dynamically to your answers.</CardDescription>

                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-4">
                                <Badge variant="purple" className="flex items-center gap-1.5 px-3 py-1"><UserIcon className="w-3 h-3" /> Interview Profile Ready</Badge>
                                <Badge variant="neon" className="flex items-center gap-1.5 px-3 py-1"><Brain className="w-3 h-3" /> Tech: {userRole}</Badge>
                                <Badge variant="outline" className={`flex items-center gap-1.5 px-3 py-1 ${hasResume ? 'bg-slate-800/50' : 'bg-red-900/20 text-red-400 border-red-800/50'}`}>
                                    <FileText className="w-3 h-3" /> Resume: {hasResume ? "Attached" : "Missing"}
                                </Badge>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                                <div className="space-y-2 relative md:col-span-2 lg:col-span-2">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Topics</label>

                                    {/* Custom Multi-Select Input Box */}
                                    <div
                                        className="w-full min-h-[42px] bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-sm focus-within:border-brand-purple focus-within:ring-1 focus-within:ring-brand-purple transition-all cursor-text flex flex-wrap gap-2 items-center relative"
                                        onClick={() => setIsTopicDropdownOpen(!isTopicDropdownOpen)}
                                    >
                                        <div className="flex flex-wrap gap-2 flex-grow">
                                            {selectedTopics.length === 0 && (
                                                <span className="text-slate-500 py-0.5">Select technologies or topics...</span>
                                            )}
                                            {selectedTopics.map(t => (
                                                <div key={t} className="flex items-center gap-1 bg-brand-purple/20 text-brand-neon px-2.5 py-1 rounded-md text-xs border border-brand-purple/30 group">
                                                    <span>{t}</span>
                                                    <button
                                                        className="hover:text-white transition-colors focus:outline-none"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedTopics(prev => prev.filter(item => item !== t));
                                                        }}
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <button className="text-slate-400 p-1">
                                            <ChevronDown className={`w-4 h-4 transition-transform ${isTopicDropdownOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        {/* Dropdown Menu */}
                                        {isTopicDropdownOpen && (
                                            <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden py-2 max-h-60 overflow-y-auto">
                                                {availableTopics.filter(t => !selectedTopics.includes(t)).map(topicOption => (
                                                    <div
                                                        key={topicOption}
                                                        className="px-4 py-2 hover:bg-brand-purple/20 hover:text-brand-neon cursor-pointer text-sm text-slate-300 transition-colors"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (!selectedTopics.includes(topicOption)) {
                                                                setSelectedTopics(prev => [...prev, topicOption]);
                                                            }
                                                            setIsTopicDropdownOpen(false);
                                                        }}
                                                    >
                                                        {topicOption}
                                                    </div>
                                                ))}
                                                {availableTopics.filter(t => !selectedTopics.includes(t)).length === 0 && (
                                                    <div className="px-4 py-3 text-sm text-slate-500 text-center">
                                                        All available topics selected
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Overlay to close dropdown when clicking outside */}
                                    {isTopicDropdownOpen && (
                                        <div
                                            className="fixed inset-0 z-40 bg-transparent"
                                            onClick={() => setIsTopicDropdownOpen(false)}
                                        />
                                    )}
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

                    {/* Analytics Grid */}
                    <div>
                        <h3 className="text-lg font-bold mb-4 tracking-tight">Your Performance Analytics</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                            <Card className="bg-slate-900/40 border-slate-800 relative overflow-hidden">
                                {loading && <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-sm z-10 flex items-center justify-center"><div className="w-5 h-5 border-2 border-brand-purple border-t-transparent rounded-full animate-spin"></div></div>}
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-400 flex items-center justify-between">
                                        Avg. Interview Score
                                        <Brain className="w-4 h-4 text-brand-purple" />
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold text-white">{stats.confidenceScore}%</div>
                                    <Progress value={stats.confidenceScore} className="mt-3 bg-slate-800" />
                                    <p className="text-[10px] text-slate-500 mt-3 leading-tight">Based on recent performance scores.</p>
                                </CardContent>
                            </Card>

                            <Card className="bg-slate-900/40 border-slate-800 relative overflow-hidden">
                                {loading && <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-sm z-10 flex items-center justify-center"><div className="w-5 h-5 border-2 border-brand-purple border-t-transparent rounded-full animate-spin"></div></div>}
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-400 flex items-center justify-between">
                                        Focus / Gaze Score
                                        <Eye className="w-4 h-4 text-brand-neon" />
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold text-white">{stats.gazeScore}%</div>
                                    <Progress value={stats.gazeScore} className="mt-3 bg-slate-800 [&>div]:bg-brand-neon" />
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
                                        <span className="text-orange-500">🔥</span> {stats.streak} Days
                                    </div>
                                    <p className="text-xs text-slate-400 mt-3">Practice daily to build your streak!</p>
                                </CardContent>
                            </Card>

                            <Card className="bg-slate-900/40 border-slate-800 relative overflow-hidden">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-400 flex items-center justify-between">
                                        Resume Status
                                        <FileText className="w-4 h-4 text-brand-neon" />
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {loading ? (
                                        <div className="text-2xl font-bold text-slate-600">...</div>
                                    ) : hasResume ? (
                                        <>
                                            <div className="text-2xl font-bold text-brand-neon">Parsed & Ready</div>
                                            <p className="text-[10px] text-slate-500 mt-3 leading-tight">AI will tailor questions based on your background.</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-2xl font-bold text-red-400">Not Uploaded</div>
                                            <button onClick={() => router.push('/profile')} className="text-xs text-brand-purple mt-3 hover:underline">Upload Resume →</button>
                                        </>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="bg-slate-900/40 border-slate-800 relative overflow-hidden">
                                {loading && <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-sm z-10 flex items-center justify-center"><div className="w-5 h-5 border-2 border-brand-purple border-t-transparent rounded-full animate-spin"></div></div>}
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-400 flex items-center justify-between">
                                        Mocks Completed
                                        <History className="w-4 h-4 text-emerald-400" />
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold text-white">{stats.totalMocks}</div>
                                    <p className="text-xs text-slate-400 mt-3">Total successful interviews completed.</p>
                                </CardContent>
                            </Card>

                        </div>
                    </div>

                    {/* Recent Interviews List */}
                    <div>
                        <h3 className="text-lg font-bold mb-4 tracking-tight">Recent Sessions</h3>
                        <Card className="bg-slate-900/40 border-slate-800 overflow-hidden relative min-h-[150px]">
                            {loading && (
                                <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
                                    <div className="w-8 h-8 border-2 border-brand-purple border-t-transparent rounded-full animate-spin"></div>
                                    <span className="text-sm text-slate-400">Loading history...</span>
                                </div>
                            )}
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
                                        {!loading && recentInterviews.map((interview) => (
                                            <tr key={interview.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                                                <td className="px-6 py-4 text-slate-300 font-medium whitespace-nowrap">{interview.date}</td>
                                                <td className="px-6 py-4 text-slate-400">{interview.type}</td>
                                                <td className="px-6 py-4">
                                                    <Badge variant="outline" className="border-slate-700 bg-slate-900 font-normal">
                                                        {interview.persona}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 font-bold text-center">
                                                    {interview.status === "completed" ? (
                                                        <span className={interview.rawScore > 85 ? "text-emerald-400" : "text-brand-purple"}>{interview.score}</span>
                                                    ) : (
                                                        <Badge variant="outline" className="text-yellow-500/80 border-yellow-500/30">Incomplete</Badge>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {interview.status === "completed" && interview.reportId ? (
                                                        <Button variant="secondary" size="sm" className="h-8 shadow-sm" onClick={() => router.push(`/report/${interview.reportId}`)}>
                                                            View Report
                                                        </Button>
                                                    ) : (
                                                        <Button variant="outline" size="sm" className="h-8 shadow-sm border-slate-700 text-slate-400 hover:text-white" onClick={() => router.push(`/interview/${interview.id}`)}>
                                                            Resume/Retry
                                                        </Button>
                                                    )}

                                                </td>
                                            </tr>
                                        ))}
                                        {!loading && recentInterviews.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-12 text-center">
                                                    <div className="flex flex-col items-center justify-center gap-2">
                                                        <History className="w-8 h-8 text-slate-700" />
                                                        <p className="text-slate-400 font-medium">No interviews completed yet.</p>
                                                        <p className="text-slate-500 text-xs text-balance">When you complete your first mock interview, your details and report will show up here.</p>
                                                    </div>
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
