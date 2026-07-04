import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import type { ChapterOutlineItem } from "@/lib/course-utils";
import { cn } from "@/lib/utils";

type ChapterOutlineProps = {
  courseId: string;
  chapters: ChapterOutlineItem[];
  isEnrolled: boolean;
};

export function ChapterOutline({ courseId, chapters }: ChapterOutlineProps) {
  if (chapters.length === 0) {
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
          <h2 className="font-heading text-body-md font-bold text-foreground">Silabus kelas</h2>
        </div>
        <div className="rounded-xl border border-dashed border-border bg-muted/15 py-10 text-center">
          <p className="text-body-sm text-muted-foreground">
            Silabus belum tersedia. Bab akan muncul di sini setelah dipublikasikan.
          </p>
        </div>
      </section>
    );
  }

  const doneCount = chapters.filter((c) => c.completed).length;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
        <h2 className="font-heading text-body-md font-bold text-foreground">Silabus kelas</h2>
        <span className="text-body-sm text-muted-foreground">
          {doneCount}/{chapters.length} bab selesai
        </span>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/75 backdrop-blur-sm">
        {chapters.map((ch, idx) => {
          const statusLabel = ch.hasMaterial
            ? ch.completed
              ? "Selesai"
              : ch.completionPercent > 0
                ? `${ch.completionPercent}% dibaca`
                : "Belum dibaca"
            : "Materi belum tersedia";

          const inner = (
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg text-body-sm font-bold",
                    ch.completed
                      ? "bg-status-success/12 text-status-success"
                      : "bg-brand-primary/10 text-brand-primary",
                  )}
                >
                  {ch.completed ? <CheckCircle2 className="size-4" aria-hidden /> : idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-semibold text-foreground">{ch.title}</p>
                  <p className="text-body-sm text-muted-foreground">{statusLabel}</p>
                </div>
              </div>
              {ch.hasMaterial && (
                <ArrowRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-primary"
                  aria-hidden
                />
              )}
            </div>
          );

          if (ch.hasMaterial && ch.materialId) {
            return (
              <li key={ch.id}>
                <Link
                  href={`/courses/${courseId}/material/${ch.materialId}`}
                  className="group block transition-colors hover:bg-muted/30"
                >
                  {inner}
                </Link>
              </li>
            );
          }

          return (
            <li key={ch.id} className="opacity-70">
              {inner}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
