"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Hexagon, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/utils/supabase/client";

const authSchema = z.object({
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
});

type AuthValues = z.infer<typeof authSchema>;

export function AuthForm({ defaultMode = "login" }: { defaultMode?: "login" | "signup" }) {
    const [mode, setMode] = useState<"login" | "signup">(defaultMode);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<AuthValues>({
        resolver: zodResolver(authSchema),
        defaultValues: { email: "", password: "" },
    });

    const onSubmit = async (data: AuthValues) => {
        setIsLoading(true);
        try {
            if (mode === "signup") {
                const { error } = await supabase.auth.signUp({
                    email: data.email,
                    password: data.password,
                    options: {
                        emailRedirectTo: `${location.origin}/auth/callback`,
                    },
                });
                if (error) throw error;
                toast.success("Account created successfully! Check your email to verify.");
                // We route them to onboarding manually here if auto-login is on
                router.push("/onboarding");
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email: data.email,
                    password: data.password,
                });
                if (error) throw error;

                // After login, we need to check if they completed onboarding.
                // For now, we simulate this logic:
                const { data: userDetails, error: userError } = await supabase
                    .from("users")
                    .select("onboarding_completed")
                    .eq("id", (await supabase.auth.getUser()).data.user?.id)
                    .single();

                if (userDetails?.onboarding_completed) {
                    router.push("/dashboard");
                } else {
                    router.push("/onboarding");
                }
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to authenticate");
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: `${location.origin}/auth/callback`,
                },
            });
            if (error) throw error;
        } catch (error: any) {
            toast.error(error.message || "Failed to authenticate with Google");
        }
    };

    return (
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-purple/20 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-brand-neon/10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center mb-8">
                <Link href="/" className="flex items-center gap-2 mb-6 group">
                    <Hexagon className="w-8 h-8 text-brand-purple group-hover:scale-110 transition-transform" />
                    <span className="text-2xl font-bold tracking-tight text-white">Inter<span className="text-brand-purple">VR</span></span>
                </Link>
                <h2 className="text-2xl font-bold text-slate-50">
                    {mode === "login" ? "Welcome Back" : "Create your account"}
                </h2>
                <p className="text-sm text-slate-400 mt-2">
                    {mode === "login" ? "Enter your details to sign in" : "Start your prep journey today"}
                </p>
            </div>

            <div className="relative z-10">
                <button
                    onClick={handleGoogleLogin}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-black font-semibold rounded-xl hover:bg-slate-200 transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-white mb-6"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            fill="#4285F4"
                        />
                        <path
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            fill="#34A853"
                        />
                        <path
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            fill="#FBBC05"
                        />
                        <path
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            fill="#EA4335"
                        />
                    </svg>
                    Continue with Google
                </button>

                <div className="flex items-center gap-4 mb-6">
                    <div className="h-px bg-slate-800 flex-1" />
                    <span className="text-sm font-medium text-slate-500 uppercase">Or</span>
                    <div className="h-px bg-slate-800 flex-1" />
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                        <input
                            {...register("email")}
                            className={`w-full bg-slate-950 border ${errors.email ? 'border-red-500' : 'border-slate-800'} rounded-xl px-4 py-3 text-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-all`}
                            placeholder="you@example.com"
                        />
                        {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                        <input
                            type="password"
                            {...register("password")}
                            className={`w-full bg-slate-950 border ${errors.password ? 'border-red-500' : 'border-slate-800'} rounded-xl px-4 py-3 text-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-purple transition-all`}
                            placeholder="••••••••"
                        />
                        {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>}
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex items-center justify-center py-3 px-4 bg-brand-purple hover:bg-brand-purple-dark text-white font-semibold rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-brand-purple focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (mode === "login" ? "Sign In" : "Create Account")}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-slate-400">
                    {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                    <button
                        onClick={() => setMode(mode === "login" ? "signup" : "login")}
                        className="text-brand-purple font-semibold hover:text-brand-neon transition-colors"
                    >
                        {mode === "login" ? "Sign up" : "Sign in"}
                    </button>
                </div>
            </div>
        </div>
    );
}
