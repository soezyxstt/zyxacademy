import type { RecentActivityData, StudyStatisticsData } from "../../../../types/course-learning";

export type ConceptRef = { conceptName: string; slug: string };
export type ConceptKind = "definition" | "formula" | "example" | "misconception" | "exercise" | "summary" | "objective" | "concept_overview";
export type ConceptExplorerData = {
  conceptId: string;
  conceptName: string;
  canonicalSlug: string;
  masteryScore: number | null;
  kosByType: Partial<Record<ConceptKind, { id: string; title: string; content: string }[]>>;
  prerequisites: ConceptRef[];
  unlocks: ConceptRef[];
  related: ConceptRef[];
};
export type StudentMasteryGroup = {
  chapter: { id: string; title: string; orderIndex: number };
  concepts: {
    conceptName: string;
    conceptSlug: string | null;
    masteryScore: number | null;
    confidence: number | null;
    trend: "improving" | "stable" | "declining" | null;
    blockedBy: string[];
  }[];
};
export type StudyPathStep = {
  stepId: string;
  ideaId: string | null;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  conceptName: string;
  status: "locked" | "available" | "in_progress" | "mastered";
  actions: { moduleHref?: string; quizTemplateId?: string; flashcardCount?: number };
  estimatedMinutes: number;
  prerequisites: string[];
  masteryScore?: number;
  priorityReason: string;
};
export type StudyDayPlan = { day: number; steps: StudyPathStep[]; totalMinutes: number };
export type PkaSubject = "matematika" | "fisika" | "kimia";
export type PkaStageState = {
  stage: 1 | 2 | 3;
  quizTemplateId: string;
  passScoreThreshold: number;
  status: "locked" | "unlocked" | "completed" | "skipped";
  bestScore: number | null;
  passed: boolean | null;
  attemptId: string | null;
};
export type PkaSubjectDiagnostic = {
  subject: PkaSubject;
  attempted: boolean;
  passedAtStage: 1 | 2 | 3 | null;
  bestScore: number | null;
  status: "not_attempted" | "at_risk" | "borderline" | "solid";
  message: string;
};

export const PKA_PATH = "/courses/tutorial-pka";

export type CourseLearningView = "concept" | "flashcard" | "mastery" | "path" | "playground" | "progress" | "video" | "live";
export type PkaLearningView = "pka-home" | "pka-registration" | "pka-schedule" | "pka-report" | "pka-material" | "pka-simulation" | "pka-stage";
export type LearningView = CourseLearningView | PkaLearningView;

export type Flashcard = {
  id: string;
  front: string;
  back: string;
  explanation: string | null;
  dueStatus: "new" | "review";
  priorityReason: string;
  recallDifficulty: number | null;
};

export type CourseVideo = {
  id: string;
  title: string;
  description: string | null;
  chapterId: string | null;
  chapterTitle: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  locked: boolean;
};

export type PkaSchedule = { id: string; title: string; sessionAt: string; meetLink: string | null; isPast: boolean };
export type PkaAnnouncement = { id: string; title: string; body: string; createdAt: string; isPinned: boolean };
export type PkaSimulation = { id: string; title: string; timeLimitSeconds: number | null; stage?: { subject: PkaSubject; number: 1 | 2 | 3 } };
export type PkaAttempt = { id: string; templateId: string; status: "in_progress" | "completed" | "abandoned"; score: number | null };

export type LearningData =
  | { view: LearningView; state: "locked"; courseTitle: string }
  | { view: PkaLearningView; state: "redirect"; path: string }
  | ({ state: "ready"; courseTitle: string } & (
    | { view: "concept"; concept: ConceptExplorerData }
    | { view: "flashcard"; cards: Flashcard[] }
    | { view: "mastery"; groups: StudentMasteryGroup[] }
    | { view: "path" }
    | { view: "playground" }
    | { view: "progress"; statistics: StudyStatisticsData | null; activities: RecentActivityData[] }
    | { view: "video"; hasFullContentAccess: boolean; chapters: { id: string; title: string }[]; playlists: { id: string; title: string; description: string | null; videos: CourseVideo[] }[] }
    | { view: "live"; enabled: boolean; joinCourseId: string }
    | { view: "pka-registration" }
    | { view: "pka-material" }
    | { view: "pka-home"; testDate: string; nextSession: PkaSchedule | null; announcements: PkaAnnouncement[]; simulationCount: number; completedCount: number; bestScore: number }
    | { view: "pka-schedule"; schedules: PkaSchedule[] }
    | { view: "pka-report"; results: PkaSubjectDiagnostic[] }
    | { view: "pka-simulation"; hasFullContentAccess: boolean; templates: PkaSimulation[]; attempts: PkaAttempt[] }
    | { view: "pka-stage"; stage: PkaStageState; template: PkaSimulation; attempt: PkaAttempt | null }
  ));

export type StudyPathData = { steps: StudyPathStep[]; dayPlan: StudyDayPlan[] | null };

export const learningRouteViews = {
  "/courses/[id]/concept/[slug]": "concept",
  "/courses/[id]/flashcard": "flashcard",
  "/courses/[id]/mastery": "mastery",
  "/courses/[id]/path": "path",
  "/courses/[id]/playground": "playground",
  "/courses/[id]/progress": "progress",
  "/courses/[id]/video": "video",
  "/courses/[id]/live": "live",
  "/courses/tutorial-pka": "pka-home",
  "/courses/tutorial-pka/daftar": "pka-registration",
  "/courses/tutorial-pka/jadwal": "pka-schedule",
  "/courses/tutorial-pka/laporan": "pka-report",
  "/courses/tutorial-pka/material": "pka-material",
  "/courses/tutorial-pka/material/[materialId]": "pka-material",
  "/courses/tutorial-pka/simulasi": "pka-simulation",
  "/courses/tutorial-pka/simulasi/[subject]/[stage]": "pka-stage",
} as const satisfies Record<string, LearningView>;

export const liveHostPattern = "/courses/[id]/live/host";
export const learningApi = "/api/native/student/learning";
export const learningLiveJoinApi = `${learningApi}/live`;

export function courseHref(id: string, suffix = "") {
  return `/courses/${encodeURIComponent(id)}${suffix}`;
}

export function learningRequestPath(
  view: LearningView,
  params: Readonly<Record<string, string>>,
  query: Readonly<Record<string, string>>,
) {
  const search = new URLSearchParams({ view });
  if (view.startsWith("pka-")) {
    if (view === "pka-stage") {
      search.set("subject", params.subject ?? "");
      search.set("stage", params.stage ?? "");
      if (query.attemptId) search.set("attemptId", query.attemptId);
    }
  } else {
    search.set("courseId", params.id ?? "");
    if (view === "concept") search.set("slug", params.slug ?? "");
  }
  return `${learningApi}?${search}`;
}

export function externalVideoPath(path: string | null) {
  if (!path) return null;
  if (!path.startsWith("youtube/")) return path;
  const id = path.slice("youtube/".length);
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

export function isFlashcardReviewReceipt(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Record<string, unknown>;
  return typeof receipt.nextReviewDue === "string" && Number.isFinite(Date.parse(receipt.nextReviewDue))
    && typeof receipt.nextIntervalDays === "number" && Number.isFinite(receipt.nextIntervalDays) && receipt.nextIntervalDays >= 0
    && typeof receipt.nextBox === "number" && Number.isInteger(receipt.nextBox) && receipt.nextBox >= 0
    && (receipt.examInputPassed === undefined || typeof receipt.examInputPassed === "boolean");
}
