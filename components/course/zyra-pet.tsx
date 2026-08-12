"use client";

import { Sparkles } from "lucide-react";
import { ZyraPetStateSchema, type ZyraPetState } from "@/lib/zyra/murid";
import { cn } from "@/lib/utils";

const labels: Record<ZyraPetState, string> = {
  idle: "Zyra siap membantu",
  listening: "Zyra sedang mendengarkan",
  uploading: "Zyra sedang memproses gambar",
  thinking: "Zyra sedang berpikir",
  explaining: "Zyra sedang menjelaskan",
  checking: "Zyra sedang memeriksa pemahaman",
  success: "Zyra selesai menjawab",
  confused: "Zyra membutuhkan penjelasan tambahan",
  quota_resting: "Zyra menunggu batas harian berikutnya",
  error: "Zyra mengalami kendala",
};

export function ZyraPet({ state, className }: { state: ZyraPetState; className?: string }) {
  const safeState = ZyraPetStateSchema.parse(state);
  const active = safeState === "thinking" || safeState === "uploading";
  return (
    <div className={cn("flex items-center gap-2", className)} aria-label={labels[safeState]}>
      <div className={cn(
        "relative flex size-10 items-center justify-center rounded-xl border border-brand-primary/25 bg-brand-primary/10 text-brand-primary",
        active && "motion-safe:animate-pulse",
      )}>
        <svg viewBox="0 0 40 40" className="size-8" role="img" aria-hidden="true">
          <circle cx="20" cy="20" r="13" fill="currentColor" opacity="0.16" />
          <path d="M12 20c0-5.4 3.6-9 8-9s8 3.6 8 9v4.5c0 3.5-3.6 6.5-8 6.5s-8-3-8-6.5V20Z" fill="currentColor" opacity="0.8" />
          <circle cx="17" cy="21" r="1.5" fill="var(--color-background)" />
          <circle cx="23" cy="21" r="1.5" fill="var(--color-background)" />
          <path d="M17 26c2 1.4 4 1.4 6 0" fill="none" stroke="var(--color-background)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {safeState === "success" && <Sparkles className="absolute -right-1 -top-1 size-3 text-brand-secondary" aria-hidden="true" />}
      </div>
      <span className="sr-only" aria-live="polite">{labels[safeState]}</span>
    </div>
  );
}
