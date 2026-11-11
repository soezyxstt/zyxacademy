import { gradeDemoQuiz, type DemoQuizResult } from "@/lib/demo/assessment/quiz";
import type { DemoQuizPage } from "@/lib/demo/quiz-pages";

/** Grade signed pages in bounded batches and publish only the complete result. */
export async function gradeDemoQuizPages(
  courseId: string,
  pages: readonly DemoQuizPage[],
  answers: Record<string, unknown>,
  grade: typeof gradeDemoQuiz = gradeDemoQuiz,
): Promise<DemoQuizResult> {
  const results: DemoQuizResult["results"] = [];
  let score = 0;
  let total = 0;
  for (let start = 0; start < pages.length; start += 2) {
    const batch = pages.slice(start, start + 2);
    const gradedPages = await Promise.all(batch.map(page => grade(courseId, page.questions, page.token, answers, page.offset)));
    for (const [index, graded] of gradedPages.entries()) {
      score += graded.score;
      total += graded.total;
      results.push(...graded.results.map(item => ({ ...item, index: batch[index].offset + item.index })));
    }
  }
  return { score, total, results };
}
