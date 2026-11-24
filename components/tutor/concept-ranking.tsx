"use client";

import { useTranslations } from "@/lib/i18n/client";
import type { WeakConcept } from "@/lib/cohort-analytics";
import { DistributionBar } from "./distribution-bar";

export function ConceptRanking({
  concepts,
  barWidth,
}: {
  concepts: WeakConcept[];
  barWidth?: string;
}) {
  const t = useTranslations("tutor.analytics");
  if (concepts.length === 0) {
    return (
      <p className="text-body-sm text-muted-foreground">
        {t("noAnalytics")}
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/55">
      {concepts.map((concept, index) => (
        <div
          key={concept.conceptName}
          className="grid py-(--row-padding) grid-cols-[1.5rem_minmax(0,1fr)_auto] sm:grid-cols-[1.5rem_minmax(0,1fr)_auto_8rem] items-center gap-(--compact-gap) sm:gap-(--related-gap)"
        >
          <span className="font-mono text-body-sm font-medium tabular-nums text-muted-foreground">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-body-sm font-medium break-words">{concept.conceptName}</p>
            <p className="text-body-xs text-muted-foreground">{t("students", { count: concept.studentCount })}</p>
          </div>
          <span className="tabular-nums text-body-base">{concept.avgMastery}</span>
          <DistributionBar
            low={concept.bucketLow}
            mid={concept.bucketMid}
            high={concept.bucketHigh}
            total={concept.studentCount}
            className={`col-start-2 col-span-2 w-full sm:col-auto ${barWidth ?? "sm:w-32"}`}
          />
        </div>
      ))}
    </div>
  );
}
