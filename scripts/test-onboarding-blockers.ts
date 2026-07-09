import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { db } from "../db";
import { 
  courses, 
  chapters, 
  masterTeachingDocuments, 
  concepts, 
  conceptLocalizations, 
  knowledgeObjects, 
  aiQuestionBank, 
  assessmentSources, 
  assessmentObjects, 
  vectorSyncQueue, 
  user,
  enrollments,
  conceptGraphEdges,
  websiteMaterials,
  knowledgeRelationships
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { askTutorRag } from "../lib/tutor-rag";
import { vectorStore } from "../lib/vector-store";
import { compileMarkdown } from "../lib/markdown-compiler";
import { verifyKOCoverage } from "../lib/ko-coverage-auditor";
import { buildTermIndex } from "../lib/term-index";
import { buildConceptGraph } from "../lib/graph-trace";
import { VECTOR_NAMESPACES } from "../lib/vector-store";
import { extractAssessmentObjectsForSource } from "../lib/assessment-extractor";

async function runTests() {
  console.log("=== STARTING ONBOARDING BLOCKER TESTS ===\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // Get or seed a test student
  let studentId = "student-1";
  const [existingUser] = await db.select().from(user).where(eq(user.role, "student")).limit(1);
  if (existingUser) {
    studentId = existingUser.id;
  } else {
    studentId = `student-${randomUUID().slice(0, 8)}`;
    await db.insert(user).values({
      id: studentId,
      name: "Test Student",
      email: "test-student@example.com",
      role: "student",
    });
  }

  // ---------------------------------------------------------------------------
  // Test 1: Practice Question Retrieval
  // ---------------------------------------------------------------------------
  console.log("\n--- Test 1: Practice Question Retrieval ---");
  const testCourseId = `test-q-course-${randomUUID().slice(0, 8)}`;
  const testChapterId = `test-q-chap-${randomUUID().slice(0, 8)}`;
  const testMtdId = `test-q-mtd-${randomUUID().slice(0, 8)}`;
  const testConceptId = `test-q-concept-${randomUUID().slice(0, 8)}`;
  const testKoId = `test-q-ko-${randomUUID().slice(0, 8)}`;
  const testQuestionId = `test-q-qid-${randomUUID().slice(0, 8)}`;

  try {
    // 1. Seed dependencies
    await db.insert(courses).values({
      id: testCourseId,
      title: "Test Course for Practice",
      category: "Matematika",
    });

    await db.insert(enrollments).values({
      id: randomUUID(),
      userId: studentId,
      courseId: testCourseId,
      enrolledAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    });

    await db.insert(chapters).values({
      id: testChapterId,
      courseId: testCourseId,
      title: "Limit",
      orderIndex: 1,
      status: "published",
    });

    await db.insert(masterTeachingDocuments).values({
      id: testMtdId,
      courseId: testCourseId,
      title: "MTD Limit",
      markdownContent: "# Limit\nContent here.",
      createdById: studentId,
    });

    await db.insert(concepts).values({
      id: testConceptId,
      canonicalSlug: `test-slug-${randomUUID().slice(0, 8)}`,
    });

    await db.insert(conceptLocalizations).values({
      id: randomUUID(),
      conceptId: testConceptId,
      lang: "id",
      displayName: "Limit Intuitif",
    });

    await db.insert(knowledgeObjects).values({
      id: testKoId,
      courseId: testCourseId,
      mtdId: testMtdId,
      chapterId: testChapterId,
      conceptId: testConceptId,
      learningOrder: 1,
      title: "Definisi Limit",
      conceptName: "Limit Intuitif",
      content: "Limit f(x) adalah L.",
      type: "definition",
      bloomLevel: "understand",
      status: "active",
      pineconeVectorId: testKoId,
    });

    // 2. Seed Question
    await db.insert(aiQuestionBank).values({
      id: testQuestionId,
      courseId: testCourseId,
      knowledgeObjectId: testKoId,
      sourceMtdId: testMtdId,
      sourceMtdVersion: 1,
      difficulty: "easy",
      prompt: "What is limit of x as x approaches 2?",
      options: ["2", "0", "1", "undefined"],
      correctIndices: [0],
      explanation: "Direct substitution yields 2.",
      status: "active",
      reviewStatus: "published",
    });

    // 3. Queue Vector Sync
    await db.insert(vectorSyncQueue).values({
      id: `sync-${randomUUID()}`,
      courseId: testCourseId,
      koId: null,
      action: "upsert",
      namespace: VECTOR_NAMESPACES.practice, // "practice"
      payload: {
        id: testQuestionId,
        text: "Question: What is limit of x as x approaches 2?\nExplanation: Direct substitution yields 2.",
        metadata: {
          chapterId: testChapterId,
          type: "question",
          bloomLevel: "understand",
          difficulty: "easy",
          tags: ["Limit Intuitif"],
        }
      },
      status: "completed", // mark completed directly to bypass real Pinecone sync latency
      attempts: 1,
    });

    // 4. Mock the vectorStore query to simulate successful vector lookup
    const originalQuery = vectorStore.query;
    vectorStore.query = async (courseNs) => {
      if (courseNs === `${testCourseId}_practice`) {
        return [{ id: testQuestionId, score: 0.9, metadata: { chapterId: testChapterId } }];
      }
      return [];
    };

    // 5. Query Tutor RAG
    const tutorResponse = await askTutorRag({
      studentId,
      courseId: testCourseId,
      chapterId: testChapterId,
      question: "What is limit of x as x approaches 2?",
    });

    // Restore original vectorStore query
    vectorStore.query = originalQuery;

    assert(tutorResponse.sources.some(s => s.id === testQuestionId), "Practice question is retrieved by Zyra RAG");
    assert(tutorResponse.sources.some(s => s.type === "practice_question"), "Zyra classifies retrieved item as practice_question type");
  } catch (err: any) {
    console.error("Test 1 failed with error:", err);
    failed++;
  }

  // ---------------------------------------------------------------------------
  // Test 2: Past Exam Retrieval
  // ---------------------------------------------------------------------------
  console.log("\n--- Test 2: Past Exam Retrieval ---");
  const testExamCourseId = `test-e-course-${randomUUID().slice(0, 8)}`;
  const testExamSourceId = `test-e-src-${randomUUID().slice(0, 8)}`;
  const testExamChapterId = `test-e-chap-${randomUUID().slice(0, 8)}`;

  try {
    // 1. Seed dependencies
    await db.insert(courses).values({
      id: testExamCourseId,
      title: "Test Course for Exams",
      category: "Matematika",
    });

    await db.insert(enrollments).values({
      id: randomUUID(),
      userId: studentId,
      courseId: testExamCourseId,
      enrolledAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    });

    await db.insert(chapters).values({
      id: testExamChapterId,
      courseId: testExamCourseId,
      title: "Limit Dasar",
      orderIndex: 1,
      status: "published",
    });

    const markdownSource = `---
category: uts
year: 2026
semester: 1
chapters:
  - "Limit Dasar"
---
## Soal 1
Tentukan limit $x \\to 3$ dari $x^2$.
Options:
A. 9
B. 3
C. 6
D. 0
`;

    await db.insert(assessmentSources).values({
      id: testExamSourceId,
      courseId: testExamCourseId,
      title: "UTS 2026",
      category: "uts",
      year: 2026,
      semester: 1,
      sourceMarkdown: markdownSource,
      sourceHash: "test-hash-2",
      version: 1,
      parserVersion: "1.0.0",
      ingestionStatus: "pending",
      uploadedByUserId: studentId,
    });

    process.env.MOCK_GEMINI = "true";
    await extractAssessmentObjectsForSource(testExamSourceId, true);
    delete process.env.MOCK_GEMINI;

    // Verify assessmentObjects and vector sync payloads are created
    const objs = await db.select().from(assessmentObjects).where(eq(assessmentObjects.sourceId, testExamSourceId));
    assert(objs.length > 0, "assessmentObjects created successfully by extractor");

    const syncItems = await db
      .select()
      .from(vectorSyncQueue)
      .where(and(eq(vectorSyncQueue.courseId, testExamCourseId), eq(vectorSyncQueue.namespace, VECTOR_NAMESPACES.past_exams)));
    assert(syncItems.length > 0, "Past exam vector sync payloads created in vectorSyncQueue under past_exams namespace");

    // Mock vectorStore lookup for past exams
    const originalQuery = vectorStore.query;
    vectorStore.query = async (courseNs) => {
      if (courseNs === `${testExamCourseId}_past_exams` && objs[0]) {
        return [{ id: objs[0].id, score: 0.95, metadata: { chapterId: testExamChapterId } }];
      }
      return [];
    };

    // 3. Query Zyra RAG for UTS questions
    const tutorResponse = await askTutorRag({
      studentId,
      courseId: testExamCourseId,
      chapterId: testExamChapterId,
      question: "Tentukan limit x menuju 3 dari x^2",
    });

    // Restore query
    vectorStore.query = originalQuery;

    assert(tutorResponse.sources.some(s => s.id === objs[0]?.id), "Past exam UTS question is retrieved by Zyra RAG");
    assert(tutorResponse.sources.some(s => s.type === "past_exam"), "Zyra classifies retrieved item as past_exam type");
  } catch (err: any) {
    console.error("Test 2 failed with error:", err);
    failed++;
  }

  // ---------------------------------------------------------------------------
  // Test 3: Offline Course Processing
  // ---------------------------------------------------------------------------
  console.log("\n--- Test 3: Offline Course Processing ---");
  const testOfflineCourseId = `test-o-course-${randomUUID().slice(0, 8)}`;
  const testOfflineChapterId = `test-o-chap-${randomUUID().slice(0, 8)}`;
  const testOfflineMtdId = `test-o-mtd-${randomUUID().slice(0, 8)}`;
  const testOfflineConceptId = `test-o-concept-${randomUUID().slice(0, 8)}`;
  const testOfflineKoId = `test-o-ko-${randomUUID().slice(0, 8)}`;
  const testOfflineMaterialId = `test-o-mat-${randomUUID().slice(0, 8)}`;

  try {
    // 1. Seed Course details
    await db.insert(courses).values({
      id: testOfflineCourseId,
      title: "Offline Calculus",
      category: "Matematika",
    });

    await db.insert(chapters).values({
      id: testOfflineChapterId,
      courseId: testOfflineCourseId,
      title: "Limit Intuisi",
      orderIndex: 1,
      status: "published",
    });

    await db.insert(masterTeachingDocuments).values({
      id: testOfflineMtdId,
      courseId: testOfflineCourseId,
      title: "MTD Limit Intuisi",
      markdownContent: "# Limit Intuisi\nDefinisi Limit.",
      createdById: studentId,
    });

    await db.insert(concepts).values({
      id: testOfflineConceptId,
      canonicalSlug: `test-o-slug-${randomUUID().slice(0, 8)}`,
    });

    await db.insert(conceptLocalizations).values({
      id: randomUUID(),
      conceptId: testOfflineConceptId,
      lang: "id",
      displayName: "Limit Intuisi",
    });

    await db.insert(knowledgeObjects).values({
      id: testOfflineKoId,
      courseId: testOfflineCourseId,
      mtdId: testOfflineMtdId,
      chapterId: testOfflineChapterId,
      conceptId: testOfflineConceptId,
      learningOrder: 1,
      title: "Definisi Limit",
      conceptName: "Limit Intuisi",
      content: "Limit f(x) mendekati L.",
      type: "definition",
      bloomLevel: "understand",
      status: "active",
    });

    await db.insert(knowledgeRelationships).values({
      id: randomUUID(),
      sourceKoId: testOfflineKoId,
      targetKoId: testOfflineKoId, // simple self reference for test graph edge
      type: "prerequisite",
    });

    await db.insert(websiteMaterials).values({
      id: testOfflineMaterialId,
      courseId: testOfflineCourseId,
      chapterId: testOfflineChapterId,
      sourceMtdId: testOfflineMtdId,
      sourceMtdVersion: 1,
      generationHash: "o-hash-1",
      title: "Limit Intuisi",
      slug: "limit-intuisi",
      canonicalMarkdown: `# Limit Intuisi\n## Definisi\nLimit f(x) mendekati L.`,
      structuredContent: {}, // empty AST initially
      status: "draft",
    });

    // 2. Compile AST & Coverage Report
    console.log("  Compiling markdown and calculating coverage...");
    const compilerResult = compileMarkdown(
      `# Limit Intuisi\n## Definisi\nLimit f(x) mendekati L.`,
      testOfflineChapterId,
      testOfflineCourseId
    );
    const verification = await verifyKOCoverage(testOfflineChapterId, compilerResult.ast);
    const termIndex = await buildTermIndex(testOfflineChapterId);

    await db.update(websiteMaterials).set({
      structuredContent: {
        markdown: `# Limit Intuisi\n## Definisi\nLimit f(x) mendekati L.`,
        compilerResult,
        compiledAt: new Date().toISOString(),
      },
      coverageStatus: verification.status as any,
      coverageReport: verification.report,
      termIndex,
      status: "published",
      isStale: false,
    }).where(eq(websiteMaterials.id, testOfflineMaterialId));

    const [updatedMat] = await db.select().from(websiteMaterials).where(eq(websiteMaterials.id, testOfflineMaterialId));
    assert(updatedMat !== undefined && updatedMat.status === "published", "Website material successfully compiled and published");
    assert(updatedMat.termIndex !== null, "Term Popover Index populated successfully");

    // 3. Build Concept Graph Edges
    console.log("  Building concept graph edges...");
    await buildConceptGraph(testOfflineCourseId);
    const edges = await db.select().from(conceptGraphEdges).where(eq(conceptGraphEdges.courseId, testOfflineCourseId));
    assert(edges.length >= 0, "Concept Graph rollup computed synchronously without crashing");

  } catch (err: any) {
    console.error("Test 3 failed with error:", err);
    failed++;
  }

  console.log(`\n=== TEST SUITE SUMMARY: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error("Tests failed with error:", err);
  process.exit(1);
});
