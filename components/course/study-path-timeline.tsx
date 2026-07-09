"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

interface StudyPathStep {
  conceptName: string;
  status: "locked" | "available" | "in_progress" | "mastered";
  actions: {
    moduleHref?: string;
    quizTemplateId?: string;
    flashcardCount?: number;
  };
  estimatedMinutes: number;
  prerequisites: string[];
  masteryScore?: number;
}

interface StudyDayPlan {
  day: number;
  steps: StudyPathStep[];
  totalMinutes: number;
}

type Props = {
  courseId: string;
};

export function StudyPathTimeline({ courseId }: Props) {
  const [steps, setSteps] = useState<StudyPathStep[]>([]);
  const [dayPlan, setDayPlan] = useState<StudyDayPlan[] | null>(null);
  const [daysInput, setDaysInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStudyPath = async (days?: number) => {
    const isPlanRequest = typeof days === "number";
    if (isPlanRequest) setPlanning(true); else setLoading(true);
    setError(null);
    try {
      const qs = isPlanRequest ? `&days=${days}` : "";
      const res = await fetch(`/api/student/study-path?courseId=${courseId}${qs}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Gagal memuat alur belajar");
      }
      const data = await res.json();
      setSteps(data.steps || []);
      setDayPlan(data.dayPlan ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan koneksi");
    } finally {
      if (isPlanRequest) setPlanning(false); else setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudyPath();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const handleBuildPlan = () => {
    const days = Number.parseInt(daysInput, 10);
    if (!Number.isFinite(days) || days <= 0) return;
    fetchStudyPath(days);
  };

  if (loading) {
    return (
      <div className="relative pl-6 space-y-4" aria-busy="true">
        <div className="absolute left-2 top-0 bottom-0 w-px bg-border/60" aria-hidden />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="relative py-4 flex items-center justify-between gap-4 animate-pulse">
            <div className="absolute -left-[1.15rem] top-[1.65rem] size-3 rounded-full border-2 bg-muted border-border" />
            <div className="space-y-2">
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="h-3.5 w-32 rounded bg-muted" />
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="h-1.5 w-24 rounded bg-muted" />
              <div className="h-3 w-12 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-status-error/20 bg-status-error/5 p-4 text-status-error">
        <TriangleAlert className="size-4 shrink-0" />
        <span className="text-body-sm font-medium flex-1">{error}</span>
        <Button variant="ghost" size="sm" onClick={() => fetchStudyPath()} className="h-8 rounded-md text-status-error hover:bg-status-error/10">
          Coba Lagi
        </Button>
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-border/60 p-6">
        <p className="text-body-sm text-muted-foreground">Alur belajar akan muncul setelah konten kelas diproses.</p>
      </div>
    );
  }

  // Find index of the first active step ('available' or 'in_progress')
  const firstActiveIdx = steps.findIndex(
    (s) => s.status === "available" || s.status === "in_progress"
  );

  const dotClasses = {
    mastered: "bg-primary border-primary",
    in_progress: "bg-background border-primary",
    available: "bg-background border-border",
    locked: "bg-muted border-border",
  };

  return (
    <div className="space-y-6">
      {/* Deadline input: "I have a midterm in N days" -> day-by-day plan */}
      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor="study-path-days" className="text-body-sm text-muted-foreground">
          Ada ujian dalam
        </label>
        <input
          id="study-path-days"
          type="number"
          min={1}
          max={60}
          value={daysInput}
          onChange={(e) => setDaysInput(e.target.value)}
          placeholder="7"
          className="w-16 rounded-md border border-input bg-background px-2 py-1 text-body-sm focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/50"
        />
        <span className="text-body-sm text-muted-foreground">hari</span>
        <Button size="sm" variant="outline" onClick={handleBuildPlan} disabled={planning || !daysInput} className="rounded-md">
          {planning ? "Menyusun..." : "Buat rencana"}
        </Button>
        {dayPlan && (
          <Button size="sm" variant="ghost" onClick={() => setDayPlan(null)} className="rounded-md text-muted-foreground">
            Lihat alur penuh
          </Button>
        )}
      </div>

      {dayPlan && dayPlan.length > 0 ? (
        <div className="divide-y divide-border">
          {dayPlan.map((d) => (
            <div key={d.day} className="py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-body-base font-medium text-foreground">Hari {d.day}</span>
                <span className="text-body-sm text-muted-foreground tabular-nums">{d.totalMinutes} min</span>
              </div>
              <div className="space-y-1.5">
                {d.steps.map((step) => (
                  <div key={step.conceptName} className="flex items-center justify-between gap-3 text-body-sm">
                    <span className="text-foreground">{step.conceptName}</span>
                    <span className="text-muted-foreground tabular-nums shrink-0">{step.estimatedMinutes} min</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <FullStudyPathTimeline courseId={courseId} steps={steps} firstActiveIdx={firstActiveIdx} dotClasses={dotClasses} />
      )}
    </div>
  );
}

function FullStudyPathTimeline({
  courseId,
  steps,
  firstActiveIdx,
  dotClasses,
}: {
  courseId: string;
  steps: StudyPathStep[];
  firstActiveIdx: number;
  dotClasses: Record<StudyPathStep["status"], string>;
}) {
  return (
    <div className="relative pl-6">
      {/* Continuous Timeline Rail */}
      <div className="absolute left-2 top-0 bottom-0 w-px bg-border" aria-hidden />

      <div className="divide-y divide-border/40">
        {steps.map((step, idx) => {
          const isFirstActive = idx === firstActiveIdx;
          const statusDotClass = dotClasses[step.status];

          return (
            <Reveal
              key={step.conceptName}
              translateFrom="translate-y-4"
              duration="duration-500"
              className="relative"
            >
              {/* Perfect 1:1 Circle Node Dot on the rail */}
              <div
                className={cn(
                  "absolute -left-[1.15rem] top-6 size-3 rounded-full border-2 z-10 transition-colors duration-200",
                  statusDotClass
                )}
                aria-hidden
              />

              <div
                className={cn(
                  "flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 pr-1",
                  isFirstActive && "border-l-2 border-primary -ml-[25px] pl-6"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        "text-body-base font-medium",
                        step.status === "locked" ? "text-muted-foreground" : "text-foreground"
                      )}
                    >
                      {step.conceptName}
                    </span>
                    {isFirstActive && (
                      <Badge variant="secondary" className="rounded-md px-1.5 py-0.5 text-body-sm uppercase tracking-wide">
                        Berikutnya
                      </Badge>
                    )}
                  </div>

                  {/* Actions / Locked Prerequisites list */}
                  {step.status === "locked" ? (
                    <div className="flex items-center gap-1.5 text-body-sm text-muted-foreground mt-1.5">
                      <Lock className="size-3.5 shrink-0" aria-hidden />
                      <span>terbuka setelah {step.prerequisites.join(", ")}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 text-body-sm text-primary mt-1.5">
                      {step.actions.moduleHref && (
                        <Link href={step.actions.moduleHref} className="hover:underline font-medium">
                          Modul
                        </Link>
                      )}
                      {step.actions.quizTemplateId && (
                        <Link
                          href={`/courses/${courseId}/quiz/${step.actions.quizTemplateId}`}
                          className="hover:underline font-medium"
                        >
                          Quiz
                        </Link>
                      )}
                      {step.actions.flashcardCount && (
                        <Link href={`/courses/${courseId}/flashcard`} className="hover:underline font-medium">
                          {step.actions.flashcardCount} kartu
                        </Link>
                      )}
                    </div>
                  )}
                </div>

                {/* Right side Mastery bar and time estimate */}
                <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto">
                  {step.status !== "locked" && typeof step.masteryScore === "number" && (
                    <div
                      className="h-1.5 w-24 rounded-md bg-muted overflow-hidden shrink-0"
                      title={`Mastery: ${step.masteryScore}%`}
                    >
                      <div
                        className="h-full rounded-md bg-primary transition-[width] duration-500 ease-out"
                        style={{ width: `${step.masteryScore}%` }}
                      />
                    </div>
                  )}
                  <span className="text-body-sm text-muted-foreground tabular-nums shrink-0">
                    {step.estimatedMinutes} min
                  </span>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
