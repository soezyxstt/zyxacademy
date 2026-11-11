import type { DemoExperience, DemoQuizQuestion, DemoProductSelection } from "@/app/(marketing)/demo/demo-data";
export type DemoQuizPage = { offset: number; questions: DemoQuizQuestion[]; token: string };
export async function collectDemoQuizPages(initial: DemoExperience, load: (courseId: string, selection: DemoProductSelection) => Promise<DemoExperience | null>): Promise<DemoQuizPage[] | null> {
 const pages: DemoQuizPage[] = [];
 const ids = new Set<string>();
 const total = initial.content.collections.quiz.total;
 if (initial.content.course.id !== initial.snapshot.courseId) return null;
 if (!Number.isSafeInteger(total) || total < 1 || total > 1000) return null;
 // The total and fixed page size determine offsets. Validate every returned cursor
 // and scope in order before exposing any of the assembled pages.
 for (let start = 0; start < total; start += 6) {
   const offsets = [start, start + 3].filter(offset => offset < total);
   const batch = await Promise.all(offsets.map(offset => initial.content.collections.quiz.offset === offset ? initial : load(initial.snapshot.courseId, { quizOffset: offset })));
   for (const [index, item] of batch.entries()) {
     const offset = offsets[index];
     if (!item || item.snapshot.courseId !== initial.snapshot.courseId || item.content.course.id !== initial.snapshot.courseId || item.snapshot.revision !== initial.snapshot.revision || item.snapshot.contentPolicy !== "free-first-chapter" || item.content.collections.quiz.pageSize !== 3 || item.content.collections.quiz.nextOffset !== (offset + 3 < total ? offset + 3 : null) || item.content.collections.quiz.total !== total || item.content.collections.quiz.offset !== offset || item.content.quiz.length !== Math.min(3, total - offset) || !item.content.quizSetToken) return null;
     for (const question of item.content.quiz) { if (ids.has(question.id)) return null; ids.add(question.id); }
     pages.push({ offset, questions: item.content.quiz, token: item.content.quizSetToken });
   }
 }
 return pages;
}
