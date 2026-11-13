import { randomUUID } from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, bab, chapters, courses, mataKuliah } from "@/db/schema";
import { validateCoursePricing, type CoursePricing } from "@/lib/student/course-pricing";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = Tx | typeof db;
type LegacyCourseInsert = typeof courses.$inferInsert;

export type CourseCanonicalSyncInput = {
  id: string;
  title: string;
  category: LegacyCourseInsert["category"];
  description?: string | null;
  isNew: boolean;
  actorId?: string | null;
  pricing?: CoursePricing;
};

export type ChapterCanonicalSyncInput = {
  id?: string | null;
  courseId: string;
  title: string;
  description?: string | null;
  orderIndex: number;
  actorId?: string | null;
};

function canonicalCourseCode(legacyCourseId: string): string {
  return `legacy-${legacyCourseId}`;
}

function canonicalChapterCode(legacyChapterId: string): string {
  return `legacy-${legacyChapterId}`;
}

async function recordAudit(
  tx: Tx,
  input: {
    actorId?: string | null;
    entityType: string;
    entityId: string;
    action: string;
    afterSnapshot: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(auditMutasi).values({
    id: randomUUID(),
    actorId: input.actorId ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    beforeSnapshot: null,
    afterSnapshot: input.afterSnapshot,
    correlationId: input.entityId,
  });
}

async function findCanonicalCourse(tx: DbOrTx, legacyCourseId: string) {
  const [row] = await tx
    .select({
      id: mataKuliah.id,
      legacyCourseId: mataKuliah.legacyCourseId,
      status: mataKuliah.status,
    })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.legacyCourseId, legacyCourseId), eq(mataKuliah.id, legacyCourseId)))
    .limit(1);
  return row ?? null;
}

async function requireCanonicalCourse(tx: DbOrTx, legacyCourseId: string) {
  const row = await findCanonicalCourse(tx, legacyCourseId);
  if (!row) throw new Error(`Canonical course target is missing for ${legacyCourseId}`);
  if (row.legacyCourseId && row.legacyCourseId !== legacyCourseId) {
    throw new Error(`Canonical course identity conflicts with ${legacyCourseId}`);
  }
  return row;
}

async function findCanonicalChapter(tx: DbOrTx, legacyChapterId: string) {
  const [row] = await tx
    .select({
      id: bab.id,
      courseId: bab.mataKuliahId,
      legacyChapterId: bab.legacyChapterId,
      status: bab.status,
    })
    .from(bab)
    .where(or(eq(bab.legacyChapterId, legacyChapterId), eq(bab.id, legacyChapterId)))
    .limit(1);
  return row ?? null;
}

async function upsertCanonicalCourse(
  tx: Tx,
  input: Pick<CourseCanonicalSyncInput, "id" | "title" | "pricing">,
): Promise<string> {
  const existing = await findCanonicalCourse(tx, input.id);
  const pricing = input.pricing === undefined ? undefined : validateCoursePricing(input.pricing);
  const pricingFields = pricing ? { pricingCategory: pricing.category, freeStartsAt: pricing.startsAt, freeEndsAt: pricing.endsAt } : {};
  if (existing) {
    if (existing.legacyCourseId && existing.legacyCourseId !== input.id) {
      throw new Error(`Canonical course identity conflicts with ${input.id}`);
    }
    await tx
      .update(mataKuliah)
      .set({ title: input.title, status: "active", legacyCourseId: input.id, ...pricingFields })
      .where(eq(mataKuliah.id, existing.id));
    return existing.id;
  }

  await tx.insert(mataKuliah).values({
    id: input.id,
    code: canonicalCourseCode(input.id),
    title: input.title,
    status: "active",
    legacyCourseId: input.id,
    ...pricingFields,
  });
  return input.id;
}

async function upsertCanonicalChapter(
  tx: Tx,
  input: {
    id: string;
    canonicalCourseId: string;
    title: string;
    orderIndex: number;
  },
): Promise<string> {
  const existing = await findCanonicalChapter(tx, input.id);
  if (existing) {
    if (existing.legacyChapterId && existing.legacyChapterId !== input.id) {
      throw new Error(`Canonical chapter identity conflicts with ${input.id}`);
    }
    if (existing.courseId !== input.canonicalCourseId) {
      throw new Error(`Canonical chapter course conflicts with ${input.id}`);
    }
    await tx
      .update(bab)
      .set({
        title: input.title,
        orderIndex: input.orderIndex,
        status: "active",
        legacyChapterId: input.id,
      })
      .where(eq(bab.id, existing.id));
    return existing.id;
  }

  await tx.insert(bab).values({
    id: input.id,
    mataKuliahId: input.canonicalCourseId,
    code: canonicalChapterCode(input.id),
    title: input.title,
    orderIndex: input.orderIndex,
    status: "active",
    legacyChapterId: input.id,
  });
  return input.id;
}

export async function saveCourseWithCanonicalProjection(
  input: CourseCanonicalSyncInput,
  callerTx?: Tx,
): Promise<{ id: string; canonicalCourseId: string }> {
  const execute = async (tx: Tx) => {
    if (input.isNew) {
      const [legacyExisting] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, input.id)).limit(1);
      const canonicalExisting = await findCanonicalCourse(tx, input.id);
      if (legacyExisting || canonicalExisting) throw new Error("COURSE_ALREADY_EXISTS");
      await tx.insert(courses).values({
        id: input.id,
        title: input.title,
        category: input.category,
        description: input.description ?? null,
      });
    } else {
      const [legacyExisting] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, input.id)).limit(1);
      if (!legacyExisting) throw new Error("COURSE_NOT_FOUND");
      await tx
        .update(courses)
        .set({
          title: input.title,
          category: input.category,
          description: input.description ?? null,
        })
        .where(eq(courses.id, input.id));
    }

    const canonicalCourseId = await upsertCanonicalCourse(tx, input);
    await recordAudit(tx, {
      actorId: input.actorId,
      entityType: "mata_kuliah",
      entityId: canonicalCourseId,
      action: input.isNew ? "canonical_create_with_legacy" : "canonical_update_with_legacy",
      afterSnapshot: { legacyCourseId: input.id, title: input.title, status: "active" },
    });
    return { id: input.id, canonicalCourseId };
  };

  return callerTx ? execute(callerTx) : db.transaction((tx) => execute(tx));
}

export async function reconcileLegacyCourseToCanonical(
  legacyCourseId: string,
  actorId?: string | null,
  callerTx?: Tx,
): Promise<{ id: string; canonicalCourseId: string }> {
  const execute = async (tx: Tx) => {
    const [legacy] = await tx
      .select({ id: courses.id, title: courses.title })
      .from(courses)
      .where(eq(courses.id, legacyCourseId))
      .limit(1);
    if (!legacy) throw new Error("COURSE_NOT_FOUND");
    const canonicalCourseId = await upsertCanonicalCourse(tx, legacy);
    await recordAudit(tx, {
      actorId,
      entityType: "mata_kuliah",
      entityId: canonicalCourseId,
      action: "canonical_reconcile_from_legacy",
      afterSnapshot: { legacyCourseId, title: legacy.title, status: "active" },
    });
    return { id: legacyCourseId, canonicalCourseId };
  };

  return callerTx ? execute(callerTx) : db.transaction((tx) => execute(tx));
}

export async function archiveCourseWithLegacyDeletion(
  legacyCourseId: string,
  actorId?: string | null,
  callerTx?: Tx,
): Promise<{ id: string; canonicalCourseId: string | null }> {
  const execute = async (tx: Tx) => {
    const canonical = await findCanonicalCourse(tx, legacyCourseId);
    if (canonical) {
      await tx.update(bab).set({ status: "archived" }).where(eq(bab.mataKuliahId, canonical.id));
      await tx.update(mataKuliah).set({ status: "archived" }).where(eq(mataKuliah.id, canonical.id));
    }
    await tx.delete(courses).where(eq(courses.id, legacyCourseId));
    await recordAudit(tx, {
      actorId,
      entityType: "mata_kuliah",
      entityId: canonical?.id ?? legacyCourseId,
      action: "canonical_archive_with_legacy_delete",
      afterSnapshot: { legacyCourseId, status: "archived" },
    });
    return { id: legacyCourseId, canonicalCourseId: canonical?.id ?? null };
  };

  return callerTx ? execute(callerTx) : db.transaction((tx) => execute(tx));
}

export async function saveChapterWithCanonicalProjection(
  input: ChapterCanonicalSyncInput,
  callerTx?: Tx,
): Promise<{ id: string; canonicalChapterId: string }> {
  const execute = async (tx: Tx) => {
    const canonicalCourse = await requireCanonicalCourse(tx, input.courseId);
    const id = input.id ?? randomUUID();

    if (!input.id) {
      await tx.insert(chapters).values({
        id,
        courseId: input.courseId,
        title: input.title,
        description: input.description ?? null,
        orderIndex: input.orderIndex,
        status: "published",
      });
    } else {
      const [legacyExisting] = await tx
        .select({ id: chapters.id })
        .from(chapters)
        .where(and(eq(chapters.id, id), eq(chapters.courseId, input.courseId)))
        .limit(1);
      if (!legacyExisting) throw new Error("CHAPTER_NOT_FOUND");
      await tx
        .update(chapters)
        .set({
          title: input.title,
          description: input.description ?? null,
          orderIndex: input.orderIndex,
        })
        .where(eq(chapters.id, id));
    }

    const canonicalChapterId = await upsertCanonicalChapter(tx, {
      id,
      canonicalCourseId: canonicalCourse.id,
      title: input.title,
      orderIndex: input.orderIndex,
    });
    await recordAudit(tx, {
      actorId: input.actorId,
      entityType: "bab",
      entityId: canonicalChapterId,
      action: input.id ? "canonical_update_with_legacy" : "canonical_create_with_legacy",
      afterSnapshot: { legacyChapterId: id, legacyCourseId: input.courseId, title: input.title, status: "active" },
    });
    return { id, canonicalChapterId };
  };

  return callerTx ? execute(callerTx) : db.transaction((tx) => execute(tx));
}

export async function reconcileLegacyChapterToCanonical(
  legacyChapterId: string,
  actorId?: string | null,
  callerTx?: Tx,
): Promise<{ id: string; canonicalChapterId: string }> {
  const execute = async (tx: Tx) => {
    const [legacy] = await tx
      .select({
        id: chapters.id,
        courseId: chapters.courseId,
        title: chapters.title,
        orderIndex: chapters.orderIndex,
      })
      .from(chapters)
      .where(eq(chapters.id, legacyChapterId))
      .limit(1);
    if (!legacy) throw new Error("CHAPTER_NOT_FOUND");
    const canonicalCourse = await requireCanonicalCourse(tx, legacy.courseId);
    const canonicalChapterId = await upsertCanonicalChapter(tx, {
      id: legacy.id,
      canonicalCourseId: canonicalCourse.id,
      title: legacy.title,
      orderIndex: legacy.orderIndex,
    });
    await recordAudit(tx, {
      actorId,
      entityType: "bab",
      entityId: canonicalChapterId,
      action: "canonical_reconcile_from_legacy",
      afterSnapshot: {
        legacyChapterId,
        legacyCourseId: legacy.courseId,
        title: legacy.title,
        status: "active",
      },
    });
    return { id: legacyChapterId, canonicalChapterId };
  };

  return callerTx ? execute(callerTx) : db.transaction((tx) => execute(tx));
}

export async function archiveChapterWithLegacyDeletion(
  legacyChapterId: string,
  actorId?: string | null,
  callerTx?: Tx,
): Promise<{ id: string; canonicalChapterId: string | null }> {
  const execute = async (tx: Tx) => {
    const [legacy] = await tx
      .select({ id: chapters.id, courseId: chapters.courseId })
      .from(chapters)
      .where(eq(chapters.id, legacyChapterId))
      .limit(1);
    if (!legacy) throw new Error("CHAPTER_NOT_FOUND");

    const canonical = await findCanonicalChapter(tx, legacyChapterId);
    if (canonical) {
      const [latest] = await tx
        .select({ orderIndex: bab.orderIndex })
        .from(bab)
        .where(eq(bab.mataKuliahId, canonical.courseId))
        .orderBy(desc(bab.orderIndex))
        .limit(1);
      await tx
        .update(bab)
        .set({ status: "archived", orderIndex: (latest?.orderIndex ?? 0) + 1 })
        .where(eq(bab.id, canonical.id));
    }
    await tx.delete(chapters).where(eq(chapters.id, legacyChapterId));
    await recordAudit(tx, {
      actorId,
      entityType: "bab",
      entityId: canonical?.id ?? legacyChapterId,
      action: "canonical_archive_with_legacy_delete",
      afterSnapshot: { legacyChapterId, legacyCourseId: legacy.courseId, status: "archived" },
    });
    return { id: legacyChapterId, canonicalChapterId: canonical?.id ?? null };
  };

  return callerTx ? execute(callerTx) : db.transaction((tx) => execute(tx));
}

export async function reorderChaptersWithCanonicalProjection(
  legacyCourseId: string,
  chapterIds: string[],
  actorId?: string | null,
  callerTx?: Tx,
): Promise<{ courseId: string; chapterIds: string[] }> {
  const execute = async (tx: Tx) => {
    if (new Set(chapterIds).size !== chapterIds.length) throw new Error("CHAPTER_ORDER_DUPLICATE");
    const legacyRows = await tx
      .select({ id: chapters.id, title: chapters.title })
      .from(chapters)
      .where(eq(chapters.courseId, legacyCourseId));
    if (legacyRows.length !== chapterIds.length || legacyRows.some((row) => !chapterIds.includes(row.id))) {
      throw new Error("CHAPTER_ORDER_SCOPE_MISMATCH");
    }

    const canonicalCourse = await requireCanonicalCourse(tx, legacyCourseId);
    const [latest] = await tx
      .select({ orderIndex: bab.orderIndex })
      .from(bab)
      .where(eq(bab.mataKuliahId, canonicalCourse.id))
      .orderBy(desc(bab.orderIndex))
      .limit(1);
    const temporaryBase = (latest?.orderIndex ?? 0) + chapterIds.length + 1;
    const titleById = new Map(legacyRows.map((row) => [row.id, row.title]));

    for (const [index, chapterId] of chapterIds.entries()) {
      await upsertCanonicalChapter(tx, {
        id: chapterId,
        canonicalCourseId: canonicalCourse.id,
        title: titleById.get(chapterId) ?? chapterId,
        orderIndex: temporaryBase + index,
      });
    }
    for (const [index, chapterId] of chapterIds.entries()) {
      const orderIndex = index + 1;
      await tx
        .update(chapters)
        .set({ orderIndex })
        .where(and(eq(chapters.id, chapterId), eq(chapters.courseId, legacyCourseId)));
      const canonical = await findCanonicalChapter(tx, chapterId);
      if (!canonical) throw new Error(`Canonical chapter target is missing for ${chapterId}`);
      await tx.update(bab).set({ orderIndex }).where(eq(bab.id, canonical.id));
    }

    await recordAudit(tx, {
      actorId,
      entityType: "bab",
      entityId: canonicalCourse.id,
      action: "canonical_reorder_with_legacy",
      afterSnapshot: { legacyCourseId, chapterIds },
    });
    return { courseId: legacyCourseId, chapterIds };
  };

  return callerTx ? execute(callerTx) : db.transaction((tx) => execute(tx));
}
