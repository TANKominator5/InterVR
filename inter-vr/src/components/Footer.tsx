import Link from "next/link";
import { Hexagon } from "lucide-react";

export function Footer() {
    return (
        <footer className="w-full border-t border-border bg-background py-8 md:py-12 mt-auto">
            <div className="container mx-auto px-4">
                <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                    <div className="flex flex-col gap-2">
                        <Link href="/" className="flex items-center gap-2">
                            <Hexagon className="h-6 w-6 text-brand-purple" />
                            <span className="font-bold text-foreground">InterVR</span>
                        </Link>
                        <p className="text-sm text-muted-foreground mt-2">
                            Master your interviews with AI-driven WebVR and dynamic Behavioral Analytics.
                        </p>
                    </div>
                    <div>
                        <h3 className="mb-4 text-sm font-semibold text-foreground/90 uppercase tracking-widest">Platform</h3>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><Link href="#" className="hover:text-brand-purple transition-colors">Features</Link></li>
                            <li><Link href="#" className="hover:text-brand-purple transition-colors">Pricing</Link></li>
                            <li><Link href="#" className="hover:text-brand-purple transition-colors">Enterprise</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="mb-4 text-sm font-semibold text-foreground/90 uppercase tracking-widest">Resources</h3>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><Link href="#" className="hover:text-brand-purple transition-colors">Documentation</Link></li>
                            <li><Link href="#" className="hover:text-brand-purple transition-colors">Blog</Link></li>
                            <li><Link href="#" className="hover:text-brand-purple transition-colors">Support</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="mb-4 text-sm font-semibold text-foreground/90 uppercase tracking-widest">Legal</h3>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><Link href="#" className="hover:text-brand-purple transition-colors">Privacy Policy</Link></li>
                            <li><Link href="#" className="hover:text-brand-purple transition-colors">Terms of Service</Link></li>
                        </ul>
                    </div>
                </div>
                <div className="mt-8 border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-foreground0">
                        &copy; {new Date().getFullYear()} InterVR. All rights reserved.
                    </p>
                    <div className="flex items-center gap-4 text-foreground0">
                        {/* Social icons can go here */}
                    </div>
                </div>
            </div>
        </footer>
    );
}
