"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, CircleAlert, Lock, Play, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/course/math-text";
import { cn } from "@/lib/utils";

interface StudyPathStep {
  stepId: string;
  ideaId: string | null;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  conceptName: string;
  status: "locked" | "available" | "in_progress" | "mastered";
  actions: { moduleHref?: string; quizTemplateId?: string; flashcardCount?: number };
  estimatedMinutes: number;
  prerequisites: string[];
  masteryScore?: number;
  priorityReason: string;
}

interface StudyDayPlan { day: number; steps: StudyPathStep[]; totalMinutes: number }

function primaryHref(step: StudyPathStep, courseId: string): string | null {
  if (step.actions.moduleHref) return step.actions.moduleHref;
  if (step.actions.quizTemplateId) return `/courses/${courseId}/quiz/${step.actions.quizTemplateId}`;
  if (step.actions.flashcardCount) return `/courses/${courseId}/flashcard`;
  return null;
}

function StepRow({ step, courseId }: { step: StudyPathStep; courseId: string }) {
  const href = primaryHref(step, courseId);
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
        "group flex items-center justify-between gap-3 px-4 py-3 transition-colors",
        isLocked
          ? "bg-muted/15 opacity-70"
          : "hover:bg-muted/30 active:bg-muted/50",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {statusIndicator}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-body-sm font-medium leading-snug text-foreground transition-colors group-hover:text-brand-primary">
            <MathText as="span">{step.conceptName}</MathText>
          </p>
          {isLocked && step.prerequisites.length > 0 && (
            <p className="mt-0.5 truncate text-body-xs text-muted-foreground">
              Prasyarat: <MathText as="span">{step.prerequisites.slice(0, 2).join(", ")}</MathText>
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 text-body-xs text-muted-foreground">
        <span>{step.estimatedMinutes}m</span>
        {!isLocked && (
          <span className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-primary text-body-sm">
            ›
          </span>
        )}
      </div>
    </div>
  );

  if (href && !isLocked) {
    return <Link href={href} className="block">{content}</Link>;
  }

  return <div>{content}</div>;
}

export function StudyPathTimeline({ courseId }: { courseId: string }) {
  const [steps, setSteps] = useState<StudyPathStep[]>([]);
  const [dayPlan, setDayPlan] = useState<StudyDayPlan[] | null>(null);
  const [daysInput, setDaysInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStudyPath = useCallback(async (days?: number) => {
    const planningRequest = typeof days === "number";
    if (planningRequest) setPlanning(true); else setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/student/study-path?courseId=${courseId}${planningRequest ? `&days=${days}` : ""}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Gagal memuat alur belajar");
      setSteps(data.steps ?? []);
      setDayPlan(data.dayPlan ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Terjadi kesalahan koneksi");
    } finally {
      setLoading(false); setPlanning(false);
    }
  }, [courseId]);

  useEffect(() => { void fetchStudyPath(); }, [fetchStudyPath]);
  const groups = useMemo(() => {
    const map = new Map<string, { title: string; order: number; steps: StudyPathStep[] }>();
    for (const step of steps) {
      const current = map.get(step.chapterId) ?? { title: step.chapterTitle, order: step.chapterOrder, steps: [] };
      current.steps.push(step); map.set(step.chapterId, current);
    }
    return Array.from(map.entries()).sort((left, right) => left[1].order - right[1].order);
  }, [steps]);
  const nextStep = steps.find((step) => step.status === "in_progress") ?? steps.find((step) => step.status === "available");

  if (loading) return <div className="space-y-3" aria-busy="true">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-lg bg-muted/50" />)}</div>;
  if (error) return <div className="flex items-center gap-3 rounded-lg border border-status-error/20 bg-status-error/5 p-4 text-status-error"><TriangleAlert className="size-4" /><span className="flex-1 text-body-sm">{error}</span><Button variant="ghost" size="sm" onClick={() => void fetchStudyPath()}>Coba lagi</Button></div>;
  if (steps.length === 0) return <div className="rounded-lg border border-dashed border-border p-8 text-center"><CircleAlert className="mx-auto size-5 text-muted-foreground" /><p className="mt-2 text-body-sm text-muted-foreground">Alur belajar akan tersedia setelah konten kelas diproses.</p></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
        <label htmlFor="study-path-days" className="text-body-sm text-muted-foreground">Target selesai dalam</label>
        <input id="study-path-days" type="number" min={1} max={60} value={daysInput} onChange={(event) => setDaysInput(event.target.value)} placeholder="7" className="h-9 w-16 rounded-md border border-input bg-background px-2 text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <span className="text-body-sm text-muted-foreground">hari</span>
        <Button type="button" size="sm" variant="outline" className="rounded-md" disabled={planning || !daysInput} onClick={() => { const days = Number.parseInt(daysInput, 10); if (days > 0) void fetchStudyPath(days); }}>{planning ? "Menyusun..." : "Buat rencana"}</Button>
        {dayPlan ? <Button type="button" size="sm" variant="ghost" className="rounded-md" onClick={() => setDayPlan(null)}>Lihat roadmap</Button> : null}
      </div>

      {dayPlan ? (
        <div className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card overflow-hidden shadow-2xs">
          {dayPlan.map((day, index) => (
            <details key={day.day} open={index === 0} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-body-sm font-semibold hover:bg-muted/30 transition-colors">
                <span>Hari {day.day}</span>
                <span className="flex items-center gap-2 text-body-xs font-normal text-muted-foreground">
                  {day.totalMinutes} menit
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
            <section className="grid gap-3 rounded-xl border border-brand-primary/25 bg-brand-primary/5 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center shadow-xs">
              <div>
                <p className="text-body-xs font-semibold text-brand-primary">Lanjutkan belajar</p>
                <h2 className="mt-1 font-heading text-body-base font-bold text-foreground">
                  <MathText as="span">{nextStep.conceptName}</MathText>
                </h2>
                <p className="mt-1 text-body-xs text-muted-foreground">
                  {nextStep.priorityReason}, sekitar {nextStep.estimatedMinutes} menit.
                </p>
              </div>
              {primaryHref(nextStep, courseId) ? (
                <Button asChild size="sm" className="rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90">
                  <Link href={primaryHref(nextStep, courseId)!}>
                    <Play className="mr-1.5 size-3.5 fill-white" />Mulai
                  </Link>
                </Button>
              ) : null}
            </section>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-status-success/20 bg-status-success/5 p-4 text-body-sm text-status-success">
              <Check className="size-4" />Semua langkah sudah dikuasai.
            </div>
          )}

          <div className="space-y-3">
            {groups.map(([chapterId, group], groupIdx) => {
              const active = group.steps.filter((step) => step.status !== "mastered" && step.status !== "locked");
              const locked = group.steps.filter((step) => step.status === "locked");
              const mastered = group.steps.filter((step) => step.status === "mastered");
              const hasNextStep = group.steps.some((s) => s.stepId === nextStep?.stepId);
              const defaultOpen = hasNextStep || (groupIdx === 0 && !nextStep);

              return (
                <details key={chapterId} open={defaultOpen} className="group overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xs">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 select-none hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                      <h2 className="font-heading text-body-sm font-bold truncate">Bab {group.order}: {group.title}</h2>
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
