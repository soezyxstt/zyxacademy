"use client";

import { MathText } from "@/components/course/math-text";
import { useTranslations } from "@/lib/i18n/client";
import type { WeakConcept } from "@/lib/cohort-analytics";
import { DistributionBar } from "./distribution-bar";

export function ConceptRanking({ concepts }: { concepts: WeakConcept[] }) {
  const t = useTranslations("tutor.analytics");
  return (
    <ul className="divide-y divide-border/30">
      {concepts.map((concept) => (
        <li key={concept.conceptName} className="grid min-w-0 grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-(--compact-gap) py-(--row-padding)">
          <div className="min-w-0">
            <MathText className="block wrap-anywhere text-body-sm font-medium text-foreground">{concept.conceptName}</MathText>
            <p className="text-body-xs tabular-nums text-muted-foreground">{t("students", { count: concept.studentCount })}</p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-body-sm tabular-nums text-foreground">
              <span className="sr-only">{t("averageMastery")}: </span>{concept.avgMastery}
            </p>
            <DistributionBar low={concept.bucketLow} mid={concept.bucketMid} high={concept.bucketHigh} total={concept.studentCount} className="w-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}
