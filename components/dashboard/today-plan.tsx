"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StudentAccountBoundary } from "@/components/student-account-boundary";
import { studentTodayQuery, type TodayData } from "@/lib/student/today-query";
import Link from "next/link";
import { Layers, ListChecks, BookOpen, Check, ArrowRight, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StreakTag } from "@/components/dashboard/streak-tag";
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

export function TodayPlan({ firstName, adapter }: { firstName: string; adapter?: TodayAdapter }) {
  if (adapter) return <TodayPlanView firstName={firstName} data={adapter.data} loading={false} complete={adapter.complete} />;
  return <StudentAccountBoundary>{({ data, isPending }) => data?.user.id
    ? <LiveTodayPlan firstName={firstName} userId={data.user.id} />
    : <TodayPlanView firstName={firstName} data={null} loading={isPending} complete={() => {}} />}</StudentAccountBoundary>;
}

function LiveTodayPlan({ firstName, userId }: { firstName: string; userId: string }) {
  const options = studentTodayQuery(userId);
  const query = useQuery(options);
  const queryClient = useQueryClient();
  const complete = async (itemId: string) => {
    queryClient.setQueryData<TodayData>(options.queryKey, (data) =>
      data ? { ...data, items: data.items.map((item) => item.id === itemId ? { ...item, done: true } : item) } : data
    );
    await fetch("/api/student/today/complete", {
      method: "POST",
      body: JSON.stringify({ itemId }),
      headers: { "Content-Type": "application/json" },
    });
  };
  return <TodayPlanView firstName={firstName} data={query.data ?? null} loading={query.isLoading} complete={complete} />;
}

function TodayPlanView({ firstName, data, loading, complete }: { firstName: string; data: TodayData | null; loading: boolean; complete: (itemId: string) => void }) {
  const t = useTranslations("student");
  if (!loading && !data) return null;

  const doneCount = data?.items.filter((i) => i.done).length ?? 0;
  const total = data?.items.length ?? 0;
  const allDone = total > 0 && doneCount === total;


  return (
    <div className="mb-4 sm:mb-6">
      <PageHeader
        title={
          <>
            {t("dashboard.helloPrefix")}, <span className="text-primary">{firstName}</span>
          </>
        }
        actions={
          <div className="hidden sm:block">
            {loading ? (
              <div className="h-9 w-32 animate-pulse rounded-xl bg-muted" />
            ) : (
              <StreakTag current={data?.streak.current ?? 0} />
            )}
          </div>
        }
      />

      {total > 0 && (
        <section className="mt-4 sm:mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
            <h2 className="flex items-center gap-2 font-heading text-body-base font-bold text-foreground">
              <CalendarCheck className="size-4 text-brand-primary" />
              {t("dashboard.studyPlan")}
            </h2>
            {!loading && (
              <span className="rounded-md bg-brand-primary/10 px-2.5 py-0.5 text-body-xs font-semibold text-brand-primary shrink-0">
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
            <div className="rounded-xl border border-status-success/15 bg-status-success/5 p-4 py-4 text-center text-status-success">
              <p className="text-body-sm font-semibold">{t("dashboard.allTargetsDone")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/30 zebra-no-rows">
              {data!.items.map((item) => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-2 sm:gap-3 py-3 transition-colors"
                  >
                    <button
                      type="button"
                      aria-label={item.done ? t("dashboard.done") : t("dashboard.markDone")}
                      onClick={() => !item.done && complete(item.id)}
                      className={cn(
                        "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        item.done
                          ? "border-brand-primary bg-brand-primary text-primary-foreground"
                          : "border-border hover:border-brand-primary/60 hover:bg-brand-primary/5"
                      )}
                    >
                      {item.done && <Check className="size-3" />}
                    </button>

                    <div className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                      item.done
                        ? "border-border/30 bg-muted text-muted-foreground"
                        : "border-brand-primary/10 bg-brand-primary/5 text-brand-primary"
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
                      <Badge variant="outline" className="shrink-0 rounded-md border-border/50 px-1.5 py-0.2 text-[10px]">
                        {t("dashboard.cardsCount", { count: item.count })}
                      </Badge>
                    )}

                    <Button variant="ghost" size="sm" asChild className="shrink-0 rounded-lg hover:bg-muted">
                      <Link href={item.href} aria-label={t("dashboard.openItem", { title: item.title })}>
                        <ArrowRight className="size-4 text-muted-foreground hover:text-foreground" />
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
