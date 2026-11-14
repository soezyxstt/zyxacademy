import { gradeStableOptionAnswer } from '@/lib/asesmen/attempt';
import { isShortAnswerCorrect } from '@/lib/quiz/short-answer';

export function checkAnswerCorrectness(q: any, submitted: any): boolean {
  const qType = q.question_type || q.questionType;
  if (qType === "short_answer" || (Array.isArray(q.acceptable_answers) && q.acceptable_answers.length > 0)) {
    return isShortAnswerCorrect(submitted, q.acceptable_answers);
  }
  if (qType === "essay") {
    return false;
  }
  const indices = Array.isArray(submitted) ? submitted : [];
  const correct = Array.isArray(q.correct_indices) ? q.correct_indices : Array.isArray(q.correctIndices) ? q.correctIndices : [];
  if (correct.length === 0) return false;
  const isMultiple = qType === "multiple_choices" || correct.length > 1;
  if (Array.isArray(q.stable_option_ids)) {
    return gradeStableOptionAnswer({
      stableOptionIds: q.stable_option_ids,
      correctIndices: correct,
      submitted,
      questionType: isMultiple ? "multiple_choices" : qType,
    });
  }
  if (!isMultiple && (qType === "multiple_choice" || !qType)) {
    const firstIdx = indices[0];
    return firstIdx !== undefined && correct.includes(firstIdx);
  }
  return indices.length === correct.length && indices.every((i: number) => correct.includes(i));
}
