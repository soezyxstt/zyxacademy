import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { gamificationEvidenceReceipts, gamificationEventOutbox, gamificationExplanationCompletionsV2, solutionCollections, bab } from '@/db/schema';
import { canAccessCourseContent, resolveCourseAccess } from '@/lib/student/course-access';
import { solutionCollectionSchema } from '@/lib/materials/solution-collection';
import { enqueueGamificationEventsBatch } from './actions';
import { startLearningRewards } from './learning-start';
import type { GamificationEvidenceInput } from './contracts';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export function validateGamificationEvidence(input: GamificationEvidenceInput) {
 if (![input.userId, input.courseId, input.sourceId, input.sourceVersion, input.sourceEvidenceId].every(v => typeof v === 'string' && v.trim()) || !(input.occurredAt instanceof Date) || !Number.isFinite(input.occurredAt.getTime())) throw new Error('INVALID_GAMIFICATION_RECEIPT');
 if (input.source === 'flashcard' && (!Number.isInteger(input.details.grade) || input.details.grade < 0 || input.details.grade > 4 || !['canonical', 'legacy'].includes(input.details.adapter) || !Number.isFinite(Date.parse(input.details.previousDueAt)))) throw new Error('INVALID_GAMIFICATION_RECEIPT');
 // A causally earlier disclosure can have a later wall time after clock skew.
 // Preserve it; the reward policy denies such a retry without rejecting submission.
 if (input.source === 'question' && (typeof input.details.correct !== 'boolean' || !input.details.attemptId || (input.details.lastReveal && (!input.details.lastReveal.attemptId || !Number.isFinite(Date.parse(input.details.lastReveal.occurredAt)))))) throw new Error('INVALID_GAMIFICATION_RECEIPT');
 if (input.source === 'article' && !input.details.sectionIds.length) throw new Error('INVALID_GAMIFICATION_RECEIPT');
 if (input.source === 'explanation' && (!input.details.completionId || !input.details.itemIds.length || input.details.completionId !== input.sourceEvidenceId)) throw new Error('INVALID_GAMIFICATION_RECEIPT');
}
/** Internal only. Source rows and receipts must share the transaction. */
export async function recordGamificationEvidenceBatch(tx: Transaction, inputs: GamificationEvidenceInput[]) {
 const rows = inputs.map(input => {
  validateGamificationEvidence(input);
  return { ...input, id: crypto.randomUUID(), details: input.details };
 });
 if (!rows.length) return [];
 await tx.insert(gamificationEvidenceReceipts).values(rows);
 await enqueueGamificationEventsBatch(tx, rows.map(row => ({ userId: row.userId, source: row.source, sourceId: row.sourceId, evidenceId: row.id, occurredAt: row.occurredAt.toISOString() })));
 return rows.map(row => row.id);
}
export async function recordGamificationEvidence(tx: Transaction, input: GamificationEvidenceInput) {
 return (await recordGamificationEvidenceBatch(tx, [input]))[0];
}
export async function resolveGamificationEvidence(id: string, outboxId?: string) {
 if (outboxId) {
  const [event] = await db.select().from(gamificationEventOutbox).where(eq(gamificationEventOutbox.id, outboxId)).limit(1);
  if (!event || event.evidenceId !== id) return null;
  const [receipt] = await db.select().from(gamificationEvidenceReceipts).where(and(eq(gamificationEvidenceReceipts.id, id), eq(gamificationEvidenceReceipts.userId, event.userId), eq(gamificationEvidenceReceipts.source, event.source), eq(gamificationEvidenceReceipts.sourceId, event.sourceId), eq(gamificationEvidenceReceipts.occurredAt, event.occurredAt))).limit(1);
  return receipt ?? null;
 }
 const [receipt] = await db.select().from(gamificationEvidenceReceipts).where(eq(gamificationEvidenceReceipts.id, id)).limit(1);
 return receipt ?? null;
}
/** Explicit reader completion; the caller authenticates userId from the session. */
export async function completeGamificationExplanation(userId: string, collectionId: string, completedItemIds: string[], expectedVersion?: number) {
 if (typeof userId !== 'string' || !userId.trim() || typeof collectionId !== 'string' || !collectionId.trim() || !Array.isArray(completedItemIds) || completedItemIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(completedItemIds).size !== completedItemIds.length) throw new Error('EXPLANATION_INCOMPLETE');
 return db.transaction(async tx => {
  const [candidate] = await tx.select({ courseId: solutionCollections.courseId }).from(solutionCollections).where(eq(solutionCollections.id, collectionId)).limit(1);
  if (!candidate) throw new Error('EXPLANATION_UNAVAILABLE');
  const now = new Date();

  const [source] = await tx.select({ collection: solutionCollections, chapter: bab }).from(solutionCollections).innerJoin(bab, eq(bab.id, solutionCollections.chapterId)).where(and(eq(solutionCollections.id, collectionId), eq(solutionCollections.status, 'published'), eq(bab.status, 'active'))).limit(1).for('share');
  if (!source || (expectedVersion !== undefined && source.collection.version !== expectedVersion) || source.chapter.mataKuliahId !== source.collection.courseId) throw new Error('EXPLANATION_UNAVAILABLE');
  const access = await resolveCourseAccess({ userId, courseId: source.collection.courseId, now }, tx);
  if (!access.isAuthenticated || !access.isEnrolled || !access.hasFullContentAccess || access.isDemo || access.canonicalCourseId !== source.collection.courseId || !canAccessCourseContent(access, 'article', [source.chapter.id, source.chapter.legacyChapterId])) throw new Error('EXPLANATION_UNAVAILABLE');
  const parsed = solutionCollectionSchema.safeParse(source.collection.content);
  if (!parsed.success || parsed.data.id !== source.collection.productId || parsed.data.title !== source.collection.title || ![source.chapter.id, source.chapter.legacyChapterId].includes(parsed.data.chapter.id) || ![access.canonicalCourseId, access.legacyCourseId].includes(parsed.data.course.id) || parsed.data.items.some(item => item.visuals.some(visual => visual.kind === 'source_figure'))) throw new Error('EXPLANATION_UNAVAILABLE');
  const required = parsed.data.items.map(item => item.id).sort();
  const submitted = [...new Set(completedItemIds)].sort();
  if (!required.length || required.length !== submitted.length || required.some((id, i) => id !== submitted[i])) throw new Error('EXPLANATION_INCOMPLETE');
  const start = await startLearningRewards(tx, userId, source.collection.courseId, now);
  if (!start) return null;
  const id = crypto.randomUUID();
  const [completion] = await tx.insert(gamificationExplanationCompletionsV2).values({ id, userId, collectionId, collectionVersion: source.collection.version, completedAt: now, itemIds: required }).onConflictDoNothing().returning();
  if (!completion) return null;
  await recordGamificationEvidence(tx, { userId, courseId: source.collection.courseId, source: 'explanation', sourceId: source.collection.productId, sourceVersion: String(source.collection.version), sourceEvidenceId: id, occurredAt: now, details: { completionId: id, itemIds: required } });
  return completion;
 });
}
