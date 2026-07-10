"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const filterOptions = [
  { value: "all", label: "Semua" },
  { value: "free", label: "Gratis" },
  { value: "premium", label: "Premium" },
] as const;

export function QuizListClient({ courseId, isEnrolled, templates, attempts }: QuizListClientProps) {
  const [filter, setFilter] = useState<"all" | "free" | "premium">("all");
  
  const filteredTemplates = templates.filter((template) => {
    const isFree = template.visibility === "free";
    if (filter === "free") return isFree;
    if (filter === "premium") return !isFree;
    return true;
  });

  const counts = {
    all: templates.length,
    free: templates.filter((t) => t.visibility === "free").length,
    premium: templates.filter((t) => t.visibility === "paid").length,
  };

  return (
    <div className="space-y-4 font-sans">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/70 p-3 backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                filter === option.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-border hover:text-foreground",
              )}
            >
              <span>{option.label}</span>
              <span
                className={cn(
                  "text-[11px]",
                  filter === option.value ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {counts[option.value]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <ul className="overflow-hidden rounded-lg border border-border/70 bg-card/75 backdrop-blur-sm">
        {filteredTemplates.map((template) => {
          const isFree = template.visibility === "free";
          const accessible = isEnrolled || isFree;

          // Parse selection rules to get question count
          const rules = template.selectionRules as Record<string, any>;
          const qCount = Number(rules?.count ?? 10);

          // Get attempts for this template
          const templateAttempts = attempts.filter((a) => a.templateId === template.id);
          const completedAttempts = templateAttempts.filter((a) => a.status === "completed");
          const activeAttempt = templateAttempts.find((a) => a.status === "in_progress");

          // Find highest score
          const highestScore = completedAttempts.length > 0
            ? Math.max(...completedAttempts.map((a) => a.score ?? 0))
            : null;

          // Time restricted logic
          const now = new Date();
          const openDate = template.openAt ? new Date(template.openAt) : null;
          const closeDate = template.closeAt ? new Date(template.closeAt) : null;

          let isOpen = true;
          let isClosed = false;

          if (template.manualStatus === "closed") {
            isOpen = false;
            isClosed = true;
          } else if (template.manualStatus === "open") {
            isOpen = true;
            isClosed = false;
          } else {
            // "scheduled" or default
            isOpen = !openDate || now >= openDate;
            isClosed = !!closeDate && now > closeDate;
          }

          const buttonContent = (() => {
            if (!accessible) {
              return (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="interactive rounded-md md:justify-self-end border-dashed"
                >
                  <Link href={`/courses/${courseId}/quiz/${template.id}`}>
                    Buka <ChevronRight className="ml-1 size-4" />
                  </Link>
                </Button>
              );
            }
            if (!isOpen) {
              return (
                <Button
                  disabled
                  variant="outline"
                  size="sm"
                  className="rounded-md md:justify-self-end border-dashed"
                >
                  Belum Buka
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
                  Ditutup
                </Button>
              );
            }
            return (
              <Button
                asChild
                variant="default"
                size="sm"
                className="interactive rounded-md md:justify-self-end bg-brand-primary text-white hover:bg-brand-primary/95"
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
                  "grid gap-3 px-4 py-3.5 transition-colors md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-center",
                  accessible && isOpen && !isClosed ? "hover:bg-muted/30" : "bg-card/45 text-muted-foreground",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-heading text-body-base font-semibold text-foreground">
                      {template.title}
                    </h3>
                    <span className="text-[11px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground capitalize">
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

                  {/* Status indicators */}
                  {accessible && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {activeAttempt && !isClosed && (
                        <span className="inline-flex items-center gap-1 text-amber-500 font-medium">
                          <AlertCircle className="size-3.5" />
                          Sedang dikerjakan
                        </span>
                      )}
                      {highestScore !== null && (
                        <span className="inline-flex items-center gap-1 text-emerald-500 font-medium">
                          <CheckCircle2 className="size-3.5" />
                          Terjawab (Nilai Terbaik: {highestScore}%)
                        </span>
                      )}

                      {template.maxAttempts && completedAttempts.length > 0 && (
                        <span className="text-muted-foreground">
                          ({completedAttempts.length}/{template.maxAttempts} percobaan selesai)
                        </span>
                      )}

                      {!isOpen && openDate && (
                        <span className="inline-flex items-center gap-1 text-status-warning font-medium">
                          <AlertCircle className="size-3.5" />
                          Akan dibuka: {openDate.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      )}

                      {isClosed && closeDate && (
                        <span className="inline-flex items-center gap-1 text-status-error font-medium">
                          <AlertCircle className="size-3.5" />
                          Telah ditutup: {closeDate.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <span
                  className={cn(
                    "inline-flex w-fit items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-semibold ring-1",
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

      {filteredTemplates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/15 py-10 text-center">
          <p className="text-body-sm text-muted-foreground">Tidak ada kuis yang cocok.</p>
        </div>
      ) : null}
    </div>
  );
}
