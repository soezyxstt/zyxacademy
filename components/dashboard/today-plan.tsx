"use client";

import { useTodayPlan } from "@/hooks/use-today-plan";
import { StudentAccountBoundary } from "@/components/student-account-boundary";
import type { TodayData } from "@/lib/student/today-query";
import Link from "next/link";
import { Layers, ListChecks, BookOpen, Check, ArrowRight, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

export type { TodayData } from "@/lib/student/today-query";
type PlanItem = TodayData["items"][number];

const KIND_ICON: Record<PlanItem["kind"], React.ComponentType<{ className?: string }>> = {
  flashcards: Layers,
  quiz: ListChecks,
  module: BookOpen,
};

type TodayAdapter = { data: TodayData; complete: (itemId: string) => void };

export function TodayPlan({ firstName, serverUserId, adapter }: { firstName: string; serverUserId?: string; adapter?: TodayAdapter }) {
  if (adapter) return <TodayPlanView firstName={firstName} data={adapter.data} loading={false} complete={adapter.complete} />;
  return <StudentAccountBoundary>{({ data, isPending }) => data?.user.id
    ? <LiveTodayPlan key={data.user.id} firstName={serverUserId && serverUserId !== data.user.id ? data.user.name.split(" ")[0] ?? "" : firstName} userId={data.user.id} />
    : <TodayPlanView firstName={firstName} data={null} loading={isPending} complete={() => {}} />}</StudentAccountBoundary>;
}

function LiveTodayPlan({ firstName, userId }: { firstName: string; userId: string }) {
  const { data, loading, complete } = useTodayPlan(userId);
  return <TodayPlanView firstName={firstName} data={data} loading={loading} complete={complete} />;
}

function TodayPlanView({ firstName, data, loading, complete }: { firstName: string; data: TodayData | null; loading: boolean; complete: (itemId: string) => void }) {
  const t = useTranslations("student");
  if (!loading && !data) return null;

  const doneCount = data?.items.filter((i) => i.done).length ?? 0;
  const total = data?.items.length ?? 0;
  const allDone = total > 0 && doneCount === total;


  return (
    <div className="mb-6">
      <PageHeader
        title={
          <>
            {t("dashboard.helloPrefix")}, <span className="text-primary">{firstName}</span>
          </>
        }
      />

      {total > 0 && (
        <section className="mt-4 sm:mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
            <h2 className="flex items-center gap-2 font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <CalendarCheck className="size-3.5 shrink-0 text-muted-foreground" />
              {t("dashboard.studyPlan")}
            </h2>
            {!loading && (
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-body-xs font-semibold tabular-nums shrink-0",
                  allDone
                    ? "bg-status-success/15 text-status-success"
                    : "bg-muted/60 text-muted-foreground",
                )}
              >
                {t("dashboard.completedCount", { done: doneCount, total })}
              </span>
            )}
          </div>

          {loading ? (
            <div className="divide-y divide-border/30 zebra-no-rows">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-4 py-3.5">
                  <div className="size-5 shrink-0 animate-pulse rounded-full bg-muted" />
                  <div className="h-4 flex-1 animate-pulse rounded-md bg-muted" />
                </div>
              ))}
            </div>
          ) : allDone ? (
            <div className="py-3 text-body-sm text-status-success">
              <p className="text-body-sm font-semibold">{t("dashboard.allTargetsDone")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/30 zebra-no-rows">
              {data!.items.map((item) => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <li
                    key={item.id}
                    className="group flex flex-wrap items-center gap-2 sm:gap-3 py-3 px-2 -mx-2 rounded-lg transition-colors hover:bg-muted/40"
                  >
                    <button
                      type="button"
                      aria-label={item.done ? t("dashboard.done") : t("dashboard.markDone")}
                      onClick={() => !item.done && complete(item.id)}
                      className={cn(
                        "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        item.done
                          ? "border-status-success bg-status-success text-primary-foreground"
                          : "border-border/70 hover:border-foreground/40 hover:bg-muted/60"
                      )}
                    >
                      {item.done && <Check className="size-3" />}
                    </button>

                    <div className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                      item.done
                        ? "border-border/30 bg-muted/50 text-muted-foreground"
                        : "border-border/50 bg-background text-muted-foreground"
                    )}>
                      <Icon className="size-4 shrink-0" />
                    </div>

                    <span
                      className={cn(
                        "min-w-0 flex-1 break-words text-body-sm font-semibold text-foreground",
                        item.done && "text-muted-foreground line-through"
                      )}
                    >
                      {item.title}
                    </span>

                    {item.count != null && (
                      <Badge variant="outline" className="shrink-0 rounded-md border-border/50 px-1.5 py-0.2 text-body-2xs text-muted-foreground">
                        {t("dashboard.cardsCount", { count: item.count })}
                      </Badge>
                    )}

                    <Button variant="ghost" size="sm" asChild className="shrink-0 rounded-lg hover:bg-muted/60">
                      <Link href={item.href} aria-label={t("dashboard.openItem", { title: item.title })}>
                        <ArrowRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
