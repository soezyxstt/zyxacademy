/**
 * Seed and verification script for Phase 5 Study Paths.
 * Run with: bunx tsx scripts/seed-paths.ts
 */
import 'dotenv/config';
import { randomUUID } from "node:crypto";
import { db } from "../db/index";
import {
  courses,
  chapters,
  knowledgeObjects,
  knowledgeRelationships,
  studentConceptMastery,
  user as userTable,
  enrollments,
  quizTemplates,
  websiteMaterials,
  studyPaths,
  masterTeachingDocuments,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { computeStudyPath, recomputeStudyPath } from "../lib/study-path-service";
import { getOrBuildTodayRecommendation } from "../lib/recommendation-service";

async function clearTestData(courseId: string) {
  // Clear any existing test data to ensure clean run
  await db.delete(studyPaths).where(eq(studyPaths.courseId, courseId));
  await db.delete(studentConceptMastery).where(eq(studentConceptMastery.courseId, courseId));
  await db.delete(enrollments).where(eq(enrollments.courseId, courseId));
  await db.delete(quizTemplates).where(eq(quizTemplates.courseId, courseId));
  await db.delete(knowledgeRelationships);
  await db.delete(knowledgeObjects).where(eq(knowledgeObjects.courseId, courseId));
  await db.delete(masterTeachingDocuments).where(eq(masterTeachingDocuments.courseId, courseId));
  await db.delete(websiteMaterials).where(eq(websiteMaterials.courseId, courseId));
  await db.delete(chapters).where(eq(chapters.courseId, courseId));
}

async function main() {
  console.log("=== Starting Study Path Seeding & Verification ===");

  const courseId = "calc-test-p5";
  const studentAId = "student-p5-a";
  const studentBId = "student-p5-b";

  // 1. Ensure test users exist
  const testUsers = [
    { id: studentAId, name: "Student A", email: "student.a@zyx.edu" },
    { id: studentBId, name: "Student B", email: "student.b@zyx.edu" },
    { id: "student-soundness-test", name: "Student Soundness Test", email: "student.soundness@zyx.edu" },
    { id: "student-speed-test", name: "Student Speed Test", email: "student.speed@zyx.edu" },
  ];

  for (const u of testUsers) {
    const existing = await db.query.user.findFirst({ where: eq(userTable.id, u.id) });
    if (!existing) {
      await db.insert(userTable).values({
        id: u.id,
        name: u.name,
        email: u.email,
        emailVerified: true,
        role: "student",
      });
    }
  }

  // Ensure test course exists
  const existingCourse = await db.query.courses.findFirst({ where: eq(courses.id, courseId) });
  if (!existingCourse) {
    await db.insert(courses).values({
      id: courseId,
      title: "Kalkulus P5 Test",
      category: "TPB",
      description: "Test course for personalized study paths",
    });
  }

  // Ensure enrollments exist
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  for (const u of testUsers) {
    const existing = await db.query.enrollments.findFirst({
      where: and(eq(enrollments.userId, u.id), eq(enrollments.courseId, courseId)),
    });
    if (!existing) {
      await db.insert(enrollments).values({
        id: `enroll-${u.id}-${courseId}`,
        userId: u.id,
        courseId: courseId,
        expiresAt,
      });
    }
  }

  console.log("Cleaning old test data...");
  await clearTestData(courseId);

  // 2. Seed Chapters
  console.log("Seeding chapters...");
  const chap1Id = "ch-1";
  const chap2Id = "ch-2";
  const chap3Id = "ch-3";

  await db.insert(chapters).values([
    { id: chap1Id, courseId, title: "Chapter 1: Limit", orderIndex: 1, status: "published" },
    { id: chap2Id, courseId, title: "Chapter 2: Turunan", orderIndex: 2, status: "published" },
    { id: chap3Id, courseId, title: "Chapter 3: Aplikasi", orderIndex: 3, status: "published" },
  ]);

  // Ensure master teaching document exists
  const mtdId = "mtd-1";
  await db.insert(masterTeachingDocuments).values({
    id: mtdId,
    courseId,
    title: "Materi Test P5 MTD",
    markdownContent: "# Test MTD",
    version: 1,
    status: "active",
    createdById: studentAId,
  });

  // 3. Seed Knowledge Objects (KOs) for 6 concepts
  console.log("Seeding Knowledge Objects...");
  const koLimitId = "ko-limit";
  const koAsimtotId = "ko-asimtot";
  const koTurunanId = "ko-turunan";
  const koRantaiId = "ko-rantai";
  const koVolumesId = "ko-volumes";
  const koPartsId = "ko-parts";

  await db.insert(knowledgeObjects).values([
    {
      id: koLimitId,
      courseId,
      mtdId: "mtd-1",
      chapterId: chap1Id,
      conceptId: "c-limit",
      conceptName: "Limit",
      title: "Definisi Limit",
      content: "Content...",
      type: "definition",
      difficulty: "easy",
      bloomLevel: "remember",
      importance: "high",
      learningOrder: 1,
    },
    {
      id: koAsimtotId,
      courseId,
      mtdId: "mtd-1",
      chapterId: chap1Id,
      conceptId: "c-asimtot",
      conceptName: "Asimtot",
      title: "Asimtot Fungsi",
      content: "Content...",
      type: "definition",
      difficulty: "medium",
      bloomLevel: "understand",
      importance: "medium",
      learningOrder: 2,
    },
    {
      id: koTurunanId,
      courseId,
      mtdId: "mtd-1",
      chapterId: chap2Id,
      conceptId: "c-turunan",
      conceptName: "Turunan",
      title: "Turunan Dasar",
      content: "Content...",
      type: "definition",
      difficulty: "medium",
      bloomLevel: "apply",
      importance: "high",
      learningOrder: 1,
    },
    {
      id: koRantaiId,
      courseId,
      mtdId: "mtd-1",
      chapterId: chap2Id,
      conceptId: "c-rantai",
      conceptName: "Aturan Rantai",
      title: "Chain Rule",
      content: "Content...",
      type: "definition",
      difficulty: "medium",
      bloomLevel: "apply",
      importance: "medium",
      learningOrder: 2,
    },
    {
      id: koVolumesId,
      courseId,
      mtdId: "mtd-1",
      chapterId: chap3Id,
      conceptId: "c-volumes",
      conceptName: "Volumes",
      title: "Integral Volume",
      content: "Content...",
      type: "definition",
      difficulty: "hard",
      bloomLevel: "analyze",
      importance: "high",
      learningOrder: 1,
    },
    {
      id: koPartsId,
      courseId,
      mtdId: "mtd-1",
      chapterId: chap3Id,
      conceptId: "c-parts",
      conceptName: "Parts",
      title: "Integral Parsial",
      content: "Content...",
      type: "definition",
      difficulty: "hard",
      bloomLevel: "analyze",
      importance: "medium",
      learningOrder: 2,
    },
  ]);

  // Seed normal prerequisite relationships
  console.log("Seeding prerequisite edges...");
  await db.insert(knowledgeRelationships).values([
    { id: "rel-1", sourceKoId: koLimitId, targetKoId: koAsimtotId, type: "prerequisite" },
    { id: "rel-2", sourceKoId: koLimitId, targetKoId: koTurunanId, type: "prerequisite" },
    { id: "rel-3", sourceKoId: koTurunanId, targetKoId: koRantaiId, type: "prerequisite" },
    { id: "rel-4", sourceKoId: koTurunanId, targetKoId: koVolumesId, type: "prerequisite" },
    { id: "rel-5", sourceKoId: koTurunanId, targetKoId: koPartsId, type: "prerequisite" },
  ]);

  // Ensure test quiz template and website material exist for our course
  const quizId = "quiz-test-p5";
  const existingQuiz = await db.query.quizTemplates.findFirst({ where: eq(quizTemplates.id, quizId) });
  if (!existingQuiz) {
    await db.insert(quizTemplates).values({
      id: quizId,
      courseId,
      title: "Kuis Limit & Turunan P5",
      category: "weekly",
      visibility: "free",
      selectionRules: {
        count: 5,
        tags: ["Limit"],
        difficulty_proportions: { easy: 3, medium: 2, hard: 0 },
      },
      status: "published",
    });
  }

  const matId = "mat-test-p5";
  const existingMat = await db.query.websiteMaterials.findFirst({ where: eq(websiteMaterials.id, matId) });
  if (!existingMat) {
    await db.insert(websiteMaterials).values({
      id: matId,
      courseId,
      chapterId: chap1Id,
      sourceMtdId: "mtd-1",
      sourceMtdVersion: 1,
      generationHash: "hash",
      title: "Materi Limit Dasar",
      slug: "materi-limit-dasar",
      canonicalMarkdown: "# Limit",
      structuredContent: {
        schemaVersion: "1.0.0",
        chapterId: chap1Id,
        courseId,
        documentMetadata: {
          title: "Materi Limit Dasar",
          estimatedReadingTimeMin: 15,
        },
        blocks: [],
      },
      status: "published",
    });
  }

  // ==========================================
  // Gate 5.1: Divergence
  // ==========================================
  console.log("\n--- Running Gate 5.1: Divergence Check ---");
  // Seed Student A: weak in Volumes (25), strong in Parts (85). Limit, Asimtot, Turunan, Rantai are Mastered.
  const now = new Date();
  await db.insert(studentConceptMastery).values([
    { id: randomUUID(), studentId: studentAId, courseId, conceptName: "Limit", masteryScore: 90, confidence: 80, evidenceCount: 1, lastEvidenceAt: now },
    { id: randomUUID(), studentId: studentAId, courseId, conceptName: "Asimtot", masteryScore: 85, confidence: 75, evidenceCount: 1, lastEvidenceAt: now },
    { id: randomUUID(), studentId: studentAId, courseId, conceptName: "Turunan", masteryScore: 90, confidence: 80, evidenceCount: 1, lastEvidenceAt: now },
    { id: randomUUID(), studentId: studentAId, courseId, conceptName: "Aturan Rantai", masteryScore: 80, confidence: 70, evidenceCount: 1, lastEvidenceAt: now },
    { id: randomUUID(), studentId: studentAId, courseId, conceptName: "Volumes", masteryScore: 25, confidence: 40, evidenceCount: 1, lastEvidenceAt: now },
    { id: randomUUID(), studentId: studentAId, courseId, conceptName: "Parts", masteryScore: 85, confidence: 70, evidenceCount: 1, lastEvidenceAt: now },
  ]);

  // Seed Student B: weak in Parts (25), strong in Volumes (85). Others mastered.
  await db.insert(studentConceptMastery).values([
    { id: randomUUID(), studentId: studentBId, courseId, conceptName: "Limit", masteryScore: 90, confidence: 80, evidenceCount: 1, lastEvidenceAt: now },
    { id: randomUUID(), studentId: studentBId, courseId, conceptName: "Asimtot", masteryScore: 85, confidence: 75, evidenceCount: 1, lastEvidenceAt: now },
    { id: randomUUID(), studentId: studentBId, courseId, conceptName: "Turunan", masteryScore: 90, confidence: 80, evidenceCount: 1, lastEvidenceAt: now },
    { id: randomUUID(), studentId: studentBId, courseId, conceptName: "Aturan Rantai", masteryScore: 80, confidence: 70, evidenceCount: 1, lastEvidenceAt: now },
    { id: randomUUID(), studentId: studentBId, courseId, conceptName: "Volumes", masteryScore: 85, confidence: 70, evidenceCount: 1, lastEvidenceAt: now },
    { id: randomUUID(), studentId: studentBId, courseId, conceptName: "Parts", masteryScore: 25, confidence: 40, evidenceCount: 1, lastEvidenceAt: now },
  ]);

  const pathA = await computeStudyPath(studentAId, courseId);
  const pathB = await computeStudyPath(studentBId, courseId);

  const orderA = pathA.map((s) => s.conceptName);
  const orderB = pathB.map((s) => s.conceptName);

  console.log("Student A path order:", orderA);
  console.log("Student B path order:", orderB);

  // Student A (weak Volumes) should have Volumes placed earlier than Parts in their path
  const idxA_Volumes = orderA.indexOf("Volumes");
  const idxA_Parts = orderA.indexOf("Parts");
  const idxB_Volumes = orderB.indexOf("Volumes");
  const idxB_Parts = orderB.indexOf("Parts");

  if (idxA_Volumes < idxA_Parts && idxB_Parts < idxB_Volumes) {
    console.log("✓ Gate 5.1 PASS: Different path orders generated, weak concepts prioritized earlier.");
  } else {
    throw new Error("Gate 5.1 FAIL: Weakness ordering was not surfaced earlier correctly.");
  }

  // ==========================================
  // Gate 5.2: Soundness Check
  // ==========================================
  console.log("\n--- Running Gate 5.2: Soundness Check ---");
  const testStudentId = "student-soundness-test";
  const conceptsList = ["Limit", "Asimtot", "Turunan", "Aturan Rantai", "Volumes", "Parts"];

  // Run 20 random mastery profile checks
  let soundnessViolations = 0;
  for (let pIdx = 0; pIdx < 20; pIdx++) {
    // Generate random mastery scores
    await db.delete(studentConceptMastery).where(eq(studentConceptMastery.studentId, testStudentId));
    const randomMasteries = conceptsList.map((cName) => ({
      id: randomUUID(),
      studentId: testStudentId,
      courseId,
      conceptName: cName,
      masteryScore: Math.floor(Math.random() * 101), // 0 to 100
      confidence: Math.floor(Math.random() * 101),
      evidenceCount: 1,
      lastEvidenceAt: now,
    }));
    await db.insert(studentConceptMastery).values(randomMasteries);

    const testPath = await computeStudyPath(testStudentId, courseId);
    const scoreMap = new Map(randomMasteries.map((m) => [m.conceptName, m.masteryScore]));

    // Check prerequisites constraint: no unlocked node can have a prerequisite with score < 40
    for (const step of testPath) {
      if (step.status === "available" || step.status === "in_progress") {
        for (const prereq of step.prerequisites) {
          const prereqScore = scoreMap.get(prereq) || 0;
          if (prereqScore < 40) {
            console.error(`Violation: step ${step.conceptName} is ${step.status} but prereq ${prereq} score is ${prereqScore}`);
            soundnessViolations++;
          }
        }
      }
    }
  }

  if (soundnessViolations === 0) {
    console.log("✓ Gate 5.2 PASS: 20 random profiles analyzed. Zero locked-before-prerequisite violations.");
  } else {
    throw new Error(`Gate 5.2 FAIL: Detected ${soundnessViolations} prerequisite violations.`);
  }

  // ==========================================
  // Gate 5.3: Determinism
  // ==========================================
  console.log("\n--- Running Gate 5.3: Determinism ---");
  const pathA1 = await computeStudyPath(studentAId, courseId);
  const pathA2 = await computeStudyPath(studentAId, courseId);

  const json1 = JSON.stringify(pathA1);
  const json2 = JSON.stringify(pathA2);

  if (json1 === json2) {
    console.log("✓ Gate 5.3 PASS: Recomputing study path produces byte-identical results.");
  } else {
    throw new Error("Gate 5.3 FAIL: Recomputation produced divergent paths.");
  }

  // ==========================================
  // Gate 5.4: Speed
  // ==========================================
  console.log("\n--- Running Gate 5.4: Speed ---");
  const speedCourseId = "calc-speed-test";
  const speedStudentId = "student-speed-test";

  // Clean old speed course data
  await clearTestData(speedCourseId);
  await db.delete(courses).where(eq(courses.id, speedCourseId));
  await db.insert(courses).values({
    id: speedCourseId,
    title: "Speed Course",
    category: "TPB",
    description: "Speed testing",
  });

  const speedChapId = "speed-ch-1";
  await db.insert(chapters).values({
    id: speedChapId,
    courseId: speedCourseId,
    title: "Chapter 1",
    orderIndex: 1,
    status: "published",
  });

  // Generate 100 synthetic concepts
  console.log("  Generating 100 synthetic KOs...");
  const speedKOs = Array.from({ length: 100 }).map((_, i) => ({
    id: `ko-speed-${i}`,
    courseId: speedCourseId,
    mtdId: "mtd-1",
    chapterId: speedChapId,
    conceptId: `c-speed-${i}`,
    conceptName: `Concept ${i}`,
    title: `Concept ${i} Title`,
    content: "Content...",
    type: "definition" as const,
    difficulty: "medium" as const,
    bloomLevel: "understand" as const,
    importance: "medium" as const,
    learningOrder: i,
  }));
  await db.insert(knowledgeObjects).values(speedKOs);

  // Generate DAG edges: Concept i -> Concept i+1 (99 prerequisite edges)
  const speedEdges = Array.from({ length: 99 }).map((_, i) => ({
    id: `rel-speed-${i}`,
    sourceKoId: `ko-speed-${i}`,
    targetKoId: `ko-speed-${i + 1}`,
    type: "prerequisite" as const,
  }));
  await db.insert(knowledgeRelationships).values(speedEdges);

  console.log("  Measuring path computation speed for 100 concepts...");
  const start = performance.now();
  const speedPath = await computeStudyPath(speedStudentId, speedCourseId);
  const end = performance.now();
  const duration = end - start;

  console.log(`  Path generated in ${duration.toFixed(2)}ms. Steps count: ${speedPath.length}`);
  if (duration < 200) {
    console.log("✓ Gate 5.4 PASS: Path computation completed in < 200 ms.");
  } else {
    throw new Error(`Gate 5.4 FAIL: Computation exceeded 200ms limit, took ${duration.toFixed(2)}ms`);
  }

  // Cleanup speed course data
  await clearTestData(speedCourseId);
  await db.delete(courses).where(eq(courses.id, speedCourseId));

  // ==========================================
  // Gate 5.5: Cycle Handling
  // ==========================================
  console.log("\n--- Running Gate 5.5: Cycle Handling ---");
  // Limit -> Turunan -> Limit
  // Limit has chapterOrderIndex = 1, Turunan has chapterOrderIndex = 2.
  // Edge 1: Limit -> Turunan (normal prereq, target is Turunan which is in Ch 2 (later than Ch 1))
  // Edge 2: Turunan -> Limit (backward prereq, target is Limit which is in Ch 1 (earlier than Ch 2))
  // The cycle breaker should detect the cycle and break the edge whose target is later in chapter order (meaning Limit -> Turunan should be broken).
  console.log("  Adding cyclic prerequisite relationship: Turunan -> Limit...");
  await db.insert(knowledgeRelationships).values({
    id: "rel-cycle-back",
    sourceKoId: koTurunanId,
    targetKoId: koLimitId,
    type: "prerequisite",
  });

  const cyclicPath = await computeStudyPath(studentAId, courseId);
  console.log("  Cyclic path computed steps count:", cyclicPath.length);

  if (cyclicPath.length === 6) {
    console.log("✓ Gate 5.5 PASS: Path computed successfully despite cyclic dependency.");
  } else {
    throw new Error(`Gate 5.5 FAIL: Kahn's algorithm did not compute all nodes. Steps count: ${cyclicPath.length}`);
  }

  // Cleanup cycle relationship
  await db.delete(knowledgeRelationships).where(eq(knowledgeRelationships.id, "rel-cycle-back"));

  // ==========================================
  // Gate 5.6: P2 Recommendation Rewire
  // ==========================================
  console.log("\n--- Running Gate 5.6: P2 Recommendation Rewire Check ---");
  // Set FEATURE_STUDY_PATH=1
  process.env.FEATURE_STUDY_PATH = "1";

  // Recompute path for Student A
  const path = await recomputeStudyPath(studentAId, courseId);
  const activeStep = path.find((s) => s.status === "available" || s.status === "in_progress");
  console.log("  Study path head (first active concept):", activeStep?.conceptName);

  const recommendation = await getOrBuildTodayRecommendation(studentAId, [courseId]);
  console.log("  Today's recommendations:", recommendation.items);

  const quizRec = recommendation.items.find((item) => item.kind === "quiz");
  console.log("  Recommended quiz item:", quizRec);

  if (quizRec && quizRec.title === `Quiz: ${activeStep?.conceptName}`) {
    console.log("✓ Gate 5.6 PASS: Today quiz pick correctly matches the study path head concept.");
  } else {
    throw new Error(`Gate 5.6 FAIL: Quiz recommendation title (${quizRec?.title}) does not match path head.`);
  }

  // Clear test data
  console.log("\nCleaning up test data...");
  await clearTestData(courseId);
  await db.delete(courses).where(eq(courses.id, courseId));

  console.log("\n=== All Gates Verified Successfully! ===");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
