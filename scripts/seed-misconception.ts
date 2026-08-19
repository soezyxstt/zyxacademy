/**
 * E1: seed + verify distractor mapping, analytics, and deterministic feedback.
 * Run with: bunx tsx scripts/seed-misconception.ts
 */
import "dotenv/config";
import { db } from "../lib/db/index";
import {
  courses,
  masterTeachingDocuments,
  chapters,
  concepts,
  conceptLocalizations,
  knowledgeObjects,
  aiQuestionBank,
  quizTemplates,
  studentQuizAttempts,
  attemptFeedback,
  questionOptionStats,
  user as userTable,
} from "../db/schema";
import { eq } from "drizzle-orm";
import { buildDistractorMap, validateDistractorMap } from "../lib/distractor-mapper";
import { recordQuestionOptionStats } from "../lib/option-stats";
import { generateMistakeFeedback } from "../lib/mistake-feedback";
import { generateQuestionsForKO } from "../lib/question-generator";

const COURSE_ID = "miscon-test-course";
const STUDENT_ID = "miscon-test-student";
const MTD_ID = "miscon-test-mtd";
const CHAPTER_ID = "miscon-test-chapter";
const CONCEPT_ID = "miscon-concept-sqrt";
const CONCEPT_NAME = "Akar Kuadrat";
const MISCON_KO_ID = "miscon-ko-sqrt";
const DEF_KO_ID = "miscon-ko-def";
const TEMPLATE_ID = "miscon-template";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass += 1;
    console.log(`  PASS ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}`);
  }
}

async function setup() {
  await db.delete(aiQuestionBank).where(eq(aiQuestionBank.courseId, COURSE_ID));
  await db.delete(knowledgeObjects).where(eq(knowledgeObjects.courseId, COURSE_ID));
  await db.delete(questionOptionStats).where(eq(questionOptionStats.courseId, COURSE_ID));

  await db.insert(userTable).values({ id: STUDENT_ID, name: "Miscon Student", email: "miscon@zyx.local", emailVerified: true, role: "student" }).onConflictDoNothing();
  await db.insert(courses).values({ id: COURSE_ID, title: "Miscon Test", category: "Test" as never, description: "E1" }).onConflictDoNothing();
  await db.insert(masterTeachingDocuments).values({ id: MTD_ID, courseId: COURSE_ID, title: "MTD", markdownContent: "# t", status: "active", createdById: STUDENT_ID }).onConflictDoNothing();
  await db.insert(chapters).values({ id: CHAPTER_ID, courseId: COURSE_ID, title: "Ch", orderIndex: 1, status: "published" }).onConflictDoNothing();
  await db.insert(concepts).values({ id: CONCEPT_ID, canonicalSlug: "miscon-test-akar-kuadrat", isVerified: true }).onConflictDoNothing();
  await db.insert(conceptLocalizations).values({ id: `${CONCEPT_ID}-loc`, conceptId: CONCEPT_ID, lang: "id", displayName: CONCEPT_NAME, aliases: [] }).onConflictDoNothing();

  // Misconception KO: text the wrong distractor should match.
  await db.insert(knowledgeObjects).values({
    id: MISCON_KO_ID,
    courseId: COURSE_ID,
    mtdId: MTD_ID,
    chapterId: CHAPTER_ID,
    conceptId: CONCEPT_ID,
    learningOrder: 2,
    title: "Miskonsepsi akar kuadrat sama dengan x",
    conceptName: CONCEPT_NAME,
    content: "Banyak siswa mengira akar kuadrat dari x kuadrat sama dengan x. Padahal hasilnya adalah nilai mutlak x.",
    type: "misconception",
    difficulty: "medium",
    bloomLevel: "analyze",
    importance: "high",
    metadata: {},
    status: "active",
  });
  // A definition KO so mock question generation has a source.
  await db.insert(knowledgeObjects).values({
    id: DEF_KO_ID,
    courseId: COURSE_ID,
    mtdId: MTD_ID,
    chapterId: CHAPTER_ID,
    conceptId: CONCEPT_ID,
    learningOrder: 1,
    title: "Definisi akar kuadrat",
    conceptName: CONCEPT_NAME,
    content: "Akar kuadrat dari x kuadrat adalah nilai mutlak dari x.",
    type: "definition",
    difficulty: "easy",
    bloomLevel: "understand",
    importance: "high",
    metadata: {},
    status: "active",
  });
}

async function main() {
  console.log("E1 misconception seed starting...");
  console.log("Misconception feedback policy: always-on");
  await setup();

  // ── E1.1 buildDistractorMap + validateDistractorMap ──────────────────────────
  console.log("\nE1.1 distractor map build + validate");
  const miscKO = [{ id: MISCON_KO_ID, title: "Miskonsepsi akar kuadrat sama dengan x", content: "akar kuadrat dari x kuadrat sama dengan x nilai mutlak" }];
  const map = buildDistractorMap({
    options: [
      "Akar kuadrat dari x kuadrat adalah nilai mutlak x", // correct (index 0)
      "Akar kuadrat dari x kuadrat sama dengan x", // misconception distractor (index 1)
      "Hasilnya selalu negatif", // index 2
      "Tidak terdefinisi", // index 3
    ],
    correctIndices: [0],
    blueprint: { distractorStrategy: "related concept vocabulary alternatives" },
    misconceptionKOs: miscKO,
  });
  const tagged = map.find((e) => e.optionIndex === 1);
  check("3 entries for 3 wrong options", map.length === 3);
  check("option 1 tagged as misconception", tagged?.kind === "misconception" && tagged?.misconceptionKoId === MISCON_KO_ID);
  check("valid map passes validation", validateDistractorMap(map, 4, [0]).length === 0);
  check("malformed (wrong length) rejected", validateDistractorMap([], 4, [0]).length > 0);
  check("malformed (maps correct index) rejected", validateDistractorMap([{ optionIndex: 0, kind: "none", misconceptionKoId: null, label: "x" }], 4, [0]).length > 0);
  check("malformed (misconception without koId) rejected", validateDistractorMap([{ optionIndex: 1, kind: "misconception", misconceptionKoId: null, label: "x" }, { optionIndex: 2, kind: "none", misconceptionKoId: null, label: "y" }, { optionIndex: 3, kind: "none", misconceptionKoId: null, label: "z" }], 4, [0]).length > 0);

  // End-to-end: mock generation persists a valid distractor map.
  const gen = await generateQuestionsForKO(DEF_KO_ID, true);
  const genRows = await db.select().from(aiQuestionBank).where(eq(aiQuestionBank.knowledgeObjectId, DEF_KO_ID));
  const genRow = genRows[0];
  const persisted = (genRow?.distractorMap as unknown[]) ?? null;
  check("mock generation inserted a question", gen.success && genRows.length >= 1);
  check("persisted distractorMap is a valid array", Array.isArray(persisted) && validateDistractorMap(persisted, (genRow.options as string[]).length, genRow.correctIndices as number[]).length === 0);

  // ── E1.4 option stats analytics ──────────────────────────────────────────────
  console.log("\nE1.4 distractor analytics counters");
  const Q_ID = "miscon-q-analytics";
  await db.insert(aiQuestionBank).values({
    id: Q_ID,
    courseId: COURSE_ID,
    knowledgeObjectId: MISCON_KO_ID,
    sourceMtdId: MTD_ID,
    difficulty: "medium",
    questionType: "multiple_choice",
    tags: [],
    prompt: "Pilih pernyataan yang benar",
    options: ["A benar", "B miskonsepsi", "C", "D"],
    correctIndices: [0],
    distractorMap: [
      { optionIndex: 1, kind: "misconception", misconceptionKoId: MISCON_KO_ID, label: "Miskonsepsi akar kuadrat sama dengan x" },
      { optionIndex: 2, kind: "none", misconceptionKoId: null, label: "Pilihan kurang tepat" },
      { optionIndex: 3, kind: "none", misconceptionKoId: null, label: "Pilihan kurang tepat" },
    ],
    explanation: "x",
    reviewStatus: "generated",
  }).onConflictDoNothing();

  // Simulate 10 attempts: 7 pick option 1 (the misconception), 2 pick option 0, 1 picks option 2.
  for (let i = 0; i < 10; i++) {
    const choice = i < 7 ? 1 : i < 9 ? 0 : 2;
    await recordQuestionOptionStats(COURSE_ID, [{ questionId: Q_ID, selectedOptions: [choice] }]);
  }
  const statRows = await db.select().from(questionOptionStats).where(eq(questionOptionStats.questionId, Q_ID));
  const byIdx = new Map(statRows.map((r) => [r.optionIndex, r]));
  const total = byIdx.get(-1)?.totalAttempts ?? 0;
  check("total attempts denominator is 10", total === 10);
  check("option 1 selected 7 times (70%)", (byIdx.get(1)?.selectedCount ?? 0) === 7);
  check("option 0 selected 2 times", (byIdx.get(0)?.selectedCount ?? 0) === 2);
  check("option 2 selected 1 time", (byIdx.get(2)?.selectedCount ?? 0) === 1);

  // ── E1.2 deterministic feedback ─────────────────────────────────────────────
  console.log("\nE1.2 deterministic misconception feedback");
  await db.insert(quizTemplates).values({
    id: TEMPLATE_ID,
    courseId: COURSE_ID,
    title: "Miscon quiz",
    category: "daily",
    visibility: "free",
    selectionRules: {},
    status: "published",
  }).onConflictDoNothing();

  const ATTEMPT_ID = "miscon-attempt-1";
  await db.delete(attemptFeedback).where(eq(attemptFeedback.attemptId, ATTEMPT_ID));
  await db.delete(studentQuizAttempts).where(eq(studentQuizAttempts.id, ATTEMPT_ID));
  await db.insert(studentQuizAttempts).values({
    id: ATTEMPT_ID,
    studentId: STUDENT_ID,
    templateId: TEMPLATE_ID,
    status: "completed",
    score: 0,
    questionsSnapshot: [{ id: Q_ID, correct_indices: [0] }],
    answersSnapshot: { [Q_ID]: [1] }, // picked the misconception distractor
    submittedAt: new Date(),
  });

  await generateMistakeFeedback(ATTEMPT_ID);
  const fb = await db.select().from(attemptFeedback).where(eq(attemptFeedback.attemptId, ATTEMPT_ID));
  const payload = fb[0]?.payload as { whyWrong?: string; misconceptionName?: string } | undefined;
  const miscKoRow = await db.select().from(knowledgeObjects).where(eq(knowledgeObjects.id, MISCON_KO_ID));
  const expectedName = miscKoRow[0]?.title;
  check("feedback row created", fb.length === 1);
  check("misconceptionName equals the KO title (deterministic, no LLM)", payload?.misconceptionName === expectedName);
  check("whyWrong drawn from the KO content", typeof payload?.whyWrong === "string" && payload!.whyWrong!.toLowerCase().includes("nilai mutlak"));

  console.log(`\nE1 result: ${pass} pass, ${fail} fail.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("seed-misconception failed:", err);
  process.exit(1);
});
