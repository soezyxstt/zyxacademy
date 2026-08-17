"use client";

import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DistributionBar } from "@/components/tutor/distribution-bar";
import { MathText } from "@/components/course/math-text";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import type { WeakConcept, ConceptTrend, MostMissedQuestion } from "@/lib/cohort-analytics";
import { useSwipe } from "@/hooks/use-swipe";

interface Props {
  open: boolean;
  onClose: () => void;
  concept: WeakConcept | null;
  trends: ConceptTrend[];
  mostMissed: MostMissedQuestion[];
  courseId: string;
}

export function ConceptDrilldown({ open, onClose, concept, trends, mostMissed, courseId }: Props) {
  useSwipe({
    onSwipeRight: () => {
      if (open) onClose();
    }
  });

  if (!concept) return null;

  const remediationHref = `/admin/quizzes?courseId=${encodeURIComponent(courseId)}&tags=${encodeURIComponent(concept.conceptName)}`;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-lg flex flex-col gap-0 p-0 overflow-y-auto">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
          <SheetTitle className="text-h6 font-heading">
            {concept.conceptName}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-5 py-5">
          {/* Distribution */}
          <section>
            <p className="text-body-sm text-muted-foreground mb-2">Mastery distribution</p>
            <DistributionBar
              low={concept.bucketLow}
              mid={concept.bucketMid}
              high={concept.bucketHigh}
              total={concept.studentCount}
              className="w-full"
            />
            <div className="flex gap-4 mt-2 text-body-sm text-muted-foreground">
              <span><span className="text-status-error font-medium">{concept.bucketLow}</span> low</span>
              <span><span className="text-status-warning font-medium">{concept.bucketMid}</span> mid</span>
              <span><span className="text-primary font-medium">{concept.bucketHigh}</span> high</span>
            </div>
          </section>

          {/* 4-week trend */}
          {trends.length >= 2 && (
            <section>
              <p className="text-body-sm text-muted-foreground mb-2">4-week trend</p>
              <div className="h-24 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trends} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <XAxis
                      dataKey="week"
                      tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      tickCount={3}
                    />
                    <Line
                      type="monotone"
                      dataKey="avgMastery"
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
          {trends.length < 2 && (
            <section>
              <p className="text-body-sm text-muted-foreground mb-2">4-week trend</p>
              <p className="text-body-sm text-muted-foreground italic">
                Trend data appears after the daily snapshot has run for multiple weeks.
              </p>
            </section>
          )}

          {/* Most missed */}
          {mostMissed.length > 0 && (
            <section>
              <p className="text-body-sm text-muted-foreground mb-2">Most missed questions</p>
              <div className="divide-y divide-border">
                {mostMissed.map((q) => (
                  <div key={q.id} className="py-2.5 flex items-start justify-between gap-4">
                    <MathText className="text-body-sm line-clamp-2 min-w-0 block" as="div">{q.prompt}</MathText>
                    <span className="text-body-sm tabular-nums text-status-error shrink-0 font-medium">
                      {Math.round(q.correctRate * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer action */}
        <div className="mt-auto px-5 pb-5 pt-3 border-t border-border">
          <Button variant="outline" size="sm" asChild>
            <Link href={remediationHref}>Generate remediation quiz</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
