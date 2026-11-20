import { expect, mock, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checkAnswerCorrectness } from '@/lib/gamification/question-grading';
import { projectQuizReviewSnapshot } from '@/lib/quiz/review-release';

mock.module('next/link', () => ({ default: ({ children }: any) => <>{children}</> }));
mock.module('@/components/course/course-page-shell', () => ({ CoursePageShell: ({ children }: any) => <main>{children}</main> }));
mock.module('@/components/ui/reveal', () => ({ Reveal: ({ children }: any) => <>{children}</> }));
mock.module('@/components/ui/button', () => ({ Button: ({ children }: any) => <span>{children}</span> }));
mock.module('@/components/i18n/translated-text', () => ({ TranslatedText: ({ messageKey }: any) => <>{messageKey}</> }));
mock.module('@/components/course/markdown-renderer', () => ({ MarkdownRenderer: ({ content }: any) => <>{content}</> }));
mock.module('@/components/course/interactive-document-context', () => ({ InteractiveDocumentAttempt: ({ children }: any) => <>{children}</> }));
mock.module('@/components/course/math-text', () => ({ MathText: ({ children }: any) => <>{children}</> }));
mock.module('@/components/ui/formatted-date', () => ({ FormattedDate: () => <>date</> }));
mock.module('@/components/pka/mistake-feedback-button', () => ({ MistakeFeedbackButton: ({ questionId }: any) => <button>Feedback {questionId}</button> }));
mock.module('@/components/course/question-source-citation', () => ({ QuestionSourceCitation: () => null }));
mock.module('@/components/admin/stat-card', () => ({ AdminStatStrip: ({ children }: any) => <>{children}</>, AdminStatStripItem: ({ value }: any) => <span>{value}</span> }));
const { StudentQuizReview } = await import('@/components/course/student-quiz-review');

test('released review status and feedback agree with submission grading', () => {
 const cases = [
  { id: 'extra', question_type: 'multiple_choice', correct_indices: [1], acceptable_answers: ['0'], answer: [1, 0], expected: false },
  { id: 'duplicate', question_type: 'multiple_choices', correct_indices: [0, 2], acceptable_answers: ['0'], answer: [0, 0], expected: false },
  { id: 'correct', question_type: 'multiple_choice', correct_indices: [1], acceptable_answers: ['0'], gradedCorrect: false, answer: [1], expected: true },
  { id: 'wrong', question_type: 'multiple_choice', correct_indices: [1], answer: [0], expected: false },
  { id: 'legacy', correct_indices: [0, 2], answer: [2, 0], expected: true },
  { id: 'legacy-text', correct_indices: [], acceptable_answers: ['5'], answer: '5.', expected: true },
  { id: 'stable', question_type: 'multiple_choice', correct_indices: [1], stable_option_ids: ['a', 'b', 'c'], answer: ['b'], expected: true },
 ];
 for (const row of cases) {
  expect(checkAnswerCorrectness(row, row.answer)).toBe(row.expected);
  const q = { ...row, prompt: row.id, options: ['A', 'B', 'C'], explanation: '', difficulty: 'easy' };
  expect(projectQuizReviewSnapshot([q], false)).toEqual([]);
  const projected = projectQuizReviewSnapshot([q], true);
  const html = renderToStaticMarkup(<StudentQuizReview id="c" quizId="quiz" template={{ title: 'Quiz' }} targetAttempt={{ id: 'attempt', score: row.expected ? 100 : 0, durationSeconds: null, submittedAt: null }} snapshot={projected} answers={{ [row.id]: row.answer }} />);
  expect(html).toContain(row.expected ? '> Benar<' : '> Salah<');
  expect(html.includes(`Feedback ${row.id}`)).toBe(!row.expected);
  expect(html).toContain(row.expected ? '100%' : '0%');
 }
});

test('essay review keeps manual grading and pending states with retained keys', () => {
 const q = { id: 'essay', prompt: 'Essay', options: [], correct_indices: [0], acceptable_answers: ['yes'], question_type: 'essay', explanation: '', difficulty: 'easy', gradedCorrect: false };
 const render = (gradingStatus: string) => renderToStaticMarkup(<StudentQuizReview id="c" quizId="quiz" template={{ title: 'Quiz' }} targetAttempt={{ id: 'attempt', score: null, durationSeconds: null, submittedAt: null, gradingStatus }} snapshot={[q]} answers={{ essay: 'yes' }} />);
 expect(render('pending')).toContain('Menunggu Koreksi');
 expect(render('graded')).toContain('Telah Dinilai');
});
