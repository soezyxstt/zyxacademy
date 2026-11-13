import { db } from "@/db";
import { studentMaterialProgress, websiteMaterials, progress as legacyProgress } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { recordLearningEvent } from "@/lib/learning-events";
import { inngest } from "@/lib/inngest";
import { getStudentMaterialAccess, isFreeChapterScoped } from "@/lib/course-utils";

export async function getStudentMaterialProgress(studentId: string, materialId: string) {
  const [row] = await db
    .select()
    .from(studentMaterialProgress)
    .where(
      and(
        eq(studentMaterialProgress.studentId, studentId),
        eq(studentMaterialProgress.materialId, materialId)
      )
    )
    .limit(1);
  return row || null;
}

export async function updateMaterialProgress(progress: {
  studentId: string;
  materialId: string;
  completionPercent: number;
  lastSectionId?: string | null;
  lastPosition?: {
    type: "pdf" | "article";
    page?: number;
    section?: string;
  } | null;
  timeSpentSeconds: number; // Increment of time spent in seconds
}) {
  // This repository is called by a browser-facing route, so the material
  // identity must be resolved again on the server before any progress row or
  // completion side effect is written. Do not trust the caller to provide a
  // course or a material that it has already opened in the UI.
  // student_material_progress is the compatibility table for website_materials
  // (its foreign key points to that table). Resolve that exact published row
  // first so canonical Diktat/Article IDs or legacy PDFs cannot create an
  // orphaned progress record or trigger a cross-course event.
  const [persistedMaterial] = await db
    .select({
      courseId: websiteMaterials.courseId,
      chapterId: websiteMaterials.chapterId,
    })
    .from(websiteMaterials)
    .where(
      and(
        eq(websiteMaterials.id, progress.materialId),
        eq(websiteMaterials.status, "published"),
        eq(websiteMaterials.isStale, false),
      ),
    )
    .limit(1);
  if (!persistedMaterial) {
    throw new Error("MATERIAL_ACCESS_DENIED");
  }

  const materialAccess = await getStudentMaterialAccess(progress.studentId, progress.materialId);
  const accessCourseId = materialAccess
    ? materialAccess.access.legacyCourseId ?? materialAccess.access.courseId
    : null;
  if (
    !materialAccess
    || materialAccess.contentKind !== "article"
    || accessCourseId !== persistedMaterial.courseId
  ) {
    throw new Error("MATERIAL_ACCESS_DENIED");
  }
  if (
    materialAccess.access.tier === "free"
    && (
      !isFreeChapterScoped([persistedMaterial.chapterId], materialAccess.access.hasFullContentAccess ? materialAccess.access.policy.scopedChapterIds : materialAccess.access.freeChapterIds)
    )
  ) {
    throw new Error("MATERIAL_UPGRADE_REQUIRED");
  }

  const now = new Date();
  const existing = await getStudentMaterialProgress(progress.studentId, progress.materialId);
  const rawPercent = Math.max(0, Math.min(100, Math.round(progress.completionPercent)));
  // Completion never regresses: an in-progress ping must not lower a higher
  // recorded percentage (e.g. a periodic save after a material was completed).
  const completionPercent = existing ? Math.max(existing.completionPercent, rawPercent) : rawPercent;

  const wasPreviouslyCompleted = existing ? (existing.completionPercent >= 90) : false;
  const isNowCompleted = completionPercent >= 90;

  let resultRow;

  if (existing) {
    const totalTime = existing.timeSpentSeconds + progress.timeSpentSeconds;
    const dataToSave = {
      completionPercent,
      lastSectionId: progress.lastSectionId !== undefined ? progress.lastSectionId : existing.lastSectionId,
      lastPosition: progress.lastPosition !== undefined ? progress.lastPosition : existing.lastPosition,
      timeSpentSeconds: totalTime,
      lastOpenedAt: now,
      updatedAt: now,
    };
    await db
      .update(studentMaterialProgress)
      .set(dataToSave)
      .where(eq(studentMaterialProgress.id, existing.id));
    resultRow = { ...existing, ...dataToSave };
  } else {
    const newId = `mat-prog-${randomUUID()}`;
    const newRow = {
      id: newId,
      studentId: progress.studentId,
      materialId: progress.materialId,
      completionPercent,
      lastPosition: progress.lastPosition || null,
      lastSectionId: progress.lastSectionId || null,
      timeSpentSeconds: progress.timeSpentSeconds,
      lastOpenedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(studentMaterialProgress).values(newRow);
    resultRow = newRow;
  }

  // Trigger completion events if progress crosses 90%
  if (isNowCompleted && !wasPreviouslyCompleted) {
    try {
      const existingLegacy = await db.query.progress.findFirst({
        where: and(
          eq(legacyProgress.userId, progress.studentId),
          eq(legacyProgress.materialId, progress.materialId)
        ),
      });

      if (existingLegacy) {
        if (existingLegacy.status !== "completed") {
          await db
            .update(legacyProgress)
            .set({ status: "completed", completedAt: now })
            .where(eq(legacyProgress.id, existingLegacy.id));
        }
      } else {
        await db.insert(legacyProgress).values({
          id: `prog-${randomUUID()}`,
          userId: progress.studentId,
          materialId: progress.materialId,
          status: "completed",
          completedAt: now,
        });
      }

      await Promise.all([
        recordLearningEvent({
          studentId: progress.studentId,
          courseId: persistedMaterial.courseId,
          eventType: "material_completed",
        }),
        inngest.send({
          name: "mastery/recompute.requested",
          data: { studentId: progress.studentId, courseId: persistedMaterial.courseId },
        }),
      ]);
    } catch (err) {
      console.error("Failed to trigger automatic completion sync:", err);
    }
  }

  return resultRow;
}
