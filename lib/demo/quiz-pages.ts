import type { DemoExperience, DemoQuizQuestion, DemoProductSelection } from "@/app/(marketing)/demo/demo-data";
export type DemoQuizPage = { offset: number; questions: DemoQuizQuestion[]; token: string };
export async function collectDemoQuizPages(initial: DemoExperience, load: (courseId: string, selection: DemoProductSelection) => Promise<DemoExperience | null>): Promise<DemoQuizPage[] | null> {
 const pages: DemoQuizPage[] = [];
 const ids = new Set<string>();
 const total = initial.content.collections.quiz.total;
 if (initial.content.course.id !== initial.snapshot.courseId) return null;
 if (!Number.isSafeInteger(total) || total < 1 || total > 1000) return null;
 for (let offset = 0; offset < total; offset += 3) {
   const item = initial.content.collections.quiz.offset === offset ? initial : await load(initial.snapshot.courseId, { quizOffset: offset });
   if (!item || item.snapshot.courseId !== initial.snapshot.courseId || item.content.course.id !== initial.snapshot.courseId || item.snapshot.revision !== initial.snapshot.revision || item.snapshot.contentPolicy !== "free-first-chapter" || item.content.collections.quiz.pageSize !== 3 || item.content.collections.quiz.nextOffset !== (offset + 3 < total ? offset + 3 : null) || item.content.collections.quiz.total !== total || item.content.collections.quiz.offset !== offset || item.content.quiz.length !== Math.min(3, total - offset) || !item.content.quizSetToken) return null;
   for (const question of item.content.quiz) { if (ids.has(question.id)) return null; ids.add(question.id); }
   pages.push({ offset, questions: item.content.quiz, token: item.content.quizSetToken });
 }
 return pages;
}
