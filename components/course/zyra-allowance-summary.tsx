"use client";

import * as React from "react";
import { CircleHelp, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useZyraAllowance } from "@/hooks/use-zyra-allowance";

import { useStudentExperience } from "@/components/student-experience-provider";

type AllowanceProps = {
  refreshKey?: number;
  courseId?: string | null;
  onAccessTierChange?: (tier: "free" | "standard") => void;
};

export function ZyraAllowanceSummary(props: AllowanceProps) {
  const experience = useStudentExperience();
  return experience.mode === "demo" ? <DemoAllowance {...props} /> : <LiveAllowance {...props} />;
}
function DemoAllowance({ onAccessTierChange }: AllowanceProps) {
  React.useEffect(() => { onAccessTierChange?.("standard"); }, [onAccessTierChange]);
  return null;
}
function LiveAllowance({ courseId, refreshKey = 0, onAccessTierChange }: AllowanceProps) {
  const summary = useZyraAllowance(courseId, refreshKey);
  const accessTier = summary?.accessTier;
  React.useEffect(() => {
    if (accessTier) onAccessTierChange?.(accessTier);
  }, [accessTier, onAccessTierChange]);
  if (!summary) return null;
  const resetLabel = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(summary.nextResetAt));
  const isFree = summary.accessTier === "free";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 bg-muted/20 px-5 py-2 text-body-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1 font-semibold text-foreground">
        <Gauge className="size-3.5" aria-hidden="true" />
        {summary.providerTurnsRemaining} respons tersisa
      </span>
      <span>{isFree ? "5 pertanyaan teks per hari" : "Termasuk pertanyaan teks dan gambar"}</span>
      <span>{summary.totalInteractionsUsed} interaksi hari ini</span>
      <span>{summary.cacheSaves} jawaban dari cache</span>
      <Badge variant="outline" className="rounded-md px-1.5 py-0 text-[10px] font-normal">
        Reset {resetLabel}
      </Badge>
      <span className="sr-only"><CircleHelp aria-hidden="true" /> Kapasitas provider global tidak ditampilkan sebagai saldo pasti.</span>
    </div>
  );
}
