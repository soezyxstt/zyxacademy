"use client";

import { useState } from "react";
import {
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Activity,
} from "lucide-react";
import type { OpsAiWorkStep, OpsAiStepStatus } from "@/lib/admin-ops-ai/contracts";
import { cn } from "@/lib/utils";

interface WorkTraceViewProps {
  steps?: OpsAiWorkStep[];
  defaultExpanded?: boolean;
}

function getStatusBadge(status: OpsAiStepStatus) {
  switch (status) {
    case "queued":
      return {
        label: "Menunggu",
        badgeClass: "bg-muted text-muted-foreground border-border/60",
        icon: <Clock className="size-3.5 shrink-0 text-muted-foreground" />,
      };
    case "running":
      return {
        label: "Berjalan",
        badgeClass: "bg-primary/10 text-primary border-primary/30",
        icon: <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />,
      };
    case "completed":
      return {
        label: "Selesai",
        badgeClass: "bg-status-success/15 text-status-success border-status-success/30",
        icon: <CheckCircle2 className="size-3.5 shrink-0 text-status-success" />,
      };
    case "failed":
      return {
        label: "Gagal",
        badgeClass: "bg-destructive/15 text-destructive border-destructive/30",
        icon: <AlertCircle className="size-3.5 shrink-0 text-destructive" />,
      };
    case "cancelled":
      return {
        label: "Dibatalkan",
        badgeClass: "bg-muted text-muted-foreground border-border/60",
        icon: <XCircle className="size-3.5 shrink-0 text-muted-foreground" />,
      };
    default:
      return {
        label: status,
        badgeClass: "bg-muted text-muted-foreground border-border/60",
        icon: <Clock className="size-3.5 shrink-0 text-muted-foreground" />,
      };
  }
}

function formatDuration(durationMs?: number): string {
  if (typeof durationMs !== "number" || durationMs < 0) return "";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} dtk`;
}

export function WorkTraceView({ steps, defaultExpanded }: WorkTraceViewProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    if (typeof defaultExpanded === "boolean") return defaultExpanded;
    // Keep expanded by default if currently running or failed
    return Boolean(steps?.some((s) => s.status === "running" || s.status === "failed"));
  });

  if (!steps || steps.length === 0) {
    return null;
  }

  const isRunning = steps.some((s) => s.status === "running");
  const hasFailed = steps.some((s) => s.status === "failed");
  const isCancelled = steps.some((s) => s.status === "cancelled");
  const completedCount = steps.filter((s) => s.status === "completed").length;

  let summaryStatusText = `Selesai (${completedCount}/${steps.length} langkah)`;
  if (isRunning) {
    summaryStatusText = "Sedang memproses langkah audit...";
  } else if (hasFailed) {
    summaryStatusText = "Peringatan pada langkah audit";
  } else if (isCancelled) {
    summaryStatusText = "Langkah audit dibatalkan";
  }

  return (
    <div className="rounded-lg border border-border/70 bg-card/50 p-2.5 shadow-xs">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-label="Buka atau tutup jejak kerja audit"
        className="flex w-full items-start sm:items-center justify-between gap-2 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md"
      >
        <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
          <div className="flex size-6 items-center justify-center rounded-md bg-muted text-foreground shrink-0 mt-0.5 sm:mt-0">
            {isRunning ? (
              <Loader2 className="size-3.5 animate-spin text-primary" />
            ) : hasFailed ? (
              <AlertCircle className="size-3.5 text-destructive" />
            ) : (
              <Activity className="size-3.5 text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="font-heading text-body-xs font-bold text-foreground block leading-snug break-words">
              Jejak Kerja Audit
            </span>
            <span className="text-[11px] text-muted-foreground block leading-tight mt-0.5">
              {summaryStatusText}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 mt-0.5 sm:mt-0">
          <span className="rounded-md border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            {steps.length} langkah
          </span>
          {isExpanded ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="mt-2.5 space-y-2 border-t border-border/50 pt-2.5">
          {steps.map((step) => {
            const badge = getStatusBadge(step.status);
            const durationStr = formatDuration(step.durationMs);

            return (
              <div
                key={step.stepId}
                className="flex items-start justify-between gap-2 rounded-md bg-background/80 p-2 border border-border/50 text-body-xs"
              >
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <div className="mt-0.5 shrink-0">{badge.icon}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-xs font-medium text-foreground leading-snug">
                      {step.title}
                    </p>
                    {step.detail && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                        {step.detail}
                      </p>
                    )}
                    {step.error && (
                      <p className="mt-0.5 text-[11px] text-destructive">
                        {step.error}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md border px-1.5 py-0.2 text-[10px] font-semibold leading-tight",
                      badge.badgeClass
                    )}
                  >
                    {badge.label}
                  </span>
                  {durationStr && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {durationStr}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
