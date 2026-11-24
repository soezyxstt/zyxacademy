"use client";

import Link from "next/link";
import { BookOpen, CalendarRange, ListChecks } from "lucide-react";
import type { CourseOverviewActionCard } from "@/types/course-learning";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/native/haptics";
import { courseListRowClass } from "./course-surfaces";
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
      className={courseListRowClass("@min-[36rem]/course-actions:gap-2 @min-[36rem]/course-actions:px-2.5 @min-[36rem]/course-actions:first:pl-0")}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground ring-1 ring-inset ring-border/60">
        <Icon className="size-4 @min-[36rem]/course-actions:size-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">{card.tag}: {card.title}</span>
        <div className="break-words font-heading text-body-sm font-semibold text-foreground">
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
      <div className="grid grid-cols-1 @min-[36rem]/course-actions:grid-cols-3 @min-[36rem]/course-actions:gap-3">
        <ActionTile card={reading} labels={labels} />
        <ActionTile card={quiz} labels={labels} />
        <ActionTile card={schedule} labels={labels} />
      </div>
    </div>
  );
}
