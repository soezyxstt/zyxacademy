import Link from "next/link";
import { BookOpen, ListChecks, CalendarRange, ArrowRight } from "lucide-react";
import type { CourseOverviewActionCard } from "@/types/course-learning";
import { studentCardClass } from "@/components/course/course-surfaces";
import { MathText } from "@/components/course/math-text";
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

function ActionCard({ card }: { card: CourseOverviewActionCard }) {
  const Icon = ICONS[card.tag as keyof typeof ICONS] ?? BookOpen;

  return (
    <Link
      href={card.href}
      className={cn(
        studentCardClass("group flex flex-col justify-between transition-all duration-200"),
        "hover:border-brand-primary/40 hover:shadow-xs",
      )}
    >
      <div>
        <div className="flex items-center justify-between">
          <span className="sr-only">{card.tag}</span>
          <span className="flex size-6 items-center justify-center rounded-md bg-brand-primary/10 text-brand-primary ml-auto">
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
        </div>
        <div className="mt-1 min-w-0">
          <h3 className="line-clamp-2 font-heading text-body-base font-bold text-foreground transition-colors group-hover:text-brand-primary">
            <MathText as="span">{card.title}</MathText>
          </h3>
          <p className="mt-1 truncate text-body-xs text-muted-foreground">
            {card.meta}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border/30 pt-3 text-body-xs font-semibold text-brand-primary">
        <span>{card.actionLabel}</span>
        <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
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
    <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-3 md:items-start", className)}>
      <ActionCard card={reading} />
      <ActionCard card={quiz} />
      <ActionCard card={schedule} />
    </div>
  );
}
