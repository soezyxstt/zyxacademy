"use server";

import { db } from "@/db";
import {
  knowledgeObjects,
  websiteMaterials,
  chapters,
  flashcardSets,
  aiQuestionBank,
  masterTeachingDocuments,
  vectorSyncQueue,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { generateFlashcardsForChapter } from "@/lib/flashcard-generator";
import { generateQuestionsForKOBatch } from "@/lib/question-generator";
import { inngest } from "@/lib/inngest";

export async function generateFlashcardsAction(chapterId: string) {
  try {
    const cardCount = await generateFlashcardsForChapter(chapterId);
    return { success: true, count: cardCount };
  } catch (error: any) {
    console.error("Error generating flashcards:", error);
    return { success: false, error: error.message || "Failed to generate flashcards." };
  }
}

export async function generateQuizPoolAction(chapterId: string) {
  try {
    const activeKOs = await db
      .select()
      .from(knowledgeObjects)
      .where(
        and(
          eq(knowledgeObjects.chapterId, chapterId),
          eq(knowledgeObjects.status, "active")
        )
      );

    if (activeKOs.length === 0) {
      return { success: false, error: "No active Knowledge Objects found in this chapter." };
    }

    let totalGenerated = 0;
    const errors: string[] = [];

    const BATCH_SIZE = 5;
    for (let i = 0; i < activeKOs.length; i += BATCH_SIZE) {
      const koBatch = activeKOs.slice(i, i + BATCH_SIZE);
      const koIds = koBatch.map((ko) => ko.id);
      
      const res = await generateQuestionsForKOBatch(koIds);
      for (const result of res.results) {
        if (result.success) {
          totalGenerated += result.insertedCount;
        } else {
          errors.push(...result.errors);
        }
      }
    }

    return { success: true, count: totalGenerated, errors };
  } catch (error: any) {
    console.error("Error generating quiz pool:", error);
    return { success: false, error: error.message || "Failed to generate questions." };
  }
}

export async function updateKOAction(
  koId: string,
  updates: {
    conceptName: string;
    title: string;
    content: string;
    difficulty: "easy" | "medium" | "hard";
    type: "definition" | "formula" | "example" | "misconception" | "exercise" | "summary" | "objective" | "concept_overview";
    bloomLevel: "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
    importance: "high" | "medium" | "low";
  }
) {
  try {
    const { createHash } = await import("crypto");
    const { diktats } = await import("@/db/schema");

    await db.transaction(async (tx) => {
      // 1. Update the KO itself
      await tx
        .update(knowledgeObjects)
        .set({
          conceptName: updates.conceptName,
          title: updates.title,
          content: updates.content,
          difficulty: updates.difficulty,
          type: updates.type,
          bloomLevel: updates.bloomLevel,
          importance: updates.importance,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeObjects.id, koId));

      // 2. Fetch the updated KO to get details
      const [koRecord] = await tx
        .select()
        .from(knowledgeObjects)
        .where(eq(knowledgeObjects.id, koId));

      if (koRecord) {
        // 3. Fetch all active KOs for this chapter
        const allKOs = await tx
          .select()
          .from(knowledgeObjects)
          .where(
            and(
              eq(knowledgeObjects.chapterId, koRecord.chapterId),
              eq(knowledgeObjects.status, "active")
            )
          );

        // Calculate new derived hash from KOs' key attributes
        const derivedHashInput = [...allKOs]
          .sort((a, b) => a.title.localeCompare(b.title))
          .map(ko => `${ko.title}:${ko.content}:${ko.difficulty}:${ko.bloomLevel}`)
          .join("|");
        const newDerivedHash = createHash("sha256").update(derivedHashInput).digest("hex");

        // Fetch current MTD
        const [mtdRecord] = await tx
          .select()
          .from(masterTeachingDocuments)
          .where(eq(masterTeachingDocuments.id, koRecord.mtdId));

        const derivedHashChanged = !mtdRecord || mtdRecord.derivedHash !== newDerivedHash;
        const nextVersion = mtdRecord ? (derivedHashChanged ? mtdRecord.version + 1 : mtdRecord.version) : 1;

        // Update MTD record with new derived hash and version
        if (mtdRecord) {
          await tx
            .update(masterTeachingDocuments)
            .set({
              derivedHash: newDerivedHash,
              version: nextVersion,
              updatedAt: new Date(),
            })
            .where(eq(masterTeachingDocuments.id, koRecord.mtdId));
        }

        // 4. Cascade staleness only if the derived hash has changed
        if (derivedHashChanged && mtdRecord) {
          console.log(`[Staleness Cascade] Derived hash changed via admin edit. Marking downstream assets stale for MTD ${koRecord.mtdId}`);
          await tx
            .update(websiteMaterials)
            .set({ isStale: true, sourceMtdVersion: nextVersion, updatedAt: new Date() })
            .where(eq(websiteMaterials.sourceMtdId, koRecord.mtdId));

          await tx
            .update(flashcardSets)
            .set({ isStale: true, sourceMtdVersion: nextVersion, updatedAt: new Date() })
            .where(eq(flashcardSets.sourceMtdId, koRecord.mtdId));

          await tx
            .update(diktats)
            .set({ isStale: true, sourceMtdVersion: nextVersion, updatedAt: new Date() })
            .where(eq(diktats.sourceMtdId, koRecord.mtdId));

          await tx
            .update(aiQuestionBank)
            .set({ isStale: true, sourceMtdVersion: nextVersion })
            .where(eq(aiQuestionBank.sourceMtdId, koRecord.mtdId));
        }

        // 5. Queue vector sync outbox payload for the updated KO (routed to 'learning' namespace)
        const crypto = await import("crypto");
        const embeddingText = `Title: ${koRecord.title}\nConcept: ${koRecord.conceptName}\nContent: ${koRecord.content}`;
        await tx.insert(vectorSyncQueue).values({
          id: `sync-${crypto.randomUUID()}`,
          courseId: koRecord.courseId,
          koId: koRecord.id,
          action: "upsert",
          namespace: "learning",
          payload: {
            text: embeddingText,
            metadata: {
              chapterId: koRecord.chapterId,
              type: koRecord.type,
              bloomLevel: koRecord.bloomLevel,
              difficulty: koRecord.difficulty,
              tags: koRecord.tags,
            }
          },
          status: "pending",
          attempts: 0,
        });
      }
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error updating Knowledge Object:", error);
    return { success: false, error: error.message || "Failed to update Knowledge Object." };
  }
}

export async function toggleChapterPublishAction(chapterId: string, publish: boolean) {
  try {
    await db.transaction(async (tx) => {
      // Update chapter status
      await tx
        .update(chapters)
        .set({
          status: publish ? "published" : "draft",
          updatedAt: new Date(),
        })
        .where(eq(chapters.id, chapterId));

      // Also update matching websiteMaterial status
      await tx
        .update(websiteMaterials)
        .set({
          status: publish ? "published" : "draft",
          updatedAt: new Date(),
        })
        .where(eq(websiteMaterials.chapterId, chapterId));

      // Also update matching flashcardSets status
      await tx
        .update(flashcardSets)
        .set({
          status: publish ? "published" : "draft",
          updatedAt: new Date(),
        })
        .where(eq(flashcardSets.chapterId, chapterId));

      // Get KOs for this chapter to publish/draft their quiz questions
      const chapterKOs = await tx
        .select({ id: knowledgeObjects.id })
        .from(knowledgeObjects)
        .where(eq(knowledgeObjects.chapterId, chapterId));

      if (chapterKOs.length > 0) {
        const koIds = chapterKOs.map((ko) => ko.id);
        await tx
          .update(aiQuestionBank)
          .set({
            reviewStatus: publish ? "published" : "generated",
          })
          .where(inArray(aiQuestionBank.knowledgeObjectId, koIds));
      }
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error toggling chapter publish status:", error);
    return { success: false, error: error.message || "Failed to update publish status." };
  }
}

export async function regenerateWebsiteMaterialAction(chapterId: string) {
  try {
    await db
      .update(websiteMaterials)
      .set({
        isStale: false,
        updatedAt: new Date(),
      })
      .where(eq(websiteMaterials.chapterId, chapterId));
    return { success: true };
  } catch (error: any) {
    console.error("Error regenerating website material:", error);
    return { success: false, error: error.message || "Failed to regenerate." };
  }
}

export async function saveWebsiteMaterialAction(chapterId: string, markdown: string) {
  try {
    const { auth } = await import("@/lib/auth");
    const { headers } = await import("next/headers");
    const session = await auth.api.getSession({ headers: await headers() });
    const authorId = session?.user?.id || "admin";

    const { saveWebsiteMaterial } = await import("@/lib/material-storage");
    const result = await saveWebsiteMaterial(
      chapterId,
      markdown,
      authorId,
      "Penyuntingan visual oleh admin",
      false, // isAiGenerated = false
      false  // forcePublish = false
    );

    return {
      success: result.compiledStatus === "success",
      error: result.compileError,
      materialId: result.materialId,
    };
  } catch (error: any) {
    console.error("Error saving website material action:", error);
    return { success: false, error: error.message || "Gagal menyimpan materi website." };
  }
}

export async function triggerBulkChapterGenerationAction(chapterId: string) {
  try {
    await inngest.send({
      name: "ai.bulk.chapter.generate",
      data: { chapterId },
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error triggering bulk chapter generation:", error);
    return { success: false, error: error.message || "Failed to trigger bulk generation." };
  }
}

export async function getChapterAssetGenProgressAction(chapterId: string) {
  try {
    const [chapter] = await db
      .select({
        status: chapters.assetGenStatus,
        flashcardsTotal: chapters.assetGenFlashcardsTotal,
        flashcardsCurrent: chapters.assetGenFlashcardsCurrent,
        questionsTotal: chapters.assetGenQuestionsTotal,
        questionsCurrent: chapters.assetGenQuestionsCurrent,
        error: chapters.assetGenError,
      })
      .from(chapters)
      .where(eq(chapters.id, chapterId));

    if (!chapter) {
      return { success: false, error: "Chapter not found." };
    }

    return {
      success: true,
      progress: {
        status: chapter.status,
        flashcardsTotal: chapter.flashcardsTotal,
        flashcardsCurrent: chapter.flashcardsCurrent,
        questionsTotal: chapter.questionsTotal,
        questionsCurrent: chapter.questionsCurrent,
        error: chapter.error,
      },
    };
  } catch (error: any) {
    console.error("Error fetching asset generation progress:", error);
    return { success: false, error: error.message || "Failed to fetch progress." };
  }
}
