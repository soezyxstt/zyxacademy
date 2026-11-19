"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, Target } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { MathText } from "@/components/course/math-text";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTranslations } from "@/lib/i18n/client";
import type { StudentMasteryConcept, StudentMasteryGroup } from "@/lib/student/idea-mastery-read";

const PAGE_SIZE = 10;
const disclosure = "group flex min-h-11 w-full items-center gap-3 rounded-md text-left text-body-sm focus-visible:outline-2 focus-visible:outline-ring";
const chevron = "size-4 shrink-0 text-muted-foreground group-data-[state=open]:rotate-180";

function TopicList({ courseId, topics }: { courseId: string; topics: StudentMasteryConcept[] }) {
  const t = useTranslations("learning.mastery");
  const [page, setPage] = useState(0);
  const pages = Math.ceil(topics.length / PAGE_SIZE);
  return (
    <>
      <ul className="divide-y divide-border">
        {topics.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((topic, index) => (
          <li key={index} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
            <div className="min-w-0 flex-1 basis-44 break-words text-body-sm">
              {topic.conceptSlug ? (
                <Link className="underline decoration-border underline-offset-4 hover:text-primary focus-visible:outline-ring" href={`/courses/${courseId}/concept/${topic.conceptSlug}`}>
                  <MathText as="span">{topic.conceptName}</MathText>
                </Link>
              ) : <MathText as="span">{topic.conceptName}</MathText>}
              {topic.blockedBy.length > 0 && <p className="mt-1 text-body-xs text-muted-foreground">
                <MathText as="span">{t("prerequisite", { topic: topic.blockedBy.join(", ") })}</MathText>
              </p>}
            </div>
            {topic.masteryScore !== null && (
              <span className="text-body-xs tabular-nums text-muted-foreground">
                {topic.trend && <>{t(topic.trend)} · </>}
                <span className="sr-only">{t("score", { score: topic.masteryScore })}</span>
                <span aria-hidden>{topic.masteryScore}/100</span>
              </span>
            )}
          </li>
        ))}
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
    <div className="space-y-5">
      {focus ? (
        <section className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <div className="min-w-0 flex-1 basis-60 break-words">
            <p className="text-body-xs text-muted-foreground">{t(!focus.reliable ? "early" : review ? "review" : "strong")}</p>
            <h2 className="mt-1 font-heading text-body-base font-bold"><MathText as="span">{focus.topic.conceptName}</MathText></h2>
            <p className="mt-1 text-body-xs text-muted-foreground">{focus.chapter.title} · {t("score", { score: focus.score })}</p>
            <p className="mt-1 text-body-sm">{t(!focus.reliable ? "limited" : review ? "reviewReason" : "strongReason")}</p>
          </div>
          {action}
        </section>
      ) : <AdminEmptyState icon={Target} title={t("emptyTitle")} description={t("emptyDescription")} action={action} className="py-4" />}
      {chapters.length > 0 && <section>
        <h2 className="mb-1 font-heading text-body-base font-bold">{t("chapters")}</h2>
        <div className="divide-y border-y">
          {chapters.map(({ chapter, assessed, unassessed }) => (
            <Collapsible key={chapter.id}>
              <CollapsibleTrigger className={disclosure}>
                <span className="min-w-0 flex-1 break-words">{chapter.title}</span>
                <span className="shrink-0 text-body-xs tabular-nums text-muted-foreground">{t("coverage", { count: assessed.length, total: assessed.length + unassessed.length })}</span>
                <ChevronDown className={chevron} />
              </CollapsibleTrigger>
              <CollapsibleContent className="border-l pl-3">
                <TopicList courseId={courseId} topics={assessed.length ? assessed : unassessed} />
                {assessed.length > 0 && unassessed.length > 0 && <Collapsible>
                  <CollapsibleTrigger className={disclosure}>{t("unassessed", { count: unassessed.length })}<ChevronDown className={chevron} /></CollapsibleTrigger>
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
