"use client";

import { ZyraPetStateSchema, type ZyraPetState } from "@/lib/zyra/murid";
import { cn } from "@/lib/utils";
import { ZyraCharacter } from "@/components/course/zyra-character";

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
  return (
    <div className={cn("flex items-center gap-2", className)} aria-label={zyraPetLabels[safeState]}>
      <div className={cn(
        "relative flex size-12 items-center justify-center text-brand-primary",
        safeState === "quota_resting" && "text-status-warning",
        safeState === "error" && "text-status-error",
        safeState === "success" && "text-status-success",
      )}>
        <ZyraCharacter state={safeState} />
      </div>
      <span className="sr-only" aria-live="polite">{zyraPetLabels[safeState]}</span>
    </div>
  );
}
