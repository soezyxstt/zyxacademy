import { answerToStableOptionIds, gradeStableOptionAnswer } from '@/lib/asesmen/attempt';
import { isShortAnswerCorrect } from '@/lib/quiz/short-answer';

export function questionAnswerType(q: any): string | undefined {
  const declared = q.question_type || q.questionType || q.type;
  if (declared) return declared;
  const acceptable = q.acceptable_answers ?? q.acceptableAnswers;
  return Array.isArray(acceptable) && acceptable.length > 0 ? 'short_answer' : undefined;
}

export function checkAnswerCorrectness(q: any, submitted: any): boolean {
  const qType = questionAnswerType(q);
  if (qType === "essay") {
    return false;
  }
  if (qType === "short_answer") {
    return isShortAnswerCorrect(submitted, q.acceptable_answers ?? q.acceptableAnswers);
  }
  const indices = Array.isArray(submitted) ? submitted : typeof submitted === 'number' ? [submitted] : [];
  const correct = Array.isArray(q.correct_indices) ? q.correct_indices : Array.isArray(q.correctIndices) ? q.correctIndices : [];
  if (correct.length === 0) return false;
  const isMultiple = qType === "multiple_choices" || correct.length > 1;
  const submittedCount = Array.isArray(submitted) ? submitted.length : submitted === undefined || submitted === null ? 0 : 1;
  if ((!isMultiple && submittedCount !== 1) || (isMultiple && submittedCount !== correct.length)) return false;
  if (Array.isArray(q.stable_option_ids)) {
    let selected: string[];
    try { selected = answerToStableOptionIds(q.stable_option_ids, submitted); } catch { return false; }
    if (selected.length !== submittedCount || new Set(selected).size !== selected.length) return false;
    return gradeStableOptionAnswer({
      stableOptionIds: q.stable_option_ids,
      correctIndices: correct,
      submitted,
      questionType: isMultiple ? "multiple_choices" : qType,
    });
  }
  if (!isMultiple && (qType === "multiple_choice" || !qType)) {
    return indices.length === 1 && indices[0] === correct[0];
  }
  return indices.length === correct.length && new Set(indices).size === indices.length && indices.every((i: number) => correct.includes(i));
}
