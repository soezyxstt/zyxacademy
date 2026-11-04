"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export type ChapterOutlineRow = {
  id: string;
  title: string;
  number: number;
  completionPercent: number;
  completed: boolean;
  hasMaterial: boolean;
  href?: string;
  statusLabel?: string;
};

export function ChapterOutlineList({ chapters, showCount = true }: { chapters: ChapterOutlineRow[]; showCount?: boolean }) {
  const t = useTranslations("studentCourse");
  if (!chapters.length) return <section className="space-y-3"><div className="flex items-center justify-between gap-4 border-b border-border pb-2"><h2 className="font-heading text-body-base font-bold text-foreground">{t("course.chapterOutline.title")}</h2></div><div className="rounded-xl border border-dashed border-border bg-muted/15 py-10 text-center"><p className="text-body-sm text-muted-foreground">{t("course.chapterOutline.empty")}</p></div></section>;
  return <section className="space-y-3"><div className="flex items-center justify-between gap-4 border-b border-border pb-2"><h2 className="font-heading text-body-base font-bold text-foreground">{t("course.chapterOutline.title")}</h2>{showCount && <span className="text-body-sm text-muted-foreground">{t("course.chapterOutline.chapterCount", { completed: chapters.filter((chapter) => chapter.completed).length, total: chapters.length })}</span>}</div>
    <ul className="divide-y divide-border/60 zebra-no-rows overflow-hidden rounded-xl border border-border/70 bg-card">{chapters.map((chapter) => {
      const status = chapter.statusLabel ?? (chapter.hasMaterial ? chapter.completed ? t("course.chapterOutline.completed") : chapter.completionPercent > 0 ? t("course.chapterOutline.percentRead", { percent: chapter.completionPercent }) : t("course.chapterOutline.unread") : t("course.chapterOutline.unavailable"));
      const row = <div className="flex items-center justify-between gap-4 px-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg text-body-sm font-bold", chapter.completed ? "bg-status-success/12 text-status-success" : "bg-brand-primary/10 text-brand-primary")}>{chapter.completed ? <CheckCircle2 className="size-4" aria-hidden /> : chapter.number}</span><div className="min-w-0"><p className="break-words text-body-sm font-semibold text-foreground">{chapter.title}</p><p className="text-body-xs text-muted-foreground">{status}</p></div></div>{chapter.href && <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-brand-primary" aria-hidden />}</div>;
      return <li key={chapter.id} className={chapter.href ? undefined : "opacity-70"}>{chapter.href ? <Link href={chapter.href} className="group block transition-colors hover:bg-muted/30">{row}</Link> : row}</li>;
    })}</ul></section>;
}
