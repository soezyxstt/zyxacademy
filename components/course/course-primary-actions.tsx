"use client";

import Link from "next/link";
import { BookOpen, ListChecks, CalendarRange } from "lucide-react";
import type { CourseOverviewActionCard } from "@/types/course-learning";
import { cn } from "@/lib/utils";
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

const COLOR_CLASSES = {
  DOKUMEN: "bg-muted text-foreground",
  KUIS: "bg-muted text-foreground",
  JADWAL: "bg-muted text-foreground",
} as const;

function ActionTile({ card, labels }: { card: CourseOverviewActionCard; labels: { material: string; practice: string; tutorial: string } }) {
  const Icon = ICONS[card.tag as keyof typeof ICONS] ?? BookOpen;
  const colorClass = COLOR_CLASSES[card.tag as keyof typeof COLOR_CLASSES] ?? "bg-brand-primary/10 text-brand-primary";
  const label = card.tag === "DOKUMEN" ? labels.material : card.tag === "KUIS" ? labels.practice : labels.tutorial;

  return (
    <Link
      href={card.href}
      className="group flex min-w-0 items-center gap-2 p-2.5 transition-colors hover:bg-muted/30 active:bg-muted/50"
    >
      <span className={cn("hidden size-7 shrink-0 items-center justify-center rounded-lg @min-[36rem]/course-actions:flex", colorClass)}>
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">{card.tag}: {card.title}</span>
        <div className="break-words font-heading text-body-sm font-semibold text-foreground group-hover:text-brand-primary transition-colors">
          {label}
        </div>
        <div className="break-words text-body-xs text-muted-foreground">
          {card.meta || card.actionLabel}
        </div>
      </div>
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
      <div className="grid grid-cols-1 divide-y divide-border/60 @min-[36rem]/course-actions:grid-cols-3 @min-[36rem]/course-actions:divide-x @min-[36rem]/course-actions:divide-y-0 overflow-hidden rounded-xl border border-border/70 bg-card">
        <ActionTile card={reading} labels={labels} />
        <ActionTile card={quiz} labels={labels} />
        <ActionTile card={schedule} labels={labels} />
      </div>
    </div>
  );
}
