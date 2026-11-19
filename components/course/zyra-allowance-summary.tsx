"use client";

import * as React from "react";
import { CircleHelp, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StudentAccountBoundary } from "@/components/student-account-boundary";
import { zyraAllowanceQuery, type AllowanceSummaryView } from "@/lib/zyra/allowance-query";

import { useStudentExperience } from "@/components/student-experience-provider";

type Props = {
  refreshKey?: number;
  courseId?: string | null;
  onAccessTierChange?: (tier: "free" | "standard") => void;
};

export function ZyraAllowanceSummary(props: Props) {
  const experience = useStudentExperience();
  if (experience.mode === "demo") return <DemoAllowance onAccessTierChange={props.onAccessTierChange} />;
  return <StudentAccountBoundary>{({ data }) => data?.user.id
    ? <LiveAllowance key={`${data.user.id}:${props.courseId ?? ""}`} {...props} userId={data.user.id} />
    : null}</StudentAccountBoundary>;
}

function DemoAllowance({ onAccessTierChange }: Pick<Props, "onAccessTierChange">) {
  React.useEffect(() => { onAccessTierChange?.("standard"); }, [onAccessTierChange]);
  return null;
}

function LiveAllowance({ userId, courseId, refreshKey = 0, onAccessTierChange }: Props & { userId: string }) {
  const client = useQueryClient();
  const options = zyraAllowanceQuery(userId, courseId ?? undefined);
  const query = useQuery(options);
  const previousRefresh = React.useRef(refreshKey);
  React.useEffect(() => {
    if (previousRefresh.current === refreshKey) return;
    previousRefresh.current = refreshKey;
    void client.invalidateQueries({ queryKey: options.queryKey, exact: true });
  }, [client, options.queryKey, refreshKey]);
  const summary = query.isError ? undefined : query.data?.summary;
  React.useEffect(() => {
    if (summary) onAccessTierChange?.(summary.accessTier);
  }, [summary, onAccessTierChange]);
  return summary ? <AllowanceView summary={summary} /> : null;
}

function AllowanceView({ summary }: { summary: AllowanceSummaryView }) {
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
