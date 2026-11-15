import { BADGE_LP, BADGE_THRESHOLDS } from './catalog';
import type { BadgeFamily } from './contracts';
import { rankForTotals } from './policy';

export function rewardForEvent(baseXpMicro: number, baseTotal: number, bonusTotal: number, credits: number) {
 const before = rankForTotals(baseTotal + bonusTotal, credits);
 return { rank: before.key, bonusXpMicro: Math.floor(baseXpMicro * before.bonusPercent / 100) };
}
export function crossedBadgeTiers(family: BadgeFamily, oldTier: number, count: number) {
 return BADGE_THRESHOLDS[family].flatMap((threshold, index) => count >= threshold && index >= oldTier ? [{ tier: index + 1, lp: BADGE_LP[index] }] : []);
}
export function sameIds(a: unknown, b: unknown): boolean {
 if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.some(x => typeof x !== 'string') || b.some(x => typeof x !== 'string')) return false;
 const x = [...new Set(a)].sort(), y = [...new Set(b)].sort();
 return x.length === a.length && y.length === b.length && x.length === y.length && x.every((v, i) => v === y[i]);
}

/** Accepted recalls are spaced from the last accepted recall, not an early attempt. */
export function recallDecision(grade: number, reviewedAt: Date, previousDueAt: Date, previousRecall: Date | null) {
 const eligible = Number.isInteger(grade) && grade >= 2 && grade <= 4 && reviewedAt.getTime() >= previousDueAt.getTime() && (!previousRecall || reviewedAt.getTime() - previousRecall.getTime() >= 7 * 24 * 60 * 60 * 1000);
 return { eligible, qualifiesXp: eligible && previousRecall !== null };
}
