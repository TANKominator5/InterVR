import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ProfileForm } from "@/components/ProfileForm";
import AnalyticsGrid from "@/components/AnalyticsGrid";

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userDetails } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex-1 min-h-screen py-10 px-4 md:px-8 lg:px-12 bg-background">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 text-foreground">
          <h1 className="text-4xl font-black tracking-tight">
            Profile Settings
          </h1>
          <p className="opacity-90 font-medium text-muted-foreground">
            Customize your experience and track your progress.
          </p>
        </header>

        {/* 1:2 Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Left Side: Identity & All Analytics Cards (1/3 width) */}
          <aside className="lg:col-span-1">
            <AnalyticsGrid />
          </aside>

          {/* Right Side: Profile Form (2/3 width) */}
          <main className="lg:col-span-2">
            <ProfileForm initialData={userDetails || {}} />
          </main>
        </div>
      </div>
    </div>
  );
}
