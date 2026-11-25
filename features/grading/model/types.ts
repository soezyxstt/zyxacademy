export interface PendingAttemptItem {
  id: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
  templateId: string;
  quizTitle: string;
  submittedAt: Date;
  totalQuestions: number;
  essayCount: number;
  remainingEssayCount: number;
}

export interface QuestionDetail {
  index: number;
  id: string;
  prompt: string;
  questionType: string;
  options?: unknown;
  acceptableAnswers?: string[];
  submittedAnswer: unknown;
  submittedText: string;
  fileName?: string | null;
  fileKey?: string | null;
  fileSize?: string | null;
  isDeterministicCorrect: boolean;
  currentScore: number | null;
  currentStatus: string;
  reviewNotes: string;
  reviewRevision: number;
  reviewerId: string | null;
  isFreeResponse: boolean;
  isEssay: boolean;
  isShortAnswer: boolean;
}

export interface AttemptDetails {
  attemptId: string;
  templateId: string;
  quizTitle: string;
  studentName: string | null;
  studentEmail: string | null;
  submittedAt: Date;
  gradingStatus: string;
  score: number | null;
  questions: QuestionDetail[];
}

export interface QuizGradeInput {
  score: string;
  notes: string;
  expectedRevision: number;
}

export type QuizGradeDraftMap = Record<string, QuizGradeInput>;

export interface SubmissionItem {
  id: string;
  studentName: string | null;
  studentEmail: string | null;
  examTitle: string;
  status: "completed" | "pending_review" | "graded" | "late";
  score: number | null;
  teacherNotes: string | null;
  answersSnapshot: unknown;
  questionsSnapshot: unknown;
  submittedAt: Date | null;
}

export interface TryoutGradeDraft {
  score: string;
  notes: string;
}

export type TryoutGradingTab = "pending" | "graded" | "all";
