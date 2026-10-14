import Link from "next/link";
import { BookOpen, ListChecks, CalendarRange } from "lucide-react";
import type { CourseOverviewActionCard } from "@/types/course-learning";
import { cn } from "@/lib/utils";

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
  DOKUMEN: "bg-blue-500/10 text-blue-500 dark:text-blue-400",
  KUIS: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400",
  JADWAL: "bg-purple-500/10 text-purple-500 dark:text-purple-400",
} as const;

function ActionTile({ card }: { card: CourseOverviewActionCard }) {
  const Icon = ICONS[card.tag as keyof typeof ICONS] ?? BookOpen;
  const colorClass = COLOR_CLASSES[card.tag as keyof typeof COLOR_CLASSES] ?? "bg-brand-primary/10 text-brand-primary";
  const label = card.tag === "DOKUMEN" ? "Materi" : card.tag === "KUIS" ? "Latihan" : "Tutorial";

  return (
    <Link
      href={card.href}
      className="group flex items-center gap-2 rounded-xl border border-border/60 bg-card/80 p-2.5 transition-all hover:border-brand-primary/40 hover:bg-muted/30 active:bg-muted/50"
    >
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", colorClass)}>
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">{card.tag}: {card.title}</span>
        <div className="truncate font-heading text-body-xs font-semibold text-foreground group-hover:text-brand-primary transition-colors">
          {label}
        </div>
        <div className="truncate text-body-xs text-muted-foreground">
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
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      <ActionTile card={reading} />
      <ActionTile card={quiz} />
      <ActionTile card={schedule} />
    </div>
  );
}
