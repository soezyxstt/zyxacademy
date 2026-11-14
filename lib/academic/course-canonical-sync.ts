import { randomUUID } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, bab, chapters, courses, knowledgeObjects, mataKuliah, vectorSyncQueue } from "@/db/schema";
import { dispatchVectorSync } from "@/lib/vector-sync-dispatch";
import { validateCoursePricing, type CoursePricing } from "@/lib/student/course-pricing";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = Tx | typeof db;
type LegacyCourseInsert = typeof courses.$inferInsert;

export type CourseCanonicalSyncInput = {
  id: string;
  title: string;
  category: LegacyCourseInsert["category"] | "Umum";
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
  append?: boolean;
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
  const rows = await tx
    .select({
      id: mataKuliah.id,
      legacyCourseId: mataKuliah.legacyCourseId,
      status: mataKuliah.status,
    })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.legacyCourseId, legacyCourseId), eq(mataKuliah.id, legacyCourseId)))
    .limit(2);
  if (rows.length > 1) throw new Error("COURSE_IDENTITY_AMBIGUOUS");
  return rows[0] ?? null;
}

async function requireCanonicalCourse(tx: DbOrTx, courseId: string) {
  const row = await findCanonicalCourse(tx, courseId);
  if (!row) throw new Error(`Canonical course target is missing for ${courseId}`);
  const [sameIdLegacy] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, row.id)).limit(1);
  if (sameIdLegacy && row.legacyCourseId !== row.id) throw new Error("COURSE_IDENTITY_AMBIGUOUS");
  if (row.legacyCourseId) {
    const alias = await findCanonicalCourse(tx, row.legacyCourseId);
    const [legacy] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, row.legacyCourseId)).limit(1);
    if (alias?.id !== row.id || !legacy) throw new Error("COURSE_IDENTITY_AMBIGUOUS");
  }
  return row;
}

async function lockChapterCourse(tx: Tx, courseId: string) {
  const course = await requireCanonicalCourse(tx, courseId);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`zyx:chapters:${course.id}`}, 0))`);
  return requireCanonicalCourse(tx, courseId);
}

async function findCanonicalChapter(tx: DbOrTx, chapterId: string) {
  const rows = await tx.select({
    id: bab.id, courseId: bab.mataKuliahId, legacyChapterId: bab.legacyChapterId,
    status: bab.status, orderIndex: bab.orderIndex, title: bab.title,
  }).from(bab).where(or(eq(bab.legacyChapterId, chapterId), eq(bab.id, chapterId))).limit(2);
  if (rows.length > 1) throw new Error("CHAPTER_IDENTITY_AMBIGUOUS");
  return rows[0] ?? null;
}

async function resolveChapter(tx: Tx, chapterId: string, course: Awaited<ReturnType<typeof requireCanonicalCourse>>) {
  const canonical = await findCanonicalChapter(tx, chapterId);
  if (canonical && canonical.courseId !== course.id) throw new Error("CHAPTER_NOT_FOUND");
  if (canonical?.legacyChapterId) {
    const alias = await findCanonicalChapter(tx, canonical.legacyChapterId);
    if (alias?.id !== canonical.id) throw new Error("CHAPTER_IDENTITY_AMBIGUOUS");
  }
  const [sameIdLegacy] = canonical ? await tx.select({ id: chapters.id }).from(chapters).where(eq(chapters.id, canonical.id)).limit(1) : [];
  if (sameIdLegacy && canonical?.legacyChapterId !== sameIdLegacy.id) throw new Error("CHAPTER_IDENTITY_AMBIGUOUS");
  const legacyId = canonical ? canonical.legacyChapterId : chapterId;
  const [legacy] = legacyId ? await tx.select({ id: chapters.id, courseId: chapters.courseId, title: chapters.title, orderIndex: chapters.orderIndex })
    .from(chapters).where(eq(chapters.id, legacyId)).limit(1) : [];
  if (canonical?.legacyChapterId && !legacy) throw new Error("CHAPTER_IDENTITY_AMBIGUOUS");
  if (legacy && legacy.courseId !== course.legacyCourseId) throw new Error("CHAPTER_NOT_FOUND");
  if (!canonical && !legacy) throw new Error("CHAPTER_NOT_FOUND");
  return { canonical, legacy };
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
    const canonical = await findCanonicalCourse(tx, input.id);
    const [sameIdLegacy] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, input.id)).limit(1);
    if (input.isNew && (sameIdLegacy || canonical)) throw new Error("COURSE_ALREADY_EXISTS");
    if (canonical?.legacyCourseId && canonical.legacyCourseId !== canonical.id) {
      const aliasTarget = await findCanonicalCourse(tx, canonical.legacyCourseId);
      const [conflictingLegacy] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, canonical.id)).limit(1);
      if (aliasTarget?.id !== canonical.id || conflictingLegacy) throw new Error("COURSE_IDENTITY_AMBIGUOUS");
    }

    let legacyId: string | null = input.id;
    if (input.isNew) {
      if (input.category === "Umum") throw new Error("COURSE_PROJECTION_UNAVAILABLE");
      await tx.insert(courses).values({
        id: input.id,
        title: input.title,
        category: input.category,
        description: input.description ?? null,
      });
    } else {
      legacyId = canonical?.legacyCourseId ?? (sameIdLegacy ? input.id : null);
      if (!canonical && !legacyId) throw new Error("COURSE_NOT_FOUND");
      if (!legacyId && (input.category !== "Umum" || input.description)) throw new Error("COURSE_PROJECTION_UNAVAILABLE");
      if (legacyId) {
        if (input.category === "Umum") throw new Error("COURSE_PROJECTION_UNAVAILABLE");
        await tx.update(courses).set({
          title: input.title,
          category: input.category,
          description: input.description ?? null,
        }).where(eq(courses.id, legacyId));
      }
    }

    let canonicalCourseId: string;
    if (canonical) {
      const pricing = input.pricing === undefined ? undefined : validateCoursePricing(input.pricing);
      await tx.update(mataKuliah).set({
        title: input.title,
        status: "active",
        ...(pricing ? { pricingCategory: pricing.category, freeStartsAt: pricing.startsAt, freeEndsAt: pricing.endsAt } : {}),
      }).where(eq(mataKuliah.id, canonical.id));
      canonicalCourseId = canonical.id;
    } else {
      canonicalCourseId = await upsertCanonicalCourse(tx, input);
    }
    await recordAudit(tx, {
      actorId: input.actorId,
      entityType: "mata_kuliah",
      entityId: canonicalCourseId,
      action: input.isNew ? "canonical_create_with_legacy" : legacyId ? "canonical_update_with_legacy" : "canonical_update",
      afterSnapshot: { legacyCourseId: legacyId, title: input.title, status: "active" },
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
): Promise<{ id: string; canonicalChapterId: string; orderIndex: number }> {
  const execute = async (tx: Tx) => {
    const course = await lockChapterCourse(tx, input.courseId);
    if (course.legacyCourseId) {
      const active = await tx.select({ id: bab.id }).from(bab)
        .where(and(eq(bab.mataKuliahId, course.id), eq(bab.status, "active"))).limit(1);
      if (!active.length) {
        const legacyRows = await tx.select({ id: chapters.id, orderIndex: chapters.orderIndex }).from(chapters)
          .where(eq(chapters.courseId, course.legacyCourseId)).orderBy(chapters.orderIndex);
        if (legacyRows.length) await reorderChaptersWithCanonicalProjection(course.id, legacyRows.map((row) => row.id), input.actorId, tx);
      }
    }
    let existing = input.id ? await resolveChapter(tx, input.id, course) : null;
    if (existing?.canonical && existing.canonical.status !== "active") throw new Error("CHAPTER_NOT_FOUND");
    if (!course.legacyCourseId && input.description) throw new Error("CHAPTER_PROJECTION_UNAVAILABLE");
    const [latest] = await tx.select({ orderIndex: bab.orderIndex }).from(bab)
      .where(eq(bab.mataKuliahId, course.id)).orderBy(desc(bab.orderIndex)).limit(1);
    let orderIndex = !input.id && input.append ? (latest?.orderIndex ?? 0) + 1 : input.orderIndex;
    if (!Number.isSafeInteger(orderIndex) || orderIndex < 0) throw new Error("CHAPTER_ORDER_INVALID");
    const currentOrder = existing?.canonical?.orderIndex ?? existing?.legacy?.orderIndex;
    if (existing && currentOrder !== orderIndex) {
      const active = await tx.select({ id: bab.id, orderIndex: bab.orderIndex }).from(bab)
        .where(and(eq(bab.mataKuliahId, course.id), eq(bab.status, "active"))).orderBy(bab.orderIndex);
      const legacyRows = !active.length && course.legacyCourseId
        ? await tx.select({ id: chapters.id, orderIndex: chapters.orderIndex }).from(chapters)
          .where(eq(chapters.courseId, course.legacyCourseId)).orderBy(chapters.orderIndex)
        : [];
      const ids = (active.length ? active : legacyRows).map((row) => row.id);
      const currentId = existing.canonical?.id ?? existing.legacy!.id;
      const index = ids.indexOf(currentId);
      if (index < 0) throw new Error("CHAPTER_ORDER_SCOPE_MISMATCH");
      ids.splice(index, 1);
      orderIndex = Math.max(1, Math.min(orderIndex, ids.length + 1));
      ids.splice(orderIndex - 1, 0, currentId);
      await reorderChaptersWithCanonicalProjection(course.id, ids, input.actorId, tx);
      existing = await resolveChapter(tx, input.id!, course);
    }
    const id = existing?.legacy?.id ?? (existing?.canonical?.id ?? randomUUID());
    let legacyId = existing?.legacy?.id ?? null;
    if (!existing && course.legacyCourseId) {
      legacyId = id;
      await tx.insert(chapters).values({ id, courseId: course.legacyCourseId, title: input.title,
        description: input.description ?? null, orderIndex, status: "published" });
    } else if (existing?.legacy) {
      await tx.update(chapters).set({ title: input.title, description: input.description ?? null, orderIndex })
        .where(eq(chapters.id, existing.legacy.id));
    } else if (existing && input.description && course.legacyCourseId) {
      legacyId = randomUUID();
      await tx.insert(chapters).values({ id: legacyId, courseId: course.legacyCourseId, title: input.title,
        description: input.description, orderIndex, status: "published" });
    }
    let canonicalChapterId: string;
    if (existing?.canonical) {
      canonicalChapterId = existing.canonical.id;
      await tx.update(bab).set({ title: input.title, orderIndex, legacyChapterId: legacyId })
        .where(eq(bab.id, canonicalChapterId));
    } else if (legacyId) {
      canonicalChapterId = await upsertCanonicalChapter(tx, { id: legacyId, canonicalCourseId: course.id, title: input.title, orderIndex });
    } else {
      canonicalChapterId = id;
      await tx.insert(bab).values({ id, mataKuliahId: course.id, code: canonicalChapterCode(id), title: input.title, orderIndex, status: "active" });
    }
    await recordAudit(tx, { actorId: input.actorId, entityType: "bab", entityId: canonicalChapterId,
      action: input.id ? (legacyId ? "canonical_update_with_legacy" : "canonical_update") : (legacyId ? "canonical_create_with_legacy" : "canonical_create"),
      afterSnapshot: { legacyChapterId: legacyId, legacyCourseId: course.legacyCourseId, title: input.title, status: "active", orderIndex } });
    return { id: input.id ?? legacyId ?? id, canonicalChapterId, orderIndex };
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
    const canonicalCourse = await lockChapterCourse(tx, legacy.courseId);
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
  chapterId: string,
  actorId?: string | null,
  callerTx?: Tx,
): Promise<{ id: string; canonicalChapterId: string | null; courseId: string; legacyCourseId: string | null }> {
  let dispatchCourse: string | undefined;
  const execute = async (tx: Tx) => {
    const initial = await findCanonicalChapter(tx, chapterId);
    const [legacy] = await tx.select({ courseId: chapters.courseId }).from(chapters).where(eq(chapters.id, chapterId)).limit(1);
    if (!initial && !legacy) throw new Error("CHAPTER_NOT_FOUND");
    const course = await lockChapterCourse(tx, initial?.courseId ?? legacy!.courseId);
    const current = await resolveChapter(tx, chapterId, course);
    if (current.canonical && current.canonical.status !== "active") throw new Error("CHAPTER_NOT_FOUND");
    if (current.canonical) {
      const [latest] = await tx.select({ orderIndex: bab.orderIndex }).from(bab)
        .where(eq(bab.mataKuliahId, course.id)).orderBy(desc(bab.orderIndex)).limit(1);
      const orderIndex = (latest?.orderIndex ?? 0) + 1;
      if (!Number.isSafeInteger(orderIndex)) throw new Error("CHAPTER_ORDER_INVALID");
      await tx.update(bab).set({ status: "archived", orderIndex }).where(eq(bab.id, current.canonical.id));
    }
    if (current.legacy) {
      const [locked] = await tx.select({ id: chapters.id }).from(chapters).where(eq(chapters.id, current.legacy.id)).limit(1).for("update");
      if (!locked) throw new Error("CHAPTER_NOT_FOUND");
    // Preserve the identity before cascade deletion clears old queue KO FKs.
    const kos = await tx.select({ id: knowledgeObjects.id, version: knowledgeObjects.version }).from(knowledgeObjects).where(eq(knowledgeObjects.chapterId, current.legacy.id));
    if (kos.length) dispatchCourse = current.legacy.courseId;
    for (const ko of kos) {
      await tx.update(vectorSyncQueue).set({ payload: sql`${vectorSyncQueue.payload} || jsonb_build_object('entityId', ${ko.id}::text, 'version', coalesce(${vectorSyncQueue.payload}->'version', '1'::jsonb), 'legacyKind', 'knowledge_object')` }).where(eq(vectorSyncQueue.koId, ko.id));
      for (const version of new Set([1, ko.version])) await tx.insert(vectorSyncQueue).values({
        id: `delete-ko-${randomUUID()}`, courseId: current.legacy.courseId, koId: null, namespace: "learning", action: "delete",
        payload: { entityId: ko.id, version, legacyKind: "knowledge_object" },
      });
    }
      await tx.delete(chapters).where(eq(chapters.id, current.legacy.id));
    }
    await recordAudit(tx, { actorId, entityType: "bab", entityId: current.canonical?.id ?? chapterId,
      action: current.legacy ? "canonical_archive_with_legacy_delete" : "canonical_archive",
      afterSnapshot: { legacyChapterId: current.legacy?.id ?? null, legacyCourseId: course.legacyCourseId, status: "archived" } });
    return { id: chapterId, canonicalChapterId: current.canonical?.id ?? null, courseId: course.id, legacyCourseId: course.legacyCourseId };
  };
  if (callerTx) return execute(callerTx);
  const result = await db.transaction((tx) => execute(tx));
  if (dispatchCourse) await dispatchVectorSync(dispatchCourse);
  return result;
}

export async function reorderChaptersWithCanonicalProjection(
  courseId: string,
  chapterIds: string[],
  actorId?: string | null,
  callerTx?: Tx,
): Promise<{ courseId: string; chapterIds: string[] }> {
  const execute = async (tx: Tx) => {
    if (new Set(chapterIds).size !== chapterIds.length) throw new Error("CHAPTER_ORDER_DUPLICATE");
    const course = await lockChapterCourse(tx, courseId);
    const all = await tx.select({ id: bab.id, courseId: bab.mataKuliahId, legacyChapterId: bab.legacyChapterId,
      status: bab.status, orderIndex: bab.orderIndex, title: bab.title }).from(bab).where(eq(bab.mataKuliahId, course.id));
    const active = all.filter((row) => row.status === "active");
    const legacyRows = course.legacyCourseId ? await tx.select({ id: chapters.id, courseId: chapters.courseId, title: chapters.title, orderIndex: chapters.orderIndex })
      .from(chapters).where(eq(chapters.courseId, course.legacyCourseId)) : [];
    const resolved = [] as Awaited<ReturnType<typeof resolveChapter>>[];
    for (const id of chapterIds) resolved.push(await resolveChapter(tx, id, course));
    const expected = active.length ? active.map((row) => row.id) : legacyRows.map((row) => row.id);
    const actual = resolved.map((row) => row.canonical?.id ?? row.legacy!.id);
    if (actual.length !== expected.length || new Set(actual).size !== actual.length || expected.some((id) => !actual.includes(id)) || resolved.some((row) => row.canonical && row.canonical.status !== "active")) {
      throw new Error("CHAPTER_ORDER_SCOPE_MISMATCH");
    }
    let next = all.reduce((max, row) => Math.max(max, row.orderIndex), chapterIds.length);
    if (!Number.isSafeInteger(next + all.length + chapterIds.length + 1)) throw new Error("CHAPTER_ORDER_INVALID");
    for (const row of active) await tx.update(bab).set({ orderIndex: ++next }).where(eq(bab.id, row.id));
    for (const row of all.filter((item) => item.status !== "active" && item.orderIndex > 0 && item.orderIndex <= chapterIds.length)) {
      await tx.update(bab).set({ orderIndex: ++next }).where(eq(bab.id, row.id));
    }
    for (const [index, row] of resolved.entries()) {
      const orderIndex = index + 1;
      if (row.legacy) await tx.update(chapters).set({ orderIndex }).where(eq(chapters.id, row.legacy.id));
      if (row.canonical) await tx.update(bab).set({ orderIndex }).where(eq(bab.id, row.canonical.id));
      else await upsertCanonicalChapter(tx, { id: row.legacy!.id, canonicalCourseId: course.id, title: row.legacy!.title, orderIndex });
    }
    await recordAudit(tx, { actorId, entityType: "bab", entityId: course.id, action: resolved.some((row) => row.legacy) ? "canonical_reorder_with_legacy" : "canonical_reorder",
      afterSnapshot: { legacyCourseId: course.legacyCourseId, chapterIds } });
    return { courseId, chapterIds };
  };
  return callerTx ? execute(callerTx) : db.transaction((tx) => execute(tx));
}
