import { expect, test } from 'bun:test';
import { prepareQuestionEvidence } from '../../lib/gamification/question-evidence';

const base = { userId: 'u', courseId: 'c', questionId: 'q', sourceVersion: '1', attemptId: 'a2', correct: true, occurredAt: new Date('2026-01-02T17:00:00Z') };
test('unsupported exposure is never treated as no reveal', () => {
 expect(prepareQuestionEvidence({ ...base, exposure: { status: 'unsupported' } })).toEqual({ status: 'unsupported' });
 expect(prepareQuestionEvidence({ ...base, exposure: { status: 'complete', reveals: [] } })).toEqual({ status: 'supported', lastReveal: null });
});
test('latest reveal is selected regardless of order', () => {
 const reveal = { attemptId: 'a1', occurredAt: new Date('2026-01-01T18:00:00Z') };
 const result = prepareQuestionEvidence({ ...base, exposure: { status: 'complete', reveals: [reveal, { attemptId: 'old', occurredAt: new Date('2025-12-31T00:00:00Z') }] } });
 expect(result.status).toBe('supported');
 if (result.status !== 'supported') throw new Error('unexpected');
 expect(result.lastReveal).toEqual(reveal);
});
test('rejects invalid writer input and ambiguous chronology', () => {
 expect(() => prepareQuestionEvidence({ ...base, userId: ' ', exposure: { status: 'unsupported' } })).toThrow('INVALID_QUESTION_EVIDENCE');
 expect(() => prepareQuestionEvidence({ ...base, exposure: { status: 'complete', reveals: [{ attemptId: 'a', occurredAt: new Date('2027-01-01') }] } })).toThrow('INVALID_QUESTION_EVIDENCE');
 const at = new Date('2026-01-01');
 expect(prepareQuestionEvidence({ ...base, exposure: { status: 'complete', reveals: [{ attemptId: 'a', occurredAt: at }, { attemptId: 'b', occurredAt: at }] } }).status).toBe('unsupported');
});
