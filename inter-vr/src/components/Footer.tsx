import Link from "next/link";
import { Hexagon } from "lucide-react";

export function Footer() {
    return (
        <footer className="w-full border-t border-gray-200/50 bg-white/80 backdrop-blur-md py-8 md:py-12 mt-auto">
            <div className="container mx-auto px-4">
                <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                    <div className="flex flex-col gap-2">
                        <Link href="/" className="flex items-center gap-2 group">
                            <div className="relative flex items-center justify-center h-8 w-8 rounded-lg bg-primary/20 text-primary group-hover:bg-primary/30 transition-colors">
                                <Hexagon className="h-5 w-5" />
                            </div>
                            <span className="text-xl font-bold tracking-tight text-foreground">
                                Inter<span className="text-primary">VR</span>
                            </span>
                        </Link>
                        <p className="text-sm text-gray-500 mt-2">
                            Master your interviews with AI-driven WebVR and dynamic Behavioral Analytics.
                        </p>
                    </div>
                    <div>
                        <h3 className="mb-4 text-sm font-semibold text-gray-900 uppercase tracking-widest">Platform</h3>
                        <ul className="space-y-2 text-sm text-gray-500">
                            <li><Link href="#" className="hover:text-primary transition-colors">Features</Link></li>
                            <li><Link href="#" className="hover:text-primary transition-colors">Pricing</Link></li>
                            <li><Link href="#" className="hover:text-primary transition-colors">Enterprise</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="mb-4 text-sm font-semibold text-gray-900 uppercase tracking-widest">Resources</h3>
                        <ul className="space-y-2 text-sm text-gray-500">
                            <li><Link href="#" className="hover:text-primary transition-colors">Documentation</Link></li>
                            <li><Link href="#" className="hover:text-primary transition-colors">Blog</Link></li>
                            <li><Link href="#" className="hover:text-primary transition-colors">Support</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="mb-4 text-sm font-semibold text-gray-900 uppercase tracking-widest">Legal</h3>
                        <ul className="space-y-2 text-sm text-gray-500">
                            <li><Link href="#" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
                            <li><Link href="#" className="hover:text-primary transition-colors">Terms of Service</Link></li>
                        </ul>
                    </div>
                </div>
                <div className="mt-8 border-t border-gray-200/50 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-gray-400">
                        &copy; {new Date().getFullYear()} InterVR. All rights reserved.
                    </p>
                    <div className="flex items-center gap-4 text-gray-400">
                        {/* Social icons can go here */}
                    </div>
                </div>
            </div>
        </footer>
    );
}
