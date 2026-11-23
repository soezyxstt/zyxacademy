"use client";

import Link from "next/link";
import { BookOpen, CalendarRange, ChevronRight, ListChecks } from "lucide-react";
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
      className="group flex min-w-0 items-center gap-3 py-2.5 transition-colors @min-[36rem]/course-actions:gap-2 @min-[36rem]/course-actions:px-2.5 @min-[36rem]/course-actions:first:pl-0 @min-[36rem]/course-actions:last:pr-0 hover:bg-muted/30 active:bg-muted/50"
    >
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg @min-[36rem]/course-actions:size-7", colorClass)}>
        <Icon className="size-4 @min-[36rem]/course-actions:size-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">{card.tag}: {card.title}</span>
        <div className="break-words font-heading text-body-sm font-semibold text-foreground transition-colors group-hover:text-brand-primary">
          {label}
        </div>
        <div className="break-words text-body-xs text-muted-foreground">
          {card.meta || card.actionLabel}
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/70 @min-[36rem]/course-actions:hidden" aria-hidden="true" />
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
      <div className="grid grid-cols-1 divide-y divide-border/60 border-y border-border/60 @min-[36rem]/course-actions:grid-cols-3 @min-[36rem]/course-actions:divide-x @min-[36rem]/course-actions:divide-y-0">
        <ActionTile card={reading} labels={labels} />
        <ActionTile card={quiz} labels={labels} />
        <ActionTile card={schedule} labels={labels} />
      </div>
    </div>
  );
}
