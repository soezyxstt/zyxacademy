import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db/index";
import {
  user as userTable,
  courses,
  learningEvents,
  studentQuizAttempts,
  studentConceptMasteryHistory,
  studentStreaks,
  weeklyReflections,
  quizTemplates,
} from "../db/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { computeWeeklyReflection, getPreviousWeekRange, formatDateStr } from "../lib/reflection-service";

async function main() {
  console.log("Seeding weekly learning reflection data...");

  const email = "demo-student-01@seed.local";
  let [student] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);

  if (!student) {
    const newId = randomUUID();
    await db.insert(userTable).values({
      id: newId,
      name: "Demo Student 01",
      email,
      emailVerified: true,
      role: "student",
    });
    [student] = await db.select().from(userTable).where(eq(userTable.email, email)).limit(1);
  }

  const [course] = await db.select().from(courses).limit(1);
  if (!course) {
    console.error("No course found. Run seed-demo-cohort.ts first.");
    process.exit(1);
  }

  const now = new Date();
  const { monday, sunday } = getPreviousWeekRange(now);
  const sundayStr = formatDateStr(sunday);

  const dayBeforeMonday = new Date(monday);
  dayBeforeMonday.setDate(monday.getDate() - 1);
  const dayBeforeMondayStr = formatDateStr(dayBeforeMonday);

  // Clear existing seeded data for the test week
  await db.delete(weeklyReflections).where(eq(weeklyReflections.studentId, student.id));
  await db.delete(learningEvents).where(
    and(
      eq(learningEvents.studentId, student.id),
      gte(learningEvents.createdAt, monday),
      lte(learningEvents.createdAt, sunday)
    )
  );
  await db.delete(studentQuizAttempts).where(
    and(
      eq(studentQuizAttempts.studentId, student.id),
      gte(studentQuizAttempts.submittedAt, monday),
      lte(studentQuizAttempts.submittedAt, sunday)
    )
  );
  await db.delete(studentConceptMasteryHistory).where(
    and(
      eq(studentConceptMasteryHistory.studentId, student.id),
      eq(studentConceptMasteryHistory.conceptName, "Konsep Lemah Alpha"),
      inArray(studentConceptMasteryHistory.snapshotDate, [sundayStr, dayBeforeMondayStr])
    )
  );

  // Find or create a quiz template
  const [template] = await db.select().from(quizTemplates).limit(1);
  let templateId = template?.id;
  if (!templateId) {
    templateId = randomUUID();
    await db.insert(quizTemplates).values({
      id: templateId,
      courseId: course.id,
      title: "Seeded Quiz Template",
      category: "weekly",
      selectionRules: [],
      status: "published",
    });
  }

  // 1. Seed 4 completed quiz attempts
  for (let i = 0; i < 4; i++) {
    const submittedAt = new Date(monday);
    submittedAt.setDate(monday.getDate() + 2); // Wednesday
    submittedAt.setHours(10 + i, 0, 0, 0);

    await db.insert(studentQuizAttempts).values({
      id: randomUUID(),
      studentId: student.id,
      templateId: templateId,
      score: 80,
      status: "completed",
      questionsSnapshot: [],
      answersSnapshot: {},
      startedAt: new Date(submittedAt.getTime() - 30 * 60 * 1000),
      submittedAt,
    });
  }

  // 2. Seed 82 flashcard review learning events
  const flashcardReviews: (typeof learningEvents.$inferInsert)[] = [];
  for (let i = 0; i < 82; i++) {
    const createdAt = new Date(monday);
    createdAt.setDate(monday.getDate() + 3); // Thursday
    createdAt.setHours(12, 0, i, 0);

    flashcardReviews.push({
      id: randomUUID(),
      studentId: student.id,
      courseId: course.id,
      eventType: "flashcard_review",
      conceptName: "Konsep Lemah Alpha",
      correctness: 1,
      weight: 1,
      createdAt,
    });
  }
  for (let i = 0; i < flashcardReviews.length; i += 50) {
    await db.insert(learningEvents).values(flashcardReviews.slice(i, i + 50));
  }

  // 3. Seed 6 material completion learning events
  const moduleCompletions: (typeof learningEvents.$inferInsert)[] = [];
  for (let i = 0; i < 6; i++) {
    const createdAt = new Date(monday);
    createdAt.setDate(monday.getDate() + 4); // Friday
    createdAt.setHours(15, i, 0, 0);

    moduleCompletions.push({
      id: randomUUID(),
      studentId: student.id,
      courseId: course.id,
      eventType: "material_completed",
      conceptName: null,
      correctness: null,
      weight: 1,
      createdAt,
    });
  }
  await db.insert(learningEvents).values(moduleCompletions);

  // 4. Seed mastery history snapshots (June 7 = 21, June 1 = 10 -> growth = +11)
  await db.insert(studentConceptMasteryHistory).values([
    {
      id: randomUUID(),
      studentId: student.id,
      courseId: course.id,
      conceptName: "Konsep Lemah Alpha",
      masteryScore: 21,
      confidence: 80,
      snapshotDate: sundayStr,
    },
    {
      id: randomUUID(),
      studentId: student.id,
      courseId: course.id,
      conceptName: "Konsep Lemah Alpha",
      masteryScore: 10,
      confidence: 80,
      snapshotDate: dayBeforeMondayStr,
    },
  ]);

  // 5. Seed streak data
  await db.delete(studentStreaks).where(eq(studentStreaks.studentId, student.id));
  await db.insert(studentStreaks).values({
    studentId: student.id,
    currentStreak: 5,
    longestStreak: 10,
    lastActiveDate: sundayStr,
  });

  console.log("Seeding complete. Triggering aggregation math validation...");

  // Run weekly reflection computation
  const reflection = await computeWeeklyReflection(student.id, now);
  if (!reflection) {
    throw new Error("Weekly reflection failed to compute.");
  }

  const { completed, masteryGrowth, mostImproved } = reflection.payload;
  console.log("Seeded reflection payload:", reflection.payload);

  const quizzesCorrect = completed.quizzes === 4;
  const flashcardsCorrect = completed.flashcards === 82;
  const modulesCorrect = completed.modules === 6;
  const growthCorrect = masteryGrowth === 11;
  const conceptCorrect = mostImproved === "Konsep Lemah Alpha";

  if (quizzesCorrect && flashcardsCorrect && modulesCorrect && growthCorrect && conceptCorrect) {
    console.log("SUCCESS: Payload matches exactly {4 quizzes, 82 reviews, 6 modules, +11 mastery, 'Konsep Lemah Alpha'}");
  } else {
    console.error("FAILURE: Payload does not match target specifications:");
    console.error(`- Quizzes: expected 4, got ${completed.quizzes}`);
    console.error(`- Flashcards: expected 82, got ${completed.flashcards}`);
    console.error(`- Modules: expected 6, got ${completed.modules}`);
    console.error(`- Growth: expected 11, got ${masteryGrowth}`);
    console.error(`- Concept: expected 'Konsep Lemah Alpha', got '${mostImproved}'`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error running seed script:", err);
  process.exit(1);
});
