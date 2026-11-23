"use client";

import * as React from "react";
import { TrendingUp, TrendingDown, Minus, Lock, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MathText } from "@/components/course/math-text";
import {
  DashboardSectionCount,
  DashboardSectionHeading,
} from "@/components/dashboard/dashboard-section-heading";
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

function scoreTone(score: number) {
  if (score >= 70) return "text-status-success";
  if (score >= 40) return "text-status-warning";
  return "text-status-error";
}

function scoreLabelKey(score: number) {
  if (score >= 70) return "strong";
  if (score >= 40) return "developing";
  return "weak";
}

function TrendIcon({ trend }: { trend?: "improving" | "stable" | "declining" | null }) {
  if (trend === "improving") return <TrendingUp className="size-3.5 text-status-success shrink-0" aria-hidden />;
  if (trend === "declining") return <TrendingDown className="size-3.5 text-status-error shrink-0" aria-hidden />;
  return <Minus className="size-3.5 text-muted-foreground/70 shrink-0" aria-hidden />;
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
      {showHeader && (
        <DashboardSectionHeading
          icon={Target}
          title={t("course.dashboardWeakConcepts.title", { courseTitle: resolvedCourseTitle })}
          meta={
            hasAnyMeasured ? (
              <DashboardSectionCount>
                {t("course.dashboardWeakConcepts.measuredOf", {
                  measured: measuredConcepts.length,
                  total: concepts.length,
                })}
              </DashboardSectionCount>
            ) : null
          }
        />
      )}

      {!hasAnyMeasured ? (
        <div className="flex flex-col items-center justify-center px-3 py-4 text-center">
          <Target className="size-6 text-muted-foreground/50 mb-1.5" aria-hidden />
          <p className="text-body-sm font-semibold text-foreground">{t("course.dashboardWeakConcepts.noData")}</p>
          <p className="text-body-xs text-muted-foreground mt-0.5 max-w-xs leading-relaxed">
            {t("course.dashboardWeakConcepts.noDataDescription")}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/30">
          {displayConcepts.map((c) => {
            const isMeasured = c.isMeasured ?? (c.evidenceCount > 0);
            const roundedScore = Math.round(c.masteryScore);
            return (
              <div key={c.conceptName} className="flex flex-col gap-1.5 py-2.5 first:pt-1">
                <div className="flex items-start justify-between gap-3">
                  <span className="line-clamp-2 min-w-0 flex-1 break-words text-body-sm font-medium leading-snug text-foreground">
                    <MathText as="span">{c.conceptName}</MathText>
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                    {isMeasured && !hideTrend && <TrendIcon trend={c.trend} />}
                    <span
                      className={cn(
                        "font-mono text-body-xs font-semibold tabular-nums",
                        isMeasured ? scoreTone(roundedScore) : "text-muted-foreground",
                      )}
                    >
                      {isMeasured ? `${roundedScore}%` : t("course.dashboardWeakConcepts.notMeasured")}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/70">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500 ease-out",
                        isMeasured ? barTone(roundedScore) : "bg-transparent",
                      )}
                      style={{ width: isMeasured ? `${roundedScore}%` : "0%" }}
                    />
                  </div>
                  {isMeasured && (
                    <span className="shrink-0 text-body-2xs font-medium text-muted-foreground">
                      {t(`course.dashboardWeakConcepts.${scoreLabelKey(roundedScore)}`)}
                    </span>
                  )}
                </div>

                {c.blockedBy && c.blockedBy.length > 0 && (
                  <div className="mt-0.5">
                    <Badge variant="outline" className="max-w-full gap-1 rounded-md border-border/50 py-0.5 text-body-2xs text-muted-foreground">
                      <Lock className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">
                        {t("course.dashboardWeakConcepts.prerequisite")}: <MathText as="span">{c.blockedBy[0]}</MathText>
                      </span>
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
