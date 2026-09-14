import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoArticleView } from "@/components/demo/demo-article-view";
import { DemoDiktatView } from "@/components/demo/demo-diktat-view";
import { DemoEmptyState } from "@/components/demo/demo-empty-state";
import { DemoFlashcards } from "@/components/demo/demo-flashcards";
import { DemoQuiz } from "@/components/demo/demo-quiz";
import { demoCoursePath, DemoShell, type DemoView } from "@/components/demo/demo-shell";
import { DemoZyra } from "@/components/demo/demo-zyra";
import { getDemoContent } from "../demo-data";

type Props = {
  params: Promise<{ view: string }>;
};

const supportedViews = ["article", "diktat", "flashcards", "quiz", "zyra"] as const;
type SupportedView = (typeof supportedViews)[number];

export const metadata: Metadata = {
  title: "Demo Zyx Academy",
  description: "Jelajahi fitur belajar Zyx Academy.",
  robots: { index: false, follow: false },
};

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
      body = <DemoQuiz questions={content.quiz} nextPath={nextPath} />;
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
