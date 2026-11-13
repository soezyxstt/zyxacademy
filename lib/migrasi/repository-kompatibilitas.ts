import { createHash } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import {
  artikel,
  artikelIde,
  auditMutasi,
  bab,
  asesmen,
  blokArtikel,
  buktiPembelajaran,
  courses,
  enrollments,
  flashcard,
  flashcardIde,
  flashcardReviews,
  ide,
  kemajuanFlashcardMurid,
  mataKuliah,
  pendaftaranMurid,
  penugasanTutor,
  percobaanAsesmen,
  pengguna,
  quizTemplates,
  reviewFlashcard,
  studentConceptMastery,
  tutorCourses,
  websiteMaterials,
} from "@/db/schema";
import { stableStringify } from "@/lib/staging/migration-ledger";
import { PEMAHAMAN_RUBRIC_VERSION } from "@/lib/pemahaman/engine";
import { createAssessmentWithLegacyProjection } from "@/lib/asesmen/quiz-canonical-sync";
import { lockTutorAssignmentChanges } from "@/lib/auth/authoring-actor";

type CompatibilityTx = {
  insert: (...args: any[]) => any;
  select: (...args: any[]) => any;
  update: (...args: any[]) => any;
};

export type LegacyEnrollmentMirror = {
  id: string;
  userId: string;
  courseId: string;
  enrolledAt: Date | null;
  expiresAt: Date;
};

export type LegacyTutorAssignmentMirror = {
  id: string;
  tutorId: string;
  courseId: string;
  status?: "active" | "revoked";
};

export type LegacyFlashcardReviewMirror = {
  id: string;
  studentId: string;
  flashcardId: string;
  grade: number;
  responseTimeMs: number;
  reviewedAt: Date;
  progress: {
    dueDate: Date;
    intervalDays: number;
    easeFactor: number;
    repetitions: number;
    lapses: number;
    lastReviewedAt: Date | null;
  };
};

export type LegacyLearningEventMirror = {
  id: string;
  studentId: string;
  courseId: string;
  koId?: string | null;
  eventType: string;
  correctness?: number | null;
  createdAt: Date;
};

export type LegacyQuizAttemptMirror = {
  id: string;
  templateId: string;
  studentId: string;
  status: "in_progress" | "completed" | "abandoned";
  questionsSnapshot: unknown;
  answersSnapshot: unknown;
  startedAt: Date;
  submittedAt: Date | null;
};

export type LegacyMaterialPublicationMirror = {
  id: string;
  courseId: string;
  chapterId: string;
  title: string;
  slug: string;
  canonicalMarkdown: string;
  generationHash: string;
  status: "draft" | "published" | "withdrawn";
  creatorId: string;
  version?: number;
  publishedAt?: Date | null;
};

function deterministicId(prefix: string, sourceId: string): string {
  const safe = sourceId.replace(/[^A-Za-z0-9._-]/g, "_");
  if (safe.length <= 48) return `${prefix}-${safe}`;
  const digest = createHash("sha256").update(`${prefix}:${sourceId}`).digest("hex").slice(0, 24);
  return `${prefix}-${digest}`;
}

function isEnabled(_environment?: NodeJS.ProcessEnv): boolean {
  return true;
}

export function dualWriteEnabled(_environment?: NodeJS.ProcessEnv): boolean {
  return true;
}

async function audit(
  tx: CompatibilityTx,
  entityType: string,
  entityId: string,
  action: string,
  afterSnapshot: Record<string, unknown>,
  actorId?: string | null,
  correlationId?: string,
): Promise<void> {
  await tx.insert(auditMutasi).values({
    id: deterministicId("audit", `${entityType}:${entityId}:${action}:${correlationId ?? ""}`),
    actorId: actorId ?? null,
    entityType,
    entityId,
    action,
    beforeSnapshot: null,
    afterSnapshot,
    correlationId: correlationId ?? null,
  }).onConflictDoNothing();
}

async function findCourseTarget(tx: CompatibilityTx, legacyCourseId: string): Promise<string> {
  const [target] = await tx.select({ id: mataKuliah.id }).from(mataKuliah).where(eq(mataKuliah.legacyCourseId, legacyCourseId)).limit(1);
  if (target) return target.id;
  const [sameId] = await tx.select({ id: mataKuliah.id }).from(mataKuliah).where(eq(mataKuliah.id, legacyCourseId)).limit(1);
  if (sameId) return sameId.id;
  throw new Error(`Dual-write target course is missing for ${legacyCourseId}`);
}

async function findChapterTarget(tx: CompatibilityTx, legacyChapterId: string): Promise<string | null> {
  const [target] = await tx.select({ id: bab.id }).from(bab).where(eq(bab.legacyChapterId, legacyChapterId)).limit(1);
  return target?.id ?? null;
}

async function requirePengguna(tx: CompatibilityTx, userId: string): Promise<void> {
  const [target] = await tx.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, userId)).limit(1);
  if (!target) throw new Error(`Dual-write target identity is missing for ${userId}`);
}

/** Mirror a legacy enrollment inside the caller's transaction. */
export async function dualWriteEnrollment(
  tx: CompatibilityTx,
  enrollment: LegacyEnrollmentMirror,
  actorId?: string | null,
): Promise<void> {
  if (!isEnabled()) return;
  await requirePengguna(tx, enrollment.userId);
  const mataKuliahId = await findCourseTarget(tx, enrollment.courseId);
  await tx.insert(pendaftaranMurid).values({
    id: deterministicId("pendaftaran", enrollment.id),
    penggunaId: enrollment.userId,
    mataKuliahId,
    status: enrollment.expiresAt.getTime() < Date.now() ? "expired" : "active",
    startAt: enrollment.enrolledAt,
    endAt: enrollment.expiresAt,
    legacyEnrollmentId: enrollment.id,
  }).onConflictDoUpdate({
    target: pendaftaranMurid.legacyEnrollmentId,
    set: {
      penggunaId: enrollment.userId,
      mataKuliahId,
      startAt: enrollment.enrolledAt,
      endAt: enrollment.expiresAt,
    },
  });
  await audit(tx, "enrollment", enrollment.id, "dual_write", { legacyId: enrollment.id, mataKuliahId }, actorId, enrollment.id);
}

/** Mirror a legacy tutor-course assignment inside the caller's transaction. */
export async function dualWriteTutorAssignment(
  tx: CompatibilityTx,
  assignment: LegacyTutorAssignmentMirror,
  actorId?: string | null,
): Promise<void> {
  await lockTutorAssignmentChanges(tx, assignment.tutorId);
  if (!isEnabled()) return;
  await requirePengguna(tx, assignment.tutorId);
  const mataKuliahId = await findCourseTarget(tx, assignment.courseId);
  await tx.insert(penugasanTutor).values({
    id: deterministicId("penugasan", assignment.id),
    penggunaId: assignment.tutorId,
    mataKuliahId,
    status: assignment.status ?? "active",
    assignmentScope: "course",
    legacyTutorCourseId: assignment.id,
  }).onConflictDoUpdate({
    target: [penugasanTutor.penggunaId, penugasanTutor.mataKuliahId, penugasanTutor.assignmentScope],
    set: {
      legacyTutorCourseId: assignment.id,
      status: assignment.status ?? "active",
      updatedAt: new Date(),
    },
  });
  await audit(tx, "tutor_assignment", assignment.id, "dual_write", { legacyId: assignment.id, mataKuliahId, status: assignment.status ?? "active" }, actorId, `${assignment.id}:${assignment.status ?? "active"}`);
}

/** Revoke current course assignments before replacing the legacy projection. */
export async function revokeCanonicalTutorCourseAssignments(
  tx: CompatibilityTx,
  tutorId: string,
  actorId?: string | null,
): Promise<void> {
  await lockTutorAssignmentChanges(tx, tutorId);
  if (!isEnabled()) return;
  await requirePengguna(tx, tutorId);
  await tx
    .update(penugasanTutor)
    .set({ status: "revoked", legacyTutorCourseId: null, updatedAt: new Date() })
    .where(and(eq(penugasanTutor.penggunaId, tutorId), eq(penugasanTutor.assignmentScope, "course")));
  await audit(
    tx,
    "tutor_assignment",
    tutorId,
    "dual_write_revoke_all",
    { tutorId, assignmentScope: "course", status: "revoked" },
    actorId,
    `${tutorId}:revoke_all`,
  );
}

/** Mirror the legacy SM-2 state and immutable review event. */
export async function dualWriteFlashcardReview(
  tx: CompatibilityTx,
  review: LegacyFlashcardReviewMirror,
  actorId?: string | null,
): Promise<void> {
  if (!isEnabled()) return;
  await requirePengguna(tx, review.studentId);
  const targetCard = await tx.select({ id: flashcard.id }).from(flashcard).where(eq(flashcard.id, review.flashcardId)).limit(1);
  if (targetCard.length === 0) throw new Error(`Dual-write target flashcard is missing for ${review.flashcardId}`);

  const proposedProgressId = deterministicId("kemajuan", `${review.studentId}:${review.flashcardId}`);
  await tx.insert(kemajuanFlashcardMurid).values({
    id: proposedProgressId,
    penggunaId: review.studentId,
    flashcardId: review.flashcardId,
    dueAt: review.progress.dueDate,
    intervalDays: review.progress.intervalDays,
    easeFactor: review.progress.easeFactor,
    repetitions: review.progress.repetitions,
    lapses: review.progress.lapses,
    lastReviewedAt: review.progress.lastReviewedAt,
    status: "active",
  }).onConflictDoUpdate({
    target: [kemajuanFlashcardMurid.penggunaId, kemajuanFlashcardMurid.flashcardId],
    set: {
      dueAt: review.progress.dueDate,
      intervalDays: review.progress.intervalDays,
      easeFactor: review.progress.easeFactor,
      repetitions: review.progress.repetitions,
      lapses: review.progress.lapses,
      lastReviewedAt: review.progress.lastReviewedAt,
      updatedAt: new Date(),
    },
  });
  const [progressTarget] = await tx
    .select({ id: kemajuanFlashcardMurid.id })
    .from(kemajuanFlashcardMurid)
    .where(and(
      eq(kemajuanFlashcardMurid.penggunaId, review.studentId),
      eq(kemajuanFlashcardMurid.flashcardId, review.flashcardId),
    ))
    .limit(1);
  const progressId = progressTarget?.id ?? proposedProgressId;

  await tx.insert(reviewFlashcard).values({
    id: review.id,
    kemajuanFlashcardMuridId: progressId,
    grade: review.grade,
    responseMs: review.responseTimeMs,
    previousDueAt: review.reviewedAt,
    nextDueAt: review.progress.dueDate,
    reviewedAt: review.reviewedAt,
  }).onConflictDoNothing();
  await audit(tx, "flashcard_review", review.id, "dual_write", { targetProgressId: progressId }, actorId, review.id);
}

/** Mirror an exact Idea learning event as attributable evidence only. */
export async function dualWriteLearningEvent(
  tx: CompatibilityTx,
  event: LegacyLearningEventMirror,
  actorId?: string | null,
): Promise<void> {
  if (!event.koId) return;
  const [targetIdea] = await tx.select({ id: ide.id }).from(ide).where(eq(ide.id, event.koId)).limit(1);
  if (!targetIdea) return;
  await requirePengguna(tx, event.studentId);
  await tx.insert(buktiPembelajaran).values({
    id: deterministicId("bukti", event.id),
    penggunaId: event.studentId,
    ideId: targetIdea.id,
    evidenceSource: event.eventType,
    sourceId: event.id,
    scoreContribution: event.correctness ?? 0,
    confidence: 100,
    rubricVersion: PEMAHAMAN_RUBRIC_VERSION,
    derivationStatus: "deterministic",
    ambiguous: false,
    affectsMastery: event.correctness !== null && event.correctness !== undefined,
    occurredAt: event.createdAt,
  }).onConflictDoNothing();
  await audit(tx, "learning_event", event.id, "dual_write", { ideaId: targetIdea.id }, actorId, event.id);
}

/** Mirror an attempt snapshot without recalculating its legacy grade. */
export async function dualWriteQuizAttempt(
  tx: CompatibilityTx,
  attempt: LegacyQuizAttemptMirror,
  actorId?: string | null,
): Promise<void> {
  if (!isEnabled()) return;
  await requirePengguna(tx, attempt.studentId);
  let [targetAssessment] = await tx.select({ id: asesmen.id }).from(asesmen).where(eq(asesmen.id, attempt.templateId)).limit(1);
  if (!targetAssessment) {
    const [template] = await tx.select().from(quizTemplates).where(eq(quizTemplates.id, attempt.templateId)).limit(1);
    if (template) {
      await createAssessmentWithLegacyProjection({
        id: template.id,
        courseId: template.courseId,
        title: template.title,
        category: template.category,
        visibility: template.visibility,
        status: template.status,
        manualStatus: template.manualStatus,
        timeLimitSeconds: template.timeLimitSeconds,
        maxAttempts: template.maxAttempts,
        selectionRules: (template.selectionRules ?? {}) as Record<string, unknown>,
        openAt: template.openAt,
        closeAt: template.closeAt,
        showDiscussion: template.showDiscussion ?? undefined,
        creatorId: actorId ?? null,
      }, tx as any);
      targetAssessment = { id: template.id };
    } else {
      throw new Error(`Dual-write target assessment is missing for ${attempt.templateId}`);
    }
  }
  const status = attempt.status === "completed" ? "submitted" as const : attempt.status === "abandoned" ? "cancelled" as const : "in_progress" as const;
  const targetRows = await tx.select({ id: percobaanAsesmen.id }).from(percobaanAsesmen).where(eq(percobaanAsesmen.id, attempt.id)).limit(1);
  const snapshotHash = createHash("sha256").update(stableStringify(attempt.questionsSnapshot)).digest("hex");
  if (targetRows.length > 0) {
    await tx.update(percobaanAsesmen).set({
      asesmenId: targetAssessment.id,
      penggunaId: attempt.studentId,
      status,
      renderedQuestionSnapshot: (attempt.questionsSnapshot ?? {}) as Record<string, unknown>,
      submittedAt: attempt.submittedAt,
    }).where(eq(percobaanAsesmen.id, attempt.id));
    await audit(tx, "quiz_attempt", attempt.id, "dual_write_update", { gradePreserved: true, sourceSnapshotHash: snapshotHash, status }, actorId, `${attempt.id}:${status}`);
    return;
  }
  await tx.insert(percobaanAsesmen).values({
    id: attempt.id,
    asesmenId: targetAssessment.id,
    penggunaId: attempt.studentId,
    status,
    renderedQuestionSnapshot: (attempt.questionsSnapshot ?? {}) as Record<string, unknown>,
    optionOrderSnapshot: {},
    gradingPolicySnapshot: { source: "legacy", gradePreserved: true },
    contentVersion: 1,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
  });
  await audit(tx, "quiz_attempt", attempt.id, "dual_write", { gradePreserved: true, sourceSnapshotHash: snapshotHash, status }, actorId, `${attempt.id}:${status}`);
}

/** Material publication mirror. Missing additive targets fail the transaction. */
export async function dualWriteMaterialPublication(
  tx: CompatibilityTx,
  material: LegacyMaterialPublicationMirror,
  actorId?: string | null,
): Promise<void> {
  if (!isEnabled()) return;
  const mataKuliahId = await findCourseTarget(tx, material.courseId);
  const babId = await findChapterTarget(tx, material.chapterId);
  if (!babId) throw new Error(`Dual-write target chapter is missing for ${material.chapterId}`);
  await requirePengguna(tx, material.creatorId);
  const [existingArticle] = await tx
    .select({ id: artikel.id })
    .from(artikel)
    .where(or(eq(artikel.id, material.id), eq(artikel.slug, material.slug)))
    .limit(1);
  const articleId = existingArticle?.id ?? material.id;
  const status = material.status === "published" ? "published" as const : material.status === "withdrawn" ? "withdrawn" as const : "draft" as const;
  await tx.insert(artikel).values({
    id: articleId,
    mataKuliahId,
    babId,
    slug: material.slug,
    title: material.title,
    contentMarkdown: material.canonicalMarkdown,
    version: material.version ?? 1,
    status,
    sourceHash: createHash("sha256").update(material.canonicalMarkdown).digest("hex"),
    generationHash: material.generationHash,
    creatorId: material.creatorId,
    publishedAt: material.publishedAt ?? null,
  }).onConflictDoUpdate({
    target: artikel.id,
    set: {
      contentMarkdown: material.canonicalMarkdown,
      title: material.title,
      status,
      publishedAt: material.publishedAt ?? null,
      updatedAt: new Date(),
    },
  });
  const [existingBlock] = await tx
    .select({ id: blokArtikel.id })
    .from(blokArtikel)
    .where(and(eq(blokArtikel.artikelId, articleId), eq(blokArtikel.blockKey, "legacy-markdown")))
    .limit(1);
  const blockId = existingBlock?.id ?? deterministicId("block", material.id);
  await tx.insert(blokArtikel).values({
    id: blockId,
    artikelId: articleId,
    blockKey: "legacy-markdown",
    blockType: "markdown",
    orderIndex: 0,
    content: material.canonicalMarkdown,
    version: material.version ?? 1,
    generationHash: material.generationHash,
    status: status === "published" ? "published" : status === "withdrawn" ? "withdrawn" : "draft",
  }).onConflictDoUpdate({
    target: blokArtikel.id,
    set: {
      content: material.canonicalMarkdown,
      version: material.version ?? 1,
      generationHash: material.generationHash,
      status: status === "published" ? "published" : status === "withdrawn" ? "withdrawn" : "draft",
      updatedAt: new Date(),
    },
  });
  await audit(tx, "material_publication", material.id, "dual_write", { targetArticleId: articleId, targetBlockId: blockId }, actorId, material.id);
}

/** Keep the legacy concept baseline available without fan-out to every Idea. */
export async function readLegacyConceptMasteryBaseline(
  reader: CompatibilityTx,
  studentId: string,
  courseId: string,
): Promise<Array<Record<string, unknown>>> {
  const rows = await reader.select().from(studentConceptMastery).where(and(eq(studentConceptMastery.studentId, studentId), eq(studentConceptMastery.courseId, courseId)));
  return rows as Array<Record<string, unknown>>;
}

export type LegacyPkaStageProgressMirror = {
  id: string;
  studentId: string;
  subject: string;
  stage: number;
  status: "locked" | "unlocked" | "completed" | "skipped";
  bestScore?: number | null;
  passed?: boolean | null;
  attemptId?: string | null;
};

/**
 * PKA progress is a legacy campaign state machine without a separate additive
 * state table. Preserve each state transition in the target audit stream and
 * link it to the additive attempt when one exists. This keeps the legacy read
 * authoritative while making the compatibility path explicit and replayable.
 */
export async function dualWritePkaStageProgress(
  tx: CompatibilityTx,
  progress: LegacyPkaStageProgressMirror,
  actorId?: string | null,
): Promise<void> {
  if (!isEnabled()) return;
  await requirePengguna(tx, progress.studentId);
  let targetAttemptId: string | null = null;
  if (progress.attemptId) {
    const [targetAttempt] = await tx
      .select({ id: percobaanAsesmen.id })
      .from(percobaanAsesmen)
      .where(eq(percobaanAsesmen.id, progress.attemptId))
      .limit(1);
    targetAttemptId = targetAttempt?.id ?? null;
  }
  await audit(
    tx,
    "pka_stage_progress",
    progress.id,
    "dual_write",
    {
      subject: progress.subject,
      stage: progress.stage,
      status: progress.status,
      bestScore: progress.bestScore ?? null,
      passed: progress.passed ?? null,
      targetAttemptId,
      compatibilityOnly: true,
    },
    actorId,
    `${progress.id}:${progress.status}:${progress.bestScore ?? ""}:${progress.attemptId ?? ""}`,
  );
}

export const compatibilityTables = {
  courses,
  enrollments,
  tutorCourses,
  websiteMaterials,
  artikel,
  artikelIde,
  flashcard,
  flashcardIde,
  flashcardReviews,
};
