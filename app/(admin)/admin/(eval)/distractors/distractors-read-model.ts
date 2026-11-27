import "server-only";
import { db } from "@/db";
import { recordAuthorizedGlobalDisclosures } from "@/lib/gamification/question-exposure";
import { aiQuestionBank, courses, questionOptionStats } from "@/db/schema";
import { inArray } from "drizzle-orm";

interface DistractorEntry {
  optionIndex: number;
  kind: string;
  misconceptionKoId: string | null;
  label: string;
}

const QUESTION_TOTAL_INDEX = -1;

export async function readDistractors(userId: string) {
  const stats = await db.select().from(questionOptionStats);

  // Group counters by question.
  const byQuestion = new Map<string, { total: number; counts: Map<number, number> }>();
  for (const row of stats) {
    const entry = byQuestion.get(row.questionId) ?? { total: 0, counts: new Map() };
    if (row.optionIndex === QUESTION_TOTAL_INDEX) {
      entry.total = row.totalAttempts;
    } else {
      entry.counts.set(row.optionIndex, row.selectedCount);
    }
    byQuestion.set(row.questionId, entry);
  }

  const questionIds = [...byQuestion.keys()];
  const questions = questionIds.length
    ? await db.select().from(aiQuestionBank).where(inArray(aiQuestionBank.id, questionIds))
    : [];
  const allCourses = await db.select({ id: courses.id, title: courses.title }).from(courses);
  const courseMap = Object.fromEntries(allCourses.map((c) => [c.id, c.title]));
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  // Order by most-answered, drop questions with no attempts yet.
  const ordered = questionIds
    .map((id) => ({ id, agg: byQuestion.get(id)! }))
    .filter((x) => x.agg.total > 0 && questionMap.has(x.id))
    .sort((a, b) => b.agg.total - a.agg.total);

  const disclosedIds = new Set(ordered.map(item => item.id));
  await db.transaction(tx => recordAuthorizedGlobalDisclosures(tx, { userId, questions: questions.filter(q => disclosedIds.has(q.id)).map(q => ({ questionId: q.id, courseId: q.courseId })), requestId: crypto.randomUUID() }));

  return ordered.map(({ id, agg }) => {
    const question = questionMap.get(id)!;
    const options = (question.options as string[]) ?? [];
    const correct = new Set((question.correctIndices as number[]) ?? []);
    const distractors = (question.distractorMap as DistractorEntry[] | null) ?? [];
    const labels = new Map(distractors.map((entry) => [entry.optionIndex, entry]));
    return {
      id,
      prompt: question.prompt,
      course: courseMap[question.courseId] ?? question.courseId,
      total: agg.total,
      options: options.map((text, index) => {
        const tag = labels.get(index);
        const isCorrect = correct.has(index);
        return {
          text,
          percentage: Math.round(((agg.counts.get(index) ?? 0) / agg.total) * 100),
          isCorrect,
          misconception: !isCorrect && tag?.kind === "misconception" ? tag.label : null,
        };
      }),
    };
  });
}
