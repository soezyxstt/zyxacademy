"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  setFlashcard,
  flashcard,
  bab,
  mataKuliah,
  flashcardSets,
  flashcards,
  chapters,
  courses,
} from "@/db/schema";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { eq, and, inArray, desc, asc } from "drizzle-orm";
import { randomUUID } from "crypto";

export type AdminFlashcardCard = {
  id: string;
  setId: string;
  front: string;
  back: string;
  explanation: string | null;
  status: "draft" | "published" | "retired";
  createdAt: Date;
  updatedAt: Date;
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
  }>;
  sets: AdminFlashcardSet[];
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

  const chapterMap = new Map<string, string>();
  const chapterList: Array<{ id: string; title: string; orderIndex: number }> = [];

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
  const missingLegacySetIds = missingLegacySets.map((ls) => ls.id);

  if (missingLegacySetIds.length > 0) {
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
      .where(inArray(flashcards.setId, missingLegacySetIds))
      .orderBy(desc(flashcards.createdAt));

    for (const card of legacyCards) {
      const list = cardsBySet.get(card.setId) ?? [];
      list.push({
        id: card.id,
        setId: card.setId,
        front: card.front,
        back: card.back,
        explanation: card.explanation,
        status: (card.status === "active" ? "published" : "draft") as "published" | "draft",
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
      status: (ls.status === "published" ? "published" : "draft") as "published" | "draft",
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
  }));

  return {
    course: {
      id: identity.primaryId,
      title: identity.title,
      slug: identity.slug,
    },
    chapters: chapterList,
    sets,
  };
}

export async function createFlashcardSetAction(input: {
  courseSlug: string;
  courseId: string;
  babId?: string | null;
  title: string;
  status?: "draft" | "published";
}): Promise<{ success: boolean; setId?: string; error?: string }> {
  try {
    const { user } = await assertAdmin();

    const title = input.title.trim();
    if (!title) return { success: false, error: "Judul set flashcard tidak boleh kosong." };

    const setId = `fcset-${randomUUID().slice(0, 12)}`;
    const now = new Date();
    const status = input.status ?? "published";

    await db.insert(setFlashcard).values({
      id: setId,
      mataKuliahId: input.courseId,
      babId: input.babId || null,
      title,
      version: 1,
      status,
      generationHash: "manual",
      creatorId: user.id,
      curatorId: user.id,
      publishedAt: status === "published" ? now : null,
      createdAt: now,
      updatedAt: now,
    });

    try {
      if (input.babId) {
        await db.insert(flashcardSets).values({
          id: setId,
          courseId: input.courseId,
          chapterId: input.babId,
          sourceMtdId: "legacy-manual",
          sourceMtdVersion: 1,
          title,
          status: status === "published" ? "published" : "draft",
          generationHash: "manual",
          createdAt: now,
          updatedAt: now,
        }).onConflictDoNothing();
      }
    } catch {
      // Ignore legacy sync failures
    }

    revalidatePath(`/admin/courses/${encodeURIComponent(input.courseSlug)}/flashcards`);
    return { success: true, setId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Gagal membuat set flashcard" };
  }
}

export async function updateFlashcardSetAction(input: {
  courseSlug: string;
  setId: string;
  title: string;
  babId?: string | null;
  status: "draft" | "published" | "retired";
}): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAdmin();

    const title = input.title.trim();
    if (!title) return { success: false, error: "Judul set flashcard tidak boleh kosong." };

    const now = new Date();
    await db
      .update(setFlashcard)
      .set({
        title,
        babId: input.babId || null,
        status: input.status,
        publishedAt: input.status === "published" ? now : null,
        updatedAt: now,
      })
      .where(eq(setFlashcard.id, input.setId));

    try {
      await db
        .update(flashcardSets)
        .set({
          title,
          ...(input.babId ? { chapterId: input.babId } : {}),
          status: input.status === "published" ? "published" : "draft",
          updatedAt: now,
        })
        .where(eq(flashcardSets.id, input.setId));
    } catch {
      // Ignore legacy sync failures
    }

    revalidatePath(`/admin/courses/${encodeURIComponent(input.courseSlug)}/flashcards`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Gagal memperbarui set flashcard" };
  }
}

export async function deleteFlashcardSetAction(input: {
  courseSlug: string;
  setId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAdmin();

    await db.delete(flashcard).where(eq(flashcard.setFlashcardId, input.setId));
    await db.delete(setFlashcard).where(eq(setFlashcard.id, input.setId));

    try {
      await db.delete(flashcards).where(eq(flashcards.setId, input.setId));
      await db.delete(flashcardSets).where(eq(flashcardSets.id, input.setId));
    } catch {
      // Ignore legacy sync failures
    }

    revalidatePath(`/admin/courses/${encodeURIComponent(input.courseSlug)}/flashcards`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Gagal menghapus set flashcard" };
  }
}

export async function createFlashcardAction(input: {
  courseSlug: string;
  setId: string;
  front: string;
  back: string;
  explanation?: string | null;
  status?: "draft" | "published";
}): Promise<{ success: boolean; cardId?: string; error?: string }> {
  try {
    await assertAdmin();

    const front = input.front.trim();
    const back = input.back.trim();
    if (!front || !back) {
      return { success: false, error: "Sisi depan dan belakang kartu tidak boleh kosong." };
    }

    const cardId = `fc-${randomUUID().slice(0, 12)}`;
    const now = new Date();
    const status = input.status ?? "published";

    await db.insert(flashcard).values({
      id: cardId,
      setFlashcardId: input.setId,
      front,
      back,
      explanation: input.explanation?.trim() || null,
      version: 1,
      status,
      generationHash: "manual",
      createdAt: now,
      updatedAt: now,
    });

    try {
      await db.insert(flashcards).values({
        id: cardId,
        setId: input.setId,
        front,
        back,
        explanation: input.explanation?.trim() || null,
        status: status === "published" ? "active" : "retired",
        createdAt: now,
      }).onConflictDoNothing();
    } catch {
      // Ignore legacy sync failures
    }

    revalidatePath(`/admin/courses/${encodeURIComponent(input.courseSlug)}/flashcards`);
    return { success: true, cardId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Gagal menambahkan flashcard" };
  }
}

export async function updateFlashcardAction(input: {
  courseSlug: string;
  id: string;
  setId?: string;
  front: string;
  back: string;
  explanation?: string | null;
  status: "draft" | "published" | "retired";
}): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAdmin();

    const front = input.front.trim();
    const back = input.back.trim();
    if (!front || !back) {
      return { success: false, error: "Sisi depan dan belakang kartu tidak boleh kosong." };
    }

    const now = new Date();
    const updateData: {
      front: string;
      back: string;
      explanation: string | null;
      status: "draft" | "published" | "retired";
      updatedAt: Date;
      setFlashcardId?: string;
    } = {
      front,
      back,
      explanation: input.explanation?.trim() || null,
      status: input.status,
      updatedAt: now,
    };
    if (input.setId) {
      updateData.setFlashcardId = input.setId;
    }

    await db.update(flashcard).set(updateData).where(eq(flashcard.id, input.id));

    try {
      await db
        .update(flashcards)
        .set({
          front,
          back,
          explanation: input.explanation?.trim() || null,
          status: input.status === "published" ? "active" : "retired",
          ...(input.setId ? { setId: input.setId } : {}),
        })
        .where(eq(flashcards.id, input.id));
    } catch {
      // Ignore legacy sync failures
    }

    revalidatePath(`/admin/courses/${encodeURIComponent(input.courseSlug)}/flashcards`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Gagal memperbarui flashcard" };
  }
}

export async function deleteFlashcardAction(input: {
  courseSlug: string;
  id: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAdmin();

    await db.delete(flashcard).where(eq(flashcard.id, input.id));

    try {
      await db.delete(flashcards).where(eq(flashcards.id, input.id));
    } catch {
      // Ignore legacy sync failures
    }

    revalidatePath(`/admin/courses/${encodeURIComponent(input.courseSlug)}/flashcards`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Gagal menghapus flashcard" };
  }
}
