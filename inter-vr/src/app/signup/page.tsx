import { AuthForm } from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <div className="flex-1 flex items-center justify-center py-12 px-4 relative overflow-hidden bg-[linear-gradient(to_bottom_right,var(--color-blue-500),var(--color-blue-300),var(--color-orange-300),var(--color-orange-500))]">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-500/10 rounded-full blur-[100px] pointer-events-none" />

      <AuthForm defaultMode="signup" />
    </div>
  );
}
