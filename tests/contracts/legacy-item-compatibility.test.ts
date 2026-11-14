import { describe, expect, it } from 'bun:test';
import { compatibleLegacyItem, writeLegacyIdeaEvidence } from '@/lib/asesmen/write-legacy-idea-evidence';
import { buildLegacyGradingPolicySnapshot, buildLegacyRenderedQuestionSnapshot, type MappedLegacyQuestion } from '@/lib/asesmen/live-idea-evidence';
import { itemAsesmen, jawabanMurid, buktiIdeJawaban } from '@/db/schema';

const question = { id: 'q', prompt: 'Prompt', question_type: 'multiple_choice', options: ['A', 'B'], stable_option_ids: ['a', 'b'], correct_indices: [0] };
const mapping: MappedLegacyQuestion = { questionId: 'q', questionVersion: 1, generationHash: 'hash', questionType: 'multiple_choice', ideaLinks: [{ ideaId: 'idea', weight: 1, role: 'primary', ideaStatus: 'published', ideaVersion: 1 }] };
const options = [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B', isCorrect: false }];
const canonical = { optionsSnapshot: options } as any;
const syncItem = { id: 'item-hash', asesmenId: 'quiz', soalId: 'q', contentVersion: 1, generationHash: 'hash', renderedQuestionSnapshot: { id: 'q', prompt: 'Prompt', questionType: 'multiple_choice', optionsSnapshot: options }, optionOrderSnapshot: ['0', '1'], gradingPolicySnapshot: { source: 'mcp_assembly', questionId: 'q' } } as any;

describe('assessment item compatibility', () => {
 it('accepts sync IDs only with the same canonical question and answer', () => {
  expect(compatibleLegacyItem(syncItem, question, mapping, canonical)).toBe(true);
  expect(compatibleLegacyItem({ ...syncItem, soalId: 'other' }, question, mapping, canonical)).toBe(false);
  expect(compatibleLegacyItem({ ...syncItem, contentVersion: 2 }, question, mapping, canonical)).toBe(false);
  expect(compatibleLegacyItem({ ...syncItem, generationHash: 'other' }, question, mapping, canonical)).toBe(false);
  expect(compatibleLegacyItem({ ...syncItem, gradingPolicySnapshot: { source: 'legacy', questionId: 'other' } }, question, mapping, canonical)).toBe(false);
  expect(compatibleLegacyItem(syncItem, { ...question, correct_indices: [1] }, mapping, canonical)).toBe(false);
  expect(compatibleLegacyItem({ ...syncItem, optionOrderSnapshot: ['1', '0'] }, question, mapping, canonical)).toBe(false);
 });
 it('requires the complete rubric and immutable snapshots for bridge items', () => {
  const item = { ...syncItem, optionOrderSnapshot: question.stable_option_ids, renderedQuestionSnapshot: buildLegacyRenderedQuestionSnapshot(question), gradingPolicySnapshot: buildLegacyGradingPolicySnapshot(question, mapping) };
  expect(compatibleLegacyItem(item, question, mapping, canonical)).toBe(true);
  expect(compatibleLegacyItem({ ...item, gradingPolicySnapshot: { ...item.gradingPolicySnapshot, version: 'other' } }, question, mapping, canonical)).toBe(false);
 });
 it('uses a compatible existing item and skips an occupied order without a dangling answer', async () => {
  const questions = ['first', 'existing', 'collision'].map(id => ({ ...question, id }));
  const mappings = questions.map(q => ({ ...mapping, questionId: q.id, ideaLinks: [{ ...mapping.ideaLinks[0], ideaId: `idea-${q.id}` }] }));
  const rows = questions.map(q => ({ id: q.id, optionsSnapshot: options }));
  const existing = { ...syncItem, id: 'item-hashed', soalId: 'existing', orderIndex: 1, renderedQuestionSnapshot: { ...syncItem.renderedQuestionSnapshot, id: 'existing' }, gradingPolicySnapshot: { source: 'legacy', questionId: 'existing' } };
  const occupant = { ...syncItem, id: 'occupied', soalId: 'other', orderIndex: 2 };
  const items: any[] = [existing, occupant], answers: any[] = [], evidence: any[] = [];
  const tx = {
   insert: (table: unknown) => ({ values: (values: any[]) => ({ onConflictDoNothing: async () => {
    for (const value of values) {
     if (table === itemAsesmen && !items.some(row => row.id === value.id || (row.asesmenId === value.asesmenId && (row.soalId === value.soalId || row.orderIndex === value.orderIndex)))) items.push(value);
     if (table === jawabanMurid) { if (!items.some(row => row.id === value.itemAsesmenId)) throw new Error('INVALID_ITEM_FK'); answers.push(value); }
     if (table === buktiIdeJawaban) { if (!answers.some(row => row.id === value.jawabanMuridId)) throw new Error('INVALID_ANSWER_FK'); evidence.push(value); }
    }
   } }) }),
   select: () => ({ from: (table: unknown) => ({ where: () => {
    const result = table === itemAsesmen ? items : table === jawabanMurid ? answers : evidence;
    const promise = Promise.resolve(result);
    return Object.assign(promise, { for: async () => result });
   } }) }),
  };
  const result = await writeLegacyIdeaEvidence(tx as any, { assessmentId: 'quiz', attemptId: 'attempt', snapshot: questions, answers: { first: 0, existing: 0, collision: 0 }, mappings, canonicalRows: rows as any, now: new Date() });
  expect(answers.map(row => row.itemAsesmenId).sort()).toEqual(['item-hashed', 'item-quiz_first']);
  expect([...result].sort()).toEqual(['idea-existing', 'idea-first']);
  expect(evidence).toHaveLength(2);
  expect(items.find(row => row.id === 'occupied')).toEqual(occupant);
 });
 it('skips malformed option evidence without discarding a valid neighbour', async () => {
  for (const bad of [99, [-1, 99], 'unknown', [0, 0], ['a', 'missing']]) {
   const questions = ['bad', 'good'].map(id => ({ ...question, id }));
   const mappings = questions.map(q => ({ ...mapping, questionId: q.id }));
   const items: any[] = [], answers: any[] = [], evidence: any[] = [];
   const tx = {
    insert: (table: unknown) => ({ values: (values: any[]) => ({ onConflictDoNothing: async () => {
     (table === itemAsesmen ? items : table === jawabanMurid ? answers : evidence).push(...values);
    } }) }),
    select: () => ({ from: (table: unknown) => ({ where: () => {
     const rows = table === itemAsesmen ? items : table === jawabanMurid ? answers : evidence;
     return Object.assign(Promise.resolve(rows), { for: async () => rows });
    } }) }),
   };
   const result = await writeLegacyIdeaEvidence(tx as any, { assessmentId: 'quiz', attemptId: 'attempt', snapshot: questions, answers: { bad, good: 0 }, mappings, canonicalRows: questions.map(q => ({ id: q.id, optionsSnapshot: options })) as any, now: new Date() });
   expect(answers).toHaveLength(1);
   expect(answers[0].id).toBe('answer-attempt_good');
   expect([...result]).toEqual(['idea']);
  }
 });

});
