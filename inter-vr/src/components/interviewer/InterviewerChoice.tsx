"use client";

import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { INTERVIEWERS, type InterviewerId } from "@/lib/interviewer/profiles";

interface Props {
  value: InterviewerId;
  onChange: (interviewer: InterviewerId) => void;
  disabled?: boolean;
}

export default function InterviewerChoice({ value, onChange, disabled }: Props) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Choose your interviewer</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(Object.keys(INTERVIEWERS) as InterviewerId[]).map((id) => {
          const profile = INTERVIEWERS[id];
          return (
            <label key={id} className="relative cursor-pointer group has-disabled:cursor-wait has-disabled:opacity-60">
              <input type="radio" name="interviewer" value={id} checked={value === id}
                onChange={() => onChange(id)} className="peer sr-only" />
              <div className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3 transition-colors peer-checked:border-primary peer-checked:bg-primary/5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 group-hover:border-primary/50">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[#3a423e]">
                  {/* These small rendered portraits are served directly so a
                      regenerated avatar thumbnail is not held in the image cache. */}
                  <Image src={profile.portrait} alt="" fill unoptimized sizes="80px" className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{profile.name}</p>
                  <p className="text-xs text-muted-foreground">{profile.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Matching voice & natural lip-sync</p>
                </div>
                <CheckCircle2 aria-hidden className={`h-5 w-5 shrink-0 ${value === id ? "text-primary" : "text-muted-foreground/25"}`} />
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
