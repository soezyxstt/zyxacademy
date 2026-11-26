import { getDemoCatalogue, getDemoExperience } from "@/app/(marketing)/demo/demo-data";
import { collectDemoProducts } from "@/lib/demo/product-pages";
import { parseDemoSelection } from "@/lib/demo/selection";
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
  const courseId = selected.snapshot.courseId;

  if (view === "overview") {
    const catalogue = await getDemoCatalogue(courseId);
    return catalogue ? found({ kind: view, chapters: catalogue.chapters }) : missing();
  }

  const kind = view === "quiz" || view === "quiz-list" || view === "quiz-start" ? "quiz" : view;
  const requestedKind = parsed.selection.collectionOffset && kind !== "documents" && kind !== "flashcards" ? "all" : kind;
  const experience = await getDemoExperience(courseId, parsed.selection, requestedKind);
  if (!experience) return missing();
  const { content } = experience;
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
        title: content.article.title,
        minutes: content.article.totalEstimatedReadingMinutes,
        sections: content.article.sections.map(({ id, title, learningObjective, blocks }) => ({
          id, title, objective: learningObjective,
          blocks: blocks.map(({ id: blockId, title: heading, content: text }) => ({ id: blockId, title: heading, text })),
        })),
      });
    case "diktat":
      return found({ kind: view, title: content.diktat.title, sections: content.diktat.sections });
    case "flashcards":
      return found({ kind: view, cards: content.flashcards,
        nextOffset: collections.flashcards.nextOffset, offset: collections.flashcards.offset });
    case "quiz-list":
    case "quiz-start":
    case "quiz":
      return found({
        kind: view,
        courseId,
        offset: collections.quiz.offset,
        nextOffset: collections.quiz.nextOffset,
        previousOffset: collections.quiz.previousOffset,
        total: collections.quiz.total,
        questions: view === "quiz" ? content.quiz : [],
        token: view === "quiz" ? content.quizSetToken : "",
      });
  }
}
