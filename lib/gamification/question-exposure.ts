import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { gamificationQuestionExposures, gamificationQuestionExposureInitializations, gamificationQuestionBankDisclosures, mataKuliah, soal, studentQuizAttempts } from '@/db/schema';
import { resolveCourseAccess } from '@/lib/student/course-access';
import { snapshotExposureIdentity, submissionResultIdentity } from './question-exposure-policy';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type HistoryInput = { userId: string; canonicalQuestionId: string; courseId: string; sourceVersion: string; attemptId: string; occurredAt: Date };
type AttemptInput = { userId: string; attemptId: string; questionId: string; occurredAt: Date };

function assertInput(input: HistoryInput) {
 if (!input.userId || !input.canonicalQuestionId || !input.courseId || !input.attemptId || !/^[1-9]\d*$/.test(input.sourceVersion) || !Number.isSafeInteger(Number(input.sourceVersion)) || !(input.occurredAt instanceof Date) || !Number.isFinite(input.occurredAt.getTime())) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
}

/** Serialize all question work for one viewer before any question or attempt row lock.
 * This is the same user lock used by the outbox processor and cosmetic account writes.
 */
export async function lockQuestionExposureUser(tx: Transaction, userId: string) {
 if (!userId) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
 await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
}

export async function lockQuestionExposure(tx: Transaction, userId: string, canonicalQuestionId: string) {
 await lockQuestionExposures(tx, userId, [canonicalQuestionId]);
}

/** The user lock also prevents a transaction accumulating question locks in conflicting orders. */
export async function lockQuestionExposures(tx: Transaction, userId: string, canonicalQuestionIds: readonly string[]) {
 await lockQuestionExposureUser(tx, userId);
 const keys = [...new Set(canonicalQuestionIds)].sort().map(id => JSON.stringify(['zyx:question-exposure', userId, id]));
 if (keys.length) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(key, 0)) from (select key from jsonb_array_elements_text(${JSON.stringify(keys)}::jsonb) as t(key) order by key) ordered`);
}

const orderedExposureId = () => `ordered:${crypto.randomUUID()}`;
const UNMAPPED_COURSE_DISCLOSURE = '__zyx_unmapped_course_disclosure__';

/** Caller already authorized the returned staff payload, which can span courses. */
export async function recordAuthorizedGlobalDisclosures(tx: Transaction, input: { userId: string; questions: readonly { questionId: string; courseId: string }[]; requestId: string }) {
 if (!input.userId || !input.requestId) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
 const entries = [...new Map(input.questions.filter(q => q.questionId && q.courseId).map(q => [JSON.stringify([q.courseId, q.questionId]), q])).values()];
 if (!entries.length) return;
 await lockQuestionExposureUser(tx, input.userId);
 const exposedAt = new Date();
 await tx.insert(gamificationQuestionBankDisclosures).values(entries.map(q => ({ id: JSON.stringify(['staff-bank', input.userId, q.courseId, q.questionId, input.requestId]), userId: input.userId, questionId: q.questionId, courseId: q.courseId, exposedAt }))).onConflictDoNothing();
}

/** Resolve question IDs exclusively from the already authorized server snapshots. */
export function authorizedSnapshotDisclosures(courseId: string, snapshots: readonly unknown[]) {
 const questions: { questionId: string; courseId: string }[] = [];
 for (const snapshot of snapshots) {
  if (!Array.isArray(snapshot)) { questions.push({ questionId: UNMAPPED_COURSE_DISCLOSURE, courseId }); continue; }
  for (const value of snapshot) {
   if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as Record<string, unknown>).id !== 'string') { questions.push({ questionId: UNMAPPED_COURSE_DISCLOSURE, courseId }); continue; }
   const identity = snapshotExposureIdentity(value);
   questions.push({ questionId: identity?.canonicalQuestionId ?? (value as { id: string }).id, courseId: identity?.courseId ?? courseId });
  }
 }
 return questions;
}

/** The caller holds the ordered locks for the entire set. */
export async function initializeQuestionExposureHistoryBatch(tx: Transaction, inputs: HistoryInput[]) {
 if (!inputs.length) return;
 inputs.forEach(assertInput);
 const first = inputs[0];
 if (inputs.some(i => i.userId !== first.userId || i.attemptId !== first.attemptId || i.occurredAt.getTime() !== first.occurredAt.getTime())) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
 const unique = [...new Map(inputs.map(i => [i.canonicalQuestionId, i])).values()];
 // Materialize previously unmapped staff-bank disclosures once the canonical row exists.
 // Stable identities make repeated reconciliation idempotent and preserve original times.
 const bank = await tx.select().from(gamificationQuestionBankDisclosures).where(and(eq(gamificationQuestionBankDisclosures.userId, first.userId), inArray(gamificationQuestionBankDisclosures.questionId, [...unique.map(i => i.canonicalQuestionId), UNMAPPED_COURSE_DISCLOSURE])));
 const byQuestion = new Map(unique.map(i => [i.canonicalQuestionId, i]));
 const courses = bank.length ? await tx.select({ id: mataKuliah.id, legacyId: mataKuliah.legacyCourseId }).from(mataKuliah).where(inArray(mataKuliah.id, [...new Set(unique.map(i => i.courseId))])) : [];
 const legacyByCourse = new Map(courses.map(course => [course.id, course.legacyId]));
 const sameCourse = (identity: HistoryInput, courseId: string) => identity.courseId === courseId || legacyByCourse.get(identity.courseId) === courseId;
 const reconciled = bank.flatMap(row => {
  const matches = row.questionId === UNMAPPED_COURSE_DISCLOSURE ? unique.filter(i => sameCourse(i, row.courseId)) : [byQuestion.get(row.questionId)].filter((i): i is HistoryInput => Boolean(i && sameCourse(i, row.courseId)));
  return matches.map(identity => ({ id: orderedExposureId(), userId: row.userId, questionId: identity.canonicalQuestionId, courseId: identity.courseId, sourceVersion: identity.sourceVersion, kind: 'disclosure' as const, attemptIdentity: JSON.stringify(['staff-bank', row.id]), exposedAt: row.exposedAt }));
 });
 if (reconciled.length) await tx.insert(gamificationQuestionExposures).values(reconciled).onConflictDoNothing();
 const states = await tx.select().from(gamificationQuestionExposureInitializations).where(and(eq(gamificationQuestionExposureInitializations.userId, first.userId), inArray(gamificationQuestionExposureInitializations.questionId, unique.map(i => i.canonicalQuestionId))));
 const initialized = new Set(states.map(s => s.questionId));
 const pending = unique.filter(i => !initialized.has(i.canonicalQuestionId));
 if (!pending.length) return;
 // One scan checks all requested IDs. Any malformed history conservatively affects every ID.
 const result = await tx.execute<{ question_id: string; uncertain: boolean }>(sql`with history as materialized (
  select a.questions_snapshot as snapshot from student_quiz_attempts a where a.student_id = ${first.userId} and a.id <> ${first.attemptId}
 ), elements as materialized (
  select q from history, lateral jsonb_array_elements(case when jsonb_typeof(snapshot) = 'array' then snapshot else '[]'::jsonb end) q
 ), uncertain_ids as (
  select q->>'id' as id from elements union select q->'gamificationProvenance'->>'canonicalQuestionId' from elements
 ), malformed as (
  select exists (select 1 from history where jsonb_typeof(snapshot) is distinct from 'array') or exists (select 1 from elements where jsonb_typeof(q) is distinct from 'object' or coalesce(q->>'id', '') = '') as uncertain
 )
 select requested.question_id, (malformed.uncertain or uncertain_ids.id is not null) as uncertain
 from jsonb_array_elements_text(${JSON.stringify(pending.map(i => i.canonicalQuestionId))}::jsonb) as requested(question_id)
 cross join malformed left join uncertain_ids on uncertain_ids.id = requested.question_id`);
 const uncertainty = new Map(result.rows.map(row => [row.question_id, row.uncertain]));
 if (pending.some(i => typeof uncertainty.get(i.canonicalQuestionId) !== 'boolean')) throw new Error('QUESTION_EXPOSURE_HISTORY_UNAVAILABLE');
 const baselines = pending.filter(i => uncertainty.get(i.canonicalQuestionId)).map(i => ({ id: orderedExposureId(), userId: i.userId, questionId: i.canonicalQuestionId, courseId: i.courseId, sourceVersion: i.sourceVersion, kind: 'baseline' as const, attemptIdentity: 'baseline', exposedAt: i.occurredAt }));
 if (baselines.length) await tx.insert(gamificationQuestionExposures).values(baselines).onConflictDoNothing();
 await tx.insert(gamificationQuestionExposureInitializations).values(pending.map(i => ({ userId: i.userId, questionId: i.canonicalQuestionId, initializedAt: i.occurredAt }))).onConflictDoNothing();
}
export async function initializeQuestionExposureHistory(tx: Transaction, input: HistoryInput) {
 await lockQuestionExposure(tx, input.userId, input.canonicalQuestionId);
 await initializeQuestionExposureHistoryBatch(tx, [input]);
}

/** A submission result is a persistent boundary, inserted under the viewer lock.
 * Its order, rather than milliseconds or UUID order, determines what preceded the fact.
 */
export async function recordSubmissionBoundaries(tx: Transaction, inputs: HistoryInput[]) {
 if (!inputs.length) return;
 const first = inputs[0];
 inputs.forEach(assertInput);
 if (inputs.some(i => i.userId !== first.userId || i.attemptId !== first.attemptId)) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
 const unique = [...new Map(inputs.map(i => [i.canonicalQuestionId, i])).values()];
 await tx.insert(gamificationQuestionExposures).values(unique.map(i => ({ id: orderedExposureId(), userId: i.userId, questionId: i.canonicalQuestionId, courseId: i.courseId, sourceVersion: i.sourceVersion, kind: 'disclosure' as const, attemptIdentity: submissionResultIdentity(i.attemptId), exposedAt: i.occurredAt }))).onConflictDoNothing();
}

/** Missing initialization or a missing/new-format boundary fails closed. */
export async function getLatestQuestionExposures(tx: Transaction, userId: string, ids: string[], boundaryAttemptId?: string) {
 const unique = [...new Set(ids)];
 if (!unique.length) return new Map<string, typeof gamificationQuestionExposures.$inferSelect>();
 const states = await tx.select().from(gamificationQuestionExposureInitializations).where(and(eq(gamificationQuestionExposureInitializations.userId, userId), inArray(gamificationQuestionExposureInitializations.questionId, unique)));
 if (states.length !== unique.length) throw new Error('QUESTION_EXPOSURE_NOT_INITIALIZED');
 let boundaryCondition;
 if (boundaryAttemptId) {
  const markers = await tx.select().from(gamificationQuestionExposures).where(and(eq(gamificationQuestionExposures.userId, userId), inArray(gamificationQuestionExposures.questionId, unique), eq(gamificationQuestionExposures.kind, 'disclosure'), eq(gamificationQuestionExposures.attemptIdentity, submissionResultIdentity(boundaryAttemptId))));
  if (markers.length !== unique.length || markers.some(row => !row.id.startsWith('ordered:'))) throw new Error('QUESTION_EXPOSURE_BOUNDARY_MISSING');
  boundaryCondition = or(...markers.map(row => and(eq(gamificationQuestionExposures.questionId, row.questionId), lt(gamificationQuestionExposures.causalOrder, row.causalOrder))));
 }
 // The boundary excludes later transactions. Among earlier rows use the greatest
 // wall time conservatively, including when a server clock moves backwards.
 const rows = await tx.selectDistinctOn([gamificationQuestionExposures.questionId]).from(gamificationQuestionExposures).where(and(eq(gamificationQuestionExposures.userId, userId), inArray(gamificationQuestionExposures.questionId, unique), boundaryCondition)).orderBy(gamificationQuestionExposures.questionId, desc(gamificationQuestionExposures.exposedAt), desc(gamificationQuestionExposures.causalOrder), desc(gamificationQuestionExposures.id));
 return new Map(rows.map(row => [row.questionId, row]));
}
export async function getLatestQuestionExposure(tx: Transaction, userId: string, canonicalQuestionId: string, boundaryAttemptId?: string) {
 return (await getLatestQuestionExposures(tx, userId, [canonicalQuestionId], boundaryAttemptId)).get(canonicalQuestionId) ?? null;
}

async function resolveAttempt(tx: Transaction, input: AttemptInput, allowLegacy: boolean): Promise<HistoryInput | null> {
 if (!input.userId || !input.attemptId || !input.questionId || !(input.occurredAt instanceof Date) || !Number.isFinite(input.occurredAt.getTime())) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
 const [attempt] = await tx.select({ snapshot: studentQuizAttempts.questionsSnapshot }).from(studentQuizAttempts).where(and(eq(studentQuizAttempts.id, input.attemptId), eq(studentQuizAttempts.studentId, input.userId))).limit(1);
 if (!attempt) throw new Error('QUESTION_EXPOSURE_ATTEMPT_NOT_FOUND');
 if (!Array.isArray(attempt.snapshot)) return null;
 const matches = attempt.snapshot.filter((q: unknown) => q && typeof q === 'object' && !Array.isArray(q) && (q as Record<string, unknown>).id === input.questionId);
 if (matches.length !== 1) return null;
 const identity = snapshotExposureIdentity(matches[0]);
 if (identity) return { ...input, ...identity };
 // A malformed marker is not a legacy snapshot. Never use it for a reward or mapping.
 if (!allowLegacy || Object.hasOwn(matches[0], 'gamificationProvenance')) return null;
 const [canonical] = await tx.select({ id: soal.id, courseId: soal.mataKuliahId, version: soal.version }).from(soal).where(eq(soal.id, input.questionId)).limit(1);
 if (!canonical || !canonical.courseId || !Number.isSafeInteger(canonical.version) || canonical.version < 1) return null;
 return { ...input, canonicalQuestionId: canonical.id, courseId: canonical.courseId, sourceVersion: String(canonical.version) };
}

/** requestId must be server-generated and stable across retries of one disclosure event. */
export async function recordQuestionDisclosure(tx: Transaction, input: AttemptInput & { requestId: string }) {
 if (!input.requestId) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
 const identity = await resolveAttempt(tx, input, true);
 if (!identity) return { status: 'unsupported' as const };
 await lockQuestionExposures(tx, identity.userId, [identity.canonicalQuestionId]);
 identity.occurredAt = new Date();
 await initializeQuestionExposureHistoryBatch(tx, [identity]);
 await tx.insert(gamificationQuestionExposures).values({ id: orderedExposureId(), userId: identity.userId, questionId: identity.canonicalQuestionId, courseId: identity.courseId, sourceVersion: identity.sourceVersion, kind: 'disclosure', attemptIdentity: JSON.stringify([identity.attemptId, input.requestId]), exposedAt: identity.occurredAt }).onConflictDoNothing();
 return { status: 'recorded' as const, identity };
}

/** Unsupported snapshots cannot establish a reward identity or a verified empty history. */
export async function prepareQuestionRewardExposure(tx: Transaction, input: AttemptInput) {
 const identity = await resolveAttempt(tx, input, false);
 if (!identity) return { status: 'unsupported' as const };
 await initializeQuestionExposureHistory(tx, identity);
 const latest = await getLatestQuestionExposure(tx, identity.userId, identity.canonicalQuestionId);
 return { status: 'ready' as const, identity, latest };
}

/** Record a response's disclosed snapshot questions using one owned-attempt lookup. */
async function recordAttemptDisclosuresForOwner(tx: Transaction, ownerId: string, input: { userId: string; attemptId: string; questionIds: readonly string[]; occurredAt: Date; requestId: string; outsideSnapshot?: { questionIds: readonly string[]; canonicalCourseId: string } }) {
 if (!input.userId || !input.attemptId || !input.requestId || !Number.isFinite(input.occurredAt.getTime())) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
 const ids = [...new Set(input.questionIds.filter(Boolean))];
 if (!ids.length && !input.outsideSnapshot?.questionIds.length) return;
 const [attempt] = await tx.select({ snapshot: studentQuizAttempts.questionsSnapshot }).from(studentQuizAttempts).where(and(eq(studentQuizAttempts.id, input.attemptId), eq(studentQuizAttempts.studentId, ownerId))).limit(1);
 if (!attempt) throw new Error('QUESTION_EXPOSURE_ATTEMPT_NOT_FOUND');
 if (!Array.isArray(attempt.snapshot)) throw new Error('QUESTION_EXPOSURE_SNAPSHOT_INVALID');
 const requested = new Set(ids);
 const matches = new Map<string, Record<string, unknown>[]>();
 for (const value of attempt.snapshot) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
  const q = value as Record<string, unknown>;
  if (typeof q.id !== 'string' || !requested.has(q.id)) continue;
  const found = matches.get(q.id) ?? [];
  found.push(q);
  matches.set(q.id, found);
 }
 const legacyIds = ids.filter(id => matches.get(id)?.length === 1 && !Object.hasOwn(matches.get(id)![0], 'gamificationProvenance'));
 const canonical = legacyIds.length ? await tx.select({ id: soal.id, courseId: soal.mataKuliahId, version: soal.version }).from(soal).where(inArray(soal.id, legacyIds)) : [];
 const canonicalById = new Map(canonical.map(row => [row.id, row]));
 const identities: HistoryInput[] = [];
 for (const id of ids) {
  const found = matches.get(id);
  if (!found || found.length !== 1) continue;
  const identity = snapshotExposureIdentity(found[0]);
  if (identity) identities.push({ ...input, ...identity });
  else if (!Object.hasOwn(found[0], 'gamificationProvenance')) {
   const row = canonicalById.get(id);
   if (row?.courseId && Number.isSafeInteger(row.version) && row.version > 0) identities.push({ ...input, canonicalQuestionId: row.id, courseId: row.courseId, sourceVersion: String(row.version) });
  }
 }
 // Outside-snapshot questions must be resolved from published canonical rows in the
 // already-authorized course, never from a client-provided version or answer.
 if (input.outsideSnapshot?.questionIds.length) {
  const outsideIds = [...new Set(input.outsideSnapshot.questionIds)].filter(id => !requested.has(id));
  if (outsideIds.length) {
   const rows = await tx.select({ id: soal.id, courseId: soal.mataKuliahId, version: soal.version }).from(soal).where(and(inArray(soal.id, outsideIds), eq(soal.mataKuliahId, input.outsideSnapshot.canonicalCourseId), eq(soal.status, 'published')));
   for (const row of rows) if (row.courseId && Number.isSafeInteger(row.version) && row.version > 0) identities.push({ ...input, canonicalQuestionId: row.id, courseId: row.courseId, sourceVersion: String(row.version) });
  }
 }
 await lockQuestionExposures(tx, input.userId, identities.map(identity => identity.canonicalQuestionId));
 // Submission already captured its timestamp under this lock. Other callers must not
 // use a timestamp captured while waiting for the lock.
 const occurredAt = input.requestId === 'submission-result' ? input.occurredAt : new Date();
 identities.forEach(identity => { identity.occurredAt = occurredAt; });
 await initializeQuestionExposureHistoryBatch(tx, identities);
 if (identities.length) await tx.insert(gamificationQuestionExposures).values(identities.map(identity => ({ id: orderedExposureId(), userId: identity.userId, questionId: identity.canonicalQuestionId, courseId: identity.courseId, sourceVersion: identity.sourceVersion, kind: 'disclosure' as const, attemptIdentity: JSON.stringify([identity.attemptId, input.requestId]), exposedAt: identity.occurredAt }))).onConflictDoNothing();
}

/** Owned attempts only. Staff access uses the separately authorized entry point. */
export async function recordAttemptDisclosures(tx: Transaction, input: Parameters<typeof recordAttemptDisclosuresForOwner>[2]) {
 return recordAttemptDisclosuresForOwner(tx, input.userId, input);
}

/** The caller authorized this exact attempt; independently recheck the staff course boundary. */
export async function recordAuthorizedStaffAttemptDisclosures(tx: Transaction, input: Parameters<typeof recordAttemptDisclosuresForOwner>[2] & { attemptOwnerId: string; courseId: string }) {
 await lockQuestionExposureUser(tx, input.userId);
 const access = await resolveCourseAccess({ userId: input.userId, courseId: input.courseId }, tx);
 if (access.tier !== 'staff' || !access.hasCourseAccess) throw new Error('QUESTION_EXPOSURE_COURSE_ACCESS_DENIED');
 await recordAttemptDisclosuresForOwner(tx, input.attemptOwnerId, input);
 await recordStaffCourseDisclosures(tx, { userId: input.userId, courseId: input.courseId, questionIds: input.questionIds, contextId: `staff-attempt:${input.attemptId}`, requestId: input.requestId });
}

/** Staff bank responses can include canonical keys even when the viewer is also a learner. */
export async function recordStaffCourseDisclosures(tx: Transaction, input: { userId: string; courseId: string; questionIds: readonly string[]; contextId: string; requestId: string; unmappedCourse?: boolean }) {
 await lockQuestionExposureUser(tx, input.userId);
 const access = await resolveCourseAccess({ userId: input.userId, courseId: input.courseId }, tx);
 if (access.tier !== 'staff' || !access.hasCourseAccess) throw new Error('QUESTION_EXPOSURE_COURSE_ACCESS_DENIED');
 const disclosureCourseId = access.canonicalCourseId ?? access.legacyCourseId ?? access.courseId;
 if (!disclosureCourseId) throw new Error('QUESTION_EXPOSURE_COURSE_ACCESS_DENIED');
 const ids = [...new Set(input.questionIds.filter(Boolean))];
 if (!ids.length && !input.unmappedCourse) return;
 const rows = ids.length && access.canonicalCourseId ? await tx.select({ id: soal.id, version: soal.version }).from(soal).where(and(inArray(soal.id, ids), eq(soal.mataKuliahId, access.canonicalCourseId))) : [];
 const known = new Set(rows.filter(row => Number.isSafeInteger(row.version) && row.version > 0).map(row => row.id));
 const occurredAt = new Date();
 const unresolved = [...ids.filter(id => !known.has(id)), ...(input.unmappedCourse ? [UNMAPPED_COURSE_DISCLOSURE] : [])];
 if (unresolved.length) await tx.insert(gamificationQuestionBankDisclosures).values(unresolved.map(questionId => ({ id: JSON.stringify(['staff-bank', input.userId, disclosureCourseId, questionId, input.requestId]), userId: input.userId, questionId, courseId: disclosureCourseId, exposedAt: occurredAt }))).onConflictDoNothing();
 if (access.canonicalCourseId) await recordCourseDisclosures(tx, { ...input, canonicalCourseId: access.canonicalCourseId, occurredAt }, true);
}

/** The caller has already authorized the released review and its questions. */
type CourseDisclosureInput = { userId: string; canonicalCourseId: string; questionIds: readonly string[]; contextId: string; occurredAt: Date; requestId: string };
export async function recordAuthorizedCourseDisclosures(tx: Transaction, input: CourseDisclosureInput) {
 return recordCourseDisclosures(tx, input, false);
}
async function recordCourseDisclosures(tx: Transaction, input: CourseDisclosureInput, includeUnpublished: boolean) {
 if (!input.userId || !input.canonicalCourseId || !input.contextId || !input.requestId || !(input.occurredAt instanceof Date) || !Number.isFinite(input.occurredAt.getTime())) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
 await lockQuestionExposureUser(tx, input.userId);
 const access = await resolveCourseAccess({ userId: input.userId, courseId: input.canonicalCourseId }, tx);
 if (!access.hasCourseAccess || access.canonicalCourseId !== input.canonicalCourseId) throw new Error('QUESTION_EXPOSURE_COURSE_ACCESS_DENIED');
 const ids = [...new Set(input.questionIds.filter(Boolean))];
 if (!ids.length) return;
 const rows = await tx.select({ id: soal.id, courseId: soal.mataKuliahId, version: soal.version }).from(soal).where(and(inArray(soal.id, ids), eq(soal.mataKuliahId, input.canonicalCourseId), includeUnpublished ? undefined : eq(soal.status, 'published')));
 const identities: HistoryInput[] = rows.filter(row => row.courseId && Number.isSafeInteger(row.version) && row.version > 0).map(row => ({ userId: input.userId, canonicalQuestionId: row.id, courseId: row.courseId!, sourceVersion: String(row.version), attemptId: JSON.stringify(['course-review', input.contextId]), occurredAt: input.occurredAt }));
 await lockQuestionExposures(tx, input.userId, identities.map(identity => identity.canonicalQuestionId));
 const occurredAt = new Date();
 identities.forEach(identity => { identity.occurredAt = occurredAt; });
 await initializeQuestionExposureHistoryBatch(tx, identities);
 if (identities.length) await tx.insert(gamificationQuestionExposures).values(identities.map(identity => ({ id: orderedExposureId(), userId: identity.userId, questionId: identity.canonicalQuestionId, courseId: identity.courseId, sourceVersion: identity.sourceVersion, kind: 'disclosure' as const, attemptIdentity: JSON.stringify([identity.attemptId, input.requestId]), exposedAt: identity.occurredAt }))).onConflictDoNothing();
}
