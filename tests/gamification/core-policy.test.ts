import { expect, test } from 'bun:test';
import { allocateChecklistXp, courseCreditMicro, rankForTotals } from '../../lib/gamification/policy';
import { isEligibleQuestionRetry, isEligibleScheduledRecall } from '../../lib/gamification/evidence';

test('allocation is deterministic and preserves fractional pool', () => {
 const allocation = allocateChecklistXp('question', ['c', 'a', 'b']);
 expect([...allocation.values()].reduce((a, b) => a + b, 0)).toBe(60_000_000);
 expect([...allocation]).toEqual([...allocateChecklistXp('question', ['b', 'c', 'a'])]);
 expect(courseCreditMicro(5_500_000_000)).toBe(550_000);
 expect(rankForTotals(10_000_000_000, 0).key).toBe('kades');
});
test('revealed answer needs a new attempt on a later Jakarta day', () => {
 const reveal = { attemptId: 'a', occurredAt: new Date('2026-10-31T16:00:00Z') };
 expect(isEligibleQuestionRetry({ correct: true, attemptId: 'b', occurredAt: new Date('2026-10-31T16:59:00Z'), lastReveal: reveal })).toBe(false);
 expect(isEligibleQuestionRetry({ correct: true, attemptId: 'a', occurredAt: new Date('2026-10-31T17:00:00Z'), lastReveal: reveal })).toBe(false);
 expect(isEligibleQuestionRetry({ correct: true, attemptId: 'b', occurredAt: new Date('2026-10-31T17:00:00Z'), lastReveal: reveal })).toBe(true);
});
test('recalls require success, due time and 168 hours', () => {
 const first = new Date('2026-11-01T00:00:00Z');
 const input = { adapter: 'canonical' as const, grade: 2, previousDueAt: first, previousEligibleAt: first };
 expect(isEligibleScheduledRecall({ ...input, reviewedAt: new Date('2026-11-07T23:59:59Z') })).toBe(false);
 expect(isEligibleScheduledRecall({ ...input, reviewedAt: new Date('2026-11-08T00:00:00Z') })).toBe(true);
 expect(isEligibleScheduledRecall({ ...input, grade: 1, reviewedAt: new Date('2026-11-08T00:00:00Z') })).toBe(false);
 expect(isEligibleScheduledRecall({ ...input, previousDueAt: new Date('2026-11-09T00:00:00Z'), reviewedAt: new Date('2026-11-08T00:00:00Z') })).toBe(false);
});

test('baseline exposure still requires a later Jakarta day', () => {
 const reveal = { attemptId: 'baseline', occurredAt: new Date('2026-01-01T16:00:00Z') };
 expect(isEligibleQuestionRetry({ correct: true, attemptId: 'a', occurredAt: new Date('2026-01-01T16:30:00Z'), lastReveal: reveal })).toBe(false);
 expect(isEligibleQuestionRetry({ correct: true, attemptId: 'a', occurredAt: new Date('2026-01-01T17:00:00Z'), lastReveal: reveal })).toBe(true);
 expect(isEligibleQuestionRetry({ correct: false, attemptId: 'a', occurredAt: new Date('2026-01-01T17:00:00Z'), lastReveal: reveal })).toBe(false);
});


test('ambiguous legacy evidence denies a reward even on a later day', () => {
 expect(isEligibleQuestionRetry({ correct: true, attemptId: 'a', occurredAt: new Date('2026-01-04T00:00:00Z'), lastReveal: { attemptId: '__zyx_uncertain_exposure__', occurredAt: new Date('2026-01-01T00:00:00Z') } })).toBe(false);
});
