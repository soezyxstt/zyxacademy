"use client";

import { Check, CircleAlert } from "lucide-react";
import { ZyraPetStateSchema, type ZyraPetState } from "@/lib/zyra/murid";
import { cn } from "@/lib/utils";
import { ZyraMark } from "@/components/course/zyra-mark";

export const zyraPetLabels: Record<ZyraPetState, string> = {
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
    <div className={cn("flex items-center gap-2", className)} aria-label={zyraPetLabels[safeState]}>
      <div className={cn(
        "relative flex size-10 items-center justify-center rounded-xl border border-brand-primary/25 bg-brand-primary/10 text-brand-primary",
        active && "motion-safe:animate-pulse",
        safeState === "quota_resting" && "border-status-warning/30 bg-status-warning/10 text-status-warning",
        safeState === "error" && "border-status-error/30 bg-status-error/10 text-status-error",
      )}>
        <ZyraMark className="size-7" />
        {safeState === "success" && <Check className="absolute -right-1 -top-1 size-3 text-status-success" aria-hidden="true" />}
        {safeState === "error" && <CircleAlert className="absolute -right-1 -top-1 size-3 text-status-error" aria-hidden="true" />}
      </div>
      <span className="sr-only" aria-live="polite">{zyraPetLabels[safeState]}</span>
    </div>
  );
}
