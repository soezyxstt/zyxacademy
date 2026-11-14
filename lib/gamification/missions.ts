import { and, eq, exists, gt, inArray, isNull, lte, notExists, sql, ne, or } from 'drizzle-orm';
import { db } from '@/db';
import { artikel, bagianArtikel, gamificationArticleCompletions, gamificationBadgeActivities, gamificationChecklists, gamificationChecklistItems, gamificationCourseStarts, gamificationLpLedger, gamificationMissions, gamificationQualifiedDays, gamificationXpLedger, mataKuliah, solutionCollections, gamificationExplanationCompletionsV2, flashcard, setFlashcard, kemajuanFlashcardMurid, gamificationEligibleRecalls } from '@/db/schema';
import { gamificationMissionWindows } from '@/lib/date-utils';
import { resolveCourseAccess } from '@/lib/student/course-access';
import { availableDailyMissions, weeklyMissionFeasible, missionKindForSource, type VerifiedMissionEvent } from './mission-policy';
export type { VerifiedMissionEvent } from './mission-policy';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Caller holds the user's advisory transaction lock. Current evidence must already be verified. */
export async function ensureGamificationMissions(tx: Tx, userId: string, occurredAt: Date, current?: { itemId: string; source: 'article' | 'explanation' | 'flashcard' | 'question'; activityId: string }) {
 const windows = gamificationMissionWindows(occurredAt);
 const starts = await tx.select({ courseId: gamificationCourseStarts.courseId, checklistId: gamificationCourseStarts.checklistId }).from(gamificationCourseStarts)
  .innerJoin(gamificationChecklists, and(eq(gamificationChecklists.id, gamificationCourseStarts.checklistId), eq(gamificationChecklists.courseId, gamificationCourseStarts.courseId), eq(gamificationChecklists.status, 'approved')))
  .innerJoin(mataKuliah, and(eq(mataKuliah.id, gamificationCourseStarts.courseId), eq(mataKuliah.status, 'active'), eq(mataKuliah.isDemo, false)))
  .where(and(eq(gamificationCourseStarts.userId, userId), lte(gamificationCourseStarts.startedAt, occurredAt)));
 let eligible = false, material = 0, recall = 0, question = 0;
 for (const start of starts) {
  const access = await resolveCourseAccess({ userId, courseId: start.courseId, now: occurredAt }, tx);
  if (!access.isAuthenticated || !access.isEnrolled || !access.hasFullContentAccess || access.isDemo || access.canonicalCourseId !== start.courseId) continue;
  eligible = true;
  const common = [eq(gamificationChecklistItems.checklistId, start.checklistId), ...(current ? [ne(gamificationChecklistItems.id, current.itemId)] : [])];
  const articles = await tx.select({ id: gamificationChecklistItems.id }).from(gamificationChecklistItems)
   .innerJoin(artikel, and(eq(artikel.id, gamificationChecklistItems.sourceId), eq(artikel.mataKuliahId, start.courseId), eq(artikel.status, 'published'), eq(artikel.structureStatus, 'structured'), lte(artikel.publishedAt, occurredAt), sql`${artikel.version}::text = ${gamificationChecklistItems.contentVersion}`))
   .leftJoin(gamificationXpLedger, and(eq(gamificationXpLedger.userId, userId), sql`${gamificationXpLedger.rewardKey} = 'item:' || ${gamificationChecklistItems.id}`))
   .where(and(...common, eq(gamificationChecklistItems.category, 'article'), isNull(gamificationXpLedger.id), notExists(tx.select({ id: gamificationArticleCompletions.id }).from(gamificationArticleCompletions).where(and(eq(gamificationArticleCompletions.userId, userId), eq(gamificationArticleCompletions.articleId, artikel.id), eq(gamificationArticleCompletions.articleVersion, artikel.version)))), exists(tx.select({ id: bagianArtikel.id }).from(bagianArtikel).where(and(eq(bagianArtikel.artikelId, artikel.id), eq(bagianArtikel.version, artikel.version), eq(bagianArtikel.status, 'published')))))).limit(4);
  const explanations = await tx.select({ id: gamificationChecklistItems.id }).from(gamificationChecklistItems)
   .innerJoin(solutionCollections, and(eq(solutionCollections.productId, gamificationChecklistItems.sourceId), eq(solutionCollections.courseId, start.courseId), eq(solutionCollections.status, 'published'), lte(solutionCollections.publishedAt, occurredAt), sql`${solutionCollections.version}::text = ${gamificationChecklistItems.contentVersion}`))
   .leftJoin(gamificationXpLedger, and(eq(gamificationXpLedger.userId, userId), sql`${gamificationXpLedger.rewardKey} = 'item:' || ${gamificationChecklistItems.id}`))
   .where(and(...common, eq(gamificationChecklistItems.category, 'explanation'), isNull(gamificationXpLedger.id), notExists(tx.select({ id: gamificationExplanationCompletionsV2.id }).from(gamificationExplanationCompletionsV2).where(and(eq(gamificationExplanationCompletionsV2.userId, userId), eq(gamificationExplanationCompletionsV2.collectionId, solutionCollections.id), eq(gamificationExplanationCompletionsV2.collectionVersion, solutionCollections.version)))))).limit(4);
  const cards = await tx.select({ id: gamificationChecklistItems.id }).from(gamificationChecklistItems)
   .innerJoin(flashcard, and(eq(flashcard.id, gamificationChecklistItems.sourceId), eq(flashcard.status, 'published'), sql`${flashcard.version}::text = ${gamificationChecklistItems.contentVersion}`))
   .innerJoin(setFlashcard, and(eq(setFlashcard.id, flashcard.setFlashcardId), eq(setFlashcard.mataKuliahId, start.courseId), eq(setFlashcard.status, 'published'), or(isNull(setFlashcard.publishedAt), lte(setFlashcard.publishedAt, occurredAt))))
   .innerJoin(kemajuanFlashcardMurid, and(eq(kemajuanFlashcardMurid.flashcardId, flashcard.id), eq(kemajuanFlashcardMurid.penggunaId, userId), eq(kemajuanFlashcardMurid.status, 'active'), lte(kemajuanFlashcardMurid.dueAt, occurredAt)))
   .where(and(...common, eq(gamificationChecklistItems.category, 'flashcard'), notExists(tx.select({ id: gamificationEligibleRecalls.sourceEvidenceId }).from(gamificationEligibleRecalls).where(and(eq(gamificationEligibleRecalls.userId, userId), eq(gamificationEligibleRecalls.checklistItemId, gamificationChecklistItems.id), gt(gamificationEligibleRecalls.reviewedAt, sql`${occurredAt}::timestamptz - interval '7 days'`)))))).limit(4);
  material += articles.length + explanations.length;
  recall += cards.length;
 }
 if (!eligible) return;
 let currentAvailable = false;
 if (current) {
  const [seen] = await tx.select({ identity: gamificationBadgeActivities.identity }).from(gamificationBadgeActivities).where(and(eq(gamificationBadgeActivities.userId, userId), eq(gamificationBadgeActivities.family, `mission:${windows.day.key}`), eq(gamificationBadgeActivities.identity, current.activityId)));
  if (!seen) { currentAvailable = true; if (current.source === 'flashcard') recall++; else if (current.source === 'question') question++; else material++; }
 }
 for (const mission of availableDailyMissions({ material, recall, question })) await tx.insert(gamificationMissions).values({ id: crypto.randomUUID(), userId, ...mission, windowKey: windows.day.key, startsAt: windows.day.startsAt, endsAt: windows.day.endsAt }).onConflictDoNothing();
 const days = await tx.select({ day: gamificationQualifiedDays.dayKey }).from(gamificationQualifiedDays).where(and(eq(gamificationQualifiedDays.userId, userId), eq(gamificationQualifiedDays.weekKey, windows.week.key), lte(gamificationQualifiedDays.dayKey, windows.day.key))).limit(4);
 const todayQualified = days.some(day => day.day === windows.day.key);
 const remainingDays = Math.round((windows.week.endsAt.getTime() - windows.day.startsAt.getTime()) / 86400000) - (todayQualified ? 1 : 0);
 // Today's already-qualified event cannot be used to claim an additional day.
 const available = material + recall + question - (todayQualified && currentAvailable ? 1 : 0);
 if (weeklyMissionFeasible(days.length, Math.max(0, available), remainingDays)) await tx.insert(gamificationMissions).values({ id: crypto.randomUUID(), userId, kind: 'qualified_days', windowKey: windows.week.key, target: 4, rewardLp: 50, startsAt: windows.week.startsAt, endsAt: windows.week.endsAt }).onConflictDoNothing();
}

/** Must run after verification and qualified-day insertion, under the same user lock and transaction. Caller adds awardedLp to the account in that transaction. */
export async function advanceGamificationMissions(tx: Tx, event: VerifiedMissionEvent): Promise<{ awardedLp: number }> {
 if (!event.eligible) return { awardedLp: 0 };
 if (!event.userId || !event.eventId || !event.activityId) throw new Error('INVALID_MISSION_EVENT');
 const windows = gamificationMissionWindows(event.occurredAt);
 const [activity] = await tx.insert(gamificationBadgeActivities).values({ userId: event.userId, family: `mission:${windows.day.key}`, identity: event.activityId }).onConflictDoNothing().returning();
 let awardedLp = 0;
 const rows = await tx.select().from(gamificationMissions).where(and(eq(gamificationMissions.userId, event.userId), inArray(gamificationMissions.windowKey, [windows.day.key, windows.week.key]), lte(gamificationMissions.startsAt, event.occurredAt), gt(gamificationMissions.endsAt, event.occurredAt), isNull(gamificationMissions.completedAt))).limit(4);
 for (const mission of rows) {
  let progress = mission.progress;
  if (mission.kind === 'qualified_days' && event.qualifiedDay && mission.windowKey === windows.week.key) {
   const days = await tx.select({ day: gamificationQualifiedDays.dayKey }).from(gamificationQualifiedDays).where(and(eq(gamificationQualifiedDays.userId, event.userId), eq(gamificationQualifiedDays.weekKey, windows.week.key), lte(gamificationQualifiedDays.dayKey, windows.day.key))).limit(4);
   progress = Math.max(progress, days.length);
  } else if (activity && mission.windowKey === windows.day.key && mission.kind === missionKindForSource(event.source)) progress++;
  progress = Math.min(mission.target, progress);
  if (progress === mission.progress) continue;
  const complete = progress >= mission.target;
  await tx.update(gamificationMissions).set({ progress, completedAt: complete ? event.occurredAt : null }).where(eq(gamificationMissions.id, mission.id));
  if (complete) {
   const [award] = await tx.insert(gamificationLpLedger).values({ id: crypto.randomUUID(), userId: event.userId, rewardKey: `mission:${mission.kind}:${mission.windowKey}`, amount: mission.rewardLp, reason: 'mission' }).onConflictDoNothing().returning();
   if (award) awardedLp += award.amount;
  }
 }
 return { awardedLp };
}
