import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, or } from "drizzle-orm";
import type { db } from "@/db";
import { bab, chapters, flashcard, flashcards, flashcardSets, kemajuanFlashcardMurid, mataKuliah, rekomendasiFlashcard, setFlashcard } from "@/db/schema";
import { resolveCourseIdentity, type ResolvedCourseIdentity } from "@/lib/admin/course-identity";
import type { AdminFlashcardDraft, AdminFlashcardSetDraft } from "@/packages/native-parity/academic/courses/edit-contract";
import { flashcardRevision, flashcardSetRevision, legacyFlashcardSetStatus, legacyFlashcardStatus } from "./flashcard-admin-revisions";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type FlashcardAdminChange =
  | { kind: "set"; method: "create" | "update"; id?: string; draft: AdminFlashcardSetDraft }
  | { kind: "set"; method: "delete"; id: string; expectedRevision?: string }
  | { kind: "card"; method: "create" | "update"; id?: string; parentId?: string; draft: Omit<AdminFlashcardDraft, "targetSetId"> & { targetSetId?: string } }
  | { kind: "card"; method: "delete"; id: string; parentId?: string; expectedRevision?: string };

export async function requireFlashcardCourse(tx: Tx, slug: string) {
  const scope = await resolveCourseIdentity(slug, tx);
  if (!scope || scope.status !== "active") throw new Error("COURSE_NOT_FOUND");
  if (scope.canonicalId) {
    const [current] = await tx.select({ status: mataKuliah.status, legacyId: mataKuliah.legacyCourseId })
      .from(mataKuliah).where(eq(mataKuliah.id, scope.canonicalId)).limit(1).for("share");
    if (!current || current.status !== "active" || current.legacyId !== scope.legacyId) throw new Error("COURSE_NOT_FOUND");
  }
  return scope;
}

async function scopedSet(tx: Tx, scope: ResolvedCourseIdentity, id: string) {
  const [canonical] = await tx.select().from(setFlashcard).where(eq(setFlashcard.id, id)).limit(1).for("update");
  const [legacy] = await tx.select().from(flashcardSets).where(eq(flashcardSets.id, id)).limit(1).for("update");
  if ((!canonical && !legacy) || (canonical && !scope.allIds.includes(canonical.mataKuliahId)) ||
    (legacy && !scope.allIds.includes(legacy.courseId))) throw new Error("FLASHCARD_NOT_FOUND");
  return { canonical, legacy };
}

async function validateChapter(tx: Tx, scope: ResolvedCourseIdentity, requested: string | null) {
  if (!requested) return { canonicalId: null, legacyId: null };
  const canonicalMatches = await tx.select().from(bab).where(and(
    or(eq(bab.id, requested), eq(bab.legacyChapterId, requested)),
    inArray(bab.mataKuliahId, scope.allIds),
    eq(bab.status, "active"),
  )).limit(2).for("share");
  if (canonicalMatches.length > 1) throw new Error("INVALID_FLASHCARD_CHAPTER");
  const [canonical] = canonicalMatches;
  const [legacy] = await tx.select().from(chapters).where(and(
    eq(chapters.id, canonical?.legacyChapterId ?? requested), inArray(chapters.courseId, scope.allIds),
  )).limit(1).for("share");
  if (!canonical && !legacy) throw new Error("INVALID_FLASHCARD_CHAPTER");
  return { canonicalId: canonical?.id ?? null, legacyId: legacy?.id ?? null };
}

function expectRevision(expected: string | null | undefined, actual: string) {
  if (expected && expected !== actual) throw new Error("REVISION_CONFLICT");
}

async function requireNoCanonicalReviewReferences(tx: Tx, cardIds: string[]) {
  if (!cardIds.length) return;
  const [progress] = await tx.select({ id: kemajuanFlashcardMurid.id }).from(kemajuanFlashcardMurid)
    .where(inArray(kemajuanFlashcardMurid.flashcardId, cardIds)).limit(1);
  const [recommendation] = await tx.select({ id: rekomendasiFlashcard.id }).from(rekomendasiFlashcard)
    .where(inArray(rekomendasiFlashcard.flashcardId, cardIds)).limit(1);
  if (progress || recommendation) throw new Error("DEPENDENCIES_EXIST");
}

export async function applyFlashcardAdminChange(tx: Tx, scope: ResolvedCourseIdentity, actorId: string, change: FlashcardAdminChange): Promise<string> {
  if (change.kind === "set") return saveSet(tx, scope, actorId, change);
  return saveCard(tx, scope, change);
}

async function saveSet(tx: Tx, scope: ResolvedCourseIdentity, actorId: string, change: Extract<FlashcardAdminChange, { kind: "set" }>) {
  if (change.method === "create") {
    if (!scope.canonicalId) throw new Error("COURSE_PROJECTION_UNAVAILABLE");
    const { chapterId, title, status } = change.draft;
    const chapter = await validateChapter(tx, scope, chapterId);
    if (chapterId && !chapter.canonicalId) throw new Error("INVALID_FLASHCARD_CHAPTER");
    const id = `fcset-${randomUUID().slice(0, 12)}`;
    await tx.insert(setFlashcard).values({
      id, mataKuliahId: scope.canonicalId, babId: chapter.canonicalId, title, status,
      generationHash: "manual", creatorId: actorId, curatorId: actorId, publishedAt: status === "published" ? new Date() : null,
    });
    return id;
  }

  const id = change.id!;
  const { canonical, legacy } = await scopedSet(tx, scope, id);
  const view = canonical
    ? { ...canonical, chapterId: canonical.babId }
    : { ...legacy!, status: legacyFlashcardSetStatus(legacy!.status) };
  if (change.method === "delete") {
    const canonicalCards = canonical ? await tx.select().from(flashcard).where(eq(flashcard.setFlashcardId, id)).for("update") : [];
    const legacyCards = legacy ? await tx.select().from(flashcards).where(eq(flashcards.setId, id)).for("update") : [];
    if (canonical && legacyCards.some(row => !canonicalCards.some(card => card.id === row.id))) throw new Error("DEPENDENCIES_EXIST");
    const visible = canonical ? canonicalCards : legacyCards.map(row => ({
      ...row, status: legacyFlashcardStatus(row.status), updatedAt: row.createdAt,
    }));
    expectRevision(change.expectedRevision, flashcardSetRevision(view, visible));
    await requireNoCanonicalReviewReferences(tx, canonicalCards.map(card => card.id));
    if (canonical) await tx.delete(setFlashcard).where(eq(setFlashcard.id, id));
    if (legacy) await tx.delete(flashcardSets).where(eq(flashcardSets.id, id));
    return id;
  }

  expectRevision(change.draft.expectedRevision, flashcardSetRevision(view));
  const { title, status, chapterId } = change.draft;
  const chapter = await validateChapter(tx, scope, chapterId);
  if ((canonical && chapterId && !chapter.canonicalId) || (!canonical && !chapter.legacyId)) {
    throw new Error("INVALID_FLASHCARD_CHAPTER");
  }
  if (canonical) {
    await tx.update(setFlashcard).set({
      title, status, babId: chapter.canonicalId, publishedAt: status === "published" ? new Date() : null,
    }).where(eq(setFlashcard.id, id));
  }
  if (legacy) {
    await tx.update(flashcardSets).set({
      title, status: chapter.legacyId && status === "published" ? "published" : "draft",
      ...(chapter.legacyId ? { chapterId: chapter.legacyId } : {}),
    }).where(eq(flashcardSets.id, id));
  }
  return id;
}

function legacyCardStatus(status: AdminFlashcardDraft["status"]) {
  return status === "published" ? "active" as const : "retired" as const;
}

async function saveCard(tx: Tx, scope: ResolvedCourseIdentity, change: Extract<FlashcardAdminChange, { kind: "card" }>) {
  if (change.method === "create") {
    const id = `fc-${randomUUID().slice(0, 12)}`;
    const { targetSetId, status, front, back, explanation } = change.draft;
    if (!targetSetId || (change.parentId && change.parentId !== targetSetId)) throw new Error("INVALID_FLASHCARD_SET");
    const { canonical, legacy } = await scopedSet(tx, scope, targetSetId);
    if (canonical) await tx.insert(flashcard).values({ id, setFlashcardId: targetSetId, front, back, explanation, status, generationHash: "manual" });
    if (legacy) await tx.insert(flashcards).values({ id, setId: targetSetId, front, back, explanation, status: legacyCardStatus(status) });
    return id;
  }

  const id = change.id!;
  const [canonical] = await tx.select().from(flashcard).where(eq(flashcard.id, id)).limit(1).for("update");
  const [legacy] = await tx.select().from(flashcards).where(eq(flashcards.id, id)).limit(1).for("update");
  const sourceId = canonical?.setFlashcardId ?? legacy?.setId;
  if (!sourceId || (change.parentId && change.parentId !== sourceId) || (legacy && legacy.setId !== sourceId)) {
    throw new Error("FLASHCARD_NOT_FOUND");
  }
  await scopedSet(tx, scope, sourceId);
  const revision = canonical ? flashcardRevision(canonical) : flashcardRevision({
    ...legacy!, status: legacyFlashcardStatus(legacy!.status), updatedAt: legacy!.createdAt,
  });
  if (change.method === "delete") {
    expectRevision(change.expectedRevision, revision);
    if (canonical) {
      await requireNoCanonicalReviewReferences(tx, [id]);
      await tx.delete(flashcard).where(eq(flashcard.id, id));
    }
    if (legacy) await tx.delete(flashcards).where(eq(flashcards.id, id));
    return id;
  }

  const { targetSetId = sourceId, status, front, back, explanation, expectedRevision } = change.draft;
  expectRevision(expectedRevision, revision);
  const target = await scopedSet(tx, scope, targetSetId);
  if ((canonical && !target.canonical) || (legacy && !target.legacy)) throw new Error("INVALID_FLASHCARD_SET");
  if (canonical) await tx.update(flashcard).set({ setFlashcardId: targetSetId, front, back, explanation, status }).where(eq(flashcard.id, id));
  if (legacy) await tx.update(flashcards).set({ setId: targetSetId, front, back, explanation, status: legacyCardStatus(status) }).where(eq(flashcards.id, id));
  return id;
}

export function revalidateCourseFlashcards(scope: Pick<ResolvedCourseIdentity, "slug" | "primaryId" | "legacyId">) {
  for (const value of new Set([scope.slug, scope.primaryId, scope.legacyId])) {
    if (!value) continue;
    const id = encodeURIComponent(value);
    revalidatePath(`/admin/courses/${id}/flashcards`);
    revalidatePath(`/courses/${id}/flashcard`);
  }
}
