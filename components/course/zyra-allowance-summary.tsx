"use client";

import * as React from "react";
import { CircleHelp, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ZyraAllowanceSummarySchema, type ZyraAllowanceSummary } from "@/lib/zyra/murid";

import { useStudentExperience } from "@/components/student-experience-provider";

type AllowanceSummaryView = ZyraAllowanceSummary & { accessTier: "free" | "standard" };

export function ZyraAllowanceSummary({
  refreshKey = 0,
  courseId,
  onAccessTierChange,
}: {
  refreshKey?: number;
  courseId?: string | null;
  onAccessTierChange?: (tier: "free" | "standard") => void;
}) {
  const experience = useStudentExperience();
  const [summary, setSummary] = React.useState<AllowanceSummaryView | null>(null);
  const [unavailable, setUnavailable] = React.useState(false);

  React.useEffect(() => {
    setSummary(null);
    setUnavailable(false);
  }, [courseId]);

  React.useEffect(() => {
    let cancelled = false;
    if (experience.mode === "demo") { onAccessTierChange?.("standard"); return; }
    const query = courseId ? `?courseId=${encodeURIComponent(courseId)}` : "";
    fetch(`/api/zyra/allowance${query}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("ALLOWANCE_UNAVAILABLE");
        const body = await response.json() as { summary?: unknown };
        const raw = body.summary && typeof body.summary === "object"
          ? body.summary as Record<string, unknown>
          : null;
        const rawAccessTier = raw?.accessTier === "free" ? "free" : "standard";
        const parsed = ZyraAllowanceSummarySchema.safeParse(body.summary);
        const legacyParsed = parsed.success
          ? parsed
          : ZyraAllowanceSummarySchema.safeParse(raw ? (() => {
              const { accessTier: _accessTier, ...legacy } = raw;
              return legacy;
            })() : body.summary);
        if (!legacyParsed.success) throw new Error("ALLOWANCE_INVALID");
        if (!cancelled) {
          setSummary({ ...legacyParsed.data, accessTier: rawAccessTier });
          onAccessTierChange?.(rawAccessTier);
        }
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => { cancelled = true; };
  }, [courseId, onAccessTierChange, refreshKey, experience.mode]);

  if (unavailable || !summary) return null;
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
