import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { db } from "@/db";
import { aiQuestionBank, assessmentSources, auditMutasi, ide, pembahasanSoal, pengguna, soal, soalIde, vectorSyncQueue } from "@/db/schema";
import { canonicalQuestionStatus, type QuestionReviewStatus } from "@/lib/question-authoring-contract";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Queue the current owner and version while preserving the legacy course FK. */
export async function enqueueQuestionReviewVectorTx(tx: Tx, input: {
  id: string; courseId: string; version: number; reviewStatus: QuestionReviewStatus; prompt: string; previousVersion?: number;
}): Promise<void> {
  const action = input.reviewStatus === "published" ? "upsert" : "delete";
  const [canonical] = await tx.select({ id: soal.id }).from(soal).where(eq(soal.id, input.id)).limit(1);
  if (!canonical) return;
  await tx.insert(vectorSyncQueue).values({
    id: `sync-${randomUUID()}`, courseId: input.courseId, action, namespace: "published_questions",
    payload: { entityId: input.id, version: input.version, legacyKind: "question", ...(action === "upsert" ? { text: `Question: ${input.prompt}` } : {}) },
  });
  for (const version of new Set([1, input.previousVersion].filter((version): version is number => version !== undefined && version !== input.version))) {
    await tx.insert(vectorSyncQueue).values({
      id: `sync-${randomUUID()}`, courseId: input.courseId, action: "delete", namespace: "published_questions",
      payload: { entityId: input.id, version, legacyKind: "question" },
    });
  }
  const solutions = await tx.select().from(pembahasanSoal).where(eq(pembahasanSoal.soalId, input.id));
  for (const solution of solutions) {
    const outdatedManual = solution.id.startsWith(`${input.id}:manual-solution:v`) && solution.version !== input.version;
    if (outdatedManual) await tx.update(pembahasanSoal).set({ status: "retired", updatedAt: new Date() }).where(eq(pembahasanSoal.id, solution.id));
    const action = input.reviewStatus === "published" && solution.status === "published" && !outdatedManual ? "upsert" : "delete";
    await tx.insert(vectorSyncQueue).values({ id: `sync-${randomUUID()}`, courseId: input.courseId, action, namespace: "published_solutions",
      payload: { entityId: solution.id, version: solution.version, ...(action === "upsert" ? { text: solution.content } : {}) },
    });
  }
}

/** Caller must enforce its existing role and action authorization before entering this transaction. */
export async function transitionQuestionReviewTx(tx: Tx, input: {
  id: string; reviewStatus: QuestionReviewStatus; actorId?: string;
}): Promise<{ courseId: string; version: number } | null> {
  // Canonical first, matching vector reconciliation's parent-before-projection order.
  const [canonical] = await tx.select().from(soal).where(eq(soal.id, input.id)).limit(1).for("update");
  const [compatibility] = await tx.select().from(aiQuestionBank).where(eq(aiQuestionBank.id, input.id)).limit(1).for("update");
  if (!compatibility) return null;

  if (input.reviewStatus === "published" && (canonical?.origin === "historical_reference" || compatibility.origin === "historical_reference")) {
    const [validSource] = canonical ? await tx.select({ id: assessmentSources.id }).from(assessmentSources)
      .where(and(eq(assessmentSources.id, canonical.assessmentSourceId ?? ""), isNull(assessmentSources.deletedAt))).limit(1) : [];
    const [validIdea] = canonical ? await tx.select({ id: ide.id }).from(soalIde)
      .innerJoin(ide, eq(soalIde.ideId, ide.id))
      .where(and(eq(soalIde.soalId, canonical.id), eq(ide.status, "published"), eq(ide.mataKuliahId, canonical.mataKuliahId))).limit(1) : [];
    if (!canonical || canonical.origin !== "historical_reference" || !validSource || !validIdea) {
      throw new Error("Soal historis harus memiliki sumber yang valid dan minimal satu Idea published sebelum dipublikasikan.");
    }
  }

  const canonicalStatus = canonicalQuestionStatus(input.reviewStatus);
  const now = new Date();
  const publishedAt = canonicalStatus === "published" ? now : null;
  await tx.update(aiQuestionBank).set({
    reviewStatus: input.reviewStatus, status: canonicalStatus === "retired" ? "retired" : "active",
  }).where(eq(aiQuestionBank.id, input.id));
  if (canonical) {
    await tx.update(soal).set({ status: canonicalStatus, publishedAt, updatedAt: now }).where(eq(soal.id, input.id));
    await tx.update(pembahasanSoal).set({ status: canonicalStatus, publishedAt, updatedAt: now }).where(eq(pembahasanSoal.soalId, input.id));
  }
  const [actor] = input.actorId
    ? await tx.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, input.actorId)).limit(1)
    : [];
  await tx.insert(auditMutasi).values({
    id: `audit-question-status-${input.id}-${randomUUID()}`, actorId: actor?.id ?? null,
    entityType: "question", entityId: input.id,
    action: input.reviewStatus === "published" ? "published" : "review_status_updated",
    beforeSnapshot: canonical
      ? { version: canonical.version, status: canonical.status, courseId: canonical.mataKuliahId }
      : { reviewStatus: compatibility.reviewStatus, courseId: compatibility.courseId },
    afterSnapshot: { reviewStatus: input.reviewStatus, canonicalStatus }, correlationId: input.id, createdAt: now,
  });
  const version = canonical?.version ?? 1;
  await enqueueQuestionReviewVectorTx(tx, {
    id: input.id, courseId: compatibility.courseId, version, reviewStatus: input.reviewStatus, prompt: compatibility.prompt,
  });
  return { courseId: compatibility.courseId, version };
}
