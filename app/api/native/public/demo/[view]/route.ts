import { getDemoCatalogue, getDemoExperience } from "@/app/(marketing)/demo/demo-data";
import { syntheticTryout } from "@/lib/demo/assessment/tryout";
import { createDemoPathSteps } from "@/lib/demo/learning-path";
import { getDemoMastery } from "@/lib/demo/mastery-repository";
import { demoMasteryGroups } from "@/lib/demo/view-mastery";
import { collectDemoProducts } from "@/lib/demo/product-pages";
import { parseDemoSelection } from "@/lib/demo/selection";
import { materializeArticleParts } from "@/lib/materials/article-parts";
import { getDemoSummaries } from "@/lib/demo/summary-repository";
import { demoSearchParams, isNativeDemoContentView, type PublicDemoContent } from "@/packages/native-parity/operations/public-contract";

export async function GET(request: Request, { params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const { searchParams } = new URL(request.url);
  const parsed = parseDemoSelection(demoSearchParams(searchParams));
  const headers = { "Cache-Control": "no-store" };
  const missing = () => Response.json({ error: "missing" }, { status: 404, headers });
  const found = (value: PublicDemoContent) => Response.json(value, { headers });
  if (!isNativeDemoContentView(view) || !parsed) return missing();

  const summaries = await getDemoSummaries();
  const selected = parsed.course ? summaries.find(({ snapshot }) => snapshot.courseId === parsed.course) : summaries[0];
  if (!selected) return missing();
  const { snapshot, content: { course } } = selected;
  const { courseId } = snapshot;

  if (view === "overview") {
    const catalogue = await getDemoCatalogue(courseId);
    return catalogue ? found({ kind: view, chapters: catalogue.chapters }) : missing();
  }

  if (view === "progress") {
    const { revision, course: metrics, flashcards, history, streakDays } = snapshot;
    return found({ kind: view, baseline: { courseId, revision, course: metrics, flashcards: { dueCount: flashcards.dueCount }, history, streakDays } });
  }
  if (view === "path") {
    return found({ kind: view, steps: createDemoPathSteps(snapshot.weakConcepts, course.chapterTitle) });
  }
  if (view === "mastery") {
    const mastery = await getDemoMastery([courseId]);
    return found({ kind: view, groups: demoMasteryGroups(mastery[courseId], snapshot, course.chapterTitle) });
  }
  if (view === "tryout-list") {
    const locale = request.headers.get("Accept-Language") === "en" ? "en" : "id";
    const exam = syntheticTryout(courseId, locale);
    return found({ kind: view, exam: {
      id: exam.id, title: exam.title, questionCount: exam.questions.length,
      timeLimitMinutes: exam.settings?.timeLimitMinutes ?? 90,
      maximumAttempts: exam.settings?.maxAttempts ?? 2,
    } });
  }

  const kind = view === "quiz" || view === "quiz-list" || view === "quiz-start" ? "quiz" : view;
  const requestedKind = parsed.selection.collectionOffset && kind !== "documents" && kind !== "flashcards" ? "all" : kind;
  const experience = await getDemoExperience(courseId, parsed.selection, requestedKind);
  if (!experience) return missing();
  const { content, snapshot: { revision } } = experience;
  const { collections } = content;
  if (collections.page.offset > 0 && !collections.articles.length && !collections.diktats.length && !collections.flashcardSets.length) return missing();

  switch (view) {
    case "documents": {
      const products = await collectDemoProducts(experience, (id, selection) => getDemoExperience(id, selection, "documents"));
      return products ? found({ kind: view, documents: [
        ...products.articles.map((item) => ({ ...item, kind: "article" as const })),
        ...products.diktats.map((item) => ({ ...item, kind: "diktat" as const })),
      ] }) : missing();
    }
    case "article":
      return found({
        kind: view,
        revision, courseId, materialId: content.article.id,
        title: content.article.title,
        minutes: content.article.totalEstimatedReadingMinutes,
        sections: content.article.sections.map(({ id, title, learningObjective, blocks }) => ({
          id, title, objective: learningObjective,
          blocks: blocks.map(({ id: blockId, title: heading, content: text, parts }) => ({
            id: blockId,
            title: heading,
            text: parts?.length ? materializeArticleParts(parts).replace(/<!-- visual:[^>]* -->/g, "") : text,
          })),
        })),
      });
    case "diktat":
      return found({ kind: view, revision, courseId, materialId: content.selected.diktatId, title: content.diktat.title, sections: content.diktat.sections });
    case "flashcards":
      return found({ kind: view, revision, courseId, setId: content.selected.flashcardSetId, cards: content.flashcards,
        nextOffset: collections.flashcards.nextOffset, offset: collections.flashcards.offset });
    case "quiz-list":
    case "quiz-start":
    case "quiz":
      return found({
        kind: view,
        courseId, revision,
        offset: collections.quiz.offset,
        nextOffset: collections.quiz.nextOffset,
        previousOffset: collections.quiz.previousOffset,
        total: collections.quiz.total,
        questions: view === "quiz" ? content.quiz : [],
        token: view === "quiz" ? content.quizSetToken : "",
      });
  }
}
