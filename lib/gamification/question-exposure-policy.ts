import { isDeepStrictEqual } from 'node:util';

/** Stable marker for the score disclosed after a submission's evidence is written. */
export const submissionResultIdentity = (attemptId: string) => JSON.stringify([attemptId, 'submission-result']);

/** Validate provenance against the immutable server-held question, never a client payload. */
export function snapshotExposureIdentity(value: unknown) {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
 const q = value as Record<string, unknown>;
 const p = q.gamificationProvenance;
 if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
 const provenance = p as Record<string, unknown>;
 const proof = provenance.answerProof;
 if (!proof || typeof proof !== 'object' || Array.isArray(proof)) return null;
 const answer = proof as Record<string, unknown>;
 const indices = answer.correctIndices;
 if (provenance.marker !== 'canonical-objective-v1' || typeof q.id !== 'string' || !q.id || provenance.canonicalQuestionId !== q.id || typeof provenance.courseId !== 'string' || !provenance.courseId || typeof provenance.sourceVersion !== 'string' || !/^[1-9]\d*$/.test(provenance.sourceVersion) || !Number.isSafeInteger(Number(provenance.sourceVersion)) || !Array.isArray(q.options) || !q.options.length || !q.options.every(option => typeof option === 'string') || !Array.isArray(indices) || !indices.length || !indices.every((index, i) => Number.isInteger(index) && index >= 0 && index < (q.options as unknown[]).length && (i === 0 || index > indices[i - 1])) || !Array.isArray(q.correct_indices) || JSON.stringify(indices) !== JSON.stringify(q.correct_indices) || answer.questionType !== q.question_type || !['multiple_choice', 'multiple_choices'].includes(String(answer.questionType)) || (answer.questionType === 'multiple_choice' && indices.length !== 1)) return null;
 return { canonicalQuestionId: q.id, courseId: provenance.courseId, sourceVersion: provenance.sourceVersion };
}

/** Empty processing placeholders do not disclose analytics. */
export function hasDisclosurePayload(value: unknown): boolean {
 if (value == null) return false;
 if (typeof value === 'string') return value.trim().length > 0;
 if (Array.isArray(value)) return value.some(hasDisclosurePayload);
 if (typeof value === 'object') return Object.values(value).some(hasDisclosurePayload);
 return true;
}

/** Match unique provenanced questions to the owned persisted snapshot in linear time. */
export function matchRewardSnapshots(snapshot: unknown[], authoritativeSnapshot: unknown[]) {
 const held = new Map<string, unknown[]>();
 for (const q of authoritativeSnapshot) {
  if (!q || typeof q !== 'object' || Array.isArray(q) || typeof (q as Record<string, unknown>).id !== 'string') continue;
  const id = (q as { id: string }).id;
  const rows = held.get(id) ?? []; rows.push(q); held.set(id, rows);
 }
 const candidates = new Map<string, { q: unknown; identity: NonNullable<ReturnType<typeof snapshotExposureIdentity>> }[]>();
 for (const q of snapshot) {
  const identity = snapshotExposureIdentity(q);
  if (!identity) continue;
  const rows = candidates.get(identity.canonicalQuestionId) ?? []; rows.push({ q, identity }); candidates.set(identity.canonicalQuestionId, rows);
 }
 const valid = [...candidates.entries()].flatMap(([id, rows]) => {
  const authoritative = held.get(id);
  if (rows.length !== 1 || authoritative?.length !== 1 || !isDeepStrictEqual(rows[0].q, authoritative[0])) return [];
  const identity = snapshotExposureIdentity(authoritative[0]);
  return identity ? [{ q: authoritative[0], identity }] : [];
 });
 return valid;
}
