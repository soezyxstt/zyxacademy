import { createHash, randomUUID } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import {
  asesmen,
  auditMutasi,
  bab,
  blueprintAsesmen,
  cakupanAsesmen,
  courses,
  itemAsesmen,
  mataKuliah,
  pengguna,
  quizTemplates,
  soal,
  user,
} from "@/db/schema";
import { stableStringify } from "@/lib/staging/migration-ledger";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = Tx | typeof db;

export interface QuizCanonicalSyncInput {
  id?: string;
  courseId: string;
  title: string;
  category: "daily" | "weekly" | "chapter" | "premium" | "simulation";
  visibility: "free" | "paid";
  status?: "draft" | "published";
  manualStatus?: "open" | "closed" | "scheduled";
  timeLimitSeconds?: number | null;
  maxAttempts?: number | null;
  selectionRules: Record<string, unknown> | string;
  openAt?: Date | null;
  closeAt?: Date | null;
  showDiscussion?: boolean;
  creatorId?: string | null;
}

export interface QuizCanonicalSyncUpdateInput {
  title?: string;
  category?: "daily" | "weekly" | "chapter" | "premium" | "simulation";
  visibility?: "free" | "paid";
  status?: "draft" | "published";
  manualStatus?: "open" | "closed" | "scheduled";
  timeLimitSeconds?: number | null;
  maxAttempts?: number | null;
  selectionRules?: Record<string, unknown> | string;
  openAt?: Date | null;
  closeAt?: Date | null;
  showDiscussion?: boolean;
  actorId?: string | null;
}

export interface QuizCanonicalSyncResult {
  id: string;
  blueprintId: string;
  canonicalCourseId: string;
  assessmentType: "quiz" | "tryout";
  status: string;
}

function stableId(prefix: string, raw: string): string {
  const digest = createHash("sha256").update(`${prefix}:${raw}`).digest("hex").slice(0, 24);
  return `${prefix}-${digest}`;
}

function computeHash(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function parseSelectionRules(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

async function resolveCanonicalCourse(tx: DbOrTx, courseId: string): Promise<string> {
  const [canonicalCourse] = await tx
    .select({ id: mataKuliah.id })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
    .limit(1);

  if (canonicalCourse) return canonicalCourse.id;

  const [legacyCourse] = await tx
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (!legacyCourse) {
    throw new Error(`Course target not found for ${courseId}`);
  }

  const generatedId = stableId("mk", legacyCourse.id);
  await tx
    .insert(mataKuliah)
    .values({
      id: generatedId,
      code: legacyCourse.id,
      title: legacyCourse.title,
      legacyCourseId: legacyCourse.id,
      status: "active",
    })
    .onConflictDoNothing();

  return generatedId;
}

async function resolveCanonicalCreator(tx: DbOrTx, creatorId?: string | null): Promise<string> {
  if (creatorId) {
    const [userRow] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, creatorId))
      .limit(1);
    if (userRow) {
      await tx
        .insert(pengguna)
        .values({ id: userRow.id, status: "active" })
        .onConflictDoNothing();
      return userRow.id;
    }
  }

  const [firstUser] = await tx
    .select({ id: user.id })
    .from(user)
    .limit(1);

  if (firstUser) {
    await tx
      .insert(pengguna)
      .values({ id: firstUser.id, status: "active" })
      .onConflictDoNothing();
    return firstUser.id;
  }

  const fallbackId = "system-assessment-creator";
  await tx
    .insert(user)
    .values({
      id: fallbackId,
      name: "System Assessment Creator",
      email: "system-assessment-creator@zyx.internal",
      emailVerified: true,
      role: "admin",
    })
    .onConflictDoNothing();

  await tx
    .insert(pengguna)
    .values({
      id: fallbackId,
      status: "active",
    })
    .onConflictDoNothing();

  return fallbackId;
}

function extractChapterIds(selectionRules: Record<string, unknown>): string[] {
  const refs = (selectionRules.chapterIds ?? selectionRules.chapters ?? selectionRules.chapter_ids) as unknown;
  if (!Array.isArray(refs)) return [];
  return refs.map((r) => String(r).trim()).filter(Boolean);
}

function extractFixedQuestionIds(selectionRules: Record<string, unknown>): string[] {
  const refs = (selectionRules.fixedQuestionIds ?? selectionRules.fixed_question_ids) as unknown;
  if (!Array.isArray(refs)) return [];
  return refs.map((r) => String(r).trim()).filter(Boolean);
}

/**
 * Creates canonical assessment entities (blueprint, assessment, chapters, items)
 * and projects the legacy quiz_templates row atomically.
 */
export async function createAssessmentWithLegacyProjection(
  input: QuizCanonicalSyncInput,
  callerTx?: Tx,
): Promise<QuizCanonicalSyncResult> {
  const execute = async (tx: Tx): Promise<QuizCanonicalSyncResult> => {
    const templateId = input.id ?? randomUUID();
    const blueprintId = stableId("blueprint", templateId);
    const assessmentType: "quiz" | "tryout" = input.category === "simulation" ? "tryout" : "quiz";
    const status = input.status ?? "published";
    const canonicalCourseId = await resolveCanonicalCourse(tx, input.courseId);
    const creatorId = await resolveCanonicalCreator(tx, input.creatorId);
    const selectionRules = parseSelectionRules(input.selectionRules);
    const now = new Date();

    const blueprintHash = computeHash({
      selectionRules,
      category: input.category,
      assessmentType,
    });

    const assessmentHash = computeHash({
      id: templateId,
      blueprintId,
      title: input.title,
      courseId: canonicalCourseId,
      category: input.category,
      timeLimitSeconds: input.timeLimitSeconds,
      maxAttempts: input.maxAttempts,
      status,
    });

    // 1. Write Blueprint Asesmen
    await tx
      .insert(blueprintAsesmen)
      .values({
        id: blueprintId,
        mataKuliahId: canonicalCourseId,
        title: input.title,
        assessmentType,
        blueprint: selectionRules,
        version: 1,
        status: status === "published" ? "approved" : "draft",
        generationHash: blueprintHash,
        creatorId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: blueprintAsesmen.id,
        set: {
          mataKuliahId: canonicalCourseId,
          title: input.title,
          assessmentType,
          blueprint: selectionRules,
          status: status === "published" ? "approved" : "draft",
          generationHash: blueprintHash,
          updatedAt: now,
        },
      });

    // 2. Write Asesmen
    await tx
      .insert(asesmen)
      .values({
        id: templateId,
        blueprintAsesmenId: blueprintId,
        mataKuliahId: canonicalCourseId,
        title: input.title,
        assessmentType,
        version: 1,
        status: status === "published" ? "published" : "draft",
        generationHash: assessmentHash,
        creatorId,
        publishedAt: status === "published" ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: asesmen.id,
        set: {
          blueprintAsesmenId: blueprintId,
          mataKuliahId: canonicalCourseId,
          title: input.title,
          assessmentType,
          status: status === "published" ? "published" : "draft",
          generationHash: assessmentHash,
          publishedAt: status === "published" ? now : null,
          updatedAt: now,
        },
      });

    // 3. Write Chapter Coverage (Cakupan Asesmen)
    const chapterIds = extractChapterIds(selectionRules);
    for (const [orderIndex, chapterRef] of chapterIds.entries()) {
      const [chapter] = await tx
        .select({ id: bab.id })
        .from(bab)
        .where(or(eq(bab.id, chapterRef), eq(bab.legacyChapterId, chapterRef)))
        .limit(1);

      if (chapter) {
        await tx
          .insert(cakupanAsesmen)
          .values({
            id: stableId("coverage", `${templateId}:${chapter.id}`),
            asesmenId: templateId,
            babId: chapter.id,
            orderIndex,
            createdAt: now,
          })
          .onConflictDoNothing();
      }
    }

    // 4. Write Fixed Items (Item Asesmen) if specified
    const fixedQuestionIds = extractFixedQuestionIds(selectionRules);
    for (const [orderIndex, qId] of fixedQuestionIds.entries()) {
      const [canonicalSoal] = await tx
        .select()
        .from(soal)
        .where(eq(soal.id, qId))
        .limit(1);

      if (canonicalSoal) {
        await tx
          .insert(itemAsesmen)
          .values({
            id: stableId("item", `${templateId}:${qId}`),
            asesmenId: templateId,
            soalId: qId,
            orderIndex,
            renderedQuestionSnapshot: canonicalSoal as unknown as Record<string, unknown>,
            optionOrderSnapshot: Array.isArray(canonicalSoal.optionsSnapshot)
              ? canonicalSoal.optionsSnapshot.map((_, idx) => String(idx))
              : [],
            gradingPolicySnapshot: { source: "legacy", questionId: qId },
            contentVersion: canonicalSoal.version ?? 1,
            generationHash: canonicalSoal.generationHash ?? computeHash(canonicalSoal),
            createdAt: now,
          })
          .onConflictDoNothing();
      }
    }

    // 5. Write Legacy Projection (quiz_templates)
    const derivedShowDiscussion =
      input.showDiscussion !== undefined
        ? input.showDiscussion
        : selectionRules.explanationRelease !== "never";

    await tx
      .insert(quizTemplates)
      .values({
        id: templateId,
        courseId: input.courseId,
        title: input.title,
        category: input.category,
        visibility: input.visibility,
        timeLimitSeconds: input.timeLimitSeconds ?? null,
        maxAttempts: input.maxAttempts ?? null,
        selectionRules,
        openAt: input.openAt ? new Date(input.openAt) : null,
        closeAt: input.closeAt ? new Date(input.closeAt) : null,
        manualStatus: input.manualStatus ?? "open",
        showDiscussion: derivedShowDiscussion,
        status,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: quizTemplates.id,
        set: {
          courseId: input.courseId,
          title: input.title,
          category: input.category,
          visibility: input.visibility,
          timeLimitSeconds: input.timeLimitSeconds ?? null,
          maxAttempts: input.maxAttempts ?? null,
          selectionRules,
          openAt: input.openAt ? new Date(input.openAt) : null,
          closeAt: input.closeAt ? new Date(input.closeAt) : null,
          manualStatus: input.manualStatus ?? "open",
          showDiscussion: derivedShowDiscussion,
          status,
          updatedAt: now,
        },
      });

    // 6. Record Audit
    await tx
      .insert(auditMutasi)
      .values({
        id: stableId("audit", `quiz_create:${templateId}:${now.getTime()}`),
        actorId: creatorId,
        entityType: "asesmen",
        entityId: templateId,
        action: "canonical_create_with_legacy",
        beforeSnapshot: null,
        afterSnapshot: {
          asesmenId: templateId,
          blueprintId,
          title: input.title,
          category: input.category,
          status,
        },
        correlationId: templateId,
      })
      .onConflictDoNothing();

    return {
      id: templateId,
      blueprintId,
      canonicalCourseId,
      assessmentType,
      status,
    };
  };

  if (callerTx) {
    return execute(callerTx);
  }
  return db.transaction((tx) => execute(tx));
}

/**
 * Updates canonical assessment entities and legacy quiz_templates projection atomically.
 */
export async function updateAssessmentWithLegacyProjection(
  id: string,
  input: QuizCanonicalSyncUpdateInput,
  callerTx?: Tx,
): Promise<{ success: boolean; id: string }> {
  const execute = async (tx: Tx) => {
    const [existingTemplate] = await tx
      .select()
      .from(quizTemplates)
      .where(eq(quizTemplates.id, id))
      .limit(1);

    if (!existingTemplate) {
      throw new Error(`Quiz template not found: ${id}`);
    }

    const now = new Date();
    const updatedTitle = input.title ?? existingTemplate.title;
    const updatedCategory = input.category ?? existingTemplate.category;
    const updatedStatus = input.status ?? existingTemplate.status;
    const updatedRules = parseSelectionRules(input.selectionRules ?? existingTemplate.selectionRules);
    const assessmentType: "quiz" | "tryout" = updatedCategory === "simulation" ? "tryout" : "quiz";

    const blueprintId = stableId("blueprint", id);

    // Update Blueprint
    await tx
      .update(blueprintAsesmen)
      .set({
        title: updatedTitle,
        assessmentType,
        blueprint: updatedRules,
        status: updatedStatus === "published" ? "approved" : "draft",
        generationHash: computeHash(updatedRules),
        updatedAt: now,
      })
      .where(eq(blueprintAsesmen.id, blueprintId));

    // Update Asesmen
    await tx
      .update(asesmen)
      .set({
        title: updatedTitle,
        assessmentType,
        status: updatedStatus === "published" ? "published" : "draft",
        publishedAt: updatedStatus === "published" ? now : null,
        updatedAt: now,
      })
      .where(eq(asesmen.id, id));

    // Update Cakupan Asesmen if rules changed
    if (input.selectionRules) {
      await tx.delete(cakupanAsesmen).where(eq(cakupanAsesmen.asesmenId, id));
      const chapterIds = extractChapterIds(updatedRules);
      for (const [orderIndex, chapterRef] of chapterIds.entries()) {
        const [chapter] = await tx
          .select({ id: bab.id })
          .from(bab)
          .where(or(eq(bab.id, chapterRef), eq(bab.legacyChapterId, chapterRef)))
          .limit(1);

        if (chapter) {
          await tx
            .insert(cakupanAsesmen)
            .values({
              id: stableId("coverage", `${id}:${chapter.id}`),
              asesmenId: id,
              babId: chapter.id,
              orderIndex,
              createdAt: now,
            })
            .onConflictDoNothing();
        }
      }
    }

    // Update Legacy quiz_templates
    const legacyUpdate: Record<string, unknown> = {
      updatedAt: now,
    };
    if (input.title !== undefined) legacyUpdate.title = input.title;
    if (input.category !== undefined) legacyUpdate.category = input.category;
    if (input.visibility !== undefined) legacyUpdate.visibility = input.visibility;
    if (input.status !== undefined) legacyUpdate.status = input.status;
    if (input.manualStatus !== undefined) legacyUpdate.manualStatus = input.manualStatus;
    if (input.timeLimitSeconds !== undefined) legacyUpdate.timeLimitSeconds = input.timeLimitSeconds;
    if (input.maxAttempts !== undefined) legacyUpdate.maxAttempts = input.maxAttempts;
    if (input.selectionRules !== undefined) legacyUpdate.selectionRules = updatedRules;
    if (input.openAt !== undefined) legacyUpdate.openAt = input.openAt ? new Date(input.openAt) : null;
    if (input.closeAt !== undefined) legacyUpdate.closeAt = input.closeAt ? new Date(input.closeAt) : null;
    if (input.showDiscussion !== undefined) legacyUpdate.showDiscussion = input.showDiscussion;

    await tx.update(quizTemplates).set(legacyUpdate).where(eq(quizTemplates.id, id));

    // Record Audit
    await tx
      .insert(auditMutasi)
      .values({
        id: stableId("audit", `quiz_update:${id}:${now.getTime()}`),
        actorId: input.actorId ?? null,
        entityType: "asesmen",
        entityId: id,
        action: "canonical_update_with_legacy",
        beforeSnapshot: existingTemplate as unknown as Record<string, unknown>,
        afterSnapshot: { id, title: updatedTitle, status: updatedStatus },
        correlationId: id,
      })
      .onConflictDoNothing();

    return { success: true, id };
  };

  if (callerTx) {
    return execute(callerTx);
  }
  return db.transaction((tx) => execute(tx));
}

/**
 * Deletes canonical assessment and legacy quiz template projection.
 */
export async function deleteAssessmentWithLegacyProjection(
  id: string,
  callerTx?: Tx,
): Promise<{ success: boolean; id: string }> {
  const execute = async (tx: Tx) => {
    const blueprintId = stableId("blueprint", id);

    await tx.delete(quizTemplates).where(eq(quizTemplates.id, id));
    await tx.delete(asesmen).where(eq(asesmen.id, id));
    await tx.delete(blueprintAsesmen).where(eq(blueprintAsesmen.id, blueprintId));

    return { success: true, id };
  };

  if (callerTx) {
    return execute(callerTx);
  }
  return db.transaction((tx) => execute(tx));
}

/**
 * Scans all quiz_templates and creates missing blueprint_asesmen and asesmen entities.
 * Safe and idempotent.
 */
export async function syncOrphanedQuizTemplatesToAssessments(
  txOrDb: DbOrTx = db,
): Promise<{ totalChecked: number; reconciledCount: number; errors: Array<{ id: string; error: string }> }> {
  const allTemplates = await txOrDb.select().from(quizTemplates);
  let reconciledCount = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const template of allTemplates) {
    try {
      const [existingAsesmen] = await txOrDb
        .select({ id: asesmen.id })
        .from(asesmen)
        .where(eq(asesmen.id, template.id))
        .limit(1);

      if (existingAsesmen) continue;

      await createAssessmentWithLegacyProjection({
        id: template.id,
        courseId: template.courseId,
        title: template.title,
        category: template.category,
        visibility: template.visibility,
        status: template.status,
        manualStatus: template.manualStatus,
        timeLimitSeconds: template.timeLimitSeconds,
        maxAttempts: template.maxAttempts,
        selectionRules: (template.selectionRules ?? {}) as Record<string, unknown>,
        openAt: template.openAt,
        closeAt: template.closeAt,
        showDiscussion: template.showDiscussion ?? undefined,
      });

      reconciledCount++;
    } catch (err: any) {
      errors.push({ id: template.id, error: err?.message || String(err) });
    }
  }

  return {
    totalChecked: allTemplates.length,
    reconciledCount,
    errors,
  };
}
