"use server";

import { db } from "@/db";
import {
  setFlashcard,
  flashcard,
  bab,
  flashcardSets,
  flashcards,
  chapters,
} from "@/db/schema";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { eq, and, inArray, desc, asc } from "drizzle-orm";
import { applyFlashcardAdminChange, requireFlashcardCourse, revalidateCourseFlashcards, type FlashcardAdminChange } from "@/lib/academic/flashcard-admin-writes";
import { legacyFlashcardSetStatus, legacyFlashcardStatus } from "@/lib/academic/flashcard-admin-revisions";

export type AdminFlashcardCard = {
  id: string;
  setId: string;
  front: string;
  back: string;
  explanation: string | null;
  status: "draft" | "published" | "retired";
  createdAt: Date;
  updatedAt: Date;
  mirrored?: boolean;
};

export type AdminFlashcardSet = {
  id: string;
  title: string;
  courseId: string;
  chapterId: string | null;
  chapterTitle: string | null;
  status: "draft" | "in_review" | "published" | "retired";
  createdAt: Date;
  updatedAt: Date;
  cards: AdminFlashcardCard[];
  projection?: "canonical" | "legacy" | "mirrored";
};

export type CourseFlashcardsData = {
  course: {
    id: string;
    title: string;
    slug: string;
  };
  chapters: Array<{
    id: string;
    title: string;
    orderIndex: number;
    legacyId?: string | null;
  }>;
  sets: AdminFlashcardSet[];
  legacyChapters: CourseFlashcardsData["chapters"];
};

export async function getCourseFlashcardsData(
  courseIdOrSlug: string
): Promise<CourseFlashcardsData | null> {
  await assertAdmin();

  const identity = await resolveCourseIdentity(courseIdOrSlug);
  if (!identity) return null;

  // 1. Fetch chapters for this course
  const [canonicalBab, legacyChapters] = await Promise.all([
    db
      .select({
        id: bab.id,
        title: bab.title,
        orderIndex: bab.orderIndex,
        legacyId: bab.legacyChapterId,
      })
      .from(bab)
      .where(and(inArray(bab.mataKuliahId, identity.allIds), eq(bab.status, "active")))
      .orderBy(asc(bab.orderIndex)),
    db
      .select({
        id: chapters.id,
        title: chapters.title,
        orderIndex: chapters.orderIndex,
      })
      .from(chapters)
      .where(inArray(chapters.courseId, identity.allIds))
      .orderBy(asc(chapters.orderIndex)),
  ]);

  const chapterMap = new Map(legacyChapters.map(({ id, title }) => [id, title]));
  const chapterList: CourseFlashcardsData["chapters"] = [];

  if (canonicalBab.length > 0) {
    for (const b of canonicalBab) {
      chapterMap.set(b.id, b.title);
      chapterList.push(b);
    }
  } else {
    for (const c of legacyChapters) {
      chapterMap.set(c.id, c.title);
      chapterList.push(c);
    }
  }

  // 2. Fetch canonical flashcard sets
  const canonicalSets = await db
    .select({
      id: setFlashcard.id,
      title: setFlashcard.title,
      courseId: setFlashcard.mataKuliahId,
      chapterId: setFlashcard.babId,
      status: setFlashcard.status,
      createdAt: setFlashcard.createdAt,
      updatedAt: setFlashcard.updatedAt,
    })
    .from(setFlashcard)
    .where(inArray(setFlashcard.mataKuliahId, identity.allIds))
    .orderBy(desc(setFlashcard.createdAt));

  const canonicalSetIds = canonicalSets.map((s) => s.id);

  // 3. Fetch canonical cards
  const canonicalCards =
    canonicalSetIds.length > 0
      ? await db
          .select({
            id: flashcard.id,
            setId: flashcard.setFlashcardId,
            front: flashcard.front,
            back: flashcard.back,
            explanation: flashcard.explanation,
            status: flashcard.status,
            createdAt: flashcard.createdAt,
            updatedAt: flashcard.updatedAt,
          })
          .from(flashcard)
          .where(inArray(flashcard.setFlashcardId, canonicalSetIds))
          .orderBy(desc(flashcard.createdAt))
      : [];

  const cardsBySet = new Map<string, AdminFlashcardCard[]>();
  const canonicalCardsById = new Map(canonicalCards.map(card => [card.id, card as AdminFlashcardCard]));
  for (const card of canonicalCards) {
    const list = cardsBySet.get(card.setId) ?? [];
    list.push(card);
    cardsBySet.set(card.setId, list);
  }

  // 4. Fetch legacy sets as fallback if not present in canonical
  const existingSetIds = new Set(canonicalSetIds);
  const legacySets = await db
    .select({
      id: flashcardSets.id,
      title: flashcardSets.title,
      courseId: flashcardSets.courseId,
      chapterId: flashcardSets.chapterId,
      status: flashcardSets.status,
      createdAt: flashcardSets.createdAt,
      updatedAt: flashcardSets.updatedAt,
    })
    .from(flashcardSets)
    .where(inArray(flashcardSets.courseId, identity.allIds))
    .orderBy(desc(flashcardSets.createdAt));

  const missingLegacySets = legacySets.filter((ls) => !existingSetIds.has(ls.id));
  const legacySetIds = legacySets.map((ls) => ls.id);
  const mirroredSetIds = new Set(legacySetIds);

  if (legacySetIds.length > 0) {
    const legacyCards = await db
      .select({
        id: flashcards.id,
        setId: flashcards.setId,
        front: flashcards.front,
        back: flashcards.back,
        explanation: flashcards.explanation,
        status: flashcards.status,
        createdAt: flashcards.createdAt,
      })
      .from(flashcards)
      .where(inArray(flashcards.setId, legacySetIds))
      .orderBy(desc(flashcards.createdAt));

    for (const card of legacyCards) {
      const list = cardsBySet.get(card.setId) ?? [];
      if (existingSetIds.has(card.setId)) {
        const mirrored = canonicalCardsById.get(card.id);
        if (mirrored?.setId === card.setId) mirrored.mirrored = true;
        continue;
      }
      list.push({
        id: card.id,
        setId: card.setId,
        front: card.front,
        back: card.back,
        explanation: card.explanation,
        status: legacyFlashcardStatus(card.status),
        createdAt: card.createdAt ?? new Date(),
        updatedAt: card.createdAt ?? new Date(),
      });
      cardsBySet.set(card.setId, list);
    }
  }

  const allSetRows = [
    ...canonicalSets,
    ...missingLegacySets.map((ls) => ({
      ...ls,
      status: legacyFlashcardSetStatus(ls.status),
      createdAt: ls.createdAt ?? new Date(),
      updatedAt: ls.updatedAt ?? new Date(),
    })),
  ];

  const sets: AdminFlashcardSet[] = allSetRows.map((s) => ({
    id: s.id,
    title: s.title,
    courseId: s.courseId,
    chapterId: s.chapterId,
    chapterTitle: s.chapterId ? chapterMap.get(s.chapterId) ?? null : null,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    cards: cardsBySet.get(s.id) ?? [],
    projection: existingSetIds.has(s.id) ? (mirroredSetIds.has(s.id) ? "mirrored" : "canonical") : "legacy",
  }));

  return {
    course: {
      id: identity.primaryId,
      title: identity.title,
      slug: identity.slug,
    },
    chapters: chapterList,
    legacyChapters,
    sets,
  };
}


async function mutate(courseSlug: string, change: FlashcardAdminChange, submittedCourseId?: string) {
  const { user } = await assertAdmin();
  const result = await db.transaction(async tx => {
    const scope = await requireFlashcardCourse(tx, courseSlug);
    if (submittedCourseId !== undefined && !scope.allIds.includes(submittedCourseId)) throw new Error("COURSE_NOT_FOUND");
    const id = await applyFlashcardAdminChange(tx, scope, user.id, change);
    return { id, scope };
  }, { isolationLevel: "serializable" });
  revalidateCourseFlashcards(result.scope);
  return result.id;
}

function actionError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (error.message === "COURSE_NOT_FOUND" || error.message === "FLASHCARD_NOT_FOUND") return "Set atau kartu tidak ditemukan pada mata kuliah ini.";
    if (error.message === "INVALID_FLASHCARD_CHAPTER") return "Pilih bab yang tersedia untuk set ini.";
    if (error.message === "INVALID_FLASHCARD_SET") return "Pilih set yang mendukung kartu ini.";
    if (error.message === "DEPENDENCIES_EXIST") return "Periksa kartu terkait sebelum menghapus set ini.";
  }
  return fallback;
}

export async function createFlashcardSetAction(input: {
  courseSlug: string; courseId: string; babId?: string | null; title: string; status?: "draft" | "published";
}): Promise<{ success: boolean; setId?: string; error?: string }> {
  const title = input.title.trim();
  if (!title) return { success: false, error: "Judul set flashcard tidak boleh kosong." };
  try {
    const setId = await mutate(input.courseSlug, { kind: "set", method: "create", draft: {
      title, chapterId: input.babId || null, status: input.status ?? "published", expectedRevision: null,
    } }, input.courseId);
    return { success: true, setId };
  } catch (error) {
    return { success: false, error: actionError(error, "Gagal membuat set flashcard") };
  }
}

export async function updateFlashcardSetAction(input: {
  courseSlug: string; setId: string; title: string; babId?: string | null; status: "draft" | "published" | "retired";
}): Promise<{ success: boolean; error?: string }> {
  const title = input.title.trim();
  if (!title) return { success: false, error: "Judul set flashcard tidak boleh kosong." };
  try {
    await mutate(input.courseSlug, { kind: "set", method: "update", id: input.setId, draft: {
      title, chapterId: input.babId || null, status: input.status, expectedRevision: null,
    } });
    return { success: true };
  } catch (error) {
    return { success: false, error: actionError(error, "Gagal memperbarui set flashcard") };
  }
}

export async function deleteFlashcardSetAction(input: { courseSlug: string; setId: string }): Promise<{ success: boolean; error?: string }> {
  try {
    await mutate(input.courseSlug, { kind: "set", method: "delete", id: input.setId });
    return { success: true };
  } catch (error) {
    return { success: false, error: actionError(error, "Gagal menghapus set flashcard") };
  }
}

export async function createFlashcardAction(input: {
  courseSlug: string; setId: string; front: string; back: string; explanation?: string | null; status?: "draft" | "published";
}): Promise<{ success: boolean; cardId?: string; error?: string }> {
  const front = input.front.trim();
  const back = input.back.trim();
  if (!front || !back) return { success: false, error: "Sisi depan dan belakang kartu tidak boleh kosong." };
  try {
    const cardId = await mutate(input.courseSlug, { kind: "card", method: "create", parentId: input.setId, draft: {
      targetSetId: input.setId, front, back, explanation: input.explanation?.trim() || null,
      status: input.status ?? "published", expectedRevision: null,
    } });
    return { success: true, cardId };
  } catch (error) {
    return { success: false, error: actionError(error, "Gagal menambahkan flashcard") };
  }
}

export async function updateFlashcardAction(input: {
  courseSlug: string; id: string; setId?: string; front: string; back: string; explanation?: string | null;
  status: "draft" | "published" | "retired";
}): Promise<{ success: boolean; error?: string }> {
  const front = input.front.trim();
  const back = input.back.trim();
  if (!front || !back) return { success: false, error: "Sisi depan dan belakang kartu tidak boleh kosong." };
  try {
    await mutate(input.courseSlug, { kind: "card", method: "update", id: input.id, draft: {
      targetSetId: input.setId || undefined, front, back, explanation: input.explanation?.trim() || null,
      status: input.status, expectedRevision: null,
    } });
    return { success: true };
  } catch (error) {
    return { success: false, error: actionError(error, "Gagal memperbarui flashcard") };
  }
}

export async function deleteFlashcardAction(input: { courseSlug: string; id: string }): Promise<{ success: boolean; error?: string }> {
  try {
    await mutate(input.courseSlug, { kind: "card", method: "delete", id: input.id });
    return { success: true };
  } catch (error) {
    return { success: false, error: actionError(error, "Gagal menghapus flashcard") };
  }
}
