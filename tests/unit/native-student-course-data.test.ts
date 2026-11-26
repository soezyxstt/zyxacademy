import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { artikel, diktatMateri, diktats, progress, studentMaterialProgress, websiteMaterials } from "@/db/schema";
import type { StudentCourseAccess } from "@/lib/course-utils";

const dialect = new PgDialect();
const rows = new Map<unknown, unknown[]>();
const queries = new Map<unknown, string[][]>();
const student = "bound-learner";
const course = { id: "legacy-course", legacyId: "legacy-course", canonicalId: "canonical-course", category: "TPB", title: "Class", description: "Syllabus" };
const previewAccess: StudentCourseAccess = {
  courseId: course.canonicalId,
  canonicalCourseId: course.canonicalId,
  legacyCourseId: course.legacyId,
  tier: "free",
  isEnrolled: false,
  hasFullContentAccess: false,
  freeChapterIds: ["free-chapter"],
  policy: {
    requestedCourseId: course.id,
    courseId: course.canonicalId,
    publicCourseId: course.id,
    canonicalCourseId: course.canonicalId,
    legacyCourseId: course.legacyId,
    courseTitle: course.title,
    isDemo: false,
    tier: "free",
    role: "murid",
    roles: ["murid"],
    isAuthenticated: true,
    isEnrolled: false,
    hasCourseAccess: true,
    hasFullContentAccess: false,
    pricing: { category: "premium", startsAt: null, endsAt: null },
    isFreeNow: false,
    freeChapters: [],
    freeChapterIds: ["free-chapter"],
    scopedChapterIds: ["free-chapter", "premium-chapter"],
    capabilities: { canReadArticle: true, canReadDiktat: true, canStartQuiz: true, canReviewFlashcard: false, canAskZyra: false, canDownloadDiktat: false, zyraDailyQuestionLimit: null },
  },
};

const resolveAccess = mock(async (): Promise<StudentCourseAccess | null> => previewAccess);
const readSummary = mock(async () => [{ completed: true }]);
const readList = mock(async () => ({ courseChapters: [], materialsWithLockState: [] }));

mock.module("@/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (filter: SQL) => ({
          limit: async () => {
            const records = queries.get(table) ?? [];
            records.push(dialect.sqlToQuery(filter).params.map(String));
            queries.set(table, records);
            return rows.get(table) ?? [];
          },
        }),
      }),
    }),
  },
}));
mock.module("@/lib/course-utils", () => ({
  getCourse: async () => course,
  getCourseChapterOutline: async () => [],
  getStudentCourseAccess: resolveAccess,
  normalizeChapterIds: (value: unknown) => Array.isArray(value) ? value : [],
}));
mock.module("@/app/(student)/courses/[id]/material/canonical-summaries", () => ({ getMaterialArticleSummaries: readSummary }));
mock.module("@/lib/learning-analytics", () => ({ getCourseOverviewData: mock() }));
mock.module("@/lib/pka-enrollment", () => ({ isPkaEnrolled: async () => false }));
mock.module("@/lib/student/course-catalog", () => ({ listStudentEnrollments: mock() }));
mock.module("@/lib/student/course-catalog-view-data", () => ({ loadStudentCourseCatalog: mock() }));
mock.module("@/lib/student/dashboard-materials", () => ({ getDashboardCourseMaterialsBatch: mock() }));
mock.module("@/lib/student/course-material-list", () => ({ loadCourseMaterialData: readList }));
mock.module("@/app/(student)/dashboard/dashboard-sections", () => ({
  loadOnboardingData: mock(),
  loadPrimaryLearningData: mock(),
  loadRecommendedCoursesData: mock(),
}));
mock.module("@/lib/whatsapp-admin", () => ({ getWhatsAppAdminChatHref: () => null }));

const { loadNativeCourseData } = await import("@/lib/student/native-course-data");
const detail = (materialId: string) => loadNativeCourseData(student, { view: "material-detail", courseId: course.id, materialId });

beforeEach(() => {
  rows.clear();
  queries.clear();
  resolveAccess.mockClear();
  readSummary.mockClear();
  readList.mockClear();
});

describe("native Student material metadata", () => {
  test("denies an inactive learner before reading any material or progress data", async () => {
    resolveAccess.mockResolvedValueOnce(null);
    expect(await detail("paid")).toEqual({ status: 403 });
    expect(queries.size).toBe(0);
  });

  test("binds published article and handbook identity to the requested course and withholds personal progress for a locked asset", async () => {
    rows.set(artikel, [{ id: "paid", title: "Paid article", chapterId: "premium-chapter", content: "private" }]);
    expect(await detail("paid-slug")).toMatchObject({
      view: "material-detail",
      material: { id: "paid", title: "Paid article", locked: true, completed: false },
    });
    expect(queries.get(artikel)?.[0]).toEqual([course.canonicalId, "published", "paid-slug", "paid-slug"]);
    expect(queries.get(diktatMateri)?.[0]).toEqual([course.canonicalId, "published", "paid-slug"]);
    expect(queries.has(progress)).toBeFalse();
    expect(queries.has(studentMaterialProgress)).toBeFalse();
    expect(readSummary).not.toHaveBeenCalled();
    expect(readList).not.toHaveBeenCalled();
  });

  test("resolves hidden legacy material by its course-bound identifier with the web reader's source precedence", async () => {
    rows.set(diktats, [{ title: "Archived URL to the free handbook", chapterIds: ["free-chapter"], fileUrl: "private" }]);
    rows.set(websiteMaterials, [{ title: "Different type with the same ID", chapterId: "free-chapter" }]);
    rows.set(studentMaterialProgress, [{ completionPercent: 93 }]);
    const result = await detail("legacy-material");
    expect(result).toMatchObject({
      view: "material-detail",
      material: { id: "legacy-material", title: "Archived URL to the free handbook", kind: "pdf", group: "diktat", locked: false, completed: true },
    });
    if ("view" in result && result.view === "material-detail") expect(result.material).not.toHaveProperty("fileUrl");
    expect(queries.get(diktats)?.[0]).toEqual(["legacy-material", course.legacyId, "ready"]);
    expect(queries.get(studentMaterialProgress)?.[0]).toEqual([student, "legacy-material"]);
    expect(readList).not.toHaveBeenCalled();
  });

  test("cannot discard unknown chapters when applying the preview policy", async () => {
    rows.set(diktats, [{ title: "Invalid handbook", chapterIds: ["free-chapter", null] }]);
    expect(await detail("mixed")).toMatchObject({ view: "material-detail", material: { locked: true, completed: false } });
    expect(queries.has(studentMaterialProgress)).toBeFalse();
  });
});
