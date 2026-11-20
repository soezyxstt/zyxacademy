import { expect, test } from 'bun:test';
import { crossedBadgeTiers, rewardForEvent, sameIds, recallDecision } from '../../lib/gamification/processor-policy';
import { rankForTotals } from '../../lib/gamification/policy';

test('promotion bonus uses rank before the event and respects course gate', () => {
 const gated = rewardForEvent  (1_000_000_000, 9_900_000_000, 0, 0);
 expect(gated).toEqual({ rank: 'kades', bonusXpMicro: 0 });
 expect(rankForTotals(10_900_000_000, 0).key).toBe('kades');
 expect(rankForTotals(10_900_000_000, 1_000_000).key).toBe('camat');
 expect(rewardForEvent(100_000_000, 10_000_000_000, 0, 1_000_000).bonusXpMicro).toBe(5_000_000);
});
test('only newly crossed badge tiers pay, including jumps', () => {
 expect(crossedBadgeTiers('warrior_reader', 1, 40)).toEqual([{ tier: 2, lp: 50 }, { tier: 3, lp: 100 }]);
 expect(crossedBadgeTiers('warrior_reader', 3, 40)).toEqual([]);
});
test('completion identity comparison rejects duplicates and omissions', () => {
 expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(true);
 expect(sameIds(['a', 'a'], ['a'])).toBe(false);
 expect(sameIds(['a'], ['a', 'b'])).toBe(false);
});

test('scheduled successful recalls advance only after seven real days', () => {
 const first = new Date('2026-01-01T12:00:00Z');
 const due = new Date('2026-01-01T11:00:00Z');
 expect(recallDecision(2, first, due, null)).toEqual({ eligible: true, qualifiesXp: false });
 expect(recallDecision(1, first, due, null).eligible).toBe(false);
 expect(recallDecision(3, first, new Date('2026-01-01T12:00:01Z'), null).eligible).toBe(false);
 expect(recallDecision(4, first, due, first).eligible).toBe(false);
 const early = new Date('2026-01-08T11:59:59Z');
 expect(recallDecision(3, early, due, first).eligible).toBe(false);
 const second = new Date('2026-01-08T12:00:00Z');
 expect(recallDecision(3, second, due, first)).toEqual({ eligible: true, qualifiesXp: true });
 expect(recallDecision(4, new Date('2026-01-15T12:00:00Z'), due, second)).toEqual({ eligible: true, qualifiesXp: true });
});
