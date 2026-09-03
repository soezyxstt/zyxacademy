"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Brain, Check, ChevronDown, CircleAlert, Clock3, Lock, Play, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
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

function statusLabel(step: StudyPathStep) {
  if (step.status === "mastered") return "Dikuasai";
  if (step.status === "locked") return "Terkunci";
  if (step.status === "in_progress") return "Sedang dipelajari";
  return "Siap dimulai";
}

function StepRow({ step, courseId }: { step: StudyPathStep; courseId: string }) {
  const href = primaryHref(step, courseId);
  return (
    <div className={cn("grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center hover:bg-muted/15 transition-colors", step.status === "locked" && "bg-muted/20")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-body-sm font-semibold", step.status === "locked" ? "text-muted-foreground" : "text-foreground")}>{step.conceptName}</span>
          <span className={cn("rounded-md px-1.5 py-0.5 text-body-xs", step.status === "mastered" ? "bg-status-success/10 text-status-success font-medium" : step.status === "locked" ? "bg-muted text-muted-foreground" : "bg-brand-primary/10 text-brand-primary font-medium")}>{statusLabel(step)}</span>
        </div>
        {step.status === "locked" ? (
          <p className="mt-1 flex items-start gap-1.5 text-body-xs text-muted-foreground"><Lock className="mt-0.5 size-3 shrink-0" />Selesaikan {step.prerequisites.slice(0, 2).join(" dan ") || "materi prasyarat"} terlebih dahulu.</p>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{step.estimatedMinutes} menit</span>
            {typeof step.masteryScore === "number" && step.masteryScore > 0 ? <span>Penguasaan {step.masteryScore}%</span> : null}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        {step.status !== "locked" && step.actions.quizTemplateId && href !== `/courses/${courseId}/quiz/${step.actions.quizTemplateId}` ? <Button asChild variant="ghost" size="sm" className="rounded-md h-8 text-body-xs"><Link href={`/courses/${courseId}/quiz/${step.actions.quizTemplateId}`}><BookOpen className="mr-1 size-3.5" />Kuis</Link></Button> : null}
        {step.status !== "locked" && step.actions.flashcardCount && href !== `/courses/${courseId}/flashcard` ? <Button asChild variant="ghost" size="sm" className="rounded-md h-8 text-body-xs"><Link href={`/courses/${courseId}/flashcard`}><Brain className="mr-1 size-3.5" />{step.actions.flashcardCount} kartu</Link></Button> : null}
        {step.status !== "locked" && href ? <Button asChild size="sm" className="rounded-md h-8 text-body-xs"><Link href={href}>Lanjutkan</Link></Button> : null}
      </div>
    </div>
  );
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
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {dayPlan.map((day, index) => <details key={day.day} open={index === 0} className="group"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-body-sm font-semibold"><span>Hari {day.day}</span><span className="flex items-center gap-2 text-body-xs font-normal text-muted-foreground">{day.totalMinutes} menit<ChevronDown className="size-4 transition-transform group-open:rotate-180" /></span></summary><div className="border-t border-border/60">{day.steps.map((step) => <StepRow key={step.stepId} step={step} courseId={courseId} />)}</div></details>)}
        </div>
      ) : (
        <>
          {nextStep ? (
            <section className="grid gap-3 rounded-lg border border-brand-primary/25 bg-brand-primary/5 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div><p className="text-body-xs font-semibold text-brand-primary">Lanjutkan belajar</p><h2 className="mt-1 font-heading text-body-base font-bold">{nextStep.conceptName}</h2><p className="mt-1 text-body-sm text-muted-foreground">{nextStep.priorityReason}, sekitar {nextStep.estimatedMinutes} menit.</p></div>
              {primaryHref(nextStep, courseId) ? <Button asChild className="rounded-md"><Link href={primaryHref(nextStep, courseId)!}><Play className="mr-1.5 size-4" />Mulai</Link></Button> : null}
            </section>
          ) : <div className="flex items-center gap-2 rounded-lg border border-status-success/20 bg-status-success/5 p-4 text-body-sm text-status-success"><Check className="size-4" />Semua langkah sudah dikuasai.</div>}

          <div className="space-y-3">
            {groups.map(([chapterId, group], groupIdx) => {
              const active = group.steps.filter((step) => step.status !== "mastered" && step.status !== "locked");
              const locked = group.steps.filter((step) => step.status === "locked");
              const mastered = group.steps.filter((step) => step.status === "mastered");
              const hasNextStep = group.steps.some((s) => s.stepId === nextStep?.stepId);
              const defaultOpen = hasNextStep || (groupIdx === 0 && !nextStep);

              return (
                <details key={chapterId} open={defaultOpen} className="group overflow-hidden rounded-lg border border-border/70 bg-card">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 select-none hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                      <h2 className="font-heading text-body-sm font-bold truncate">Bab {group.order}: {group.title}</h2>
                    </div>
                    <span className="text-body-xs text-muted-foreground shrink-0 font-medium">
                      {mastered.length}/{group.steps.length} konsep dikuasai
                    </span>
                  </summary>
                  <div className="border-t border-border/60">
                    {active.map((step) => <StepRow key={step.stepId} step={step} courseId={courseId} />)}
                    {locked.length > 0 ? (
                      <details className="group/locked border-t border-border/60">
                        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-body-xs font-medium text-muted-foreground hover:bg-muted/20">
                          <span>{locked.length} konsep terkunci</span>
                          <ChevronDown className="size-3.5 transition-transform group-open/locked:rotate-180" />
                        </summary>
                        {locked.map((step) => <StepRow key={step.stepId} step={step} courseId={courseId} />)}
                      </details>
                    ) : null}
                    {mastered.length > 0 ? (
                      <details className="group/mastered border-t border-border/60">
                        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-body-xs font-medium text-muted-foreground hover:bg-muted/20">
                          <span>{mastered.length} konsep sudah dikuasai</span>
                          <ChevronDown className="size-3.5 transition-transform group-open/mastered:rotate-180" />
                        </summary>
                        {mastered.map((step) => <StepRow key={step.stepId} step={step} courseId={courseId} />)}
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
