export default function DashboardPage() {
    return (
        <div className="flex-1 min-h-screen bg-slate-950 p-8 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-purple/5 rounded-full blur-[100px] pointer-events-none" />

            <div className="relative z-10 text-center">
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Inter<span className="text-brand-purple">VR</span> Dashboard</h1>
                <p className="text-slate-400 text-lg mb-8 max-w-md mx-auto">
                    Your AI interviewer is getting ready. This area is under construction. Let's conquer those interviews!
                </p>
                <div className="p-1 px-4 py-2 border border-brand-purple/30 rounded-full inline-flex text-brand-neon bg-brand-purple/10 text-sm animate-pulse tracking-wide font-medium">
                    Dashboard Coming Soon
                </div>
            </div>
        </div>
    );
}
