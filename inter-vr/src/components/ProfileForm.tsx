"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  UploadCloud,
  CheckCircle2,
  Loader2,
  GraduationCap,
  User as UserIcon,
  FileText,
  Sparkles,
  AlertCircle,
  Brain,
  RefreshCw,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { GoogleGenAI } from "@google/genai";

// ─── Constants ────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  country: z.string().min(2, "Country is required"),
  state: z.string().min(2, "State/Region is required"),
  institutionName: z.string().min(2, "Institution name is required"),
  yearOfStudy: z.string().min(1, "Please select an option"),
  cgpa: z.number().min(0).max(10, "CGPA cannot exceed 10").optional(),
  techStack: z.string().min(1, "Please select a target role"),
});

type ProfileValues = z.infer<typeof profileSchema>;

const STUDY_YEARS = [
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year",
  "5th Year",
  "Graduated",
  "Post-Graduate",
];

const ROLES = [
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "MERN Stack Developer",
  "Next.js Developer",
  "Java Backend Engineer",
  "Data Scientist",
  "Product Manager",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResumeContext {
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string;
  skills: string[];
  experience: {
    company: string;
    role: string;
    duration: string;
    highlights: string[];
  }[];
  education: {
    institution: string;
    degree: string;
    year: string | null;
  }[];
  projects: {
    name: string;
    description: string;
    tech: string[];
  }[];
  targetRoles: string[];
  seniorityLevel: "Fresher" | "Junior" | "Mid" | "Senior" | "Lead";
  extractedAt: string;
}

type AiStatus =
  | "idle"
  | "checking"
  | "needs_upload"
  | "analyzing"
  | "done"
  | "error";

interface ProfileFormProps {
  initialData: any;
}

// ─── Gemini PDF Analysis ───────────────────────────────────────────────────────
// Uses @google/genai SDK with gemini-2.0-flash-preview.
// Set NEXT_PUBLIC_GEMINI_API_KEY in your .env.local
async function analyzeResumeWithGemini(
  pdfBase64: string,
): Promise<ResumeContext> {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey)
    throw new Error(
      "Gemini API key not configured. Add NEXT_PUBLIC_GEMINI_API_KEY to your .env.local",
    );

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `You are an expert resume parser. Analyze the resume in this PDF and return ONLY a valid JSON object — no markdown fences, no explanation, no preamble — matching this exact shape:

{
  "name": string | null,
  "email": string | null,
  "phone": string | null,
  "location": string | null,
  "summary": string,
  "skills": string[],
  "experience": [{ "company": string, "role": string, "duration": string, "highlights": string[] }],
  "education": [{ "institution": string, "degree": string, "year": string | null }],
  "projects": [{ "name": string, "description": string, "tech": string[] }],
  "targetRoles": string[],
  "seniorityLevel": "Fresher" | "Junior" | "Mid" | "Senior" | "Lead",
  "extractedAt": string
}`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: pdfBase64,
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: {
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  });

  const raw = response.text ?? "";
  const clean = raw.replace(/```json|```/g, "").trim();
  const parsed: ResumeContext = JSON.parse(clean);
  parsed.extractedAt = new Date().toISOString();
  return parsed;
}

// ─── Helper: File → Base64 ────────────────────────────────────────────────────
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // strip data:application/pdf;base64,
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Helper: Fetch PDF from URL → Base64 ──────────────────────────────────────
async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch resume from storage.");
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── AI Status Badge ──────────────────────────────────────────────────────────
function AIStatusBadge({
  status,
  context,
}: {
  status: AiStatus;
  context: ResumeContext | null;
}) {
  const configs: Record<
    AiStatus,
    { label: string; color: string; bg: string; icon: React.ReactNode }
  > = {
    idle: {
      label: "Waiting",
      color: "#64748b",
      bg: "rgba(100,116,139,0.1)",
      icon: <Brain className="w-3 h-3" />,
    },
    checking: {
      label: "Checking resume…",
      color: "#60a5fa",
      bg: "rgba(96,165,250,0.1)",
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    needs_upload: {
      label: "Resume needed",
      color: "#f59e0b",
      bg: "rgba(245,158,11,0.1)",
      icon: <AlertCircle className="w-3 h-3" />,
    },
    analyzing: {
      label: "Gemini analyzing…",
      color: "#a78bfa",
      bg: "rgba(167,139,250,0.1)",
      icon: <Sparkles className="w-3 h-3 animate-pulse" />,
    },
    done: {
      label: "Context ready",
      color: "#34d399",
      bg: "rgba(52,211,153,0.1)",
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    error: {
      label: "Analysis failed",
      color: "#f87171",
      bg: "rgba(248,113,113,0.1)",
      icon: <AlertCircle className="w-3 h-3" />,
    },
  };

  const cfg = configs[status];

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300"
      style={{
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.color}30`,
      }}
    >
      {cfg.icon}
      <span>{cfg.label}</span>
      {status === "done" && context && (
        <span className="opacity-60">
          · {context.skills.length} skills · {context.seniorityLevel}
        </span>
      )}
    </div>
  );
}

// ─── Resume Context Preview Card ───────────────────────────────────────────────
function ResumeContextCard({
  context,
  onReanalyze,
}: {
  context: ResumeContext;
  onReanalyze: () => void;
}) {
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 space-y-3 relative overflow-hidden">
      {/* Glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />

      <div className="flex items-start justify-between relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Brain className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-emerald-300">
              AI Resume Context
            </div>
            <div className="text-xs text-slate-500">
              Extracted {new Date(context.extractedAt).toLocaleDateString()}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onReanalyze}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors px-2 py-1 rounded-lg hover:bg-emerald-500/10"
        >
          <RefreshCw className="w-3 h-3" />
          Re-analyze
        </button>
      </div>

      {/* Summary */}
      <p className="text-xs text-slate-400 leading-relaxed relative z-10 line-clamp-2">
        {context.summary}
      </p>

      {/* Skills preview */}
      <div className="flex flex-wrap gap-1.5 relative z-10">
        {context.skills.slice(0, 8).map((skill) => (
          <span
            key={skill}
            className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700"
          >
            {skill}
          </span>
        ))}
        {context.skills.length > 8 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-500">
            +{context.skills.length - 8} more
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 relative z-10">
        {[
          { label: "Experience", value: `${context.experience.length} roles` },
          { label: "Projects", value: `${context.projects.length} listed` },
          { label: "Level", value: context.seniorityLevel },
        ].map((stat) => (
          <div
            key={stat.label}
            className="text-center bg-slate-900/50 rounded-lg py-2 border border-slate-800/50"
          >
            <div className="text-xs font-semibold text-emerald-400">
              {stat.value}
            </div>
            <div className="text-[10px] text-slate-600 mt-0.5">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ProfileForm({ initialData }: ProfileFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [resumeContext, setResumeContext] = useState<ResumeContext | null>(
    null,
  );
  const [aiError, setAiError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: initialData?.full_name || "",
      country: initialData?.country || "",
      state: initialData?.state || "",
      institutionName: initialData?.institution_name || "",
      yearOfStudy: initialData?.year_of_study || "",
      cgpa: initialData?.cgpa || undefined,
      techStack: initialData?.tech_stack || "",
    },
  });

  // ── Core: Run Gemini analysis and persist directly to Supabase ──────────────
  const runGeminiAnalysis = useCallback(
    async (base64: string) => {
      setAiStatus("analyzing");
      setAiError(null);
      try {
        const context = await analyzeResumeWithGemini(base64);
        setResumeContext(context);

        // ── Save directly to Supabase resume_data column ──
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { error: saveError } = await supabase
            .from("users")
            .update({ resume_data: context })
            .eq("id", user.id);

          if (saveError) {
            console.warn(
              "[ProfileForm] Failed to save resume_data:",
              saveError.message,
            );
          } else {
            console.group(
              "[ProfileForm] Gemini Resume Context → Saved to Supabase (resume_data)",
            );
            console.log("Full context object:", context);
            console.log("Skills:", context.skills);
            console.log("Experience:", context.experience);
            console.log("Seniority:", context.seniorityLevel);
            console.groupEnd();
          }
        }

        setAiStatus("done");
        toast.success("Resume analyzed by Gemini AI!", { icon: "✨" });
      } catch (err: any) {
        setAiError(err.message || "Analysis failed");
        setAiStatus("error");
        console.error("[ProfileForm] Gemini error:", err);
        toast.error("AI analysis failed — resume uploaded but not parsed.");
      }
    },
    [supabase],
  );

  // ── On mount: check if user already has a resume ──────────────────────────
  useEffect(() => {
    // 1. If Supabase already has a parsed resume_data object, use it directly
    if (initialData?.resume_data) {
      try {
        const parsed: ResumeContext =
          typeof initialData.resume_data === "string"
            ? JSON.parse(initialData.resume_data)
            : initialData.resume_data;
        setResumeContext(parsed);
        setAiStatus("done");
        console.log("[ProfileForm] Loaded resume_data from Supabase:", parsed);
        return;
      } catch {}
    }

    // 2. If user has a resume_url but no parsed data yet, fetch PDF + analyze
    if (initialData?.resume_url) {
      setAiStatus("checking");
      urlToBase64(initialData.resume_url)
        .then((base64) => runGeminiAnalysis(base64))
        .catch((err) => {
          console.error("[ProfileForm] Failed to fetch existing resume:", err);
          setAiStatus("needs_upload");
        });
    } else {
      // 3. No resume anywhere — prompt user
      setAiStatus("needs_upload");
    }
  }, [initialData?.resume_data, initialData?.resume_url, runGeminiAnalysis]);

  // ── File handling ─────────────────────────────────────────────────────────
  const processFile = useCallback(
    async (selectedFile: File) => {
      if (selectedFile.type !== "application/pdf") {
        toast.error("Please upload a PDF file");
        return;
      }
      setFile(selectedFile);
      // Immediately start AI analysis when a new file is selected
      try {
        const base64 = await fileToBase64(selectedFile);
        await runGeminiAnalysis(base64);
      } catch (err: any) {
        toast.error("Failed to read file");
      }
    },
    [runGeminiAnalysis],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) processFile(droppedFile);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) processFile(selectedFile);
  };

  // ── Re-analyze trigger (from context card) ────────────────────────────────
  const handleReanalyze = useCallback(async () => {
    if (file) {
      const base64 = await fileToBase64(file);
      await runGeminiAnalysis(base64);
    } else if (initialData?.resume_url) {
      setAiStatus("checking");
      const base64 = await urlToBase64(initialData.resume_url);
      await runGeminiAnalysis(base64);
    } else {
      toast("Please upload a resume first", { icon: "📄" });
    }
  }, [file, initialData?.resume_url, runGeminiAnalysis]);

  // ── Form submit ───────────────────────────────────────────────────────────
  const onSubmit = async (data: ProfileValues) => {
    setIsSubmitting(true);
    let resumeUrl: string = initialData?.resume_url || "";

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user)
        throw new Error("Please sign in to update profile.");

      // Upload new PDF if selected
      if (file) {
        const fileExt = file.name.split(".").pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("resumes")
          .upload(filePath, file);

        if (uploadError) throw new Error("Failed to upload resume");

        const { data: publicUrlData } = supabase.storage
          .from("resumes")
          .getPublicUrl(filePath);

        resumeUrl = publicUrlData.publicUrl;
      }

      // Persist the profile — resume_data was already saved immediately after AI analysis
      const { error: dbError } = await supabase.from("users").upsert({
        id: user.id,
        full_name: data.fullName,
        country: data.country,
        state: data.state,
        institution_name: data.institutionName,
        year_of_study: data.yearOfStudy,
        cgpa: data.cgpa,
        tech_stack: data.techStack,
        resume_url: resumeUrl,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      });

      if (dbError)
        throw new Error(dbError.message || "Failed to update profile");

      toast.success("Profile updated!");
      router.push("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "An error occurred during update.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Derived UI state ─────────────────────────────────────────────────────
  const hasResume = !!(file || initialData?.resume_url);
  const showNeedsUploadBanner = aiStatus === "needs_upload" && !file;

  return (
    <div className="w-full max-w-3xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-10 shadow-2xl relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand-purple/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-brand-neon/10 rounded-full blur-[80px] -ml-24 -mb-24 pointer-events-none" />

      {/* Header */}
      <div className="mb-8 text-center relative z-10">
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">
          Edit Profile
        </h2>
        <p className="text-slate-400 mb-4">
          Keep your academic context up to date for the best AI interview
          experience.
        </p>
        {/* AI Status Badge */}
        <div className="flex justify-center">
          <AIStatusBadge status={aiStatus} context={resumeContext} />
        </div>
      </div>

      {/* ── Resume Upload Banner (shown when no resume exists) ── */}
      {showNeedsUploadBanner && (
        <div className="mb-8 relative z-10">
          <div className="rounded-2xl border-2 border-dashed border-amber-500/40 bg-amber-950/20 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-3">
              <FileText className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="text-white font-semibold mb-1">No resume found</h3>
            <p className="text-slate-400 text-sm mb-4">
              Upload your resume PDF and Gemini AI will instantly extract your
              skills, experience, and profile context.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl transition-all text-sm"
            >
              <UploadCloud className="w-4 h-4" />
              Upload Resume PDF
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf,application/pdf"
              onChange={handleFileSelect}
            />
          </div>
        </div>
      )}

      {/* ── Gemini Analyzing State ── */}
      {aiStatus === "analyzing" && (
        <div className="mb-8 relative z-10">
          <div className="rounded-2xl border border-violet-500/30 bg-violet-950/20 p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-violet-400 animate-pulse" />
            </div>
            <div>
              <div className="text-sm font-semibold text-violet-300">
                Gemini is reading your resume…
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Extracting skills, experience, and building your context object
              </div>
            </div>
            <Loader2 className="w-5 h-5 text-violet-400 animate-spin ml-auto flex-shrink-0" />
          </div>
        </div>
      )}

      {/* ── AI Error ── */}
      {aiStatus === "error" && aiError && (
        <div className="mb-8 relative z-10">
          <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-red-300">
                AI Analysis Failed
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{aiError}</div>
              <button
                type="button"
                onClick={handleReanalyze}
                className="mt-2 text-xs text-red-400 hover:text-red-300 underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Context Preview Card ── */}
      {aiStatus === "done" && resumeContext && (
        <div className="mb-8 relative z-10">
          <ResumeContextCard
            context={resumeContext}
            onReanalyze={handleReanalyze}
          />
        </div>
      )}

      {/* ── Main Form ── */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-10 relative z-10"
      >
        {/* Step 1: Personal Info */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
            <UserIcon className="w-5 h-5 text-brand-neon" />
            <h3 className="text-lg font-semibold text-slate-200">
              Personal Details
            </h3>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Full Name
              </label>
              <input
                {...register("fullName")}
                className={`w-full bg-slate-950 border ${
                  errors.fullName ? "border-red-500" : "border-slate-800"
                } rounded-xl px-4 py-3 text-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-all`}
                placeholder="John Doe"
              />
              {errors.fullName && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.fullName.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Country
              </label>
              <input
                {...register("country")}
                className={`w-full bg-slate-950 border ${
                  errors.country ? "border-red-500" : "border-slate-800"
                } rounded-xl px-4 py-3 text-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-all`}
                placeholder="India"
              />
              {errors.country && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.country.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                State / Region
              </label>
              <input
                {...register("state")}
                className={`w-full bg-slate-950 border ${
                  errors.state ? "border-red-500" : "border-slate-800"
                } rounded-xl px-4 py-3 text-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-all`}
                placeholder="Maharashtra"
              />
              {errors.state && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.state.message}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Step 2: Academic Info */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
            <GraduationCap className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-slate-200">
              Academic Background
            </h3>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Institution / University Name
              </label>
              <input
                {...register("institutionName")}
                className={`w-full bg-slate-950 border ${
                  errors.institutionName ? "border-red-500" : "border-slate-800"
                } rounded-xl px-4 py-3 text-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-all`}
                placeholder="Harvard University…"
              />
              {errors.institutionName && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.institutionName.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Year of Study
              </label>
              <select
                {...register("yearOfStudy")}
                className={`w-full bg-slate-950 border ${
                  errors.yearOfStudy ? "border-red-500" : "border-slate-800"
                } rounded-xl px-4 py-3 text-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-all appearance-none`}
              >
                <option value="" disabled>
                  Select year
                </option>
                {STUDY_YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              {errors.yearOfStudy && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.yearOfStudy.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Current CGPA
              </label>
              <input
                type="number"
                step="0.01"
                {...register("cgpa", { valueAsNumber: true })}
                className={`w-full bg-slate-950 border ${
                  errors.cgpa ? "border-red-500" : "border-slate-800"
                } rounded-xl px-4 py-3 text-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-all`}
                placeholder="e.g. 8.5"
              />
              {errors.cgpa && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.cgpa.message}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Step 3: Interview Context */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
            <FileText className="w-5 h-5 text-brand-purple" />
            <h3 className="text-lg font-semibold text-slate-200">
              Interview Context
            </h3>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Target Role
            </label>
            <select
              {...register("techStack")}
              className={`w-full bg-slate-950 border ${
                errors.techStack ? "border-red-500" : "border-slate-800"
              } rounded-xl px-4 py-3 text-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-all appearance-none`}
            >
              <option value="" disabled>
                Select a role
              </option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            {errors.techStack && (
              <p className="text-red-500 text-sm mt-1">
                {errors.techStack.message}
              </p>
            )}
          </div>

          {/* Resume Upload Zone */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">
                {hasResume
                  ? "Resume (PDF)"
                  : "Upload Resume (PDF) — Required for AI"}
              </label>
              {aiStatus === "done" && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  AI analyzed
                </span>
              )}
            </div>

            <div
              className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer ${
                isDragging
                  ? "border-brand-neon bg-brand-neon/5"
                  : file
                    ? aiStatus === "analyzing"
                      ? "border-violet-500/50 bg-violet-500/5"
                      : "border-emerald-500/50 bg-emerald-500/5"
                    : initialData?.resume_url
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-slate-700 bg-slate-950 hover:border-brand-purple/50"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".pdf,application/pdf"
                onChange={handleFileSelect}
              />

              {file ? (
                /* New file selected */
                <div className="flex flex-col items-center gap-3">
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center mb-1 ${
                      aiStatus === "analyzing"
                        ? "bg-violet-500/20"
                        : "bg-emerald-500/20"
                    }`}
                  >
                    {aiStatus === "analyzing" ? (
                      <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                    )}
                  </div>
                  <div className="text-white font-medium text-sm">
                    {file.name}
                  </div>
                  <div className="text-xs text-slate-400">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                    {aiStatus === "analyzing" && " · Gemini reading…"}
                    {aiStatus === "done" && " · AI context extracted ✓"}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-xs transition-colors mt-1"
                  >
                    Remove
                  </button>
                </div>
              ) : initialData?.resume_url ? (
                /* Existing resume from Supabase */
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mb-1">
                    <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                  </div>
                  <div className="text-white font-medium text-sm">
                    Resume on file
                  </div>
                  <div className="text-xs text-slate-400">
                    Click to upload a different resume
                  </div>
                </div>
              ) : (
                /* No resume */
                <div className="flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
                    <UploadCloud className="w-7 h-7 text-slate-400" />
                  </div>
                  <div>
                    <div className="text-white font-medium mb-1 text-sm">
                      Click to upload or drag & drop
                    </div>
                    <div className="text-xs text-slate-500">
                      PDFs only · Max 5 MB · Gemini AI will auto-analyze
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={isSubmitting || aiStatus === "analyzing"}
            className="w-full flex items-center justify-center gap-2 py-4 px-6 bg-gradient-to-r from-brand-purple to-brand-neon hover:from-brand-purple-dark hover:to-brand-purple text-white font-bold rounded-2xl transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:shadow-[0_0_30px_rgba(217,70,239,0.5)] focus:outline-none focus:ring-2 focus:ring-brand-purple focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-60 disabled:cursor-not-allowed text-lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Updating Profile…
              </>
            ) : aiStatus === "analyzing" ? (
              <>
                <Sparkles className="w-5 h-5 animate-pulse" />
                Waiting for AI analysis…
              </>
            ) : (
              "Update Profile"
            )}
          </button>

          {aiStatus === "needs_upload" && !file && (
            <p className="text-center text-xs text-amber-400/70 mt-3 flex items-center justify-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Upload a resume to unlock full AI interview personalization
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
