import { db } from "@/db";
import { diktats, masterTeachingDocuments, knowledgeObjects } from "@/db/schema";
import { generateDiktatStructure } from "./diktat-generator";
import { eq, and, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { inngest } from "@/lib/inngest";

/**
 * Extracts the unique file key from an UploadThing CDN URL.
 */
export function extractFileKeyFromUrl(url: string): string | null {
  if (!url) return null;
  if (url.includes("/api/storage/file/")) {
    const parts = url.split("/api/storage/file/");
    return parts[parts.length - 1];
  }
  const parts = url.split("/f/");
  return parts.length > 1 ? parts[1] : url;
}

/**
 * Action: Initiates a new Diktat compilation draft from selected chapters.
 */
export async function generateDiktatDraft(
  courseId: string,
  chapterIds: string[]
): Promise<{ success: boolean; diktatId?: string; errors?: string[] }> {
  try {
    // 1. Compile structured Diktat content JSON
    const compiledStructure = await generateDiktatStructure(courseId, chapterIds);

    // 2. Fetch primary MTD from Knowledge Objects in the selected chapters
    const activeKOs = await db
      .select()
      .from(knowledgeObjects)
      .where(and(inArray(knowledgeObjects.chapterId, chapterIds), eq(knowledgeObjects.status, "active")));

    if (activeKOs.length === 0) {
      return { success: false, errors: ["No active KOs found to link MTD information."] };
    }

    const mtdId = activeKOs[0].mtdId;
    const [mtdRecord] = await db
      .select()
      .from(masterTeachingDocuments)
      .where(eq(masterTeachingDocuments.id, mtdId));

    const sourceMtdVersion = mtdRecord ? mtdRecord.version : 1;

    // 3. Save Diktat draft to DB
    const diktatId = `dk-${randomUUID()}`;
    await db.insert(diktats).values({
      id: diktatId,
      courseId,
      sourceMtdId: mtdId,
      sourceMtdVersion,
      isStale: false,
      generationHash: compiledStructure.generationHash,
      title: compiledStructure.title,
      chapterIds,
      status: "draft",
      settings: {
        compiledStructure,
        tutorOverrides: {},
      },
    });

    return { success: true, diktatId };
  } catch (err: any) {
    return { success: false, errors: [err.message] };
  }
}

/**
 * Action: Saves a tutor text adjustment/override for a specific Diktat card block.
 * Overwrites are preserved during regenerations.
 */
export async function saveTutorDiktatOverride(
  diktatId: string,
  sectionKey: string,
  overrideData: any
): Promise<{ success: boolean; errors?: string[] }> {
  const [diktat] = await db
    .select()
    .from(diktats)
    .where(eq(diktats.id, diktatId));

  if (!diktat) {
    return { success: false, errors: [`Diktat not found: ${diktatId}`] };
  }

  const currentSettings = (diktat.settings as any) || {};
  const currentOverrides = currentSettings.tutorOverrides || {};

  currentOverrides[sectionKey] = {
    ...currentOverrides[sectionKey],
    ...overrideData,
  };

  const updatedSettings = {
    ...currentSettings,
    tutorOverrides: currentOverrides,
  };

  await db
    .update(diktats)
    .set({
      settings: updatedSettings,
      updatedAt: new Date(),
    })
    .where(eq(diktats.id, diktatId));

  console.log(`[Tutor Action] Saved override for section ${sectionKey} inside Diktat ${diktatId}`);
  return { success: true };
}

/**
 * Action: Promotes the Diktat status to queued and enqueues background PDF compilation.
 * Pure web command: does not execute compilation, PDF rendering, or PDF audits in the web tier.
 */
export async function publishDiktat(
  diktatId: string
): Promise<{ success: boolean; status: "queued"; errors?: string[] }> {
  try {
    await db
      .update(diktats)
      .set({
        status: "queued",
        updatedAt: new Date(),
      })
      .where(eq(diktats.id, diktatId));

    console.log(`[Tutor Action] Publishing Diktat ${diktatId} (enqueued for background compilation).`);

    await inngest.send({
      name: "diktat/pdf.generate.requested",
      data: { diktatId },
    });

    return { success: true, status: "queued" };
  } catch (err: any) {
    console.error(`[Tutor Action] Failed to enqueue Diktat ${diktatId}:`, err);
    return { success: false, status: "queued", errors: [err.message || "FAILED_TO_ENQUEUE_DIKTAT"] };
  }
}
