import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { isEligibleQuestionRetry } from '../../lib/gamification/evidence';
import { checkAnswerCorrectness } from '../../lib/gamification/question-grading';

const transpiler = new Bun.Transpiler({ loader: 'ts' });
const canonicalQuestion = {
 id: 'q', mataKuliahId: 'c', status: 'published', quizEligible: true, version: 1,
 questionType: 'multiple_choice', optionsSnapshot: [{ text: 'A', isCorrect: false }, { text: 'B', isCorrect: true }],
};
function compile(source: string, start: string, end: string, dependencies: Record<string, unknown>) {
 const body = source.slice(source.indexOf(start), end ? source.indexOf(end) : undefined).replace('export ', '');
 return Function(...Object.keys(dependencies), transpiler.transformSync(`${body}\nreturn ${start.split('function ')[1].split('(')[0]};`))(...Object.values(dependencies));
}

test('a causally prior disclosure with an ahead clock preserves fact and receipt without blocking submission', async () => {
 const earlier = new Date('2026-01-02T12:00:00Z');
 const submission = new Date('2026-01-01T12:00:00Z');
 const identity = { canonicalQuestionId: 'q', courseId: 'c', sourceVersion: '1' };
 const question = { id: 'q', question_type: 'multiple_choice', options: ['A', 'B'], correct_indices: [1] };
 const receipts = readFileSync('lib/gamification/receipts.ts', 'utf8');
 const validateGamificationEvidence = compile(receipts, 'export function validateGamificationEvidence(', '/** Internal only.', {});
 let enqueued: unknown[] = [];
 const recordGamificationEvidenceBatch = compile(receipts, 'export async function recordGamificationEvidenceBatch(', 'export async function recordGamificationEvidence(', { validateGamificationEvidence, gamificationEvidenceReceipts: {}, enqueueGamificationEventsBatch: async (_tx: unknown, events: unknown[]) => { enqueued = events; } });
 const writer = readFileSync('lib/gamification/question-writer.ts', 'utf8');
 const writeQuestionRewards = compile(writer, 'export async function writeQuestionRewards(', '', {
  studentQuizAttempts: {}, gamificationLearningFacts: {}, eq: () => ({}), and: () => ({}),
  matchRewardSnapshots: () => [{ q: question, identity }], lockQuestionExposures: async () => {}, lockCanonicalQuestions: async () => [canonicalQuestion], initializeQuestionExposureHistoryBatch: async () => {}, recordSubmissionBoundaries: async () => {},
  getLatestQuestionExposures: async () => new Map([['q', { attemptIdentity: 'prior', exposedAt: earlier }]]),
  resolveCourseAccess: async () => ({ isAuthenticated: true, isEnrolled: true, hasFullContentAccess: true, isDemo: false, canonicalCourseId: 'c' }),
  startLearningRewards: async () => true, checkAnswerCorrectness, recordGamificationEvidenceBatch,
 });
 const written: any[] = [];
 const tx = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ snapshot: [question] }] }) }) }),
  insert: () => ({ values: (values: any[]) => {
   written.push(...values);
   return { onConflictDoNothing: () => ({ returning: async () => values.map(value => ({ id: value.id })) }), then: (resolve: (value: unknown) => unknown) => Promise.resolve().then(resolve) };
  } }),
 };
 await writeQuestionRewards(tx, { userId: 'u', attemptId: 'attempt', snapshot: [question], answers: { q: [1] }, occurredAt: submission });
 const fact = written.find(value => value.correct === true);
 const receipt = written.find(value => value.details);
 expect(fact.lastRevealAt).toEqual(earlier);
 expect(receipt.details.lastReveal).toEqual({ attemptId: 'prior', occurredAt: earlier.toISOString() });
 expect(enqueued).toHaveLength(1);
 expect(isEligibleQuestionRetry({ correct: fact.correct, attemptId: fact.attemptId, occurredAt: submission, lastReveal: { attemptId: fact.lastRevealAttemptId, occurredAt: fact.lastRevealAt } })).toBe(false);
});


test('an unverified cutover skips reward writes while submission can proceed', async () => {
 const identity = { canonicalQuestionId: 'q', courseId: 'c', sourceVersion: '1' };
 const question = { id: 'q', question_type: 'multiple_choice', options: ['A', 'B'], correct_indices: [1] };
 const source = readFileSync('lib/gamification/question-writer.ts', 'utf8');
 const writeQuestionRewards = compile(source, 'export async function writeQuestionRewards(', '', {
  studentQuizAttempts: {}, gamificationLearningFacts: {}, eq: () => ({}), and: () => ({}),
  matchRewardSnapshots: () => [{ q: question, identity }], lockQuestionExposures: async () => {}, lockCanonicalQuestions: async () => [canonicalQuestion],
  initializeQuestionExposureHistoryBatch: async () => false,
  recordSubmissionBoundaries: () => { throw new Error('UNTRUSTED_BOUNDARY'); },
  getLatestQuestionExposures: () => { throw new Error('UNTRUSTED_HISTORY'); },
  resolveCourseAccess: () => { throw new Error('UNEXPECTED_REWARD'); }, startLearningRewards: () => {}, checkAnswerCorrectness, recordGamificationEvidenceBatch: () => {},
 });
 const tx = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ snapshot: [question] }] }) }) }), insert: () => { throw new Error('UNEXPECTED_REWARD_WRITE'); } };
 await expect(writeQuestionRewards(tx, { userId: 'u', attemptId: 'a', snapshot: [question], answers: {}, occurredAt: new Date() })).resolves.toBeUndefined();
});

test('course start uses the same server instant and skips changed eligibility without hiding database errors', async () => {
 const at = new Date('2026-01-01T00:00:00Z');
 const source = readFileSync('lib/gamification/checklists.ts', 'utf8');
 let eligible = true;
 let seen: Date | undefined;
 const ensure = compile(source, 'export async function ensureGamificationCourseStart(', 'export async function getGamificationCourseChecklist(', {
  resolveCourseAccess: async ({ now }: { now: Date }) => { seen = now; return { isAuthenticated: true, isEnrolled: eligible, hasFullContentAccess: eligible, canonicalCourseId: 'c', isDemo: false }; },
  canonicalCourse: async () => ({ id: 'c' }), gamificationCourseStarts: {}, eq: () => ({}), and: () => ({}),
 });
 const tx = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ userId: 'u' }] }) }) }) };
 expect(await ensure(tx, 'u', 'c', at, { skipIneligible: true })).toEqual({ userId: 'u' });
 expect(seen).toBe(at);
 eligible = false;
 expect(await ensure(tx, 'u', 'c', at, { skipIneligible: true })).toBeNull();
 await expect(ensure(tx, 'u', 'c', at)).rejects.toThrow('COURSE_ACCESS_REQUIRED');
 const brokenTx = { select: () => { throw new Error('DB_FAILURE'); } };
 eligible = true;
 await expect(ensure(brokenTx, 'u', 'c', at, { skipIneligible: true })).rejects.toThrow('DB_FAILURE');
});

test('held absent canonical rows are never reacquired after the bank lock', async () => {
 const identity = { canonicalQuestionId: 'q', courseId: 'c', sourceVersion: '1' };
 const question = { id: 'q', question_type: 'multiple_choice', options: ['A', 'B'], correct_indices: [1] };
 const source = readFileSync('lib/gamification/question-writer.ts', 'utf8');
 const write = compile(source, 'export async function writeQuestionRewards(', '', {
  studentQuizAttempts: {}, eq: () => ({}), and: () => ({}),
  matchRewardSnapshots: () => [{ q: question, identity }], lockQuestionExposures: async () => {},
  lockCanonicalQuestions: () => { throw new Error('LATE_CANONICAL_LOCK'); },
  initializeQuestionExposureHistoryBatch: async () => false,
 });
 const tx = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ snapshot: [question] }] }) }) }) };
 await expect(write(tx, { userId: 'u', attemptId: 'a', snapshot: [question], answers: {}, occurredAt: new Date(), heldCanonical: { ids: ['q'], rows: [] } })).resolves.toBeUndefined();
 await expect(write(tx, { userId: 'u', attemptId: 'a', snapshot: [question], answers: {}, occurredAt: new Date(), heldCanonical: { ids: [], rows: [] } })).rejects.toThrow('QUESTION_LOCK_SET_INCOMPLETE');
});
