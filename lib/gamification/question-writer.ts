import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { gamificationLearningFacts, studentQuizAttempts } from '@/db/schema';
import { resolveCourseAccess } from '@/lib/student/course-access';
import { matchRewardSnapshots } from './question-exposure-policy';
import { getLatestQuestionExposures, initializeQuestionExposureHistoryBatch, lockQuestionExposures, recordSubmissionBoundaries } from './question-exposure';
import { startLearningRewards } from './learning-start';
import { recordGamificationEvidenceBatch } from './receipts';
import { checkAnswerCorrectness } from './question-grading';
import type { GamificationEvidenceInput } from './contracts';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Called after locking and completing the owned attempt, in the submission transaction. */
export async function writeQuestionRewards(tx: Tx, input: { userId: string; attemptId: string; snapshot: unknown[]; answers: Record<string, unknown>; occurredAt: Date }) {
 const [attempt] = await tx.select({ snapshot: studentQuizAttempts.questionsSnapshot }).from(studentQuizAttempts).where(and(eq(studentQuizAttempts.id, input.attemptId), eq(studentQuizAttempts.studentId, input.userId))).limit(1);
 if (!attempt) throw new Error('QUESTION_EXPOSURE_ATTEMPT_NOT_FOUND');
 if (!Array.isArray(attempt.snapshot)) return;
 // The held snapshot is authoritative. Require a matching caller snapshot as well.
 const valid = matchRewardSnapshots(input.snapshot, attempt.snapshot);
 await lockQuestionExposures(tx, input.userId, valid.map(row => row.identity.canonicalQuestionId));
 const histories = valid.map(({ identity }) => ({ ...identity, userId: input.userId, attemptId: input.attemptId, occurredAt: input.occurredAt }));
 await initializeQuestionExposureHistoryBatch(tx, histories);
 await recordSubmissionBoundaries(tx, histories);
 const latest = await getLatestQuestionExposures(tx, input.userId, valid.map(row => row.identity.canonicalQuestionId), input.attemptId);
 const approved = new Map<string, boolean>();
 for (const { identity } of valid) {
  if (approved.has(identity.courseId)) continue;
  const access = await resolveCourseAccess({ userId: input.userId, courseId: identity.courseId, now: input.occurredAt }, tx);
  const allowed = access.isAuthenticated && access.isEnrolled && access.hasFullContentAccess && !access.isDemo && access.canonicalCourseId === identity.courseId;
  approved.set(identity.courseId, Boolean(allowed && await startLearningRewards(tx, input.userId, identity.courseId, input.occurredAt)));
 }
 const facts = valid.filter(({ identity }) => approved.get(identity.courseId)).map(({ q, identity }) => {
  const reveal = latest.get(identity.canonicalQuestionId);
  return { id: `question:${input.attemptId}:${identity.canonicalQuestionId}`, userId: input.userId, courseId: identity.courseId, source: 'question' as const, sourceId: identity.canonicalQuestionId, sourceVersion: identity.sourceVersion, occurredAt: input.occurredAt, attemptId: input.attemptId, correct: checkAnswerCorrectness(q, input.answers[identity.canonicalQuestionId]), lastRevealAttemptId: reveal?.attemptIdentity ?? null, lastRevealAt: reveal?.exposedAt ?? null };
 });
 if (!facts.length) return;
 const inserted = await tx.insert(gamificationLearningFacts).values(facts).onConflictDoNothing().returning({ id: gamificationLearningFacts.id });
 const insertedIds = new Set(inserted.map(row => row.id));
 const evidence: GamificationEvidenceInput[] = facts.filter(fact => insertedIds.has(fact.id)).map(fact => ({ userId: fact.userId, courseId: fact.courseId, source: 'question', sourceId: fact.sourceId, sourceVersion: fact.sourceVersion, sourceEvidenceId: fact.id, occurredAt: fact.occurredAt, details: { attemptId: fact.attemptId, correct: fact.correct, lastReveal: fact.lastRevealAt && fact.lastRevealAttemptId ? { attemptId: fact.lastRevealAttemptId, occurredAt: fact.lastRevealAt.toISOString() } : null } }));
 await recordGamificationEvidenceBatch(tx, evidence);
}
