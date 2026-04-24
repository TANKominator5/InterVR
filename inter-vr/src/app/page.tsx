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
      <section className="relative overflow-hidden pt-24 pb-32 lg:pt-36 lg:pb-40 bg-gradient-to-br from-background via-background to-secondary/20">
        {/* Background glow effects - Adjusted for Light Theme */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-200/30 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-orange-200/20 rounded-full blur-[100px] pointer-events-none" />

        <div className="container mx-auto px-4 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-background/80 border border-border text-primary mb-8 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse"></span>
            <span className="text-sm font-semibold tracking-wide uppercase">
              Next-Gen Interview Prep
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-foreground mb-6 max-w-4xl mx-auto">
            Master Your Interviews with{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-chart-1">
              AI-Driven WebVR
            </span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Practice with realistic 3D AI avatars, get data-driven behavioral
            feedback, and conquer interview anxiety directly from your browser.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={isLoggedIn ? "/dashboard" : "/signup"}
              className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-primary-foreground transition-all duration-200 bg-primary rounded-xl hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary shadow-lg shadow-primary/20"
            >
              <span className="relative flex items-center gap-2">
                Get Started
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

            <Link
              href="https://www.youtube.com/watch?v=Zz2x4sBfKJM"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center justify-center px-8 py-4 font-bold text-foreground transition-all duration-200 bg-background border border-border rounded-xl hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-border shadow-sm"
            >
              <span className="flex items-center gap-2">
                <PlayCircle className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
                View Demo
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Problem / Solution Section */}
      <section className="py-24 bg-background border-y border-border relative">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">
              The Interview Gap
            </h2>
            <p className="text-muted-foreground text-lg">
              Traditional prep methods are failing candidates. It&apos;s time
              for an upgrade.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="bg-card border border-border rounded-2xl p-8 relative overflow-hidden group hover:shadow-md transition-all">
              <div className="absolute top-0 left-0 w-1 h-full bg-destructive" />
              <h3 className="text-xl font-bold text-card-foreground mb-3">
                Expensive Mocks
              </h3>
              <p className="text-muted-foreground">
                Human mock interviews can cost Rs. 5000+/hr, making quality
                practice inaccessible to most candidates.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-card border border-border rounded-2xl p-8 relative overflow-hidden group hover:shadow-md transition-all">
              <div className="absolute top-0 left-0 w-1 h-full bg-chart-1" />
              <h3 className="text-xl font-bold text-card-foreground mb-3">
                Silent Chatbots
              </h3>
              <p className="text-muted-foreground">
                Standard text-based AI cannot evaluate your tone, body language,
                or hesitation—critical factors in a real interview.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-card border border-border rounded-2xl p-8 relative overflow-hidden group hover:shadow-md transition-all">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
              <h3 className="text-xl font-bold text-card-foreground mb-3">
                Interview Anxiety
              </h3>
              <p className="text-muted-foreground">
                You only get one shot. Our immersive simulations help
                desensitize the pressure of a live conversation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 relative bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl md:text-5xl font-bold mb-6 text-foreground">
              Powered by the Future
            </h2>
            <p className="text-xl text-muted-foreground">
              Everything you need to master your next technical or behavioral
              round.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {/* Feature 1 */}
            <div className="group bg-card border border-border hover:border-primary rounded-3xl p-8 transition-all hover:shadow-xl hover:shadow-primary/10 flex flex-col items-start">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 text-primary group-hover:scale-110 transition-transform">
                <Glasses className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-card-foreground mb-4">
                Immersive WebVR
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Step into a virtual interview room right from your browser. No
                expensive headset required. Feel the presence of a real
                interviewer.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group bg-card border border-border hover:border-chart-1 rounded-3xl p-8 transition-all hover:shadow-xl hover:shadow-chart-1/10 flex flex-col items-start">
              <div className="w-14 h-14 rounded-2xl bg-chart-1/10 flex items-center justify-center mb-6 text-chart-1 group-hover:scale-110 transition-transform">
                <Bot className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-card-foreground mb-4">
                Dynamic Gemini Intelligence
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Our AI doesn&apos;t just read off a script. It adapts to your
                answers, asks deep technical follow-ups, and simulates distinct
                interviewer personas.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group bg-card border border-border hover:border-primary rounded-3xl p-8 transition-all hover:shadow-xl hover:shadow-primary/10 flex flex-col items-start">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 text-primary group-hover:scale-110 transition-transform">
                <Zap className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-card-foreground mb-4">
                Real-Time Low Latency
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Conversations feel natural. Advanced voice streaming ensures you
                aren&apos;t painfully waiting for responses, mimicking human
                cadence.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="group bg-card border border-border hover:border-chart-1 rounded-3xl p-8 transition-all hover:shadow-xl hover:shadow-chart-1/10 flex flex-col items-start">
              <div className="w-14 h-14 rounded-2xl bg-chart-1/10 flex items-center justify-center mb-6 text-chart-1 group-hover:scale-110 transition-transform">
                <Activity className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-card-foreground mb-4">
                Behavioral Analytics
              </h3>
              <p className="text-muted-foreground leading-relaxed">
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
