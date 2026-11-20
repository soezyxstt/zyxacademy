import { jakartaDay } from '../date-utils';
import { UNCERTAIN_EXPOSURE_IDENTITY } from './question-exposure-policy';

/** Pure chronology rules. These do not establish ownership, access, or authenticity. */
export function isEligibleQuestionRetry(input: {
 correct: boolean; attemptId: string; occurredAt: Date;
 lastReveal?: { attemptId: string; occurredAt: Date } | null;
}): boolean {
 if (!input.correct || !input.attemptId || !Number.isFinite(input.occurredAt.getTime())) return false;
 if (!input.lastReveal) return true;
 if (input.lastReveal.attemptId === UNCERTAIN_EXPOSURE_IDENTITY) return false;
 if (!Number.isFinite(input.lastReveal.occurredAt.getTime()) || input.attemptId === input.lastReveal.attemptId || input.occurredAt <= input.lastReveal.occurredAt) return false;
 return jakartaDay(input.occurredAt) > jakartaDay(input.lastReveal.occurredAt);
}

export function isEligibleScheduledRecall(input: {
 grade: number; adapter: 'canonical' | 'legacy'; reviewedAt: Date; previousDueAt: Date;
 previousEligibleAt?: Date | null;
}): boolean {
 const { grade, adapter, reviewedAt, previousDueAt, previousEligibleAt } = input;
 if (!Number.isFinite(reviewedAt.getTime()) || !Number.isFinite(previousDueAt.getTime())) return false;
 if (!Number.isInteger(grade) || (grade < 2 || grade > 4) || !['canonical', 'legacy'].includes(adapter)) return false;
 if (reviewedAt < previousDueAt) return false;
 if (!previousEligibleAt) return true;
 return Number.isFinite(previousEligibleAt.getTime()) && reviewedAt.getTime() - previousEligibleAt.getTime() >= 168 * 60 * 60 * 1000 && jakartaDay(reviewedAt) > jakartaDay(previousEligibleAt);
}
