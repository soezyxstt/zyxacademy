import { describe, expect, test } from 'bun:test';
import { sanitizeQuestionsSnapshot, serializeStudentQuizAttempt } from '../../lib/assessment-serialization';
import { canonicalObjectiveProvenance } from '../../lib/gamification/question-snapshot-provenance';

const canonical = { id: 'q', generationHash: 'hash', questionType: 'multiple_choice', prompt: 'Prompt', optionsSnapshot: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }], version: 2, status: 'published', quizEligible: true, mataKuliahId: 'course' };
const legacy = { id: 'q', generationHash: 'hash', questionType: 'multiple_choice', prompt: 'Prompt', options: ['A', 'B'], correctIndices: [0] };
describe('canonical question snapshot provenance', () => {
 test('binds matching server content to its canonical version', () => {
  expect(canonicalObjectiveProvenance(legacy, canonical, 'course')).toEqual({ marker: 'canonical-objective-v1', canonicalQuestionId: 'q', courseId: 'course', sourceVersion: '2', answerProof: { questionType: 'multiple_choice', correctIndices: [0] } });
 });
 test('rejects stale or inconsistent answer projections', () => {
  expect(canonicalObjectiveProvenance({ ...legacy, generationHash: 'old' }, canonical, 'course')).toBeNull();
  expect(canonicalObjectiveProvenance({ ...legacy, correctIndices: [1] }, canonical, 'course')).toBeNull();
  expect(canonicalObjectiveProvenance({ ...legacy, options: ['B', 'A'] }, canonical, 'course')).toBeNull();
  expect(canonicalObjectiveProvenance(legacy, { ...canonical, status: 'draft' }, 'course')).toBeNull();
 });
 test('rejects missing or mismatched course and malformed canonical content', () => {
  expect(canonicalObjectiveProvenance(legacy, canonical, null)).toBeNull();
  expect(canonicalObjectiveProvenance(legacy, canonical, 'other')).toBeNull();
  expect(canonicalObjectiveProvenance(legacy, { ...canonical, quizEligible: false }, 'course')).toBeNull();
  expect(canonicalObjectiveProvenance(legacy, { ...canonical, version: 0 }, 'course')).toBeNull();
  expect(canonicalObjectiveProvenance({ ...legacy, prompt: 'different' }, canonical, 'course')).toBeNull();
 });
 test('never serializes the internal answer proof', () => {
  const question = { id: 'q', prompt: 'Prompt', options: ['A', 'B'], correct_indices: [0], gamificationProvenance: canonicalObjectiveProvenance(legacy, canonical, 'course') };
  for (const status of ['in_progress', 'completed']) {
   const view = sanitizeQuestionsSnapshot([question], status, 'released')[0];
   expect(view).not.toHaveProperty('gamificationProvenance');
   expect(serializeStudentQuizAttempt({ status, questionsSnapshot: [question] }).questionsSnapshot[0]).not.toHaveProperty('gamificationProvenance');
  }
  expect(sanitizeQuestionsSnapshot([question], 'in_progress')[0]).not.toHaveProperty('correct_indices');
 });
 test('does not invent authoritative provenance for essay or short answers', () => {
  expect(canonicalObjectiveProvenance({ ...legacy, questionType: 'essay' }, { ...canonical, questionType: 'essay' }, 'course')).toBeNull();
 });
});
