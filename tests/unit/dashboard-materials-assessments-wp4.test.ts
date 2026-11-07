import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../../db/schema";
import type { StudentEnrollmentRecord } from "../../lib/student/course-catalog";

const tables = [
  schema.courses,
  schema.mataKuliah,
  schema.bab,
  schema.chapters,
  schema.artikel,
  schema.bagianArtikel,
  schema.kemajuanBacaArtikel,
  schema.diktatMateri,
  schema.diktats,
  schema.aiMaterialInstances,
  schema.websiteMaterials,
  schema.progress,
  schema.studentMaterialProgress,
  schema.quizTemplates,
  schema.cakupanAsesmen,
  schema.soal,
  schema.exams,
  schema.submissions,
];

const client = new PGlite();
const queries: string[] = [];
const db = drizzle(client, {
  logger: {
    logQuery(query) {
      if (/^select/i.test(query)) queries.push(query);
    },
  },
});

let currentAuthUser: { id: string; role?: string } | null = { id: "student-1", role: "student" };
const courseAccessMap = new Map<string, any>();

mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/db", () => ({ db }));
mock.module("@/lib/auth-session", () => ({
  getAuthSession: async () => (currentAuthUser ? { user: currentAuthUser } : null),
  getAuthUser: async () => currentAuthUser,
  requireAuthUser: async () => {
    if (!currentAuthUser?.id) throw new Error("Unauthorized");
    return currentAuthUser;
  },
}));
const actualCourseAccess = await import("../../lib/student/course-access");
mock.module("@/lib/student/course-access", () => ({
  ...actualCourseAccess,
  hasChapterScopeWithin: (
    chapterIds: readonly (string | null | undefined)[] | null | undefined,
    freeChapterIds: readonly string[],
  ) => {
    if (!chapterIds || chapterIds.length === 0) return false;
    const allowed = new Set(freeChapterIds);
    const cleaned = chapterIds.filter((id): id is string => Boolean(id && id.trim()));
    return cleaned.length > 0 && cleaned.some((id) => allowed.has(id));
  },
  resolveCourseAccess: async ({ courseId, userId }: { courseId: string; userId?: string }) => {
    const entry = courseAccessMap.get(`${userId ?? ""}:${courseId}`) ?? courseAccessMap.get(courseId);
    if (!entry) {
      return {
        isAuthenticated: Boolean(userId),
        hasCourseAccess: false,
        tier: "anonymous",
        courseId,
        canonicalCourseId: null,
        legacyCourseId: courseId,
        isEnrolled: false,
        freeChapterIds: [],
        capabilities: { canDownloadDiktat: false },
      };
    }
    return entry;
  },
}));

const {
  getCourseMaterials,
  getCourseQuizzes,
  getCourseTryouts,
  assembleCourseMaterialRows,
  sortQuizTemplatesByChapter,
} = await import("../../lib/course-utils");
const { getDashboardCourseMaterialsBatch } = await import("../../lib/student/dashboard-materials");
const {
  getDashboardCourseExamsBatch,
  getDashboardStudentSubmissionSummaries,
} = await import("../../lib/student/dashboard-read-model");
const {
  loadPrimaryLearningData,
  loadAvailableAssessmentsData,
} = await import("../../app/(student)/dashboard/dashboard-sections");

const now = new Date("2026-10-01T00:00:00.000Z");

async function insert(table: any, values: Record<string, unknown>) {
  const entries = Object.entries(values).map(([key, value]) => [table[key].name, value] as const);
  await client.query(
    `insert into "${getTableConfig(table).name}" (${entries.map(([name]) => `"${name}"`).join(",")}) values (${entries.map((_, i) => `$${i + 1}`).join(",")})`,
    entries.map(([, value]) => (value !== null && typeof value === "object" && !(value instanceof Date) ? JSON.stringify(value) : value)),
  );
}

beforeAll(async () => {
  for (const table of tables) {
    const config = getTableConfig(table);
    await client.exec(
      `create table "${config.name}" (${config.columns.map((column) => `"${column.name}" ${column.getSQLType()}`).join(", ")})`,
    );
  }
});

beforeEach(async () => {
  for (const table of tables) {
    await client.exec(`delete from "${getTableConfig(table).name}"`);
  }
  queries.length = 0;
  courseAccessMap.clear();
  currentAuthUser = { id: "student-1", role: "student" };
});

afterAll(async () => {
  await client.close();
});

async function seedFiveCourseFixture() {
  const courseIds = ["c1", "c2", "c3", "c4", "c5"];
  const enrollments: StudentEnrollmentRecord[] = [];

  for (let idx = 0; idx < courseIds.length; idx++) {
    const id = courseIds[idx];
    const mkId = idx < 4 ? `mk-${id}` : null;
    await insert(schema.courses, {
      id,
      title: `Course ${id.toUpperCase()}`,
      category: "TPB",
      description: `Desc ${id}`,
    });
    if (mkId) {
      await insert(schema.mataKuliah, {
        id: mkId,
        code: `CODE-${id}`,
        title: `Course ${id.toUpperCase()}`,
        status: "active",
        legacyCourseId: id,
        createdAt: now,
        updatedAt: now,
      });
    }
    enrollments.push({
      id,
      canonicalId: mkId,
      legacyId: id,
      title: `Course ${id.toUpperCase()}`,
      category: "TPB",
      description: `Desc ${id}`,
      enrolledAt: now,
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    });
    courseAccessMap.set(id, {
      isAuthenticated: true,
      hasCourseAccess: true,
      tier: "enrolled",
      courseId: id,
      canonicalCourseId: mkId,
      legacyCourseId: id,
      isEnrolled: true,
      freeChapterIds: [`bab-${id}-1`, `ch-${id}-1`],
      capabilities: { canDownloadDiktat: idx % 2 === 0 },
    });
  }

  // Course c1: full mix with canonical + legacy chapter collisions, reading minutes, diktats, AI, web
  await insert(schema.chapters, { id: "ch-c1-1", courseId: "c1", title: "Kinematika", orderIndex: 1, status: "published" });
  await insert(schema.chapters, { id: "ch-c1-2", courseId: "c1", title: "Dinamika", orderIndex: 2, status: "published" });
  await insert(schema.chapters, { id: "ch-c1-3", courseId: "c1", title: "Gelombang", orderIndex: 3, status: "published" });
  await insert(schema.bab, {
    id: "bab-c1-1",
    mataKuliahId: "mk-c1",
    code: "B1",
    title: "Kinematika",
    orderIndex: 1,
    status: "active",
    legacyChapterId: "ch-c1-1",
    createdAt: now,
    updatedAt: now,
  });
  await insert(schema.bab, {
    id: "bab-c1-2",
    mataKuliahId: "mk-c1",
    code: "B2",
    title: "Dinamika",
    orderIndex: 2,
    status: "active",
    legacyChapterId: "ch-c1-2",
    createdAt: now,
    updatedAt: now,
  });

  await insert(schema.artikel, {
    id: "art-c1-1",
    mataKuliahId: "mk-c1",
    babId: "bab-c1-1",
    slug: "art-c1-1",
    title: "Artikel Kinematika",
    contentMarkdown: "LARGE_MARKDOWN_CONTENT_SHOULD_NOT_BE_SELECTED",
    structureStatus: "structured",
    version: 2,
    status: "published",
    sourceHash: "h",
    generationHash: "g",
    creatorId: "u",
    createdAt: now,
    updatedAt: now,
  });
  await insert(schema.bagianArtikel, {
    id: "sec-c1-1a",
    artikelId: "art-c1-1",
    sectionKey: "s1",
    sectionKind: "overview",
    slug: "s1",
    title: "Sec 1",
    learningObjective: "LO 1",
    orderIndex: 0,
    estimatedReadingMinutes: 4,
    version: 2,
    status: "published",
    createdAt: now,
    updatedAt: now,
  });
  await insert(schema.bagianArtikel, {
    id: "sec-c1-1b",
    artikelId: "art-c1-1",
    sectionKey: "s2",
    sectionKind: "topic",
    slug: "s2",
    title: "Sec 2",
    learningObjective: "LO 2",
    orderIndex: 1,
    estimatedReadingMinutes: 6,
    version: 2,
    status: "published",
    createdAt: now,
    updatedAt: now,
  });
  // Old version section (should be ignored)
  await insert(schema.bagianArtikel, {
    id: "sec-c1-old",
    artikelId: "art-c1-1",
    sectionKey: "s1",
    sectionKind: "overview",
    slug: "s1",
    title: "Old Sec",
    learningObjective: "Old",
    orderIndex: 0,
    estimatedReadingMinutes: 99,
    version: 1,
    status: "published",
    createdAt: now,
    updatedAt: now,
  });
  await insert(schema.kemajuanBacaArtikel, {
    id: "prog-art-c1-1",
    penggunaId: "student-1",
    artikelId: "art-c1-1",
    artikelVersion: 2,
    bagianArtikelId: "sec-c1-1a",
    maxReadPercent: 80,
    timeSpentSeconds: 120,
    createdAt: now,
    updatedAt: now,
  });

  await insert(schema.diktatMateri, {
    id: "cdik-c1-2",
    mataKuliahId: "mk-c1",
    babId: "bab-c1-2",
    title: "Diktat Kanonikal Dinamika",
    contentMarkdown: "LARGE_DIKTAT_MARKDOWN",
    fileKey: "courses/c1/diktat.pdf",
    version: 1,
    status: "published",
    sourceHash: "h",
    generationHash: "g",
    creatorId: "u",
    createdAt: now,
    updatedAt: now,
  });

  // Legacy diktat colliding with bab-c1-2 (via legacyChapterId ch-c1-2) -> suppressed
  await insert(schema.diktats, {
    id: "ldik-c1-collide",
    courseId: "c1",
    title: "Legacy Diktat Collide",
    fileUrl: "https://example.com/collide.pdf",
    chapterIds: ["ch-c1-2"],
    status: "ready",
    sourceMtdId: "m",
    sourceMtdVersion: 1,
    generationHash: "g",
    createdAt: now,
    updatedAt: now,
  });
  // Legacy diktat on ch-c1-3 -> kept
  await insert(schema.diktats, {
    id: "ldik-c1-keep",
    courseId: "c1",
    title: "Legacy Diktat Gelombang",
    fileUrl: "https://example.com/keep.pdf",
    chapterIds: ["  ch-c1-3  ", ""],
    status: "ready",
    sourceMtdId: "m",
    sourceMtdVersion: 1,
    generationHash: "g",
    createdAt: now,
    updatedAt: now,
  });

  // AI material colliding with art-c1-1 (ch-c1-1) -> suppressed
  await insert(schema.aiMaterialInstances, {
    id: "ai-c1-collide",
    courseId: "c1",
    title: "AI Collide Kinematika",
    chapterIds: ["ch-c1-1"],
    sourceType: "markdown",
    summary: "s",
    createdAt: now,
    updatedAt: now,
  });
  // AI material on ch-c1-3 -> kept
  await insert(schema.aiMaterialInstances, {
    id: "ai-c1-keep",
    courseId: "c1",
    title: "AI Gelombang",
    chapterIds: ["ch-c1-3"],
    sourceType: "markdown",
    summary: "s",
    createdAt: now,
    updatedAt: now,
  });
  // AI draft -> excluded
  await insert(schema.aiMaterialInstances, {
    id: "ai-c1-draft",
    courseId: "c1",
    title: "[DRAF] AI Draft",
    chapterIds: ["ch-c1-3"],
    sourceType: "markdown",
    summary: "s",
    createdAt: now,
    updatedAt: now,
  });

  // Web material colliding with art-c1-1 (ch-c1-1) -> suppressed
  await insert(schema.websiteMaterials, {
    id: "web-c1-collide",
    courseId: "c1",
    chapterId: "ch-c1-1",
    title: "Web Collide",
    slug: "web-collide",
    status: "published",
    sourceMtdId: "m",
    sourceMtdVersion: 1,
    generationHash: "g",
    canonicalMarkdown: "LARGE_WEB_MARKDOWN",
    structuredContent: {},
  });
  // Web material on ch-c1-2 -> kept (only diktat is on bab-c1-2, not canonical article)
  await insert(schema.websiteMaterials, {
    id: "web-c1-keep",
    courseId: "c1",
    chapterId: "ch-c1-2",
    title: "Web Dinamika",
    slug: "web-keep",
    status: "published",
    sourceMtdId: "m",
    sourceMtdVersion: 1,
    generationHash: "g",
    canonicalMarkdown: "LARGE_WEB_MARKDOWN",
    structuredContent: {},
  });

  // Course c2: canonical article completed via progress table
  await insert(schema.bab, {
    id: "bab-c2-1",
    mataKuliahId: "mk-c2",
    code: "B1",
    title: "Aljabar",
    orderIndex: 1,
    status: "active",
    legacyChapterId: null,
    createdAt: now,
    updatedAt: now,
  });
  await insert(schema.artikel, {
    id: "art-c2-1",
    mataKuliahId: "mk-c2",
    babId: "bab-c2-1",
    slug: "art-c2-1",
    title: "Artikel Aljabar",
    contentMarkdown: "MD",
    structureStatus: "structured",
    version: 1,
    status: "published",
    sourceHash: "h",
    generationHash: "g",
    creatorId: "u",
    createdAt: now,
    updatedAt: now,
  });
  await insert(schema.progress, {
    id: "p-1",
    userId: "student-1",
    materialId: "art-c2-1",
    status: "completed",
    completedAt: now,
  });
  await insert(schema.progress, {
    id: "p-2",
    userId: "student-1",
    materialId: "web-c1-keep",
    status: "completed",
    completedAt: now,
  });

  // Course c3: empty course (no materials, no quizzes)
  // Course c4: canonical chapters + quizzes with cakupan, fixedQuestionIds, title match, Bab X
  await insert(schema.bab, {
    id: "bab-c4-1",
    mataKuliahId: "mk-c4",
    code: "B1",
    title: "Termodinamika Dasar",
    orderIndex: 1,
    status: "active",
    legacyChapterId: "ch-c4-1",
    createdAt: now,
    updatedAt: now,
  });
  await insert(schema.bab, {
    id: "bab-c4-2",
    mataKuliahId: "mk-c4",
    code: "B2",
    title: "Kesetimbangan Kimia",
    orderIndex: 2,
    status: "active",
    legacyChapterId: "ch-c4-2",
    createdAt: now,
    updatedAt: now,
  });
  await insert(schema.bab, {
    id: "bab-c4-3",
    mataKuliahId: "mk-c4",
    code: "B3",
    title: "Elektrokimia Lanjut",
    orderIndex: 3,
    status: "active",
    legacyChapterId: "ch-c4-3",
    createdAt: now,
    updatedAt: now,
  });
  await insert(schema.soal, {
    id: "soal-c4-2",
    mataKuliahId: "mk-c4",
    babId: "bab-c4-2",
    questionType: "multiple_choice",
    difficulty: "medium",
    prompt: "Q",
    optionsSnapshot: [],
    cognitiveLevel: "understand",
    reasoningPattern: "reason",
    status: "published",
    version: 1,
    generationHash: "g",
    creatorId: "u",
    createdAt: now,
    updatedAt: now,
  });
  await insert(schema.quizTemplates, {
    id: "q-c4-unscoped",
    courseId: "c4",
    title: "Simulasi Umum",
    category: "daily",
    visibility: "paid",
    status: "published",
    timeLimitSeconds: 1200,
    maxAttempts: 2,
    selectionRules: {},
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: now,
  });
  await insert(schema.quizTemplates, {
    id: "q-c4-bab3-title",
    courseId: "c4",
    title: "Kuis 2 - Elektrokimia Lanjut",
    category: "chapter",
    visibility: "free",
    status: "published",
    timeLimitSeconds: 900,
    maxAttempts: 3,
    selectionRules: { chapterId: "bab-c4-3", assessmentType: "quiz" },
    createdAt: new Date("2026-09-02T00:00:00Z"),
    updatedAt: now,
  });
  await insert(schema.quizTemplates, {
    id: "q-c4-bab2-soal",
    courseId: "c4",
    title: "Kuis Soal Terikat",
    category: "daily",
    visibility: "free",
    status: "published",
    timeLimitSeconds: 600,
    maxAttempts: 3,
    selectionRules: { fixedQuestionIds: ["soal-c4-2"], chapterId: "bab-c4-2", assessmentType: "quiz" },
    createdAt: new Date("2026-09-03T00:00:00Z"),
    updatedAt: now,
  });
  await insert(schema.quizTemplates, {
    id: "q-c4-bab1-cakupan",
    courseId: "c4",
    title: "Kuis Cakupan Langsung",
    category: "daily",
    visibility: "free",
    status: "published",
    timeLimitSeconds: 900,
    maxAttempts: 3,
    selectionRules: { chapterId: "bab-c4-1", assessmentType: "quiz" },
    createdAt: new Date("2026-09-04T00:00:00Z"),
    updatedAt: now,
  });
  await insert(schema.cakupanAsesmen, {
    id: "cak-1",
    asesmenId: "q-c4-bab1-cakupan",
    babId: "bab-c4-1",
    orderIndex: 1,
    createdAt: now,
  });

  // Course c5: legacy-only chapters + tryouts + submissions
  await insert(schema.chapters, { id: "ch-c5-1", courseId: "c5", title: "Vektor", orderIndex: 1, status: "published" });
  await insert(schema.chapters, { id: "ch-c5-2", courseId: "c5", title: "Matriks", orderIndex: 2, status: "published" });
  await insert(schema.quizTemplates, {
    id: "q-c5-bab2",
    courseId: "c5",
    title: "Latihan Bab 2",
    category: "weekly",
    visibility: "free",
    status: "published",
    selectionRules: { chapterId: "ch-c5-2", assessmentType: "quiz" },
    createdAt: new Date("2026-09-05T00:00:00Z"),
    updatedAt: now,
  });
  await insert(schema.quizTemplates, {
    id: "q-c5-bab1",
    courseId: "c5",
    title: "Latihan Bab 1",
    category: "weekly",
    visibility: "free",
    status: "published",
    selectionRules: { chapterId: "ch-c5-1", assessmentType: "quiz" },
    createdAt: new Date("2026-09-06T00:00:00Z"),
    updatedAt: now,
  });
  await insert(schema.exams, {
    id: "tryout-c5-pending",
    courseId: "c5",
    title: "Tryout UTS Pending Review",
    type: "tryout",
    status: "published",
    settings: { timeLimitMinutes: 120, maxAttempts: 1 },
    createdAt: now,
  });
  await insert(schema.exams, {
    id: "tryout-c5-graded",
    courseId: "c5",
    title: "Tryout UAS Graded",
    type: "tryout",
    status: "published",
    settings: { timeLimitMinutes: 120, maxAttempts: 1 },
    createdAt: now,
  });

  await insert(schema.submissions, {
    id: "sub-pending",
    userId: "student-1",
    examId: "tryout-c5-pending",
    status: "pending_review",
    answersSnapshot: { huge: "SNAPSHOT_PAYLOAD_MUST_NOT_BE_FETCHED" },
    questionsSnapshot: [{ stem: "HUGE_QUESTION_SNAPSHOT" }],
    submittedAt: now,
  });
  await insert(schema.submissions, {
    id: "sub-graded",
    userId: "student-1",
    examId: "tryout-c5-graded",
    status: "graded",
    answersSnapshot: { huge: "SNAPSHOT_PAYLOAD_MUST_NOT_BE_FETCHED" },
    questionsSnapshot: [{ stem: "HUGE_QUESTION_SNAPSHOT" }],
    submittedAt: now,
  });

  return { courseIds, enrollments };
}

describe("WP4 dashboard materials and assessments batch parity", () => {
  test("matches old per-course getCourseMaterials across 5 courses (counts, order, chapter collisions, empty, progress, and Free gating)", async () => {
    const { courseIds } = await seedFiveCourseFixture();

    // 1. Default enrolled dashboard call (no studentId)
    queries.length = 0;
    const oldUnscoped = await Promise.all(courseIds.map((id) => getCourseMaterials(id)));
    const oldUnscopedQueries = queries.length;

    queries.length = 0;
    const batchUnscoped = await getDashboardCourseMaterialsBatch(courseIds);
    const batchUnscopedQueries = queries.length;

    expect(batchUnscoped).toEqual(
      courseIds.map((courseId, idx) => ({
        courseId,
        materials: oldUnscoped[idx],
      })),
    );
    expect(batchUnscopedQueries).toBeLessThanOrEqual(22);
    expect(batchUnscopedQueries).toBeLessThan(oldUnscopedQueries);

    // Check order in c1: canonicalArticle, canonicalDiktat, legacyDiktat, AI, web
    const c1Materials = batchUnscoped.find((entry) => entry.courseId === "c1")!.materials;
    expect(c1Materials.map((m) => m.id)).toEqual([
      "art-c1-1",
      "cdik-c1-2",
      "ldik-c1-keep",
      "ai-c1-keep",
      "web-c1-keep",
    ]);
    expect(c1Materials[0] && "fileSize" in c1Materials[0] ? c1Materials[0].fileSize : undefined).toBe("10 menit baca");

    // Verify no large content projections in batch SQL
    for (const q of queries) {
      const selectClause = q.split(/\sfrom\s/i)[0] ?? "";
      expect(selectClause).not.toMatch(/content_markdown|canonical_markdown|structured_content|learning_objective/i);
    }

    // 2. Authenticated studentId call (with reading progress & completed progress table)
    queries.length = 0;
    const oldStudent = await Promise.all(courseIds.map((id) => getCourseMaterials(id, "student-1")));
    const oldStudentQueries = queries.length;

    queries.length = 0;
    const batchStudent = await getDashboardCourseMaterialsBatch(courseIds, "student-1");
    const batchStudentQueries = queries.length;

    expect(batchStudent).toEqual(
      courseIds.map((courseId, idx) => ({
        courseId,
        materials: oldStudent[idx],
      })),
    );
    expect(batchStudentQueries).toBeLessThanOrEqual(24);
    expect(batchStudentQueries).toBeLessThan(oldStudentQueries);

    const c1StudentArt = batchStudent[0]?.materials[0];
    expect(c1StudentArt && "completionPercent" in c1StudentArt ? c1StudentArt.completionPercent : undefined).toBe(40);
    expect(c1StudentArt?.completed).toBe(false);
    const c2StudentArt = batchStudent[1]?.materials[0];
    expect(c2StudentArt?.completed).toBe(true);
    expect(c2StudentArt && "completionPercent" in c2StudentArt ? c2StudentArt.completionPercent : undefined).toBe(100);

    // 3. Free tier filtering and denied course access
    courseAccessMap.set("c1", {
      isAuthenticated: true,
      hasCourseAccess: true,
      tier: "free",
      courseId: "c1",
      canonicalCourseId: "mk-c1",
      legacyCourseId: "c1",
      isEnrolled: false,
      freeChapterIds: ["bab-c1-1", "ch-c1-1"],
      capabilities: { canDownloadDiktat: false },
    });
    courseAccessMap.delete("c2"); // denied

    const oldFree = await Promise.all(courseIds.map((id) => getCourseMaterials(id, "student-1")));
    const batchFree = await getDashboardCourseMaterialsBatch(courseIds, "student-1");
    expect(batchFree).toEqual(
      courseIds.map((courseId, idx) => ({
        courseId,
        materials: oldFree[idx],
      })),
    );
    expect(batchFree[0]?.materials.map((m) => m.id)).toEqual(["art-c1-1"]);
    expect(batchFree[1]?.materials).toEqual([]);
  });

  test("matches old per-course getCourseQuizzes and getCourseTryouts across 5 courses and enforces scoped submission summaries", async () => {
    const { courseIds, enrollments } = await seedFiveCourseFixture();

    queries.length = 0;
    const oldExams = await Promise.all(
      courseIds.map(async (courseId) => {
        const [quizzes, tryouts] = await Promise.all([
          getCourseQuizzes(courseId),
          getCourseTryouts(courseId),
        ]);
        return { courseId, quizzes, tryouts, exams: [...quizzes, ...tryouts] };
      }),
    );
    const oldExamQueries = queries.length;

    queries.length = 0;
    const batchExams = await getDashboardCourseExamsBatch(courseIds);
    const batchExamQueries = queries.length;

    expect(batchExams).toEqual(oldExams);
    expect(batchExamQueries).toBeLessThanOrEqual(16);
    expect(batchExamQueries).toBeLessThan(oldExamQueries);

    // Verify quiz sorting in c4 and c5
    expect(batchExams.find((e) => e.courseId === "c4")?.quizzes.map((q) => q.id)).toEqual([
      "q-c4-bab1-cakupan",
      "q-c4-bab2-soal",
      "q-c4-bab3-title",
      "q-c4-unscoped",
    ]);
    expect(batchExams.find((e) => e.courseId === "c5")?.quizzes.map((q) => q.id)).toEqual([
      "q-c5-bab1",
      "q-c5-bab2",
    ]);

    // Verify Free tier quiz filtering in batch vs old
    courseAccessMap.set("c4", {
      isAuthenticated: true,
      hasCourseAccess: true,
      tier: "free",
      courseId: "c4",
      canonicalCourseId: "mk-c4",
      legacyCourseId: "c4",
      isEnrolled: false,
      freeChapterIds: ["bab-c4-1", "bab-c4-2"],
      capabilities: { canDownloadDiktat: false },
    });
    const oldFreeQuizzes = await Promise.all(courseIds.map((id) => getCourseQuizzes(id, "student-1")));
    const batchFreeExams = await getDashboardCourseExamsBatch(courseIds, "student-1");
    expect(batchFreeExams.map((e) => e.quizzes)).toEqual(oldFreeQuizzes);
    expect(batchFreeExams.find((e) => e.courseId === "c4")?.quizzes.map((q) => q.id)).toEqual([
      "q-c4-bab1-cakupan",
      "q-c4-bab2-soal",
    ]);

    // Verify submission summaries projection and pending_review preservation
    queries.length = 0;
    const available = await loadAvailableAssessmentsData(enrollments);
    const subQueries = queries.filter((q) => q.includes('"submissions"'));
    expect(subQueries).toHaveLength(1);
    expect(subQueries[0]?.split(/\sfrom\s/i)[0]).not.toMatch(/answers_snapshot|questions_snapshot|teacher_notes/i);

    // tryout-c5-graded is excluded; tryout-c5-pending is kept because status === "pending_review"
    const c5AvailableIds = available.filter((a) => a.courseId === "c5").map((a) => a.id);
    expect(c5AvailableIds).toEqual(["q-c5-bab1", "q-c5-bab2", "tryout-c5-pending"]);

    // Verify requireAuthUser guard on getDashboardStudentSubmissionSummaries
    currentAuthUser = null;
    await expect(getDashboardStudentSubmissionSummaries()).rejects.toThrow("Unauthorized");
  });

  test("wires loadPrimaryLearningData to batch materials by default while preserving progress and in-progress merging", async () => {
    const { enrollments } = await seedFiveCourseFixture();
    await insert(schema.studentMaterialProgress, {
      id: "smp-1",
      studentId: "student-1",
      materialId: "web-c1-keep",
      completionPercent: 55,
      lastSectionId: "sec-dinamika-2",
      updatedAt: now,
    });

    queries.length = 0;
    const primary = await loadPrimaryLearningData("student-1", enrollments, {
      getMaterialsProgress: async () => [
        { id: "p1", userId: "student-1", materialId: "art-c2-1", status: "completed", completedAt: now },
      ],
      getNextConceptsForCourses: async () => ({ c1: "Gerak Lurus" }),
    });

    expect(primary.completedIds.has("art-c2-1")).toBe(true);
    expect(primary.materialsByCourseId.get("c1")?.map((m) => m.id)).toEqual([
      "art-c1-1",
      "cdik-c1-2",
      "ldik-c1-keep",
      "ai-c1-keep",
      "web-c1-keep",
    ]);
    expect(primary.inProgressDocuments.map((d) => [d?.id, d?.completionPercent, d?.lastSectionId])).toEqual([
      ["web-c1-keep", 55, "sec-dinamika-2"],
    ]);
    expect(primary.nextConcepts.c1).toBe("Gerak Lurus");
  });

  test("handles empty course arrays and an unscoped quiz without errors", async () => {
    expect(await getDashboardCourseMaterialsBatch([])).toEqual([]);
    expect(await getDashboardCourseExamsBatch([])).toEqual([]);
    expect(
      assembleCourseMaterialRows({
        courseId: "empty",
        canonicalArticles: [],
        canonicalDiktats: [],
        courseDiktats: [],
        dbMaterials: [],
        webMaterials: [],
        completedSet: new Set(),
        studentAccess: null,
      }),
    ).toEqual([]);
    expect(await sortQuizTemplatesByChapter([{ id: "single", title: "Kuis 1" }], "empty")).toEqual([
      { id: "single", title: "Kuis 1" },
    ]);
  });
});
