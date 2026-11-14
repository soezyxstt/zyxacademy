import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { gamificationAccounts, gamificationBadges, gamificationChecklists, gamificationChecklistItems, gamificationCourseStarts, gamificationEventOutbox, gamificationEvidenceReceipts, gamificationArticleCompletions, artikel, bagianArtikel, gamificationExplanationCompletionsV2, gamificationBadgeActivities, gamificationLeaderboardPeriods, gamificationLpLedger, gamificationQualifiedDays, gamificationXpLedger, solutionCollections, gamificationLearningFacts, gamificationEligibleRecalls, studentQuizAttempts, soal, flashcard, setFlashcard, reviewFlashcard, kemajuanFlashcardMurid, flashcardReviews } from '@/db/schema';
import { gamificationPeriodKey, jakartaDay, startOfJakartaDayUtc } from '@/lib/date-utils';
import { resolveCourseAccess } from '@/lib/student/course-access';
import { solutionCollectionSchema } from '@/lib/materials/solution-collection';
import { courseCreditMicro, rankForTotals } from './policy';
import { crossedBadgeTiers, rewardForEvent, sameIds, recallDecision } from './processor-policy';
import { ensureGamificationMissions, advanceGamificationMissions } from './missions';
import { snapshotExposureIdentity } from './question-exposure-policy';
import { getQuestionExposureObservation, lockCanonicalQuestions, lockQuestionExposure, lockQuestionExposures } from './question-exposure';
import { checkAnswerCorrectness } from './question-grading';
import { isEligibleQuestionRetry } from './evidence';
import type { BadgeFamily } from './contracts';
import { scheduleOutboxUsers } from './outbox-scheduling';
import { announceBadge, announceRank } from './celebrations';
import { RANKS } from './catalog';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
class Reject extends Error {
 constructor(readonly code = 'INVALID_EVIDENCE') { super(code); }
}

async function badge(tx: Tx, userId: string, family: BadgeFamily, identity: string) {
 const [activity] = await tx.insert(gamificationBadgeActivities).values({ userId, family, identity }).onConflictDoNothing().returning();
 if (!activity) return 0;
 const [existing] = await tx.select().from(gamificationBadges).where(and(eq(gamificationBadges.userId, userId), eq(gamificationBadges.family, family)));
 const count = (existing?.count ?? 0) + 1;
 const tiers = crossedBadgeTiers(family, existing?.tier ?? 0, count);
 let lp = 0;
 for (const tier of tiers) {
  const [inserted] = await tx.insert(gamificationLpLedger).values({ id: crypto.randomUUID(), userId, rewardKey: `badge:${family}:${tier.tier}`, amount: tier.lp, reason: 'badge' }).onConflictDoNothing().returning();
  if (inserted) {
   lp += tier.lp;
   await announceBadge(tx, userId, family, tier.tier, tier.lp);
  }
 }
 await tx.insert(gamificationBadges).values({ userId, family, count, tier: tiers.at(-1)?.tier ?? existing?.tier ?? 0 }).onConflictDoUpdate({ target: [gamificationBadges.userId, gamificationBadges.family], set: { count, tier: tiers.at(-1)?.tier ?? existing?.tier ?? 0, updatedAt: new Date() } });
 return lp;
}

async function processOne(tx: Tx, event: typeof gamificationEventOutbox.$inferSelect) {
 const [receipt] = await tx.select().from(gamificationEvidenceReceipts).where(eq(gamificationEvidenceReceipts.id, event.evidenceId));
 if (!receipt || receipt.userId !== event.userId || receipt.source !== event.source || receipt.sourceId !== event.sourceId || receipt.occurredAt.getTime() !== event.occurredAt.getTime()) throw new Reject();
 if (event.occurredAt > new Date()) throw new Reject();
 if (!['explanation', 'flashcard', 'article', 'question'].includes(event.source)) throw new Reject();
 const access = await resolveCourseAccess({ userId: event.userId, courseId: receipt.courseId, now: event.occurredAt }, tx);
 if (!access.isAuthenticated || !access.isEnrolled || !access.hasFullContentAccess || access.isDemo || access.canonicalCourseId !== receipt.courseId) throw new Reject();
 const [start] = await tx.select().from(gamificationCourseStarts).where(and(eq(gamificationCourseStarts.userId, event.userId), eq(gamificationCourseStarts.courseId, receipt.courseId)));
 if (!start || event.occurredAt < start.startedAt) throw new Reject();
 const [item] = await tx.select().from(gamificationChecklistItems).where(and(eq(gamificationChecklistItems.checklistId, start.checklistId), eq(gamificationChecklistItems.category, event.source), eq(gamificationChecklistItems.sourceId, event.sourceId), eq(gamificationChecklistItems.contentVersion, receipt.sourceVersion)));
 const [checklist] = await tx.select().from(gamificationChecklists).where(and(eq(gamificationChecklists.id, start.checklistId), eq(gamificationChecklists.courseId, receipt.courseId), eq(gamificationChecklists.status, 'approved')));
 if (!item || !checklist) throw new Reject();
 let qualifiesXp = true;
 let recallEvidenceId: string | null = null;
 let questionEligible = false, comeback = false;
 if (event.source === 'explanation') {
 const [source] = await tx.select({ completion: gamificationExplanationCompletionsV2, collection: solutionCollections }).from(gamificationExplanationCompletionsV2).innerJoin(solutionCollections, eq(solutionCollections.id, gamificationExplanationCompletionsV2.collectionId)).where(eq(gamificationExplanationCompletionsV2.id, receipt.sourceEvidenceId));
 const parsed = source && solutionCollectionSchema.safeParse(source.collection.content);
 if (!source || !parsed || !parsed.success || source.completion.userId !== event.userId || String(source.completion.collectionVersion) !== receipt.sourceVersion || source.completion.completedAt.getTime() !== event.occurredAt.getTime() || source.collection.courseId !== receipt.courseId || source.collection.status !== 'published' || source.collection.productId !== event.sourceId || String(source.collection.version) !== receipt.sourceVersion || source.collection.publishedAt > event.occurredAt || parsed.data.id !== event.sourceId || receipt.details.completionId !== source.completion.id || !sameIds(source.completion.itemIds, parsed.data.items.map(x => x.id)) || !sameIds(receipt.details.itemIds, source.completion.itemIds)) throw new Reject();
 } else if (event.source === 'article') {
  const [completion] = await tx.select().from(gamificationArticleCompletions).where(eq(gamificationArticleCompletions.id, receipt.sourceEvidenceId));
  const [article] = await tx.select().from(artikel).where(eq(artikel.id, event.sourceId));
  const sections = article ? await tx.select({ id: bagianArtikel.id }).from(bagianArtikel).where(and(eq(bagianArtikel.artikelId, article.id), eq(bagianArtikel.version, article.version), eq(bagianArtikel.status, 'published'))) : [];
  const evidence = completion?.evidence;
  if (!completion || completion.userId !== event.userId || completion.courseId !== receipt.courseId || completion.articleId !== event.sourceId || String(completion.articleVersion) !== receipt.sourceVersion || completion.completedAt.getTime() !== event.occurredAt.getTime() || !article || article.mataKuliahId !== receipt.courseId || article.status !== 'published' || article.version !== completion.articleVersion || !article.publishedAt || article.publishedAt > completion.completedAt || !sameIds(completion.sectionIds, sections.map(section => section.id)) || !sameIds(receipt.details.sectionIds, completion.sectionIds) || !Array.isArray(evidence) || !sameIds(evidence.map(row => row?.sectionId), completion.sectionIds) || new Set(evidence.map(row => row?.id)).size !== evidence.length || evidence.some(row => !row || typeof row.id !== 'string' || !row.id || typeof row.completedAt !== 'string' || !Number.isFinite(Date.parse(row.completedAt)) || new Date(row.completedAt) < start.startedAt || new Date(row.completedAt) > completion.completedAt)) throw new Reject();
 } else if (event.source === 'question') {
  await lockQuestionExposure(tx, event.userId, event.sourceId);
  const [fact] = await tx.select().from(gamificationLearningFacts).where(eq(gamificationLearningFacts.id, receipt.sourceEvidenceId));
  const [original] = fact?.attemptId ? await tx.select().from(studentQuizAttempts).where(and(eq(studentQuizAttempts.id, fact.attemptId), eq(studentQuizAttempts.studentId, event.userId))) : [];
  const [canonical] = await tx.select().from(soal).where(eq(soal.id, event.sourceId)).for('share');
  const matching = Array.isArray(original?.questionsSnapshot) ? original.questionsSnapshot.filter((q: any) => q?.id === event.sourceId) : [];
  const question = matching[0] as any;
  const identity = snapshotExposureIdentity(question);
  const details = receipt.details.lastReveal as { attemptId?: unknown; occurredAt?: unknown } | null;
  if (!fact || fact.id !== `question:${fact.attemptId}:${event.sourceId}` || fact.source !== 'question' || fact.userId !== event.userId || fact.courseId !== receipt.courseId || fact.sourceId !== event.sourceId || fact.sourceVersion !== receipt.sourceVersion || fact.occurredAt.getTime() !== event.occurredAt.getTime() || !fact.attemptId || typeof fact.correct !== 'boolean' || !original || original.status !== 'completed' || !original.submittedAt || original.submittedAt.getTime() !== event.occurredAt.getTime() || matching.length !== 1 || !identity || identity.courseId !== receipt.courseId || identity.sourceVersion !== receipt.sourceVersion || !canonical || canonical.status !== 'published' || canonical.mataKuliahId !== receipt.courseId || String(canonical.version) !== receipt.sourceVersion || canonical.questionType !== question.question_type || !Array.isArray(canonical.optionsSnapshot) || !canonical.optionsSnapshot.every((o: any) => o && typeof o === 'object') || JSON.stringify(canonical.optionsSnapshot.map((o: any) => o.text)) !== JSON.stringify(question.options) || JSON.stringify(canonical.optionsSnapshot.flatMap((o: any, i: number) => o.isCorrect ? [i] : [])) !== JSON.stringify(question.correct_indices) || receipt.details.attemptId !== fact.attemptId || receipt.details.correct !== fact.correct || checkAnswerCorrectness(question, ((original.answersSnapshot ?? {}) as Record<string, unknown>)[event.sourceId]) !== fact.correct) throw new Reject();
  const observation = await getQuestionExposureObservation(tx, event.userId, event.sourceId, fact.attemptId);
  if (!observation || observation.courseId !== receipt.courseId || observation.sourceVersion !== receipt.sourceVersion || (observation.attemptIdentity ?? null) !== fact.lastRevealAttemptId || (observation.exposedAt?.getTime() ?? null) !== (fact.lastRevealAt?.getTime() ?? null) || (details?.attemptId ?? null) !== fact.lastRevealAttemptId || (details?.occurredAt ?? null) !== (fact.lastRevealAt?.toISOString() ?? null)) throw new Reject();
  let revealAttempt = fact.lastRevealAttemptId;
  if (revealAttempt && revealAttempt !== 'baseline') { try { const parsed = JSON.parse(revealAttempt); if (Array.isArray(parsed) && typeof parsed[0] === 'string') revealAttempt = parsed[0]; } catch { /* legacy identity */ } }
  questionEligible = isEligibleQuestionRetry({ correct: fact.correct, attemptId: fact.attemptId, occurredAt: fact.occurredAt, lastReveal: fact.lastRevealAt && revealAttempt ? { attemptId: revealAttempt, occurredAt: fact.lastRevealAt } : null });
  if (!questionEligible) return;
  const [previous] = await tx.select({ id: gamificationLearningFacts.id }).from(gamificationLearningFacts).where(and(eq(gamificationLearningFacts.userId, event.userId), eq(gamificationLearningFacts.source, 'question'), eq(gamificationLearningFacts.sourceId, event.sourceId), eq(gamificationLearningFacts.sourceVersion, receipt.sourceVersion), eq(gamificationLearningFacts.correct, false), sql`${gamificationLearningFacts.occurredAt} < ${startOfJakartaDayUtc(event.occurredAt)}`)).limit(1);
  comeback = Boolean(previous);
 } else {
  const [fact] = await tx.select().from(gamificationLearningFacts).where(eq(gamificationLearningFacts.id, receipt.sourceEvidenceId));
  const [card] = await tx.select({ card: flashcard, set: setFlashcard }).from(flashcard).innerJoin(setFlashcard, eq(flashcard.setFlashcardId, setFlashcard.id)).where(eq(flashcard.id, event.sourceId));
  if (!fact || fact.source !== 'flashcard' || fact.userId !== event.userId || fact.courseId !== receipt.courseId || fact.sourceId !== event.sourceId || fact.sourceVersion !== receipt.sourceVersion || fact.occurredAt.getTime() !== event.occurredAt.getTime() || fact.grade === null || !fact.previousDueAt || !fact.adapter || receipt.details.grade !== fact.grade || receipt.details.adapter !== fact.adapter || receipt.details.previousDueAt !== fact.previousDueAt.toISOString() || !card || card.card.status !== 'published' || card.set.status !== 'published' || card.set.mataKuliahId !== receipt.courseId || String(card.card.version) !== receipt.sourceVersion || (card.set.publishedAt !== null && card.set.publishedAt > event.occurredAt)) throw new Reject();
  if (fact.adapter === 'canonical') {
   const [original] = await tx.select({ review: reviewFlashcard, progress: kemajuanFlashcardMurid }).from(reviewFlashcard).innerJoin(kemajuanFlashcardMurid, eq(reviewFlashcard.kemajuanFlashcardMuridId, kemajuanFlashcardMurid.id)).where(eq(reviewFlashcard.id, fact.id));
   if (!original || original.progress.penggunaId !== event.userId || original.progress.flashcardId !== event.sourceId || original.review.grade !== fact.grade || original.review.reviewedAt.getTime() !== event.occurredAt.getTime() || original.review.previousDueAt.getTime() !== fact.previousDueAt.getTime()) throw new Reject();
  } else if (fact.adapter === 'legacy') {
   const [original] = await tx.select().from(flashcardReviews).where(eq(flashcardReviews.id, fact.id));
   if (!original || original.studentId !== event.userId || original.flashcardId !== event.sourceId || original.grade !== fact.grade || original.reviewedAt.getTime() !== event.occurredAt.getTime()) throw new Reject();
  } else throw new Reject();
  const [previous] = await tx.select().from(gamificationEligibleRecalls).where(and(eq(gamificationEligibleRecalls.userId, event.userId), eq(gamificationEligibleRecalls.checklistItemId, item.id))).orderBy(desc(gamificationEligibleRecalls.reviewedAt)).limit(1);
  const decision = recallDecision(fact.grade, fact.occurredAt, fact.previousDueAt, previous?.reviewedAt ?? null);
  if (!decision.eligible) return;
  const [inserted] = await tx.insert(gamificationEligibleRecalls).values({ sourceEvidenceId: fact.id, userId: event.userId, checklistItemId: item.id, reviewedAt: fact.occurredAt, previousDueAt: fact.previousDueAt }).onConflictDoNothing().returning();
  if (!inserted) return;
  qualifiesXp = decision.qualifiesXp;
  recallEvidenceId = fact.id;
 }
 await tx.insert(gamificationAccounts).values({ userId: event.userId }).onConflictDoNothing();
 const [account] = await tx.select().from(gamificationAccounts).where(eq(gamificationAccounts.userId, event.userId));
 const reward = rewardForEvent(item.baseXpMicro, account.baseXpMicro, account.bonusXpMicro, account.courseCreditsMicro);
 const [awarded] = qualifiesXp ? await tx.insert(gamificationXpLedger).values({ id: crypto.randomUUID(), userId: event.userId, eventId: event.id, rewardKey: `item:${item.id}`, baseXpMicro: item.baseXpMicro, bonusXpMicro: reward.bonusXpMicro, rankKey: reward.rank }).onConflictDoNothing().returning() : [];
 const missionEligible = Boolean(awarded || recallEvidenceId || questionEligible);
 const missionEvent = { userId: event.userId, eventId: event.id, activityId: event.source === 'question' ? `question:${event.sourceId}` : `${event.source}:${event.sourceId}:${receipt.sourceVersion}`, source: event.source as 'article' | 'explanation' | 'flashcard' | 'question', occurredAt: event.occurredAt, qualifiedDay: true, eligible: missionEligible };
 if (!missionEligible) return;
 await ensureGamificationMissions(tx, event.userId, event.occurredAt, { itemId: item.id, source: missionEvent.source, activityId: missionEvent.activityId });
 if (awarded) for (const period of ['week', 'month', 'all'] as const) {
  const periodKey = gamificationPeriodKey(period, event.occurredAt);
  await tx.insert(gamificationLeaderboardPeriods).values({ userId: event.userId, periodKey, baseXpMicro: item.baseXpMicro }).onConflictDoUpdate({ target: [gamificationLeaderboardPeriods.userId, gamificationLeaderboardPeriods.periodKey], set: { baseXpMicro: sql`${gamificationLeaderboardPeriods.baseXpMicro} + ${item.baseXpMicro}`, updatedAt: new Date() } });
 }
 let lp = questionEligible ? await badge(tx, event.userId, 'practice_knight', event.sourceId) : recallEvidenceId ? await badge(tx, event.userId, 'memory_guardian', recallEvidenceId) : await badge(tx, event.userId, 'warrior_reader', event.source === 'article' ? `article:${event.sourceId}:${receipt.sourceVersion}` : `${event.source}:${event.sourceId}`);
 if (questionEligible && comeback) lp += await badge(tx, event.userId, 'comeback_champion', event.sourceId);
 const weekKey = gamificationPeriodKey('week', event.occurredAt);
 const [day] = await tx.insert(gamificationQualifiedDays).values({ userId: event.userId, dayKey: jakartaDay(event.occurredAt), weekKey }).onConflictDoNothing().returning();
 if (day) {
  lp += await badge(tx, event.userId, 'steady_scholar', jakartaDay(event.occurredAt));
  const days = await tx.select({ day: gamificationQualifiedDays.dayKey }).from(gamificationQualifiedDays).where(and(eq(gamificationQualifiedDays.userId, event.userId), eq(gamificationQualifiedDays.weekKey, weekKey))).limit(5);
  if (days.length === 4) lp += await badge(tx, event.userId, 'consistency_captain', weekKey);
 }
 lp += (await advanceGamificationMissions(tx, missionEvent)).awardedLp;
 // Reward keys are the durable per-item completion identities. This query is bounded by the frozen checklist, not user history.
 const remaining = await tx.select({ id: gamificationChecklistItems.id }).from(gamificationChecklistItems).leftJoin(gamificationXpLedger, and(eq(gamificationXpLedger.userId, event.userId), sql`${gamificationXpLedger.rewardKey} = 'item:' || ${gamificationChecklistItems.id}`)).where(and(eq(gamificationChecklistItems.checklistId, checklist.id), sql`${gamificationXpLedger.id} is null`)).limit(1);
 let credits = account.courseCreditsMicro;
 if (awarded && !start.completedAt && !remaining.length) {
  credits += courseCreditMicro(checklist.totalXpMicro);
  await tx.update(gamificationCourseStarts).set({ completedAt: event.occurredAt }).where(and(eq(gamificationCourseStarts.userId, event.userId), eq(gamificationCourseStarts.courseId, receipt.courseId)));
 }
 const base = account.baseXpMicro + (awarded ? item.baseXpMicro : 0), bonus = account.bonusXpMicro + (awarded ? reward.bonusXpMicro : 0);
 const beforeRank = rankForTotals(account.baseXpMicro + account.bonusXpMicro, account.courseCreditsMicro).key;
 const afterRank = rankForTotals(base + bonus, credits).key;
 await tx.update(gamificationAccounts).set({ baseXpMicro: base, bonusXpMicro: bonus, courseCreditsMicro: credits, lpBalance: account.lpBalance + lp, rankKey: afterRank, updatedAt: new Date() }).where(eq(gamificationAccounts.userId, event.userId));
 if (RANKS.findIndex(rank => rank.key === afterRank) > RANKS.findIndex(rank => rank.key === beforeRank)) await announceRank(tx, event.userId, afterRank);
}

/** Process a bounded set. Failures roll back the user's transaction and remain pending. */
export async function processGamificationOutbox({ limit = 100 }: { limit?: number } = {}) {
 if (!Number.isInteger(limit) || limit < 1) throw new Error('INVALID_OUTBOX_LIMIT');
 // The candidate window bounds both selection and total per-user work. Each user's
 // reserved slots fetch their oldest occurrences, even when those IDs are outside it.
 const candidates = await db.select({ userId: gamificationEventOutbox.userId }).from(gamificationEventOutbox).where(eq(gamificationEventOutbox.status, 'pending')).orderBy(asc(gamificationEventOutbox.createdAt), asc(gamificationEventOutbox.id)).limit(Math.min(limit, 100));
 return scheduleOutboxUsers(candidates, async (userId, budget) => {
   return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
    const pending = await tx.select().from(gamificationEventOutbox).where(and(eq(gamificationEventOutbox.userId, userId), eq(gamificationEventOutbox.status, 'pending'))).orderBy(asc(gamificationEventOutbox.occurredAt), asc(gamificationEventOutbox.createdAt), asc(gamificationEventOutbox.id)).limit(budget);
    const questionIds = pending.filter(event => event.source === 'question').map(event => event.sourceId);
    await lockQuestionExposures(tx, userId, questionIds);
    await lockCanonicalQuestions(tx, questionIds);
    let done = 0, denied = 0;
    for (const event of pending) {
     try { await processOne(tx, event); } catch (error) {
      if (!(error instanceof Reject)) throw error;
      await tx.update(gamificationEventOutbox).set({ status: 'rejected', errorCode: error.code, processedAt: new Date() }).where(eq(gamificationEventOutbox.id, event.id));
      denied++; continue;
     }
     await tx.update(gamificationEventOutbox).set({ status: 'processed', processedAt: new Date(), errorCode: null }).where(eq(gamificationEventOutbox.id, event.id));
     done++;
    }
    return { done, denied };
   });
 });
}
