import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { artikel, courseMaterials, diktatMateri, diktats, progress, studentMaterialProgress, websiteMaterials } from "@/db/schema";
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

const enrolledAccess: StudentCourseAccess = {
  ...previewAccess, tier: "enrolled", isEnrolled: true, hasFullContentAccess: true,
  policy: { ...previewAccess.policy, tier: "enrolled", isEnrolled: true, hasFullContentAccess: true,
    capabilities: { ...previewAccess.policy.capabilities, canDownloadDiktat: true } },
};

const resolveAccess = mock(async (): Promise<StudentCourseAccess | null> => previewAccess);
const readSummary = mock(async () => [{ completed: true }]);
const readList = mock(async () => ({
  courseChapters: [] as Array<{ id: string; title: string; orderIndex: number; canonicalId: string; legacyChapterId: string }>,
  materialsWithLockState: [] as Array<{
    id: string; title: string; docCategory: "materi"; tabGroup: "materi"; kind: "article";
    completed: boolean; chapterIds: string[]; thumbnailUrl: string;
  }>,
}));

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
mock.module("@/lib/env", () => ({ env: { FEATURE_LIVE: "0" } }));
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
  test("projects chapter numbers and canonical cover eligibility within the existing access grant", async () => {
    resolveAccess.mockResolvedValueOnce(previewAccess);
    const cover = (id: string) => `/api/courses/${course.id}/material/${id}/cover.svg`;
    const article = (id: string, chapter: string, thumbnailUrl: string) => ({
      id, title: id, docCategory: "materi" as const, tabGroup: "materi" as const,
      kind: "article" as const, completed: true, chapterIds: [chapter], thumbnailUrl,
    });
    readList.mockResolvedValueOnce({
      courseChapters: [{ id: "legacy", title: "Unit", orderIndex: 4, canonicalId: "free-chapter", legacyChapterId: "legacy" }],
      materialsWithLockState: [
        article("open", "free-chapter", cover("open")),
        article("locked", "premium-chapter", cover("locked")),
        article("legacy-url", "free-chapter", "https://storage.invalid/preview.svg"),
      ],
    });
    const result = await loadNativeCourseData(student, { view: "material-list", courseId: course.id });
    expect(result).toMatchObject({
      view: "material-list",
      course: { hasFreeChapter: true },
      chapters: [{ id: "legacy", orderIndex: 4, aliases: ["legacy", "free-chapter"] }],
      materials: [
        { id: "open", locked: false, preview: "cover" },
        { id: "locked", locked: true, completed: false },
        { id: "legacy-url", locked: false },
      ],
    });
    if (!("view" in result) || result.view !== "material-list") throw new Error("Missing material list");
    expect(result.materials.map(row => row.preview)).toEqual(["cover", undefined, undefined]);
    expect(JSON.stringify(result)).not.toContain("storage.invalid");
  });

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

  test("advertises canonical and legacy Diktat PDFs only to learners with current download permissions", async () => {
    rows.set(diktatMateri, [{ id: "handbook", title: "Diktat", chapterId: "free-chapter", fileKey: "diktats/private.pdf" }]);
    expect(await detail("handbook")).not.toHaveProperty("material.canDownloadPdf");

    resolveAccess.mockResolvedValueOnce(enrolledAccess);
    const canonical = await detail("handbook");
    expect(canonical).toMatchObject({ view: "material-detail", material: { id: "handbook", group: "diktat", canDownloadPdf: true } });
    expect(JSON.stringify(canonical)).not.toContain("diktats/private.pdf");

    rows.delete(diktatMateri);
    rows.set(diktats, [{ title: "Legacy Diktat", chapterIds: ["free-chapter"], fileUrl: "https://files.ufs.sh/f/private.pdf" }]);
    resolveAccess.mockResolvedValueOnce(enrolledAccess);
    const legacy = await detail("old-handbook");
    expect(legacy).toMatchObject({ view: "material-detail", material: { kind: "pdf", group: "diktat", canDownloadPdf: true } });
    expect(JSON.stringify(legacy)).not.toContain("https://files.ufs.sh");
  });

  test("omits download eligibility for a locked handbook, a text-only Diktat or a general PDF", async () => {
    resolveAccess.mockResolvedValueOnce(enrolledAccess);
    rows.set(diktatMateri, [{ id: "locked", title: "Locked", chapterId: "outside-scope", fileKey: "diktats/locked.pdf" }]);
    expect(await detail("locked")).toMatchObject({ material: { locked: true } });
    resolveAccess.mockResolvedValueOnce(enrolledAccess);
    expect(await detail("locked")).not.toHaveProperty("material.canDownloadPdf");

    resolveAccess.mockResolvedValueOnce(enrolledAccess);
    rows.set(diktatMateri, [{ id: "text", title: "Text", chapterId: "free-chapter", fileKey: null }]);
    expect(await detail("text")).not.toHaveProperty("material.canDownloadPdf");

    resolveAccess.mockResolvedValueOnce(enrolledAccess);
    rows.delete(diktatMateri);
    rows.set(courseMaterials, [{ title: "Course PDF", chapterIds: ["free-chapter"], fileUrl: "diktats/elsewhere.pdf" }]);
    expect(await detail("course-pdf")).not.toHaveProperty("material.canDownloadPdf");
  });
});

test("manual download capability requires both a scoped supported PDF and the web download permission", async () => {
  rows.set(courseMaterials, [{ title: "Course PDF", chapterIds: ["free-chapter"], fileUrl: "courses/legacy-course/materials/notes.pdf" }]);
  const preview = await detail("course-pdf");
  expect(preview).toMatchObject({ material: { nativePdf: true, locked: false } });
  expect(preview).not.toHaveProperty("material.canDownloadPdf");
  resolveAccess.mockResolvedValueOnce(enrolledAccess);
  const enrolled = await detail("course-pdf");
  expect(enrolled).toMatchObject({ material: { nativePdf: true, canDownloadPdf: true } });
  expect(JSON.stringify(enrolled)).not.toContain("notes.pdf");
});
