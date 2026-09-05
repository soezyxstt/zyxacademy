"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  AlertCircle,
  XCircle,
  Clock,
  CheckCircle2,
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
        icon: <Clock className="size-3 text-muted-foreground shrink-0" />,
      };
    case "running":
      return {
        label: "Berjalan",
        badgeClass: "bg-primary/10 text-primary border-primary/30",
        icon: <Loader2 className="size-3 animate-spin text-primary shrink-0" />,
      };
    case "completed":
      return {
        label: "Selesai",
        badgeClass: "bg-status-success/15 text-status-success border-status-success/30",
        icon: <span className="text-muted-foreground shrink-0 select-none">→</span>,
      };
    case "failed":
      return {
        label: "Gagal",
        badgeClass: "bg-destructive/15 text-destructive border-destructive/30",
        icon: <AlertCircle className="size-3 text-destructive shrink-0" />,
      };
    case "cancelled":
      return {
        label: "Dibatalkan",
        badgeClass: "bg-muted text-muted-foreground border-border/60",
        icon: <XCircle className="size-3 text-muted-foreground shrink-0" />,
      };
    default:
      return {
        label: status,
        badgeClass: "bg-muted text-muted-foreground border-border/60",
        icon: <span className="text-muted-foreground shrink-0 select-none">→</span>,
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
    return Boolean(steps?.some((s) => s.status === "running" || s.status === "failed"));
  });

  if (!steps || steps.length === 0) {
    return null;
  }

  const isRunning = steps.some((s) => s.status === "running");
  const hasFailed = steps.some((s) => s.status === "failed");
  const runningStep = steps.find((s) => s.status === "running");

  return (
    <div className="text-body-xs font-sans text-muted-foreground/90 my-2 select-text">
      {/* Collapsible toggle header (Cloudflare style: > Jejak Kerja Audit) */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-label="Buka atau tutup jejak kerja audit"
        className="group flex items-start text-left gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-0.5 focus-visible:outline-none w-full"
      >
        {isExpanded ? (
          <ChevronDown className="size-3 text-muted-foreground group-hover:text-foreground transition-colors mt-0.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground group-hover:text-foreground transition-colors mt-0.5 shrink-0" />
        )}

        <span className="font-heading text-body-xs font-bold text-foreground block leading-snug break-words">
          <span>Jejak Kerja Audit ({steps.length} langkah)</span>
          {isRunning && runningStep && (
            <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-primary font-normal font-sans">
              <Loader2 className="size-2.5 animate-spin" />
              <span>{runningStep.title}</span>
            </span>
          )}
        </span>
      </button>

      {/* Expanded list with clean -> arrow items */}
      {isExpanded && (
        <div className="mt-1.5 pl-2 border-l border-border/50 space-y-1 text-[11px] font-mono leading-relaxed text-muted-foreground">
          {steps.map((step) => {
            const badge = getStatusBadge(step.status);
            const duration = formatDuration(step.durationMs);

            return (
              <div key={step.stepId} className="flex items-start gap-1.5 group">
                <div className="mt-0.5">{badge.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "break-words",
                        step.status === "running" && "text-primary font-medium",
                        step.status === "failed" && "text-destructive",
                        step.status === "completed" && "text-foreground/85"
                      )}
                    >
                      {step.title}
                    </span>

                    <span
                      className={cn(
                        "inline-flex items-center rounded-sm border px-1 py-0.2 text-[9px] font-semibold leading-tight font-sans",
                        badge.badgeClass
                      )}
                    >
                      {badge.label}
                    </span>

                    {duration && (
                      <span className="text-[10px] text-muted-foreground/60 shrink-0">
                        ({duration})
                      </span>
                    )}
                  </div>

                  {step.detail && (
                    <p className="text-[10px] text-muted-foreground/80 pl-2 mt-0.5 line-clamp-2 font-sans">
                      {step.detail}
                    </p>
                  )}

                  {step.error && (
                    <p className="text-[10px] text-destructive pl-2 mt-0.5 font-sans">
                      {step.error}
                    </p>
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
