"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStudentExperience } from "@/components/student-experience-provider";
import { ChevronRight, Lock, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormattedDate } from "@/components/ui/formatted-date";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

interface TryoutItem {
  id: string;
  courseId: string;
  title: string;
  type: "quiz" | "tryout";
  status: "draft" | "published" | "ended";
  settings: any;
  questions: any[];
  questionCount: number;
  isFree?: boolean;
  isPreview?: boolean;
  openAt?: Date | string | null;
  closeAt?: Date | string | null;
}

type TryoutListClientProps = {
  courseId: string;
  isEnrolled: boolean;
  tryouts: TryoutItem[];
};

function readAttempts(tryouts: TryoutItem[]) {
  const counts: Record<string, number> = {};

  if (typeof window === "undefined") {
    return counts;
  }

  for (const tryout of tryouts) {
    try { const value = Number.parseInt(localStorage.getItem(`zyx-tryout-attempts-${tryout.id}`) || "0", 10); counts[tryout.id] = Number.isSafeInteger(value) && value >= 0 ? value : 0; } catch { counts[tryout.id] = 0; }
  }

  return counts;
}

export function TryoutListClient({ courseId, isEnrolled, tryouts }: TryoutListClientProps) {
  const t = useTranslations("learning");
  const experience = useStudentExperience();
  const href = experience.href ?? ((path: string) => path);
  const [attempts, setAttempts] = useState<Record<string, number>>({});

  useEffect(() => {
    const handleReset = () => {
      setAttempts(experience.mode === "demo" ? Object.fromEntries(tryouts.map(tryout => [tryout.id, experience.overlay?.events.some(event => event.id === "fictional-tryout-complete") ? 1 : 0])) : readAttempts(tryouts));
    };
    handleReset();

    window.addEventListener("zyx-tryout-attempts-reset", handleReset);
    return () => window.removeEventListener("zyx-tryout-attempts-reset", handleReset);
  }, [tryouts, experience.mode, experience.overlay]);

  return (
    <div className="space-y-3 font-sans">
      {tryouts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-8 sm:p-12 text-center max-w-md mx-auto">
          <GraduationCap className="size-10 text-muted-foreground/40 mb-3" aria-hidden />
          <h3 className="font-heading text-body-base font-bold text-foreground">
            {t("tryoutList.emptyTitle")}
          </h3>
          <p className="mt-1 text-body-xs text-muted-foreground leading-relaxed">
            {t("tryoutList.emptyDescription")}
          </p>
          <Button asChild size="sm" className="mt-5 rounded-md">
            <Link href={href(`/courses/${courseId}/quiz`)}>
              {t("tryoutList.practiceWithQuiz")}
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border bg-card">
          {tryouts.map((tryout) => {
          const attemptCount = attempts[tryout.id] || 0;
          const maxAttempts = tryout.settings?.maxAttempts ?? 2;
          const isBlocked = attemptCount >= maxAttempts;
          const isFree = tryout.isFree || tryout.isPreview;
          const accessible = isEnrolled || isFree;

          const now = new Date();
          const openDate = tryout.openAt ? new Date(tryout.openAt) : null;
          const closeDate = tryout.closeAt ? new Date(tryout.closeAt) : null;

          let isUpcoming = false;
          let isClosed = false;
          let isOpen = true;

          if (closeDate && now > closeDate) {
            isClosed = true;
            isOpen = false;
          } else if (openDate && now < openDate) {
            isUpcoming = true;
            isOpen = false;
          } else {
            isOpen = true;
          }

          const canStart = accessible && !isBlocked && isOpen;

          const buttonContent = (() => {
            if (!accessible) {
              return (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="interactive rounded-md md:justify-self-end border-dashed text-muted-foreground hover:text-foreground"
                >
                  <Link href={href(`/courses/${courseId}/tryout/${tryout.id}`)}>
                    {t("quizList.open")} <Lock className="ml-1 size-3.5" />
                  </Link>
                </Button>
              );
            }
            if (isBlocked) {
              return (
                <Button
                  disabled
                  variant="outline"
                  size="sm"
                  className="rounded-md md:justify-self-end border-dashed"
                >
                  {t("tryoutList.attemptLimitReached")}
                </Button>
              );
            }
            if (isClosed) {
              return (
                <Button
                  disabled
                  variant="outline"
                  size="sm"
                  className="rounded-md md:justify-self-end border-dashed"
                >
                  {t("quizList.closed")}
                </Button>
              );
            }
            if (isUpcoming) {
              return (
                <Button
                  disabled
                  variant="outline"
                  size="sm"
                  className="rounded-md md:justify-self-end border-dashed"
                >
                  {t("quizList.notOpen")}
                </Button>
              );
            }
            return (
              <Button
                asChild
                variant="default"
                size="sm"
                className="interactive rounded-md md:justify-self-end bg-brand-primary text-primary-foreground hover:bg-brand-primary/95"
              >
                <Link href={href(`/courses/${courseId}/tryout/${tryout.id}`)}>
                  {t("tryoutList.start")} <ChevronRight className="ml-1 size-4" />
                </Link>
              </Button>
            );
          })();

          return (
            <li key={tryout.id} className="border-b border-border/60 last:border-0">
              <div
                className={cn(
                  "grid gap-3 px-4 py-3 transition-colors md:grid-cols-[minmax(0,1fr)_160px_180px] md:items-center",
                  canStart ? "hover:bg-muted/30" : "bg-card/45 text-muted-foreground",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words font-heading text-body-sm font-semibold text-foreground">
                      {tryout.title}
                    </h3>
                    {!accessible ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-body-xs font-semibold text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
                        <Lock className="size-3" />
                        {t("quizList.locked")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-brand-primary/10 px-2 py-0.5 text-body-xs font-semibold text-brand-primary ring-1 ring-brand-primary/20">
                        {isFree ? t("quizList.free") : t("quizList.premium")}
                      </span>
                    )}
                    {isBlocked ? (
                      <span className="rounded-md bg-status-error/12 px-2 py-0.5 text-body-xs font-semibold text-status-error ring-1 ring-status-error/20">
                        {t("tryoutList.attemptLimitReached")}
                      </span>
                    ) : null}
                    {isUpcoming && openDate ? (
                      <span className="rounded-md bg-status-warning/12 px-2 py-0.5 text-body-xs font-semibold text-status-warning ring-1 ring-status-warning/20">
                        {t("quizList.opensAt")} <FormattedDate date={openDate} options={{ dateStyle: "medium", timeStyle: "short" }} />
                      </span>
                    ) : null}
                    {isClosed ? (
                      <span className="rounded-md bg-status-error/12 px-2 py-0.5 text-body-xs font-semibold text-status-error ring-1 ring-status-error/20">
                        {closeDate
                          ? <>{t("tryoutList.closedAt")} <FormattedDate date={closeDate} options={{ dateStyle: "medium", timeStyle: "short" }} /></>
                          : t("quizList.closed")}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-body-xs text-muted-foreground">
                    {t("quizList.questions", { count: tryout.questionCount })} · {t("quizList.minutes", { count: tryout.settings?.timeLimitMinutes ?? 90 })}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-body-xs text-muted-foreground md:justify-center">
                  <span className="font-semibold text-foreground">{attemptCount}</span>
                  <span>/ {t("tryoutList.attempts", { count: maxAttempts })}</span>
                  <div className="flex gap-1">
                    {Array.from({ length: maxAttempts }).map((_, index) => (
                      <span
                        key={index}
                        className={cn(
                          "size-2 rounded-full border border-border/80",
                          index < attemptCount ? "border-transparent bg-brand-secondary" : "bg-muted",
                        )}
                      />
                    ))}
                  </div>
                </div>

                {buttonContent}
              </div>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}
