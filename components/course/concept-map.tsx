"use client";

import * as React from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

interface ConceptInfo {
  conceptName: string;
  conceptSlug: string | null;
  masteryScore: number | null;
  confidence: number | null;
  trend: "improving" | "stable" | "declining" | null;
  blockedBy: string[];
}

interface ChapterGroup {
  chapter: {
    id: string;
    title: string;
    orderIndex: number;
  };
  concepts: ConceptInfo[];
}

interface ConceptMapProps {
  courseId: string;
  groups: ChapterGroup[];
}

function barTone(score: number) {
  if (score >= 70) return "bg-status-success";
  if (score >= 40) return "bg-status-warning";
  return "bg-status-error";
}

function TrendIcon({ trend }: { trend?: "improving" | "stable" | "declining" | null }) {
  if (trend === "improving") return <TrendingUp className="size-3.5 text-status-success" />;
  if (trend === "declining") return <TrendingDown className="size-3.5 text-status-error" />;
  if (trend === "stable") return <Minus className="size-3.5 text-muted-foreground" />;
  return null;
}

export function ConceptMap({ courseId, groups }: ConceptMapProps) {
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <Reveal key={group.chapter.id}>
          <div className="space-y-3">
            <h2 className="text-body-sm font-semibold uppercase tracking-wide text-muted-foreground mt-8 mb-2">
              {group.chapter.title}
            </h2>
            <div className="border-b border-border" />
            <div className="divide-y divide-border">
              {group.concepts.map((c) => (
                <div
                  key={c.conceptName}
                  className="py-3 grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] items-center gap-4"
                >
                  {/* Col 1: Name and blocked chip */}
                  <div className="min-w-0">
                    {c.conceptSlug ? (
                      <Link
                        href={`/courses/${courseId}/concept/${c.conceptSlug}`}
                        className="text-body-base font-medium text-foreground block truncate hover:underline hover:text-primary transition-colors"
                      >
                        {c.conceptName}
                      </Link>
                    ) : (
                      <span className="text-body-base font-medium text-foreground block truncate">
                        {c.conceptName}
                      </span>
                    )}
                    {c.blockedBy.length > 0 && (
                      <Badge variant="outline" className="text-muted-foreground mt-1 gap-1 text-body-xs rounded-md">
                        <Lock className="size-3" />
                        needs {c.blockedBy[0]}
                      </Badge>
                    )}
                  </div>

                  {/* Col 2: Mastery bar and score */}
                  <div className="flex items-center gap-3 shrink-0">
                    {c.masteryScore !== null ? (
                      <>
                        <div className="hidden sm:block w-32 h-1.5 rounded-md bg-muted overflow-hidden">
                          <div
                            className={cn("h-full rounded-md transition-[width] duration-500 ease-out", barTone(c.masteryScore))}
                            style={{ width: `${c.masteryScore}%` }}
                          />
                        </div>
                        <span className="text-body-sm font-semibold tabular-nums text-foreground flex items-center gap-1.5">
                          {c.masteryScore}
                          <span className="inline-block sm:hidden">
                            <TrendIcon trend={c.trend} />
                          </span>
                        </span>
                      </>
                    ) : (
                      <span className="text-body-sm text-muted-foreground">no data</span>
                    )}
                  </div>

                  {/* Col 3: Trend icon (desktop only) */}
                  <div className="hidden sm:block w-5 text-center shrink-0">
                    {c.masteryScore !== null && <TrendIcon trend={c.trend} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}
