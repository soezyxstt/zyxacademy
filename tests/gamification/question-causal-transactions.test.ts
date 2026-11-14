import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { getTableName } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { gamificationQuestionExposures as exposure, gamificationQuestionExposureInitializations as initialization, gamificationQuestionBankDisclosures as bankTable, soal, mataKuliah, studentQuizAttempts } from '../../db/schema';

mock.module('@/db', () => ({ db: {} }));
let staffAllowed = true;
let legacyOnly = false;
mock.module('@/lib/student/course-access', () => ({ resolveCourseAccess: async () => ({ tier: staffAllowed ? 'staff' : 'free', hasCourseAccess: staffAllowed, canonicalCourseId: legacyOnly ? null : 'c', legacyCourseId: 'legacy-c', courseId: legacyOnly ? 'legacy-c' : 'c' }) }));
const { lockQuestionExposures, recordSubmissionBoundaries, getLatestQuestionExposures, recordStaffCourseDisclosures, initializeQuestionExposureHistoryBatch, recordAuthorizedStaffAttemptDisclosures, recordAuthorizedGlobalDisclosures } = await import('../../lib/gamification/question-exposure');
const dialect = new PgDialect();
type Row = { id: string; userId: string; questionId: string; courseId: string; sourceVersion: string; kind: 'baseline' | 'disclosure'; attemptIdentity: string; exposedAt: Date; causalOrder: bigint };
const time = new Date('2026-01-01T12:00:00.000Z');
let rows: Row[];
let sequence: bigint;
let locks: Map<string, Promise<void>>;
let trace: string[];
let bankRows: { id: string; userId: string; questionId: string; courseId: string; exposedAt: Date }[];
let canonical: Set<string>;
const heldQuestion = { id: 'a', question_type: 'multiple_choice', options: ['a', 'b'], correct_indices: [1], gamificationProvenance: { marker: 'canonical-objective-v1', canonicalQuestionId: 'a', courseId: 'c', sourceVersion: '1', answerProof: { questionType: 'multiple_choice', correctIndices: [1] } } };

beforeEach(() => { rows = []; sequence = 0n; locks = new Map(); trace = []; bankRows = []; canonical = new Set(); staffAllowed = true; legacyOnly = false; });

/** Minimal transaction adapter: it executes the production Drizzle predicates,
 * enforces unique disclosure identities, and queues advisory locks until commit. */
function transaction(name: string) {
 const releases: (() => void)[] = [];
 const held = new Set<string>();
 const query = (table: any, condition: any, distinct: boolean) => {
  const { sql, params } = dialect.sqlToQuery(condition);
  if (getTableName(table) === getTableName(studentQuizAttempts)) return params[0] === 'attempt-owner' && params[1] === 'learner' ? [{ snapshot: [heldQuestion] }] : [];
  const owner = params[0] as string;
  const list = sql.match(/"question_id" in \(([^)]+)\)/)?.[1] ?? '';
  const ids = [...list.matchAll(/\$(\d+)/g)].map(match => String(params[Number(match[1]) - 1]));
  if (getTableName(table) === getTableName(mataKuliah)) return [{ id: 'c', legacyId: 'legacy-c' }];
  if (getTableName(table) === getTableName(initialization)) return ids.map(questionId => ({ userId: owner, questionId, initializedAt: time }));
  if (getTableName(table) === getTableName(soal)) return ids.filter(id => canonical.has(id)).map(id => ({ id, courseId: 'c', version: 1 }));
  if (getTableName(table) === getTableName(bankTable)) return bankRows.filter(row => row.userId === owner && ids.includes(row.questionId));
  let result = rows.filter(row => row.userId === owner && ids.includes(row.questionId));
  const kind = sql.match(/"kind" = \$(\d+)/);
  const identity = sql.match(/"attempt_identity" = \$(\d+)/);
  if (kind) result = result.filter(row => row.kind === params[Number(kind[1]) - 1]);
  if (identity) result = result.filter(row => row.attemptIdentity === params[Number(identity[1]) - 1]);
  const bounds = [...sql.matchAll(/"question_id" = \$(\d+) and "[^"]+"\."causal_order" < \$(\d+)/g)];
  if (bounds.length) result = result.filter(row => bounds.some(match => row.questionId === params[Number(match[1]) - 1] && row.causalOrder < BigInt(params[Number(match[2]) - 1] as bigint)));
  if (!distinct) return result;
  result.sort((a, b) => a.questionId.localeCompare(b.questionId) || b.exposedAt.getTime() - a.exposedAt.getTime() || (a.causalOrder > b.causalOrder ? -1 : a.causalOrder < b.causalOrder ? 1 : 0));
  return result.filter((row, index) => index === 0 || result[index - 1].questionId !== row.questionId);
 };
 const tx = {
  async execute(statement: any) {
   const { params } = dialect.sqlToQuery(statement);
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
  select: () => ({ from: (table: any) => ({ where: (condition: any) => { const result = Promise.resolve(query(table, condition, false)); return Object.assign(result, { limit: () => result }); } }) }),
  selectDistinctOn: () => ({ from: (table: any) => ({ where: (condition: any) => ({ orderBy: () => Promise.resolve(query(table, condition, true)) }) }) }),
  insert: (table: any) => ({ values: (values: any | any[]) => { const write = async () => {
   for (const value of Array.isArray(values) ? values : [values]) {
    if (getTableName(table) === getTableName(bankTable)) { if (!bankRows.some(row => row.id === value.id)) bankRows.push(value); continue; }
    if (rows.some(row => row.userId === value.userId && row.questionId === value.questionId && row.kind === value.kind && row.attemptIdentity === value.attemptIdentity)) continue;
    rows.push({ ...value, causalOrder: ++sequence });
   }
  }; return { onConflictDoNothing: write, then: (resolve: (value: void) => unknown, reject: (error: unknown) => unknown) => write().then(resolve, reject) }; } }),
 };
 return { tx: tx as any, commit: () => releases.forEach(release => release()) };
}
const inputs = (attemptId: string, ids = ['a']) => ids.map(canonicalQuestionId => ({ userId: 'u', canonicalQuestionId, courseId: 'c', sourceVersion: '1', attemptId, occurredAt: time }));
async function disclose(tx: any, questionId: string, identity: string, at = time) {
 await tx.insert(exposure).values({ id: `ordered:${identity}`, userId: 'u', questionId, courseId: 'c', sourceVersion: '1', kind: 'disclosure', attemptIdentity: identity, exposedAt: at }).onConflictDoNothing();
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
  expect(rows).toHaveLength(1);
  expect(rows[0].attemptIdentity).toBe(JSON.stringify(['staff-bank', bankRows[0].id]));
  expect(rows[0].exposedAt).toEqual(bankRows[0].exposedAt);
  await recordSubmissionBoundaries(t.tx, inputs('later'));
  expect((await getLatestQuestionExposures(t.tx, 'u', ['a'], 'later')).get('a')?.attemptIdentity).toBe(rows[0].attemptIdentity);
  t.commit();
 });
 test('a legacy-only staff course reconciles when the canonical course later appears', async () => {
  const t = transaction('legacy-tutor'); legacyOnly = true;
  await recordStaffCourseDisclosures(t.tx, { userId: 'u', courseId: 'legacy-c', questionIds: ['a'], contextId: 'bank', requestId: 'legacy' });
  expect(bankRows[0].courseId).toBe('legacy-c');
  legacyOnly = false; canonical.add('a');
  await initializeQuestionExposureHistoryBatch(t.tx, inputs('later'));
  expect(rows[0].courseId).toBe('c');
  expect(rows[0].attemptIdentity).toBe(JSON.stringify(['staff-bank', bankRows[0].id]));
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

});
