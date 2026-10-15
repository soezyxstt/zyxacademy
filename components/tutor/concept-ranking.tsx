import type { WeakConcept } from "@/lib/cohort-analytics";
import { DistributionBar } from "./distribution-bar";

export function ConceptRanking({
  concepts,
  barWidth,
}: {
  concepts: WeakConcept[];
  barWidth?: string;
}) {
  if (concepts.length === 0) {
    return (
      <p className="text-body-sm text-muted-foreground">
        Analitik akan muncul setelah siswa mengerjakan kuis.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {concepts.map((concept, index) => (
        <div
          key={concept.conceptName}
          className="py-3 grid grid-cols-[1.5rem_minmax(0,1fr)_auto] sm:grid-cols-[1.5rem_minmax(0,1fr)_auto_8rem] items-center gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300"
          style={{ animationDelay: `${Math.min(index, 7) * 50}ms` }}
        >
          <span className="text-h6 font-heading text-muted-foreground tabular-nums">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-body-base font-medium truncate">{concept.conceptName}</p>
            <p className="text-body-sm text-muted-foreground">{concept.studentCount} siswa</p>
          </div>
          <span className="tabular-nums text-body-base">{concept.avgMastery}</span>
          <DistributionBar
            low={concept.bucketLow}
            mid={concept.bucketMid}
            high={concept.bucketHigh}
            total={concept.studentCount}
            className={`hidden sm:flex ${barWidth ?? "w-32"}`}
          />
        </div>
      ))}
    </div>
  );
}
