"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { createClient } from "@/utils/supabase/client";
import {
  History,
  Mic,
  Video,
  Camera,
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// FIX 1: supabase is instantiated once outside the component so it's a stable
// singleton — safe to omit from dependency arrays (it never changes).
const supabase = createClient();

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// FIX 2: Proper types instead of any[]
interface InterviewRow {
  id: string;
  reportId: string | null;
  date: string;
  type: string;
  persona: string;
  score: string;
  rawScore: number;
  status: string;
}

interface ReportRow {
  id: string;
  overall_score: number;
  breakdown: unknown;
}

interface SessionRow {
  id: string;
  created_at: string;
  topic: string;
  tone: string;
  status: string;
  user_id: string;
  reports: ReportRow[];
}

interface UserProfile {
  id: string;
  full_name: string | null;
  tech_stack: string | null;
  processed_resume: string | null;
  avatar_url: string | null;
}

interface Breakdown {
  behavioral?: {
    gaze_score?: number;
  };
}

function StreakCalendar({
  recentInterviews,
}: {
  recentInterviews: InterviewRow[];
}) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const activeDays = useMemo(() => {
    const set = new Set<number>();
    recentInterviews.forEach((iv) => {
      const d = new Date(iv.date);
      if (d.getMonth() === month && d.getFullYear() === year) {
        set.add(d.getDate());
      }
    });
    return set;
  }, [recentInterviews, month, year]);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="flex-1 flex flex-col">
      <div className="text-xs font-semibold text-slate-500 mb-3">
        {MONTH_NAMES[month]} {year}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_LABELS.map((l) => (
          <div key={l} className="text-[10px] font-medium text-slate-400 pb-1">
            {l}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const isToday = day === today.getDate();
          const isActive = activeDays.has(day);
          return (
            <div
              key={day}
              className={`relative aspect-square flex items-center justify-center rounded-md text-[11px] font-medium transition-colors
                ${isToday ? "ring-1 ring-orange-500 text-orange-600 font-bold" : ""}
                ${isActive ? "bg-orange-500/20 text-orange-600" : "text-slate-500 hover:bg-slate-100"}
              `}
            >
              {day}
              {isActive && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-500" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [selectedTopics, setSelectedTopics] = useState<string[]>([
    "Next.js & React",
  ]);
  const [isTopicDropdownOpen, setIsTopicDropdownOpen] = useState(false);

  const availableTopics = [
    "Next.js & React",
    "Flutter & Dart",
    "PostgreSQL",
    "Docker & K8s",
    "System Design",
    "Behavioral",
    "Python & Django",
    "Go & Microservices",
    "Java & Spring Boot",
  ];
  const [difficulty, setDifficulty] = useState("Medium (Junior/Mid)");
  const [duration, setDuration] = useState("Short (15m)");
  const [tone, setTone] = useState("Strict");
  const [isStarting, setIsStarting] = useState(false);

  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [recentInterviews, setRecentInterviews] = useState<InterviewRow[]>([]);
  const [stats, setStats] = useState({
    confidenceScore: 0,
    gazeScore: 0,
    streak: 0,
    totalMocks: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // FIX 3: Use a ref for router.push to avoid router being a useEffect dependency
  // (Next.js router object is not stable across renders and causes infinite loops).
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          routerRef.current.push("/login");
          return;
        }

        // FIX 4: Throw on profile fetch failure instead of silently setting null
        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("*")
          .eq("id", user.id)
          .single();

        if (profileError) throw profileError;
        setUserData(profile as UserProfile);

        // Fetch recent sessions and their reports
        // FIX 5: Sort reports by created_at desc so reports?.[0] is always the latest
        const { data: sessData, error: sessError } = await supabase
          .from("interview_sessions")
          .select(
            `
              *,
              reports: interview_reports(*)
            `,
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .order("created_at", {
            ascending: false,
            referencedTable: "interview_reports",
          })
          .limit(10);

        if (sessError) throw sessError;

        const mappedInterviews: InterviewRow[] = (
          (sessData as SessionRow[]) || []
        ).map((sess) => {
          // reports are sorted desc, so index 0 is the latest
          const report = sess.reports?.[0] ?? null;
          return {
            id: sess.id,
            reportId: report?.id ?? null,
            date: new Date(sess.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            type: sess.topic,
            persona: sess.tone,
            score: report ? `${report.overall_score}%` : "Pending",
            rawScore: report?.overall_score ?? 0,
            status: sess.status,
          };
        });
        setRecentInterviews(mappedInterviews);

        // Calculate Stats
        const completedMocks =
          (sessData as SessionRow[])?.filter((s) => s.status === "completed")
            .length ?? 0;

        const reports: ReportRow[] =
          (sessData as SessionRow[])
            ?.flatMap((s) => s.reports ?? [])
            .filter(Boolean) ?? [];

        const avgScore =
          reports.length > 0
            ? Math.round(
                reports.reduce(
                  (acc, curr) => acc + (curr.overall_score ?? 0),
                  0,
                ) / reports.length,
              )
            : 0;

        // FIX 6: Use typed Breakdown instead of casting to any
        let totalGaze = 0;
        let reportsWithGaze = 0;
        reports.forEach((r) => {
          const breakdown = r.breakdown as Breakdown | null;
          const gazeScore = breakdown?.behavioral?.gaze_score;
          if (typeof gazeScore === "number") {
            totalGaze += gazeScore;
            reportsWithGaze++;
          }
        });

        setStats({
          confidenceScore: avgScore,
          gazeScore:
            reportsWithGaze > 0
              ? Math.round(totalGaze / reportsWithGaze)
              : avgScore > 0
                ? avgScore + 5
                : 0,
          streak: 0,
          totalMocks: completedMocks,
        });
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        toast.error("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // FIX 7: Empty dependency array — supabase is a stable singleton (defined outside
    // the component) and router is accessed via routerRef, so neither belongs here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    buttonRef.current.style.setProperty("--mouse-x", `${x}px`);
    buttonRef.current.style.setProperty("--mouse-y", `${y}px`);
  };

  const startSimulation = async () => {
    setIsStarting(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please sign in first.");

      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      const token = authSession?.access_token ?? "";

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

      if (sessionError || !session)
        throw new Error(sessionError?.message ?? "Failed to create session");

      toast.loading("Generating interview questions...", {
        id: "gen-questions",
      });

      const genResponse = await fetch("/api/generate-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId: session.id }),
      });

      if (!genResponse.ok) {
        const errData = await genResponse.json();
        throw new Error(errData.error ?? "Failed to generate questions");
      }

      toast.success("Interview ready! Entering room...", {
        id: "gen-questions",
      });
      router.push(`/interview/${session.id}`);
    } catch (error) {
      toast.dismiss("gen-questions");
      toast.error(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setIsStarting(false);
    }
  };

  const [micStatus, setMicStatus] = useState<"testing" | "ready" | "error">(
    "testing",
  );
  const [camStatus, setCamStatus] = useState<"testing" | "ready" | "error">(
    "testing",
  );
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkHardware = async () => {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        if (mounted) setMicStatus("ready");
        audioStream.getTracks().forEach((track) => track.stop());
      } catch {
        if (mounted) setMicStatus("error");
      }

      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        if (mounted) setCamStatus("ready");
        videoStream.getTracks().forEach((track) => track.stop());
      } catch {
        if (mounted) setCamStatus("error");
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
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    if (showCamera && videoRef.current) {
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((s) => {
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
        })
        .catch(() => setShowCamera(false));
    }
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [showCamera]);

  const userFirstName = userData?.full_name?.split(" ")[0] ?? "Guest";
  const userRole = userData?.tech_stack ?? "Candidate";
  const userInitial = userData?.full_name?.charAt(0) ?? "G";
  const hasResume = !!userData?.processed_resume;
  const userAvatar = userData?.avatar_url;

  return (
    <div className="relative min-h-screen bg-[linear-gradient(to_bottom_right,var(--color-blue-500),var(--color-blue-300),var(--color-orange-300),var(--color-orange-500))] text-slate-900 font-sans selection:bg-orange-500/30 overflow-x-hidden">
      <div className="relative p-4 md:p-8 space-y-8 max-w-7xl mx-auto w-full z-10">
        <div className="mb-2 md:mb-4">
          <h1 className="text-3xl md:text-5xl font-extrabold text-white drop-shadow-sm tracking-tight">
            Welcome back, {userFirstName}
          </h1>
        </div>

        {/* Top Section: 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Left: User Profile / Camera Card */}
          <Card
            className="bg-white/80 border-slate-200 shadow-xl backdrop-blur-xl rounded-[2rem] relative overflow-hidden cursor-pointer group"
            onClick={() => setShowCamera((prev) => !prev)}
          >
            <CardContent className="p-10 flex flex-col items-center h-full">
              <div className="relative">
                <div className="relative w-[200px] aspect-square rounded-full overflow-hidden">
                  {showCamera ? (
                    <div>
                      <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full aspect-square rounded-full object-cover scale-x-[-1]"
                      />
                    </div>
                  ) : userAvatar ? (
                    <img
                      src={userAvatar}
                      alt={userFirstName}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="rounded-full aspect-square bg-linear-to-br from-orange-400 to-orange-600 flex items-center justify-center">
                      <span className="text-7xl font-black text-white">
                        {userInitial}
                      </span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="flex items-center gap-2 text-white text-sm font-medium bg-black/60 px-4 py-2 rounded-full backdrop-blur-sm">
                      <Camera className="w-4 h-4" />
                      {showCamera ? "Show Profile" : "Show Camera"}
                    </div>
                  </div>
                </div>
                <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-red-500/90 px-2.5 py-1 rounded-full text-[10px] font-bold text-white uppercase tracking-wider">
                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  Live
                </div>
              </div>
              <div className="p-4 text-center w-full">
                <p className="font-bold text-lg text-slate-900">
                  {userData?.full_name ?? "Guest"}
                </p>
                <p className="text-xs text-slate-500 mt-1">{userRole}</p>
              </div>
            </CardContent>
          </Card>

          {/* Right: Primary Action Card */}
          <Card className="relative overflow-hidden border-slate-200 bg-white/80 backdrop-blur-xl shadow-2xl rounded-[2rem]">
            <CardHeader className="text-center md:text-left">
              <CardTitle className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
                Enter the VR Interview Room
              </CardTitle>
              <CardDescription className="text-base text-slate-500">
                Configure your simulation parameters. The AI will adapt
                dynamically to your answers.
              </CardDescription>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-4">
                <Badge
                  variant="default"
                  className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white"
                >
                  <UserIcon className="w-3 h-3" /> Interview Profile Ready
                </Badge>
                <Badge
                  variant="secondary"
                  className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                >
                  <Brain className="w-3 h-3 text-orange-500" /> Tech: {userRole}
                </Badge>
                <Badge
                  variant="outline"
                  className={`flex items-center gap-1.5 px-3 py-1 font-medium ${hasResume ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}`}
                >
                  <FileText className="w-3 h-3" /> Resume:{" "}
                  {hasResume ? "Attached" : "Missing"}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2 relative md:col-span-2 lg:col-span-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Topics
                  </label>

                  <DropdownMenu
                    open={isTopicDropdownOpen}
                    onOpenChange={setIsTopicDropdownOpen}
                  >
                    <DropdownMenuTrigger asChild>
                      <div className="w-full min-h-[42px] bg-white border border-slate-300 shadow-sm rounded-lg px-2 py-2 text-sm focus-within:border-orange-500 focus-within:ring-1 focus-within:ring-orange-500 transition-all cursor-pointer flex flex-wrap gap-2 items-center relative">
                        <div className="flex flex-wrap gap-2 flex-grow">
                          {selectedTopics.length === 0 && (
                            <span className="text-slate-400 py-0.5 pointer-events-none">
                              Select technologies or topics...
                            </span>
                          )}
                          {selectedTopics.map((t) => (
                            <div
                              key={t}
                              className="flex items-center gap-1 bg-orange-100 text-orange-800 font-medium px-2.5 py-1 rounded-md text-xs border border-orange-200 group"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span>{t}</span>
                              <button
                                className="hover:text-amber-900 transition-colors focus:outline-none"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTopics((prev) =>
                                    prev.filter((item) => item !== t),
                                  );
                                }}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="text-slate-400 p-1">
                          <ChevronDown
                            className={`w-4 h-4 transition-transform ${isTopicDropdownOpen ? "rotate-180" : ""}`}
                          />
                        </div>
                      </div>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                      className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-60 bg-white border-slate-200"
                      align="start"
                      sideOffset={8}
                    >
                      {availableTopics.map((topicOption) => (
                        <DropdownMenuCheckboxItem
                          key={topicOption}
                          checked={selectedTopics.includes(topicOption)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedTopics((prev) => [
                                ...prev,
                                topicOption,
                              ]);
                            } else {
                              setSelectedTopics((prev) =>
                                prev.filter((t) => t !== topicOption),
                              );
                            }
                          }}
                        >
                          {topicOption}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Difficulty
                  </label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger className="w-full bg-white border border-slate-300 shadow-sm text-slate-900 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all">
                      <SelectValue placeholder="Select difficulty" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Easy (Intern)">
                        Easy (Intern)
                      </SelectItem>
                      <SelectItem value="Medium (Junior/Mid)">
                        Medium (Junior/Mid)
                      </SelectItem>
                      <SelectItem value="Hard (Senior)">
                        Hard (Senior)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Duration
                  </label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger className="w-full bg-white border border-slate-300 shadow-sm text-slate-900 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all">
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Short (15m)">Short (15m)</SelectItem>
                      <SelectItem value="Medium (30m)">Medium (30m)</SelectItem>
                      <SelectItem value="Long (45m)">Long (45m)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Interviewer Tone
                  </label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger className="w-full bg-white border border-slate-300 shadow-sm text-slate-900 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all">
                      <SelectValue placeholder="Select tone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Strict">Strict</SelectItem>
                      <SelectItem value="Casual">Casual</SelectItem>
                      <SelectItem value="Friendly">Friendly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pt-4 flex flex-col items-center gap-6">
                <Button
                  ref={buttonRef}
                  onClick={startSimulation}
                  onMouseMove={handleMouseMove}
                  disabled={isStarting}
                  className="group relative overflow-hidden w-full md:w-2/3 h-16 text-lg font-bold rounded-full bg-linear-to-r from-orange-400 to-orange-500 hover:from-orange-500 hover:to-orange-600 text-white transition-all duration-300 shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_12px_25px_rgba(249,115,22,0.4)] disabled:opacity-70 disabled:cursor-not-allowed border-none"
                >
                  <div className="relative z-10 flex items-center justify-center gap-3">
                    {isStarting ? (
                      <>
                        <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                        PREPARING INTERVIEW...
                      </>
                    ) : (
                      <>
                        <PlayCircle className="w-6 h-6 fill-white/20 text-white" />
                        START SIMULATION
                      </>
                    )}
                  </div>
                </Button>

                <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-slate-600 bg-white/50 px-6 py-3 rounded-full border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${micStatus === "ready" ? "bg-emerald-500 animate-pulse" : micStatus === "testing" ? "bg-yellow-500 animate-pulse" : "bg-red-500"}`}
                    />
                    <Mic className="w-4 h-4 text-slate-400" />
                    <span>
                      {micStatus === "ready"
                        ? "Microphone Ready"
                        : micStatus === "testing"
                          ? "Testing Mic..."
                          : "Mic Denied"}
                    </span>
                  </div>
                  <div className="w-1 h-1 rounded-full bg-slate-300 hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${camStatus === "ready" ? "bg-emerald-500 animate-pulse" : camStatus === "testing" ? "bg-yellow-500 animate-pulse" : "bg-red-500"}`}
                    />
                    <Video className="w-4 h-4 text-slate-400" />
                    <span>
                      {camStatus === "ready"
                        ? "Camera Ready"
                        : camStatus === "testing"
                          ? "Testing Cam..."
                          : "Cam Denied"}
                    </span>
                  </div>
                  <div className="w-1 h-1 rounded-full bg-slate-300 hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${latency ? "bg-emerald-500 animate-pulse" : "bg-yellow-500 animate-pulse"}`}
                    />
                    <Wifi className="w-4 h-4 text-slate-400" />
                    <span>
                      {latency ? `${latency}ms Latency` : "Testing Ping..."}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Analytics Bento Grid */}
        <div>
          <h3 className="text-lg font-bold mb-4 tracking-tight text-slate-900">
            Your Performance Analytics
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="bg-white/80 border-slate-200 shadow-md backdrop-blur-md relative overflow-hidden">
                {loading && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-slate-500 uppercase flex items-center justify-between">
                    Avg. Interview Score
                    <Brain className="w-4 h-4 text-orange-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-black text-slate-900">
                    {stats.confidenceScore}%
                  </div>
                  <Progress
                    value={stats.confidenceScore}
                    className="mt-3 h-1.5 bg-slate-200 [&>div]:bg-orange-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-3 font-medium leading-tight">
                    Based on recent performance scores.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white/80 border-slate-200 shadow-md backdrop-blur-md relative overflow-hidden">
                {loading && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-slate-500 uppercase flex items-center justify-between">
                    Focus / Gaze Score
                    <Eye className="w-4 h-4 text-amber-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-black text-slate-900">
                    {stats.gazeScore}%
                  </div>
                  <Progress
                    value={stats.gazeScore}
                    className="mt-3 h-1.5 bg-slate-200 [&>div]:bg-amber-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-3 font-medium leading-tight">
                    Eye contact and attention tracking.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white/80 border-slate-200 shadow-md backdrop-blur-md relative overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-slate-500 uppercase flex items-center justify-between">
                    Resume Status
                    <FileText className="w-4 h-4 text-orange-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-2xl font-black text-slate-300">
                      ...
                    </div>
                  ) : hasResume ? (
                    <>
                      <div className="text-2xl font-black text-emerald-600">
                        Parsed & Ready
                      </div>
                      <p className="text-[10px] text-slate-400 mt-3 font-medium leading-tight">
                        AI will tailor questions based on your background.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-2xl font-black text-red-500">
                        Not Uploaded
                      </div>
                      <button
                        onClick={() => router.push("/profile")}
                        className="text-xs font-bold text-orange-500 mt-3 hover:text-orange-600 transition-colors"
                      >
                        Upload Resume →
                      </button>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white/80 border-slate-200 shadow-md backdrop-blur-md relative overflow-hidden">
                {loading && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-slate-500 uppercase flex items-center justify-between">
                    Mocks Completed
                    <History className="w-4 h-4 text-slate-600" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-black text-slate-900">
                    {stats.totalMocks}
                  </div>
                  <p className="text-xs text-slate-400 mt-3 font-medium">
                    Total successful interviews completed.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Right: Streak Calendar */}
            <Card className="bg-white/80 border-slate-200 shadow-xl backdrop-blur-xl rounded-[2rem] relative overflow-hidden flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-slate-500 uppercase flex items-center justify-between">
                  Interview Streak
                  <Flame className="w-4 h-4 text-orange-500" />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-3xl font-black text-slate-900 flex items-center gap-2">
                    🔥 {stats.streak} Days
                  </span>
                </div>

                <StreakCalendar recentInterviews={recentInterviews} />

                <p className="text-xs text-slate-400 font-medium mt-auto pt-3">
                  Practice daily to build your streak!
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Interviews List */}
        <div>
          <h3 className="text-lg font-bold mb-4 tracking-tight text-slate-900">
            Recent Sessions
          </h3>
          <Card className="bg-white/80 border-slate-200 shadow-md backdrop-blur-md overflow-hidden relative min-h-[150px] rounded-xl">
            {loading && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm font-medium text-slate-500">
                  Loading history...
                </span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-bold">Date</th>
                    <th className="px-6 py-4 font-bold">Type</th>
                    <th className="px-6 py-4 font-bold">Persona</th>
                    <th className="px-6 py-4 font-bold text-center">Score</th>
                    <th className="px-6 py-4 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading &&
                    recentInterviews.map((interview) => (
                      <tr
                        key={interview.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="px-6 py-4 text-slate-600 font-medium whitespace-nowrap">
                          {interview.date}
                        </td>
                        <td className="px-6 py-4 text-slate-900 font-medium">
                          {interview.type}
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-white text-slate-600 font-semibold"
                          >
                            {interview.persona}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 font-black text-center text-base">
                          {interview.status === "completed" ? (
                            <span
                              className={
                                interview.rawScore > 85
                                  ? "text-emerald-500"
                                  : "text-orange-500"
                              }
                            >
                              {interview.score}
                            </span>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-amber-600 bg-amber-50 border-amber-200 font-semibold"
                            >
                              Incomplete
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {interview.status === "completed" &&
                          interview.reportId ? (
                            <Button
                              variant="default"
                              size="sm"
                              className="h-8 shadow-[0_4px_10px_rgba(249,115,22,0.2)] bg-linear-to-r from-orange-400 to-orange-500 text-white hover:from-orange-500 hover:to-orange-600 rounded-full font-bold px-4"
                              onClick={() =>
                                router.push(`/report/${interview.reportId}`)
                              }
                            >
                              View Report
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 shadow-sm border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-full font-bold px-4 transition-colors"
                              onClick={() =>
                                router.push(`/interview/${interview.id}`)
                              }
                            >
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
                          <History className="w-8 h-8 text-slate-300" />
                          <p className="text-slate-600 font-bold">
                            No interviews completed yet.
                          </p>
                          <p className="text-slate-400 text-xs font-medium text-balance max-w-sm mt-1">
                            When you complete your first mock interview, your
                            details and report will show up here.
                          </p>
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
    </div>
  );
}
