import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { BookOpen, ClipboardList, Layers, Target } from "lucide-react";
import { MathText } from "@/components/course/math-text";
import { TranslatedText } from "@/components/i18n/translated-text";
import { cn } from "@/lib/utils";

export type DashboardFocusKey = "cards" | "weak" | "materials" | "exams";

export type DashboardFocusData = {
  cards: { due: number; href: string | null } | null;
  materials: { done: number; total: number; href: string | null } | null;
  weak: {
    weakCount: number;
    measuredCount: number;
    lowest: { conceptName: string; score: number } | null;
    href: string | null;
  } | null;
  exams: { quizzes: number; tryouts: number; href: string | null } | null;
  priority: DashboardFocusKey | null;
};

/** Picks the single stat that most needs attention, in fixed urgency order. */
export function pickDashboardPriority(data: Omit<DashboardFocusData, "priority">): DashboardFocusKey | null {
  if (data.cards && data.cards.due > 0) return "cards";
  if (data.weak && data.weak.weakCount > 0) return "weak";
  if (data.materials && data.materials.total > 0 && data.materials.done < data.materials.total) return "materials";
  if (data.exams && data.exams.quizzes + data.exams.tryouts > 0) return "exams";
  return null;
}

type CellProps = {
  icon: ComponentType<{ className?: string }>;
  labelKey: string;
  value: string;
  caption: ReactNode;
  href: string | null;
  isPriority: boolean;
  needsAttention: boolean;
};

function FocusCell({ icon: Icon, labelKey, value, caption, href, isPriority, needsAttention }: CellProps) {
  const body = (
    <>
      <div className="flex min-w-0 items-center gap-1.5 text-body-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <TranslatedText namespace="student" messageKey={`dashboard.focus.${labelKey}`} className="truncate" />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "font-heading text-h6 font-bold tabular-nums",
            needsAttention ? "text-status-warning" : "text-foreground",
          )}
        >
          {value}
        </span>
        {isPriority && (
          <span className="shrink-0 rounded-sm bg-primary/12 px-1.5 py-0.5 text-body-2xs font-semibold uppercase tracking-wider text-primary">
            <TranslatedText namespace="student" messageKey="dashboard.focus.priority" />
          </span>
        )}
      </div>
      <div className="mt-0.5 line-clamp-1 min-w-0 break-words text-body-xs text-muted-foreground">{caption}</div>
    </>
  );

  const className = cn(
    "block min-w-0 bg-background px-3 py-2.5 transition-colors sm:px-4 sm:py-3",
    isPriority && "bg-primary/5",
  );

  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link
      href={href}
      className={cn(
        className,
        "hover:bg-muted/50 focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
        isPriority && "hover:bg-primary/10",
      )}
    >
      {body}
    </Link>
  );
}

export function DashboardFocusStrip({ data }: { data: DashboardFocusData }) {
  const { cards, materials, weak, exams, priority } = data;
  const materialPct = materials && materials.total > 0 ? Math.round((materials.done / materials.total) * 100) : 0;
  const examTotal = exams ? exams.quizzes + exams.tryouts : 0;

  return (
    <section
      aria-labelledby="dashboard-focus-heading"
      className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/50 bg-border/50 lg:grid-cols-4"
    >
      <h2 id="dashboard-focus-heading" className="sr-only">
        <TranslatedText namespace="student" messageKey="dashboard.focus.label" />
      </h2>
      {cards && (
        <FocusCell
          icon={Layers}
          labelKey="dueCards"
          value={String(cards.due)}
          href={cards.href}
          isPriority={priority === "cards"}
          needsAttention={cards.due > 0}
          caption={<TranslatedText namespace="student" messageKey={cards.due > 0 ? "dashboard.focus.dueCardsAction" : "dashboard.focus.dueCardsClear"} />}
        />
      )}
      {weak && (
        <FocusCell
          icon={Target}
          labelKey="weakConcepts"
          value={weak.measuredCount > 0 ? String(weak.weakCount) : "-"}
          href={weak.href}
          isPriority={priority === "weak"}
          needsAttention={weak.weakCount > 0}
          caption={
            weak.measuredCount === 0 ? (
              <TranslatedText namespace="student" messageKey="dashboard.focus.weakUnmeasured" />
            ) : weak.weakCount > 0 && weak.lowest ? (
              <>
                <TranslatedText namespace="student" messageKey="dashboard.focus.weakLowest" values={{ score: weak.lowest.score }} />
                {": "}
                <MathText as="span">{weak.lowest.conceptName}</MathText>
              </>
            ) : (
              <TranslatedText namespace="student" messageKey="dashboard.focus.weakNone" />
            )
          }
        />
      )}
      {materials && (
        <FocusCell
          icon={BookOpen}
          labelKey="materials"
          value={`${materialPct}%`}
          href={materials.href}
          isPriority={priority === "materials"}
          needsAttention={false}
          caption={<TranslatedText namespace="student" messageKey="dashboard.focus.materialsCaption" values={{ done: materials.done, total: materials.total }} />}
        />
      )}
      {exams && (
        <FocusCell
          icon={ClipboardList}
          labelKey="exams"
          value={String(examTotal)}
          href={exams.href}
          isPriority={priority === "exams"}
          needsAttention={false}
          caption={
            examTotal > 0 ? (
              <TranslatedText namespace="student" messageKey="dashboard.focus.examsCaption" values={{ quizzes: exams.quizzes, tryouts: exams.tryouts }} />
            ) : (
              <TranslatedText namespace="student" messageKey="dashboard.focus.examsNone" />
            )
          }
        />
      )}
    </section>
  );
}
