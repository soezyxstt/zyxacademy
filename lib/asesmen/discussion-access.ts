import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { db as DbInstance } from "@/db";
import { assessmentDiscussionAccess, studentQuizAttempts, submissions } from "@/db/schema";

export type AssessmentDiscussionKind = "quiz" | "tryout";

type DbExecutor = Pick<typeof DbInstance, "select" | "insert">;
type DbSelectExecutor = Pick<typeof DbInstance, "select">;

async function resolveDefaultExecutor(): Promise<DbExecutor> {
  const { db } = await import("@/db");
  return db;
}

export interface RecordAssessmentDiscussionAccessInput {
  userId: string;
  courseId: string;
  assessmentKind: AssessmentDiscussionKind;
  assessmentId: string;
  hasCompletedAttempt?: boolean;
  executor?: DbExecutor;
}

export interface RecordAssessmentDiscussionAccessResult {
  recorded: boolean;
  openedBeforeCompletion: boolean;
  firstOpenedAt: Date;
}

export interface HasOpenedDiscussionBeforeCompletionInput {
  userId: string;
  assessmentKind: AssessmentDiscussionKind;
  assessmentId: string;
  executor?: DbSelectExecutor;
}

export function computeLeaderboardEligibility({
  openedDiscussionBeforeCompletion,
}: {
  openedDiscussionBeforeCompletion: boolean;
}): boolean {
  return !openedDiscussionBeforeCompletion;
}

async function detectHasCompletedAttempt(
  executor: DbSelectExecutor,
  userId: string,
  assessmentKind: AssessmentDiscussionKind,
  assessmentId: string,
): Promise<boolean> {
  if (assessmentKind === "quiz") {
    const [attempt] = await executor
      .select({ id: studentQuizAttempts.id })
      .from(studentQuizAttempts)
      .where(
        and(
          eq(studentQuizAttempts.studentId, userId),
          eq(studentQuizAttempts.templateId, assessmentId),
          eq(studentQuizAttempts.status, "completed"),
        ),
      )
      .limit(1);
    return Boolean(attempt);
  }

  const [submission] = await executor
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, userId),
        eq(submissions.examId, assessmentId),
      ),
    )
    .limit(1);
  return Boolean(submission);
}

/**
 * Idempotently records when a student first opens pembahasan for a quiz or tryout.
 * The first access determines `openedBeforeCompletion` and is preserved on subsequent opens.
 */
export async function recordAssessmentDiscussionAccess({
  userId,
  courseId,
  assessmentKind,
  assessmentId,
  hasCompletedAttempt,
  executor,
}: RecordAssessmentDiscussionAccessInput): Promise<RecordAssessmentDiscussionAccessResult> {
  const activeExecutor = executor ?? (await resolveDefaultExecutor());
  const completedBeforeOpen =
    typeof hasCompletedAttempt === "boolean"
      ? hasCompletedAttempt
      : await detectHasCompletedAttempt(activeExecutor, userId, assessmentKind, assessmentId);

  const openedBeforeCompletion = !completedBeforeOpen;

  const inserted = await activeExecutor
    .insert(assessmentDiscussionAccess)
    .values({
      id: randomUUID(),
      userId,
      courseId,
      assessmentKind,
      assessmentId,
      openedBeforeCompletion,
    })
    .onConflictDoNothing({
      target: [
        assessmentDiscussionAccess.userId,
        assessmentDiscussionAccess.assessmentKind,
        assessmentDiscussionAccess.assessmentId,
      ],
    })
    .returning({
      openedBeforeCompletion: assessmentDiscussionAccess.openedBeforeCompletion,
      firstOpenedAt: assessmentDiscussionAccess.firstOpenedAt,
    });

  if (inserted.length > 0) {
    return {
      recorded: true,
      openedBeforeCompletion: inserted[0].openedBeforeCompletion,
      firstOpenedAt: inserted[0].firstOpenedAt,
    };
  }

  const [existing] = await activeExecutor
    .select({
      openedBeforeCompletion: assessmentDiscussionAccess.openedBeforeCompletion,
      firstOpenedAt: assessmentDiscussionAccess.firstOpenedAt,
    })
    .from(assessmentDiscussionAccess)
    .where(
      and(
        eq(assessmentDiscussionAccess.userId, userId),
        eq(assessmentDiscussionAccess.assessmentKind, assessmentKind),
        eq(assessmentDiscussionAccess.assessmentId, assessmentId),
      ),
    )
    .limit(1);

  return {
    recorded: false,
    openedBeforeCompletion: existing?.openedBeforeCompletion ?? openedBeforeCompletion,
    firstOpenedAt: existing?.firstOpenedAt ?? new Date(),
  };
}

/**
 * Returns true if the student opened pembahasan for this assessment before completing an attempt.
 */
export async function hasOpenedDiscussionBeforeCompletion({
  userId,
  assessmentKind,
  assessmentId,
  executor,
}: HasOpenedDiscussionBeforeCompletionInput): Promise<boolean> {
  const activeExecutor = executor ?? (await resolveDefaultExecutor());
  const [row] = await activeExecutor
    .select({
      openedBeforeCompletion: assessmentDiscussionAccess.openedBeforeCompletion,
    })
    .from(assessmentDiscussionAccess)
    .where(
      and(
        eq(assessmentDiscussionAccess.userId, userId),
        eq(assessmentDiscussionAccess.assessmentKind, assessmentKind),
        eq(assessmentDiscussionAccess.assessmentId, assessmentId),
      ),
    )
    .limit(1);

  return Boolean(row?.openedBeforeCompletion);
}
