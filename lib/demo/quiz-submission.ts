import { gradeDemoQuiz, type DemoQuizResult } from "@/lib/demo/assessment/quiz";
import type { DemoQuizPage } from "@/lib/demo/quiz-pages";

/** Grade signed pages in bounded batches and publish only the complete result. */
export async function gradeDemoQuizPages(
  courseId: string,
  pages: readonly DemoQuizPage[],
  answers: Record<string, unknown>,
  grade: typeof gradeDemoQuiz = gradeDemoQuiz,
  deadlineMs = 30_000,
): Promise<DemoQuizResult> {
  const results: DemoQuizResult["results"] = [];
  let score = 0;
  let total = 0;
  for (let start = 0; start < pages.length; start += 2) {
    const batch = pages.slice(start, start + 2);
    // Abort failed peers and bound stalled fetches, then settle before enabling a retry.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("Quiz submission timed out")), deadlineMs);
    const gradedPages = await Promise.allSettled(batch.map(async page => {
      try {
        return await grade(courseId, page.questions, page.token, answers, page.offset, controller.signal);
      } catch (error) {
        controller.abort(error);
        throw error;
      }
    })).finally(() => clearTimeout(timer));
    for (const [index, outcome] of gradedPages.entries()) {
      if (outcome.status === "rejected") throw outcome.reason;
      const graded = outcome.value;
      score += graded.score;
      total += graded.total;
      results.push(...graded.results.map(item => ({ ...item, index: batch[index].offset + item.index })));
    }
  }
  return { score, total, results };
}
