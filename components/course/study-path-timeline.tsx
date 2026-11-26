"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, CircleAlert, Lock, Play, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-foreground/75">
          <span className="size-1.5 rounded-full bg-foreground/75" />
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
        "flex items-start justify-between gap-3 py-(--row-padding) transition-colors",
        isLocked || !href
          ? "text-muted-foreground"
          : "hover:bg-muted/30 active:bg-muted/50",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {statusIndicator}
        <div className="min-w-0 flex-1">
          <p className={cn("wrap-anywhere text-body-sm font-medium leading-snug", !isLocked && "text-foreground")}>
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
      </div>
    </div>
  );

  if (href && !isLocked) {
    return <Link href={href} className="block rounded-md focus-visible:outline-2 focus-visible:outline-ring">{content}</Link>;
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
            <Collapsible key={day.day} defaultOpen={index === 0}>
              <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between gap-3 py-3 text-left text-body-sm font-semibold hover:bg-muted/30 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
                <span>{t("course.studyPath.day", { count: day.day })}</span>
                <span className="flex items-center gap-2 text-body-xs font-normal text-muted-foreground">
                  {t("course.studyPath.minutes", { count: day.totalMinutes })}
                  <ChevronDown className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="divide-y divide-border/40 border-t border-border/60">
                  {day.steps.map((step) => <StepRow key={step.stepId} step={step} courseId={courseId} />)}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      ) : (
        <>
          {nextStep ? (
            <section className="grid gap-3 border-l-2 border-foreground/35 py-2 pl-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <p className="text-body-xs font-semibold text-muted-foreground">{t("course.studyPath.continueLearning")}</p>
                <h2 className="mt-1 font-heading text-body-base font-bold text-foreground">
                  <MathText as="span">{nextStep.conceptName}</MathText>
                </h2>
                <p className="mt-1 text-body-xs text-muted-foreground">
                  {t("course.studyPath.estimatedTime", { reason: nextStep.priorityReason, count: nextStep.estimatedMinutes })}
                </p>
              </div>
              {primaryHref(nextStep, courseId) ? (
                <Button asChild size="sm" variant="secondary" className="justify-self-end">
                  <Link href={href(primaryHref(nextStep, courseId)!)}>
                    <Play className="size-3.5" aria-hidden />{t("course.studyPath.start")}
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
                <Collapsible key={chapterId} defaultOpen={defaultOpen}>
                  <CollapsibleTrigger className="group flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 py-3 text-left select-none hover:bg-muted/30 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                      <h2 className="font-heading text-body-sm font-bold break-words">Bab {group.order}: {group.title}</h2>
                    </div>
                    <span className="text-body-xs text-muted-foreground shrink-0 font-medium">
                      {mastered.length}/{group.steps.length} konsep dikuasai
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="divide-y divide-border/40 border-t border-border/60">
                      {active.map((step) => <StepRow key={step.stepId} step={step} courseId={courseId} />)}
                      {locked.length > 0 ? (
                        <Collapsible className="border-t border-border/60">
                          <CollapsibleTrigger className="group/locked flex w-full cursor-pointer items-center justify-between px-4 py-2.5 text-left text-body-xs font-medium text-muted-foreground hover:bg-muted/20 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
                            <span>{locked.length} konsep terkunci</span>
                            <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]/locked:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="divide-y divide-border/40 border-t border-border/40">
                              {locked.map((step) => <StepRow key={step.stepId} step={step} courseId={courseId} />)}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      ) : null}
                      {mastered.length > 0 ? (
                        <Collapsible className="border-t border-border/60">
                          <CollapsibleTrigger className="group/mastered flex w-full cursor-pointer items-center justify-between px-4 py-2.5 text-left text-body-xs font-medium text-muted-foreground hover:bg-muted/20 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
                            <span>{mastered.length} konsep sudah dikuasai</span>
                            <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]/mastered:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="divide-y divide-border/40 border-t border-border/40">
                              {mastered.map((step) => <StepRow key={step.stepId} step={step} courseId={courseId} />)}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      ) : null}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
