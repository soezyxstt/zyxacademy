import { wakeOutbox } from "@/lib/queue/outbox";
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
 discussionMessages, discussionThreads, gamificationAccounts, gamificationEventOutbox,
 gamificationLeaderboardPeriods, gamificationLpLedger, gamificationXpLedger,
} from '@/db/schema';
import { gamificationPeriodKey, nextJakartaReset, startOfJakartaDayUtc } from '@/lib/date-utils';
import { RANKS } from '@/lib/gamification/catalog';
import { announceRank } from '@/lib/gamification/celebrations';
import { rankForTotals } from '@/lib/gamification/policy';
import { rewardForEvent } from '@/lib/gamification/processor-policy';
import { getDiscussionActor } from './access';
import { DISCUSSION_REWARDS, discussionRewardKey, discussionRewardKind, type DiscussionRewardKind } from './reward-policy';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Event = typeof gamificationEventOutbox.$inferSelect;

/** Call with the same transaction that persists the human message. */
export async function enqueueDiscussionReward(tx: Tx, input: {
 userId: string; threadId: string; messageId: string; kind: DiscussionRewardKind; occurredAt: Date;
}) {
 if ((input.kind !== 'question' && input.kind !== 'answer') || !input.userId || !input.threadId || !input.messageId || !(input.occurredAt instanceof Date) || !Number.isFinite(input.occurredAt.getTime())) throw new Error('INVALID_DISCUSSION_REWARD');
 const reward = DISCUSSION_REWARDS[input.kind];
 wakeOutbox("gamification/outbox.continue");
 await tx.insert(gamificationEventOutbox).values({
  id: crypto.randomUUID(), userId: input.userId, source: reward.source,
  sourceId: input.messageId, evidenceId: input.threadId, occurredAt: input.occurredAt,
 }).onConflictDoNothing();
}

async function eligibleStudent(tx: Tx, userId: string) {
 try {
  return (await getDiscussionActor(userId, tx)).role === 'student';
 } catch (error) {
  if (error instanceof Error && error.message === 'DISCUSSION_UNAVAILABLE') return false;
  throw error;
 }
}

/** Returns false for invalid evidence. The caller owns the account lock and transaction. */
export async function processDiscussionReward(tx: Tx, event: Event): Promise<boolean> {
 const kind = discussionRewardKind(event.source);
 if (!kind || !Number.isFinite(event.occurredAt.getTime()) || event.occurredAt > new Date()) return false;

 const [evidence] = await tx.select({ threadId: discussionThreads.id, threadAuthorId: discussionThreads.authorId,
  messageThreadId: discussionMessages.threadId, authorId: discussionMessages.authorId, kind: discussionMessages.kind,
  messageType: discussionMessages.messageType, replyToId: discussionMessages.replyToId, forwardedFromId: discussionMessages.forwardedFromId,
  deletedAt: discussionMessages.deletedAt, createdAt: discussionMessages.createdAt })
  .from(discussionMessages).innerJoin(discussionThreads, eq(discussionThreads.id, discussionMessages.threadId))
  .where(eq(discussionMessages.id, event.sourceId)).limit(1).for('share');
 if (!evidence || evidence.threadId !== event.evidenceId || evidence.messageThreadId !== event.evidenceId
  || evidence.authorId !== event.userId || evidence.kind !== 'human'
  || evidence.messageType !== kind || evidence.replyToId !== null || evidence.forwardedFromId !== null
  || evidence.deletedAt !== null || evidence.createdAt.getTime() !== event.occurredAt.getTime()
  || (kind === 'question' ? evidence.threadAuthorId !== event.userId : evidence.threadAuthorId === event.userId)
  || !(await eligibleStudent(tx, event.userId))) return false;

 const reward = DISCUSSION_REWARDS[kind];
 const awards = await tx.select({ id: gamificationXpLedger.id }).from(gamificationEventOutbox)
  .innerJoin(gamificationXpLedger, eq(gamificationXpLedger.eventId, gamificationEventOutbox.id))
  .where(and(eq(gamificationEventOutbox.userId, event.userId), eq(gamificationEventOutbox.source, reward.source),
   eq(gamificationEventOutbox.status, 'processed'), gte(gamificationEventOutbox.occurredAt, startOfJakartaDayUtc(event.occurredAt)),
   lt(gamificationEventOutbox.occurredAt, nextJakartaReset(event.occurredAt))))
  .limit(reward.dailyLimit);
 if (awards.length >= reward.dailyLimit) return true;

 await tx.insert(gamificationAccounts).values({ userId: event.userId }).onConflictDoNothing();
 const [account] = await tx.select().from(gamificationAccounts).where(eq(gamificationAccounts.userId, event.userId));
 const calculated = rewardForEvent(reward.baseXpMicro, account.baseXpMicro, account.bonusXpMicro, account.courseCreditsMicro);
 const rewardKey = discussionRewardKey(kind, event.evidenceId);
 const [awarded] = await tx.insert(gamificationXpLedger).values({
  id: crypto.randomUUID(), userId: event.userId, eventId: event.id, rewardKey,
  baseXpMicro: reward.baseXpMicro, bonusXpMicro: calculated.bonusXpMicro, rankKey: calculated.rank,
 }).onConflictDoNothing().returning();
 if (!awarded) return true;

 if (reward.lp) {
  const [lp] = await tx.insert(gamificationLpLedger).values({ id: crypto.randomUUID(), userId: event.userId, rewardKey, amount: reward.lp, reason: 'discussion' }).onConflictDoNothing().returning();
  if (!lp) throw new Error('DISCUSSION_LP_LEDGER_CONFLICT');
 }
 for (const period of ['week', 'month', 'all'] as const) {
  const periodKey = gamificationPeriodKey(period, event.occurredAt);
  await tx.insert(gamificationLeaderboardPeriods).values({ userId: event.userId, periodKey, baseXpMicro: reward.baseXpMicro })
   .onConflictDoUpdate({ target: [gamificationLeaderboardPeriods.userId, gamificationLeaderboardPeriods.periodKey], set: {
    baseXpMicro: sql`${gamificationLeaderboardPeriods.baseXpMicro} + ${reward.baseXpMicro}`, updatedAt: new Date(),
   } });
 }
 const base = account.baseXpMicro + reward.baseXpMicro;
 const bonus = account.bonusXpMicro + calculated.bonusXpMicro;
 const afterRank = rankForTotals(base + bonus, account.courseCreditsMicro).key;
 await tx.update(gamificationAccounts).set({ baseXpMicro: base, bonusXpMicro: bonus, lpBalance: account.lpBalance + reward.lp, rankKey: afterRank, updatedAt: new Date() })
  .where(eq(gamificationAccounts.userId, event.userId));
 if (RANKS.findIndex(rank => rank.key === afterRank) > RANKS.findIndex(rank => rank.key === calculated.rank)) await announceRank(tx, event.userId, afterRank);
 return true;
}
