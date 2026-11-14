import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { conceptLocalizations, concepts, knowledgeObjects, knowledgeObjectSources, vectorSyncQueue } from "@/db/schema";
import { computeSemanticKoHash, reconcileKoExtractionRun } from "@/lib/knowledge/identity";
import type { CandidateKo, KnowledgeKind } from "@/lib/knowledge/contracts";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type KoRow = typeof knowledgeObjects.$inferInsert & { id: string; title: string; content: string; type: NonNullable<typeof knowledgeObjects.$inferInsert.type> };

/** Persists only a completely unambiguous extraction, inside the caller's transaction. */
export async function persistKoExtractionTx(tx: Tx, input: {
  courseId: string;
  mtdId: string;
  chapterId: string;
  sourceVersion: string;
  sourceHash: string;
  chapterMarkdown: string;
  candidates: KoRow[];
  newConcepts: Array<typeof concepts.$inferInsert>;
  newLocalizations: Array<typeof conceptLocalizations.$inferInsert>;
}): Promise<boolean> {
  const existing = await tx.select().from(knowledgeObjects)
    .where(eq(knowledgeObjects.chapterId, input.chapterId)).for("update");

  const candidateInputs: CandidateKo[] = input.candidates.map((ko) => {
    const titleIdx = input.chapterMarkdown.indexOf(ko.title);
    const startOffset = titleIdx >= 0 ? titleIdx : 0;
    return {
      title: ko.title, summary: ko.content,
      knowledgeKind: ko.type as KnowledgeKind, instructionalRole: "core",
      sourceSpans: [{
        sourceDocumentId: input.mtdId, sourceVersion: input.sourceVersion,
        chapterId: input.chapterId, startOffset,
        endOffset: startOffset + Math.max(ko.title.length, 10),
        sourceHash: input.sourceHash,
        excerptHash: computeSemanticKoHash(ko.title, ko.content, ko.type as KnowledgeKind, "core"),
        supportRole: "core",
      }],
    };
  });
  const { reconciliations, hasAmbiguousMatch } = reconcileKoExtractionRun(existing, candidateInputs, input.mtdId, input.chapterId);
  const candidateReconciliations = reconciliations.slice(0, input.candidates.length);
  const keys = candidateReconciliations.map((rec) => rec.stableKey);
  const matchedIds = candidateReconciliations.flatMap((rec) => rec.existingId ? [rec.existingId] : []);
  const existingById = new Map(existing.map((row) => [row.id, row]));
  if (hasAmbiguousMatch || new Set(keys).size !== keys.length || new Set(matchedIds).size !== matchedIds.length ||
      candidateReconciliations.length !== input.candidates.length ||
      candidateReconciliations.some((rec) => rec.action === "needs_review" || (rec.action !== "insert" && (!rec.existingId || !existingById.has(rec.existingId)))) ||
      reconciliations.slice(input.candidates.length).some((rec) => rec.action !== "supersede" || !rec.existingId || !existingById.has(rec.existingId))) {
    return false;
  }

  if (input.newConcepts.length) {
    await tx.insert(concepts).values(input.newConcepts);
    await tx.insert(conceptLocalizations).values(input.newLocalizations);
  }

  const outbox: Array<typeof vectorSyncQueue.$inferInsert> = [];
  const queueDelete = (id: string, version: number, active: boolean) => {
    outbox.push({
      id: randomUUID(), courseId: input.courseId, koId: id, action: "delete",
      // A compatibility delete for an active KO is reconciled back to an upsert.
      // Managed deletes remove an obsolete version while respecting canonical ownership.
      namespace: active ? "canonical_ideas" : "learning",
      payload: { entityId: id, version, legacyKind: "knowledge_object" },
    });
  };
  const supersede = async (id: string) => {
    const old = existingById.get(id)!;
    await tx.update(knowledgeObjects).set({ status: "superseded", updatedAt: new Date() }).where(eq(knowledgeObjects.id, id));
    queueDelete(id, old.version, false);
    if (old.version !== 1) queueDelete(id, 1, false);
  };

  for (const rec of reconciliations.slice(input.candidates.length)) await supersede(rec.existingId!);

  for (let i = 0; i < input.candidates.length; i++) {
    const ko = input.candidates[i];
    const rec = candidateReconciliations[i];
    const old = rec.existingId ? existingById.get(rec.existingId) : undefined;
    let persisted: typeof knowledgeObjects.$inferSelect;
    if (rec.action === "insert" || rec.action === "supersede") {
      if (rec.action === "supersede") await supersede(rec.existingId!);
      [persisted] = await tx.insert(knowledgeObjects).values({
        ...ko, stableKey: rec.stableKey, semanticHash: rec.semanticHash,
        knowledgeKind: ko.type as KnowledgeKind, instructionalRole: "core", version: 1,
      }).returning();
    } else {
      const nextVersion = rec.action === "update" ? old!.version + 1 : old!.version;
      if (rec.action === "update" || old!.status !== "active") {
        [persisted] = await tx.update(knowledgeObjects).set({
          conceptName: ko.conceptName, title: ko.title, content: ko.content, type: ko.type,
          semanticHash: rec.semanticHash, status: "active", version: nextVersion, updatedAt: new Date(),
        }).where(eq(knowledgeObjects.id, old!.id)).returning();
      } else {
        persisted = old!;
      }
      if (rec.action === "update") queueDelete(persisted.id, old!.version, true);
      if (persisted.version !== 1 && !(rec.action === "update" && old!.version === 1)) queueDelete(persisted.id, 1, true);
    }

    for (const span of candidateInputs[i].sourceSpans) {
      await tx.insert(knowledgeObjectSources).values({
        id: `kos-${randomUUID()}`, koId: persisted.id, sourceDocumentId: input.mtdId,
        sourceVersion: input.sourceVersion, chapterId: input.chapterId,
        startOffset: span.startOffset, endOffset: span.endOffset, sourceHash: span.sourceHash,
        excerptHash: rec.semanticHash, supportRole: span.supportRole, createdAt: new Date(),
      }).onConflictDoNothing();
    }
    outbox.push({
      id: randomUUID(), courseId: persisted.courseId, koId: persisted.id, action: "upsert", namespace: "learning",
      payload: {
        entityId: persisted.id, version: persisted.version, legacyKind: "knowledge_object",
        text: `Title: ${persisted.title}\nConcept: ${persisted.conceptName}\nContent: ${persisted.content}`,
        metadata: { chapterId: persisted.chapterId, type: persisted.type, bloomLevel: persisted.bloomLevel, difficulty: persisted.difficulty, tags: persisted.tags },
      },
    });
  }
  if (outbox.length) await tx.insert(vectorSyncQueue).values(outbox);
  return true;
}
