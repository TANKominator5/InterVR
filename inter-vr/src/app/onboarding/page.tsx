import { OnboardingForm } from "@/components/OnboardingForm";

export default function OnboardingPage() {
  return (
    <div className="flex-1 min-h-screen py-16 px-4 relative bg-[linear-gradient(to_bottom_right,var(--color-blue-500),var(--color-blue-300),var(--color-orange-300),var(--color-orange-500))]">
      <OnboardingForm />
    </div>
  );
}
