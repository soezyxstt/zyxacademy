import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoCommunity } from "@/components/demo/demo-community";
import { DemoArticleView } from "@/components/demo/demo-article-view";
import { DemoDiktatView } from "@/components/demo/demo-diktat-view";
import { DemoEmptyState } from "@/components/demo/demo-empty-state";
import { DemoFlashcards } from "@/components/demo/demo-flashcards";
import { DemoQuiz } from "@/components/demo/demo-quiz";
import { demoCoursePath, DemoShell, type DemoView } from "@/components/demo/demo-shell";
import { DemoZyra } from "@/components/demo/demo-zyra";
import { getDemoContent } from "../demo-data";

import { createMetadata } from "@/lib/site";

type Props = {
  params: Promise<{ view: string }>;
};

const supportedViews = ["article", "diktat", "flashcards", "quiz", "zyra", "schedule", "leaderboard", "groups"] as const;
type SupportedView = (typeof supportedViews)[number];

const VIEW_LABELS: Record<SupportedView, string> = {
  article: "Demo Artikel Materi",
  diktat: "Demo Diktat Kuliah",
  flashcards: "Demo Flashcard",
  quiz: "Demo Kuis Interaktif",
  zyra: "Demo Asisten Zyra",
  schedule: "Demo Jadwal Belajar",
  leaderboard: "Demo Leaderboard",
  groups: "Demo Kelompok Belajar",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { view } = await params;
  const label = isSupportedView(view) ? VIEW_LABELS[view] : "Demo";
  return createMetadata({
    title: label,
    description: `Jelajahi fitur ${label} di Zyx Academy.`,
    path: `/demo/${view}`,
    noIndex: true,
  });
}


export const dynamic = "force-dynamic";

function isSupportedView(value: string): value is SupportedView {
  return (supportedViews as readonly string[]).includes(value);
}

export default async function DemoViewPage({ params }: Props) {
  const { view } = await params;
  if (!isSupportedView(view)) notFound();

  const content = await getDemoContent();
  if (!content) return <DemoEmptyState />;

  const nextPath = demoCoursePath(content.course.id);

  let body: React.ReactNode;
  switch (view) {
    case "article":
      body = <DemoArticleView article={content.article} nextPath={nextPath} />;
      break;
    case "diktat":
      body = <DemoDiktatView title={content.diktat.title} sections={content.diktat.sections} nextPath={nextPath} />;
      break;
    case "flashcards":
      body = <DemoFlashcards cards={content.flashcards} nextPath={nextPath} />;
      break;
    case "quiz":
      body = <DemoQuiz questions={content.quiz} quizSetToken={content.quizSetToken} nextPath={nextPath} />;
      break;
    case "schedule":
    case "leaderboard":
    case "groups":
      body = <DemoCommunity view={view} course={content.course} nextPath={nextPath} />;
      break;
    case "zyra":
      body = <DemoZyra nextPath={nextPath} />;
      break;
  }

  return (
    <DemoShell activeView={view as DemoView} course={content.course}>
      {body}
    </DemoShell>
  );
}
