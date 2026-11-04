import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { demoCoursePath } from "@/lib/demo/routes";
import { DemoProductControls } from "@/components/demo/demo-product-controls";
import { parseDemoSelection, type DemoSearchParams } from "@/lib/demo/selection";
import { DemoDashboard } from "@/components/demo/demo-dashboard";
import { DemoArticleView } from "@/components/demo/demo-article-view";
import { DemoDiktatView } from "@/components/demo/demo-diktat-view";
import { DemoEmptyState } from "@/components/demo/demo-empty-state";
import { DemoFlashcards } from "@/components/demo/demo-flashcards";
import { DemoTryout } from "@/components/demo/assessment/demo-tryout";
import { DemoQuiz } from "@/components/demo/demo-quiz";
import { DemoShell, type DemoView } from "@/components/demo/demo-shell";
import { DemoZyra } from "@/components/demo/demo-zyra";
import { getDemoExperience, getDemoExperiences } from "../demo-data";

import { createLocalizedMetadata } from "@/lib/site-metadata";

type Props = {
  params: Promise<{ view: string }>;
  searchParams: Promise<DemoSearchParams>;
};

const supportedViews = ["courses", "progress", "history", "article", "diktat", "flashcards", "quiz", "tryout", "zyra"] as const;
type SupportedView = (typeof supportedViews)[number];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { view } = await params;
  const key = isSupportedView(view) && !["courses", "progress", "history"].includes(view) ? `demo.views.${view}` : "meta.demo.title";
  return createLocalizedMetadata({ path: `/demo/${view}`, titleKey: key, descriptionKey: "meta.demo.description", noIndex: true });
}


export const dynamic = "force-dynamic";

function isSupportedView(value: string): value is SupportedView {
  return (supportedViews as readonly string[]).includes(value);
}

export default async function DemoViewPage({ params, searchParams }: Props) {
  const { view } = await params;
  if (!isSupportedView(view)) notFound();

  const parsed = parseDemoSelection(await searchParams);
  if (!parsed) notFound();
  const defaults = await getDemoExperiences();
  if (!defaults.length) return <DemoEmptyState />;
  const courseId = parsed.course ?? defaults[0].snapshot.courseId;
  if (!defaults.some((item) => item.snapshot.courseId === courseId)) notFound();
  const experience = await getDemoExperience(courseId, parsed.selection);
  if (!experience) notFound();
  const { page, articles, diktats, flashcardSets } = experience.content.collections;
  if (page.offset > 0 && !articles.length && !diktats.length && !flashcardSets.length) notFound();
  const experiences = defaults.map(({ snapshot, content }) => ({ snapshot, content: { course: content.course } }));

  const { content, snapshot } = experience;
  const nextPath = demoCoursePath(content.course.id);

  let body: React.ReactNode;
  switch (view) {
    case "courses":
    case "progress":
    case "history":
      body = <DemoDashboard experiences={experiences} selected={experience} view={view} />;
      break;
    case "article":
      body = <DemoArticleView article={content.article} nextPath={nextPath} />;
      break;
    case "diktat":
      body = <DemoDiktatView title={content.diktat.title} sections={content.diktat.sections} nextPath={nextPath} />;
      break;
    case "flashcards":
      body = <DemoFlashcards key={`${content.selected.flashcardSetId}:${content.collections.flashcards.offset}`} cards={content.flashcards} nextPath={nextPath} />;
      break;
    case "quiz":
      body = <DemoQuiz key={`${snapshot.courseId}:${content.collections.quiz.offset}`} quizOffset={content.collections.quiz.offset} courseId={snapshot.courseId} questions={content.quiz} quizSetToken={content.quizSetToken} nextPath={nextPath} />;
      break;
    case "tryout":
      body = <DemoTryout key={`${snapshot.courseId}:${snapshot.revision}`} courseId={snapshot.courseId} />;
      break;
    case "zyra":
      body = <DemoZyra nextPath={nextPath} />;
      break;
  }

  return (
    <DemoShell experiences={experiences} selected={{ snapshot, content: { course: content.course } }} activeView={view as DemoView} selection={parsed.selection} reviewScope={content.selected.flashcardSetId ? { setId: content.selected.flashcardSetId, offset: content.collections.flashcards.offset } : undefined}>
      {(view === "article" || view === "diktat" || view === "flashcards" || view === "quiz") && <DemoProductControls view={view} courseId={snapshot.courseId} content={content} selection={parsed.selection} />}
      {body}
    </DemoShell>
  );
}
