import type { QuestionIdeaLink, QuestionReviewStatus, QuestionType, Difficulty, CognitiveLevel } from "../../../lib/question-authoring-contract";
import type { HistoricalQuestionQuery, QuestionQuery } from "./evaluation-question-query";

export type Course = { id: string; title: string };
export type ActiveQuestion = {
  id: string;
  courseId: string;
  origin: "zyx_original" | "historical_reference" | "itb_example";
  sourceEventName: string | null;
  sourceReferenceId: string | null;
  difficulty: Difficulty;
  questionType: QuestionType;
  tags: string[];
  prompt: string;
  options: string[];
  correctIndices: number[];
  acceptableAnswers: string[];
  explanation: string;
  reviewStatus: QuestionReviewStatus;
  useCount: number;
  createdAt: string;
  chapterId: string | null;
  canonicalStatus: "draft" | "in_review" | "published" | "retired";
  cognitiveLevel: CognitiveLevel | null;
  reasoningPattern: string | null;
  ideaLinks: QuestionIdeaLink[];
};

export type HistoricalQuestion = {
  id: string;
  courseId: string | null;
  difficulty: Difficulty;
  questionMarkdown: string;
  answerMarkdown: string | null;
  options: unknown;
  questionType: string;
  sourceTitle: string;
  sourceCategory: string;
  sourceYear: number | null;
  reviewStatus: QuestionReviewStatus;
  canonicalStatus: string;
  quizEligible: boolean;
  sourceQuestionNumber: string | null;
  sourceQuestionPart: string | null;
  sourcePage: number | null;
  answerProvenance: string | null;
  solutionProvenance: string | null;
};

export type QuestionBank = {
  query: QuestionQuery;
  historicalQuery: HistoricalQuestionQuery;
  total: number;
  historicalTotal: number;
  questions: ActiveQuestion[];
  historicalQuestions: HistoricalQuestion[];
  courses: Course[];
  courseMap: Record<string, string>;
  canonicalCourseMap: Record<string, string>;
  authoringCourses: (Course & { code: string; legacyCourseId: string | null })[];
};

export type GenerationJob = {
  id: string;
  courseId: string;
  tutorId: string;
  status: "pending" | "processing" | "completed" | "failed";
  promptParameters: unknown;
  targetCount: number;
  generatedCount: number;
  tokenUsage: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GenerationJobs = {
  jobs: GenerationJob[];
  courses: Course[];
  chapters: (Course & { courseId: string; orderIndex: number })[];
  knowledgeObjects: (Course & { courseId: string; chapterId: string; conceptName: string })[];
  courseMap: Record<string, string>;
};

export type Distractors = {
  id: string;
  prompt: string;
  course: string;
  total: number;
  options: { text: string; percentage: number; isCorrect: boolean; misconception: string | null }[];
}[];

export type Chapter = { id: string; code: string; title: string };
export type Idea = { id: string; code: string; statement: string };

export type EvaluationRequest = <Data>(
  href: string,
  options?: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; signal?: AbortSignal },
) => Promise<Data>;

export const evaluationRead = (href: string, view?: string) =>
  `/api/native/operations/evaluation?href=${encodeURIComponent(href)}${view ? `&view=${encodeURIComponent(view)}` : ""}`;

export const questionRoute = "/admin/questions";
type EvaluationAction = "questions" | "question" | "import-questions" | "generation-jobs" | "generation-job";
export const evaluationAction = (action: EvaluationAction, id?: string) =>
  `/api/native/operations/evaluation/actions?action=${action}${id ? `&id=${encodeURIComponent(id)}` : ""}`;

export const chapterOptions = (courseId: string) =>
  evaluationRead(`${questionRoute}?courseId=${encodeURIComponent(courseId)}`, "chapters");
export const ideaOptions = (courseId: string, chapterId: string) =>
  evaluationRead(`${questionRoute}?courseId=${encodeURIComponent(courseId)}&chapterId=${encodeURIComponent(chapterId)}`, "ideas");

export type MarkdownImportInput = {
  courseId: string;
  chapterId: string | null;
  rawMarkdown: string;
  ideaLinks: QuestionIdeaLink[];
  reviewStatus: QuestionReviewStatus;
};
