"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, Minus, Target, TrendingDown, TrendingUp } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { MathText } from "@/components/course/math-text";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTranslations } from "@/lib/i18n/client";
import type { StudentMasteryConcept, StudentMasteryGroup } from "@/lib/student/idea-mastery-read";

const PAGE_SIZE = 10;
const disclosure = "group flex min-h-11 w-full items-center gap-(--compact-gap) rounded-md text-left text-body-sm hover:bg-muted/30 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";
const chevron = "size-4 shrink-0 text-muted-foreground group-data-[state=open]:rotate-180";
const trends = {
  improving: { icon: TrendingUp, color: "text-status-success" },
  stable: { icon: Minus, color: "text-muted-foreground" },
  declining: { icon: TrendingDown, color: "text-status-error" },
};

function TopicList({ courseId, topics }: { courseId: string; topics: StudentMasteryConcept[] }) {
  const t = useTranslations("learning.mastery");
  const [page, setPage] = useState(0);
  const pages = Math.ceil(topics.length / PAGE_SIZE);
  return (
    <>
      <ul className="divide-y divide-border/30">
        {topics.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((topic, index) => {
          const trend = topic.trend ? trends[topic.trend] : null;
          const TrendIcon = trend?.icon;
          return (
            <li key={index} className="flex flex-wrap items-baseline justify-between gap-x-(--compact-gap) gap-y-1 py-(--table-row-padding)">
              <div className="min-w-0 flex-1 basis-44 wrap-anywhere text-body-sm max-sm:has-[.katex]:basis-full">
                {topic.conceptSlug ? (
                  <Link data-math-scroll className="block w-fit max-w-full overflow-x-auto underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-current focus-visible:-outline-offset-2" href={`/courses/${courseId}/concept/${topic.conceptSlug}`}>
                    <MathText as="span">{topic.conceptName}</MathText>
                  </Link>
                ) : <div data-math-scroll className="overflow-x-auto"><MathText as="span">{topic.conceptName}</MathText></div>}
                {topic.blockedBy.length > 0 && <p data-math-scroll className="mt-1 overflow-x-auto text-body-xs text-muted-foreground">
                  <MathText as="span">{t("prerequisite", { topic: topic.blockedBy.join(", ") })}</MathText>
                </p>}
              </div>
              {topic.masteryScore !== null && (
                <span className="ml-auto flex shrink-0 items-center gap-2 text-body-xs tabular-nums">
                  {topic.trend && trend && TrendIcon && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <TrendIcon className={`size-3.5 shrink-0 ${trend.color}`} aria-hidden="true" />
                      <span className="sr-only sm:not-sr-only">{t(topic.trend)}</span>
                    </span>
                  )}
                  <span className="sr-only">{t("score", { score: topic.masteryScore })}</span>
                  <span className="font-semibold text-foreground" aria-hidden="true">{topic.masteryScore}/100</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {pages > 1 && <TooltipProvider><div className="flex items-center justify-end gap-2 py-1">
        <Tooltip>
          <TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label={t("previous")} disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft /></Button></TooltipTrigger>
          <TooltipContent>{t("previous")}</TooltipContent>
        </Tooltip>
        <span className="text-body-xs tabular-nums" aria-live="polite">{page + 1}/{pages}</span>
        <Tooltip>
          <TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label={t("more")} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}><ChevronRight /></Button></TooltipTrigger>
          <TooltipContent>{t("more")}</TooltipContent>
        </Tooltip>
      </div></TooltipProvider>}
    </>
  );
}

export function ConceptMap({ courseId, groups, pathHref = `/courses/${courseId}/path` }: {
  courseId: string;
  groups: StudentMasteryGroup[];
  pathHref?: string;
}) {
  const t = useTranslations("learning.mastery");
  const chapters = groups.map(({ chapter, concepts }) => ({
    chapter,
    assessed: concepts.filter(c => c.masteryScore !== null),
    unassessed: concepts.filter(c => c.masteryScore === null),
  }));
  const results = chapters.flatMap(({ chapter, assessed }) => assessed.map(topic => ({
    chapter, topic, score: topic.masteryScore!, reliable: (topic.confidence ?? 0) >= 50,
  })));
  // Use the same score and confidence cutoffs as the study path.
  const reliable = results.filter(result => result.reliable);
  const candidates = reliable.length ? reliable : results;
  const review = candidates.filter(result => result.score < 70).sort((a, b) => a.score - b.score)[0];
  const focus = review ?? candidates.sort((a, b) => b.score - a.score)[0];
  const topicHref = review?.topic.conceptSlug && `/courses/${courseId}/concept/${review.topic.conceptSlug}`;
  const action = <Button asChild size="sm" className="text-body-sm"><Link href={topicHref || pathHref}>
    {t(topicHref ? "reviewTopic" : "openPath")}
  </Link></Button>;

  return (
    <div className="space-y-(--major-gap) md:space-y-10">
      {focus ? (
        <section className="flex flex-wrap items-center justify-between gap-x-(--group-gap) gap-y-(--compact-gap)">
          <div className="min-w-0 flex-1 basis-60 wrap-anywhere">
            <p className="text-body-xs text-muted-foreground">{t(!focus.reliable ? "early" : review ? "review" : "strong")}</p>
            <h2 data-math-scroll className="mt-1 overflow-x-auto font-heading text-body-base font-bold"><MathText as="span">{focus.topic.conceptName}</MathText></h2>
            <p className="mt-1 text-body-xs text-muted-foreground"><MathText as="span">{focus.chapter.title}</MathText> · <span className="tabular-nums text-foreground">{t("score", { score: focus.score })}</span></p>
            <p className="mt-1 text-body-sm">{t(!focus.reliable ? "limited" : review ? "reviewReason" : "strongReason")}</p>
          </div>
          {action}
        </section>
      ) : <AdminEmptyState icon={Target} title={t("emptyTitle")} description={t("emptyDescription")} action={action} className="py-4" />}
      {chapters.length > 0 && <section>
        <h2 className="mb-1 font-heading text-body-base font-bold">{t("chapters")}</h2>
        <div className="divide-y divide-border/30">
          {chapters.map(({ chapter, assessed, unassessed }) => (
            <Collapsible key={chapter.id}>
              <CollapsibleTrigger className={disclosure}>
                <span className="min-w-0 flex-1 wrap-anywhere font-semibold">{chapter.title}</span>
                <span className="max-w-1/3 shrink-0 text-right text-body-xs tabular-nums text-muted-foreground">{t("coverage", { count: assessed.length, total: assessed.length + unassessed.length })}</span>
                <ChevronDown className={chevron} aria-hidden="true" />
              </CollapsibleTrigger>
              <CollapsibleContent className="min-w-0 pl-(--compact-gap)">
                <TopicList courseId={courseId} topics={assessed.length ? assessed : unassessed} />
                {assessed.length > 0 && unassessed.length > 0 && <Collapsible>
                  <CollapsibleTrigger className={disclosure}><span className="flex-1 text-muted-foreground">{t("unassessed", { count: unassessed.length })}</span><ChevronDown className={chevron} aria-hidden="true" /></CollapsibleTrigger>
                  <CollapsibleContent><TopicList courseId={courseId} topics={unassessed} /></CollapsibleContent>
                </Collapsible>}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </section>}
    </div>
  );
}
