import { db } from "@/db";
import {
  courses,
  chapters,
  mataKuliah,
  bab,
  courseMaterials,
  quizTemplates,
  pengguna,
} from "@/db/schema";
import { eq, asc, and, like, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  saveCourseWithCanonicalProjection,
  saveChapterWithCanonicalProjection,
} from "@/lib/academic/course-canonical-sync";
import { allowedCategories, type Category } from "@/app/(admin)/admin/(academic)/courses/constants";

async function resolvePenggunaActorId(actorId?: string): Promise<string | null> {
  if (!actorId) return null;
  const p = await db.query.pengguna.findFirst({ where: eq(pengguna.id, actorId) });
  return p ? p.id : null;
}

export interface ListCoursesInput {
  search?: string;
  category?: string;
}

export async function executeListCourses(input: ListCoursesInput) {
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

  let courseItems = canonicalCourses.map((mk) => {
    const legacy = legacyMap.get(mk.legacyCourseId ?? "") || legacyMap.get(mk.id);
    const legacyId = mk.legacyCourseId ?? mk.id;
    return {
      id: mk.id,
      title: mk.title,
      category: legacy?.category ?? "Umum",
      description: legacy?.description ?? null,
      status: mk.status,
      chapterCount: chapterCountMap[mk.id] || 0,
      materialCount: (materialCountMap[mk.id] || 0) + (materialCountMap[legacyId] && legacyId !== mk.id ? materialCountMap[legacyId] : 0),
      quizCount: (quizCountMap[mk.id] || 0) + (quizCountMap[legacyId] && legacyId !== mk.id ? quizCountMap[legacyId] : 0),
    };
  });

  if (courseItems.length === 0 && legacyList.length > 0) {
    courseItems = legacyList.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category ?? "Umum",
      description: c.description ?? null,
      status: "active",
      chapterCount: 0,
      materialCount: materialCountMap[c.id] || 0,
      quizCount: quizCountMap[c.id] || 0,
    }));
  }

  if (input.search) {
    const q = input.search.toLowerCase();
    courseItems = courseItems.filter((c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }
  if (input.category) {
    const cat = input.category.toLowerCase();
    courseItems = courseItems.filter((c) => c.category.toLowerCase() === cat);
  }

  return {
    summary: `Ditemukan ${courseItems.length} mata kuliah aktif.`,
    data: courseItems,
  };
}

export interface CreateCourseInput {
  id: string;
  title: string;
  category: string;
  description?: string;
}

export async function executeCreateCourse(input: CreateCourseInput, actorId?: string) {
  const cleanId = input.id.trim().toLowerCase();
  const cleanTitle = input.title.trim();
  const cleanCategory = input.category.trim();
  const cleanDesc = input.description?.trim() || null;

  if (!cleanId || !/^[a-z0-9-]+$/.test(cleanId)) {
    throw new Error("ID Mata Kuliah harus alfanumerik huruf kecil dan strip (slug), contoh: 'fisika-dasar-1'.");
  }
  if (!cleanTitle) {
    throw new Error("Nama mata kuliah tidak boleh kosong.");
  }
  if (!cleanCategory) {
    throw new Error("Kategori mata kuliah tidak boleh kosong.");
  }

  const matchedCategory = (allowedCategories as readonly string[]).find(
    (c) => c.toLowerCase() === cleanCategory.toLowerCase()
  ) || "Umum";

  try {
    await saveCourseWithCanonicalProjection({
      id: cleanId,
      title: cleanTitle,
      category: matchedCategory as Category,
      description: cleanDesc,
      isNew: true,
      actorId: await resolvePenggunaActorId(actorId),
    });
  } catch (err: any) {
    await db.insert(courses).values({
      id: cleanId,
      title: cleanTitle,
      category: matchedCategory as Category,
      description: cleanDesc,
    });
    await db.insert(mataKuliah).values({
      id: cleanId,
      code: `legacy-${cleanId}`,
      title: cleanTitle,
      status: "active",
      legacyCourseId: cleanId,
    }).onConflictDoNothing();
  }

  return {
    summary: `Mata kuliah '${cleanTitle}' (${cleanId}) berhasil dibuat dengan kategori '${matchedCategory}'.`,
    data: { id: cleanId, title: cleanTitle, category: matchedCategory, description: cleanDesc },
  };
}

export interface UpdateCourseInput {
  id: string;
  title?: string;
  category?: string;
  description?: string;
}

export async function executeUpdateCourse(input: UpdateCourseInput, actorId?: string) {
  const cleanId = input.id.trim().toLowerCase();
  if (!cleanId) throw new Error("ID Mata Kuliah wajib diisi.");

  const existing = await db.query.courses.findFirst({ where: eq(courses.id, cleanId) });
  const existingMk = await db.query.mataKuliah.findFirst({ where: eq(mataKuliah.id, cleanId) });
  if (!existing && !existingMk) {
    throw new Error(`Mata kuliah dengan ID '${cleanId}' tidak ditemukan.`);
  }

  const updatedTitle = input.title?.trim() || existingMk?.title || existing?.title || cleanId;
  const updatedCategory = input.category?.trim() || existing?.category || "Umum";
  const updatedDesc = input.description !== undefined ? input.description.trim() : (existing?.description || null);

  const matchedCategory = (allowedCategories as readonly string[]).find(
    (c) => c.toLowerCase() === updatedCategory.toLowerCase()
  ) || "Umum";

  await saveCourseWithCanonicalProjection({
    id: cleanId,
    title: updatedTitle,
    category: matchedCategory as Category,
    description: updatedDesc,
    isNew: false,
    actorId: await resolvePenggunaActorId(actorId),
  });

  return {
    summary: `Mata kuliah '${cleanId}' berhasil diperbarui.`,
    data: { id: cleanId, title: updatedTitle, category: matchedCategory, description: updatedDesc },
  };
}

export interface ListChaptersInput {
  courseId?: string;
  search?: string;
}

export async function executeListChapters(input: ListChaptersInput) {
  const cleanCourseId = input.courseId?.trim().toLowerCase();
  const cleanSearch = input.search?.trim().toLowerCase();

  const [allCanonicalBab, allCourses, allLegacyBab] = await Promise.all([
    db
      .select({
        id: bab.id,
        title: bab.title,
        orderIndex: bab.orderIndex,
        courseId: bab.mataKuliahId,
        status: bab.status,
      })
      .from(bab)
      .where(eq(bab.status, "active"))
      .orderBy(asc(bab.orderIndex)),
    db
      .select({
        id: mataKuliah.id,
        title: mataKuliah.title,
        status: mataKuliah.status,
      })
      .from(mataKuliah)
      .where(eq(mataKuliah.status, "active")),
    db
      .select({
        id: chapters.id,
        title: chapters.title,
        orderIndex: chapters.orderIndex,
        courseId: chapters.courseId,
      })
      .from(chapters)
      .orderBy(asc(chapters.orderIndex)),
  ]);

  const courseTitleMap = new Map<string, string>();
  for (const c of allCourses) {
    courseTitleMap.set(c.id, c.title);
  }

  const seenIds = new Set<string>();
  let items: Array<{
    id: string;
    title: string;
    orderIndex: number;
    courseId: string;
    courseTitle: string;
  }> = [];

  for (const b of allCanonicalBab) {
    if (!seenIds.has(b.id)) {
      seenIds.add(b.id);
      const cId = b.courseId || "";
      items.push({
        id: b.id,
        title: b.title,
        orderIndex: b.orderIndex ?? 1,
        courseId: cId,
        courseTitle: courseTitleMap.get(cId) || cId,
      });
    }
  }

  for (const ch of allLegacyBab) {
    if (!seenIds.has(ch.id)) {
      seenIds.add(ch.id);
      const cId = ch.courseId || "";
      items.push({
        id: ch.id,
        title: ch.title,
        orderIndex: ch.orderIndex ?? 1,
        courseId: cId,
        courseTitle: courseTitleMap.get(cId) || cId,
      });
    }
  }

  if (cleanCourseId) {
    items = items.filter(
      (it) => it.courseId.toLowerCase() === cleanCourseId || it.courseTitle.toLowerCase().includes(cleanCourseId)
    );
  }

  if (cleanSearch) {
    items = items.filter(
      (it) => it.title.toLowerCase().includes(cleanSearch) || it.id.toLowerCase().includes(cleanSearch)
    );
  }

  return {
    summary: `Ditemukan ${items.length} bab materi${cleanSearch ? ` untuk pencarian '${cleanSearch}'` : ""}${cleanCourseId ? ` pada mata kuliah '${cleanCourseId}'` : ""}.`,
    data: items,
  };
}

export interface BatchCreateChaptersInput {
  courseId: string;
  chapters: Array<{
    title: string;
    orderIndex?: number;
    description?: string;
  }>;
}

export async function executeBatchCreateChapters(input: BatchCreateChaptersInput, actorId?: string) {
  const cleanCourseId = input.courseId.trim().toLowerCase();
  if (!cleanCourseId) throw new Error("ID Mata Kuliah wajib diisi.");
  if (!input.chapters || input.chapters.length === 0) {
    throw new Error("Daftar bab yang ingin dibuat tidak boleh kosong.");
  }

  // Check course exists
  const existing = await db.query.courses.findFirst({ where: eq(courses.id, cleanCourseId) });
  const existingMk = await db.query.mataKuliah.findFirst({ where: eq(mataKuliah.id, cleanCourseId) });
  if (!existing && !existingMk) {
    throw new Error(`Mata kuliah '${cleanCourseId}' tidak ditemukan.`);
  }

  // Get current max orderIndex
  const currentChapters = await db.select({ orderIndex: bab.orderIndex }).from(bab).where(eq(bab.mataKuliahId, cleanCourseId));
  let highestOrder = currentChapters.reduce((max, c) => Math.max(max, c.orderIndex ?? 0), 0);

  const createdChapters: Array<{ id: string; title: string; orderIndex: number }> = [];

  for (let i = 0; i < input.chapters.length; i++) {
    const ch = input.chapters[i];
    const cleanTitle = ch.title.trim();
    if (!cleanTitle) continue;

    highestOrder++;
    const orderIndex = ch.orderIndex ?? highestOrder;
    const chapterId = `ch-${cleanCourseId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      const created = await saveChapterWithCanonicalProjection({
        courseId: cleanCourseId,
        title: cleanTitle,
        orderIndex,
        description: ch.description?.trim() || null,
        actorId: await resolvePenggunaActorId(actorId),
      });
      createdChapters.push({ id: created.id, title: cleanTitle, orderIndex });
    } catch (err: any) {
      await db.insert(chapters).values({
        id: chapterId,
        courseId: cleanCourseId,
        title: cleanTitle,
        orderIndex,
        description: ch.description?.trim() || null,
      });
      await db.insert(bab).values({
        id: chapterId,
        mataKuliahId: cleanCourseId,
        code: `legacy-${chapterId}`,
        title: cleanTitle,
        orderIndex,
        status: "active",
        legacyChapterId: chapterId,
      }).onConflictDoNothing();
      createdChapters.push({ id: chapterId, title: cleanTitle, orderIndex });
    }
  }

  return {
    summary: `Berhasil membuat ${createdChapters.length} bab materi untuk mata kuliah '${cleanCourseId}'.`,
    data: { courseId: cleanCourseId, createdCount: createdChapters.length, chapters: createdChapters },
  };
}

export interface UpdateChapterInput {
  chapterId: string;
  title?: string;
  orderIndex?: number;
  description?: string;
}

export async function executeUpdateChapter(input: UpdateChapterInput, actorId?: string) {
  const chapterId = input.chapterId.trim();
  if (!chapterId) throw new Error("ID Bab wajib diisi.");

  const existingBab = await db.query.bab.findFirst({ where: eq(bab.id, chapterId) });
  const existingCh = await db.query.chapters.findFirst({ where: eq(chapters.id, chapterId) });

  if (!existingBab && !existingCh) {
    throw new Error(`Bab dengan ID '${chapterId}' tidak ditemukan.`);
  }

  const courseId = existingBab?.mataKuliahId || existingCh?.courseId || "";
  const updatedTitle = input.title?.trim() || existingBab?.title || existingCh?.title || "";
  const updatedOrder = input.orderIndex ?? existingBab?.orderIndex ?? existingCh?.orderIndex ?? 1;
  const updatedDesc = input.description !== undefined ? input.description.trim() : (existingCh?.description || null);

  await saveChapterWithCanonicalProjection({
    id: chapterId,
    courseId,
    title: updatedTitle,
    orderIndex: updatedOrder,
    description: updatedDesc,
    actorId: await resolvePenggunaActorId(actorId),
  });

  return {
    summary: `Bab '${chapterId}' ('${updatedTitle}') berhasil diperbarui.`,
    data: { id: chapterId, courseId, title: updatedTitle, orderIndex: updatedOrder },
  };
}

export interface ListMaterialsInput {
  courseId: string;
  chapterId?: string;
}

export async function executeListMaterials(input: ListMaterialsInput) {
  const courseId = input.courseId.trim().toLowerCase();
  if (!courseId) throw new Error("ID Mata Kuliah wajib diisi.");

  const query = db.select().from(courseMaterials).where(eq(courseMaterials.courseId, courseId));
  const materials = await query;

  return {
    summary: `Ditemukan ${materials.length} materi untuk mata kuliah '${courseId}'.`,
    data: materials.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      subcategory: m.subcategory,
      fileUrl: m.fileUrl,
      year: m.year,
      chapterIds: m.chapterIds,
      createdAt: m.createdAt,
    })),
  };
}

export interface AuditCourseCompletenessInput {
  courseId: string;
}

export async function executeAuditCourseCompleteness(input: AuditCourseCompletenessInput) {
  const cleanCourseId = input.courseId.trim().toLowerCase();
  if (!cleanCourseId) throw new Error("ID Mata Kuliah wajib diisi.");

  const [courseRecord, chaptersList, materialsList] = await Promise.all([
    db.query.mataKuliah.findFirst({ where: eq(mataKuliah.id, cleanCourseId) }) ||
      db.query.courses.findFirst({ where: eq(courses.id, cleanCourseId) }),
    db.select().from(bab).where(eq(bab.mataKuliahId, cleanCourseId)).orderBy(asc(bab.orderIndex)),
    db.select().from(courseMaterials).where(eq(courseMaterials.courseId, cleanCourseId)),
  ]);

  if (!courseRecord) {
    throw new Error(`Mata kuliah '${cleanCourseId}' tidak ditemukan.`);
  }

  const auditItems = chaptersList.map((ch) => {
    const matchingMaterials = materialsList.filter((m) =>
      m.chapterIds ? (m.chapterIds as string).includes(ch.id) : false
    );
    const hasMaterials = matchingMaterials.length > 0;

    return {
      chapterId: ch.id,
      title: ch.title,
      orderIndex: ch.orderIndex,
      materialCount: matchingMaterials.length,
      status: hasMaterials ? "complete" : "needs_material",
    };
  });

  const emptyChapters = auditItems.filter((it) => it.status === "needs_material");
  const isAllComplete = emptyChapters.length === 0 && auditItems.length > 0;

  return {
    summary: `Audit Kelengkapan '${courseRecord.title}' (${auditItems.length} bab): ${
      isAllComplete
        ? "Seluruh bab telah memiliki materi lengkap."
        : `${emptyChapters.length} bab belum memiliki berkas materi: ${emptyChapters.map((c) => c.title).join(", ")}.`
    }`,
    data: {
      courseId: cleanCourseId,
      courseTitle: courseRecord.title,
      totalChapters: auditItems.length,
      completeCount: auditItems.length - emptyChapters.length,
      emptyCount: emptyChapters.length,
      chapters: auditItems,
    },
  };
}
