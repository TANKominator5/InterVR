import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ProfileForm } from "@/components/ProfileForm";

export default async function ProfilePage() {
    const supabase = await createClient();

    // 1. Check Auth 
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    // 2. Fetch User Data
    const { data: userDetails, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

    if (error && error.code !== 'PGRST116') {
        // Log errors other than "row not found" which is fine if they haven't onboarded yet
        console.error("Error fetching user details from profile page:", error.message);
    }

    // Pass data into the edit form (defaults to empty strings if null)
    return (
        <div className="flex-1 min-h-screen py-16 px-4 relative bg-background">
            <ProfileForm initialData={userDetails || {}} />
        </div>
    );
}
