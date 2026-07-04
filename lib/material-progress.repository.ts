import { db } from "@/db";
import { studentMaterialProgress, websiteMaterials, progress as legacyProgress } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { recordLearningEvent } from "@/lib/learning-events";
import { inngest } from "@/lib/inngest";

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
    const [mat] = await db
      .select({ courseId: websiteMaterials.courseId })
      .from(websiteMaterials)
      .where(eq(websiteMaterials.id, progress.materialId))
      .limit(1);

    if (mat) {
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
            courseId: mat.courseId,
            eventType: "material_completed",
          }),
          inngest.send({
            name: "mastery/recompute.requested",
            data: { studentId: progress.studentId, courseId: mat.courseId },
          }),
        ]);
      } catch (err) {
        console.error("Failed to trigger automatic completion sync:", err);
      }
    }
  }

  return resultRow;
}
