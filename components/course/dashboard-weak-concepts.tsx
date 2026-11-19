"use client";

import * as React from "react";
import { TrendingUp, TrendingDown, Minus, Lock, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MathText } from "@/components/course/math-text";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

interface MasteryConcept {
  conceptName: string;
  masteryScore: number;
  evidenceCount: number;
  isMeasured?: boolean;
  trend?: "improving" | "stable" | "declining" | null;
  blockedBy?: string[];
}

interface DashboardWeakConceptsProps {
  concepts: MasteryConcept[];
  courseTitle?: string;
  className?: string;
  showHeader?: boolean;
  hideTrend?: boolean;
}

function barTone(score: number) {
  if (score >= 70) return "bg-status-success";
  if (score >= 40) return "bg-status-warning";
  return "bg-status-error";
}

function TrendIcon({ trend }: { trend?: "improving" | "stable" | "declining" | null }) {
  if (trend === "improving") return <TrendingUp className="size-3.5 text-status-success shrink-0" />;
  if (trend === "declining") return <TrendingDown className="size-3.5 text-status-error shrink-0" />;
  return <Minus className="size-3.5 text-muted-foreground shrink-0" />;
}

export function DashboardWeakConcepts({
  concepts,
  courseTitle,
  className,
  showHeader = true,
  hideTrend = false,
}: DashboardWeakConceptsProps) {
  const t = useTranslations("studentCourse");
  const resolvedCourseTitle = courseTitle ?? t("course.dashboardWeakConcepts.defaultCourse");
  const measuredConcepts = concepts.filter((c) => c.isMeasured ?? (c.evidenceCount > 0));
  const displayConcepts = concepts.slice(0, 4);
  const hasAnyMeasured = measuredConcepts.length > 0;

  return (
    <div className={cn("text-left", className)}>
      {/* Clean Accessible Header */}
      {showHeader && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
          <h2 className="flex items-center gap-2 font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Target className="size-3.5 shrink-0 text-muted-foreground" />
            {t("course.dashboardWeakConcepts.title", { courseTitle: resolvedCourseTitle })}
          </h2>
        </div>
      )}

      {!hasAnyMeasured ? (
        <div className="flex flex-col items-center justify-center px-3 py-5 text-center">
          <Target className="size-8 text-muted-foreground/40 mb-2" aria-hidden />
          <p className="text-body-sm font-semibold text-foreground">{t("course.dashboardWeakConcepts.noData")}</p>
          <p className="text-body-xs text-muted-foreground mt-0.5 max-w-xs leading-relaxed">
            {t("course.dashboardWeakConcepts.noDataDescription")}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {displayConcepts.map((c, index) => {
            const isMeasured = c.isMeasured ?? (c.evidenceCount > 0);
            return (
              <div
                key={c.conceptName}
                className="flex flex-col gap-1.5"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Concept name + trend icon + score */}
                <div className="flex items-start justify-between gap-2 text-body-sm">
                  <span className="flex items-center gap-1.5 font-medium text-foreground min-w-0 break-words leading-snug">
                    <MathText as="span">{c.conceptName}</MathText>
                    {isMeasured && !hideTrend && <TrendIcon trend={c.trend} />}
                  </span>
                  <span className="font-mono text-body-xs font-semibold tabular-nums text-muted-foreground shrink-0 mt-0.5">
                    {isMeasured ? `${c.masteryScore}%` : t("course.dashboardWeakConcepts.notMeasured")}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 overflow-hidden rounded-full bg-muted/70 w-full">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500 ease-out",
                      isMeasured ? barTone(c.masteryScore) : "bg-transparent",
                    )}
                    style={{ width: isMeasured ? `${c.masteryScore}%` : "0%" }}
                  />
                </div>

                {c.blockedBy && c.blockedBy.length > 0 && (
                  <div className="mt-0.5">
                    <Badge variant="outline" className="text-muted-foreground gap-1 text-body-2xs rounded-md border-border/50 py-0.5">
                      <Lock className="size-3" />
                      {t("course.dashboardWeakConcepts.prerequisite")}: <MathText as="span">{c.blockedBy[0]}</MathText>
                    </Badge>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
