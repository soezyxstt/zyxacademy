import { afterAll, describe, expect, test, mock } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { PKA_COURSE_ID } from "@/lib/pka-config";

const { client, testDb } = await createPostgresTestDb();
afterAll(async () => { await client.close(); });

// Mock the db module
let queryCounter = 0;
const instrumentedDb = new Proxy(testDb, {
  get(target, prop, receiver) {
    if (prop === "select") {
      return (...args: any[]) => {
        queryCounter++;
        return (target as any).select(...args);
      };
    }
    return Reflect.get(target, prop, receiver);
  },
});

mock.module("@/db", () => ({ db: instrumentedDb }));

const {
  getCourseCatalogStatsMap,
  attachCourseCatalogStats,
} = await import("@/lib/student/course-catalog-stats");

const refHelpers = await import("@/lib/course-utils");

describe("Course Catalog Stats Batch Projection", () => {
  const now = new Date("2026-10-21T00:00:00.000Z");

  test("returns empty map and makes zero queries for empty courses list", async () => {
    queryCounter = 0;
    const statsMap = await getCourseCatalogStatsMap([]);
    expect(statsMap.size).toBe(0);
    expect(queryCounter).toBe(0);

    const attached = await attachCourseCatalogStats([]);
    expect(attached).toHaveLength(0);
    expect(queryCounter).toBe(0);
  });

  test("handles PKA_COURSE_ID with zero counts without querying database", async () => {
    queryCounter = 0;
    const statsMap = await getCourseCatalogStatsMap([{ id: PKA_COURSE_ID }]);
    expect(statsMap.size).toBe(1);
    expect(statsMap.get(PKA_COURSE_ID)).toEqual({
      materialsCount: 0,
      quizzesCount: 0,
      tryoutsCount: 0,
    });
    expect(queryCounter).toBe(0);
  });

  test("preserves exact semantic equivalence with getCourseMaterials, getCourseQuizzes, and getCourseTryouts", async () => {
    // 1. Seed courses
    // Course A: Canonical course mapped to legacy course
    await testDb.insert(schema.courses).values([
      { id: "legacy-course-a", title: "Fisika Dasar IA", category: "TPB" },
      { id: "legacy-course-b", title: "Kimia Dasar IB", category: "TPB" },
      { id: "legacy-course-empty", title: "Empty Course", category: "TPB" },
    ]);

    await testDb.insert(schema.user).values({ id: "fixture-author", name: "Fixture author", email: "fixture@example.test" });
    await testDb.insert(schema.pengguna).values({ id: "fixture-author" });
    await testDb.insert(schema.chapters).values([
      { id: "legacy-ch-kinematika", courseId: "legacy-course-a", title: "Kinematika", orderIndex: 1 },
      { id: "legacy-ch-dinamika", courseId: "legacy-course-a", title: "Dinamika", orderIndex: 2 },
      { id: "legacy-ch-gelombang", courseId: "legacy-course-a", title: "Gelombang", orderIndex: 3 },
    ]);
    await testDb.insert(schema.masterTeachingDocuments).values({
      id: "fixture-mtd", courseId: "legacy-course-a", title: "Source", markdownContent: "Source", createdById: "fixture-author",
    });

    await testDb.insert(schema.mataKuliah).values([
      {
        id: "mk-fisika-a",
        code: "FI1101",
        title: "Fisika Dasar IA",
        status: "active",
        legacyCourseId: "legacy-course-a",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Chapters for Course A
    await testDb.insert(schema.bab).values([
      {
        id: "bab-kinematika",
        mataKuliahId: "mk-fisika-a",
        code: "BAB-1",
        title: "Kinematika",
        orderIndex: 1,
        status: "active",
        legacyChapterId: "legacy-ch-kinematika",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "bab-dinamika",
        mataKuliahId: "mk-fisika-a",
        code: "BAB-2",
        title: "Dinamika",
        orderIndex: 2,
        status: "active",
        legacyChapterId: "legacy-ch-dinamika",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // 2. Seed materials for Course A
    // Canonical published article linked to bab-kinematika
    await testDb.insert(schema.artikel).values([
      {
        contentMarkdown: "Fixture", sourceHash: "fixture-hash", generationHash: "fixture-hash", creatorId: "fixture-author",
        id: "art-kin-1",
        mataKuliahId: "mk-fisika-a",
        babId: "bab-kinematika",
        slug: "art-kinematika-1",
        title: "Konsep Gerak 1D",
        status: "published",
        createdAt: now,
        updatedAt: now,
      },
      // Draft article (should NOT be counted)
      {
        contentMarkdown: "Fixture", sourceHash: "fixture-hash", generationHash: "fixture-hash", creatorId: "fixture-author",
        id: "art-kin-draft",
        mataKuliahId: "mk-fisika-a",
        babId: "bab-kinematika",
        slug: "art-kinematika-draft",
        title: "Draft Article",
        status: "draft",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Canonical published diktat linked to bab-dinamika
    await testDb.insert(schema.diktatMateri).values([
      {
        contentMarkdown: "Fixture", sourceHash: "fixture-hash", generationHash: "fixture-hash", creatorId: "fixture-author",
        id: "diktat-din-1",
        mataKuliahId: "mk-fisika-a",
        babId: "bab-dinamika",
        title: "Diktat Hukum Newton",
        status: "published",
        createdAt: now,
        updatedAt: now,
      },
      // Draft canonical diktat (should NOT be counted)
      {
        contentMarkdown: "Fixture", sourceHash: "fixture-hash", generationHash: "fixture-hash", creatorId: "fixture-author",
        id: "diktat-din-draft",
        mataKuliahId: "mk-fisika-a",
        babId: "bab-dinamika",
        title: "Diktat Draft",
        status: "draft",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Legacy diktat:
    // One overlaps canonical diktat chapter (bab-dinamika / legacy-ch-dinamika) -> should be deduplicated / EXCLUDED
    // One does NOT overlap -> should be COUNTED
    await testDb.insert(schema.diktats).values([
      {
        sourceMtdId: "fixture-mtd", sourceMtdVersion: 1, generationHash: "fixture-hash",
        id: "leg-diktat-overlapping",
        courseId: "legacy-course-a",
        title: "Legacy Diktat Dinamika",
        chapterIds: ["legacy-ch-dinamika"],
        status: "ready",
        createdAt: now,
        updatedAt: now,
      },
      {
        sourceMtdId: "fixture-mtd", sourceMtdVersion: 1, generationHash: "fixture-hash",
        id: "leg-diktat-independent",
        courseId: "legacy-course-a",
        title: "Legacy Diktat Termodinamika",
        chapterIds: ["legacy-ch-termo"],
        status: "ready",
        createdAt: now,
        updatedAt: now,
      },
      // Draft legacy diktat -> should NOT be counted
      {
        sourceMtdId: "fixture-mtd", sourceMtdVersion: 1, generationHash: "fixture-hash",
        id: "leg-diktat-draft",
        courseId: "legacy-course-a",
        title: "Legacy Diktat Draft",
        chapterIds: ["legacy-ch-termo"],
        status: "draft",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // AI material instance:
    // One overlaps canonical article chapter (bab-kinematika / legacy-ch-kinematika) -> should be deduplicated / EXCLUDED
    // One does NOT overlap -> should be COUNTED
    // One has [DRAF] prefix -> should be EXCLUDED
    await testDb.insert(schema.aiMaterialInstances).values([
      {
        sourceType: "markdown", summary: "Fixture material",
        id: "ai-mat-overlapping",
        courseId: "legacy-course-a",
        title: "AI Kinematika",
        chapterIds: ["legacy-ch-kinematika"],
        createdAt: now,
        updatedAt: now,
      },
      {
        sourceType: "markdown", summary: "Fixture material",
        id: "ai-mat-independent",
        courseId: "legacy-course-a",
        title: "AI Optika",
        chapterIds: ["legacy-ch-optika"],
        createdAt: now,
        updatedAt: now,
      },
      {
        sourceType: "markdown", summary: "Fixture material",
        id: "ai-mat-draft",
        courseId: "legacy-course-a",
        title: "[DRAF] AI Relativitas",
        chapterIds: ["legacy-ch-relativitas"],
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Website materials:
    // One in canonical article chapter -> should be deduplicated / EXCLUDED
    // One NOT in canonical article chapter -> should be COUNTED
    // One with status 'draft' -> should NOT be counted
    await testDb.insert(schema.websiteMaterials).values([
      {
        sourceMtdId: "fixture-mtd", sourceMtdVersion: 1, generationHash: "fixture-hash", canonicalMarkdown: "Fixture", structuredContent: {},
        id: "web-mat-overlapping",
        courseId: "legacy-course-a",
        chapterId: "legacy-ch-kinematika",
        title: "Web Kinematika",
        slug: "web-kinematika",
        status: "published",
      },
      {
        sourceMtdId: "fixture-mtd", sourceMtdVersion: 1, generationHash: "fixture-hash", canonicalMarkdown: "Fixture", structuredContent: {},
        id: "web-mat-independent",
        courseId: "legacy-course-a",
        chapterId: "legacy-ch-gelombang",
        title: "Web Gelombang",
        slug: "web-gelombang",
        status: "published",
      },
      {
        sourceMtdId: "fixture-mtd", sourceMtdVersion: 1, generationHash: "fixture-hash", canonicalMarkdown: "Fixture", structuredContent: {},
        id: "web-mat-draft",
        courseId: "legacy-course-a",
        chapterId: "legacy-ch-gelombang",
        title: "Web Draft",
        slug: "web-draft",
        status: "draft",
      },
    ]);

    // 3. Seed quizzes for Course A and Course B
    await testDb.insert(schema.quizTemplates).values([
      {
        category: "daily", selectionRules: {},
        id: "quiz-a-1",
        courseId: "legacy-course-a",
        title: "Kuis 1 Kinematika",
        status: "published",
        createdAt: now,
      },
      {
        category: "daily", selectionRules: {},
        id: "quiz-a-2",
        courseId: "legacy-course-a",
        title: "Kuis 2 Dinamika",
        status: "published",
        createdAt: now,
      },
      {
        category: "daily", selectionRules: {},
        id: "quiz-b-1",
        courseId: "legacy-course-b",
        title: "Kuis Kimia 1",
        status: "published",
        createdAt: now,
      },
    ]);

    // 4. Seed tryouts for Course A and Course B
    await testDb.insert(schema.exams).values([
      {
        id: "exam-a-tryout",
        courseId: "legacy-course-a",
        title: "Tryout Fisika UTS",
        type: "tryout",
        status: "published",
      },
      {
        id: "exam-a-draft",
        courseId: "legacy-course-a",
        title: "Tryout Draft",
        type: "tryout",
        status: "draft",
      },
      {
        id: "exam-a-midterm",
        courseId: "legacy-course-a",
        title: "UTS Fisika",
        type: "midterm",
        status: "published",
      },
      {
        id: "exam-b-tryout-1",
        courseId: "legacy-course-b",
        title: "Tryout Kimia 1",
        type: "tryout",
        status: "published",
      },
      {
        id: "exam-b-tryout-2",
        courseId: "legacy-course-b",
        title: "Tryout Kimia 2",
        type: "tryout",
        status: "published",
      },
    ]);

    const testCourses = [
      {
        id: "legacy-course-a",
        canonicalId: "mk-fisika-a",
        legacyId: "legacy-course-a",
      },
      {
        id: "legacy-course-b",
        canonicalId: null,
        legacyId: "legacy-course-b",
      },
      {
        id: "legacy-course-empty",
        canonicalId: null,
        legacyId: "legacy-course-empty",
      },
      {
        id: PKA_COURSE_ID,
        canonicalId: null,
        legacyId: PKA_COURSE_ID,
      },
    ];

    // Compute via batch projection helper
    const statsMap = await getCourseCatalogStatsMap(testCourses);

    // Reference helper failures must fail this equivalence check.
    {
      for (const course of testCourses) {
        const stats = statsMap.get(course.id);
        expect(stats).toBeDefined();

        if (course.id === PKA_COURSE_ID) {
          expect(stats!.materialsCount).toBe(0);
          expect(stats!.quizzesCount).toBe(0);
          expect(stats!.tryoutsCount).toBe(0);
          continue;
        }

        const [refMaterials, refQuizzes, refTryouts] = await Promise.all([
          refHelpers.getCourseMaterials(course.id),
          refHelpers.getCourseQuizzes(course.id),
          refHelpers.getCourseTryouts(course.id),
        ]);

        expect(stats!.materialsCount).toBe(refMaterials.length);
        expect(stats!.quizzesCount).toBe(refQuizzes.length);
        expect(stats!.tryoutsCount).toBe(refTryouts.length);
      }
    }

    // Verify Course A specific breakdown:
    // canonical articles: 1 (art-kin-1)
    // canonical diktats: 1 (diktat-din-1)
    // legacy ready diktats: 1 (leg-diktat-independent; leg-diktat-overlapping excluded)
    // AI materials: 1 (ai-mat-independent; ai-mat-overlapping and [DRAF] excluded)
    // website materials: 1 (web-mat-independent; web-mat-overlapping excluded)
    // Total materials: 1 + 1 + 1 + 1 + 1 = 5
    const statsA = statsMap.get("legacy-course-a")!;
    expect(statsA.materialsCount).toBe(5);
    expect(statsA.quizzesCount).toBe(2);
    expect(statsA.tryoutsCount).toBe(1);

    // Verify Course B:
    const statsB = statsMap.get("legacy-course-b")!;
    expect(statsB.materialsCount).toBe(0);
    expect(statsB.quizzesCount).toBe(1);
    expect(statsB.tryoutsCount).toBe(2);

    // Verify Empty Course:
    const statsEmpty = statsMap.get("legacy-course-empty")!;
    expect(statsEmpty.materialsCount).toBe(0);
    expect(statsEmpty.quizzesCount).toBe(0);
    expect(statsEmpty.tryoutsCount).toBe(0);
  });

  test("bounded query count independent of course count", async () => {
    // Generate 10 dummy courses
    const dummyCourses = Array.from({ length: 10 }, (_, i) => ({
      id: `course-dummy-${i}`,
      canonicalId: null,
      legacyId: `course-dummy-${i}`,
    }));

    queryCounter = 0;
    await getCourseCatalogStatsMap(dummyCourses.slice(0, 1));
    const singleCourseQueries = queryCounter;
    expect(singleCourseQueries).toBeGreaterThan(0);

    queryCounter = 0;
    const statsMap = await getCourseCatalogStatsMap(dummyCourses);
    expect(statsMap.size).toBe(10);

    expect(queryCounter).toBe(singleCourseQueries);
    expect(queryCounter).toBeLessThanOrEqual(7);

    const largeCatalogue = Array.from({ length: 251 }, (_, i) => ({
      id: `large-${i}`, canonicalId: null, legacyId: `large-${i}`,
    }));
    queryCounter = 0;
    expect((await getCourseCatalogStatsMap(largeCatalogue)).size).toBe(251);
    expect(queryCounter).toBe(singleCourseQueries * 2);
  });
});
