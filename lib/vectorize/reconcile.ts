import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { db } from "@/db";
import { artikel, ide, pembahasanSoal, potonganSumber, soal, soalItbReferensi, sumberMateri, vectorSyncQueue } from "@/db/schema";
import { articleIndexableMarkdown } from "@/lib/articles/structured-read-model";
import { hasLegacyPrivateFormativeEnvelope } from "@/lib/materials/legacy-article-public";
import { redactQuestionAnswerKeys } from "@/lib/asesmen/question-options";
import { serializeDeterministically } from "@/lib/bundle/idea-bundle-v2";
import { canonicalOutboxPayload, canonicalOutboxTitle } from "./outbox";
import { lockCanonicalIdentities, type CanonicalLock } from "./canonical-locks";
import type { ProviderNeutralVectorOutbox, ProviderNeutralVectorOutboxUpsert } from "./contracts";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type VectorRow = typeof vectorSyncQueue.$inferSelect;
export type ReconciledVector = { row: VectorRow; outbox: ProviderNeutralVectorOutbox; title: string; managed: boolean; authoritative?: true };

const managedNamespaces = new Set(["canonical_ideas", "source_materials", "published_articles", "published_questions", "published_solutions"]);
export const RETIRED_VECTOR_NAMESPACES = new Set(["learning", "practice", "past_exams", "idea", "product"]);
const compatibilityNamespaces = ["itb_question_references", "admin_ops_knowledge"];

/** Validate row-local contracts separately so malformed rows cannot poison a batch. */
export function validateQueuedVectorRow(row: VectorRow): void {
  if (RETIRED_VECTOR_NAMESPACES.has(row.namespace)) throw new Error("VECTOR_SYNC_LEGACY_NAMESPACE_RETIRED");
  if (row.action !== "upsert" && row.action !== "delete") throw new Error("VECTOR_SYNC_INVALID_ACTION");
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload as Record<string, unknown> : {};
  const metadata = payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? payload.metadata as Record<string, unknown> : {};
  const identity = [payload.entityId, metadata.entityId, payload.id, row.koId ?? undefined].filter(value => value !== undefined);
  if (!managedNamespaces.has(row.namespace) && row.namespace !== "itb_question_references") {
    canonicalOutboxPayload(row); return;
  }
  const versions = [payload.version, metadata.version].filter(value => value !== undefined);
  if (!identity.length || identity.some(value => typeof value !== "string" || !value.trim() || value !== value.trim() || value !== identity[0])) throw new Error("VECTOR_SYNC_INVALID_IDENTITY");
  if (!versions.length || versions.some(value => typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value !== versions[0])) throw new Error("VECTOR_SYNC_INVALID_VERSION");
  const outbox = canonicalOutboxPayload({ ...row, action: "delete" });
  const types = [payload.entityType, metadata.entityType].filter(value => value !== undefined);
  if (outbox.entityId !== identity[0] || outbox.version !== versions[0] || types.some(value => (value === "source_chunk" ? "source_material" : value) !== outbox.entityType)) throw new Error("VECTOR_SYNC_CONFLICTING_IDENTITY");
}

function ids(rows: ReconciledVector[], type: string): string[] {
  return [...new Set(rows.filter(row => row.managed && row.outbox.entityType === type).map(row => row.outbox.entityId))].sort();
}

/** Includes the title because it is part of the actual embedding input. */
export function embeddingKey(outbox: ProviderNeutralVectorOutboxUpsert, title: string): string {
  return createHash("sha256").update(JSON.stringify([outbox.vectorId, outbox.metadata.contentHash, title])).digest("hex");
}

async function reconcileCompatibility(tx: Tx, operations: ReconciledVector[]): Promise<Map<string, ReconciledVector>> {
  const compatibility = operations.filter(operation => !operation.managed);
  if (!compatibility.length) return new Map();
  const knownNamespaces = new Set(["itb_question_references"]);
  const entityIds = [...new Set(compatibility.filter(operation => !knownNamespaces.has(operation.row.namespace)).map(operation => operation.outbox.entityId))];
  // Queue payload identity is immutable. Completion adds metadata without
  // changing these producer fields. Look beyond this batch, including completed
  // rows, so an older batch cannot overwrite a newer completed snapshot.
  const effectiveId = sql<string>`coalesce(${vectorSyncQueue.payload}->'metadata'->>'entityId', ${vectorSyncQueue.payload}->>'entityId', ${vectorSyncQueue.payload}->>'id', ${vectorSyncQueue.koId}, ${vectorSyncQueue.id})`;
  const candidates = entityIds.length ? await tx.select().from(vectorSyncQueue).where(and(inArray(vectorSyncQueue.namespace, compatibilityNamespaces), inArray(effectiveId, entityIds))).orderBy(desc(vectorSyncQueue.createdAt), desc(vectorSyncQueue.id)) : [];
  const latest = new Map<string, { outbox: ProviderNeutralVectorOutbox; title: string }>();
  for (const candidate of candidates) {
    try {
      validateQueuedVectorRow(candidate);
      const outbox = canonicalOutboxPayload(candidate);
      if (!latest.has(outbox.vectorId)) latest.set(outbox.vectorId, { outbox, title: canonicalOutboxTitle(candidate) });
    } catch { /* Malformed rows remain isolated for repair, never authoritative. */ }
  }
  const referenceIds = compatibility.filter(operation => operation.outbox.entityType === "question_reference").map(operation => operation.outbox.entityId);
  const references = referenceIds.length ? await tx.select({ reference: soalItbReferensi, question: soal }).from(soalItbReferensi).leftJoin(soal, eq(soalItbReferensi.soalId, soal.id)).where(inArray(soalItbReferensi.id, referenceIds)) : [];
  return new Map(compatibility.map((operation): [string, ReconciledVector] => {
    if (operation.outbox.entityType === "question_reference") {
      const canonical = references.find(row => row.reference.id === operation.outbox.entityId);
      const allowed = !!canonical && canonical.reference.authoringVisibility === "allowed" && !!canonical.question && canonical.reference.version === operation.outbox.version;
      const content = canonical ? serializeDeterministically(canonical.reference.contentSnapshot) : "";
      const outbox = canonicalOutboxPayload({ ...operation.row, action: allowed ? "upsert" : "delete", payload: { entityId: operation.outbox.entityId, version: operation.outbox.version, ...(allowed ? { text: content, canonicalCourseId: canonical!.question!.mataKuliahId, metadata: { status: "active", chapterId: canonical!.question!.babId ?? "" } } : {}) } });
      return [operation.row.id, { ...operation, outbox, title: "Historical reference", authoritative: true }];
    }
    const current = latest.get(operation.outbox.vectorId);
    return [operation.row.id, current ? { ...operation, ...current, authoritative: true as const } : operation];
  }));
}

/**
 * Called in a transaction before embedding and during provider writes. Discover
 * parents without row locks, acquire all publisher advisory keys, then share
 * lock parents before children. Recheck parent discovery under those locks.
 */
export async function reconcileVectorRows(tx: Tx, rows: VectorRow[]): Promise<ReconciledVector[]> {
  const initial = rows.map(row => {
    validateQueuedVectorRow(row);
    const managed = managedNamespaces.has(row.namespace);
    // Resolve identity without reading or validating an untrusted queued body.
    const outbox = canonicalOutboxPayload(managed ? { ...row, action: "delete" } : row);
    return { row, outbox, title: managed ? "" : canonicalOutboxTitle(row), managed };
  });
  const chunkIds = ids(initial, "source_material");
  const solutionIds = ids(initial, "solution");
  const initialChunks = chunkIds.length ? await tx.select({ id: potonganSumber.id, parentId: potonganSumber.sumberMateriId }).from(potonganSumber).where(inArray(potonganSumber.id, chunkIds)) : [];
  const initialSolutions = solutionIds.length ? await tx.select({ id: pembahasanSoal.id, parentId: pembahasanSoal.soalId }).from(pembahasanSoal).where(inArray(pembahasanSoal.id, solutionIds)) : [];
  const locks: CanonicalLock[] = initial.flatMap<CanonicalLock>(({ managed, outbox }) => {
    if (!managed) return [{ domain: "compatibility" as const, entityType: outbox.entityType, entityId: outbox.entityId }];
    if (outbox.entityType === "idea") return [{ domain: "idea" as const, entityType: "idea", entityId: outbox.entityId }];
    if (outbox.entityType === "source_material") return [{ domain: "idea" as const, entityType: "source_chunk", entityId: outbox.entityId }];
    return [{ domain: "product" as const, entityType: outbox.entityType, entityId: outbox.entityId }];
  });
  locks.push(...initialChunks.map(chunk => ({ domain: "idea" as const, entityType: "source_material", entityId: chunk.parentId })));
  locks.push(...initialSolutions.map(solution => ({ domain: "product" as const, entityType: "question", entityId: solution.parentId })));
  await lockCanonicalIdentities(tx, locks);

  const parentSourceIds = [...new Set(initialChunks.map(chunk => chunk.parentId))].sort();
  const questionIds = [...new Set([...ids(initial, "question"), ...initialSolutions.map(solution => solution.parentId)])].sort();
  const articleIds = ids(initial, "article");
  const ideaIds = ids(initial, "idea");
  // Row share locks also serialize with non-bundle writers. Parents precede
  // children, and no queue row is locked until after canonical identities.
  const questions = questionIds.length ? await tx.select().from(soal).where(inArray(soal.id, questionIds)).orderBy(soal.id).for("share") : [];
  const solutions = solutionIds.length ? await tx.select().from(pembahasanSoal).where(inArray(pembahasanSoal.id, solutionIds)).orderBy(pembahasanSoal.id).for("share") : [];
  const articles = articleIds.length ? await tx.select().from(artikel).where(inArray(artikel.id, articleIds)).orderBy(artikel.id).for("share") : [];
  const sources = parentSourceIds.length ? await tx.select().from(sumberMateri).where(inArray(sumberMateri.id, parentSourceIds)).orderBy(sumberMateri.id).for("share") : [];
  const chunks = chunkIds.length ? await tx.select().from(potonganSumber).where(inArray(potonganSumber.id, chunkIds)).orderBy(potonganSumber.id).for("share") : [];
  const ideas = ideaIds.length ? await tx.select().from(ide).where(inArray(ide.id, ideaIds)).orderBy(ide.id).for("share") : [];
  const oldChunks = new Map(initialChunks.map(row => [row.id, row.parentId]));
  const oldSolutions = new Map(initialSolutions.map(row => [row.id, row.parentId]));
  if (chunks.some(row => oldChunks.get(row.id) !== row.sumberMateriId) || solutions.some(row => oldSolutions.get(row.id) !== row.soalId)) {
    throw new Error("VECTOR_SYNC_PARENT_CHANGED");
  }
  const compatibility = await reconcileCompatibility(tx, initial);

  return initial.map(operation => {
    if (!operation.managed) return compatibility.get(operation.row.id) ?? operation;
    const { entityType, entityId, version } = operation.outbox;
    let current: { version: number; status: string; content: string; title: string; courseId: string; chapterId: string | null } | undefined;
    if (entityType === "idea") {
      const row = ideas.find(item => item.id === entityId);
      if (row) current = { version: row.version, status: row.status, content: [row.canonicalStatement, row.conciseExplanation, row.latex ? `Formula: ${row.latex}` : ""].filter(Boolean).join("\n\n"), title: row.code, courseId: row.mataKuliahId, chapterId: row.babId };
    } else if (entityType === "source_material") {
      const chunk = chunks.find(item => item.id === entityId);
      const source = sources.find(item => item.id === chunk?.sumberMateriId);
      if (chunk && source && chunk.embeddingEligible && source.version === chunk.sourceVersion) current = { version: chunk.sourceVersion, status: source.status, content: chunk.content, title: source.title, courseId: source.mataKuliahId, chapterId: source.babId };
    } else if (entityType === "article") {
      const row = articles.find(item => item.id === entityId);
      if (row && !hasLegacyPrivateFormativeEnvelope(row.contentMarkdown)) current = { version: row.version, status: row.status, content: articleIndexableMarkdown(row.contentMarkdown), title: row.title, courseId: row.mataKuliahId, chapterId: row.babId };
    } else if (entityType === "question") {
      const row = questions.find(item => item.id === entityId);
      if (row) current = { version: row.version, status: row.status, content: `${row.prompt}\n\nOptions: ${serializeDeterministically(redactQuestionAnswerKeys(row.optionsSnapshot))}`, title: "Published question", courseId: row.mataKuliahId, chapterId: row.babId };
    } else if (entityType === "solution") {
      const row = solutions.find(item => item.id === entityId);
      const question = questions.find(item => item.id === row?.soalId);
      if (row && question?.status === "published") current = { version: row.version, status: row.status, content: row.content, title: "Published solution", courseId: question.mataKuliahId, chapterId: question.babId };
    }
    if (!current || current.version !== version || (current.status !== "published" && current.status !== "active") || !current.content.trim()) return operation;
    const outbox = canonicalOutboxPayload({ ...operation.row, action: "upsert", payload: {
      entityType, entityId, version, text: current.content, canonicalCourseId: current.courseId,
      metadata: { entityId, version, status: current.status, ...(current.chapterId ? { chapterId: current.chapterId } : {}) },
    } });
    return { ...operation, outbox, title: current.title };
  });
}
