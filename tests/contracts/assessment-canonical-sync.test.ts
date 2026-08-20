import { describe, expect, it, beforeEach } from "bun:test";
import { db } from "@/db";
import {
  asesmen,
  bab,
  blueprintAsesmen,
  cakupanAsesmen,
  chapters,
  courses,
  mataKuliah,
  pengguna,
  percobaanAsesmen,
  quizTemplates,
  user,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  createAssessmentWithLegacyProjection,
  deleteAssessmentWithLegacyProjection,
  syncOrphanedQuizTemplatesToAssessments,
  updateAssessmentWithLegacyProjection,
} from "@/lib/asesmen/quiz-canonical-sync";
import { dualWriteQuizAttempt } from "@/lib/migrasi/repository-kompatibilitas";

describe("Canonical-First Assessment & Quiz Sync", () => {
  const testCourseId = "test-course-sync";
  const testChapterId = "test-chapter-sync";
  const testUserId = "test-user-sync";

  beforeEach(async () => {
    // Setup test course, chapter, and user
    await db
      .insert(courses)
      .values({
        id: testCourseId,
        title: "Test Sync Course",
        category: "Matematika",
        description: "Test Course",
      })
      .onConflictDoNothing();

    await db
      .insert(chapters)
      .values({
        id: testChapterId,
        courseId: testCourseId,
        title: "Test Chapter",
        orderIndex: 0,
        status: "published",
      })
      .onConflictDoNothing();

    await db
      .insert(mataKuliah)
      .values({
        id: testCourseId,
        code: "TEST101",
        title: "Test Sync Course",
        legacyCourseId: testCourseId,
        status: "active",
      })
      .onConflictDoNothing();

    await db
      .insert(bab)
      .values({
        id: testChapterId,
        mataKuliahId: testCourseId,
        code: "BAB1",
        title: "Test Chapter",
        orderIndex: 0,
        legacyChapterId: testChapterId,
        status: "active",
      })
      .onConflictDoNothing();

    await db
      .insert(user)
      .values({
        id: testUserId,
        name: "Test Sync User",
        email: `test-sync-${Date.now()}@example.com`,
        emailVerified: true,
        role: "admin",
      })
      .onConflictDoNothing();

    await db
      .insert(pengguna)
      .values({
        id: testUserId,
        status: "active",
      })
      .onConflictDoNothing();
  });

  it("creates canonical assessment, blueprint, coverage, and legacy quiz_templates projection", async () => {
    const templateId = `test-quiz-${Date.now()}`;
    const result = await createAssessmentWithLegacyProjection({
      id: templateId,
      courseId: testCourseId,
      title: "Ujian Kalkulus 1",
      category: "chapter",
      visibility: "free",
      status: "published",
      manualStatus: "open",
      timeLimitSeconds: 1800,
      maxAttempts: 3,
      selectionRules: {
        count: 10,
        chapterIds: [testChapterId],
        difficulty_proportions: { easy: 3, medium: 5, hard: 2 },
      },
      creatorId: testUserId,
    });

    expect(result.id).toBe(templateId);
    expect(result.assessmentType).toBe("quiz");
    expect(result.status).toBe("published");

    // 1. Verify Asesmen exists
    const [asm] = await db
      .select()
      .from(asesmen)
      .where(eq(asesmen.id, templateId))
      .limit(1);
    expect(asm).toBeTruthy();
    expect(asm.title).toBe("Ujian Kalkulus 1");
    expect(asm.status).toBe("published");

    // 2. Verify Blueprint Asesmen exists
    const [bp] = await db
      .select()
      .from(blueprintAsesmen)
      .where(eq(blueprintAsesmen.id, result.blueprintId))
      .limit(1);
    expect(bp).toBeTruthy();
    expect(bp.title).toBe("Ujian Kalkulus 1");
    expect(bp.status).toBe("approved");

    // 3. Verify Cakupan Asesmen exists
    const coverage = await db
      .select()
      .from(cakupanAsesmen)
      .where(eq(cakupanAsesmen.asesmenId, templateId));
    expect(coverage.length).toBe(1);
    expect(coverage[0].babId).toBe(testChapterId);

    // 4. Verify Legacy Projection (quiz_templates) exists
    const [tpl] = await db
      .select()
      .from(quizTemplates)
      .where(eq(quizTemplates.id, templateId))
      .limit(1);
    expect(tpl).toBeTruthy();
    expect(tpl.title).toBe("Ujian Kalkulus 1");
    expect(tpl.timeLimitSeconds).toBe(1800);
    expect(tpl.status).toBe("published");

    // 5. Verify dualWriteQuizAttempt succeeds because canonical assessment exists
    const attemptId = `test-attempt-${Date.now()}`;
    await db.transaction(async (tx) => {
      await dualWriteQuizAttempt(
        tx,
        {
          id: attemptId,
          templateId,
          studentId: testUserId,
          status: "in_progress",
          questionsSnapshot: [{ id: "q1", prompt: "1+1=?" }],
          answersSnapshot: null,
          startedAt: new Date(),
          submittedAt: null,
        },
        testUserId,
      );
    });

    const [attempt] = await db
      .select()
      .from(percobaanAsesmen)
      .where(eq(percobaanAsesmen.id, attemptId))
      .limit(1);
    expect(attempt).toBeTruthy();
    expect(attempt.asesmenId).toBe(templateId);
    expect(attempt.penggunaId).toBe(testUserId);
  });

  it("updates canonical assessment and legacy projection atomically", async () => {
    const templateId = `test-quiz-update-${Date.now()}`;
    await createAssessmentWithLegacyProjection({
      id: templateId,
      courseId: testCourseId,
      title: "Judul Awal",
      category: "weekly",
      visibility: "free",
      status: "draft",
      selectionRules: { count: 5 },
      creatorId: testUserId,
    });

    await updateAssessmentWithLegacyProjection(templateId, {
      title: "Judul Baru",
      status: "published",
      timeLimitSeconds: 3600,
    });

    const [asm] = await db.select().from(asesmen).where(eq(asesmen.id, templateId)).limit(1);
    expect(asm.title).toBe("Judul Baru");
    expect(asm.status).toBe("published");

    const [tpl] = await db.select().from(quizTemplates).where(eq(quizTemplates.id, templateId)).limit(1);
    expect(tpl.title).toBe("Judul Baru");
    expect(tpl.status).toBe("published");
    expect(tpl.timeLimitSeconds).toBe(3600);
  });

  it("deletes canonical assessment and legacy projection atomically", async () => {
    const templateId = `test-quiz-del-${Date.now()}`;
    await createAssessmentWithLegacyProjection({
      id: templateId,
      courseId: testCourseId,
      title: "Kuis Hapus",
      category: "daily",
      visibility: "free",
      status: "published",
      selectionRules: { count: 5 },
      creatorId: testUserId,
    });

    await deleteAssessmentWithLegacyProjection(templateId);

    const [asm] = await db.select().from(asesmen).where(eq(asesmen.id, templateId)).limit(1);
    expect(asm).toBeUndefined();

    const [tpl] = await db.select().from(quizTemplates).where(eq(quizTemplates.id, templateId)).limit(1);
    expect(tpl).toBeUndefined();
  });

  it("reconciles orphaned quiz templates that lack canonical assessments", async () => {
    const orphanedId = `orphaned-quiz-${Date.now()}`;

    // Direct insert into quizTemplates only (simulating old buggy behavior)
    await db.insert(quizTemplates).values({
      id: orphanedId,
      courseId: testCourseId,
      title: "Orphaned Legacy Quiz",
      category: "chapter",
      visibility: "free",
      status: "published",
      manualStatus: "open",
      selectionRules: { count: 10, chapterIds: [testChapterId] },
    });

    // Ensure asesmen row does not exist yet
    const [initialAsm] = await db.select().from(asesmen).where(eq(asesmen.id, orphanedId)).limit(1);
    expect(initialAsm).toBeUndefined();

    // Run reconciliation
    const syncResult = await syncOrphanedQuizTemplatesToAssessments();
    expect(syncResult.reconciledCount).toBeGreaterThanOrEqual(1);

    // Verify asesmen row is now created
    const [reconciledAsm] = await db.select().from(asesmen).where(eq(asesmen.id, orphanedId)).limit(1);
    expect(reconciledAsm).toBeTruthy();
    expect(reconciledAsm.title).toBe("Orphaned Legacy Quiz");
    expect(reconciledAsm.status).toBe("published");
  });
});
