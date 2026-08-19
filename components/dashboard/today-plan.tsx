"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Layers, ListChecks, BookOpen, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StreakTag } from "@/components/dashboard/streak-tag";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

interface PlanItem {
  id: string;
  kind: "flashcards" | "quiz" | "module";
  title: string;
  count?: number;
  href: string;
  done: boolean;
}

interface TodayData {
  streak: { current: number; longest: number };
  items: PlanItem[];
}

const KIND_ICON: Record<PlanItem["kind"], React.ComponentType<{ className?: string }>> = {
  flashcards: Layers,
  quiz: ListChecks,
  module: BookOpen,
};

export function TodayPlan({ firstName }: { firstName: string }) {
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/student/today")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Feature disabled or unrecoverable error
  if (!loading && !data) return null;

  const doneCount = data?.items.filter((i) => i.done).length ?? 0;
  const total = data?.items.length ?? 0;
  const allDone = total > 0 && doneCount === total;

  const markDone = async (itemId: string) => {
    setData((d) =>
      d ? { ...d, items: d.items.map((i) => (i.id === itemId ? { ...i, done: true } : i)) } : d
    );
    await fetch("/api/student/today/complete", {
      method: "POST",
      body: JSON.stringify({ itemId }),
      headers: { "Content-Type": "application/json" },
    });
  };

  return (
    <div className="mb-8">
      {/* Region 1: Greeting row */}
      <PageHeader
        title={
          <>
            Halo, <span className="bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">{firstName}</span>
          </>
        }
        actions={
          loading ? (
            <div className="h-9 w-32 bg-muted rounded-xl animate-pulse" />
          ) : (
            <StreakTag current={data?.streak.current ?? 0} />
          )
        }
      />

      {/* Region 2: Today's plan */}
      {total > 0 && (
        <section className="mt-8 border-y border-border bg-background/35 px-4 py-5 md:px-5">
          <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-4">
            <h2 className="font-heading text-body-base font-bold text-foreground">
              Rencana Belajar Hari Ini
            </h2>
            {!loading && (
              <span className="text-body-xs font-semibold bg-muted px-2.5 py-1 rounded-md text-muted-foreground">
                {doneCount} dari {total} selesai
              </span>
            )}
          </div>

          {loading ? (
            <div className="divide-y divide-border/30">
              {[1, 2].map((i) => (
                <div key={i} className="py-3.5 flex items-center gap-4">
                  <div className="size-5 rounded-full bg-muted animate-pulse shrink-0" />
                  <div className="h-4 flex-1 bg-muted rounded-md animate-pulse" />
                </div>
              ))}
            </div>
          ) : allDone ? (
            <div className="py-4 text-center rounded-xl bg-status-success/5 border border-status-success/15 text-status-success p-4">
              <p className="text-body-sm font-semibold">Semua target hari ini telah tercapai.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/30">
              {data!.items.map((item, index) => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <li
                    key={item.id}
                    className="py-3.5 flex items-center gap-4 transition-all duration-200"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Check circle (1:1 ratio perfect circle is allowed to use rounded-full) */}
                    <button
                      type="button"
                      aria-label={item.done ? "Selesai" : "Tandai selesai"}
                      onClick={() => !item.done && markDone(item.id)}
                      className={cn(
                        "size-5 rounded-full border flex items-center justify-center shrink-0 transition-all cursor-pointer",
                        item.done
                          ? "bg-brand-primary border-brand-primary text-white"
                          : "border-border hover:border-brand-primary/60 hover:bg-brand-primary/5"
                      )}
                    >
                      {item.done && <Check className="size-3" />}
                    </button>

                    {/* Kind icon */}
                    <div className={cn(
                      "flex size-8 items-center justify-center rounded-lg border shrink-0",
                      item.done 
                        ? "bg-muted border-border/30 text-muted-foreground" 
                        : "bg-brand-primary/5 border-brand-primary/10 text-brand-primary"
                    )}>
                      <Icon className="size-4 shrink-0" />
                    </div>

                    {/* Title */}
                    <span
                      className={cn(
                        "text-body-sm font-semibold flex-1 min-w-0 truncate text-foreground",
                        item.done && "line-through text-muted-foreground font-medium"
                      )}
                    >
                      {item.title}
                    </span>

                    {/* Count badge */}
                    {item.count != null && (
                      <Badge variant="outline" className="rounded-md border-border/50 text-[10px] px-1.5 py-0.2 shrink-0">
                        {item.count} kartu
                      </Badge>
                    )}

                    {/* CTA */}
                    <Button variant="ghost" size="sm" asChild className="rounded-lg hover:bg-muted shrink-0">
                      <Link href={item.href} aria-label={`Buka ${item.title}`}>
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
