import { and, desc, eq, inArray, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { gamificationQuestionExposures, gamificationQuestionExposureInitializations, soal, studentQuizAttempts } from '@/db/schema';
import { resolveCourseAccess } from '@/lib/student/course-access';
import { snapshotExposureIdentity } from './question-exposure-policy';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type HistoryInput = { userId: string; canonicalQuestionId: string; courseId: string; sourceVersion: string; attemptId: string; occurredAt: Date };
type AttemptInput = { userId: string; attemptId: string; questionId: string; occurredAt: Date };

function assertInput(input: HistoryInput) {
 if (!input.userId || !input.canonicalQuestionId || !input.courseId || !input.attemptId || !/^[1-9]\d*$/.test(input.sourceVersion) || !Number.isSafeInteger(Number(input.sourceVersion)) || !(input.occurredAt instanceof Date) || !Number.isFinite(input.occurredAt.getTime())) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
}

/** All writers and readers making a reward decision must hold this transaction lock. */
export async function lockQuestionExposure(tx: Transaction, userId: string, canonicalQuestionId: string) {
 await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['zyx:question-exposure', userId, canonicalQuestionId])}, 0))`);
}

/** Acquire multiple locks in canonical question ID order before calling per-question operations. */
export async function lockQuestionExposures(tx: Transaction, userId: string, canonicalQuestionIds: readonly string[]) {
 const keys = [...new Set(canonicalQuestionIds)].sort().map(id => JSON.stringify(['zyx:question-exposure', userId, id]));
 if (keys.length) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(key, 0)) from (select key from jsonb_array_elements_text(${JSON.stringify(keys)}::jsonb) as t(key) order by key) ordered`);
}

/** The caller holds the ordered locks for the entire set. */
export async function initializeQuestionExposureHistoryBatch(tx: Transaction, inputs: HistoryInput[]) {
 if (!inputs.length) return;
 inputs.forEach(assertInput);
 const first = inputs[0];
 if (inputs.some(i => i.userId !== first.userId || i.attemptId !== first.attemptId || i.occurredAt.getTime() !== first.occurredAt.getTime())) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
 const unique = [...new Map(inputs.map(i => [i.canonicalQuestionId, i])).values()];
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
 const baselines = pending.filter(i => uncertainty.get(i.canonicalQuestionId)).map(i => ({ id: crypto.randomUUID(), userId: i.userId, questionId: i.canonicalQuestionId, courseId: i.courseId, sourceVersion: i.sourceVersion, kind: 'baseline' as const, attemptIdentity: 'baseline', exposedAt: i.occurredAt }));
 if (baselines.length) await tx.insert(gamificationQuestionExposures).values(baselines).onConflictDoNothing();
 await tx.insert(gamificationQuestionExposureInitializations).values(pending.map(i => ({ userId: i.userId, questionId: i.canonicalQuestionId, initializedAt: i.occurredAt }))).onConflictDoNothing();
}
export async function initializeQuestionExposureHistory(tx: Transaction, input: HistoryInput) {
 await lockQuestionExposure(tx, input.userId, input.canonicalQuestionId);
 await initializeQuestionExposureHistoryBatch(tx, [input]);
}

/** Missing or future initialization is never interpreted as an empty history. */
export async function getLatestQuestionExposures(tx: Transaction, userId: string, ids: string[], before: Date, excludeSubmissionResult?: string) {
 if (!(before instanceof Date) || !Number.isFinite(before.getTime())) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
 const unique = [...new Set(ids)];
 if (!unique.length) return new Map<string, typeof gamificationQuestionExposures.$inferSelect>();
 const states = await tx.select().from(gamificationQuestionExposureInitializations).where(and(eq(gamificationQuestionExposureInitializations.userId, userId), inArray(gamificationQuestionExposureInitializations.questionId, unique)));
 if (states.length !== unique.length) throw new Error('QUESTION_EXPOSURE_NOT_INITIALIZED');
 if (states.some(state => state.initializedAt.getTime() > before.getTime())) throw new Error('QUESTION_EXPOSURE_BEFORE_INITIALIZATION');
 const rows = await tx.selectDistinctOn([gamificationQuestionExposures.questionId]).from(gamificationQuestionExposures).where(and(eq(gamificationQuestionExposures.userId, userId), inArray(gamificationQuestionExposures.questionId, unique), lte(gamificationQuestionExposures.exposedAt, before), excludeSubmissionResult ? or(ne(gamificationQuestionExposures.attemptIdentity, excludeSubmissionResult), ne(gamificationQuestionExposures.exposedAt, before)) : undefined)).orderBy(gamificationQuestionExposures.questionId, desc(gamificationQuestionExposures.exposedAt), desc(gamificationQuestionExposures.id));
 return new Map(rows.map(row => [row.questionId, row]));
}
export async function getLatestQuestionExposure(tx: Transaction, userId: string, canonicalQuestionId: string, before: Date, excludeSubmissionResult?: string) {
 return (await getLatestQuestionExposures(tx, userId, [canonicalQuestionId], before, excludeSubmissionResult)).get(canonicalQuestionId) ?? null;
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
 await initializeQuestionExposureHistory(tx, identity);
 await tx.insert(gamificationQuestionExposures).values({ id: crypto.randomUUID(), userId: identity.userId, questionId: identity.canonicalQuestionId, courseId: identity.courseId, sourceVersion: identity.sourceVersion, kind: 'disclosure', attemptIdentity: JSON.stringify([identity.attemptId, input.requestId]), exposedAt: identity.occurredAt }).onConflictDoNothing();
 return { status: 'recorded' as const, identity };
}

/** Unsupported snapshots cannot establish a reward identity or a verified empty history. */
export async function prepareQuestionRewardExposure(tx: Transaction, input: AttemptInput) {
 const identity = await resolveAttempt(tx, input, false);
 if (!identity) return { status: 'unsupported' as const };
 await initializeQuestionExposureHistory(tx, identity);
 const latest = await getLatestQuestionExposure(tx, identity.userId, identity.canonicalQuestionId, identity.occurredAt);
 return { status: 'ready' as const, identity, latest };
}

/** Record a response's disclosed snapshot questions using one owned-attempt lookup. */
export async function recordAttemptDisclosures(tx: Transaction, input: { userId: string; attemptId: string; questionIds: readonly string[]; occurredAt: Date; requestId: string; outsideSnapshot?: { questionIds: readonly string[]; canonicalCourseId: string } }) {
 if (!input.userId || !input.attemptId || !input.requestId || !Number.isFinite(input.occurredAt.getTime())) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
 const ids = [...new Set(input.questionIds.filter(Boolean))];
 if (!ids.length && !input.outsideSnapshot?.questionIds.length) return;
 const [attempt] = await tx.select({ snapshot: studentQuizAttempts.questionsSnapshot }).from(studentQuizAttempts).where(and(eq(studentQuizAttempts.id, input.attemptId), eq(studentQuizAttempts.studentId, input.userId))).limit(1);
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
 await initializeQuestionExposureHistoryBatch(tx, identities);
 if (identities.length) await tx.insert(gamificationQuestionExposures).values(identities.map(identity => ({ id: crypto.randomUUID(), userId: identity.userId, questionId: identity.canonicalQuestionId, courseId: identity.courseId, sourceVersion: identity.sourceVersion, kind: 'disclosure' as const, attemptIdentity: JSON.stringify([identity.attemptId, input.requestId]), exposedAt: identity.occurredAt }))).onConflictDoNothing();
}

/** The caller has already authorized the released review and its questions. */
export async function recordAuthorizedCourseDisclosures(tx: Transaction, input: { userId: string; canonicalCourseId: string; questionIds: readonly string[]; contextId: string; occurredAt: Date; requestId: string }) {
 if (!input.userId || !input.canonicalCourseId || !input.contextId || !input.requestId || !(input.occurredAt instanceof Date) || !Number.isFinite(input.occurredAt.getTime())) throw new Error('INVALID_QUESTION_EXPOSURE_INPUT');
 const access = await resolveCourseAccess({ userId: input.userId, courseId: input.canonicalCourseId }, tx);
 if (!access.hasCourseAccess || access.canonicalCourseId !== input.canonicalCourseId) throw new Error('QUESTION_EXPOSURE_COURSE_ACCESS_DENIED');
 const ids = [...new Set(input.questionIds.filter(Boolean))];
 if (!ids.length) return;
 const rows = await tx.select({ id: soal.id, courseId: soal.mataKuliahId, version: soal.version }).from(soal).where(and(inArray(soal.id, ids), eq(soal.mataKuliahId, input.canonicalCourseId), eq(soal.status, 'published')));
 const identities: HistoryInput[] = rows.filter(row => row.courseId && Number.isSafeInteger(row.version) && row.version > 0).map(row => ({ userId: input.userId, canonicalQuestionId: row.id, courseId: row.courseId!, sourceVersion: String(row.version), attemptId: JSON.stringify(['course-review', input.contextId]), occurredAt: input.occurredAt }));
 await lockQuestionExposures(tx, input.userId, identities.map(identity => identity.canonicalQuestionId));
 await initializeQuestionExposureHistoryBatch(tx, identities);
 if (identities.length) await tx.insert(gamificationQuestionExposures).values(identities.map(identity => ({ id: crypto.randomUUID(), userId: identity.userId, questionId: identity.canonicalQuestionId, courseId: identity.courseId, sourceVersion: identity.sourceVersion, kind: 'disclosure' as const, attemptIdentity: JSON.stringify([identity.attemptId, input.requestId]), exposedAt: identity.occurredAt }))).onConflictDoNothing();
}
