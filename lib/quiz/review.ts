import { isShortAnswerCorrect } from "@/lib/quiz/short-answer";
import type { QuizAttempt, ReviewQuestion } from "@/lib/quiz/client";

/** Determines whether a submitted student answer is correct during review. */
export function checkReviewAnswerCorrectness(q: ReviewQuestion, submitted: unknown): boolean {
  const qType = q.question_type || q.questionType || q.type;
  if (qType === "short_answer" || q.acceptable_answers?.length || q.acceptableAnswers?.length) {
    return isShortAnswerCorrect(submitted, q.acceptable_answers ?? q.acceptableAnswers ?? []);
  }
  if (qType === "essay") {
    const text = typeof submitted === "string" ? submitted : Array.isArray(submitted) ? String(submitted[0] ?? "") : "";
    return text.trim().length > 0;
  }
  const indices = Array.isArray(submitted) ? submitted : [];
  const correct = q.correct_indices ?? q.correctIndices ?? [];
  if (correct.length === 0) return false;
  const isMultiple = qType === "multiple_choices" || correct.length > 1;
  if (!isMultiple && (qType === "multiple_choice" || !qType)) {
    const firstIdx = indices[0];
    return firstIdx !== undefined && correct.includes(firstIdx);
  }
  return indices.length === correct.length && indices.every((index) => correct.includes(index));
}

/** Hidden answer keys and unfinished attempts cannot produce review feedback. */
export function needsQuizFeedback(attempt: QuizAttempt | undefined): boolean {
  if (!attempt || attempt.status !== "completed") return false;
  return attempt.questionsSnapshot.some((question, index) => {
    const released = question.correct_indices !== undefined || question.correctIndices !== undefined
      || question.acceptable_answers !== undefined || question.acceptableAnswers !== undefined
      || question.explanation !== undefined;
    return released && !checkReviewAnswerCorrectness(question, attempt.answersSnapshot[question.id])
      && !attempt.feedback.some((feedback) => feedback.questionIndex === index);
  });
}
