import Link from "next/link";
import { Hexagon } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { NavLinks } from "./NavLinks";

export async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const signOut = async () => {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-background/60 backdrop-blur-md border-b border-border shadow-sm">
      <div className="flex w-full h-16 items-center justify-between px-4 lg:px-8">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative flex items-center justify-center h-8 w-8 rounded-lg bg-primary/20 text-primary group-hover:bg-primary/30 transition-colors">
            <Hexagon className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">
            Inter<span className="text-primary">VR</span>
          </span>
        </Link>

        <NavLinks user={user} signOutAction={signOut} />
      </div>
    </header>
  );
}
