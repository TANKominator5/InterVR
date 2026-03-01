import Link from "next/link";
import { Hexagon } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export async function Navbar() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const signOut = async () => {
        "use server";
        const supabase = await createClient();
        await supabase.auth.signOut();
        redirect("/login");
    };

    return (
        <header className="sticky top-0 z-50 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
            <div className="container mx-auto flex h-16 items-center justify-between px-4">
                <Link href="/" className="flex items-center gap-2 group">
                    <div className="relative flex items-center justify-center h-8 w-8 rounded-lg bg-brand-purple/20 text-brand-neon group-hover:bg-brand-purple/30 transition-colors">
                        <Hexagon className="h-5 w-5" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-slate-50">Inter<span className="text-brand-purple">VR</span></span>
                </Link>
                <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
                    <Link href="/#features" className="hover:text-brand-neon transition-colors">Features</Link>
                    <Link href="/#how-it-works" className="hover:text-brand-neon transition-colors">How it works</Link>
                    <Link href="/#pricing" className="hover:text-brand-neon transition-colors">Pricing</Link>
                </nav>
                <div className="flex items-center gap-4">
                    {user ? (
                        <>
                            <Link href="/dashboard" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
                                Dashboard
                            </Link>
                            <Link href="/profile" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
                                Profile
                            </Link>
                            <form action={signOut}>
                                <button type="submit" className="hidden sm:inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-purple disabled:pointer-events-none disabled:opacity-50 bg-slate-800 text-white shadow hover:bg-slate-700 h-9 px-4 py-2">
                                    Sign Out
                                </button>
                            </form>
                        </>
                    ) : (
                        <>
                            <Link href="/login" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
                                Log in
                            </Link>
                            <Link href="/signup" className="hidden sm:inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-purple disabled:pointer-events-none disabled:opacity-50 bg-brand-purple text-white shadow hover:bg-brand-purple/90 h-9 px-4 py-2">
                                Get Started
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
