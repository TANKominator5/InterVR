import Link from "next/link";
import { ArrowRight, Bot, Glasses, Activity, Zap, PlayCircle } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-24 pb-32 lg:pt-36 lg:pb-40">
        {/* Background glow effects */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-brand-purple/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-brand-neon/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="container mx-auto px-4 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/50 border border-brand-purple/30 text-brand-purple mb-8 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
            <span className="flex h-2 w-2 rounded-full bg-brand-neon animate-pulse"></span>
            <span className="text-sm font-medium tracking-wide">Next-Gen Interview Prep</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-slate-50 via-slate-200 to-slate-500 mb-6 max-w-4xl mx-auto">
            Master Your Interviews with <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-neon to-brand-purple">AI-Driven WebVR</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Practice with realistic 3D AI avatars, get data-driven behavioral feedback, and conquer interview anxiety directly from your browser.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-white transition-all duration-200 bg-brand-purple font-pj rounded-xl hover:bg-brand-purple-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-purple overflow-hidden"
            >
              <div className="absolute inset-0 w-full h-full -mt-1 rounded-lg opacity-30 bg-gradient-to-b from-transparent via-transparent to-black" />
              <span className="relative flex items-center gap-2">
                Get Started
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

            <Link
              href="#demo"
              className="group inline-flex items-center justify-center px-8 py-4 font-bold text-slate-300 transition-all duration-200 bg-slate-900 border border-slate-800 rounded-xl hover:text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900"
            >
              <span className="flex items-center gap-2">
                <PlayCircle className="w-5 h-5 text-brand-neon group-hover:scale-110 transition-transform" />
                View Demo
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Problem / Solution Section */}
      <section className="py-24 bg-slate-950 border-y border-slate-900 relative">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-slate-50">The Interview Gap</h2>
            <p className="text-slate-400">Traditional prep methods are failing candidates. It&apos;s time for an upgrade.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group hover:border-red-500/30 transition-colors">
              <div className="absolute top-0 left-0 w-1 h-full bg-red-500/50" />
              <h3 className="text-xl font-bold text-slate-200 mb-3">Expensive Mocks</h3>
              <p className="text-slate-400">Human mock interviews can cost Rs. 5000+/hr, making quality practice inaccessible to most candidates.</p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group hover:border-orange-500/30 transition-colors">
              <div className="absolute top-0 left-0 w-1 h-full bg-orange-500/50" />
              <h3 className="text-xl font-bold text-slate-200 mb-3">Silent Chatbots</h3>
              <p className="text-slate-400">Standard text-based AI cannot evaluate your tone, body language, or hesitation—critical factors in a real interview.</p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group hover:border-brand-purple/50 transition-colors">
              <div className="absolute top-0 left-0 w-1 h-full bg-brand-purple/80 shadow-[0_0_10px_rgba(168,85,247,0.8)]" />
              <h3 className="text-xl font-bold text-slate-200 mb-3">Interview Anxiety</h3>
              <p className="text-slate-400">You only get one shot. Our immersive simulations help desensitize the pressure of a live conversation.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 relative">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl md:text-5xl font-bold mb-6 text-slate-50">Powered by the Future</h2>
            <p className="text-xl text-slate-400">Everything you need to master your next technical or behavioral round.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {/* Feature 1 */}
            <div className="group bg-slate-900/40 border border-slate-800 hover:border-brand-purple/50 rounded-3xl p-8 transition-all hover:shadow-[0_0_40px_-10px_rgba(168,85,247,0.15)] flex flex-col items-start">
              <div className="w-14 h-14 rounded-2xl bg-brand-purple/20 flex items-center justify-center mb-6 text-brand-purple group-hover:scale-110 transition-transform">
                <Glasses className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-slate-100 mb-4">Immersive WebVR</h3>
              <p className="text-slate-400 leading-relaxed">Step into a virtual interview room right from your browser. No expensive headset required. Feel the presence of a real interviewer.</p>
            </div>

            {/* Feature 2 */}
            <div className="group bg-slate-900/40 border border-slate-800 hover:border-brand-neon/50 rounded-3xl p-8 transition-all hover:shadow-[0_0_40px_-10px_rgba(217,70,239,0.15)] flex flex-col items-start">
              <div className="w-14 h-14 rounded-2xl bg-brand-neon/20 flex items-center justify-center mb-6 text-brand-neon group-hover:scale-110 transition-transform">
                <Bot className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-slate-100 mb-4">Dynamic Gemini Intelligence</h3>
              <p className="text-slate-400 leading-relaxed">Our AI doesn&apos;t just read off a script. It adapts to your answers, asks deep technical follow-ups, and simulates distinct interviewer personas.</p>
            </div>

            {/* Feature 3 */}
            <div className="group bg-slate-900/40 border border-slate-800 hover:border-blue-500/50 rounded-3xl p-8 transition-all hover:shadow-[0_0_40px_-10px_rgba(59,130,246,0.15)] flex flex-col items-start">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-6 text-blue-400 group-hover:scale-110 transition-transform">
                <Zap className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-slate-100 mb-4">Real-Time Low Latency</h3>
              <p className="text-slate-400 leading-relaxed">Conversations feel natural. Advanced voice streaming ensures you aren&apos;t painfully waiting for responses, mimicking human cadence.</p>
            </div>

            {/* Feature 4 */}
            <div className="group bg-slate-900/40 border border-slate-800 hover:border-emerald-500/50 rounded-3xl p-8 transition-all hover:shadow-[0_0_40px_-10px_rgba(16,185,129,0.15)] flex flex-col items-start">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center mb-6 text-emerald-400 group-hover:scale-110 transition-transform">
                <Activity className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-slate-100 mb-4">Behavioral Analytics</h3>
              <p className="text-slate-400 leading-relaxed">Get detailed post-interview reports on your gaze focus, sentiment, filler word usage, and technical accuracy to pinpoint growth areas.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
