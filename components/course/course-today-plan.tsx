import Link from "next/link";
import { Layers, ListChecks, BookOpen, ArrowRight, Flame } from "lucide-react";
import { studentCardClass } from "@/components/course/course-surfaces";
import type { CourseDailyPlan } from "@/types/course-learning";

const KIND_ICON: Record<CourseDailyPlan["items"][number]["kind"], React.ComponentType<{ className?: string }>> = {
  flashcards: Layers,
  quiz: ListChecks,
  module: BookOpen,
};

/**
 * Course-scoped "Rencana Hari Ini" ; the landing DailyPlanPane made real.
 * Read-only, deterministic list of what to do in this course today.
 */
export function CourseTodayPlan({ plan }: { plan: CourseDailyPlan }) {
  const hasItems = plan.items.length > 0;

  return (
    <section className={studentCardClass("text-left")}>
      <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-3">
        <h2 className="font-heading text-body-base font-bold text-foreground">
          Rencana Hari Ini
        </h2>
        {plan.streakDays > 0 && (
          <span className="flex items-center gap-1.5 rounded-md border border-brand-secondary/40 bg-brand-secondary/10 px-2 py-0.5 text-body-xs font-semibold text-brand-secondary">
            <Flame className="size-3.5 shrink-0" />
            {plan.streakDays} hari beruntun
          </span>
        )}
      </div>

      {hasItems ? (
        <ul className="mt-2 divide-y divide-border/40">
          {plan.items.map((item, index) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li key={`${item.kind}-${index}`}>
                <Link
                  href={item.href}
                  className="group flex items-center gap-3 py-3.5 transition-colors"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-brand-primary/10 bg-brand-primary/5 text-brand-primary">
                    <Icon className="size-4 shrink-0" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-foreground group-hover:text-brand-primary">
                    {item.label}
                  </span>
                  <span className="shrink-0 text-body-xs text-muted-foreground">{item.meta}</span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-brand-primary" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="py-6 text-center">
          <p className="text-body-sm text-muted-foreground">
            Tidak ada target hari ini. Semua materi dan ulasan sudah selesai.
          </p>
        </div>
      )}

      <p className="mt-3 border-t border-border/30 pt-3 text-body-xs text-muted-foreground">
        {plan.weakestConcept
          ? `Latihan diarahkan ke konsep terlemahmu: ${plan.weakestConcept}.`
          : "Rencana disusun ulang otomatis dari progres belajarmu."}
      </p>
    </section>
  );
}
