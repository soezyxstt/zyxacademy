import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { getTableName } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { isEligibleQuestionRetry } from '../../lib/gamification/evidence';
import { gamificationQuestionExposures as exposure, gamificationQuestionExposureInitializations as initialization, gamificationQuestionBankDisclosures as bankTable, gamificationQuestionExposureProjection as projection, gamificationQuestionExposureObservations as observation, gamificationQuestionLegacyIndex as legacyIndex, gamificationQuestionHistoryCutover as cutover, soal, mataKuliah, studentQuizAttempts } from '../../db/schema';

mock.module('@/db', () => ({ db: {} }));
let staffAllowed = true;
let legacyOnly = false;
mock.module('@/lib/student/course-access', () => ({ resolveCourseAccess: async () => ({ tier: staffAllowed ? 'staff' : 'free', hasCourseAccess: staffAllowed, canonicalCourseId: legacyOnly ? null : 'c', legacyCourseId: 'legacy-c', courseId: legacyOnly ? 'legacy-c' : 'c' }) }));
const { lockQuestionExposures, recordSubmissionBoundaries, getLatestQuestionExposures, recordStaffCourseDisclosures, initializeQuestionExposureHistoryBatch, recordAuthorizedStaffAttemptDisclosures, recordAuthorizedGlobalDisclosures, recordAttemptDisclosures, recordAuthorizedCourseDisclosures } = await import('../../lib/gamification/question-exposure');
const dialect = new PgDialect();
type Row = { id: string; userId: string; questionId: string; courseId: string; sourceVersion: string; kind: 'baseline' | 'disclosure'; attemptIdentity: string; exposedAt: Date; causalOrder: bigint };
const time = new Date('2026-01-01T12:00:00.000Z');
let rows: Row[];
let sequence: bigint;
let locks: Map<string, Promise<void>>;
let trace: string[];
let bankRows: { id: string; userId: string; questionId: string; courseId: string; exposedAt: Date }[];
let canonical: Set<string>;
let drafts: Set<string>;
let projections: any[];
let observations: any[];
let states: any[];
let legacyRows: any[];
let ready: boolean;
let projectionProbes: number;
let projectionOrder: number;
const heldQuestion = { id: 'a', question_type: 'multiple_choice', options: ['a', 'b'], correct_indices: [1], gamificationProvenance: { marker: 'canonical-objective-v1', canonicalQuestionId: 'a', courseId: 'c', sourceVersion: '1', answerProof: { questionType: 'multiple_choice', correctIndices: [1] } } };

beforeEach(() => { rows = []; sequence = 0n; locks = new Map(); trace = []; bankRows = []; canonical = new Set(); drafts = new Set(); projections = []; observations = []; states = []; legacyRows = []; ready = true; projectionProbes = 0; projectionOrder = 0; staffAllowed = true; legacyOnly = false; });

/** Minimal transaction adapter: it executes the production Drizzle predicates,
 * enforces unique disclosure identities, and queues advisory locks until commit. */
function transaction(name: string) {
 const releases: (() => void)[] = [];
 const held = new Set<string>();
 const query = (table: any, condition: any) => {
  const { sql, params } = dialect.sqlToQuery(condition);
  const name = getTableName(table);
  if (name === getTableName(studentQuizAttempts)) return params[0] === 'attempt-owner' && params[1] === 'learner' ? [{ snapshot: [heldQuestion] }] : [];
  const list = sql.match(/"question_id" in \(([^)]+)\)/)?.[1] ?? '';
  const ids = [...list.matchAll(/\$(\d+)/g)].map(match => String(params[Number(match[1]) - 1]));
  if (name === getTableName(cutover)) return ready ? [{ id: 'v1' }] : [];
  if (name === getTableName(initialization)) return states.filter(row => row.userId === params[0] && ids.includes(row.questionId));
  if (name === getTableName(legacyIndex)) return legacyRows.filter(row => row.userId === params[0] && ids.includes(row.questionId));
  if (name === getTableName(observation)) {
   if (ids.length) return observations.filter(row => row.userId === params[0] && row.attemptId === params[1] && ids.includes(row.questionId));
   return observations.filter(row => row.userId === params[0] && row.questionId === params[1] && row.attemptId === params[2]);
  }
  if (name === getTableName(soal)) return ids.filter(id => canonical.has(id) && (!sql.includes('"status"') || !drafts.has(id))).map(id => ({ id, courseId: 'c', version: 1 }));
  return [];
 };
 const tx = {
  async execute(statement: any) {
   const { sql, params } = dialect.sqlToQuery(statement);
   if (sql.includes('jsonb_to_recordset')) {
    const requested = JSON.parse(params[0] as string) as { question_id: string; course_id: string }[];
    return { rows: requested.map(q => {
     const choices = projections.filter(p => p.userId === params.at(-1) && [q.course_id, 'legacy-c'].includes(p.courseId) && [q.question_id, '__zyx_unmapped_course_disclosure__'].includes(p.questionId));
     projectionProbes += 4;
     choices.sort((a, b) => b.exposedAt.getTime() - a.exposedAt.getTime() || b.causalOrder - a.causalOrder);
     const tied = choices.filter(p => p.exposedAt.getTime() === choices[0]?.exposedAt.getTime());
     const ambiguous = tied.length > 1 && tied.every(p => p.causalOrder < 0) && new Set(tied.map(p => p.attemptIdentity)).size > 1;
     return { question_id: q.question_id, attempt_identity: ambiguous ? '__zyx_uncertain_exposure__' : choices[0]?.attemptIdentity ?? null, exposed_at: choices[0]?.exposedAt ?? null };
    }) };
   }
   if (typeof params[0] !== 'string' || params[0].startsWith('[')) { trace.push(`${name}:questions`); return; }
   const key = params[0];
   if (held.has(key)) return;
   const previous = locks.get(key) ?? Promise.resolve();
   let release!: () => void;
   const current = new Promise<void>(resolve => { release = resolve; });
   locks.set(key, current);
   await previous;
   held.add(key); releases.push(release); trace.push(`${name}:user`);
  },
  select: () => ({ from: (table: any) => ({ where: (condition: any) => { const result = Promise.resolve(query(table, condition)); return Object.assign(result, { limit: () => result }); } }) }),
  insert: (table: any) => ({ values: (values: any | any[]) => {
   const write = async () => {
    const inserted: any[] = [];
    for (const value of Array.isArray(values) ? values : [values]) {
     const name = getTableName(table);
     if (name === getTableName(bankTable)) { if (!bankRows.some(row => row.id === value.id)) { bankRows.push(value); inserted.push(value); } }
     else if (name === getTableName(projection)) {
      const old = projections.find(row => row.userId === value.userId && row.questionId === value.questionId && row.courseId === value.courseId);
      if (!old) projections.push({ ...value, causalOrder: ++projectionOrder }); else if (old.exposedAt <= value.exposedAt) Object.assign(old, value, { causalOrder: ++projectionOrder });
     } else if (name === getTableName(observation)) { if (!observations.some(row => row.userId === value.userId && row.questionId === value.questionId && row.attemptId === value.attemptId)) observations.push({ ...value }); }
     else if (name === getTableName(initialization)) { if (!states.some(row => row.userId === value.userId && row.questionId === value.questionId)) states.push({ ...value }); }
     else if (!rows.some(row => row.userId === value.userId && row.questionId === value.questionId && row.kind === value.kind && row.attemptIdentity === value.attemptIdentity)) { const row = { ...value, causalOrder: ++sequence }; rows.push(row); inserted.push(row); }
    }
    return inserted;
   };
   return { onConflictDoNothing: () => { const result = write(); return Object.assign(result, { returning: () => result }); }, onConflictDoUpdate: write };
  } }),
 };
 return { tx: tx as any, commit: () => releases.forEach(release => release()) };
}
const inputs = (attemptId: string, ids = ['a']) => ids.map(canonicalQuestionId => ({ userId: 'u', canonicalQuestionId, courseId: 'c', sourceVersion: '1', attemptId, occurredAt: time }));
async function disclose(tx: any, questionId: string, identity: string, at = time) {
 await tx.insert(exposure).values({ id: `ordered:${identity}`, userId: 'u', questionId, courseId: 'c', sourceVersion: '1', kind: 'disclosure', attemptIdentity: identity, exposedAt: at }).onConflictDoNothing();
 await tx.insert(projection).values({ userId: 'u', courseId: 'c', questionId, attemptIdentity: identity, exposedAt: at }).onConflictDoUpdate();
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }

describe('question evidence transaction ordering', () => {
 for (const first of ['disclosure', 'submission'] as const) test(`${first} acquires the lock first at the same wall time`, async () => {
  const entered = deferred(), finish = deferred();
  let fact: string | null = null;
  const runDisclosure = async () => { const t = transaction('disclosure'); await lockQuestionExposures(t.tx, 'u', ['a']); if (first === 'disclosure') { entered.resolve(); await finish.promise; } await disclose(t.tx, 'a', 'real'); t.commit(); };
  const runSubmission = async () => { const t = transaction('submission'); await lockQuestionExposures(t.tx, 'u', ['a']); if (first === 'submission') { entered.resolve(); await finish.promise; } await recordSubmissionBoundaries(t.tx, inputs('attempt')); fact = (await getLatestQuestionExposures(t.tx, 'u', ['a'], 'attempt')).get('a')?.attemptIdentity ?? null; t.commit(); };
  const winner = first === 'disclosure' ? runDisclosure() : runSubmission();
  await entered.promise;
  const loser = first === 'disclosure' ? runSubmission() : runDisclosure();
  finish.resolve(); await Promise.all([winner, loser]);
  expect(fact as string | null).toBe(first === 'disclosure' ? 'real' : null);
  const replay = transaction('processor'); await lockQuestionExposures(replay.tx, 'u', ['a']);
  expect((await getLatestQuestionExposures(replay.tx, 'u', ['a'], 'attempt')).get('a')?.attemptIdentity ?? null).toBe(fact);
  replay.commit();
  expect(trace.filter(entry => entry.endsWith(':user')).slice(0, 2)).toEqual([`${first}:user`, `${first === 'disclosure' ? 'submission' : 'disclosure'}:user`]);
 });
 test('the boundary excludes only its own result, includes tied prior disclosures, and duplicate retries are immutable', async () => {
  const t = transaction('submit'); await lockQuestionExposures(t.tx, 'u', ['b', 'a']);
  await disclose(t.tx, 'a', 'previous');
  await disclose(t.tx, 'a', 'another-real');
  await recordSubmissionBoundaries(t.tx, inputs('attempt', ['a', 'b']));
  const original = rows.map(row => ({ ...row }));
  await recordSubmissionBoundaries(t.tx, inputs('attempt', ['a', 'b']));
  expect(rows).toEqual(original);
  await disclose(t.tx, 'a', 'later');
  const latest = await getLatestQuestionExposures(t.tx, 'u', ['a', 'b'], 'attempt');
  expect(latest.get('a')?.attemptIdentity).toBe('another-real');
  expect(latest.has('b')).toBe(false);
  t.commit();
 });
 test('a later causal event with an older wall clock cannot erase a newer earlier exposure', async () => {
  const t = transaction('submit'); await lockQuestionExposures(t.tx, 'u', ['a']);
  await disclose(t.tx, 'a', 'future-clock', new Date('2026-01-02T00:00:00Z'));
  await disclose(t.tx, 'a', 'older-clock');
  await recordSubmissionBoundaries(t.tx, inputs('attempt'));
  expect((await getLatestQuestionExposures(t.tx, 'u', ['a'], 'attempt')).get('a')?.attemptIdentity).toBe('future-clock');
  t.commit();
 });
 test('processor and list retain the user lock across opposing question batches', async () => {
  const entered = deferred(), finish = deferred();
  const processor = async () => { const t = transaction('processor'); await lockQuestionExposures(t.tx, 'u', ['b']); entered.resolve(); await finish.promise; await lockQuestionExposures(t.tx, 'u', ['a']); t.commit(); };
  const writer = async () => { const t = transaction('writer'); await lockQuestionExposures(t.tx, 'u', ['a', 'b']); t.commit(); };
  const p = processor(); await entered.promise; const w = writer(); finish.resolve(); await Promise.all([p, w]);
  expect(trace.indexOf('processor:questions', trace.indexOf('processor:questions') + 1)).toBeLessThan(trace.indexOf('writer:user'));
 });
 test('old results without a new boundary fail closed', async () => {
  const t = transaction('processor'); await lockQuestionExposures(t.tx, 'u', ['a']);
  await disclose(t.tx, 'a', JSON.stringify(['attempt', 'submission-result']));
  rows[0].id = 'legacy-id';
  await expect(getLatestQuestionExposures(t.tx, 'u', ['a'], 'attempt')).rejects.toThrow('QUESTION_EXPOSURE_BOUNDARY_MISSING');
  t.commit();
 });
 test('authorized staff records an owned snapshot disclosure against its viewer', async () => {
  const t = transaction('staff-viewer'); canonical.add('a');
  await recordAuthorizedStaffAttemptDisclosures(t.tx, { userId: 'u', attemptOwnerId: 'learner', courseId: 'c', attemptId: 'attempt-owner', questionIds: ['a'], occurredAt: time, requestId: 'view' });
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every(row => row.userId === 'u')).toBe(true);
  expect(rows.some(row => row.attemptIdentity === JSON.stringify(['attempt-owner', 'view']))).toBe(true);
  t.commit();
 });
 test('globally authorized payload reconciles for an enrolled viewer without course staff access', async () => {
  const t = transaction('global-viewer'); staffAllowed = false;
  await recordAuthorizedGlobalDisclosures(t.tx, { userId: 'u', questions: [{ questionId: 'a', courseId: 'legacy-c' }], requestId: 'global' });
  await initializeQuestionExposureHistoryBatch(t.tx, inputs('later'));
  await recordSubmissionBoundaries(t.tx, inputs('later'));
  expect((await getLatestQuestionExposures(t.tx, 'u', ['a'], 'later')).get('a')?.attemptIdentity).toBe(JSON.stringify(['staff-bank', bankRows[0].id]));
  t.commit();
 });
 test('staff bank disclosure survives missing canonical rows and reconciles once later', async () => {
  const t = transaction('tutor');
  await recordStaffCourseDisclosures(t.tx, { userId: 'u', courseId: 'c', questionIds: ['a'], contextId: 'bank', requestId: 'r1' });
  await recordStaffCourseDisclosures(t.tx, { userId: 'u', courseId: 'c', questionIds: ['a'], contextId: 'bank', requestId: 'r1' });
  expect(bankRows.map(row => row.questionId)).toEqual(['a']);
  expect(rows).toHaveLength(0);
  canonical.add('a');
  await initializeQuestionExposureHistoryBatch(t.tx, inputs('later'));
  await initializeQuestionExposureHistoryBatch(t.tx, inputs('later'));
  expect(rows).toHaveLength(0);
  expect(projections[0].attemptIdentity).toBe(JSON.stringify(['staff-bank', bankRows[0].id]));
  expect(projections[0].exposedAt).toEqual(bankRows[0].exposedAt);
  await recordSubmissionBoundaries(t.tx, inputs('later'));
  expect((await getLatestQuestionExposures(t.tx, 'u', ['a'], 'later')).get('a')?.attemptIdentity).toBe(projections[0].attemptIdentity);
  t.commit();
 });
 test('a legacy-only staff course reconciles when the canonical course later appears', async () => {
  const t = transaction('legacy-tutor'); legacyOnly = true;
  await recordStaffCourseDisclosures(t.tx, { userId: 'u', courseId: 'legacy-c', questionIds: ['a'], contextId: 'bank', requestId: 'legacy' });
  expect(bankRows[0].courseId).toBe('legacy-c');
  legacyOnly = false; canonical.add('a');
  await initializeQuestionExposureHistoryBatch(t.tx, inputs('later'));
  await recordSubmissionBoundaries(t.tx, inputs('later'));
  expect((await getLatestQuestionExposures(t.tx, 'u', ['a'], 'later')).get('a')?.attemptIdentity).toBe(JSON.stringify(['staff-bank', bankRows[0].id]));
  t.commit();
 });
 test('an unmappable released tryout conservatively covers each question in its course', async () => {
  const t = transaction('tutor');
  await recordStaffCourseDisclosures(t.tx, { userId: 'u', courseId: 'c', questionIds: [], contextId: 'tryout', requestId: 'r', unmappedCourse: true });
  await initializeQuestionExposureHistoryBatch(t.tx, inputs('later', ['a', 'b']));
  await recordSubmissionBoundaries(t.tx, inputs('later', ['a', 'b']));
  const latest = await getLatestQuestionExposures(t.tx, 'u', ['a', 'b'], 'later');
  expect([...latest.keys()].sort()).toEqual(['a', 'b']);
  expect(latest.get('a')?.exposedAt).toEqual(bankRows[0].exposedAt);
  expect(latest.get('b')?.exposedAt).toEqual(bankRows[0].exposedAt);
  t.commit();
 });
 test('denied staff course access writes no disclosure', async () => {
  const t = transaction('denied'); staffAllowed = false;
  await expect(recordStaffCourseDisclosures(t.tx, { userId: 'u', courseId: 'c', questionIds: ['a'], contextId: 'bank', requestId: 'r' })).rejects.toThrow('QUESTION_EXPOSURE_COURSE_ACCESS_DENIED');
  expect(bankRows).toHaveLength(0); expect(rows).toHaveLength(0); t.commit();
 });

 for (const state of ['missing', 'draft'] as const) for (const route of ['attempt', 'course'] as const) test(`${route} review retains ${state} compatibility answers until publication`, async () => {
  const t = transaction('learner');
  if (state === 'draft') { canonical.add('a'); drafts.add('a'); }
  if (route === 'attempt') await recordAttemptDisclosures(t.tx, { userId: 'learner', attemptId: 'attempt-owner', questionIds: [], outsideSnapshot: { questionIds: ['a'], canonicalCourseId: 'c' }, occurredAt: time, requestId: 'review' });
  else await recordAuthorizedCourseDisclosures(t.tx, { userId: 'learner', canonicalCourseId: 'c', questionIds: ['a'], contextId: 'review', occurredAt: time, requestId: 'review' });
  expect(bankRows.map(row => row.questionId)).toEqual(['a']);
  canonical.add('a'); drafts.delete('a');
  const later = [{ ...inputs('later')[0], userId: 'learner', occurredAt: new Date(bankRows[0].exposedAt.getTime() + 1000) }];
  await initializeQuestionExposureHistoryBatch(t.tx, later);
  await recordSubmissionBoundaries(t.tx, later);
  const revealed = (await getLatestQuestionExposures(t.tx, 'learner', ['a'], 'later')).get('a');
  expect(revealed?.exposedAt).toEqual(bankRows[0].exposedAt);
  if (!revealed || revealed.attemptIdentity === null || revealed.exposedAt === null) throw new Error('Expected prior disclosure');
  expect(isEligibleQuestionRetry({ correct: true, attemptId: 'later', occurredAt: later[0].occurredAt, lastReveal: revealed ? { attemptId: revealed.attemptIdentity, occurredAt: revealed.exposedAt } : null })).toBe(false);
  t.commit();
 });
 test('denied learner review cannot write tombstones', async () => {
  const t = transaction('denied-learner'); staffAllowed = false;
  await expect(recordAttemptDisclosures(t.tx, { userId: 'learner', attemptId: 'attempt-owner', questionIds: [], outsideSnapshot: { questionIds: ['a'], canonicalCourseId: 'c' }, occurredAt: time, requestId: 'review' })).rejects.toThrow('QUESTION_EXPOSURE_COURSE_ACCESS_DENIED');
  expect(bankRows).toHaveLength(0); t.commit();
 });
 for (const route of ['attempt', 'course'] as const) test(`${route} legacy-only review reconciles after the course becomes canonical`, async () => {
  const t = transaction('legacy-learner'); legacyOnly = true;
  if (route === 'attempt') await recordAttemptDisclosures(t.tx, { userId: 'learner', attemptId: 'attempt-owner', questionIds: [], outsideSnapshot: { questionIds: ['a'], canonicalCourseId: 'legacy-c' }, occurredAt: time, requestId: 'review' });
  else await recordAuthorizedCourseDisclosures(t.tx, { userId: 'learner', canonicalCourseId: 'legacy-c', questionIds: ['a'], contextId: 'review', occurredAt: time, requestId: 'review' });
  expect(bankRows[0].courseId).toBe('legacy-c');
  legacyOnly = false; canonical.add('a');
  const later = [{ ...inputs('later')[0], userId: 'learner', occurredAt: bankRows[0].exposedAt }];
  await initializeQuestionExposureHistoryBatch(t.tx, later);
  await recordSubmissionBoundaries(t.tx, later);
  const revealed = (await getLatestQuestionExposures(t.tx, 'learner', ['a'], 'later')).get('a');
  expect(revealed?.exposedAt).toEqual(bankRows[0].exposedAt);
  if (!revealed || revealed.attemptIdentity === null || revealed.exposedAt === null) throw new Error('Expected prior disclosure');
  expect(isEligibleQuestionRetry({ correct: true, attemptId: 'later', occurredAt: later[0].occurredAt, lastReveal: revealed ? { attemptId: revealed.attemptIdentity, occurredAt: revealed.exposedAt } : null })).toBe(false);
  t.commit();
 });
 test('12000 prior question and wildcard views retain bounded projection and observation work', async () => {
  const t = transaction('large');
  for (let i = 0; i < 12000; i++) {
   await recordAuthorizedGlobalDisclosures(t.tx, { userId: 'u', questions: [{ questionId: 'a', courseId: 'c' }, { questionId: '__zyx_unmapped_course_disclosure__', courseId: 'c' }], requestId: `view:${i}` });
  }
  expect(bankRows).toHaveLength(24000);
  expect(projections).toHaveLength(2);
  await initializeQuestionExposureHistoryBatch(t.tx, inputs('later'));
  await initializeQuestionExposureHistoryBatch(t.tx, inputs('later'));
  expect(rows).toHaveLength(0);
  await recordSubmissionBoundaries(t.tx, inputs('later'));
  expect(projectionProbes).toBe(4);
  expect(rows).toHaveLength(1);
  const before = (await getLatestQuestionExposures(t.tx, 'u', ['a'], 'later')).get('a')?.attemptIdentity;
  await recordAuthorizedGlobalDisclosures(t.tx, { userId: 'u', questions: [{ questionId: 'a', courseId: 'c' }], requestId: 'after' });
  expect((await getLatestQuestionExposures(t.tx, 'u', ['a'], 'later')).get('a')?.attemptIdentity).toBe(before);
  await recordSubmissionBoundaries(t.tx, inputs('later'));
  expect(observations).toHaveLength(1);
  t.commit();
 });
 test('legacy index excludes only the current attempt, not a second historical attempt', async () => {
  const t = transaction('legacy-current');
  legacyRows.push({ userId: 'u', questionId: 'question:a', firstAttemptId: 'only', lastAttemptId: 'only' });
  await initializeQuestionExposureHistoryBatch(t.tx, inputs('only'));
  expect(rows).toHaveLength(0);
  states = [];
  legacyRows[0].lastAttemptId = 'other';
  await initializeQuestionExposureHistoryBatch(t.tx, inputs('only'));
  expect(rows.map(row => row.attemptIdentity)).toEqual(['baseline']);
  t.commit();
 });
 test('equal-time live keys use causal order across question and wildcard projections', async () => {
  const t = transaction('live-tie');
  projections.push({ userId: 'u', courseId: 'c', questionId: 'a', attemptIdentity: 'first', exposedAt: time, causalOrder: 1 });
  projections.push({ userId: 'u', courseId: 'c', questionId: '__zyx_unmapped_course_disclosure__', attemptIdentity: 'second', exposedAt: time, causalOrder: 2 });
  await recordSubmissionBoundaries(t.tx, inputs('later'));
  expect((await getLatestQuestionExposures(t.tx, 'u', ['a'], 'later')).get('a')?.attemptIdentity).toBe('second');
  t.commit();
 });
 test('equal-time legacy keys with unknowable order remain conservative', async () => {
  const t = transaction('legacy-tie');
  projections.push({ userId: 'u', courseId: 'c', questionId: 'a', attemptIdentity: 'one', exposedAt: time, causalOrder: -1 });
  projections.push({ userId: 'u', courseId: 'c', questionId: '__zyx_unmapped_course_disclosure__', attemptIdentity: 'two', exposedAt: time, causalOrder: -2 });
  await recordSubmissionBoundaries(t.tx, inputs('later'));
  expect((await getLatestQuestionExposures(t.tx, 'u', ['a'], 'later')).get('a')?.attemptIdentity).toBe('__zyx_uncertain_exposure__');
  t.commit();
 });
 test('unverified legacy state never initializes an empty history', async () => {
  const t = transaction('not-ready'); ready = false;
  expect(await initializeQuestionExposureHistoryBatch(t.tx, inputs('later'))).toBe(false);
  expect(states).toHaveLength(0);
  ready = true; legacyRows.push({ userId: 'u', questionId: 'question:a', firstAttemptId: 'old', lastAttemptId: 'old' });
  expect(await initializeQuestionExposureHistoryBatch(t.tx, inputs('later'))).toBe(true);
  await recordSubmissionBoundaries(t.tx, inputs('later'));
  expect((await getLatestQuestionExposures(t.tx, 'u', ['a'], 'later')).get('a')?.attemptIdentity).toBe('baseline');
  t.commit();
 });
});
