/**
 * E2: seed + verify quiz remediation builder (mastery delta + root cause + estimate).
 * Reuses the E0 fabric, so run after seed-embed has created the graph is NOT required;
 * this script builds its own course. Run: bunx tsx scripts/seed-remediation.ts
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
  knowledgeRelationships,
  studentConceptMastery,
  quizTemplates,
  studentQuizAttempts,
  attemptFeedback,
  user as userTable,
} from "../db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { buildRemediation } from "../lib/remediation";
import { invalidateLearningContext } from "../lib/learning-context";

const COURSE_ID = "remed-test-course";
const STUDENT_ID = "remed-test-student";
const MTD_ID = "remed-test-mtd";
const CHAPTER_ID = "remed-test-chapter";
const TEMPLATE_ID = "remed-template";
const ATTEMPT_ID = "remed-attempt-1";

// Chain: Aljabar -> Antiturunan -> Integral Tentu. Mastery low downstream.
const CONCEPTS = [
  { key: "ALG", name: "Aljabar Dasar", slug: "remed-aljabar", prereq: null, after: 31 },
  { key: "ANT", name: "Antiturunan", slug: "remed-antiturunan", prereq: "ALG", after: 22 },
  { key: "INT", name: "Integral Tentu", slug: "remed-integral", prereq: "ANT", after: 54 },
];

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

async function main() {
  console.log("E2 remediation seed starting...");

  await db.delete(knowledgeObjects).where(eq(knowledgeObjects.courseId, COURSE_ID));
  await db.delete(studentConceptMastery).where(eq(studentConceptMastery.courseId, COURSE_ID));
  await db.delete(attemptFeedback).where(eq(attemptFeedback.attemptId, ATTEMPT_ID));
  await db.delete(studentQuizAttempts).where(eq(studentQuizAttempts.id, ATTEMPT_ID));

  await db.insert(userTable).values({ id: STUDENT_ID, name: "Remed Student", email: "remed@zyx.local", emailVerified: true, role: "student" }).onConflictDoNothing();
  await db.insert(courses).values({ id: COURSE_ID, title: "Remed Test", category: "Test" as never, description: "E2" }).onConflictDoNothing();
  await db.insert(masterTeachingDocuments).values({ id: MTD_ID, courseId: COURSE_ID, title: "MTD", markdownContent: "# t", status: "active", createdById: STUDENT_ID }).onConflictDoNothing();
  await db.insert(chapters).values({ id: CHAPTER_ID, courseId: COURSE_ID, title: "Ch", orderIndex: 1, status: "published" }).onConflictDoNothing();

  const firstKoByConcept = new Map<string, string>();
  for (const c of CONCEPTS) {
    const conceptId = `remed-concept-${c.key}`;
    await db.insert(concepts).values({ id: conceptId, canonicalSlug: c.slug, isVerified: true }).onConflictDoNothing();
    await db.insert(conceptLocalizations).values({ id: `${conceptId}-loc`, conceptId, lang: "id", displayName: c.name, aliases: [] }).onConflictDoNothing();
    const koId = `remed-ko-${c.key}`;
    firstKoByConcept.set(c.name, koId);
    await db.insert(knowledgeObjects).values({
      id: koId, courseId: COURSE_ID, mtdId: MTD_ID, chapterId: CHAPTER_ID, conceptId,
      learningOrder: 1, title: `${c.name} definisi`, conceptName: c.name,
      content: `Konten ${c.name}`, type: "definition", difficulty: "medium",
      bloomLevel: "understand", importance: "high", metadata: {}, status: "active",
    });
  }
  for (const c of CONCEPTS) {
    if (!c.prereq) continue;
    const prereq = CONCEPTS.find((x) => x.key === c.prereq)!;
    await db.insert(knowledgeRelationships).values({
      id: `remed-rel-${c.prereq}-${c.key}`,
      sourceKoId: firstKoByConcept.get(prereq.name)!,
      targetKoId: firstKoByConcept.get(c.name)!,
      type: "prerequisite",
    });
  }

  // Current ("after") mastery rows.
  const now = new Date();
  for (const c of CONCEPTS) {
    await db.insert(studentConceptMastery).values({
      id: randomUUID(), studentId: STUDENT_ID, courseId: COURSE_ID, conceptName: c.name,
      masteryScore: c.after, confidence: 60, evidenceCount: 3, trend: "declining", lastEvidenceAt: now, updatedAt: now,
    }).onConflictDoUpdate({
      target: [studentConceptMastery.studentId, studentConceptMastery.courseId, studentConceptMastery.conceptName],
      set: { masteryScore: c.after, updatedAt: now },
    });
  }

  // Attempt with masteryBefore (higher than after to produce a negative delta).
  await db.insert(quizTemplates).values({ id: TEMPLATE_ID, courseId: COURSE_ID, title: "Remed quiz", category: "daily", visibility: "free", selectionRules: {}, status: "published" }).onConflictDoNothing();
  await db.insert(studentQuizAttempts).values({
    id: ATTEMPT_ID, studentId: STUDENT_ID, templateId: TEMPLATE_ID, status: "completed", score: 40,
    questionsSnapshot: [], answersSnapshot: {},
    masteryBefore: { "Integral Tentu": 82, "Antiturunan": 30, "Aljabar Dasar": 35 },
    weakAreas: ["Integral Tentu", "Antiturunan"],
    submittedAt: now,
  });
  // One deterministic misconception feedback row.
  await db.insert(attemptFeedback).values({
    id: randomUUID(), attemptId: ATTEMPT_ID, questionIndex: 0,
    payload: { misconceptionName: "Lupa konstanta integrasi", whyWrong: "Konstanta C hilang.", correctApproach: [], reviewHref: `/courses/${COURSE_ID}` },
  }).onConflictDoNothing();

  invalidateLearningContext(COURSE_ID);
  const rem = await buildRemediation(
    { id: ATTEMPT_ID, studentId: STUDENT_ID, masteryBefore: { "Integral Tentu": 82, "Antiturunan": 30, "Aljabar Dasar": 35 }, weakAreas: ["Integral Tentu", "Antiturunan"] },
    COURSE_ID,
  );

  console.log("\nE2.1 mastery delta");
  const intg = rem.concepts.find((c) => c.conceptName === "Integral Tentu");
  check("Integral before 82, after 54, delta -28", intg?.before === 82 && intg?.after === 54 && intg?.delta === -28);

  console.log("\nE2.2 root cause ordering");
  const rcInt = rem.rootCauses.find((r) => r.conceptName === "Integral Tentu");
  // Integral(54<60) -> prereq Antiturunan(22<40) blocks. Antiturunan(22<60) -> prereq Aljabar(31<40) blocks.
  check("Integral root cause includes Antiturunan", !!rcInt && rcInt.blockedBy.some((b) => b.conceptName === "Antiturunan" && b.mastery === 22));
  const rcAnt = rem.rootCauses.find((r) => r.conceptName === "Antiturunan");
  check("Antiturunan root cause includes Aljabar Dasar (31)", !!rcAnt && rcAnt.blockedBy.some((b) => b.conceptName === "Aljabar Dasar" && b.mastery === 31));
  check("blockedBy lists only prereqs under 40", rem.rootCauses.every((rc) => rc.blockedBy.every((b) => b.mastery < 40)));

  console.log("\nE2.3 time estimate formula");
  const totalBlocked = rem.rootCauses.reduce((s, rc) => s + rc.blockedBy.length, 0);
  const weakCount = rem.concepts.filter((c) => c.after < 60).length;
  const expected = totalBlocked * 4 + weakCount * 3;
  check(`estimate equals blocked*4 + weak*3 (${expected})`, rem.estimatedMinutes === expected);

  console.log("\nE2.4 misconception card from E1 payload");
  check("misconception card present with KO name", rem.misconceptions.some((m) => m.misconceptionName === "Lupa konstanta integrasi"));

  console.log(`\nE2 result: ${pass} pass, ${fail} fail.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => { console.error("seed-remediation failed:", err); process.exit(1); });
