"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStudentExperience } from "@/components/student-experience-provider";
import { Lock, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormattedDate } from "@/components/ui/formatted-date";
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
  hasFullContentAccess: boolean;
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

export function TryoutListClient({ courseId, hasFullContentAccess, tryouts }: TryoutListClientProps) {
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
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-12 text-center">
          <div className="mx-auto flex max-w-md flex-col items-center">
            <GraduationCap className="size-10 text-muted-foreground/40 mb-3" aria-hidden />
            <h3 className="font-heading text-body-base font-bold text-foreground">
              {t("tryoutList.emptyTitle")}
            </h3>
            <p className="mt-1 text-body-xs text-muted-foreground leading-relaxed">
              {t("tryoutList.emptyDescription")}
            </p>
            <Button asChild size="sm" className="mt-5 rounded-md text-body-sm">
              <Link href={href(`/courses/${courseId}/quiz`)}>
                {t("tryoutList.practiceWithQuiz")}
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border/20">
          {tryouts.map((tryout) => {
          const attemptCount = attempts[tryout.id] || 0;
          const maxAttempts = tryout.settings?.maxAttempts ?? 2;
          const isBlocked = attemptCount >= maxAttempts;
          const isFree = tryout.isFree || tryout.isPreview;
          const accessible = hasFullContentAccess || isFree;

          const now = new Date();
          const openDate = tryout.openAt ? new Date(tryout.openAt) : null;
          const closeDate = tryout.closeAt ? new Date(tryout.closeAt) : null;

          let isUpcoming = false;
          let isClosed = false;

          if (closeDate && now > closeDate) {
            isClosed = true;
          } else if (openDate && now < openDate) {
            isUpcoming = true;
          }

          const buttonContent = (() => {
            if (!accessible) {
              return (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="justify-self-end text-muted-foreground hover:text-foreground"
                >
                  <Link href={href(`/courses/${courseId}/tryout/${tryout.id}`)}>
                    {t("quizList.open")} <Lock className="size-3.5" aria-hidden />
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
                  className="justify-self-end"
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
                  className="justify-self-end"
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
                  className="justify-self-end"
                >
                  {t("quizList.notOpen")}
                </Button>
              );
            }
            return (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="justify-self-end bg-muted text-foreground hover:bg-foreground/15 dark:hover:bg-foreground/15"
              >
                <Link href={href(`/courses/${courseId}/tryout/${tryout.id}`)}>
                  {t("tryoutList.start")}
                </Link>
              </Button>
            );
          })();

          return (
            <li key={tryout.id}>
              <div
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-(--row-padding) md:grid-cols-[minmax(0,1fr)_auto_minmax(10rem,auto)]"
              >
                <div className="col-span-2 min-w-0 md:col-span-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words font-heading text-body-sm font-semibold text-foreground">
                      {tryout.title}
                    </h3>
                    {!accessible && <span className="text-body-xs text-muted-foreground">{t("quizList.locked")}</span>}
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
                    {isFree && <> · {t("quizList.free")}</>}
                  </p>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-1 text-body-xs text-muted-foreground md:justify-center">
                  <span className="font-semibold text-foreground">{attemptCount}</span>
                  <span>/ {t("tryoutList.attempts", { count: maxAttempts })}</span>
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
