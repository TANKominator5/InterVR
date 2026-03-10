"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Glasses,
  Activity,
  Zap,
  PlayCircle,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setIsLoggedIn(true);
    });
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-24 pb-32 lg:pt-36 lg:pb-40 bg-linear-to-br from-blue-50 via-white to-orange-50">
        {/* Background glow effects - Adjusted for Light Theme */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-200/30 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-orange-200/20 rounded-full blur-[100px] pointer-events-none" />

        <div className="container mx-auto px-4 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 border border-blue-200 text-blue-600 mb-8 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-orange-500 animate-pulse"></span>
            <span className="text-sm font-semibold tracking-wide uppercase">
              Next-Gen Interview Prep
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 mb-6 max-w-4xl mx-auto">
            Master Your Interviews with{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-blue-600 to-orange-500">
              AI-Driven WebVR
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            Practice with realistic 3D AI avatars, get data-driven behavioral
            feedback, and conquer interview anxiety directly from your browser.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={isLoggedIn ? "/dashboard" : "/signup"}
              className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-white transition-all duration-200 bg-blue-600 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 shadow-lg shadow-blue-200"
            >
              <span className="relative flex items-center gap-2">
                Get Started
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

            <Link
              href="#demo"
              className="group inline-flex items-center justify-center px-8 py-4 font-bold text-slate-700 transition-all duration-200 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-200 shadow-sm"
            >
              <span className="flex items-center gap-2">
                <PlayCircle className="w-5 h-5 text-orange-500 group-hover:scale-110 transition-transform" />
                View Demo
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Problem / Solution Section */}
      <section className="py-24 bg-white border-y border-slate-100 relative">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-slate-900">
              The Interview Gap
            </h2>
            <p className="text-slate-500 text-lg">
              Traditional prep methods are failing candidates. It&apos;s time
              for an upgrade.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 relative overflow-hidden group hover:shadow-md transition-all">
              <div className="absolute top-0 left-0 w-1 h-full bg-red-400" />
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                Expensive Mocks
              </h3>
              <p className="text-slate-600">
                Human mock interviews can cost Rs. 5000+/hr, making quality
                practice inaccessible to most candidates.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 relative overflow-hidden group hover:shadow-md transition-all">
              <div className="absolute top-0 left-0 w-1 h-full bg-orange-400" />
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                Silent Chatbots
              </h3>
              <p className="text-slate-600">
                Standard text-based AI cannot evaluate your tone, body language,
                or hesitation—critical factors in a real interview.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 relative overflow-hidden group hover:shadow-md transition-all">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                Interview Anxiety
              </h3>
              <p className="text-slate-600">
                You only get one shot. Our immersive simulations help
                desensitize the pressure of a live conversation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 relative bg-slate-50/50">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl md:text-5xl font-bold mb-6 text-slate-900">
              Powered by the Future
            </h2>
            <p className="text-xl text-slate-500">
              Everything you need to master your next technical or behavioral
              round.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {/* Feature 1 */}
            <div className="group bg-white border border-slate-200 hover:border-blue-300 hover:border-1.5 rounded-3xl p-8 transition-all hover:shadow-xl hover:shadow-blue-500/20 flex flex-col items-start">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-6 text-blue-600 group-hover:scale-110 transition-transform">
                <Glasses className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">
                Immersive WebVR
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Step into a virtual interview room right from your browser. No
                expensive headset required. Feel the presence of a real
                interviewer.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group bg-white border border-slate-200 hover:border-orange-300 hover:border-1.5 rounded-3xl p-8 transition-all hover:shadow-xl hover:shadow-orange-500/20 flex flex-col items-start">
              <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mb-6 text-orange-600 group-hover:scale-110 transition-transform">
                <Bot className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">
                Dynamic Gemini Intelligence
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Our AI doesn&apos;t just read off a script. It adapts to your
                answers, asks deep technical follow-ups, and simulates distinct
                interviewer personas.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group bg-white border border-slate-200 hover:border-blue-300 hover:border-1.5 rounded-3xl p-8 transition-all hover:shadow-xl hover:shadow-blue-500/20 flex flex-col items-start">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-6 text-blue-600 group-hover:scale-110 transition-transform">
                <Zap className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">
                Real-Time Low Latency
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Conversations feel natural. Advanced voice streaming ensures you
                aren&apos;t painfully waiting for responses, mimicking human
                cadence.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="group bg-white border border-slate-200 hover:border-orange-300 hover:border-1.5 rounded-3xl p-8 transition-all hover:shadow-xl hover:shadow-orange-500/20 flex flex-col items-start">
              <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mb-6 text-orange-600 group-hover:scale-110 transition-transform">
                <Activity className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">
                Behavioral Analytics
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Get detailed post-interview reports on your gaze focus,
                sentiment, filler word usage, and technical accuracy to pinpoint
                growth areas.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
