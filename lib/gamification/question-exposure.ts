import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { gamificationQuestionExposures, gamificationQuestionExposureInitializations, gamificationQuestionBankDisclosures, gamificationQuestionExposureProjection, gamificationQuestionExposureObservations, gamificationQuestionLegacyIndex, gamificationQuestionHistoryCutover, soal, studentQuizAttempts, quizTemplates } from '@/db/schema';
import { resolveCourseAccess } from '@/lib/student/course-access';
import { snapshotExposureIdentity, submissionResultIdentity, UNCERTAIN_EXPOSURE_IDENTITY } from './question-exposure-policy';
import { lockCanonicalQuestionRows } from '@/lib/question-row-locks';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type HistoryInput = { userId: string; canonicalQuestionId: string; courseId: string; sourceVersion: string; attemptId: string; occurredAt: Date };
type AttemptInput = { userId: string; attemptId: string; questionId: string; occurredAt: Date };
/** IDs include absent rows. Use only the set acquired by this transaction. */
export type HeldCanonicalQuestions = { ids: readonly string[]; rows: Awaited<ReturnType<typeof lockCanonicalQuestions>> };

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

/** Lock canonical rows in deterministic order after the viewer lock. Deletions and edits
 * wait until all reward decisions and disclosures in this transaction are complete. */
export async function lockCanonicalQuestions(tx: Transaction, ids: readonly string[]) {
 return lockCanonicalQuestionRows(tx, ids, 'share');
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
 const inserted = await tx.insert(gamificationQuestionBankDisclosures).values(entries.map(q => ({ id: JSON.stringify(['staff-bank', input.userId, q.courseId, q.questionId, input.requestId]), userId: input.userId, questionId: q.questionId, courseId: q.courseId, exposedAt }))).onConflictDoNothing().returning();
 await projectDisclosures(tx, inserted.map(row => ({ ...row, attemptIdentity: JSON.stringify(['staff-bank', row.id]) })));
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

/** Apply only newly inserted immutable events. The user lock serializes every writer. */
async function projectDisclosures(tx: Transaction, rows: { userId: string; courseId: string; questionId: string; attemptIdentity: string; exposedAt: Date }[]) {
 if (!rows.length) return;
 // One event per key in each batch. Preserve the greatest wall time if clocks move backwards.
 const byKey = new Map<string, typeof rows[number]>();
 for (const row of rows) {
  const key = JSON.stringify([row.userId, row.courseId, row.questionId]);
  if (!byKey.has(key) || byKey.get(key)!.exposedAt <= row.exposedAt) byKey.set(key, { userId: row.userId, courseId: row.courseId, questionId: row.questionId, attemptIdentity: row.attemptIdentity, exposedAt: row.exposedAt });
 }
 await tx.insert(gamificationQuestionExposureProjection).values([...byKey.values()]).onConflictDoUpdate({
  target: [gamificationQuestionExposureProjection.userId, gamificationQuestionExposureProjection.courseId, gamificationQuestionExposureProjection.questionId],
  set: { attemptIdentity: sql`excluded.attempt_identity`, exposedAt: sql`excluded.exposed_at`, causalOrder: sql`excluded.causal_order` },
  setWhere: sql`${gamificationQuestionExposureProjection.exposedAt} <= excluded.exposed_at`,
 });
}

async function recordExposureRows(tx: Transaction, rows: (typeof gamificationQuestionExposures.$inferInsert)[]) {
 if (!rows.length) return;
 const inserted = await tx.insert(gamificationQuestionExposures).values(rows).onConflictDoNothing().returning();
 await projectDisclosures(tx, inserted);
}

const LEGACY_UNCERTAIN = '__zyx_legacy_uncertain__';

/** The caller holds the viewer and question locks. False means cutover is not trusted yet. */
export async function initializeQuestionExposureHistoryBatch(tx: Transaction, inputs: HistoryInput[]): Promise<boolean> {
 if (!inputs.length) return true;
 inputs.forEach(assertInput);
 const first = inputs[0];
 if (inputs.some(i => i.userId !== first.userId || i.attemptId !== first.attemptId || i.occurredAt.getTime() !== first.occurredAt.getTime())) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
 const ready = await tx.select({ id: gamificationQuestionHistoryCutover.id }).from(gamificationQuestionHistoryCutover).where(eq(gamificationQuestionHistoryCutover.id, 'v1')).limit(1);
 if (!ready.length) return false;
 const unique = [...new Map(inputs.map(i => [i.canonicalQuestionId, i])).values()];
 const states = await tx.select().from(gamificationQuestionExposureInitializations).where(and(eq(gamificationQuestionExposureInitializations.userId, first.userId), inArray(gamificationQuestionExposureInitializations.questionId, unique.map(i => i.canonicalQuestionId))));
 const initialized = new Set(states.map(s => s.questionId));
 const pending = unique.filter(i => !initialized.has(i.canonicalQuestionId));
 if (!pending.length) return true;
 const legacy = await tx.select().from(gamificationQuestionLegacyIndex).where(and(eq(gamificationQuestionLegacyIndex.userId, first.userId), inArray(gamificationQuestionLegacyIndex.questionId, [...pending.map(i => `question:${i.canonicalQuestionId}`), LEGACY_UNCERTAIN])));
 const uncertain = new Set(legacy.filter(row => row.firstAttemptId !== first.attemptId || row.lastAttemptId !== first.attemptId).map(row => row.questionId));
 const baselines = pending.filter(i => uncertain.has(`question:${i.canonicalQuestionId}`) || uncertain.has(LEGACY_UNCERTAIN)).map(i => ({ id: orderedExposureId(), userId: i.userId, questionId: i.canonicalQuestionId, courseId: i.courseId, sourceVersion: i.sourceVersion, kind: 'baseline' as const, attemptIdentity: 'baseline', exposedAt: i.occurredAt }));
 await recordExposureRows(tx, baselines);
 await tx.insert(gamificationQuestionExposureInitializations).values(pending.map(i => ({ userId: i.userId, questionId: i.canonicalQuestionId, initializedAt: i.occurredAt }))).onConflictDoNothing();
 return true;
}
export async function initializeQuestionExposureHistory(tx: Transaction, input: HistoryInput) {
 await lockQuestionExposure(tx, input.userId, input.canonicalQuestionId);
 return initializeQuestionExposureHistoryBatch(tx, [input]);
}

/** At most four primary-key probes per question, including legacy course and wildcard. */
async function selectProjectedExposures(tx: Transaction, userId: string, inputs: HistoryInput[]) {
 const requested = inputs.map(i => ({ question_id: i.canonicalQuestionId, course_id: i.courseId }));
 return tx.execute<{ question_id: string; attempt_identity: string | null; exposed_at: Date | null }>(sql`
  select r.question_id, chosen.attempt_identity, chosen.exposed_at
  from jsonb_to_recordset(${JSON.stringify(requested)}::jsonb) r(question_id text, course_id text)
  join mata_kuliah c on c.id = r.course_id
  left join lateral (
   select case when bool_and(p.causal_order < 0) and count(distinct p.attempt_identity) > 1
      then ${UNCERTAIN_EXPOSURE_IDENTITY}
      else (array_agg(p.attempt_identity order by p.causal_order desc))[1] end as attempt_identity,
    max(p.exposed_at) as exposed_at
   from (
    select found.*, max(found.exposed_at) over () as latest_at from (values
     (r.course_id, r.question_id), (r.course_id, ${UNMAPPED_COURSE_DISCLOSURE}),
     (c.legacy_course_id, r.question_id), (c.legacy_course_id, ${UNMAPPED_COURSE_DISCLOSURE})
    ) as k(course_id, question_id)
    cross join lateral (select attempt_identity, exposed_at, causal_order from gamification_question_exposure_projection
     where user_id = ${userId} and course_id = k.course_id and question_id = k.question_id limit 1) found
   ) p where p.exposed_at = p.latest_at
  ) chosen on true`);
}

/** Persist the observation before disclosing the result, in the same locked transaction. */
export async function recordSubmissionBoundaries(tx: Transaction, inputs: HistoryInput[]) {
 if (!inputs.length) return;
 const first = inputs[0];
 inputs.forEach(assertInput);
 if (inputs.some(i => i.userId !== first.userId || i.attemptId !== first.attemptId)) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
 const unique = [...new Map(inputs.map(i => [i.canonicalQuestionId, i])).values()];
 const selected = await selectProjectedExposures(tx, first.userId, unique);
 if (selected.rows.length !== unique.length) throw new Error('QUESTION_EXPOSURE_HISTORY_UNAVAILABLE');
 const byQuestion = new Map(selected.rows.map(row => [row.question_id, row]));
 await tx.insert(gamificationQuestionExposureObservations).values(unique.map(i => {
  const row = byQuestion.get(i.canonicalQuestionId);
  if (!row || (row.attempt_identity === null) !== (row.exposed_at === null)) throw new Error('QUESTION_EXPOSURE_HISTORY_UNAVAILABLE');
  return { userId: i.userId, attemptId: i.attemptId, questionId: i.canonicalQuestionId, courseId: i.courseId, sourceVersion: i.sourceVersion, attemptIdentity: row.attempt_identity, exposedAt: row.exposed_at };
 })).onConflictDoNothing();
 await recordExposureRows(tx, unique.map(i => ({ id: orderedExposureId(), userId: i.userId, questionId: i.canonicalQuestionId, courseId: i.courseId, sourceVersion: i.sourceVersion, kind: 'disclosure' as const, attemptIdentity: submissionResultIdentity(i.attemptId), exposedAt: i.occurredAt })));
}

export async function getQuestionExposureObservation(tx: Transaction, userId: string, questionId: string, attemptId: string) {
 const [observation] = await tx.select().from(gamificationQuestionExposureObservations).where(and(eq(gamificationQuestionExposureObservations.userId, userId), eq(gamificationQuestionExposureObservations.questionId, questionId), eq(gamificationQuestionExposureObservations.attemptId, attemptId))).limit(1);
 return observation ?? null;
}

/** Observations are immutable. Missing observations, including old pending facts, fail closed. */
export async function getLatestQuestionExposures(tx: Transaction, userId: string, ids: string[], boundaryAttemptId: string) {
 const unique = [...new Set(ids)];
 if (!unique.length) return new Map<string, typeof gamificationQuestionExposureObservations.$inferSelect>();
 const rows = await tx.select().from(gamificationQuestionExposureObservations).where(and(eq(gamificationQuestionExposureObservations.userId, userId), eq(gamificationQuestionExposureObservations.attemptId, boundaryAttemptId), inArray(gamificationQuestionExposureObservations.questionId, unique)));
 if (rows.length !== unique.length) throw new Error('QUESTION_EXPOSURE_BOUNDARY_MISSING');
 return new Map(rows.filter(row => row.attemptIdentity !== null && row.exposedAt !== null).map(row => [row.questionId, row]));
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
 await recordExposureRows(tx, [{ id: orderedExposureId(), userId: identity.userId, questionId: identity.canonicalQuestionId, courseId: identity.courseId, sourceVersion: identity.sourceVersion, kind: 'disclosure', attemptIdentity: JSON.stringify([identity.attemptId, input.requestId]), exposedAt: identity.occurredAt }]);
 return { status: 'recorded' as const, identity };
}

/** Record a response's disclosed snapshot questions using one owned-attempt lookup. */
async function recordAttemptDisclosuresForOwner(tx: Transaction, ownerId: string, input: { userId: string; attemptId: string; questionIds: readonly string[]; occurredAt: Date; requestId: string; outsideSnapshot?: { questionIds: readonly string[]; canonicalCourseId: string }; heldCanonical?: HeldCanonicalQuestions }) {
 if (!input.userId || !input.attemptId || !input.requestId || !Number.isFinite(input.occurredAt.getTime())) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
 const ids = [...new Set(input.questionIds.filter(Boolean))];
 if (!ids.length && !input.outsideSnapshot?.questionIds.length) return;
 const [attempt] = await tx.select({ snapshot: studentQuizAttempts.questionsSnapshot, courseId: quizTemplates.courseId }).from(studentQuizAttempts).innerJoin(quizTemplates, eq(quizTemplates.id, studentQuizAttempts.templateId)).where(and(eq(studentQuizAttempts.id, input.attemptId), eq(studentQuizAttempts.studentId, ownerId))).limit(1);
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
 // The course comes from the owned attempt's template, never a client or snapshot.
 // Staff use the actual viewer's access while ownership remains separately checked.
 const access = await resolveCourseAccess({ userId: input.userId, courseId: attempt.courseId }, tx);
 if (!access.hasCourseAccess || ![access.canonicalCourseId, access.legacyCourseId].includes(attempt.courseId)) throw new Error('QUESTION_EXPOSURE_COURSE_ACCESS_DENIED');
 const disclosureCourseId = access.canonicalCourseId ?? access.legacyCourseId;
 if (!disclosureCourseId) throw new Error('QUESTION_EXPOSURE_COURSE_ACCESS_DENIED');
 const matchedIds = ids.filter(id => matches.has(id));
 await lockQuestionExposures(tx, input.userId, matchedIds);
 if (input.heldCanonical && matchedIds.some(id => !input.heldCanonical!.ids.includes(id))) throw new Error('QUESTION_LOCK_SET_INCOMPLETE');
 const canonical = input.heldCanonical ? input.heldCanonical.rows : await lockCanonicalQuestions(tx, matchedIds);
 const canonicalById = new Map(canonical.map(row => [row.id, row]));
 const identities: HistoryInput[] = [];
 const unresolvedSnapshot: string[] = [];
 for (const id of ids) {
  const found = matches.get(id);
  if (!found?.length) continue;
  const identity = found.length === 1 ? snapshotExposureIdentity(found[0]) : null;
  const row = canonicalById.get(id);
  const usable = row && row.status === 'published' && row.mataKuliahId === access.canonicalCourseId && Number.isSafeInteger(row.version) && row.version > 0;
  if (usable && identity && identity.courseId === row.mataKuliahId && identity.sourceVersion === String(row.version)) identities.push({ ...input, ...identity });
  else if (usable && found.length === 1 && !Object.hasOwn(found[0], 'gamificationProvenance')) identities.push({ ...input, canonicalQuestionId: row.id, courseId: row.mataKuliahId, sourceVersion: String(row.version) });
  else unresolvedSnapshot.push(id);
 }
 // Outside-snapshot IDs come from the authorized review, not client input.
 // Retain unresolved ones as tombstones until a canonical question is available.
 let unresolvedOutside: string[] = [];
 if (input.outsideSnapshot?.questionIds.length) {
  const access = await resolveCourseAccess({ userId: input.userId, courseId: input.outsideSnapshot.canonicalCourseId }, tx);
  if (!access.hasCourseAccess || ![access.canonicalCourseId, access.legacyCourseId].includes(input.outsideSnapshot.canonicalCourseId)) throw new Error('QUESTION_EXPOSURE_COURSE_ACCESS_DENIED');
  const outsideIds = [...new Set(input.outsideSnapshot.questionIds)].filter(id => !requested.has(id));
  if (outsideIds.length) {
   const rows = access.canonicalCourseId ? await tx.select({ id: soal.id, courseId: soal.mataKuliahId, version: soal.version }).from(soal).where(and(inArray(soal.id, outsideIds), eq(soal.mataKuliahId, access.canonicalCourseId), eq(soal.status, 'published'))) : [];
   for (const row of rows) if (row.courseId && Number.isSafeInteger(row.version) && row.version > 0) identities.push({ ...input, canonicalQuestionId: row.id, courseId: row.courseId, sourceVersion: String(row.version) });
   const resolved = new Set(rows.filter(row => row.courseId && Number.isSafeInteger(row.version) && row.version > 0).map(row => row.id));
   unresolvedOutside = outsideIds.filter(id => !resolved.has(id));
  }
 }
 await lockQuestionExposures(tx, input.userId, identities.map(identity => identity.canonicalQuestionId));
 // Submission already captured its timestamp under this lock. Other callers must not
 // use a timestamp captured while waiting for the lock.
 const occurredAt = input.requestId === 'submission-result' ? input.occurredAt : new Date();
 identities.forEach(identity => { identity.occurredAt = occurredAt; });
 if (unresolvedSnapshot.length) await recordAuthorizedGlobalDisclosures(tx, { userId: input.userId, questions: unresolvedSnapshot.map(questionId => ({ questionId, courseId: disclosureCourseId })), requestId: JSON.stringify([input.attemptId, input.requestId]) });
 if (unresolvedOutside.length && input.outsideSnapshot) await recordAuthorizedGlobalDisclosures(tx, { userId: input.userId, questions: unresolvedOutside.map(questionId => ({ questionId, courseId: input.outsideSnapshot!.canonicalCourseId })), requestId: input.requestId });
 await initializeQuestionExposureHistoryBatch(tx, identities);
 await recordExposureRows(tx, identities.map(identity => ({ id: orderedExposureId(), userId: identity.userId, questionId: identity.canonicalQuestionId, courseId: identity.courseId, sourceVersion: identity.sourceVersion, kind: 'disclosure' as const, attemptIdentity: JSON.stringify([identity.attemptId, input.requestId]), exposedAt: identity.occurredAt })));
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
 if (unresolved.length) await recordAuthorizedGlobalDisclosures(tx, { userId: input.userId, questions: unresolved.map(questionId => ({ questionId, courseId: disclosureCourseId })), requestId: input.requestId });
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
 if (!access.hasCourseAccess || ![access.canonicalCourseId, access.legacyCourseId].includes(input.canonicalCourseId)) throw new Error('QUESTION_EXPOSURE_COURSE_ACCESS_DENIED');
 const ids = [...new Set(input.questionIds.filter(Boolean))];
 if (!ids.length) return;
 const rows = access.canonicalCourseId ? await tx.select({ id: soal.id, courseId: soal.mataKuliahId, version: soal.version }).from(soal).where(and(inArray(soal.id, ids), eq(soal.mataKuliahId, access.canonicalCourseId), includeUnpublished ? undefined : eq(soal.status, 'published'))) : [];
 const identities: HistoryInput[] = rows.filter(row => row.courseId && Number.isSafeInteger(row.version) && row.version > 0).map(row => ({ userId: input.userId, canonicalQuestionId: row.id, courseId: row.courseId!, sourceVersion: String(row.version), attemptId: JSON.stringify(['course-review', input.contextId]), occurredAt: input.occurredAt }));
 await lockQuestionExposures(tx, input.userId, identities.map(identity => identity.canonicalQuestionId));
 const occurredAt = new Date();
 identities.forEach(identity => { identity.occurredAt = occurredAt; });
 const known = new Set(identities.map(identity => identity.canonicalQuestionId));
 const unresolved = ids.filter(id => !known.has(id));
 if (unresolved.length) await recordAuthorizedGlobalDisclosures(tx, { userId: input.userId, questions: unresolved.map(questionId => ({ questionId, courseId: input.canonicalCourseId })), requestId: input.requestId });
 await initializeQuestionExposureHistoryBatch(tx, identities);
 await recordExposureRows(tx, identities.map(identity => ({ id: orderedExposureId(), userId: identity.userId, questionId: identity.canonicalQuestionId, courseId: identity.courseId, sourceVersion: identity.sourceVersion, kind: 'disclosure' as const, attemptIdentity: JSON.stringify([identity.attemptId, input.requestId]), exposedAt: identity.occurredAt })));
}
