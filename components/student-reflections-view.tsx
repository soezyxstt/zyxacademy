import Link from "next/link";
import { BookmarkCheck, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { TranslatedText } from "@/components/i18n/translated-text";
import { FormattedDate } from "@/components/ui/formatted-date";
import type { weeklyReflections } from "@/db/schema";
import { daysFrom, normalizeDate } from "@/lib/date-utils";
export function StudentReflectionsView({ href = (path: string) => path,  reflections }: { href?: (path: string) => string;  reflections: Pick<typeof weeklyReflections.$inferSelect, "id" | "weekStart" | "payload">[] }) {

  return (
    <div className="relative overflow-hidden min-h-screen">
      <PageOrnaments variant="about" />
      <div className="relative z-10 w-full px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <PageHeader
          title={<TranslatedText namespace="student" messageKey="reflections.title" />}
          icon={BookmarkCheck}
          backHref={href("/profile")}
          backLabel={<TranslatedText namespace="student" messageKey="profile.pageTitle" />}
        />

        <Reveal className="mt-6">
          <div className="rounded-xl border border-border bg-card p-4">
            {reflections.length > 0 ? (
              <div className="divide-y divide-border/60">
                {reflections.map((ref) => {
                  const start = normalizeDate(ref.weekStart);
                  const weekDates = Number.isNaN(start.getTime()) ? null : { start, end: daysFrom(6, start) };
                  const { completed, masteryGrowth, streak } = ref.payload;

                  return (
                    <div key={ref.id} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <span className="text-body-sm font-semibold text-foreground">
                          <TranslatedText namespace="student" messageKey="reflections.week" /> {weekDates ? <><FormattedDate date={weekDates.start} options={{ day: "numeric", month: "short" }} /> - <FormattedDate date={weekDates.end} options={{ day: "numeric", month: "short", year: "numeric" }} /></> : ref.weekStart}
                        </span>
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-body-xs text-muted-foreground mt-1.5">
                          <span><TranslatedText namespace="student" messageKey="reflections.quizCount" values={{ count: completed.quizzes }} /></span>
                          <span><TranslatedText namespace="student" messageKey="reflections.flashcardCount" values={{ count: completed.flashcards }} /></span>
                          <span><TranslatedText namespace="student" messageKey="reflections.materialCount" values={{ count: completed.modules }} /></span>
                          <span><TranslatedText namespace="student" messageKey="reflections.streak" values={{ count: streak.currentStreak }} /></span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {masteryGrowth > 0 ? (
                          <span className="font-heading text-body-base font-bold text-status-success">
                            +{masteryGrowth}
                          </span>
                        ) : (
                          <span className="font-heading text-body-base font-bold text-muted-foreground">
                            {masteryGrowth}
                          </span>
                        )}
                        <span className="block text-[10px] uppercase font-bold tracking-wider text-muted-foreground mt-0.5">
                          <TranslatedText namespace="student" messageKey="reflections.mastery" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                  <BookmarkCheck className="size-6" />
                </div>
                <h3 className="font-heading text-body-base font-bold text-foreground">
                  <TranslatedText namespace="student" messageKey="reflections.emptyTitle" />
                </h3>
                <p className="mx-auto mt-1 max-w-md text-body-sm text-muted-foreground">
                  <TranslatedText namespace="student" messageKey="reflections.emptyDescription" />
                </p>
                <div className="mt-5">
                  <Button asChild size="sm" className="rounded-lg text-body-sm">
                    <Link href={href("/dashboard")}>
                      <TranslatedText namespace="student" messageKey="reflections.startLearning" />
                      <ArrowRight className="ml-1.5 size-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </div>
  );
}
