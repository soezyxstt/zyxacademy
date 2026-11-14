import { expect, test } from 'bun:test';
import { checkAnswerCorrectness } from '../../lib/gamification/question-grading';

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
