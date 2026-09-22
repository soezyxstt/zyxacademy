import { describe, it, expect, beforeEach } from "bun:test";
import { db } from "@/db";
import {
  courses,
  mataKuliah,
  bab,
  chapters,
  quizTemplates,
} from "@/db/schema";
import { sortQuizTemplatesByChapter } from "@/lib/course-utils";
import { eq } from "drizzle-orm";

describe("sortQuizTemplatesByChapter", () => {
  const TEST_COURSE_ID = "test-course-quiz-sort";
  const TEST_MK_ID = "test-mk-quiz-sort";

  beforeEach(async () => {
    // Cleanup prior test artifacts
    await db.delete(quizTemplates).where(eq(quizTemplates.courseId, TEST_COURSE_ID));
    await db.delete(bab).where(eq(bab.mataKuliahId, TEST_MK_ID));
    await db.delete(chapters).where(eq(chapters.courseId, TEST_COURSE_ID));
    await db.delete(mataKuliah).where(eq(mataKuliah.id, TEST_MK_ID));
    await db.delete(courses).where(eq(courses.id, TEST_COURSE_ID));

    // Setup course and canonical mata_kuliah
    await db.insert(courses).values({
      id: TEST_COURSE_ID,
      title: "Kimia Dasar I",
      category: "TPB",
    });

    await db.insert(mataKuliah).values({
      id: TEST_MK_ID,
      code: "KI1101-TEST",
      title: "Kimia Dasar I",
      legacyCourseId: TEST_COURSE_ID,
      status: "active",
    });

    // Setup chapters in pedagogical order
    await db.insert(bab).values([
      {
        id: "bab-1-unsur",
        mataKuliahId: TEST_MK_ID,
        code: "B1",
        title: "Unsur, Senyawa, dan Tabel Periodik",
        orderIndex: 1,
        status: "active",
      },
      {
        id: "bab-2-stoikio",
        mataKuliahId: TEST_MK_ID,
        code: "B2",
        title: "Stoikiometri Larutan",
        orderIndex: 2,
        status: "active",
      },
      {
        id: "bab-3-redoks",
        mataKuliahId: TEST_MK_ID,
        code: "B3",
        title: "Redoks dan Stoikiometri",
        orderIndex: 3,
        status: "active",
      },
      {
        id: "bab-4-energi",
        mataKuliahId: TEST_MK_ID,
        code: "B4",
        title: "Energi dan Perubahannya",
        orderIndex: 4,
        status: "active",
      },
      {
        id: "bab-5-atom",
        mataKuliahId: TEST_MK_ID,
        code: "B5",
        title: "Struktur Atom",
        orderIndex: 5,
        status: "active",
      },
    ]);
  });

  it("sorts quizzes matching the user's screenshot into ascending chapter and quiz order", async () => {
    // Quizzes in the exact reversed order shown in user's screenshot
    const inputQuizzes = [
      { id: "q1", title: "Kuis 2 - Struktur Atom", createdAt: new Date("2026-09-22T10:00:00Z") },
      { id: "q2", title: "Kuis 1 - Struktur Atom", createdAt: new Date("2026-09-22T09:00:00Z") },
      { id: "q3", title: "Kuis 2 - Energi dan Perubahannya", createdAt: new Date("2026-09-22T08:00:00Z") },
      { id: "q4", title: "Kuis 1 - Energi dan Perubahannya", createdAt: new Date("2026-09-22T07:00:00Z") },
      { id: "q5", title: "Kuis 2 - Redoks dan Stoikiometri", createdAt: new Date("2026-09-22T06:00:00Z") },
      { id: "q6", title: "Kuis 1 - Redoks dan Stoikiometri", createdAt: new Date("2026-09-22T05:00:00Z") },
      { id: "q7", title: "Kuis 2 - Stoikiometri Larutan", createdAt: new Date("2026-09-22T04:00:00Z") },
      { id: "q8", title: "Kuis 1 - Unsur Senyawa dan Tabel Periodik", createdAt: new Date("2026-09-22T03:00:00Z") },
    ];

    const sorted = await sortQuizTemplatesByChapter(inputQuizzes, TEST_COURSE_ID);
    const sortedTitles = sorted.map((q) => q.title);

    expect(sortedTitles).toEqual([
      "Kuis 1 - Unsur Senyawa dan Tabel Periodik",
      "Kuis 2 - Stoikiometri Larutan",
      "Kuis 1 - Redoks dan Stoikiometri",
      "Kuis 2 - Redoks dan Stoikiometri",
      "Kuis 1 - Energi dan Perubahannya",
      "Kuis 2 - Energi dan Perubahannya",
      "Kuis 1 - Struktur Atom",
      "Kuis 2 - Struktur Atom",
    ]);
  });

  it("prioritizes explicit selectionRules.chapterId when available", async () => {
    const inputQuizzes = [
      {
        id: "q-atom",
        title: "Kuis Kimia Spesial",
        selectionRules: { chapterId: "bab-5-atom" },
        createdAt: new Date("2026-09-22T10:00:00Z"),
      },
      {
        id: "q-unsur",
        title: "Kuis Pembuka",
        selectionRules: { chapterId: "bab-1-unsur" },
        createdAt: new Date("2026-09-22T11:00:00Z"),
      },
    ];

    const sorted = await sortQuizTemplatesByChapter(inputQuizzes, TEST_COURSE_ID);
    expect(sorted[0].id).toBe("q-unsur"); // Bab 1 comes before Bab 5
    expect(sorted[1].id).toBe("q-atom");
  });

  it("places unscoped general quizzes at the end", async () => {
    const inputQuizzes = [
      {
        id: "q-tryout",
        title: "Simulasi Ujian Akhir Semester",
        selectionRules: {},
        createdAt: new Date("2026-09-22T01:00:00Z"),
      },
      {
        id: "q-unsur",
        title: "Kuis 1 - Unsur Senyawa dan Tabel Periodik",
        selectionRules: {},
        createdAt: new Date("2026-09-22T02:00:00Z"),
      },
    ];

    const sorted = await sortQuizTemplatesByChapter(inputQuizzes, TEST_COURSE_ID);
    expect(sorted[0].id).toBe("q-unsur");
    expect(sorted[1].id).toBe("q-tryout");
  });

  it("sorts multiple quizzes within the same chapter by numeric quiz number", async () => {
    const inputQuizzes = [
      { id: "q10", title: "Kuis 10 - Struktur Atom", createdAt: new Date("2026-09-22T05:00:00Z") },
      { id: "q2", title: "Kuis 2 - Struktur Atom", createdAt: new Date("2026-09-22T06:00:00Z") },
      { id: "q1", title: "Kuis 1 - Struktur Atom", createdAt: new Date("2026-09-22T07:00:00Z") },
    ];

    const sorted = await sortQuizTemplatesByChapter(inputQuizzes, TEST_COURSE_ID);
    expect(sorted.map((q) => q.title)).toEqual([
      "Kuis 1 - Struktur Atom",
      "Kuis 2 - Struktur Atom",
      "Kuis 10 - Struktur Atom",
    ]);
  });
});
