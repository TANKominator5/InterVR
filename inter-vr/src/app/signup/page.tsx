import { AuthForm } from "@/components/AuthForm";

export default function SignupPage() {
    return (
        <div className="flex-1 flex items-center justify-center py-12 px-4 relative overflow-hidden">
            <div className="absolute inset-0 bg-slate-950 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-neon/10 rounded-full blur-[100px] pointer-events-none" />

            <AuthForm defaultMode="signup" />
        </div>
    );
}
