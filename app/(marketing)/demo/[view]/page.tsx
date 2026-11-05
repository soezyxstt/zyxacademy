import { DemoTryoutReview } from "@/components/demo/assessment/demo-tryout-review";
import { collectDemoProducts, collectDemoFlashcards } from "@/lib/demo/product-pages";
import { collectDemoQuizPages } from "@/lib/demo/quiz-pages";
import { DemoStudentPage } from "@/components/demo/demo-student-pages";
import { env } from "@/lib/env";
import { getWhatsAppAdminChatHref } from "@/lib/whatsapp-admin";
import { DemoTryoutList } from "@/components/demo/demo-tryout-list";
import { DemoResults } from "@/components/demo/demo-results";
import { DemoQuizList, DemoQuizGateway } from "@/components/demo/demo-quiz-list";
import { DemoCourseCatalog } from "@/components/demo/demo-course-catalog";
import { DemoDocuments } from "@/components/demo/demo-documents";
import { DemoCourseProgress } from "@/components/demo/demo-course-progress";
import { DemoCourseOverview } from "@/components/demo/demo-course-overview";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseDemoSelection, type DemoSearchParams } from "@/lib/demo/selection";
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

const supportedViews = ["feedback", "tryout-review", "quiz-review", "quiz-summary", "profile-edit", "reflections", "leaderboard", "course-leaderboard", "playground", "live", "profile", "settings", "notifications", "groups", "schedule", "video", "path", "mastery", "tryout-list", "results", "quiz-list", "quiz-start", "documents", "overview", "courses", "progress", "history", "article", "diktat", "flashcards", "quiz", "tryout", "zyra"] as const;
type SupportedView = (typeof supportedViews)[number];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { view } = await params;
  const key = isSupportedView(view) && !["courses", "progress", "history", "overview", "documents", "quiz-list", "quiz-start", "results", "tryout-list", "profile", "settings", "notifications", "groups", "schedule", "video", "path", "mastery", "leaderboard", "course-leaderboard", "playground", "live", "profile-edit", "reflections", "quiz-review", "quiz-summary", "tryout-review", "feedback"].includes(view) ? `demo.views.${view}` : "meta.demo.title";
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
  const ui = { showLive: env.FEATURE_LIVE === "1", whatsappHref: getWhatsAppAdminChatHref() };
  const defaults = await getDemoExperiences();
  if (!defaults.length) return <DemoEmptyState />;
  const courseId = parsed.course ?? defaults[0].snapshot.courseId;
  if (!defaults.some((item) => item.snapshot.courseId === courseId)) notFound();
  const experience = await getDemoExperience(courseId, parsed.selection);
  if (!experience) notFound();
  const { page, articles, diktats, flashcardSets } = experience.content.collections;
  if (page.offset > 0 && !articles.length && !diktats.length && !flashcardSets.length) notFound();
  const experiences = defaults.map(({ snapshot, content }) => ({ snapshot, content: { course: content.course, article: { id: content.article.id, title: content.article.title } } }));

  const { content, snapshot } = experience;

  let body: React.ReactNode;
  switch (view) {
    case "tryout-review":
      body = <DemoTryoutReview courseId={snapshot.courseId} />;
      break;
    case "feedback": case "profile-edit": case "reflections": case "leaderboard": case "course-leaderboard": case "playground": case "live": case "profile": case "settings": case "notifications": case "groups": case "schedule": case "video": case "path": case "mastery":
      body = <DemoStudentPage view={view} experience={experience} />;
      break;
    case "tryout-list":
      body = <DemoTryoutList experience={experience} />;
      break;
    case "quiz-list":
      body = <DemoQuizList experience={experience} />;
      break;
    case "quiz-start":
      body = <DemoQuizGateway experience={experience} />;
      break;
    case "courses":
      body = <DemoCourseCatalog experiences={experiences} whatsappHref={ui.whatsappHref} />;
      break;
    case "documents": {
      const products = await collectDemoProducts(experience, getDemoExperience);
      if (!products) notFound();
      body = <DemoDocuments experience={experience} products={products} />;
      break;
    }
    case "progress":
      body = <DemoCourseProgress experience={experience} />;
      break;
    case "overview":
      body = <DemoCourseOverview experience={experience} />;
      break;
    case "history":
    case "results":
      body = <DemoResults experience={experience} />;
      break;
    case "article":
      body = <DemoArticleView article={content.article} course={content.course} />;
      break;
    case "diktat":
      body = <DemoDiktatView chapterId={content.article.chapterId} id={content.selected.diktatId} course={content.course} title={content.diktat.title} sections={content.diktat.sections} />;
      break;
    case "flashcards": {
      const products = await collectDemoProducts(experience, getDemoExperience);
      const cards = products ? await collectDemoFlashcards(experience, products, getDemoExperience) : null;
      if (!cards) notFound();
      body = <DemoFlashcards key={`${snapshot.courseId}:${snapshot.revision}`} cards={cards} course={content.course} />;
      break;
    }
    case "quiz-review":
    case "quiz-summary":
    case "quiz": {
      const pages = await collectDemoQuizPages(experience, getDemoExperience);
      if (!pages) notFound();
      body = <DemoQuiz key={`${snapshot.courseId}:${snapshot.revision}`} view={view} courseId={snapshot.courseId} pages={pages} />;
      break;
    }
    case "tryout":
      body = <DemoTryout key={`${snapshot.courseId}:${snapshot.revision}`} courseId={snapshot.courseId} />;
      break;
    case "zyra":
      body = <DemoZyra><DemoCourseOverview experience={experience} /></DemoZyra>;
      break;
  }

  return (
    <DemoShell showLive={ui.showLive} experiences={experiences} selected={{ snapshot, content: { course: content.course, article: { id: content.article.id, title: content.article.title } } }} activeView={view as DemoView} selection={parsed.selection} reviewScope={content.selected.flashcardSetId ? { setId: content.selected.flashcardSetId, offset: content.collections.flashcards.offset } : undefined}>
      {body}
    </DemoShell>
  );
}
