import type { QuizInsightReport } from "../../../academic/quiz-insight";
import type { AdminFlashcardStatus, AdminMaterialTitleEdit } from "./edit-contract";
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

export type CourseLeaderboardAttempt = {
  id: string; participantId: string; name: string; title: string; category: string;
  score: number; duration: number; submittedAt: string | null;
};

export type CourseSectionPayload =
  | { type: "analytics" | "results"; quizzes: CourseQuizRow[];
      stats: { totalAttempts: number; avgScore: number; passRate: number } }
  | { type: "quiz-insight"; quiz: { id: string; courseId?: string; title: string; category: string; status: string };
      summary: { totalStarted: number; totalCompleted: number; completionRate: number; avgScore: number;
        minScore: number; maxScore: number; medianScore: number; avgDurationSeconds: number; scoreRanges: number[] };
      questions: QuizInsightItem[]; attempts: { id: string; name: string | null; status: string; score: number | null;
        durationSeconds: number | null; startedAt: string; submittedAt: string | null }[]; latestInsight: { summary: string | null; sampleSize: number; report?: QuizInsightReport } | null }
  | { type: "documents"; chapters: (CourseChapterLabel & { orderIndex?: number })[]; documents: CourseDocumentRow[]; pdfUpload?: boolean }
  | { type: "document"; document: CourseDocumentRow; chapters: CourseChapterLabel[]; titleEdit?: AdminMaterialTitleEdit | null; pdfPreview?: boolean }
  | { type: "review"; bundles: CourseReviewRow[]; bundleUpload?: { idea: boolean; product: boolean } }
  | { type: "leaderboard"; attempts: CourseLeaderboardAttempt[] }
  | { type: "videos"; playlists: { id: string; title: string; description: string | null; revision?: string | null; videos:
      { id: string; title: string; description: string | null; playable: boolean; revision?: string | null }[] }[] }
  | { type: "flashcards"; chapters: (CourseChapterLabel & { legacyId?: string | null })[]; legacyChapters?: CourseChapterLabel[]; writable?: boolean; canCreateSet?: boolean;
      sets: { id: string; title: string; status: AdminFlashcardStatus | "in_review"; chapterId: string | null;
        revision?: string; deleteRevision?: string; projection?: "canonical" | "legacy" | "mirrored";
        cards: { id: string; front: string; back: string; explanation: string | null; status?: AdminFlashcardStatus; revision?: string; mirrored?: boolean }[] }[] }
  | { type: "settings"; description: string | null; isDemo: boolean; revision: string; canonicalOnly: boolean;
      pricing: { category: string; startsAt: string | null; endsAt: string | null };
      demoChecks: { label: string; ready: boolean; count: number }[] }
  | { type: "questions"; chapters: CourseChapterLabel[]; questions: {
      id: string; prompt: string; explanation: string | null; options: string[]; correctIndices: number[];
      chapterId: string | null; difficulty: string; origin: string | null; deleteRevision?: string;
    }[] };

export type AdminCourseSectionResult = CourseSectionPayload & { course: CourseSectionHeader };

export function isAdminCourseLiveSection(section: string | undefined, itemId?: string): section is string {
  if (section === "documents" || section === "analytics") return true;
  return !itemId && (section === "results" || section === "review" ||
    section === "videos" || section === "flashcards" || section === "settings" || section === "questions" || section === "leaderboard");
}

export function rankCourseLeaderboard(attempts: readonly CourseLeaderboardAttempt[], type: string, search: string) {
  const applicable = attempts.filter((attempt) =>
    (type !== "quiz" || attempt.category !== "simulation") && (type !== "simulation" || attempt.category === "simulation"));
  const byParticipant = new Map<string, CourseLeaderboardAttempt[]>();
  for (const attempt of applicable) {
    const group = byParticipant.get(attempt.participantId);
    if (group) group.push(attempt);
    else byParticipant.set(attempt.participantId, [attempt]);
  }
  const query = search.trim().toLocaleLowerCase("id");
  const standings = Array.from(byParticipant, ([id, records]) => {
    const name = records[0].name;
    const score = records.reduce((total, attempt) => total + attempt.score, 0);
    const time = records.reduce((total, attempt) => total + attempt.duration, 0);
    return { id, name, records, score, average: Number((score / records.length).toFixed(1)), duration: Math.round(time / records.length) };
  }).filter(({ name }) => name.toLocaleLowerCase("id").includes(query))
    .sort((left, right) => right.average - left.average || right.score - left.score ||
      right.records.length - left.records.length || left.duration - right.duration || left.id.localeCompare(right.id))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  return { standings, totalAttempts: applicable.length };
}
