import { z } from "zod";

export const TUTOR_QUIZ_GRADING_ERRORS = {
  UNAUTHORIZED: "Unauthorized: Silakan masuk terlebih dahulu.",
  ACCESS_DENIED: "TUTOR_ACCESS_DENIED",
  ATTEMPT_NOT_FOUND: "TUTOR_QUIZ_GRADING_ERROR: ATTEMPT_NOT_FOUND",
  TEMPLATE_NOT_FOUND: "TUTOR_QUIZ_GRADING_ERROR: TEMPLATE_NOT_FOUND",
  COURSE_MISMATCH: "TUTOR_QUIZ_GRADING_ERROR: COURSE_MISMATCH",
  OBJECTIVE_OVERRIDE_FORBIDDEN: "TUTOR_QUIZ_GRADING_ERROR: OBJECTIVE_OVERRIDE_FORBIDDEN",
  QUESTION_NOT_IN_ATTEMPT: "TUTOR_QUIZ_GRADING_ERROR: QUESTION_NOT_IN_ATTEMPT",
  INVALID_SCORE: "TUTOR_QUIZ_GRADING_ERROR: INVALID_SCORE",
  CAS_CONFLICT: "TUTOR_QUIZ_GRADING_ERROR: CAS_CONFLICT",
  REQUEST_CONFLICT: "TUTOR_QUIZ_GRADING_ERROR: REQUEST_CONFLICT",
  ESSAY_REVIEW_REQUIRED: "TUTOR_QUIZ_GRADING_ERROR: ESSAY_REVIEW_REQUIRED",
} as const;

export const gradeAnswerItemSchema = z.object({
  questionId: z.string().min(1),
  score: z.number().min(0).max(100),
  reviewNotes: z.string().max(2000).optional().nullable(),
  expectedRevision: z.number().int().min(0),
});

export type GradeAnswerItem = z.infer<typeof gradeAnswerItemSchema>;

export const gradeQuizAttemptSchema = z.object({
  courseId: z.string().min(1),
  attemptId: z.string().min(1),
  items: z.array(gradeAnswerItemSchema).min(1),
});

export type GradeQuizAttemptInput = z.infer<typeof gradeQuizAttemptSchema>;

export const quizGradingRequestIdSchema = z.string().min(12).max(128).regex(/^[A-Za-z0-9_-]+$/);
export type GradeQuizRequest = { requestId: string; requireAllEssays: boolean };
