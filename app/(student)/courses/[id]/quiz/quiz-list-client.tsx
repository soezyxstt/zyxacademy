"use client";

import Link from "next/link";
import { useStudentExperience } from "@/components/student-experience-provider";
import { Lock, ClipboardList } from "lucide-react";
import { FormattedDate } from "@/components/ui/formatted-date";
import { useTranslations } from "@/lib/i18n/client";
import { courseListRowClass } from "@/components/course/course-surfaces";
import type { quizTemplates, studentQuizAttempts } from "@/db/schema";

type TemplateType = Pick<typeof quizTemplates.$inferSelect, "id" | "title" | "visibility" | "category" | "selectionRules" | "timeLimitSeconds" | "manualStatus" | "openAt" | "closeAt">;
type AttemptType = Pick<typeof studentQuizAttempts.$inferSelect, "id" | "templateId" | "status" | "score">;

type QuizListClientProps = {
  courseId: string;
  hasFullContentAccess: boolean;
  accessTier?: "anonymous" | "free" | "standard";
  /** Server-approved Free templates. Invalid or broad rules stay locked. */
  freeEligibleTemplateIds?: string[];
  templates: TemplateType[];
  attempts: AttemptType[];
};

export function QuizListClient({ courseId, hasFullContentAccess, accessTier = hasFullContentAccess ? "standard" : "anonymous", freeEligibleTemplateIds = [], templates, attempts }: QuizListClientProps) {
  const t = useTranslations("learning");
  const experience = useStudentExperience();
  const freeEligibleIds = new Set(freeEligibleTemplateIds);

  return (
    <div className="font-sans">
      {templates.length > 0 && <ul className="divide-y divide-border/20">
        {templates.map((template) => {
          const isFree = template.visibility === "free";
          const accessible = accessTier === "standard"
            || (accessTier === "free" && freeEligibleIds.has(template.id));

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

          if (template.manualStatus === "closed") {
            isClosed = true;
          } else if (template.manualStatus === "open") {
            isClosed = false;
          } else if (closeDate && now > closeDate) {
            isClosed = true;
          } else if (openDate && now < openDate) {
            isUpcoming = true;
          }

          const actionBadge = (() => {
            if (!accessible) {
              return (
                <span className="shrink-0 text-muted-foreground">
                  <Lock className="size-4" aria-hidden />
                  <span className="sr-only">{t("quizList.locked")}</span>
                </span>
              );
            }
            if (isClosed) {
              if (accessible && (template as any).showDiscussion) {
                return (
                  <span className="shrink-0 text-body-xs font-semibold text-foreground">
                    {t("quizList.discussion")}
                  </span>
                );
              }
              return (
                <span className="text-body-xs text-muted-foreground">
                  {t("quizList.closed")}
                </span>
              );
            }
            if (isUpcoming) {
              return (
                <span className="text-body-xs text-muted-foreground">
                  {t("quizList.notOpen")}
                </span>
              );
            }
            return (
              <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 text-body-xs font-semibold text-foreground">
                {activeAttempt ? t("quizList.continue") : t("quizList.start")}
              </span>
            );
          })();

          const targetHref =
            isClosed && accessible && (template as any).showDiscussion
              ? `/courses/${courseId}/quiz/${template.id}?viewDiscussion=true`
              : `/courses/${courseId}/quiz/${template.id}`;

          return (
            <li key={template.id}>
              <Link
                href={experience.href?.(targetHref) ?? targetHref}
                className={courseListRowClass("justify-between [&>span]:self-center")}
              >
                <div className="min-w-0 flex-1">
                  <h3 className="break-words font-heading text-body-sm font-semibold text-foreground">
                    {template.title}
                  </h3>

                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body-xs text-muted-foreground">
                    <span>{t("quizList.questions", { count: qCount })}</span>
                    <span>·</span>
                    <span>{template.timeLimitSeconds ? t("quizList.minutes", { count: Math.round(template.timeLimitSeconds / 60) }) : t("quizList.noLimit")}</span>
                    {template.category && template.category !== "premium" && (
                      <>
                        <span>·</span>
                        <span className="capitalize">{template.category}</span>
                      </>
                    )}
                    {accessible && isFree && (
                      <>
                        <span>·</span>
                        <span>{t("quizList.free")}</span>
                      </>
                    )}
                    {highestScore !== null && (
                      <>
                        <span>·</span>
                        <span className="text-status-success font-medium">{t("quizList.score", { score: highestScore })}</span>
                      </>
                    )}
                    {activeAttempt && !isClosed && (
                      <>
                        <span>·</span>
                        <span className="text-amber-700 dark:text-amber-400 font-medium">{t("quizList.inProgress")}</span>
                      </>
                    )}
                    {isUpcoming && openDate && (
                      <>
                        <span>·</span>
                        <span className="text-status-warning">
                          {t("quizList.opensAt")} <FormattedDate date={openDate} options={{ dateStyle: "short", timeStyle: "short" }} />
                        </span>
                      </>
                    )}
                    {isClosed && closeDate && (
                      <>
                        <span>·</span>
                        <span className="text-status-error">
                          {t("quizList.closesAt")} <FormattedDate date={closeDate} options={{ dateStyle: "short", timeStyle: "short" }} />
                        </span>
                      </>
                    )}
                  </p>
                </div>

                {actionBadge}
              </Link>
            </li>
          );
        })}
      </ul>}

      {templates.length === 0 ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-12 text-center">
          <div className="mx-auto flex max-w-md flex-col items-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
              <ClipboardList className="size-6" aria-hidden />
            </div>
            <h3 className="font-heading text-body-base font-bold text-foreground">{t("quizList.emptyTitle")}</h3>
            <p className="mt-1 text-body-sm text-muted-foreground">
              {t("quizList.emptyDescription")}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
