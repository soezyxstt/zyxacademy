"use client";

import * as React from "react";
import { TrendingUp, TrendingDown, Minus, Lock, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MathText } from "@/components/course/math-text";
import { cn } from "@/lib/utils";

interface MasteryConcept {
  conceptName: string;
  masteryScore: number;
  evidenceCount: number;
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
  courseTitle = "Kuliah",
  className,
  showHeader = true,
}: DashboardWeakConceptsProps) {
  // Show top 4 concepts sorted by learning order (or simply the slice of first 4 concepts)
  const displayConcepts = concepts.slice(0, 4);

  return (
    <div className={cn("text-left", className)}>
      {/* Clean Accessible Header */}
      {showHeader && (
        <div className="mb-4 flex items-center justify-between border-b border-border/40 pb-3">
          <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
            <Target className="size-4.5 text-brand-primary" />
            Peta penguasaan ({courseTitle})
          </h2>
        </div>
      )}

      {displayConcepts.length === 0 ? (
        <div className="space-y-4 py-2 text-left">
          <p className="text-body-xs text-muted-foreground leading-relaxed">
            Belum ada data penguasaan. Ambil kuis pertama Anda untuk mulai memetakan tingkat pemahaman konsep secara otomatis di sini.
          </p>
          
          {/* Skeleton Preview of Mastery concept bars */}
          <div className="space-y-3 opacity-30 select-none pointer-events-none">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-body-xs font-semibold text-foreground">
                <span>Konsep Aljabar Limit</span>
                <span className="font-mono text-body-xs">75%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-md bg-muted">
                <div className="h-full w-3/4 rounded-md bg-brand-primary" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-body-xs font-semibold text-foreground">
                <span>Kekontinuan Fungsi</span>
                <span className="font-mono text-body-xs">40%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-md bg-muted">
                <div className="h-full w-2/5 rounded-md bg-brand-secondary" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {displayConcepts.map((c, index) => (
            <div
              key={c.conceptName}
              className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* Concept name + trend icon + score */}
              <div className="flex items-start justify-between gap-2 text-body-sm">
                <span className="flex items-center gap-1.5 font-medium text-foreground line-clamp-2 max-w-[85%] leading-snug">
                  <MathText as="span">{c.conceptName}</MathText>
                  <TrendIcon trend={c.trend} />
                </span>
                <span className="font-mono text-body-xs font-semibold text-muted-foreground shrink-0 mt-0.5">
                  {c.masteryScore}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2 overflow-hidden rounded-md bg-muted w-full">
                <div
                  className={cn("h-full rounded-md transition-all duration-500 ease-out", barTone(c.masteryScore))}
                  style={{ width: `${c.masteryScore}%` }}
                />
              </div>

              {c.blockedBy && c.blockedBy.length > 0 && (
                <div className="mt-0.5">
                  <Badge variant="outline" className="text-muted-foreground gap-1 text-[10px] rounded-md py-0.5">
                    <Lock className="size-3" />
                    Prasyarat: <MathText as="span">{c.blockedBy[0]}</MathText>
                  </Badge>
                </div>
              )}
            </div>
          ))}
          
          <p className="mt-4 pt-2 border-t border-border/30 text-[10px] text-muted-foreground select-none">
            Diperbarui otomatis dari kuis dan sesi flashcard terakhir.
          </p>
        </div>
      )}
    </div>
  );
}
