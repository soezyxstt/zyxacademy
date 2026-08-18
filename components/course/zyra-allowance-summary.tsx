"use client";

import * as React from "react";
import { CircleHelp, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ZyraAllowanceSummarySchema, type ZyraAllowanceSummary } from "@/lib/zyra/murid";

export function ZyraAllowanceSummary({ refreshKey = 0 }: { refreshKey?: number }) {
  const [summary, setSummary] = React.useState<ZyraAllowanceSummary | null>(null);
  const [unavailable, setUnavailable] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/zyra/allowance", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("ALLOWANCE_UNAVAILABLE");
        const body = await response.json() as { summary?: unknown };
        const parsed = ZyraAllowanceSummarySchema.safeParse(body.summary);
        if (!parsed.success) throw new Error("ALLOWANCE_INVALID");
        if (!cancelled) setSummary(parsed.data);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (unavailable || !summary) return null;
  const resetLabel = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(summary.nextResetAt));

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 bg-muted/20 px-5 py-2 text-body-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1 font-semibold text-foreground">
        <Gauge className="size-3.5" aria-hidden="true" />
        {summary.providerTurnsRemaining} respons tersisa
      </span>
      <span>Termasuk pertanyaan teks dan gambar</span>
      <span>{summary.totalInteractionsUsed} interaksi hari ini</span>
      <span>{summary.cacheSaves} jawaban dari cache</span>
      <Badge variant="outline" className="rounded-md px-1.5 py-0 text-[10px] font-normal">
        Reset {resetLabel}
      </Badge>
      <span className="sr-only"><CircleHelp aria-hidden="true" /> Kapasitas provider global tidak ditampilkan sebagai saldo pasti.</span>
    </div>
  );
}
