"use client";

import Link from "next/link";
import { BookOpen, CalendarRange, ChevronRight, ListChecks } from "lucide-react";
import type { CourseOverviewActionCard } from "@/types/course-learning";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/native/haptics";
import { useTranslations } from "@/lib/i18n/client";

interface CoursePrimaryActionsProps {
  reading: CourseOverviewActionCard;
  quiz: CourseOverviewActionCard;
  schedule: CourseOverviewActionCard;
  className?: string;
}

const ICONS = {
  DOKUMEN: BookOpen,
  KUIS: ListChecks,
  JADWAL: CalendarRange,
} as const;

function ActionTile({ card, labels }: { card: CourseOverviewActionCard; labels: { material: string; practice: string; tutorial: string } }) {
  const Icon = ICONS[card.tag as keyof typeof ICONS] ?? BookOpen;
  const label = card.tag === "DOKUMEN" ? labels.material : card.tag === "KUIS" ? labels.practice : labels.tutorial;

  return (
    <Link
      href={card.href}
      onClick={() => void hapticLight()}
      className="group flex min-w-0 items-center gap-3 rounded-xl border border-border/60 bg-card/70 px-3.5 py-3 transition-colors hover:border-border hover:bg-muted/40 active:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground ring-1 ring-inset ring-border/60 transition-colors group-hover:bg-primary/10 group-hover:text-primary group-hover:ring-primary/20">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">{card.tag}: {card.title}</span>
        <div className="break-words font-heading text-body-sm font-semibold text-foreground">
          {label}
        </div>
        <div className="mt-0.5 break-words text-body-xs text-muted-foreground">
          {card.meta || card.actionLabel}
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
    </Link>
  );
}

export function CoursePrimaryActions({
  reading,
  quiz,
  schedule,
  className,
}: CoursePrimaryActionsProps) {
  const t = useTranslations("studentCourse");
  const labels = { material: t("course.actions.material"), practice: t("course.actions.practice"), tutorial: t("course.actions.tutorial") };
  return (
    <div className={cn("@container/course-actions", className)}>
      <div className="grid grid-cols-1 gap-2.5 @min-[36rem]/course-actions:grid-cols-3 @min-[36rem]/course-actions:gap-3">
        <ActionTile card={reading} labels={labels} />
        <ActionTile card={quiz} labels={labels} />
        <ActionTile card={schedule} labels={labels} />
      </div>
    </div>
  );
}
