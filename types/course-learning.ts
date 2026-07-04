export interface ContinueReadingData {
  materialId: string;
  materialTitle: string;
  chapterTitle: string;
  completionPercent: number;
  lastSectionId?: string;
  lastPosition?: {
    type: "pdf" | "article";
    page?: number;
    section?: string;
  } | null;
}

export interface DueFlashcardsData {
  dueCount: number;
  nextReviewRecommendation: string;
}

export interface RecentActivityData {
  id: string;
  type: "flashcard_review" | "material_completion" | "quiz_completion" | "tryout_completion";
  title: string;
  timestamp: string; // ISO String format
  description?: string;
}

export interface StudyStatisticsData {
  studyTimeMin: number;
  completedMaterialsCount: number;
  cardsReviewedCount: number;
  currentStreakDays: number;
}

export interface CourseLearningSummary {
  continueReading: ContinueReadingData | null;
  dueFlashcards: DueFlashcardsData | null;
  recentActivities: RecentActivityData[];
  studyStatistics: StudyStatisticsData | null;
}

export interface CourseDailyPlanItem {
  kind: "flashcards" | "quiz" | "module";
  label: string;
  meta: string;
  href: string;
}

export interface CourseDailyPlan {
  items: CourseDailyPlanItem[];
  streakDays: number;
  weakestConcept: string | null;
}
