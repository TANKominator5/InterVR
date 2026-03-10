"use client";

import { useState, useRef } from "react";
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
  MapPin,
  User as UserIcon,
  FileText,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";

// Resume upload is optional on the profile page
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

interface ProfileFormProps {
  initialData: any;
}

export function ProfileForm({ initialData }: ProfileFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const onSubmit = async (data: ProfileValues) => {
    setIsSubmitting(true);
    let resumeUrl = initialData?.resume_url || "";

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user)
        throw new Error("Please sign in to update profile.");

      if (file) {
        const fileExt = file.name.split(".").pop();
        const filePath = `${user.id}/${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("resumes")
          .upload(filePath, file);

        if (uploadError) throw new Error("Failed to upload resume");

        const { data: publicUrlData } = supabase.storage
          .from("resumes")
          .getPublicUrl(filePath);

        resumeUrl = publicUrlData.publicUrl;
      }

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

      // If a NEW resume was uploaded, trigger background re-processing via Gemini
      if (file && resumeUrl) {
        fetch("/api/process-resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeUrl, userId: user.id }),
        }).catch((err) =>
          console.error("Background resume processing failed:", err),
        );
      }

      toast.success("Profile updated perfectly!");
      router.push("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "An error occurred during update.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto bg-white/70 border border-slate-200 rounded-3xl p-8 md:p-10 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-amber-500/10 rounded-full blur-[80px] -ml-24 -mb-24 pointer-events-none" />

      <div className="mb-10 text-center relative z-10">
        <h2 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">
          Edit Profile
        </h2>
        <p className="text-slate-600">
          Keep your academic context up to date for the best AI interview
          experience.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-10 relative z-10"
      >
        {/* Step 1: Basic Personal Info */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-2">
            <UserIcon className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-semibold text-slate-800">
              Personal Details
            </h3>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Full Name
              </label>
              <input
                {...register("fullName")}
                className={`w-full bg-white border ${errors.fullName ? "border-red-500" : "border-slate-300"} rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all`}
                placeholder="John Doe"
              />
              {errors.fullName && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.fullName.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Country
              </label>
              <input
                {...register("country")}
                className={`w-full bg-white border ${errors.country ? "border-red-500" : "border-slate-300"} rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all`}
                placeholder="India"
              />
              {errors.country && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.country.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                State / Region
              </label>
              <input
                {...register("state")}
                className={`w-full bg-white border ${errors.state ? "border-red-500" : "border-slate-300"} rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all`}
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

        {/* Step 2: Academy Info */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-2">
            <GraduationCap className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-semibold text-slate-800">
              Academic Background
            </h3>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Institution / University Name
              </label>
              <input
                {...register("institutionName")}
                className={`w-full bg-white border ${errors.institutionName ? "border-red-500" : "border-slate-300"} rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all`}
                placeholder="Harvard University..."
              />
              {errors.institutionName && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.institutionName.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Year of Study
              </label>
              <select
                {...register("yearOfStudy")}
                className={`w-full bg-white border ${errors.yearOfStudy ? "border-red-500" : "border-slate-300"} rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all appearance-none`}
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
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Current CGPA
              </label>
              <input
                type="number"
                step="0.01"
                {...register("cgpa", { valueAsNumber: true })}
                className={`w-full bg-white border ${errors.cgpa ? "border-red-500" : "border-slate-300"} rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all`}
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

        {/* Step 3: Interview Target & Upload */}
        <div className="space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-2">
            <FileText className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-semibold text-slate-800">
              Interview Context
            </h3>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Target Role
            </label>
            <select
              {...register("techStack")}
              className={`w-full bg-white border ${errors.techStack ? "border-red-500" : "border-slate-300"} rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all appearance-none`}
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

          <div className="pt-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Update Resume (PDF) - Optional
            </label>
            <div
              className={`border-2 border-dashed rounded-3xl p-10 text-center transition-all ${
                isDragging
                  ? "border-orange-500 bg-orange-50"
                  : file || initialData?.resume_url
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-300 bg-slate-50 hover:border-orange-400 hover:bg-orange-50/50"
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

              {file || initialData?.resume_url ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-2 shadow-sm">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div className="text-slate-900 font-medium">
                    {file ? file.name : "Resume currently uploaded"}
                  </div>
                  {file && (
                    <div className="text-sm text-slate-500 mb-4">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      if (!file) fileInputRef.current?.click();
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition-colors mt-2"
                  >
                    {file ? "Remove New File" : "Upload Different Resume"}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 cursor-pointer">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:text-orange-500 group-hover:bg-orange-100 transition-colors">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <div>
                    <div className="text-slate-900 font-medium mb-1">
                      Click to upload or drag and drop
                    </div>
                    <div className="text-sm text-slate-500">
                      PDFs only (Max 5MB)
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="pt-6">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-4 px-6 bg-linear-to-r from-orange-400 to-orange-500 hover:from-orange-500 hover:to-orange-600 hover:delay-200 text-white font-bold rounded-2xl transition-all shadow-lg hover:shadow-orange-500/30 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-70 disabled:cursor-not-allowed text-lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Updating Profile...
              </>
            ) : (
              "Update Profile"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
