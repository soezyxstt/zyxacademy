"use client";

import Link from "next/link";
import { ChevronRight, Lock, CheckCircle2, AlertCircle, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormattedDate } from "@/components/ui/formatted-date";
import { cn } from "@/lib/utils";
import type { quizTemplates, studentQuizAttempts } from "@/db/schema";

type TemplateType = typeof quizTemplates.$inferSelect;
type AttemptType = typeof studentQuizAttempts.$inferSelect;

type QuizListClientProps = {
  courseId: string;
  isEnrolled: boolean;
  templates: TemplateType[];
  attempts: AttemptType[];
};

export function QuizListClient({ courseId, isEnrolled, templates, attempts }: QuizListClientProps) {
  return (
    <div className="font-sans">
      <ul className="overflow-hidden rounded-lg border border-border/70 bg-card/75 backdrop-blur-sm">
        {templates.map((template) => {
          const isFree = template.visibility === "free";
          const accessible = isEnrolled || isFree;

          const rules = template.selectionRules as Record<string, any>;
          const qCount = Number(rules?.count ?? 10);

          const templateAttempts = attempts.filter((a) => a.templateId === template.id);
          const completedAttempts = templateAttempts.filter((a) => a.status === "completed");
          const activeAttempt = templateAttempts.find((a) => a.status === "in_progress");

          const highestScore = completedAttempts.length > 0
            ? Math.max(...completedAttempts.map((a) => a.score ?? 0))
            : null;

          const now = new Date();
          const openDate = template.openAt ? new Date(template.openAt) : null;
          const closeDate = template.closeAt ? new Date(template.closeAt) : null;

          let isUpcoming = false;
          let isClosed = false;
          let isOpen = true;

          if (template.manualStatus === "closed") {
            isOpen = false;
            isClosed = true;
          } else if (template.manualStatus === "open") {
            isOpen = true;
            isClosed = false;
          } else if (closeDate && now > closeDate) {
            isClosed = true;
            isOpen = false;
          } else if (openDate && now < openDate) {
            isUpcoming = true;
            isOpen = false;
          }

          const buttonContent = (() => {
            if (!accessible) {
              return (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="interactive rounded-md border-dashed md:justify-self-end"
                >
                  <Link href={`/courses/${courseId}/quiz/${template.id}`}>
                    Buka <ChevronRight className="ml-1 size-4" />
                  </Link>
                </Button>
              );
            }
            if (isClosed) {
              if (accessible && (template as any).showDiscussion) {
                return (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="interactive rounded-md border-brand-primary text-brand-primary hover:bg-brand-primary/10 md:justify-self-end"
                  >
                    <Link href={`/courses/${courseId}/quiz/${template.id}?viewDiscussion=true`}>
                      Lihat Pembahasan
                    </Link>
                  </Button>
                );
              }
              return (
                <Button disabled variant="outline" size="sm" className="rounded-md border-dashed md:justify-self-end">
                  Ditutup
                </Button>
              );
            }
            if (isUpcoming) {
              return (
                <Button disabled variant="outline" size="sm" className="rounded-md border-dashed md:justify-self-end">
                  Belum Buka
                </Button>
              );
            }
            return (
              <Button
                asChild
                variant="default"
                size="sm"
                className="interactive rounded-md bg-brand-primary text-white hover:bg-brand-primary/95 md:justify-self-end"
              >
                <Link href={`/courses/${courseId}/quiz/${template.id}`}>
                  {activeAttempt ? "Lanjutkan" : "Mulai"}
                  <ChevronRight className="ml-1 size-4" />
                </Link>
              </Button>
            );
          })();

          return (
            <li key={template.id} className="border-b border-border/60 last:border-0">
              <div
                className={cn(
                  "grid gap-3 px-4 py-3.5 transition-colors md:grid-cols-[minmax(0,1fr)_100px_180px] md:items-center",
                  accessible && isOpen ? "hover:bg-muted/30" : "bg-card/45 text-muted-foreground",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-heading text-body-base font-semibold text-foreground">
                      {template.title}
                    </h3>
                    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-body-xs capitalize text-muted-foreground">
                      {template.category}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-muted-foreground">
                    <span>{qCount} soal</span>
                    <span>·</span>
                    <span>{template.timeLimitSeconds ? `${Math.round(template.timeLimitSeconds / 60)} menit` : "Tanpa batas waktu"}</span>
                    {template.maxAttempts && (
                      <>
                        <span>·</span>
                        <span>Maks {template.maxAttempts}x percobaan</span>
                      </>
                    )}
                  </div>

                  {accessible && (
                    <div className="mt-2 flex flex-wrap gap-2 text-body-xs">
                      {activeAttempt && !isClosed && (
                        <span className="inline-flex items-center gap-1 font-medium text-amber-500">
                          <AlertCircle className="size-3.5" />
                          Sedang dikerjakan
                        </span>
                      )}
                      {highestScore !== null && (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-500">
                          <CheckCircle2 className="size-3.5" />
                          Terjawab (Nilai Terbaik: {highestScore}%)
                        </span>
                      )}

                      {template.maxAttempts && completedAttempts.length > 0 && (
                        <span className="text-muted-foreground">
                          ({completedAttempts.length}/{template.maxAttempts} percobaan selesai)
                        </span>
                      )}

                      {isUpcoming && openDate && (
                        <span className="inline-flex items-center gap-1 font-medium text-status-warning">
                          <AlertCircle className="size-3.5" />
                          Akan dibuka: <FormattedDate date={openDate} options={{ dateStyle: "medium", timeStyle: "short" }} />
                        </span>
                      )}

                      {isClosed && (
                        <span className="inline-flex items-center gap-1 font-medium text-status-error">
                          <AlertCircle className="size-3.5" />
                          {closeDate ? (
                            <>
                              Telah ditutup: <FormattedDate date={closeDate} options={{ dateStyle: "medium", timeStyle: "short" }} />
                            </>
                          ) : (
                            "Telah ditutup"
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <span
                  className={cn(
                    "inline-flex w-fit items-center gap-1 rounded-md px-2.5 py-0.5 text-body-xs font-semibold ring-1",
                    isFree
                      ? "bg-status-success/10 text-status-success ring-status-success/20"
                      : "bg-brand-primary/10 text-brand-primary ring-brand-primary/20",
                  )}
                >
                  {!isFree && !isEnrolled && <Lock className="size-3" />}
                  {isFree ? "Gratis" : "Premium"}
                </span>

                {buttonContent}
              </div>
            </li>
          );
        })}
      </ul>

      {templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center sm:p-10">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <ClipboardList className="size-6" />
          </div>
          <h3 className="font-heading text-body-base font-bold text-foreground">Belum ada kuis</h3>
          <p className="mx-auto mt-1 max-w-md text-body-sm text-muted-foreground">
            Kuis untuk mata kuliah ini belum tersedia.
          </p>
        </div>
      ) : null}
    </div>
  );
}
