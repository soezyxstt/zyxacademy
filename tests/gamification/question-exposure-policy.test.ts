import { describe, expect, test } from 'bun:test';
import { hasDisclosurePayload, matchRewardSnapshots, snapshotExposureIdentity } from '../../lib/gamification/question-exposure-policy';

const question = { id: 'q', question_type: 'multiple_choice', options: ['a', 'b'], correct_indices: [1], gamificationProvenance: { marker: 'canonical-objective-v1', canonicalQuestionId: 'q', courseId: 'course', sourceVersion: '2', answerProof: { questionType: 'multiple_choice', correctIndices: [1] } } };

describe('snapshot exposure identity', () => {
 test('accepts a consistent held snapshot and retains its original version', () => {
  expect(snapshotExposureIdentity(question)).toEqual({ canonicalQuestionId: 'q', courseId: 'course', sourceVersion: '2' });
 });
 test('rejects unprovenanced or inconsistent snapshots', () => {
  expect(snapshotExposureIdentity({ ...question, gamificationProvenance: undefined })).toBeNull();
  expect(snapshotExposureIdentity({ ...question, id: 'other' })).toBeNull();
  expect(snapshotExposureIdentity({ ...question, correct_indices: [0] })).toBeNull();
  expect(snapshotExposureIdentity({ ...question, question_type: 'essay' })).toBeNull();
  expect(snapshotExposureIdentity({ ...question, gamificationProvenance: { ...question.gamificationProvenance, sourceVersion: '0' } })).toBeNull();
  expect(snapshotExposureIdentity({ ...question, gamificationProvenance: { ...question.gamificationProvenance, answerProof: { questionType: 'multiple_choice', correctIndices: [4] } } })).toBeNull();
 });
});

test('analytics placeholders are empty but diagnosis and metrics are disclosures', () => {
 expect(hasDisclosurePayload({ diagnosis: [], nested: { text: ' ' } })).toBe(false);
 expect(hasDisclosurePayload({ diagnosis: ['explanation'] })).toBe(true);
 expect(hasDisclosurePayload({ score: 0 })).toBe(true);
});

test('batch matching rejects duplicates, altered proofs and injected questions', () => {
 const second = { ...question, id: 'q2', gamificationProvenance: { ...question.gamificationProvenance, canonicalQuestionId: 'q2' } };
 expect(matchRewardSnapshots([question, second], [question, second]).map(row => row.identity.canonicalQuestionId)).toEqual(['q', 'q2']);
 expect(matchRewardSnapshots([question, question, second], [question, second]).map(row => row.identity.canonicalQuestionId)).toEqual(['q2']);
 expect(matchRewardSnapshots([question, second], [question, question, second]).map(row => row.identity.canonicalQuestionId)).toEqual(['q2']);
 const altered = { ...question, options: ['injected', 'b'] };
 expect(matchRewardSnapshots([altered, second], [question, second]).map(row => row.identity.canonicalQuestionId)).toEqual(['q2']);
 expect(matchRewardSnapshots([question], [second])).toEqual([]);
});

test('batch matching accepts equivalent JSONB object key order', () => {
 const persisted = Object.fromEntries(Object.entries(question).reverse());
 expect(matchRewardSnapshots([question], [persisted]).map(row => row.identity.canonicalQuestionId)).toEqual(['q']);
});
