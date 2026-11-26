import type { SolutionCollection } from "./solution-contract";
import type { ComputedQuizMetrics, StudentQuizDiagnosis } from "../../../../lib/student-quiz-analytics/types";

export const assessmentPatterns = [
  "/courses/[id]/quiz",
  "/courses/[id]/quiz/[quizId]",
  "/courses/[id]/quiz/[quizId]/summary/[attemptId]",
  "/courses/[id]/tryout",
  "/courses/[id]/tryout/[tryoutId]",
  "/courses/[id]/my-results",
  "/courses/[id]/my-results/[submissionId]",
  "/courses/[id]/my-results/[submissionId]/summary",
  "/courses/[id]/solutions/[collectionId]",
] as const;

export type AssessmentKind = "quiz" | "tryout";
export type QuestionType = "multiple_choice" | "multiple_choices" | "short_answer" | "essay";
export type Availability = "open" | "upcoming" | "closed" | "locked";
export type Attachment = { fileName: string; fileSize?: string; fileKey?: string; receipt?: string };
export type Answer = number | number[] | string | ({ text: string } & Partial<Attachment>);
export type Answers = Record<string, Answer>;

export type AssessmentQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  sourceEventName?: string;
  acceptsImage?: boolean;
  acceptsFile?: boolean;
};

export type ReviewedQuestion = AssessmentQuestion & {
  selected: string | null;
  expected: string | null;
  correct: boolean | null;
  explanation: string;
  feedback?: string;
};

export type AssessmentRow = {
  id: string;
  title: string;
  availability: Availability;
  stageLocked?: boolean;
  durationSeconds: number | null;
  questionCount: number | null;
  openAt: string | null;
  closeAt: string | null;
  maxAttempts: number | null;
  attempts: number;
  discussionAvailable?: boolean;
  category?: string;
  visibility?: "free" | "paid";
  activeAttemptId?: string;
  bestScore?: number;
};

export type AssessmentResult = {
  id: string;
  assessmentId: string;
  assessmentTitle: string;
  kind: AssessmentKind;
  status: string;
  score: number | null;
  submittedAt: string | null;
  durationSeconds?: number | null;
};

export type AssessmentPlayer = {
  documentCourseId?: string;
  questions: AssessmentQuestion[];
  answers: Answers;
  startAt: string | null;
  durationSeconds: number | null;
  closeAt: string | null;
  canGoBack: boolean;
  requireAllAnswered: boolean;
  perQuestionSeconds: Record<string, number> | null;
};

export type Analytics = {
  status: "pending" | "processing" | "completed" | "failed" | "not_available";
  computedMetrics: ComputedQuizMetrics | null;
  aiDiagnosis: StudentQuizDiagnosis | null;
};

export type AssessmentPage = { courseTitle: string } & (
  | { kind: "quiz-list" | "tryout-list"; fullAccess: boolean; rows: AssessmentRow[] }
  | { kind: "quiz-detail"; assessment: AssessmentRow; history: AssessmentResult[]; player: AssessmentPlayer | null; review: Review | null }
  | { kind: "tryout-detail"; assessment: AssessmentRow; player: AssessmentPlayer | null; priorResult?: AssessmentResult }
  | { kind: "results"; fullAccess: boolean; results: AssessmentResult[] }
  | { kind: "review"; review: Review }
  | { kind: "summary"; result: AssessmentResult; analytics: Analytics; discussionAvailable: boolean }
  | { kind: "solutions"; id: string; version: number; collection: SolutionCollection; canComplete: boolean }
);

export type Review = {
  documentCourseId?: string;
  result: AssessmentResult | null;
  discussionAvailable: boolean;
  items: ReviewedQuestion[];
  additionalItems?: ReviewedQuestion[];
  teacherNotes?: string;
};

export type TryoutAnswer =
  | { type: "multiple_choice"; index: number | null }
  | { type: "multiple_choices"; indices: number[] }
  | ({ type: "short_answer" | "essay"; text: string } & Partial<Attachment>);

export const assessmentApiPath = (path: string) => `/api/native/student/assessment/${path.slice("/courses/".length)}`;
