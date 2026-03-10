"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinksProps {
  user: any;
  signOutAction: () => Promise<void>;
}

export function NavLinks({ user, signOutAction }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-4">
      {user ? (
        <>
          {pathname !== "/dashboard" && (
            <Link
              href="/dashboard"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Dashboard
            </Link>
          )}
          {pathname !== "/profile" && (
            <Link
              href="/profile"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Profile
            </Link>
          )}
          <form action={signOutAction}>
            <button
              type="submit"
              className="hidden sm:inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 bg-muted text-foreground shadow hover:bg-muted/80 h-9 px-4 py-2"
            >
              Sign Out
            </button>
          </form>
        </>
      ) : (
        <>
          {pathname !== "/login" && (
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Log in
            </Link>
          )}
          {pathname !== "/signup" && (
            <Link
              href="/signup"
              className="hidden sm:inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 bg-primary text-white shadow hover:bg-primary/90 h-9 px-4 py-2"
            >
              Get Started
            </Link>
          )}
        </>
      )}
    </div>
  );
}
