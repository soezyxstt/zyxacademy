"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  courses,
  chapters,
  mataKuliah,
  bab,
  sumberMateri,
  courseMaterials,
  quizTemplates,
  studentQuizAttempts,
  quizAiInsights,
  aiQuestionBank,
  artikel,
  diktatMateri,
  websiteMaterials,
} from "@/db/schema";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { eq, asc, desc, inArray, and, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { storage } from "@/lib/storage";
import { isSafeKey, joinKey, slugifySegment } from "@/lib/storage/keys";
import { inngest } from "@/lib/inngest";
import {
  isValidSubcategory,
  type CourseMaterialCategory,
  type CourseMaterialSubcategory,
} from "@/lib/course-materials";
import {
  archiveChapterWithLegacyDeletion,
  archiveCourseWithLegacyDeletion,
  reorderChaptersWithCanonicalProjection,
  saveChapterWithCanonicalProjection,
  saveCourseWithCanonicalProjection,
} from "@/lib/academic/course-canonical-sync";

export async function getCourses() {
  await assertAdmin();
  const canonicalCourses = await db
    .select()
    .from(mataKuliah)
    .where(eq(mataKuliah.status, "active"))
    .orderBy(asc(mataKuliah.title));

  const legacyList = await db.select().from(courses);
  const legacyMap = new Map(legacyList.map((c) => [c.id, c]));

  if (canonicalCourses.length > 0) {
    return canonicalCourses.map((mk) => {
      const legacy = legacyMap.get(mk.legacyCourseId ?? "") || legacyMap.get(mk.id);
      return {
        id: mk.id,
        title: mk.title,
        category: legacy?.category ?? "Umum",
        description: legacy?.description ?? null,
        status: mk.status,
        createdAt: mk.createdAt,
        updatedAt: mk.updatedAt,
      };
    });
  }

  return db.select().from(courses).orderBy(asc(courses.title));
}

export async function getCoursesWithStats() {
  await assertAdmin();

  const [canonicalCourses, allBab, allMaterials, allQuizzes, legacyList] = await Promise.all([
    db.select().from(mataKuliah).where(eq(mataKuliah.status, "active")).orderBy(asc(mataKuliah.title)),
    db.select({ courseId: bab.mataKuliahId }).from(bab).where(eq(bab.status, "active")),
    db.select({ courseId: courseMaterials.courseId }).from(courseMaterials),
    db.select({ courseId: quizTemplates.courseId }).from(quizTemplates),
    db.select().from(courses).orderBy(asc(courses.title)),
  ]);

  const chapterCountMap: Record<string, number> = {};
  for (const ch of allBab) {
    if (ch.courseId) chapterCountMap[ch.courseId] = (chapterCountMap[ch.courseId] || 0) + 1;
  }

  const materialCountMap: Record<string, number> = {};
  for (const m of allMaterials) {
    if (m.courseId) materialCountMap[m.courseId] = (materialCountMap[m.courseId] || 0) + 1;
  }

  const quizCountMap: Record<string, number> = {};
  for (const q of allQuizzes) {
    if (q.courseId) quizCountMap[q.courseId] = (quizCountMap[q.courseId] || 0) + 1;
  }

  const legacyMap = new Map(legacyList.map((c) => [c.id, c]));

  if (canonicalCourses.length > 0) {
    return canonicalCourses.map((mk) => {
      const legacy = legacyMap.get(mk.legacyCourseId ?? "") || legacyMap.get(mk.id);
      const legacyId = mk.legacyCourseId ?? mk.id;
      return {
        id: mk.id,
        title: mk.title,
        category: legacy?.category ?? "Umum",
        description: legacy?.description ?? null,
        status: mk.status,
        createdAt: mk.createdAt,
        updatedAt: mk.updatedAt,
        chapterCount: chapterCountMap[mk.id] || 0,
        materialCount: (materialCountMap[mk.id] || 0) + (materialCountMap[legacyId] && legacyId !== mk.id ? materialCountMap[legacyId] : 0),
        quizCount: (quizCountMap[mk.id] || 0) + (quizCountMap[legacyId] && legacyId !== mk.id ? quizCountMap[legacyId] : 0),
      };
    });
  }

  const allChapters = await db.select({ courseId: chapters.courseId }).from(chapters);
  const legacyChapterCountMap: Record<string, number> = {};
  for (const ch of allChapters) {
    if (ch.courseId) legacyChapterCountMap[ch.courseId] = (legacyChapterCountMap[ch.courseId] || 0) + 1;
  }

  return legacyList.map((c) => ({
    ...c,
    chapterCount: legacyChapterCountMap[c.id] || 0,
    materialCount: materialCountMap[c.id] || 0,
    quizCount: quizCountMap[c.id] || 0,
  }));
}

import { allowedCategories, type Category } from "./constants";
export type { Category } from "./constants";

export async function saveCourse(
  id: string,
  title: string,
  category: string,
  description: string | null,
  isNew: boolean
) {
  const { user: admin } = await assertAdmin();

  const cleanId = id.trim().toLowerCase();
  const cleanTitle = title.trim();
  const cleanCategory = category.trim();
  const cleanDesc = description?.trim() || null;

  if (!cleanId || !/^[a-z0-9-]+$/.test(cleanId)) {
    return { success: false, error: "ID Mata Kuliah harus alfanumerik huruf kecil dan strip (slug)" };
  }
  if (!cleanTitle) {
    return { success: false, error: "Nama mata kuliah tidak boleh kosong" };
  }
  if (!cleanCategory) {
    return { success: false, error: "Kategori tidak boleh kosong" };
  }
  if (!(allowedCategories as readonly string[]).includes(cleanCategory)) {
    return { success: false, error: "Kategori tidak valid. Pilih dari daftar yang tersedia." };
  }

  try {
    await saveCourseWithCanonicalProjection({
      id: cleanId,
      title: cleanTitle,
      category: cleanCategory as Category,
      description: cleanDesc,
      isNew,
      actorId: admin.id,
    });

    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${cleanId}`);
    revalidatePath("/courses");
    revalidatePath(`/courses/${cleanId}`);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to save course:", err);
    if (err instanceof Error && err.message === "COURSE_ALREADY_EXISTS") {
      return { success: false, error: "ID Mata Kuliah sudah terdaftar" };
    }
    return { success: false, error: "Terjadi kesalahan saat menyimpan mata kuliah" };
  }
}

export async function deleteCourse(id: string) {
  const { user: admin } = await assertAdmin();

  try {
    await archiveCourseWithLegacyDeletion(id, admin.id);

    revalidatePath("/admin/courses");
    revalidatePath("/courses");
    revalidatePath(`/courses/${id}`);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to delete course:", err);
    return { success: false, error: "Gagal menghapus mata kuliah. Pastikan tidak ada data terkait." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Detailed Course Hub Server Action
// ─────────────────────────────────────────────────────────────────────────────

export async function getCourseDetailData(courseId: string) {
  await assertAdmin();

  const cleanCourseId = courseId.trim().toLowerCase();
  const [canonicalCourse, legacyCourse] = await Promise.all([
    db
      .select()
      .from(mataKuliah)
      .where(and(eq(mataKuliah.status, "active"), or(eq(mataKuliah.id, cleanCourseId), eq(mataKuliah.legacyCourseId, cleanCourseId))))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select()
      .from(courses)
      .where(eq(courses.id, cleanCourseId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  if (!canonicalCourse && !legacyCourse) {
    return null;
  }

  const course = {
    id: canonicalCourse?.id ?? legacyCourse!.id,
    title: canonicalCourse?.title ?? legacyCourse!.title,
    category: legacyCourse?.category ?? "Umum",
    description: legacyCourse?.description ?? null,
    status: canonicalCourse?.status ?? (legacyCourse as { status?: string } | null)?.status ?? "active",
    createdAt: canonicalCourse?.createdAt ?? (legacyCourse as { createdAt?: Date } | null)?.createdAt ?? new Date(),
    updatedAt: canonicalCourse?.updatedAt ?? (legacyCourse as { updatedAt?: Date } | null)?.updatedAt ?? new Date(),
  };

  const canonicalCourseId = canonicalCourse?.id ?? cleanCourseId;
  const legacyCourseId = legacyCourse?.id ?? cleanCourseId;

  const [babList, legacyChapters, materialsList, quizTemplatesList, rawQuestions] = await Promise.all([
    db
      .select()
      .from(bab)
      .where(and(eq(bab.mataKuliahId, canonicalCourseId), eq(bab.status, "active")))
      .orderBy(asc(bab.orderIndex)),
    db
      .select()
      .from(chapters)
      .where(or(eq(chapters.courseId, canonicalCourseId), eq(chapters.courseId, legacyCourseId)))
      .orderBy(asc(chapters.orderIndex)),
    db
      .select()
      .from(courseMaterials)
      .where(or(eq(courseMaterials.courseId, canonicalCourseId), eq(courseMaterials.courseId, legacyCourseId)))
      .orderBy(desc(courseMaterials.createdAt)),
    db
      .select()
      .from(quizTemplates)
      .where(or(eq(quizTemplates.courseId, canonicalCourseId), eq(quizTemplates.courseId, legacyCourseId)))
      .orderBy(desc(quizTemplates.createdAt)),
    db
      .select()
      .from(aiQuestionBank)
      .where(or(eq(aiQuestionBank.courseId, canonicalCourseId), eq(aiQuestionBank.courseId, legacyCourseId)))
      .orderBy(desc(aiQuestionBank.createdAt))
      .limit(100),
  ]);

  // Map chapters from canonical bab if available, preserving legacy descriptions
  let chaptersList: Array<{
    id: string;
    courseId: string;
    title: string;
    orderIndex: number;
    description: string | null;
    status: string;
    createdAt?: Date;
    updatedAt?: Date;
  }>;

  if (babList.length > 0) {
    const legacyMap = new Map(legacyChapters.map((lc) => [lc.id, lc]));
    chaptersList = babList.map((b) => {
      const legacy = legacyMap.get(b.legacyChapterId ?? "") || legacyMap.get(b.id);
      return {
        id: b.id,
        courseId: canonicalCourseId,
        title: b.title,
        orderIndex: b.orderIndex,
        description: legacy?.description ?? null,
        status: b.status,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      };
    });
  } else {
    chaptersList = legacyChapters.map((ch) => ({
      id: ch.id,
      courseId: canonicalCourseId,
      title: ch.title,
      orderIndex: ch.orderIndex,
      description: ch.description,
      status: ch.status,
      createdAt: ch.createdAt,
      updatedAt: ch.updatedAt,
    }));
  }

  // Aggregate quiz attempts & AI insights for quizzes in this course
  const quizIds = quizTemplatesList.map((q) => q.id);

  let attemptsData: Array<{ templateId: string; score: number | null; status: string }> = [];
  let insightsMap: Record<string, { id: string; createdAt: Date }> = {};

  if (quizIds.length > 0) {
    attemptsData = await db
      .select({
        templateId: studentQuizAttempts.templateId,
        score: studentQuizAttempts.score,
        status: studentQuizAttempts.status,
      })
      .from(studentQuizAttempts)
      .where(inArray(studentQuizAttempts.templateId, quizIds));

    const insights = await db
      .select({
        id: quizAiInsights.id,
        templateId: quizAiInsights.templateId,
        createdAt: quizAiInsights.createdAt,
      })
      .from(quizAiInsights)
      .where(inArray(quizAiInsights.templateId, quizIds));

    for (const ins of insights) {
      if (ins.templateId) {
        insightsMap[ins.templateId] = {
          id: ins.id,
          createdAt: ins.createdAt,
        };
      }
    }
  }

  // Calculate per-quiz metrics
  const quizzesWithMetrics = quizTemplatesList.map((tpl) => {
    const tplAttempts = attemptsData.filter((a) => a.templateId === tpl.id && a.status === "completed");
    const totalAttempts = tplAttempts.length;
    const scores = tplAttempts.map((a) => a.score ?? 0);
    const avgScore = totalAttempts > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / totalAttempts) : 0;
    const passCount = scores.filter((s) => s >= 70).length;
    const passRate = totalAttempts > 0 ? Math.round((passCount / totalAttempts) * 100) : 0;

    return {
      ...tpl,
      totalAttempts,
      avgScore,
      passRate,
      lastAiInsight: insightsMap[tpl.id] || null,
    };
  });

  // Calculate overall course metrics
  const completedAttempts = attemptsData.filter((a) => a.status === "completed");
  const totalCompletedAttempts = completedAttempts.length;
  const allScores = completedAttempts.map((a) => a.score ?? 0);
  const overallAvgScore = totalCompletedAttempts > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / totalCompletedAttempts) : 0;
  const overallPassRate = totalCompletedAttempts > 0 ? Math.round((allScores.filter((s) => s >= 70).length / totalCompletedAttempts) * 100) : 0;

  return {
    course,
    chapters: chaptersList,
    materials: materialsList,
    quizzes: quizzesWithMetrics,
    questions: rawQuestions,
    stats: {
      totalChapters: chaptersList.length,
      totalMaterials: materialsList.length,
      totalQuizzes: quizTemplatesList.length,
      totalQuestions: rawQuestions.length,
      totalAttempts: totalCompletedAttempts,
      avgScore: overallAvgScore,
      passRate: overallPassRate,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chapter Management Server Actions
// ─────────────────────────────────────────────────────────────────────────────

export async function getCourseChapters(courseId: string) {
  await assertAdmin();
  const cleanCourseId = courseId.trim().toLowerCase();

  const [mk] = await db
    .select({ id: mataKuliah.id })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, cleanCourseId), eq(mataKuliah.legacyCourseId, cleanCourseId)))
    .limit(1);

  const targetId = mk?.id ?? cleanCourseId;

  const babList = await db
    .select()
    .from(bab)
    .where(and(eq(bab.mataKuliahId, targetId), eq(bab.status, "active")))
    .orderBy(asc(bab.orderIndex));

  if (babList.length > 0) {
    return babList.map((b) => ({
      id: b.id,
      courseId: targetId,
      title: b.title,
      orderIndex: b.orderIndex,
      description: null,
      status: b.status,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));
  }

  return db
    .select()
    .from(chapters)
    .where(eq(chapters.courseId, cleanCourseId))
    .orderBy(asc(chapters.orderIndex));
}

export async function getAllChapters() {
  await assertAdmin();
  const babList = await db
    .select()
    .from(bab)
    .where(eq(bab.status, "active"))
    .orderBy(asc(bab.orderIndex));

  if (babList.length > 0) {
    return babList.map((b) => ({
      id: b.id,
      courseId: b.mataKuliahId,
      title: b.title,
      orderIndex: b.orderIndex,
      description: null,
      status: b.status,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));
  }

  return db
    .select()
    .from(chapters)
    .orderBy(asc(chapters.orderIndex));
}

export async function saveChapter(
  id: string | null,
  courseId: string,
  title: string,
  orderIndex: number,
  description?: string | null
) {
  const { user: admin } = await assertAdmin();

  const cleanTitle = title.trim();
  const cleanDesc = description?.trim() || null;

  if (!cleanTitle) {
    return { success: false, error: "Judul bab tidak boleh kosong" };
  }

  try {
    const result = await saveChapterWithCanonicalProjection({
      id,
      courseId,
      title: cleanTitle,
      orderIndex,
      description: cleanDesc,
      actorId: admin.id,
    });

    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${courseId}`);
    revalidatePath(`/courses/${courseId}/material`);
    return {
      success: true,
      chapter: id
        ? undefined
        : { id: result.id, courseId, title: cleanTitle, orderIndex, description: cleanDesc },
    };
  } catch (err: any) {
    console.error("Failed to save chapter:", err);
    return { success: false, error: "Gagal menyimpan bab" };
  }
}

export async function deleteChapter(id: string) {
  const { user: admin } = await assertAdmin();

  try {
    const [existing] = await db.select().from(chapters).where(eq(chapters.id, id)).limit(1);
    if (!existing) {
      return { success: false, error: "Bab tidak ditemukan" };
    }

    await archiveChapterWithLegacyDeletion(id, admin.id);

    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${existing.courseId}`);
    revalidatePath(`/courses/${existing.courseId}/material`);
    return { success: true };
  } catch (err: any) {
    console.error("Failed to delete chapter:", err);
    return { success: false, error: "Gagal menghapus bab. Pastikan tidak ada data terkait." };
  }
}

export async function reorderChapters(courseId: string, chapterIds: string[]) {
  const { user: admin } = await assertAdmin();

  if (!courseId || !Array.isArray(chapterIds)) {
    return { success: false, error: "Data urutan bab tidak valid" };
  }

  try {
    await reorderChaptersWithCanonicalProjection(courseId, chapterIds, admin.id);

    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${courseId}`);
    revalidatePath(`/courses/${courseId}/material`);
    return { success: true };
  } catch (err: any) {
    console.error("Failed to reorder chapters:", err);
    return { success: false, error: "Gagal memperbarui urutan bab" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF Course Materials Server Actions
// ─────────────────────────────────────────────────────────────────────────────

export async function getUploadedMaterials(courseId?: string) {
  await assertAdmin();
  
  if (courseId) {
    return db
      .select()
      .from(courseMaterials)
      .where(eq(courseMaterials.courseId, courseId))
      .orderBy(desc(courseMaterials.createdAt));
  } else {
    return db
      .select()
      .from(courseMaterials)
      .orderBy(desc(courseMaterials.createdAt));
  }
}

export async function saveCourseMaterial(
  courseId: string,
  title: string,
  type: CourseMaterialCategory,
  chapterIds: string[],
  fileKey: string,
  subcategory?: CourseMaterialSubcategory | null,
  year?: number | null,
  checksum?: string | null
) {
  const { user } = await assertAdmin();

  const cleanCourseId = typeof courseId === "string" ? courseId.trim() : "";
  const cleanTitle = typeof title === "string" ? title.trim() : "";
  const cleanFileKey = typeof fileKey === "string" ? fileKey.trim() : "";
  const cleanSubcategory = typeof subcategory === "string" && subcategory.trim() ? subcategory.trim() as CourseMaterialSubcategory : null;
  const cleanYear = typeof year === "number" && !isNaN(year) && year >= 1900 && year <= 2100 ? Math.floor(year) : null;

  const validTypes = ["materi", "soal", "pembahasan_soal", "materi_kelas", "contoh_soal"];
  const courseMaterialsPrefix = joinKey(
    "courses",
    slugifySegment(cleanCourseId),
    "materials"
  );

  if (
    !cleanCourseId ||
    !cleanTitle ||
    !validTypes.includes(type) ||
    !Array.isArray(chapterIds) ||
    chapterIds.length === 0 ||
    chapterIds.some((chapterId) => typeof chapterId !== "string" || !chapterId.trim()) ||
    !cleanFileKey
  ) {
    return { success: false, error: "Semua field wajib diisi" };
  }

  if (cleanSubcategory && !isValidSubcategory(type, cleanSubcategory)) {
    return { success: false, error: "Sub-kategori tidak sesuai dengan kategori yang dipilih" };
  }

  if (
    !isSafeKey(cleanFileKey) ||
    !cleanFileKey.startsWith(`${courseMaterialsPrefix}/`) ||
    !cleanFileKey.toLowerCase().endsWith(".pdf")
  ) {
    return { success: false, error: "Key file PDF tidak valid untuk mata kuliah ini" };
  }

  try {
    const materialId = randomUUID();

    await db.insert(courseMaterials).values({
      id: materialId,
      courseId: cleanCourseId,
      title: cleanTitle,
      type,
      subcategory: cleanSubcategory,
      year: cleanYear,
      fileUrl: cleanFileKey,
      thumbnailUrl: null,
      chapterIds,
    });

    await inngest.send({
      id: `thumbnail-${materialId}-${checksum || "v1"}`,
      name: "pdf/thumbnail.requested",
      data: {
        materialId,
        sourceType: "course_material",
      },
    }).catch((inngestErr) => {
      console.warn(`[saveCourseMaterial] Failed to enqueue thumbnail for ${materialId}:`, inngestErr);
    });

    // Dual-write projection to canonical sumberMateri
    try {
      const [canonicalCourse] = await db
        .select({ id: mataKuliah.id })
        .from(mataKuliah)
        .where(or(eq(mataKuliah.id, cleanCourseId), eq(mataKuliah.legacyCourseId, cleanCourseId)))
        .limit(1);

      const firstChapterId = chapterIds[0];
      const [canonicalBab] = firstChapterId
        ? await db
            .select({ id: bab.id })
            .from(bab)
            .where(or(eq(bab.id, firstChapterId), eq(bab.legacyChapterId, firstChapterId)))
            .limit(1)
        : [null];

      const canonicalCourseId = canonicalCourse?.id ?? cleanCourseId;
      const canonicalBabId = canonicalBab?.id ?? null;

      await db
        .insert(sumberMateri)
        .values({
          id: `sm-legacy-${materialId}`,
          mataKuliahId: canonicalCourseId,
          babId: canonicalBabId,
          sourceType: "pdf",
          title: cleanTitle,
          canonicalUriOrR2Key: cleanFileKey,
          version: 1,
          checksum: cleanFileKey,
          status: "active",
          creatorId: user.id,
        })
        .onConflictDoUpdate({
          target: [sumberMateri.id],
          set: {
            title: cleanTitle,
            canonicalUriOrR2Key: cleanFileKey,
            status: "active",
            updatedAt: new Date(),
          },
        });
    } catch (projectionError) {
      console.warn("Failed to project material to sumberMateri:", projectionError);
    }

    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${cleanCourseId}`);
    revalidatePath(`/courses/${cleanCourseId}/material`);
    return { success: true };
  } catch (err: any) {
    console.error("Failed to save course material:", err);
    await storage.delete(cleanFileKey).catch((cleanupError) => {
      console.error("Failed to clean up uploaded course material:", cleanupError);
    });
    return { success: false, error: err.message || "Gagal menyimpan materi" };
  }
}

export async function deleteCourseMaterial(id: string) {
  await assertAdmin();

  try {
    const [existing] = await db
      .select()
      .from(courseMaterials)
      .where(eq(courseMaterials.id, id))
      .limit(1);

    if (!existing) {
      return { success: false, error: "Materi tidak ditemukan" };
    }

    if (existing.fileUrl) {
      await storage.delete(existing.fileUrl).catch((e) => {
        console.error("Failed to delete from R2:", e);
      });
    }

    if (existing.thumbnailUrl) {
      await storage.delete(existing.thumbnailUrl).catch((e) => {
        console.error("Failed to delete thumbnail from R2:", e);
      });
    }

    await db.delete(courseMaterials).where(eq(courseMaterials.id, id));
    await db.delete(sumberMateri).where(eq(sumberMateri.id, `sm-legacy-${id}`)).catch(() => null);

    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${existing.courseId}`);
    revalidatePath(`/courses/${existing.courseId}/material`);
    return { success: true };
  } catch (err: any) {
    console.error("Failed to delete course material:", err);
    return { success: false, error: err.message || "Gagal menghapus materi" };
  }
}

export async function updateCourseMaterial(
  id: string,
  data: {
    title: string;
    type: CourseMaterialCategory;
    subcategory?: CourseMaterialSubcategory | null;
    year?: number | null;
    chapterIds: string[];
  }
) {
  await assertAdmin();

  const cleanTitle = typeof data.title === "string" ? data.title.trim() : "";
  const cleanType = data.type;
  const cleanSubcategory = typeof data.subcategory === "string" && data.subcategory.trim() ? data.subcategory.trim() as CourseMaterialSubcategory : null;
  const cleanYear = typeof data.year === "number" && !isNaN(data.year) && data.year >= 1900 && data.year <= 2100 ? Math.floor(data.year) : null;
  const chapterIds = Array.isArray(data.chapterIds) ? data.chapterIds : [];

  if (!cleanTitle) {
    return { success: false, error: "Judul materi wajib diisi" };
  }
  if (!chapterIds.length) {
    return { success: false, error: "Pilih minimal satu bab terkait" };
  }

  try {
    const [existing] = await db
      .select()
      .from(courseMaterials)
      .where(eq(courseMaterials.id, id))
      .limit(1);

    if (!existing) {
      return { success: false, error: "Materi tidak ditemukan" };
    }

    await db
      .update(courseMaterials)
      .set({
        title: cleanTitle,
        type: cleanType,
        subcategory: cleanSubcategory,
        year: cleanYear,
        chapterIds,
        updatedAt: new Date(),
      })
      .where(eq(courseMaterials.id, id));

    await db
      .update(sumberMateri)
      .set({
        title: cleanTitle,
        updatedAt: new Date(),
      })
      .where(eq(sumberMateri.id, `sm-legacy-${id}`))
      .catch(() => null);

    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${existing.courseId}`);
    revalidatePath(`/admin/courses/${existing.courseId}/documents`);
    revalidatePath(`/courses/${existing.courseId}/material`);
    return { success: true };
  } catch (err: any) {
    console.error("Failed to update course material:", err);
    return { success: false, error: err.message || "Gagal memperbarui materi" };
  }
}

export async function updateDocumentStatusAction(input: {
  materialId: string;
  source: string;
  status: "draft" | "published";
}) {
  await assertAdmin();
  const { materialId, source, status } = input;
  const now = new Date();

  try {
    if (source === "canonical-article") {
      await db
        .update(artikel)
        .set({
          status,
          publishedAt: status === "published" ? now : null,
          updatedAt: now,
        })
        .where(eq(artikel.id, materialId));
    } else if (source === "canonical-diktat") {
      await db
        .update(diktatMateri)
        .set({
          status,
          publishedAt: status === "published" ? now : null,
          updatedAt: now,
        })
        .where(eq(diktatMateri.id, materialId));
    } else if (source === "legacy-article") {
      await db
        .update(websiteMaterials)
        .set({
          status: status === "published" ? "published" : "draft",
        })
        .where(eq(websiteMaterials.id, materialId));
    }

    revalidatePath("/admin/courses");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to update document status:", err);
    return { success: false, error: err.message || "Gagal mengubah status dokumen" };
  }
}

export async function updateArticleContentAction(input: {
  id: string;
  source: string;
  title: string;
  contentMarkdown: string;
  babId?: string | null;
}) {
  await assertAdmin();
  const { id, source, title, contentMarkdown, babId } = input;
  const cleanTitle = title.trim();
  if (!cleanTitle) {
    return { success: false, error: "Judul artikel wajib diisi" };
  }

  const now = new Date();

  try {
    if (source === "canonical-article") {
      await db
        .update(artikel)
        .set({
          title: cleanTitle,
          contentMarkdown,
          babId: babId || null,
          updatedAt: now,
        })
        .where(eq(artikel.id, id));
    } else if (source === "canonical-diktat") {
      await db
        .update(diktatMateri)
        .set({
          title: cleanTitle,
          contentMarkdown,
          babId: babId || null,
          updatedAt: now,
        })
        .where(eq(diktatMateri.id, id));
    } else if (source === "legacy-article") {
      await db
        .update(websiteMaterials)
        .set({
          title: cleanTitle,
          canonicalMarkdown: contentMarkdown,
          chapterId: babId || "",
        })
        .where(eq(websiteMaterials.id, id));
    }

    revalidatePath("/admin/courses");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to update article content:", err);
    return { success: false, error: err.message || "Gagal menyimpan konten dokumen" };
  }
}

// Lightweight Navigation Hub Server Action

export type CourseNavContext = {
  id: string;
  slug: string;
  title: string;
  category: string;
};

export async function getCourseNavContext(slugOrId: string): Promise<CourseNavContext | null> {
  await assertAdmin();

  const cleanId = typeof slugOrId === "string" ? slugOrId.trim().toLowerCase() : "";
  if (!cleanId) {
    return null;
  }

  const [canonicalCourse, legacyCourse] = await Promise.all([
    db
      .select({
        id: mataKuliah.id,
        title: mataKuliah.title,
        legacyCourseId: mataKuliah.legacyCourseId,
        status: mataKuliah.status,
      })
      .from(mataKuliah)
      .where(
        and(
          eq(mataKuliah.status, "active"),
          or(eq(mataKuliah.id, cleanId), eq(mataKuliah.legacyCourseId, cleanId))
        )
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        id: courses.id,
        title: courses.title,
        category: courses.category,
      })
      .from(courses)
      .where(eq(courses.id, cleanId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  if (!canonicalCourse && !legacyCourse) {
    return null;
  }

  let category = legacyCourse?.category ?? "Umum";
  if (canonicalCourse && !legacyCourse) {
    const legacyTargetId = canonicalCourse.legacyCourseId ?? canonicalCourse.id;
    const [foundLegacy] = await db
      .select({ category: courses.category })
      .from(courses)
      .where(eq(courses.id, legacyTargetId))
      .limit(1);
    if (foundLegacy?.category) {
      category = foundLegacy.category;
    }
  }

  return {
    id: canonicalCourse?.id ?? legacyCourse!.id,
    slug: cleanId,
    title: canonicalCourse?.title ?? legacyCourse!.title,
    category,
  };
}
