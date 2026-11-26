import type { AdminCourse } from "./model";

export type CourseSectionHeader = Pick<AdminCourse, "id" | "slug" | "title" | "category">;
export type CourseChapterLabel = { id: string; title: string };

export type CourseQuizRow = {
  id: string; title: string; category: string; status: string;
  totalAttempts: number; avgScore: number; passRate: number; hasInsight: boolean;
};

export type CourseDocumentRow = {
  id: string;
  title: string;
  kind: string;
  category: string;
  tab: string;
  chapterIds: string[];
  status: string | null;
  year: number | null;
};

export type CourseReviewRow = {
  id: string;
  type: "idea" | "product";
  title: string;
  subtitle: string | null;
  status: string;
};

export type QuizInsightItem = {
  questionId: string;
  prompt: string;
  options: string[];
  correctIndices: number[];
  totalAnswers: number;
  accuracyRate: number;
  optionCounts: Record<number, number>;
};

export type CourseSectionPayload =
  | { type: "analytics" | "results"; quizzes: CourseQuizRow[];
      stats: { totalAttempts: number; avgScore: number; passRate: number } }
  | { type: "quiz-insight"; quiz: { id: string; title: string; category: string; status: string };
      summary: { totalStarted: number; totalCompleted: number; completionRate: number; avgScore: number;
        minScore: number; maxScore: number; medianScore: number; avgDurationSeconds: number; scoreRanges: number[] };
      questions: QuizInsightItem[]; latestInsight: { summary: string; sampleSize: number } | null }
  | { type: "documents"; chapters: CourseChapterLabel[]; documents: CourseDocumentRow[] }
  | { type: "document"; document: CourseDocumentRow; chapters: CourseChapterLabel[] }
  | { type: "review"; bundles: CourseReviewRow[] }
  | { type: "videos"; playlists: { id: string; title: string; description: string | null; videos:
      { id: string; title: string; description: string | null; playable: boolean }[] }[] }
  | { type: "flashcards"; chapters: CourseChapterLabel[]; sets: { id: string; title: string; status: string; chapterId: string | null;
      cards: { id: string; front: string; back: string; explanation: string | null }[] }[] }
  | { type: "settings"; description: string | null; isDemo: boolean;
      pricing: { category: string; startsAt: string | null; endsAt: string | null };
      demoChecks: { label: string; ready: boolean; count: number }[] }
  | { type: "questions"; chapters: CourseChapterLabel[]; questions: {
      id: string; prompt: string; explanation: string | null; options: string[]; correctIndices: number[];
      chapterId: string | null; difficulty: string; origin: string | null;
    }[] };

export type AdminCourseSectionResult = CourseSectionPayload & { course: CourseSectionHeader };

export function isAdminCourseLiveSection(section: string | undefined, itemId?: string): section is string {
  if (section === "documents" || section === "analytics") return true;
  return !itemId && (section === "results" || section === "review" ||
    section === "videos" || section === "flashcards" || section === "settings" || section === "questions");
}
