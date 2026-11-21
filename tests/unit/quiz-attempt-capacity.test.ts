import { afterAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { quizTemplates, studentQuizAttempts, courses, user } from "@/db/schema";
import { hasQuizAttemptCapacity } from "@/lib/quiz/attempt-capacity";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
afterAll(() => client.close());

test("quiz capacity follows the attempt from reservation to completion", async () => {
  const studentId = "attempt-capacity-student";
  const courseId = "attempt-capacity-course";
  const templateId = "attempt-capacity-quiz";
  await testDb.insert(user).values({ id: studentId, name: "Fixture", email: "attempt-capacity@example.invalid" });
  await testDb.insert(courses).values({ id: courseId, title: "Fixture", category: "Matematika" });
  await testDb.insert(quizTemplates).values({ id: templateId, courseId, title: "Fixture", category: "chapter", selectionRules: {}, maxAttempts: 1 });
  const attempt = { studentId, templateId, questionsSnapshot: [] };

  await testDb.transaction(async (tx) => {
    // PGlite and the application PostgreSQL driver expose the same query methods.
    const dbTx = tx as unknown as Parameters<typeof hasQuizAttemptCapacity>[0];
    await tx.insert(studentQuizAttempts).values({ ...attempt, id: "old-draft", status: "abandoned" });
    expect(await hasQuizAttemptCapacity(dbTx, studentId, templateId, true)).toBe(true);

    await tx.insert(studentQuizAttempts).values({ ...attempt, id: "active-draft", status: "in_progress" });
    expect(await hasQuizAttemptCapacity(dbTx, studentId, templateId, true)).toBe(false);
    expect(await hasQuizAttemptCapacity(dbTx, studentId, templateId, false)).toBe(true);
    expect(await hasQuizAttemptCapacity(dbTx, "other-student", templateId, true)).toBe(true);

    await tx.update(studentQuizAttempts).set({ status: "completed" }).where(eq(studentQuizAttempts.id, "active-draft"));
    expect(await hasQuizAttemptCapacity(dbTx, studentId, templateId, true)).toBe(false);
    expect(await hasQuizAttemptCapacity(dbTx, studentId, templateId, false)).toBe(false);

    await tx.update(quizTemplates).set({ maxAttempts: null }).where(eq(quizTemplates.id, templateId));
    expect(await hasQuizAttemptCapacity(dbTx, studentId, templateId, true)).toBe(true);
  });
});
