"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TryoutItem {
  id: string;
  courseId: string;
  title: string;
  type: "quiz" | "tryout";
  status: "draft" | "published" | "ended";
  settings: any;
  questions: any[];
  isFree?: boolean;
  isPreview?: boolean;
  openAt?: Date | string | null;
  closeAt?: Date | string | null;
}

type TryoutListClientProps = {
  courseId: string;
  isEnrolled: boolean;
  tryouts: TryoutItem[];
};

function readAttempts(tryouts: TryoutItem[]) {
  const counts: Record<string, number> = {};

  if (typeof window === "undefined") {
    return counts;
  }

  for (const tryout of tryouts) {
    counts[tryout.id] = parseInt(localStorage.getItem(`zyx-tryout-attempts-${tryout.id}`) || "0", 10);
  }

  return counts;
}

export function TryoutListClient({ courseId, isEnrolled, tryouts }: TryoutListClientProps) {
  const [attempts, setAttempts] = useState<Record<string, number>>(() => readAttempts(tryouts));

  useEffect(() => {
    const handleReset = () => {
      setAttempts(readAttempts(tryouts));
    };

    window.addEventListener("zyx-tryout-attempts-reset", handleReset);
    return () => window.removeEventListener("zyx-tryout-attempts-reset", handleReset);
  }, [tryouts]);

  return (
    <div className="space-y-3 font-sans">
      <ul className="overflow-hidden rounded-lg border border-border/70 bg-card/75 backdrop-blur-sm">
        {tryouts.map((tryout) => {
          const attemptCount = attempts[tryout.id] || 0;
          const maxAttempts = tryout.settings?.maxAttempts ?? 2;
          const isBlocked = attemptCount >= maxAttempts;
          const isFree = tryout.isFree || tryout.isPreview;
          const accessible = isEnrolled || isFree;

          const now = new Date();
          const openDate = tryout.openAt ? new Date(tryout.openAt) : null;
          const closeDate = tryout.closeAt ? new Date(tryout.closeAt) : null;

          let isUpcoming = false;
          let isClosed = false;
          let isOpen = true;

          if (closeDate && now > closeDate) {
            isClosed = true;
            isOpen = false;
          } else if (openDate && now < openDate) {
            isUpcoming = true;
            isOpen = false;
          } else {
            isOpen = true;
          }

          const canStart = accessible && !isBlocked && isOpen;

          const buttonContent = (() => {
            if (!accessible) {
              return (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="interactive rounded-md md:justify-self-end border-dashed"
                >
                  <Link href={`/courses/${courseId}/tryout/${tryout.id}`}>
                    Buka <Lock className="ml-1 size-3.5" />
                  </Link>
                </Button>
              );
            }
            if (isBlocked) {
              return (
                <Button
                  disabled
                  variant="outline"
                  size="sm"
                  className="rounded-md md:justify-self-end border-dashed"
                >
                  Batas habis
                </Button>
              );
            }
            if (isClosed) {
              return (
                <Button
                  disabled
                  variant="outline"
                  size="sm"
                  className="rounded-md md:justify-self-end border-dashed"
                >
                  Ditutup
                </Button>
              );
            }
            if (isUpcoming) {
              return (
                <Button
                  disabled
                  variant="outline"
                  size="sm"
                  className="rounded-md md:justify-self-end border-dashed"
                >
                  Belum Buka
                </Button>
              );
            }
            return (
              <Button
                asChild
                variant="default"
                size="sm"
                className="interactive rounded-md md:justify-self-end bg-brand-primary text-white hover:bg-brand-primary/95"
              >
                <Link href={`/courses/${courseId}/tryout/${tryout.id}`}>
                  Mulai <ChevronRight className="ml-1 size-4" />
                </Link>
              </Button>
            );
          })();

          return (
            <li key={tryout.id} className="border-b border-border/60 last:border-0">
              <div
                className={cn(
                  "grid gap-3 px-4 py-3 transition-colors md:grid-cols-[minmax(0,1fr)_160px_180px] md:items-center",
                  canStart ? "hover:bg-muted/30" : "bg-card/45 text-muted-foreground",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-heading text-body-base font-semibold text-foreground">
                      {tryout.title}
                    </h3>
                    {!accessible ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-body-xs font-semibold text-muted-foreground ring-1 ring-border">
                        <Lock className="size-3" />
                        Premium
                      </span>
                    ) : null}
                    {isBlocked ? (
                      <span className="rounded-md bg-status-error/12 px-2 py-0.5 text-body-xs font-semibold text-status-error ring-1 ring-status-error/20">
                        Batas habis
                      </span>
                    ) : null}
                    {isUpcoming && openDate ? (
                      <span className="rounded-md bg-status-warning/12 px-2 py-0.5 text-body-xs font-semibold text-status-warning ring-1 ring-status-warning/20">
                        Akan dibuka: {openDate.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    ) : null}
                    {isClosed ? (
                      <span className="rounded-md bg-status-error/12 px-2 py-0.5 text-body-xs font-semibold text-status-error ring-1 ring-status-error/20">
                        {closeDate
                          ? `Telah ditutup: ${closeDate.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`
                          : "Telah ditutup"}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-body-sm text-muted-foreground">
                    {tryout.questions.length} soal · {tryout.settings?.timeLimitMinutes ?? 90} menit
                  </p>
                </div>

                <div className="flex items-center gap-2 text-body-sm text-muted-foreground md:justify-center">
                  <span className="font-semibold text-foreground">{attemptCount}</span>
                  <span>/ {maxAttempts} percobaan</span>
                  <div className="flex gap-1">
                    {Array.from({ length: maxAttempts }).map((_, index) => (
                      <span
                        key={index}
                        className={cn(
                          "size-2 rounded-full border border-border/80",
                          index < attemptCount ? "border-transparent bg-brand-secondary" : "bg-muted",
                        )}
                      />
                    ))}
                  </div>
                </div>

                {buttonContent}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-start gap-2 rounded-lg border border-brand-secondary/20 bg-brand-secondary/5 p-3 text-body-sm text-muted-foreground">
        <Calendar className="mt-0.5 size-4 shrink-0 text-brand-secondary" />
        <p>
          Maksimal 2 kali pengumpulan per tryout agar jeda belajar tetap terukur.
        </p>
      </div>
    </div>
  );
}
