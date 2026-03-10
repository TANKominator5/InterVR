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

function StreakCalendar({ recentInterviews }: { recentInterviews: any[] }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  // Build a set of active days from interviews this month
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
      <div className="text-xs font-semibold text-muted-foreground mb-3">
        {MONTH_NAMES[month]} {year}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_LABELS.map((l) => (
          <div
            key={l}
            className="text-[10px] font-medium text-muted-foreground/60 pb-1"
          >
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
                ${isToday ? "ring-1 ring-primary text-primary font-bold" : ""}
                ${isActive ? "bg-orange-500/20 text-orange-400" : "text-muted-foreground hover:bg-muted/40"}
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
    "Java & Spring Boot",
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
    totalMocks: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
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
          .select(
            `
                        *,
                        reports: interview_reports(*)
                    `,
          )
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
            date: new Date(sess.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            type: sess.topic,
            persona: sess.tone,
            score: report ? `${report.overall_score}%` : "Pending",
            rawScore: report?.overall_score || 0,
            status: sess.status,
          };
        });
        setRecentInterviews(mappedInterviews);

        // Calculate Stats
        const completedMocks =
          sessData?.filter((s) => s.status === "completed").length || 0;
        const reports =
          sessData?.flatMap((s) => s.reports || []).filter((r) => r) || [];

        const avgScore =
          reports.length > 0
            ? Math.round(
                reports.reduce(
                  (acc, curr) => acc + (curr.overall_score || 0),
                  0,
                ) / reports.length,
              )
            : 0;

        // Extract gaze/confidence from breakdown if available, else use avgScore as proxy
        let totalGaze = 0;
        let reportsWithGaze = 0;
        reports.forEach((r) => {
          const breakdown = r.breakdown as any;
          if (breakdown?.behavioral?.gaze_score) {
            totalGaze += breakdown.behavioral.gaze_score;
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
          streak: 0, // logic for streak can be added later
          totalMocks: completedMocks,
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

  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Set variables to track mouse position for the background glow
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

      if (sessionError || !session)
        throw new Error(sessionError?.message || "Failed to create session");

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
        throw new Error(errData.error || "Failed to generate questions");
      }

      toast.success("Interview ready! Entering room...", {
        id: "gen-questions",
      });
      router.push(`/interview/${session.id}`);
    } catch (error: any) {
      toast.dismiss("gen-questions");
      toast.error(error.message || "Something went wrong.");
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
      } catch (err) {
        if (mounted) setMicStatus("error");
      }

      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        if (mounted) setCamStatus("ready");
        videoStream.getTracks().forEach((track) => track.stop());
      } catch (err) {
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

  // Camera stream toggle
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

  const userFirstName = userData?.full_name?.split(" ")[0] || "Guest";
  const userRole = userData?.tech_stack || "Candidate";
  const userInitial = userData?.full_name?.charAt(0) || "G";
  const hasResume = !!userData?.processed_resume;
  const userAvatar = userData?.avatar_url;

  return (
    <div className="relative min-h-full bg-background text-foreground font-sans selection:bg-primary/30 overflow-x-hidden">
      {/* Background glow effects */}
      {/* <div className="absolute h-full w-full bg-gradient-to-r from-primary/20 to-primary/30"></div> */}
      {/* Dashboard Content */}
      <div className="relative p-4 md:p-8 space-y-8 max-w-7xl mx-auto w-full z-10">
        <div className="mb-2 md:mb-4">
          <h1 className="text-3xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-foreground to-muted-foreground tracking-tight">
            Welcome back, {userFirstName}
          </h1>
        </div>

        {/* Top Section: 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Left: User Profile / Camera Card */}
          <Card
            className="bg-card/40 border-border relative overflow-hidden cursor-pointer group"
            onClick={() => setShowCamera((prev) => !prev)}
          >
            {/* <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-secondary to-transparent opacity-50" /> */}
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
                    <div className="rounded-full aspect-square bg-gradient-to-br from-primary/30 to-secondary/20 flex items-center justify-center">
                      <span className="text-7xl font-bold text-white/80">
                        {userInitial}
                      </span>
                    </div>
                  )}

                  {/* Overlay hint */}
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
                <p className="font-bold text-lg text-foreground">
                  {userData?.full_name || "Guest"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{userRole}</p>
              </div>
            </CardContent>
          </Card>

          {/* Right: Primary Action Card */}
          <Card className="relative overflow-hidden border-border bg-background/40 backdrop-blur-xl shadow-2xl">
            <CardHeader className="text-center md:text-left">
              <CardTitle className="text-2xl md:text-3xl font-extrabold tracking-tight">
                Enter the VR Interview Room
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                Configure your simulation parameters. The AI will adapt
                dynamically to your answers.
              </CardDescription>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-4">
                <Badge
                  variant="default"
                  className="flex items-center gap-1.5 px-3 py-1"
                >
                  <UserIcon className="w-3 h-3" /> Interview Profile Ready
                </Badge>
                <Badge
                  variant="secondary"
                  className="flex items-center gap-1.5 px-3 py-1"
                >
                  <Brain className="w-3 h-3" /> Tech: {userRole}
                </Badge>
                <Badge
                  variant="outline"
                  className={`flex items-center gap-1.5 px-3 py-1 ${hasResume ? "bg-muted/50" : "bg-red-900/20 text-red-400 border-red-800/50"}`}
                >
                  <FileText className="w-3 h-3" /> Resume:{" "}
                  {hasResume ? "Attached" : "Missing"}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2 relative md:col-span-2 lg:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Topics
                  </label>

                  {/* Custom Multi-Select Input Box with Shadcn DropdownMenu */}
                  <DropdownMenu
                    open={isTopicDropdownOpen}
                    onOpenChange={setIsTopicDropdownOpen}
                  >
                    <DropdownMenuTrigger asChild>
                      <div className="w-full min-h-[42px] bg-card/80 border border-border rounded-lg px-2 py-2 text-sm focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all cursor-pointer flex flex-wrap gap-2 items-center relative">
                        <div className="flex flex-wrap gap-2 flex-grow">
                          {selectedTopics.length === 0 && (
                            <span className="text-foreground0 py-0.5 pointer-events-none">
                              Select technologies or topics...
                            </span>
                          )}
                          {selectedTopics.map((t) => (
                            <div
                              key={t}
                              className="flex items-center gap-1 bg-primary/20 text-foreground px-2.5 py-1 rounded-md text-xs border border-primary/30 group"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span>{t}</span>
                              <button
                                className="hover:text-white transition-colors focus:outline-none"
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
                        <div className="text-muted-foreground p-1">
                          <ChevronDown
                            className={`w-4 h-4 transition-transform ${isTopicDropdownOpen ? "rotate-180" : ""}`}
                          />
                        </div>
                      </div>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                      className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-60"
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
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Difficulty
                  </label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger className="w-full bg-card/80 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all">
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
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Duration
                  </label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger className="w-full bg-card/80 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all">
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
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Interviewer Tone
                  </label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger className="w-full bg-card/80 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all">
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
                  className="group relative overflow-hidden w-full md:w-2/3 h-16 text-lg font-bold rounded-full bg-background hover:text-white transition-colors duration-500 flex items-center justify-center border-border shadow-[inset_0_0px_14px_var(--color-primary)] disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <div
                    className="absolute inset-0 z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                    style={{
                      background:
                        "radial-gradient(circle 200px at var(--mouse-x, 50%) var(--mouse-y, 50%), var(--color-primary), rgba(168,85,247,0) 100%)",
                    }}
                  />
                  <div className="relative z-10 flex items-center justify-center gap-3">
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
                  </div>
                </Button>

                <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-muted-foreground bg-card/50 px-6 py-3 rounded-full border border-border/80">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${micStatus === "ready" ? "bg-emerald-500 animate-pulse" : micStatus === "testing" ? "bg-yellow-500 animate-pulse" : "bg-red-500"}`}
                    />
                    <Mic className="w-4 h-4 text-muted-foreground" />
                    <span>
                      {micStatus === "ready"
                        ? "Microphone Ready"
                        : micStatus === "testing"
                          ? "Testing Mic..."
                          : "Mic Denied"}
                    </span>
                  </div>
                  <div className="w-1 h-1 rounded-full bg-slate-700 hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${camStatus === "ready" ? "bg-emerald-500 animate-pulse" : camStatus === "testing" ? "bg-yellow-500 animate-pulse" : "bg-red-500"}`}
                    />
                    <Video className="w-4 h-4 text-muted-foreground" />
                    <span>
                      {camStatus === "ready"
                        ? "Camera Ready"
                        : camStatus === "testing"
                          ? "Testing Cam..."
                          : "Cam Denied"}
                    </span>
                  </div>
                  <div className="w-1 h-1 rounded-full bg-slate-700 hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${latency ? "bg-emerald-500 animate-pulse" : "bg-yellow-500 animate-pulse"}`}
                    />
                    <Wifi className="w-4 h-4 text-muted-foreground" />
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
          <h3 className="text-lg font-bold mb-4 tracking-tight">
            Your Performance Analytics
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: 2x2 Stat Cards */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="bg-card/40 border-border relative overflow-hidden">
                {loading && (
                  <div className="absolute inset-0 bg-background/20 backdrop-blur-sm z-10 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                    Avg. Interview Score
                    <Brain className="w-4 h-4 text-primary" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">
                    {stats.confidenceScore}%
                  </div>
                  <Progress
                    value={stats.confidenceScore}
                    className="mt-3 bg-muted"
                  />
                  <p className="text-[10px] text-foreground0 mt-3 leading-tight">
                    Based on recent performance scores.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card/40 border-border relative overflow-hidden">
                {loading && (
                  <div className="absolute inset-0 bg-background/20 backdrop-blur-sm z-10 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                    Focus / Gaze Score
                    <Eye className="w-4 h-4 text-secondary" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">
                    {stats.gazeScore}%
                  </div>
                  <Progress
                    value={stats.gazeScore}
                    className="mt-3 bg-muted [&>div]:bg-secondary"
                  />
                  <p className="text-[10px] text-foreground0 mt-3 leading-tight">
                    Eye contact and attention tracking.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card/40 border-border relative overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                    Resume Status
                    <FileText className="w-4 h-4 text-secondary" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-2xl font-bold text-muted-foreground/50">
                      ...
                    </div>
                  ) : hasResume ? (
                    <>
                      <div className="text-2xl font-bold text-foreground">
                        Parsed & Ready
                      </div>
                      <p className="text-[10px] text-foreground0 mt-3 leading-tight">
                        AI will tailor questions based on your background.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-2xl font-bold text-red-400">
                        Not Uploaded
                      </div>
                      <button
                        onClick={() => router.push("/profile")}
                        className="text-xs text-primary mt-3 hover:underline"
                      >
                        Upload Resume →
                      </button>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card/40 border-border relative overflow-hidden">
                {loading && (
                  <div className="absolute inset-0 bg-background/20 backdrop-blur-sm z-10 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                    Mocks Completed
                    <History className="w-4 h-4 text-emerald-400" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">
                    {stats.totalMocks}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Total successful interviews completed.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Right: Streak Calendar */}
            <Card className="bg-card/40 border-border relative overflow-hidden flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                  Interview Streak
                  <Flame className="w-4 h-4 text-orange-500" />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-3xl font-bold text-white flex items-center gap-2">
                    <span className="text-orange-500">🔥</span> {stats.streak}{" "}
                    Days
                  </span>
                </div>

                {/* Calendar Grid */}
                <StreakCalendar recentInterviews={recentInterviews} />

                <p className="text-xs text-muted-foreground mt-auto pt-3">
                  Practice daily to build your streak!
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Interviews List */}
        <div>
          <h3 className="text-lg font-bold mb-4 tracking-tight">
            Recent Sessions
          </h3>
          <Card className="bg-card/40 border-border overflow-hidden relative min-h-[150px]">
            {loading && (
              <div className="absolute inset-0 bg-background/40 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm text-muted-foreground">
                  Loading history...
                </span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-background/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">Type</th>
                    <th className="px-6 py-4 font-semibold">Persona</th>
                    <th className="px-6 py-4 font-semibold text-center">
                      Score
                    </th>
                    <th className="px-6 py-4 font-semibold text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {!loading &&
                    recentInterviews.map((interview) => (
                      <tr
                        key={interview.id}
                        className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-6 py-4 text-muted-foreground font-medium whitespace-nowrap">
                          {interview.date}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {interview.type}
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            variant="outline"
                            className="border-border bg-card font-normal"
                          >
                            {interview.persona}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 font-bold text-center">
                          {interview.status === "completed" ? (
                            <span
                              className={
                                interview.rawScore > 85
                                  ? "text-emerald-400"
                                  : "text-primary"
                              }
                            >
                              {interview.score}
                            </span>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-yellow-500/80 border-yellow-500/30"
                            >
                              Incomplete
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {interview.status === "completed" &&
                          interview.reportId ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-8 shadow-sm"
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
                              className="h-8 shadow-sm border-border text-muted-foreground hover:text-white"
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
                          <History className="w-8 h-8 text-muted-foreground/30" />
                          <p className="text-muted-foreground font-medium">
                            No interviews completed yet.
                          </p>
                          <p className="text-foreground0 text-xs text-balance">
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
