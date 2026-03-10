"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  History,
  Brain,
  Eye,
  Flame,
  FileText,
  MapPin,
  Briefcase,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/utils/supabase/client";
import toast from "react-hot-toast";

export default function AnalyticsGrid() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [stats, setStats] = useState({
    confidenceScore: 0,
    gazeScore: 0,
    streak: 0,
    totalMocks: 0,
  });

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
  }, [router, supabase]);

  const getInitials = (name: string) =>
    name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "U";

  return (
    <div className="space-y-4">
      {/* 1. User Identity Card */}
      <Card className="bg-white/80 border-white/40 shadow-xl backdrop-blur-xl rounded-[2rem] overflow-hidden border-b-4 border-b-orange-400">
        <CardContent className="pt-8 pb-6 flex flex-col items-center">
          <Avatar className="h-24 w-24 border-4 border-white shadow-2xl mb-4">
            <AvatarImage src={userData?.avatar_url} />
            <AvatarFallback className="bg-linear-to-br from-orange-400 to-orange-600 text-white text-2xl font-black">
              {getInitials(userData?.full_name)}
            </AvatarFallback>
          </Avatar>
          <h2 className="text-xl font-black text-slate-900">
            {userData?.full_name || "User Name"}
          </h2>
          <div className="flex items-center gap-2 mt-1 text-slate-500 text-sm font-medium">
            <MapPin className="w-3.5 h-3.5 text-orange-500" />
            {userData?.state || "Location not set"}
          </div>
          <div className="mt-4 flex items-center gap-2 px-4 py-1.5 bg-orange-100 text-orange-700 rounded-full text-xs font-bold uppercase tracking-wider">
            <Briefcase className="w-3 h-3" />
            {userData?.tech_stack || "Not Specified"}
          </div>
        </CardContent>
      </Card>

      {/* 2. All Performance Cards in a Stack */}
      <div className="grid grid-cols-1 gap-4">
        {/* Score Card */}
        <Card className="bg-white/70 border-slate-200 shadow-md backdrop-blur-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-slate-500 uppercase flex items-center justify-between">
              Avg. Score <Brain className="w-4 h-4 text-orange-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900">
              {stats.confidenceScore}%
            </div>
            <Progress
              value={stats.confidenceScore}
              className="mt-2 h-1.5 bg-slate-200 [&>div]:bg-orange-500"
            />
          </CardContent>
        </Card>

        {/* Gaze Card */}
        <Card className="bg-white/70 border-slate-200 shadow-md backdrop-blur-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-slate-500 uppercase flex items-center justify-between">
              Gaze / Focus <Eye className="w-4 h-4 text-amber-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900">
              {stats.gazeScore}%
            </div>
            <Progress
              value={stats.gazeScore}
              className="mt-2 h-1.5 bg-slate-200 [&>div]:bg-amber-500"
            />
          </CardContent>
        </Card>

        {/* Streak Card */}
        <Card className="bg-white/70 border-slate-200 shadow-md backdrop-blur-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-slate-500 uppercase flex items-center justify-between">
              Streak <Flame className="w-4 h-4 text-orange-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900">
              🔥 {stats.streak} Days
            </div>
          </CardContent>
        </Card>

        {/* Resume Card */}
        <Card className="bg-white/70 border-slate-200 shadow-md backdrop-blur-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-slate-500 uppercase flex items-center justify-between">
              Resume <FileText className="w-4 h-4 text-orange-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-lg font-black ${userData?.resume_url ? "text-emerald-600" : "text-red-500"}`}
            >
              {userData?.resume_url ? "Parsed & Active" : "Missing"}
            </div>
          </CardContent>
        </Card>

        {/* Mocks Card */}
        <Card className="bg-white/70 border-slate-200 shadow-md backdrop-blur-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-slate-500 uppercase flex items-center justify-between">
              Completed <History className="w-4 h-4 text-slate-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900">
              {stats.totalMocks} Sessions
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
