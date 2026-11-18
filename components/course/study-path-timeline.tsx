"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, CircleAlert, Lock, Play, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/course/math-text";
import { CourseStudyPathSkeleton } from "@/components/course/course-skeletons";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

import { useStudentExperience } from "@/components/student-experience-provider";

import { StudentAccountBoundary } from "@/components/student-account-boundary";
import { useStudyPath, useLocalStudyPath, type StudyPathState } from "@/hooks/use-study-path";
import type { StudyPathStep } from "@/lib/student/study-path-query";
export type { StudyPathStep } from "@/lib/student/study-path-query";

function primaryHref(step: StudyPathStep, courseId: string): string | null {
  if (step.actions.moduleHref) return step.actions.moduleHref;
  if (step.actions.quizTemplateId) return `/courses/${courseId}/quiz/${step.actions.quizTemplateId}`;
  if (step.actions.flashcardCount) return `/courses/${courseId}/flashcard`;
  return null;
}

function StepRow({ step, courseId }: { step: StudyPathStep; courseId: string }) {
  const t = useTranslations("studentCourse");
  const experience = useStudentExperience();
  const studentHref = primaryHref(step, courseId);
  const href = studentHref ? experience.href?.(studentHref) ?? studentHref : null;
  const isLocked = step.status === "locked";

  const statusIndicator = (() => {
    if (step.status === "mastered") {
      return (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-status-success text-white">
          <Check className="size-3 stroke-[3]" />
        </span>
      );
    }
    if (step.status === "in_progress") {
      return (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-brand-primary">
          <span className="size-1.5 rounded-full bg-brand-primary" />
        </span>
      );
    }
    if (isLocked) {
      return (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border/80 bg-muted/30 text-muted-foreground">
          <Lock className="size-2.5" />
        </span>
      );
    }
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40" />
    );
  })();

  const content = (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-3 transition-colors",
        href && !isLocked && "group/step",
        isLocked || !href
          ? "bg-muted/15"
          : "hover:bg-muted/30 active:bg-muted/50",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {statusIndicator}
        <div className="min-w-0 flex-1">
          <p className="break-words text-body-sm font-medium leading-snug text-foreground transition-colors group-hover/step:text-brand-primary">
            <MathText as="span">{step.conceptName}</MathText>
          </p>
          {isLocked && step.prerequisites.length > 0 && (
            <p className="mt-0.5 break-words text-body-xs text-muted-foreground">
              {t("course.studyPath.prerequisites")} <MathText as="span">{step.prerequisites.slice(0, 2).join(", ")}</MathText>
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 text-body-xs text-muted-foreground">
        <span>{t("course.studyPath.minutesShort", { count: step.estimatedMinutes })}</span>
        {href && !isLocked && (
          <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground group-hover/step:text-brand-primary" />
        )}
      </div>
    </div>
  );

  if (href && !isLocked) {
    return <Link href={href} className="block">{content}</Link>;
  }

  return <div>{content}</div>;
}

export function StudyPathTimeline({ courseId, initialSteps }: { courseId: string; initialSteps?: StudyPathStep[] }) {
  if (initialSteps) return <LocalStudyPath key={courseId} courseId={courseId} steps={initialSteps} />;
  return <StudentAccountBoundary>{({ data }) => data?.user.id
    ? <LiveStudyPath key={`${data.user.id}:${courseId}`} courseId={courseId} userId={data.user.id} />
    : <CourseStudyPathSkeleton />}</StudentAccountBoundary>;
}

function LocalStudyPath({ courseId, steps }: { courseId: string; steps: StudyPathStep[] }) {
  const state = useLocalStudyPath(steps);
  return <StudyPathView courseId={courseId} state={state} />;
}

function LiveStudyPath({ userId, courseId }: { userId: string; courseId: string }) {
  const state = useStudyPath(userId, courseId);
  return <StudyPathView courseId={courseId} state={state} />;
}

function StudyPathView({ courseId, state }: { courseId: string; state: StudyPathState }) {
  const experience = useStudentExperience();
  const href = (path: string) => experience.href?.(path) ?? path;
  const t = useTranslations("studentCourse");
  const [daysInput, setDaysInput] = useState("");
  const { steps, dayPlan, loading, planning, error } = state;
  const groups = useMemo(() => {
    const map = new Map<string, { title: string; order: number; steps: StudyPathStep[] }>();
    for (const step of steps) {
      const current = map.get(step.chapterId) ?? { title: step.chapterTitle, order: step.chapterOrder, steps: [] };
      current.steps.push(step); map.set(step.chapterId, current);
    }
    return Array.from(map.entries()).sort((left, right) => left[1].order - right[1].order);
  }, [steps]);
  const nextStep = steps.find((step) => step.status === "in_progress") ?? steps.find((step) => step.status === "available");

  if (loading) return <CourseStudyPathSkeleton />;
  if (error) return <div className="flex items-center gap-3 rounded-lg border border-status-error/20 bg-status-error/5 p-4 text-status-error"><TriangleAlert className="size-4" /><span className="flex-1 text-body-sm">{t("course.studyPath.connectionError")}</span><Button variant="ghost" size="sm" onClick={state.retry}>{t("course.studyPath.retry")}</Button></div>;
  if (steps.length === 0) return <div className="flex items-center gap-2 py-3"><CircleAlert className="size-5 shrink-0 text-muted-foreground" /><p className="text-body-sm text-muted-foreground">{t("course.studyPath.empty")}</p></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
        <label htmlFor="study-path-days" className="text-body-sm text-muted-foreground">{t("course.studyPath.targetDuration")}</label>
        <Input id="study-path-days" type="number" min={1} max={60} value={daysInput} onChange={(event) => setDaysInput(event.target.value)} placeholder="7" className="h-9 w-16 rounded-md border border-input bg-background px-2 text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <span className="text-body-sm text-muted-foreground">{t("course.studyPath.days")}</span>
        <Button type="button" size="sm" variant="outline" className="rounded-md" disabled={planning || !daysInput} onClick={() => { const days = Number.parseInt(daysInput, 10); if (days > 0) state.plan(days); }}>{planning ? t("course.studyPath.planning") : t("course.studyPath.createPlan")}</Button>
        {dayPlan ? <Button type="button" size="sm" variant="ghost" className="rounded-md" onClick={state.showRoadmap}>{t("course.studyPath.viewRoadmap")}</Button> : null}
      </div>

      {dayPlan ? (
        <div className="divide-y divide-border/60">
          {dayPlan.map((day, index) => (
            <details key={day.day} open={index === 0} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-body-sm font-semibold hover:bg-muted/30 transition-colors">
                <span>{t("course.studyPath.day", { count: day.day })}</span>
                <span className="flex items-center gap-2 text-body-xs font-normal text-muted-foreground">
                  {t("course.studyPath.minutes", { count: day.totalMinutes })}
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                </span>
              </summary>
              <div className="divide-y divide-border/40 border-t border-border/60">
                {day.steps.map((step) => <StepRow key={step.stepId} step={step} courseId={courseId} />)}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <>
          {nextStep ? (
            <section className="grid gap-3 border-l-2 border-brand-primary bg-brand-primary/5 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <p className="text-body-xs font-semibold text-brand-primary">{t("course.studyPath.continueLearning")}</p>
                <h2 className="mt-1 font-heading text-body-base font-bold text-foreground">
                  <MathText as="span">{nextStep.conceptName}</MathText>
                </h2>
                <p className="mt-1 text-body-xs text-muted-foreground">
                  {t("course.studyPath.estimatedTime", { reason: nextStep.priorityReason, count: nextStep.estimatedMinutes })}
                </p>
              </div>
              {primaryHref(nextStep, courseId) ? (
                <Button asChild size="sm" className="rounded-lg bg-brand-primary text-primary-foreground hover:bg-brand-primary/90">
                  <Link href={href(primaryHref(nextStep, courseId)!)}>
                    <Play className="mr-1.5 size-3.5 fill-white" />{t("course.studyPath.start")}
                  </Link>
                </Button>
              ) : null}
            </section>
          ) : (
            <div className="flex items-center gap-2 py-3 text-body-sm text-status-success">
              <Check className="size-4" />{t("course.studyPath.allMastered")}
            </div>
          )}

          <div className="divide-y divide-border/60 border-y border-border/60">
            {groups.map(([chapterId, group], groupIdx) => {
              const active = group.steps.filter((step) => step.status !== "mastered" && step.status !== "locked");
              const locked = group.steps.filter((step) => step.status === "locked");
              const mastered = group.steps.filter((step) => step.status === "mastered");
              const hasNextStep = group.steps.some((s) => s.stepId === nextStep?.stepId);
              const defaultOpen = hasNextStep || (groupIdx === 0 && !nextStep);

              return (
                <details key={chapterId} open={defaultOpen} className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 py-3 select-none hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                      <h2 className="font-heading text-body-sm font-bold break-words">Bab {group.order}: {group.title}</h2>
                    </div>
                    <span className="text-body-xs text-muted-foreground shrink-0 font-medium">
                      {mastered.length}/{group.steps.length} konsep dikuasai
                    </span>
                  </summary>
                  <div className="divide-y divide-border/40 border-t border-border/60">
                    {active.map((step) => <StepRow key={step.stepId} step={step} courseId={courseId} />)}
                    {locked.length > 0 ? (
                      <details className="group/locked border-t border-border/60">
                        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-body-xs font-medium text-muted-foreground hover:bg-muted/20">
                          <span>{locked.length} konsep terkunci</span>
                          <ChevronDown className="size-3.5 transition-transform group-open/locked:rotate-180" />
                        </summary>
                        <div className="divide-y divide-border/40 border-t border-border/40">
                          {locked.map((step) => <StepRow key={step.stepId} step={step} courseId={courseId} />)}
                        </div>
                      </details>
                    ) : null}
                    {mastered.length > 0 ? (
                      <details className="group/mastered border-t border-border/60">
                        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-body-xs font-medium text-muted-foreground hover:bg-muted/20">
                          <span>{mastered.length} konsep sudah dikuasai</span>
                          <ChevronDown className="size-3.5 transition-transform group-open/mastered:rotate-180" />
                        </summary>
                        <div className="divide-y divide-border/40 border-t border-border/40">
                          {mastered.map((step) => <StepRow key={step.stepId} step={step} courseId={courseId} />)}
                        </div>
                      </details>
                    ) : null}
                  </div>
                </details>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
