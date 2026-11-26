import { assessmentCourses, makeAssessmentFixture } from "@/packages/native-parity/academic/assessment/fixtures";
import type { AttemptDetails } from "@/features/grading/model/types";

export async function getQuizAttemptDetailsAction(courseId: string, attemptId: string): Promise<AttemptDetails | null> {
  if (courseId !== assessmentCourses[0].id) return null;
  const { attempts, bank } = makeAssessmentFixture();
  const attempt = attempts.find(({ id }) => id === attemptId);
  if (!attempt?.submittedAt) return null;
  return {
    attemptId, templateId: attempt.templateId, quizTitle: attempt.quizTitle, studentName: attempt.studentName,
    studentEmail: attempt.studentEmail, submittedAt: new Date(attempt.submittedAt), gradingStatus: attempt.status, score: attempt.score,
    questions: attempt.answers.map((answer, index) => {
      const item = bank.find(({ id }) => id === answer.questionId);
      const isEssay = answer.type === "essay";
      const isShortAnswer = answer.type === "short_answer";
      return {
        index: index + 1, id: answer.questionId, prompt: answer.prompt, questionType: answer.type,
        submittedAnswer: answer.submittedAnswer, submittedText: answer.submittedAnswer, options: item?.options,
        acceptableAnswers: item?.acceptableAnswers, isDeterministicCorrect: answer.automaticScore === 100,
        currentScore: answer.reviewScore ?? answer.automaticScore, currentStatus: isEssay ? "pending_review" : "graded",
        reviewNotes: answer.reviewNotes, reviewRevision: answer.revision, reviewerId: null, isEssay,
        isShortAnswer, isFreeResponse: isEssay || isShortAnswer,
      };
    }),
  };
}
