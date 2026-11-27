export type DemoQuizPage = {
  offset: number;
  total: number;
  nextOffset: number | null;
  questionCount: number;
};

type IncompleteQuiz = { total: number; nextOffset: number };

export function advanceDemoQuiz(progress: IncompleteQuiz | null, page: DemoQuizPage) {
  const end = page.offset + page.questionCount;
  if (page.offset < 0 || page.questionCount < 1 || end > page.total || (page.nextOffset ?? page.total) !== end || page.nextOffset === page.total) {
    return { complete: false, pending: progress };
  }
  if (page.offset > 0 && (!progress || page.total !== progress.total || page.offset !== progress.nextOffset)) {
    return { complete: false, pending: progress };
  }
  return {
    complete: page.nextOffset === null,
    pending: page.nextOffset === null ? null : { total: page.total, nextOffset: page.nextOffset },
  };
}
