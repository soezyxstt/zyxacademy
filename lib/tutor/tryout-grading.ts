import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { auditMutasi, exams, mataKuliah, submissions } from "@/db/schema";
import { QuizTemplateWriteError, requireNativeQuizWriter } from "@/lib/asesmen/quiz-template-write";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { requireTutorCourseAccess } from "@/lib/auth/tutor-access";
import { buildTutorMutationAuditRow, recordTutorMutationAudit } from "@/lib/audit/mutasi";
import { tryoutGradeRevisionPattern } from "@/packages/academic/tryout-grade";
import {
  buildGradingSnapshots, checkCourseMatch, isReviewableSubmissionStatus,
  recordTutorFailureAudit, recordTutorMutationAuditSafe, resolveActorRoles, TUTOR_CAPABILITY_ERRORS,
} from "./assessment-policy";
import { tryoutGradeDigest, tryoutGradeSequence, tryoutReviewRevision, tryoutReviewTargetDigest } from "./tryout-grading-revision";
import { TRYOUT_GRADE_REQUEST_CONFLICT, tryoutGradeInputSchema, type TryoutGradeInput } from "./tryout-grading-contract";

type Grader = {
  id: string;
  role?: string | null;
  native?: { requestId: string; sessionId: string };
};

export async function gradeTryoutSubmission(grader: Grader, input: TryoutGradeInput) {
  const { courseId, submissionId, ...fields } = input;
  const { roles, isAdmin } = await resolveActorRoles(grader.id, grader.role);
  let access;
  const event = {
    actorId: grader.id, actorRoles: roles, entityType: "submission", entityId: submissionId,
    entityVersion: 1, action: "submission:grade",
  };
  try {
    access = await requireTutorCourseAccess(grader.id, courseId, { allowAdmin: !grader.native && isAdmin });
  } catch (error) {
    await recordTutorMutationAuditSafe({ ...event, courseId, outcome: "rejected",
      reason: error instanceof Error ? error.message : TUTOR_CAPABILITY_ERRORS.ACCESS_DENIED });
    throw error;
  }

  const parsed = tryoutGradeInputSchema.safeParse(fields);
  const auditCourseId = access.courseId ?? courseId;
  if (!parsed.success || (grader.native && !parsed.data.expectedRevision)) {
    const message = "Validasi gagal: Periksa nilai, catatan, dan versi penilaian.";
    await recordTutorFailureAudit({ ...event, courseId: auditCourseId, outcome: "rejected", requestId: `req-${randomUUID()}`, reason: message });
    throw new Error(message);
  }

  const { score, notes, expectedRevision } = parsed.data;
  const requestId = grader.native
    ? `req-native-tryout-${tryoutGradeDigest([grader.id, grader.native.sessionId, auditCourseId, submissionId, grader.native.requestId])}`
    : `req-${randomUUID()}`;
  const audit = { ...event, courseId: auditCourseId, requestId, outcome: "success", reason: "Tryout submission graded" } as const;
  const receiptId = grader.native ? buildTutorMutationAuditRow(audit).id : null;

  try {
    return await db.transaction(async (tx) => {
      // Assignment and role writers take an exclusive lock on this same actor row.
      let current;
      if (grader.native) {
        current = await requireNativeQuizWriter(tx, { actorId: grader.id, sessionId: grader.native.sessionId, courseId, role: "tutor" });
      } else {
        await assertAuthoringActor(tx, grader.id, {
          roles: isAdmin ? ["admin", "tutor"] : ["tutor"], error: TUTOR_CAPABILITY_ERRORS.ACCESS_DENIED, lock: true,
        });
        current = await requireTutorCourseAccess(grader.id, courseId, { allowAdmin: isAdmin }, tx);
      }
      const [course] = await tx.select({ status: mataKuliah.status, legacyId: mataKuliah.legacyCourseId })
        .from(mataKuliah).where(eq(mataKuliah.id, auditCourseId)).for("share");
      if (!course || course.status !== "active" || current.courseId !== auditCourseId || course.legacyId !== current.legacyCourseId) {
        throw new Error(TUTOR_CAPABILITY_ERRORS.ACCESS_DENIED);
      }

      const [submission] = await tx.select().from(submissions).where(eq(submissions.id, submissionId)).for("update");
      if (!submission) throw new Error(TUTOR_CAPABILITY_ERRORS.SUBMISSION_NOT_FOUND);
      const [exam] = await tx.select({ courseId: exams.courseId, type: exams.type }).from(exams).where(eq(exams.id, submission.examId)).for("share");
      if (!exam || !checkCourseMatch(exam.courseId, auditCourseId, current.legacyCourseId)) {
        throw new Error(TUTOR_CAPABILITY_ERRORS.GRADING_COURSE_MISMATCH);
      }
      if (exam.type !== "tryout") throw new Error(TUTOR_CAPABILITY_ERRORS.GRADING_NON_TRYOUT_FORBIDDEN);
      if (!isReviewableSubmissionStatus(submission.status)) throw new Error(TUTOR_CAPABILITY_ERRORS.GRADING_NOT_REVIEWABLE);

      // This read starts after acquiring the row lock. A concurrent grade's
      // committed audit is therefore visible under READ COMMITTED.
      const [{ reviewSequence }] = await tx.select({ reviewSequence: tryoutGradeSequence })
        .from(submissions).where(eq(submissions.id, submission.id));
      const target = { ...submission, studentId: submission.userId, examCourseId: exam.courseId, reviewSequence };
      const requestDigest = receiptId && tryoutGradeDigest([expectedRevision, score, notes, tryoutReviewTargetDigest(target)]);
      if (receiptId) {
        const [receipt] = await tx.select({ actorId: auditMutasi.actorId, after: auditMutasi.afterSnapshot })
          .from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
        if (receipt) {
          const snapshot = receipt.after?.snapshot as Record<string, unknown> | undefined;
          const revision = snapshot?.reviewRevision;
          if (receipt.actorId !== grader.id || snapshot?.requestDigest !== requestDigest ||
            typeof revision !== "string" || !tryoutGradeRevisionPattern.test(revision)) {
            throw new Error(TRYOUT_GRADE_REQUEST_CONFLICT);
          }
          return { success: true as const, reviewRevision: revision };
        }
      }

      const revision = tryoutReviewRevision(target);
      if (expectedRevision && revision !== expectedRevision) {
        throw new Error(TUTOR_CAPABILITY_ERRORS.GRADING_CONCURRENT_CONFLICT);
      }
      const nextSequence = reviewSequence + 1;
      if (!Number.isSafeInteger(nextSequence) || nextSequence < 1) throw new Error("INVALID_TRYOUT_REVIEW_SEQUENCE");
      const updated = await tx.update(submissions).set({ score, teacherNotes: notes, status: "graded" })
        .where(and(eq(submissions.id, submission.id), eq(submissions.examId, submission.examId),
          eq(submissions.userId, submission.userId), eq(submissions.status, submission.status),
          sql`${submissions.score} is not distinct from ${submission.score}`,
          sql`${submissions.teacherNotes} is not distinct from ${submission.teacherNotes}`,
        )).returning({ id: submissions.id });
      if (updated.length !== 1) throw new Error(TUTOR_CAPABILITY_ERRORS.GRADING_CONCURRENT_CONFLICT);

      const reviewRevision = tryoutReviewRevision({ ...target, score, teacherNotes: notes, status: "graded", reviewSequence: nextSequence });
      const { beforeSnapshot, afterSnapshot } = buildGradingSnapshots(submission, score, notes);
      await recordTutorMutationAudit({
        ...audit, before: beforeSnapshot,
        after: { ...afterSnapshot, reviewSequence: nextSequence, ...(receiptId ? { requestDigest, reviewRevision } : {}) },
      }, tx);
      return { success: true as const, reviewRevision };
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Failed to update submission";
    const rejected = error instanceof QuizTemplateWriteError || [
      TUTOR_CAPABILITY_ERRORS.SUBMISSION_NOT_FOUND, TUTOR_CAPABILITY_ERRORS.GRADING_COURSE_MISMATCH,
      TUTOR_CAPABILITY_ERRORS.GRADING_NON_TRYOUT_FORBIDDEN, TUTOR_CAPABILITY_ERRORS.GRADING_NOT_REVIEWABLE,
      TUTOR_CAPABILITY_ERRORS.ACCESS_DENIED, TUTOR_CAPABILITY_ERRORS.GRADING_CONCURRENT_CONFLICT, TRYOUT_GRADE_REQUEST_CONFLICT,
    ].some((value) => reason.startsWith(value));
    await recordTutorMutationAuditSafe({ ...event, courseId: auditCourseId, outcome: rejected ? "rejected" : "failed", reason });
    throw error;
  }
}
