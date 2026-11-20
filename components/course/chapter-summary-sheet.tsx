"use client";

import { useState } from "react";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MathText } from "@/components/course/math-text";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useTranslations } from "@/lib/i18n/client";
import { useChapterSummary } from "@/hooks/use-chapter-summary";

function SummarySkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="w-24 h-3 bg-muted rounded-md animate-pulse" />
          <div className="space-y-1.5">
            <div className="h-4 bg-muted rounded-md animate-pulse" />
            <div className="h-4 bg-muted rounded-md animate-pulse" />
            <div className="h-4 bg-muted rounded-md animate-pulse w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SummarySection({
  title,
  items,
  asMath,
}: {
  title: string;
  items: string[];
  asMath?: boolean;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h3 className="text-body-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </h3>
      <ul className="list-disc pl-4 space-y-1 text-body-base">
        {items.map((item, i) => (
          <li key={i}>{asMath ? <MathText>{item}</MathText> : item}</li>
        ))}
      </ul>
    </div>
  );
}

export function ChapterSummarySheet({
  studentId,
  chapterId,
  chapterTitle,
}: {
  studentId?: string;
  chapterId: string;
  chapterTitle: string;
}) {
  const t = useTranslations("learning");
  const experience = useStudentExperience();
  const [open, setOpen] = useState(false);
  const { summary, loading, error: failure, load } = useChapterSummary({ studentId, chapterId, chapterTitle, demo: experience.mode === "demo" });
  const error = failure === "budget" ? t("reader.dailyLimit") : failure ? t("reader.summaryFailed") : null;
  const loadSummary = () => { setOpen(true); void load(); };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="rounded-md text-body-xs py-1 h-auto"
        onClick={loadSummary}
      >
        {loading ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <FileText className="size-4 mr-1.5" />}
        {t("reader.summary")}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
          <SheetTitle className="text-body-base font-heading">{chapterTitle}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {loading && <SummarySkeleton />}
            {!loading && error && (
              <div className="flex items-start gap-2 text-body-sm">
                <AlertTriangle className="size-4 text-status-error shrink-0 mt-0.5" />
                <span className="text-muted-foreground">{error}</span>
              </div>
            )}
            {!loading && !error && summary && (
              <div className="space-y-6">
                <SummarySection title={t("reader.keyConcepts")} items={summary.keyConcepts} />
                <SummarySection title={t("reader.commonMistakes")} items={summary.commonMistakes} />
                <SummarySection title={t("reader.importantFormulas")} items={summary.importantFormulas} asMath />
                <SummarySection title={t("reader.practice")} items={summary.practiceRecommendations} />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
