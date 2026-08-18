"use client";

import Link from "next/link";
import { CheckCircle2, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DueFlashcardsData } from "@/types/course-learning";
import { studentCardClass } from "@/components/course/course-surfaces";
import { cn } from "@/lib/utils";

export function DueFlashcardsSkeleton() {
  return (
    <div className={cn(studentCardClass(), "flex flex-col justify-between h-[220px]")}>
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="size-5 bg-muted rounded-md animate-pulse" />
          <div className="h-5 w-36 bg-muted rounded-md animate-pulse" />
        </div>
        <div className="space-y-3">
          <div className="h-10 w-full bg-muted rounded-md animate-pulse" />
          <div className="h-4 w-3/4 bg-muted rounded-md animate-pulse" />
        </div>
      </div>
      <div className="h-9 w-full bg-muted rounded-md animate-pulse mt-4" />
    </div>
  );
}

interface DueFlashcardsCardProps {
  courseId: string;
  data: DueFlashcardsData | null;
  isLoading?: boolean;
}

export function DueFlashcardsCard({
  courseId,
  data,
  isLoading = false,
}: DueFlashcardsCardProps) {
  if (isLoading) {
    return <DueFlashcardsSkeleton />;
  }

  const isEmpty = !data || data.dueCount === 0;

  return (
    <div className={cn(studentCardClass(), "flex flex-col justify-between h-[220px] transition-all duration-300 hover:border-tertiary-3/30 hover:shadow-md")}>
      <div>
        <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2 mb-3">
          <CheckCircle2 className="size-4.5 text-tertiary-3" aria-hidden="true" />
          Ulasan Flashcard
        </h3>
        
        {!isEmpty ? (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="rounded-lg bg-muted/40 p-3 border border-border/40">
              <p className="text-body-sm text-foreground">
                Ada <span className="font-bold text-brand-primary text-body-base">{data.dueCount}</span> flashcard yang perlu diulas hari ini.
              </p>
            </div>
            <p className="text-body-xs text-muted-foreground leading-relaxed" title={data.nextReviewRecommendation}>
              {data.nextReviewRecommendation}
            </p>
          </div>
        ) : (
          <div className="space-y-3 py-1 text-left animate-in fade-in duration-300">
            <div className="rounded-lg bg-status-success/5 p-3 border border-status-success/15 flex items-center gap-2">
              <Award className="size-4.5 text-status-success shrink-0" aria-hidden="true" />
              <p className="text-body-sm text-status-success font-medium">
                Semua ulasan selesai!
              </p>
            </div>
            <p className="text-body-xs text-muted-foreground leading-relaxed">
              Hebat! Tidak ada flashcard yang jatuh tempo hari ini. Terus pertahankan!
            </p>
          </div>
        )}
      </div>

      <div className="mt-4">
        <Link href={`/courses/${courseId}/flashcard`} aria-label="Mulai mengulas flashcard">
          <Button 
            size="sm" 
            className={cn(
              "rounded-md w-full text-white transition-colors duration-150",
              !isEmpty 
                ? "bg-brand-primary hover:bg-brand-primary/95" 
                : "bg-muted text-muted-foreground hover:bg-muted/90"
            )}
          >
            {!isEmpty ? "Mulai Ulasan" : "Ulas Lagi"}
          </Button>
        </Link>
      </div>
    </div>
  );
}
