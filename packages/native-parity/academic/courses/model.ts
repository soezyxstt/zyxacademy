import type { AdminChapterEditor, AdminCourseEditor } from "./edit-contract";
import type { AdminCourseSectionResult } from "./sections";

export type AdminCourse = {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string | null;
  chapterCount: number;
  materialCount: number;
  quizCount: number;
};

export type AdminChapter = {
  id: string;
  title: string;
  description: string | null;
  orderIndex: number;
  materialCount: number;
  questionCount: number;
};

export type AdminCourseOverview = {
  course: AdminCourse;
  chapters: readonly AdminChapter[];
  chapterEdit?: { revision: string; allowsDescription: boolean } | null;
};

export type LiveCourseRead<T> =
  | { status: "loading" }
  | { status: "error" | "denied" | "missing" }
  | { status: "ready"; data: T };

export type AdminCourseLiveRead = {
  list?: LiveCourseRead<readonly AdminCourse[]>;
  detail?: LiveCourseRead<AdminCourseOverview>;
  section?: LiveCourseRead<AdminCourseSectionResult>;
  updateSettings?: AdminCourseEditor;
  saveChapter?: AdminChapterEditor;
  retry(): void;
};

const legacyTabs: Record<string, string> = {
  materials: "documents",
  quizzes: "quizzes",
  questions: "questions",
  flashcards: "flashcards",
  analytics: "results",
  settings: "settings",
};

export function adminCoursePath(slug: string, section?: string, itemId?: string) {
  return ["/admin/courses", encodeURIComponent(slug), section, itemId ? encodeURIComponent(itemId) : null]
    .filter(Boolean)
    .join("/");
}

export function resolveAdminCourseAlias(slug: string, tab: string | undefined) {
  return tab && Object.hasOwn(legacyTabs, tab) ? adminCoursePath(slug, legacyTabs[tab]) : null;
}

export function filterAdminCourses(courses: readonly AdminCourse[], search: string, category: string) {
  const term = search.trim().toLocaleLowerCase("id");
  return courses.filter((course) => {
    const matchesCategory = !category || course.category === category;
    const matchesSearch = !term || [course.title, course.id, course.description]
      .some((field) => field?.toLocaleLowerCase("id").includes(term));
    return matchesCategory && matchesSearch;
  });
}

export type ScoredAttempt = { score: number; duration: number };

export function completedCourseAttempts<T extends { score: number | null; duration: number }>(attempts: readonly T[]) {
  return attempts.filter((attempt): attempt is T & ScoredAttempt => attempt.score !== null);
}

export function summarizeCourseAttempts(attempts: readonly { score: number | null; duration: number }[]) {
  const completed = completedCourseAttempts(attempts);
  const average = (sum: number) => completed.length ? Math.round(sum / completed.length) : 0;
  const passing = completed.filter((attempt) => attempt.score >= 70).length;
  return {
    started: attempts.length,
    completed: completed.length,
    completion: attempts.length ? Math.round(completed.length / attempts.length * 100) : 0,
    average: average(completed.reduce((total, attempt) => total + attempt.score, 0)),
    passRate: average(passing * 100),
    duration: average(completed.reduce((total, attempt) => total + attempt.duration, 0)),
  };
}
