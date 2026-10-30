"use client";

import Link from "next/link";
import { useTranslations } from "@/lib/i18n/client";
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
  const t = useTranslations("tutor.analytics");
  useSwipe({
    onSwipeRight: () => {
      if (open) onClose();
    }
  });

  if (!concept) return null;

  const remediationHref = `/admin/quizzes?courseId=${encodeURIComponent(courseId)}&tags=${encodeURIComponent(concept.conceptName)}`;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" aria-describedby={undefined} className="sm:max-w-lg flex flex-col gap-0 p-0 overflow-y-auto">
        <SheetHeader className="pl-5 pr-14 pt-5 pb-4 border-b border-border">
          <SheetTitle className="text-body-base font-heading">
            {concept.conceptName}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-5 py-4">
          {/* Distribution */}
          <section>
            <p className="text-body-sm text-muted-foreground mb-2">{t("masteryDistribution")}</p>
            <DistributionBar
              low={concept.bucketLow}
              mid={concept.bucketMid}
              high={concept.bucketHigh}
              total={concept.studentCount}
              className="w-full"
            />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-body-xs text-muted-foreground">
              <span><span className="text-status-error font-medium">{concept.bucketLow}</span> {t("low")}</span>
              <span><span className="text-status-warning font-medium">{concept.bucketMid}</span> {t("mid")}</span>
              <span><span className="text-primary font-medium">{concept.bucketHigh}</span> {t("high")}</span>
            </div>
          </section>

          {/* 4-week trend */}
          {trends.length >= 2 && (
            <section>
              <p className="text-body-sm text-muted-foreground mb-2">{t("trendFourWeeks")}</p>
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
              <p className="text-body-sm text-muted-foreground mb-2">{t("trendFourWeeks")}</p>
              <p className="text-body-sm text-muted-foreground italic">
                {t("trendInsufficient")}
              </p>
            </section>
          )}

          {/* Most missed */}
          {mostMissed.length > 0 && (
            <section>
              <p className="text-body-sm text-muted-foreground mb-2">{t("mostMissed")}</p>
              <div className="divide-y divide-border">
                {mostMissed.map((q) => (
                  <div key={q.id} className="py-2.5 flex items-start justify-between gap-4">
                    <MathText className="text-body-sm min-w-0 break-words block" as="div">{q.prompt}</MathText>
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
            <Link href={remediationHref}>{t("makeRemediationQuiz")}</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
