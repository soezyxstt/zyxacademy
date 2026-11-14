import { expect, test } from 'bun:test';
import { checkAnswerCorrectness } from '../../lib/gamification/question-grading';
import { readFileSync } from 'node:fs';

const single = { question_type: 'multiple_choice', correct_indices: [1] };
const multiple = { question_type: 'multiple_choices', correct_indices: [0, 2] };
test('grades daily numeric and normal array answers without accepting extra choices', () => {
 expect(checkAnswerCorrectness(single, 1)).toBe(true);
 expect(checkAnswerCorrectness(single, [1])).toBe(true);
 expect(checkAnswerCorrectness(single, [1, 0])).toBe(false);
 expect(checkAnswerCorrectness(single, 0)).toBe(false);
 expect(checkAnswerCorrectness(multiple, [2, 0])).toBe(true);
 expect(checkAnswerCorrectness(multiple, [0, 0])).toBe(false);
 expect(checkAnswerCorrectness(multiple, [0])).toBe(false);
});
test('stable single choice rejects multiple submitted options', () => {
 const question = { ...single, stable_option_ids: ['a', 'b'] };
 expect(checkAnswerCorrectness(question, ['b'])).toBe(true);
 expect(checkAnswerCorrectness(question, ['a', 'b'])).toBe(false);
});
test('stable multi choice rejects duplicates and invalid extras, while essays remain manual', () => {
 const question = { ...multiple, stable_option_ids: ['a', 'b', 'c'] };
 expect(checkAnswerCorrectness(question, ['c', 'a'])).toBe(true);
 expect(checkAnswerCorrectness(question, ['a', 'a'])).toBe(false);
 expect(checkAnswerCorrectness(question, ['a', 'c', 'missing'])).toBe(false);
 expect(checkAnswerCorrectness({ question_type: 'essay', acceptable_answers: ['an answer'] }, 'an answer')).toBe(false);
});
test('daily score and reward facts use identical grading on submitted selections', () => {
 const source = readFileSync('app/api/quiz/daily/route.ts', 'utf8');
 const body = source.slice(source.indexOf('function isAnswerCorrect('), source.indexOf('\nconst SubmitSchema'));
 const daily = Function('checkAnswerCorrectness', new Bun.Transpiler({ loader: 'ts' }).transformSync(`${body}\nreturn isAnswerCorrect;`))(checkAnswerCorrectness);
 for (const [type, correct, answer, expected] of [
  ['multiple_choice', [1], [1, 0], false],
  ['multiple_choice', [1], [1], true],
  ['multiple_choices', [0, 2], [0, 0], false],
  ['multiple_choices', [0, 2], [2, 0], true],
 ] as const) {
  expect(daily({ questionType: type, correctIndices: correct, acceptableAnswers: null }, answer)).toBe(expected);
  expect(checkAnswerCorrectness({ question_type: type, correct_indices: correct }, answer)).toBe(expected);
 }
});
