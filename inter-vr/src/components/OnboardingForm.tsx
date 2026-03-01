"use client";

import { useState, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { UploadCloud, CheckCircle2, Loader2, FileText, User as UserIcon, Briefcase } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

const onboardingSchema = z.object({
    fullName: z.string().min(2, "Full name is required"),
    techStack: z.string().min(1, "Please select a target role"),
    persona: z.enum(["strict", "casual"]),
});

type OnboardingValues = z.infer<typeof onboardingSchema>;

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

export function OnboardingForm() {
    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const router = useRouter();
    const supabase = createClient();

    const {
        register,
        handleSubmit,
        control,
        formState: { errors },
    } = useForm<OnboardingValues>({
        resolver: zodResolver(onboardingSchema),
        defaultValues: {
            fullName: "",
            techStack: "",
            persona: "casual",
        },
    });

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

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile.type !== "application/pdf") {
                toast.error("Please upload a PDF file");
                return;
            }
            setFile(droppedFile);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            if (selectedFile.type !== "application/pdf") {
                toast.error("Please upload a PDF file");
                return;
            }
            setFile(selectedFile);
        }
    };

    const onSubmit = async (data: OnboardingValues) => {
        if (!file) {
            toast.error("Please upload your resume");
            return;
        }

        setIsSubmitting(true);
        let resumeUrl = "";

        try {
            // 1. Get current user
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) throw new Error("Please sign in first");

            // 2. Upload resume to Supabase Storage
            const fileExt = file.name.split('.').pop();
            const filePath = `${user.id}/${Math.random()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
                .from('resumes')
                .upload(filePath, file);

            if (uploadError) throw new Error("Failed to upload resume");

            // Get public URL (Assuming bucket is public for simplicity, or we can just save the path)
            const { data: publicUrlData } = supabase.storage
                .from('resumes')
                .getPublicUrl(filePath);

            resumeUrl = publicUrlData.publicUrl;

            // 3. Save onboarding details to users table
            const { error: dbError } = await supabase
                .from('users')
                .upsert({
                    id: user.id, // Primary key
                    full_name: data.fullName,
                    tech_stack: data.techStack,
                    interviewer_persona: data.persona,
                    resume_url: resumeUrl,
                    onboarding_completed: true,
                    updated_at: new Date().toISOString(),
                });

            if (dbError) throw new Error(dbError.message || "Failed to save profile");

            toast.success("Profile setup complete! Ready for your interview.");
            router.push("/dashboard");

        } catch (error: any) {
            toast.error(error.message || "An error occurred during onboarding.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-purple/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />

            <div className="mb-10 text-center relative z-10">
                <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Setup Your Profile</h2>
                <p className="text-slate-400">Configure your AI interviewer and provide context for realistic questions.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-10 relative z-10">

                {/* Step 1: Basic Details */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
                        <UserIcon className="w-5 h-5 text-brand-neon" />
                        <h3 className="text-lg font-semibold text-slate-200">Step 1: Basic Details</h3>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                            <input
                                {...register("fullName")}
                                className={`w-full bg-slate-950 border ${errors.fullName ? 'border-red-500' : 'border-slate-800'} rounded-xl px-4 py-3 text-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-all`}
                                placeholder="John Doe"
                            />
                            {errors.fullName && <p className="text-red-500 text-sm mt-1">{errors.fullName.message}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Target Role</label>
                            <select
                                {...register("techStack")}
                                className={`w-full bg-slate-950 border ${errors.techStack ? 'border-red-500' : 'border-slate-800'} rounded-xl px-4 py-3 text-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-all appearance-none`}
                            >
                                <option value="" disabled>Select a role</option>
                                {ROLES.map((role) => (
                                    <option key={role} value={role}>{role}</option>
                                ))}
                            </select>
                            {errors.techStack && <p className="text-red-500 text-sm mt-1">{errors.techStack.message}</p>}
                        </div>
                    </div>
                </div>

                {/* Step 2: Interview Preferences */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
                        <Briefcase className="w-5 h-5 text-brand-neon" />
                        <h3 className="text-lg font-semibold text-slate-200">Step 2: Interviewer Persona</h3>
                    </div>

                    <Controller
                        control={control}
                        name="persona"
                        render={({ field }) => (
                            <div className="grid md:grid-cols-2 gap-4">
                                <label
                                    className={`relative cursor-pointer rounded-2xl p-5 border-2 transition-all ${field.value === "strict"
                                        ? "border-brand-purple bg-brand-purple/10"
                                        : "border-slate-800 bg-slate-950 hover:bg-slate-900"
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        className="sr-only"
                                        {...field}
                                        value="strict"
                                        checked={field.value === "strict"}
                                    />
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-bold text-white">Strict Manager</span>
                                        {field.value === "strict" && <CheckCircle2 className="w-5 h-5 text-brand-purple" />}
                                    </div>
                                    <p className="text-sm text-slate-400">Tough questions, no hints, serious tone. Best for stress-testing.</p>
                                </label>

                                <label
                                    className={`relative cursor-pointer rounded-2xl p-5 border-2 transition-all ${field.value === "casual"
                                        ? "border-brand-neon bg-brand-neon/10"
                                        : "border-slate-800 bg-slate-950 hover:bg-slate-900"
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        className="sr-only"
                                        {...field}
                                        value="casual"
                                        checked={field.value === "casual"}
                                    />
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-bold text-white">Casual HR / Peer</span>
                                        {field.value === "casual" && <CheckCircle2 className="w-5 h-5 text-brand-neon" />}
                                    </div>
                                    <p className="text-sm text-slate-400">Encouraging, provides hints if stuck, conversational tone.</p>
                                </label>
                            </div>
                        )}
                    />
                    {errors.persona && <p className="text-red-500 text-sm">{errors.persona.message}</p>}
                </div>

                {/* Step 3: Resume Upload */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
                        <FileText className="w-5 h-5 text-brand-neon" />
                        <h3 className="text-lg font-semibold text-slate-200">Step 3: Context Injection</h3>
                    </div>
                    <p className="text-sm text-slate-400 -mt-4">Upload your resume (PDF) so the AI can tailor questions to your experience.</p>

                    <div
                        className={`border-2 border-dashed rounded-3xl p-10 text-center transition-all ${isDragging ? "border-brand-neon bg-brand-neon/5" :
                            file ? "border-emerald-500/50 bg-emerald-500/5" :
                                "border-slate-700 bg-slate-950 hover:border-brand-purple/50"
                            }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => !file && fileInputRef.current?.click()}
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept=".pdf,application/pdf"
                            onChange={handleFileSelect}
                        />

                        {file ? (
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mb-2 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                                    <CheckCircle2 className="w-8 h-8" />
                                </div>
                                <div className="text-white font-medium">{file.name}</div>
                                <div className="text-sm text-slate-400 mb-4">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setFile(null);
                                    }}
                                    className="px-4 py-2 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-300 rounded-lg text-sm transition-colors"
                                >
                                    Remove File
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-4 cursor-pointer">
                                <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-brand-purple transition-colors">
                                    <UploadCloud className="w-8 h-8" />
                                </div>
                                <div>
                                    <div className="text-white font-medium mb-1">Click to upload or drag and drop</div>
                                    <div className="text-sm text-slate-400">PDFs only (Max 5MB)</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Submit */}
                <div className="pt-6">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full flex items-center justify-center gap-2 py-4 px-6 bg-gradient-to-r from-brand-purple to-brand-neon hover:from-brand-purple-dark hover:to-brand-purple text-white font-bold rounded-2xl transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:shadow-[0_0_30px_rgba(217,70,239,0.5)] focus:outline-none focus:ring-2 focus:ring-brand-purple focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-70 disabled:cursor-not-allowed text-lg"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-6 h-6 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            "Save & Go to Dashboard"
                        )}
                    </button>
                </div>

            </form>
        </div>
    );
}
