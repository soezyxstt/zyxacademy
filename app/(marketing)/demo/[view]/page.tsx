import { DemoReviewScope } from "@/components/demo/demo-session";
import { getDemoMastery } from "@/lib/demo/mastery-repository";
import { Suspense } from "react";
import { DemoViewSkeleton } from "@/components/demo/demo-loading";
import { DemoTryoutReview } from "@/components/demo/assessment/demo-tryout-review";
import { collectDemoProducts, collectDemoFlashcards } from "@/lib/demo/product-pages";
import { collectDemoQuizPages } from "@/lib/demo/quiz-pages";
import { addSelectedFallback } from "@/lib/demo/catalogue";
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
import { getDemoCatalogue, getDemoExperience as loadDemoExperience } from "../demo-data";
import { getDemoSummaries } from "@/lib/demo/summary-repository";
import type { DemoProductSelection } from "../demo-data";
import type { DemoSummary } from "@/components/demo/demo-shell";

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
  const experiences = await getDemoSummaries();
  if (!experiences.length) return <DemoEmptyState />;
  const courseId = parsed.course ?? experiences[0].snapshot.courseId;
  const selected = experiences.find(item => item.snapshot.courseId === courseId);
  if (!selected) notFound();
  return <DemoShell showLive={ui.showLive} experiences={experiences} selected={selected} activeView={view as DemoView} selection={parsed.selection}>
    <Suspense key={`${view}:${courseId}:${JSON.stringify(parsed.selection)}`} fallback={<DemoViewSkeleton view={view} />}>
      <DemoViewBody view={view} summary={selected} selection={parsed.selection} experiences={experiences} whatsappHref={ui.whatsappHref} />
    </Suspense>
  </DemoShell>;
}

async function DemoViewBody({ view, summary, selection, experiences, whatsappHref }: { view: SupportedView; summary: DemoSummary; selection: DemoProductSelection; experiences: DemoSummary[]; whatsappHref: string | null }) {
  const courseId = summary.snapshot.courseId;
  switch (view) {
    case "mastery": {
      const mastery = await getDemoMastery([courseId]);
      return <DemoStudentPage view={view} experience={summary} mastery={mastery[courseId]} />;
    }
    case "feedback": case "profile-edit": case "reflections": case "leaderboard": case "course-leaderboard": case "playground": case "live": case "profile": case "settings": case "notifications": case "groups": case "schedule": case "video": case "path":
      return <DemoStudentPage view={view} experience={summary} />;
    case "overview": case "zyra": {
      const catalogue = await getDemoCatalogue(courseId);
      if (!catalogue) notFound();
      const overview = <DemoCourseOverview experience={summary} catalogue={catalogue} />;
      return view === "zyra" ? <DemoZyra>{overview}</DemoZyra> : overview;
    }
    case "courses": return <DemoCourseCatalog experiences={experiences} whatsappHref={whatsappHref} />;
    case "progress": return <DemoCourseProgress experience={summary} />;
    case "tryout-list": return <DemoTryoutList experience={summary} />;
    case "results": case "history": return <DemoResults experience={summary} />;
    case "tryout-review": return <DemoTryoutReview courseId={courseId} />;
    case "tryout": return <DemoTryout key={`${courseId}:${summary.snapshot.revision}`} courseId={courseId} />;
  }
  const kind = view === "documents" ? "documents" : view === "article" ? "article" : view === "diktat" ? "diktat" : view === "flashcards" ? "flashcards" : "quiz";
  // The fixture resolver accepts the older two-argument form as well.
  const loadForKind: (id: string, selected: DemoProductSelection, kind: "all" | "documents" | "article" | "diktat" | "flashcards" | "quiz") => ReturnType<typeof loadDemoExperience> = loadDemoExperience;
  // A nonzero collection cursor must still be checked against the collection.
  const getDemoExperience = (id: string, selected: DemoProductSelection) => loadForKind(id, selected, selected.collectionOffset && kind !== "documents" && kind !== "flashcards" ? "all" : kind);
  const loadProducts = (id: string, selected: DemoProductSelection) => loadForKind(id, selected, "documents");
  const loadFlashcards = (id: string, selected: DemoProductSelection) => loadForKind(id, selected, "flashcards");
  const loadQuiz = (id: string, selected: DemoProductSelection) => loadForKind(id, selected, "quiz");
  const [experience, documentsCatalogue] = await Promise.all([
    getDemoExperience(courseId, selection),
    view === "documents" ? getDemoCatalogue(courseId) : Promise.resolve(null),
  ]);
  if (!experience) notFound();
  const { page, articles, diktats, flashcardSets } = experience.content.collections;
  if (page.offset > 0 && !articles.length && !diktats.length && !flashcardSets.length) notFound();
  const { content, snapshot } = experience;
  const course = { id: content.course.id, title: content.course.title };
  const completeCatalogue = (catalogue: NonNullable<Awaited<ReturnType<typeof getDemoCatalogue>>>) => addSelectedFallback(catalogue, {
    articleId: articles.find(item => item.id === content.selected.articleId)?.id,
    diktatId: diktats.find(item => item.id === content.selected.diktatId)?.id,
  }, { article: content.article.title, diktat: content.diktat.title });
  // These list adapters consume only course, snapshot, and quiz count; their
  // shared experience type also contains reader bodies and question pages.
  const listExperience = {
    snapshot,
    content: {
      ...content,
      article: { ...content.article, sections: [] },
      diktat: { ...content.diktat, sections: [] },
      flashcards: [], quiz: [], quizSetToken: "",
      collections: { ...content.collections, articles: [], diktats: [], flashcardSets: [] },
    },
  };

  let body: React.ReactNode;
  switch (view) {
    case "quiz-list":
      body = <DemoQuizList experience={listExperience} />;
      break;
    case "quiz-start":
      body = <DemoQuizGateway experience={listExperience} />;
      break;
    case "documents": {
      const products = await collectDemoProducts(experience, loadProducts);
      if (!products || !documentsCatalogue) notFound();
      body = <DemoDocuments experience={listExperience} products={products} catalogue={completeCatalogue(documentsCatalogue)} />;
      break;
    }
    case "article":
      body = <DemoArticleView article={content.article} course={course} />;
      break;
    case "diktat":
      body = <DemoDiktatView chapterId={content.article.chapterId} id={content.selected.diktatId} course={course} title={content.diktat.title} sections={content.diktat.sections} />;
      break;
    case "flashcards": {
      const products = await collectDemoProducts(experience, loadProducts);
      const cards = products ? await collectDemoFlashcards(experience, products, loadFlashcards, experience) : null;
      if (!cards) notFound();
      body = content.selected.flashcardSetId ? <DemoReviewScope setId={content.selected.flashcardSetId} offset={content.collections.flashcards.offset}><DemoFlashcards key={`${snapshot.courseId}:${snapshot.revision}`} cards={cards} course={course} /></DemoReviewScope> : <DemoFlashcards key={`${snapshot.courseId}:${snapshot.revision}`} cards={cards} course={course} />;
      break;
    }
    case "quiz-review":
    case "quiz-summary":
    case "quiz": {
      const pages = await collectDemoQuizPages(experience, loadQuiz);
      if (!pages) notFound();
      body = <DemoQuiz key={`${snapshot.courseId}:${snapshot.revision}`} view={view} courseId={snapshot.courseId} pages={pages} />;
      break;
    }

  }

  return body;
}
