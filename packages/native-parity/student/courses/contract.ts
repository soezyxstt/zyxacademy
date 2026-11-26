export const coursesEndpoint = "/api/native/student/courses";

export type LearningQuery =
  | { view: "dashboard" | "catalog" }
  | { view: "course" | "material-list"; courseId: string }
  | { view: "material-detail"; courseId: string; materialId: string };

export function learningEndpoint(query: LearningQuery): string {
  const params = new URLSearchParams({ view: query.view });
  if ("courseId" in query) params.set("courseId", query.courseId);
  if ("materialId" in query) params.set("materialId", query.materialId);
  return `${coursesEndpoint}?${params}`;
}

export const materialTabs = ["all", "materi", "diktat", "bank_soal", "pdf"] as const;
export type MaterialTab = (typeof materialTabs)[number];
export type MaterialGroup = Exclude<MaterialTab, "all">;

export function normalizeMaterialTab(tab?: string): MaterialTab {
  if (tab === "bank-soal") return "bank_soal";
  return materialTabs.find((key) => key === tab) ?? "all";
}

export type CourseCard = {
  id: string;
  title: string;
  category: string;
  description: string;
  hasFullContentAccess: boolean;
  materialsCount?: number;
  quizzesCount?: number;
  tryoutsCount?: number;
  priority?: boolean;
};

export type ReadingLink = {
  courseId: string;
  courseTitle: string;
  materialId: string;
  title: string;
  completionPercent: number;
  section?: string | null;
};

export type DashboardData = {
  view: "dashboard";
  firstName: string;
  enrolled: CourseCard[];
  recommended: CourseCard[];
  continueReading: ReadingLink[];
};

export type CatalogData = {
  view: "catalog";
  courses: CourseCard[];
  targetCategory: string | null;
};

export type CourseChapter = {
  id: string;
  title: string;
  materialId: string | null;
  completionPercent: number;
  completed: boolean;
};

export type CourseData = {
  view: "course";
  course: CourseCard;
  chapters: CourseChapter[];
  actions: Array<{ key: "reading" | "quiz" | "schedule"; title: string; meta: string; path: string }>;
};

export type CourseMaterialKind = "article" | "pdf" | "quiz" | "tryout" | "solution_collection";

export type MaterialRow = {
  id: string;
  title: string;
  kind: CourseMaterialKind;
  group: MaterialGroup;
  completed: boolean;
  locked: boolean;
  chapterIds: string[];
  meta?: string;
};

export type MaterialListData = {
  view: "material-list";
  course: CourseCard;
  materials: MaterialRow[];
  chapters: Array<{ id: string; title: string; aliases: string[] }>;
};

export type MaterialDetailData = {
  view: "material-detail";
  course: CourseCard;
  material: {
    id: string;
    title: string;
    kind: "article" | "pdf";
    group: MaterialGroup;
    completed: boolean;
    locked: boolean;
  };
};

export type LearningData = DashboardData | CatalogData | CourseData | MaterialListData | MaterialDetailData;
export type EnrollmentFailureCode = "empty" | "invalid" | "alreadyMember" | "capacityReached" | "expired" | "noCourses" | "alreadyEnrolled" | "internal";
export type EnrollmentResponse = { success: true } | { success: false; errorCode: EnrollmentFailureCode };

export function coursePath(courseId: string): string {
  return `/courses/${encodeURIComponent(courseId)}`;
}

export function materialPath(courseId: string, materialId?: string, section?: string | null): string {
  const path = `${coursePath(courseId)}/material${materialId ? `/${encodeURIComponent(materialId)}` : ""}`;
  return section ? `${path}?section=${encodeURIComponent(section)}` : path;
}

export function materialRowPath(courseId: string, row: MaterialRow): string {
  const id = encodeURIComponent(row.id);
  const course = coursePath(courseId);
  if (row.kind === "quiz") return `${course}/quiz/${id}`;
  if (row.kind === "tryout") return `${course}/tryout/${id}`;
  if (row.kind === "solution_collection") return `${course}/solutions/${id}`;
  return materialPath(courseId, row.id);
}
