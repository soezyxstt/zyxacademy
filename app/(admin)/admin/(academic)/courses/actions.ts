"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  courses,
  chapters,
  courseMaterials,
  quizTemplates,
  studentQuizAttempts,
  quizAiInsights,
  aiQuestionBank,
} from "@/db/schema";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { eq, asc, desc, and, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { storage } from "@/lib/storage";
import { isSafeKey, joinKey, slugifySegment } from "@/lib/storage/keys";
import { generateAndSavePdfThumbnail } from "@/lib/thumbnail";

export async function getCourses() {
  await assertAdmin();
  return db.select().from(courses).orderBy(asc(courses.title));
}

export async function getCoursesWithStats() {
  await assertAdmin();

  const allCourses = await db.select().from(courses).orderBy(asc(courses.title));
  const allChapters = await db.select({ courseId: chapters.courseId }).from(chapters);
  const allMaterials = await db.select({ courseId: courseMaterials.courseId }).from(courseMaterials);
  const allQuizzes = await db.select({ courseId: quizTemplates.courseId }).from(quizTemplates);

  const chapterCountMap: Record<string, number> = {};
  for (const ch of allChapters) {
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

  return allCourses.map((c) => ({
    ...c,
    chapterCount: chapterCountMap[c.id] || 0,
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
  await assertAdmin();

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
    if (isNew) {
      const existing = await db.query.courses.findFirst({
        where: eq(courses.id, cleanId),
      });
      if (existing) {
        return { success: false, error: "ID Mata Kuliah sudah terdaftar" };
      }
      await db.insert(courses).values({
        id: cleanId,
        title: cleanTitle,
        category: cleanCategory as Category,
        description: cleanDesc,
      });
    } else {
      await db
        .update(courses)
        .set({
          title: cleanTitle,
          category: cleanCategory as Category,
          description: cleanDesc,
        })
        .where(eq(courses.id, cleanId));
    }

    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${cleanId}`);
    revalidatePath("/courses");
    revalidatePath(`/courses/${cleanId}`);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to save course:", err);
    return { success: false, error: "Terjadi kesalahan saat menyimpan mata kuliah" };
  }
}

export async function deleteCourse(id: string) {
  await assertAdmin();

  try {
    await db.delete(courses).where(eq(courses.id, id));

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
  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, cleanCourseId))
    .limit(1);

  if (!course) {
    return null;
  }

  const [chaptersList, materialsList, quizTemplatesList, rawQuestions] = await Promise.all([
    db
      .select()
      .from(chapters)
      .where(eq(chapters.courseId, cleanCourseId))
      .orderBy(asc(chapters.orderIndex)),
    db
      .select()
      .from(courseMaterials)
      .where(eq(courseMaterials.courseId, cleanCourseId))
      .orderBy(desc(courseMaterials.createdAt)),
    db
      .select()
      .from(quizTemplates)
      .where(eq(quizTemplates.courseId, cleanCourseId))
      .orderBy(desc(quizTemplates.createdAt)),
    db
      .select()
      .from(aiQuestionBank)
      .where(eq(aiQuestionBank.courseId, cleanCourseId))
      .orderBy(desc(aiQuestionBank.createdAt))
      .limit(100),
  ]);

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
  return db
    .select()
    .from(chapters)
    .where(eq(chapters.courseId, courseId))
    .orderBy(asc(chapters.orderIndex));
}

export async function getAllChapters() {
  await assertAdmin();
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
  await assertAdmin();

  const cleanTitle = title.trim();
  const cleanDesc = description?.trim() || null;

  if (!cleanTitle) {
    return { success: false, error: "Judul bab tidak boleh kosong" };
  }

  try {
    if (!id) {
      const newId = randomUUID();
      await db.insert(chapters).values({
        id: newId,
        courseId,
        title: cleanTitle,
        orderIndex,
        description: cleanDesc,
        status: "published",
      });
      revalidatePath("/admin/courses");
      revalidatePath(`/admin/courses/${courseId}`);
      revalidatePath(`/courses/${courseId}/material`);
      return { success: true, chapter: { id: newId, courseId, title: cleanTitle, orderIndex, description: cleanDesc } };
    } else {
      await db
        .update(chapters)
        .set({
          title: cleanTitle,
          orderIndex,
          description: cleanDesc,
        })
        .where(eq(chapters.id, id));
    }

    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${courseId}`);
    revalidatePath(`/courses/${courseId}/material`);
    return { success: true };
  } catch (err: any) {
    console.error("Failed to save chapter:", err);
    return { success: false, error: err.message || "Gagal menyimpan bab" };
  }
}

export async function deleteChapter(id: string) {
  await assertAdmin();

  try {
    const [existing] = await db.select().from(chapters).where(eq(chapters.id, id)).limit(1);
    if (!existing) {
      return { success: false, error: "Bab tidak ditemukan" };
    }

    await db.delete(chapters).where(eq(chapters.id, id));

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
  await assertAdmin();

  if (!courseId || !Array.isArray(chapterIds)) {
    return { success: false, error: "Data urutan bab tidak valid" };
  }

  try {
    await db.transaction(async (tx) => {
      for (let i = 0; i < chapterIds.length; i++) {
        await tx
          .update(chapters)
          .set({ orderIndex: i + 1 })
          .where(and(eq(chapters.id, chapterIds[i]), eq(chapters.courseId, courseId)));
      }
    });

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
  type: "materi_kelas" | "contoh_soal",
  chapterIds: string[],
  fileKey: string
) {
  await assertAdmin();

  const cleanCourseId = typeof courseId === "string" ? courseId.trim() : "";
  const cleanTitle = typeof title === "string" ? title.trim() : "";
  const cleanFileKey = typeof fileKey === "string" ? fileKey.trim() : "";
  const courseMaterialsPrefix = joinKey(
    "courses",
    slugifySegment(cleanCourseId),
    "materials"
  );

  if (
    !cleanCourseId ||
    !cleanTitle ||
    !["materi_kelas", "contoh_soal"].includes(type) ||
    !Array.isArray(chapterIds) ||
    chapterIds.length === 0 ||
    chapterIds.some((chapterId) => typeof chapterId !== "string" || !chapterId.trim()) ||
    !cleanFileKey
  ) {
    return { success: false, error: "Semua field wajib diisi" };
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
    
    // Generate page 1 thumbnail asynchronously
    const thumbnailKey = await generateAndSavePdfThumbnail({
      courseSlug: cleanCourseId,
      materialId,
      fileKey: cleanFileKey,
    }).catch(() => null);

    await db.insert(courseMaterials).values({
      id: materialId,
      courseId: cleanCourseId,
      title: cleanTitle,
      type,
      fileUrl: cleanFileKey,
      thumbnailUrl: thumbnailKey,
      chapterIds,
    });

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

    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${existing.courseId}`);
    revalidatePath(`/courses/${existing.courseId}/material`);
    return { success: true };
  } catch (err: any) {
    console.error("Failed to delete course material:", err);
    return { success: false, error: err.message || "Gagal menghapus materi" };
  }
}
