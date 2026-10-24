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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
          <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
            <Target className="size-4.5 text-brand-primary" />
            {t("course.dashboardWeakConcepts.title", { courseTitle: resolvedCourseTitle })}
          </h2>
        </div>
      )}

      {!hasAnyMeasured ? (
        <div className="space-y-1 py-2 text-left">
          <p className="text-body-sm font-semibold">{t("course.dashboardWeakConcepts.noData")}</p>
          <p className="text-body-xs text-muted-foreground leading-relaxed">
            {t("course.dashboardWeakConcepts.noDataDescription")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayConcepts.map((c, index) => {
            const isMeasured = c.isMeasured ?? (c.evidenceCount > 0);
            return (
              <div
                key={c.conceptName}
                className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Concept name + trend icon + score */}
                <div className="flex items-start justify-between gap-2 text-body-sm">
                  <span className="flex items-center gap-1.5 font-medium text-foreground line-clamp-2 max-w-[85%] leading-snug">
                    <MathText as="span">{c.conceptName}</MathText>
                    {isMeasured && <TrendIcon trend={c.trend} />}
                  </span>
                  <span className="font-mono text-body-xs font-semibold text-muted-foreground shrink-0 mt-0.5">
                    {isMeasured ? `${c.masteryScore}%` : t("course.dashboardWeakConcepts.notMeasured")}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 overflow-hidden rounded-md bg-muted w-full">
                  <div
                    className={cn(
                      "h-full rounded-md transition-all duration-500 ease-out",
                      isMeasured ? barTone(c.masteryScore) : "bg-transparent",
                    )}
                    style={{ width: isMeasured ? `${c.masteryScore}%` : "0%" }}
                  />
                </div>

                {c.blockedBy && c.blockedBy.length > 0 && (
                  <div className="mt-0.5">
                    <Badge variant="outline" className="text-muted-foreground gap-1 text-[10px] rounded-md py-0.5">
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
