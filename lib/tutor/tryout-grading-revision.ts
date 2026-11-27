import { createHash } from "node:crypto";
import { getTableName, sql } from "drizzle-orm";
import { auditMutasi, submissions } from "@/db/schema";
import { stableStringify } from "@/lib/staging/migration-ledger";

// New writes serialize on the submission row and advance the sequence stored
// with their successful audit. Legacy submissions and legacy audits start at 0.
export const tryoutGradeSequence = sql<number>`
  coalesce((
    select max((${auditMutasi.afterSnapshot}->'snapshot'->>'reviewSequence')::numeric)
    from ${auditMutasi}
    where ${auditMutasi.entityType} = 'submission'
      and ${auditMutasi.entityId} = ${sql.identifier(getTableName(submissions))}.${sql.identifier(submissions.id.name)}
      and ${auditMutasi.action} = 'submission:grade'
      and ${auditMutasi.outcome} = 'success'
      and jsonb_typeof(${auditMutasi.afterSnapshot}->'snapshot'->'reviewSequence') = 'number'
  ), 0)
`.mapWith(Number);

type ReviewTarget = {
  id: string;
  examId: string;
  examCourseId: string;
  studentId: string;
  submittedAt: Date | null;
  questionsSnapshot: unknown;
  answersSnapshot: unknown;
};

export function tryoutGradeDigest(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function tryoutReviewTargetDigest(submission: ReviewTarget) {
  return tryoutGradeDigest([submission.id, submission.examId, submission.examCourseId,
    submission.studentId, submission.submittedAt?.toISOString() ?? null,
    submission.questionsSnapshot, submission.answersSnapshot]);
}

export function tryoutReviewRevision(submission: ReviewTarget & {
  reviewSequence: number;
  status: string;
  score: number | null;
  teacherNotes: string | null;
}) {
  return tryoutGradeDigest([tryoutReviewTargetDigest(submission), submission.reviewSequence,
    submission.status, submission.score, submission.teacherNotes]);
}
