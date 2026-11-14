import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { asalIde, artikelIde, auditMutasi, bab, bagianPembelajaran, bagianPembelajaranIde, relasiIde, diktatIde, flashcardIde, ide, imporBundle, itemImporBundle, ketergantunganProduk, mataKuliah, reviewBundle, reviewItemBundle, solutionCollections, vectorSyncQueue } from "@/db/schema";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { storage } from "@/lib/storage";
import { buildIdeaBundleKey, buildProductBundleKey } from "@/lib/storage/keys";
import { parseIdeaBundle, serializeDeterministically, type ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { readSecureZip } from "@/lib/bundle/zip-reader";
import { parseAdmittedProductBundle } from "@/lib/bundle/product-staged-worker";
import { productEntityHash } from "@/lib/bundle/product-bundle-v2";
import type { ProductEntity, ProductBundleValidation } from "@/lib/bundle/product-validator";
import { validateProductBundleAdmission } from "@/lib/bundle/product-admission";
import { productInteractiveDocuments } from "@/lib/bundle/product-validator";
import { stageInteractiveDocumentAssets, validateInteractiveDocumentArchive } from "@/lib/materials/interactive-document-assets";
import { getIdeaRevisionReviewContext, publishIdeaBundle, reviewIdeaBundleRevision, withdrawIdeaBundle } from "@/lib/bundle/publication";
import { publishProductBundle, withdrawProductBundle, productPublicationLockIdentities } from "@/lib/bundle/product-publication";
import { currentPublisherProductReadiness } from "@/lib/bundle/product-readiness";
import { executePedagogicReview, type ExecutePedagogicReviewInput } from "@/lib/bundle/product-pedagogic-review";
import { reviewProductBundle } from "@/lib/bundle/product-staging";
import { productPedagogyFingerprint } from "@/lib/bundle/product-review-gate";
import { computeProductV4SectionSemanticHash, normalizeProductSectionDecisions, productSectionReviewKey, type ProductV4SectionDecision } from "@/lib/bundle/product-v4-review";
import { getProductV4VerificationReadiness } from "@/lib/bundle/product-v4-verification-service";
import { getSolutionCollectionReviewContext, reviewSolutionCollection } from "@/lib/solutions/review";
import { solutionItemHash } from "@/lib/solutions/review-contract";
import { ideaReviewTargets, type IdeaReviewItem } from "./idea-review";
import { buildRevisionArtifact, type RevisionKind, type RevisionPatchOperation } from "./revision-artifact";
import { withRevisionPublication, revisionEntityKey } from "./revision-publication-context";
import { withRevisionReviewGuard } from "./revision-review-context";
import { dispatchVectorSync } from "@/lib/vector-sync-dispatch";
import { lockCanonicalIdentities, type CanonicalLock } from "@/lib/vectorize/canonical-locks";
import { assertProspectiveReleaseDependencies, assertRevisionVerificationReleaseContext } from "./revision-verification-context";
export { prepareRevisionVerification } from "./revision-verification-context";

export type RevisionSelector = { actorId: string; kind: RevisionKind; importId: string; expectedRevision: string };
export type RevisionReleaseEntry = { importId: string; expectedRevision: string };
export type RevisionReleaseInput = { actorId: string; entries: RevisionReleaseEntry[] };
export type CreateRevisionInput = { actorId: string; kind: RevisionKind; baseImportId: string; expectedRevision: string; entityIds?: string[] };
export type RestoreRevisionInput = { actorId: string; kind: RevisionKind; historicalImportId: string; expectedRevision: string; currentImportId: string; currentRevision: string };
export type RevisionReviewInput = RevisionSelector & { evidence: Record<string, unknown> };
type Row = typeof imporBundle.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ProductBundle = Extract<ProductBundleValidation, { success: true }>["data"];
type Bundle = ProductBundle | ValidatedIdeaBundle;
type Lineage = {
  schema: "authoring-revision.v1"; rootImportId: string; baseImportId: string; baseRevision: string;
  previousImportId: string; previousRevision: string; stagingRunId: string; selectedEntityIds: string[];
  restoredFrom?: { importId: string; revision: string }; impact: unknown; requestFingerprint: string;
};
const digest = (value: unknown) => createHash("sha256").update(serializeDeterministically(JSON.parse(JSON.stringify(value)))).digest("hex");
const checksum = (bundle: Bundle) => "canonicalChecksum" in bundle ? bundle.canonicalChecksum : bundle.checksum;
const kindOf = (row: Row): RevisionKind => { if ((row.bundleType !== "idea" && row.bundleType !== "product") || row.version < 3) throw new Error("REVISION_V3_OR_LATER_REQUIRED"); return row.bundleType; };
function lineageOf(row: Row): Lineage | null {
  const value = row.validationReport.revisionLineage as Lineage | undefined;
  return value?.schema === "authoring-revision.v1" ? value : null;
}
async function authorize(actorId: string, connection: typeof db | Tx = db, lock = false) {
  await assertAuthoringActor(connection, actorId, { roles: ["admin"], error: "REVISION_ADMIN_REQUIRED", requireLegacyAdmin: true, lock });
}
async function rowFor(importId: string, expectedRevision: string, kind?: RevisionKind, connection: typeof db | Tx = db, lock = false) {
  if (!/^[a-f0-9]{64}$/.test(expectedRevision)) throw new Error("REVISION_EXPECTED_CHECKSUM_REQUIRED");
  const query = connection.select().from(imporBundle).where(eq(imporBundle.id, importId)).limit(1);
  const [row] = await (lock ? query.for("update") : query);
  if (!row || kind && row.bundleType !== kind) throw new Error("REVISION_NOT_FOUND");
  kindOf(row);
  if (row.checksum !== expectedRevision) throw new Error("REVISION_STALE_CONTEXT");
  return row;
}
async function bundleFor(row: Row): Promise<Bundle> {
  if (!storage.download) throw new Error("REVISION_ARTIFACT_UNAVAILABLE");
  const bytes = await storage.download(row.sourceUriOrKey);
  const bundle = row.bundleType === "idea" ? parseIdeaBundle(readSecureZip(bytes)) : parseAdmittedProductBundle(bytes, row);
  if (bundle.manifest.schemaVersion !== `${row.bundleType}-bundle.v${row.version}`) throw new Error("REVISION_SCHEMA_IDENTITY_MISMATCH");
  if (checksum(bundle) !== row.checksum || bundle.manifest.bundleId !== row.bundleId) throw new Error("REVISION_ARTIFACT_MISMATCH");
  return bundle;
}
function productBundle(bundle: Bundle): ProductBundle { if (!("products" in bundle)) throw new Error("REVISION_KIND_MISMATCH"); return bundle; }
function ideaBundle(bundle: Bundle): ValidatedIdeaBundle { if (!("entities" in bundle)) throw new Error("REVISION_KIND_MISMATCH"); return bundle; }
async function scopeFor(bundle: Bundle) {
  const courses = await db.select().from(mataKuliah).where(or(eq(mataKuliah.id, bundle.manifest.courseId), eq(mataKuliah.legacyCourseId, bundle.manifest.courseId))).limit(2);
  if (courses.length !== 1) throw new Error("REVISION_COURSE_SCOPE_AMBIGUOUS");
  const [course] = courses;
  if (!course || !course.legacyCourseId) throw new Error("REVISION_COURSE_NOT_FOUND");
  const ids = new Set<string>();
  if ("entities" in bundle) {
    for (const entity of [...bundle.entities.ideas, ...bundle.entities.learningSections, ...bundle.entities.sourceMaterials]) if (entity.chapterId) ids.add(entity.chapterId);
  } else for (const product of bundle.products) {
    if ("chapterId" in product && typeof product.chapterId === "string") ids.add(product.chapterId);
    if ("chapterIds" in product && Array.isArray(product.chapterIds)) for (const id of product.chapterIds) ids.add(id);
  }
  if (ids.size !== 1) throw new Error("REVISION_SINGLE_CHAPTER_SCOPE_REQUIRED");
  const chapterId = [...ids][0];
  const [chapter] = await db.select().from(bab).where(and(eq(bab.id, chapterId), eq(bab.mataKuliahId, course.id))).limit(1);
  if (!chapter) throw new Error("REVISION_CHAPTER_SCOPE_MISMATCH");
  return { courseId: course.id, artifactCourseId: bundle.manifest.courseId, legacyCourseId: course.legacyCourseId, chapterId, courseTitle: course.title, chapterTitle: chapter.title };
}
function inventory(bundle: Bundle) {
  if ("products" in bundle) return [
    ...bundle.products.map(product => ({ entityType: product.productType, entityId: product.id, entityVersion: product.version, entityHash: productEntityHash(product) })),
    ...bundle.dependencies.map(dependency => ({ entityType: "dependency", entityId: dependency.id, entityVersion: dependency.downstreamVersion, entityHash: digest(dependency) })),
  ];
  return [
    ...bundle.entities.sourceMaterials.map(entity => ({ entityType: "source_material", entityId: entity.id, entityVersion: entity.version, entityHash: digest(entity) })),
    ...bundle.entities.sourceChunks.map(entity => ({ entityType: "source_chunk", entityId: entity.id, entityVersion: entity.sourceVersion, entityHash: digest(entity) })),
    ...bundle.entities.ideas.map(entity => ({ entityType: "idea", entityId: entity.id, entityVersion: entity.version, entityHash: digest(entity) })),
    ...bundle.entities.provenance.map(entity => ({ entityType: "provenance", entityId: entity.id, entityVersion: 1, entityHash: digest(entity) })),
    ...bundle.entities.relations.map(entity => ({ entityType: "relation", entityId: entity.id, entityVersion: entity.version, entityHash: digest(entity) })),
    ...bundle.entities.learningSections.map(entity => ({ entityType: "learning_section", entityId: entity.id, entityVersion: 1, entityHash: digest(entity) })),
  ];
}
const identitySnapshot = (row: Row) => digest({ id: row.id, checksum: row.checksum, status: row.status, sourceUriOrKey: row.sourceUriOrKey, version: row.version, courseId: row.courseId, validationReport: row.validationReport });
async function audit(tx: Tx, actorId: string, row: Row, action: string, after: Record<string, unknown>, before: Record<string, unknown> | null = null) {
  await tx.insert(auditMutasi).values({ id: `audit-revision-${randomUUID()}`, actorId, entityType: "authoring_revision", entityId: row.id, action, beforeSnapshot: before, afterSnapshot: after, correlationId: lineageOf(row)?.rootImportId ?? row.id, courseId: row.courseId });
}
async function latestLive(rootImportId: string, connection: typeof db | Tx = db) {
  return connection.select().from(imporBundle).where(and(eq(imporBundle.status, "published"), or(eq(imporBundle.id, rootImportId), sql`${imporBundle.validationReport}->'revisionLineage'->>'rootImportId' = ${rootImportId}`))).limit(2);
}

/** Persist a new immutable revision and close only its preceding unpublished draft. */
async function persistDraft(input: { actorId: string; kind: RevisionKind; source: Row; original: Bundle; operations: RevisionPatchOperation[]; previous?: Row; selectedEntityIds?: string[]; restoreFrom?: Row; base?: Row; versionOverrides?: Record<string, number> }) {
  const previousLineage = lineageOf(input.previous ?? input.source);
  const base = input.base ?? (input.source.status === "published" ? input.source : previousLineage ? await rowFor(previousLineage.baseImportId, previousLineage.baseRevision, input.kind) : input.source);
  const importId = `impor-${input.kind}-revision-${randomUUID()}`;
  const stagingRunId = input.previous && previousLineage ? previousLineage.stagingRunId : `mcp-run-${randomUUID()}`;
  const bundleId = `revision-${randomUUID()}`;
  const built = buildRevisionArtifact({ kind: input.kind, original: input.original, bundleId, operations: input.operations, incrementVersions: Boolean(input.operations.length), versionOverrides: input.versionOverrides } as Parameters<typeof buildRevisionArtifact>[0]);
  const bundle = built.bundle as Bundle;
  if (input.previous && !built.impact.changed) return getRevisionContext({ actorId: input.actorId, kind: input.kind, importId: input.previous.id, expectedRevision: input.previous.checksum });
  const scope = await scopeFor(bundle);
  if ("products" in bundle) {
    if (bundle.products.some(product => !["article", "diktat", "flashcard_set", "flashcard", "solution_collection"].includes(product.productType))) throw new Error("REVISION_LEARNING_PRODUCTS_ONLY");
    const admitted = await validateProductBundleAdmission(built.bytes);
    if (!admitted.success || admitted.data.checksum !== checksum(bundle)) throw new Error("REVISION_ADMISSION_FAILED");
    const pairs = await validateInteractiveDocumentArchive(productInteractiveDocuments(bundle.products), bundle.manifest.visualAssets ?? [], bundle.files);
    if (pairs.length) await stageInteractiveDocumentAssets(pairs);
  }
  const selectedEntityIds = input.selectedEntityIds ?? (input.previous ? previousLineage?.selectedEntityIds : []) ?? [];
  const available = new Set([...inventory(bundle), ...inventory(input.original)].map(item => item.entityId));
  if (selectedEntityIds.some(id => !available.has(id))) throw new Error("REVISION_ENTITY_SELECTION_INVALID");
  const lineage: Lineage = { schema: "authoring-revision.v1", rootImportId: previousLineage?.rootImportId ?? base.id, baseImportId: base.id, baseRevision: base.checksum, previousImportId: input.previous?.id ?? input.source.id, previousRevision: input.previous?.checksum ?? input.source.checksum, stagingRunId, selectedEntityIds, requestFingerprint: digest({ actorId: input.actorId, importId: input.source.id, revision: input.source.checksum, operations: input.operations }), ...(input.restoreFrom ? { restoredFrom: { importId: input.restoreFrom.id, revision: input.restoreFrom.checksum } } : {}), impact: built.impact };
  const artifactKeyInput = { runId: stagingRunId, bundleId, checksum: checksum(bundle) };
  const sourceKey = input.kind === "idea" ? buildIdeaBundleKey(artifactKeyInput) : buildProductBundleKey(artifactKeyInput);
  await storage.upload(built.bytes, `${bundleId}.zip`, "application/zip", { key: sourceKey, metadata: { importId, checksum: checksum(bundle), rootImportId: lineage.rootImportId } });
  await db.transaction(async tx => {
    await authorize(input.actorId, tx, true);
    const source = await rowFor(input.source.id, input.source.checksum, input.kind, tx, true);
    if (identitySnapshot(source) !== identitySnapshot(input.source)) throw new Error("REVISION_STALE_CONTEXT");
    if (input.previous && !["draft", "validated", "approved", "rejected"].includes(source.status)) throw new Error("REVISION_DRAFT_REQUIRED");
    const items = inventory(bundle);
    const products = "products" in bundle ? bundle.products : [];
    const article = products.find(product => product.productType === "article");
    const diktat = products.find(product => product.productType === "diktat");
    const report = { valid: true, chapterId: scope.chapterId, bundleTitle: "title" in (bundle.manifest as object) ? String((bundle.manifest as unknown as { title: string }).title) : null, publicationBlocked: "publicationBlocked" in bundle ? bundle.publicationBlocked : false, issues: "issues" in bundle ? bundle.issues : [], productCount: products.length, dependencyCount: "dependencies" in bundle ? bundle.dependencies.length : 0, articleId: article?.id ?? null, diktatId: diktat?.id ?? null, articleGenerationHash: article?.generationHash ?? null, diktatGenerationHash: diktat?.generationHash ?? null, contentFingerprint: productPedagogyFingerprint(products), revisionLineage: lineage };
    await tx.insert(imporBundle).values({ id: importId, bundleId, bundleType: input.kind, version: input.source.version, checksum: checksum(bundle), sourceUriOrKey: sourceKey, courseId: scope.legacyCourseId, requestedBy: input.actorId, status: input.kind === "idea" ? "validated" : "draft", validationReport: report });
    if (items.length) await tx.insert(itemImporBundle).values(items.map(item => ({ ...item, id: `revision-item-${randomUUID()}`, imporBundleId: importId, status: input.kind === "idea" ? "validated" as const : "draft" as const })));
    await tx.insert(auditMutasi).values({ id: `audit-stage-${randomUUID()}`, actorId: input.actorId, entityType: `${input.kind}_bundle`, entityId: importId, action: "draft_created", correlationId: stagingRunId, afterSnapshot: { checksum: checksum(bundle), bundleId, revisionLineage: lineage } });
    const [created] = await tx.select().from(imporBundle).where(eq(imporBundle.id, importId));
    await audit(tx, input.actorId, created, input.restoreFrom ? "revision_restored" : input.previous ? "revision_patched" : "revision_created", { rootImportId: lineage.rootImportId, revision: created.checksum, sourceUriOrKey: sourceKey, lineage, impact: built.impact }, { importId: input.source.id, revision: input.source.checksum, sourceUriOrKey: input.source.sourceUriOrKey });
    if (input.previous) {
      await tx.update(imporBundle).set({ status: "withdrawn", updatedAt: new Date() }).where(eq(imporBundle.id, input.previous.id));
      await audit(tx, input.actorId, source, "draft_superseded", { rootImportId: lineage.rootImportId, successorImportId: importId, successorRevision: created.checksum, state: "superseded_draft" });
    }
  });
  return getRevisionContext({ actorId: input.actorId, kind: input.kind, importId, expectedRevision: checksum(bundle) });
}

export async function createRevisionDraft(input: CreateRevisionInput) {
  await authorize(input.actorId);
  if (input.entityIds && (input.entityIds.length > 256 || new Set(input.entityIds).size !== input.entityIds.length)) throw new Error("REVISION_ENTITY_SELECTION_INVALID");
  const source = await rowFor(input.baseImportId, input.expectedRevision, input.kind);
  if (!["published", "draft", "validated", "approved", "rejected"].includes(source.status)) throw new Error("REVISION_LIVE_OR_DRAFT_REQUIRED");
  return persistDraft({ ...input, source, original: await bundleFor(source), operations: [], selectedEntityIds: input.entityIds });
}
export async function patchRevisionDraft(input: RevisionSelector & { operations: RevisionPatchOperation[] }) {
  await authorize(input.actorId);
  if (!input.operations.length || input.operations.length > 128 || Buffer.byteLength(JSON.stringify(input.operations)) > 512 * 1024) throw new Error("REVISION_PATCH_LIMIT");
  const source = await rowFor(input.importId, input.expectedRevision, input.kind);
  const lineage = lineageOf(source);
  if (lineage && source.status === "withdrawn") {
    const fingerprint = digest({ actorId: input.actorId, importId: source.id, revision: source.checksum, operations: input.operations });
    const [successor] = await db.select().from(imporBundle).where(and(sql`${imporBundle.validationReport}->'revisionLineage'->>'previousImportId' = ${source.id}`, sql`${imporBundle.validationReport}->'revisionLineage'->>'requestFingerprint' = ${fingerprint}`)).limit(1);
    if (successor) return getRevisionContext({ actorId: input.actorId, kind: input.kind, importId: successor.id, expectedRevision: successor.checksum });
  }
  if (!lineage || !["draft", "validated", "approved", "rejected"].includes(source.status)) throw new Error("REVISION_DRAFT_REQUIRED");
  if (lineage.selectedEntityIds.length && input.operations.some(operation => !lineage.selectedEntityIds.includes(operation.target.entityId))) throw new Error("REVISION_PATCH_OUTSIDE_SELECTION");
  return persistDraft({ ...input, source, previous: source, original: await bundleFor(source) });
}
export async function restoreRevisionDraft(input: RestoreRevisionInput) {
  await authorize(input.actorId);
  const historical = await rowFor(input.historicalImportId, input.expectedRevision, input.kind);
  const current = await rowFor(input.currentImportId, input.currentRevision, input.kind);
  const root = lineageOf(current)?.rootImportId ?? current.id;
  if ((lineageOf(historical)?.rootImportId ?? historical.id) !== root || current.status !== "published") throw new Error("REVISION_RESTORE_LINEAGE_CONFLICT");
  const original = await bundleFor(historical), live = await bundleFor(current);
  const floors = new Map(inventory(live).map(item => [item.entityId, item.entityVersion]));
  const historicalVersions = await db.select({ id: itemImporBundle.entityId, version: itemImporBundle.entityVersion }).from(itemImporBundle).where(inArray(itemImporBundle.entityId, inventory(original).map(item => item.entityId)));
  for (const item of historicalVersions) floors.set(item.id, Math.max(floors.get(item.id) ?? 0, item.version));
  const versionOverrides = Object.fromEntries(inventory(original).filter(item => ["idea", "relation", "article", "diktat", "flashcard", "flashcard_set", "solution_collection"].includes(item.entityType)).map(item => [item.entityId, Math.max(item.entityVersion, floors.get(item.entityId) ?? 0) + 1]));
  return persistDraft({ actorId: input.actorId, kind: input.kind, source: current, base: current, original, operations: [], restoreFrom: historical, versionOverrides });
}

function unitContext(product: ProductEntity) {
  const { version: _version, generationHash: _generationHash, ...value } = product;
  if (value.productType === "article") { const { sections: _sections, ...parent } = value; return digest(parent); }
  if (value.productType === "solution_collection") { const { items: _items, ...parent } = value.collection; return digest({ ...value, collection: parent }); }
  return digest(value);
}
async function reusableEvidence(row: Row, bundle: Bundle, actorId: string) {
  const lineage = lineageOf(row);
  const empty = { sourceImportId: null as string | null, sourceRevision: null as string | null, units: [] as string[], ideaItems: [] as IdeaReviewItem[], sectionDecisions: [] as Array<ProductV4SectionDecision & { productId: string }>, solutionItems: [] as Array<Parameters<typeof reviewSolutionCollection>[0]["items"][number]>, token: digest(null) };
  if (!lineage) return empty;
  let previousId = lineage.previousImportId, previousRevision = lineage.previousRevision;
  let source: Row | undefined;
  let reviews: Array<typeof reviewBundle.$inferSelect> = [], items: Array<typeof reviewItemBundle.$inferSelect> = [];
  const visited = new Set<string>();
  for (let depth = 0; depth < 100 && !visited.has(previousId); depth++) {
    visited.add(previousId);
    const [candidate] = await db.select().from(imporBundle).where(eq(imporBundle.id, previousId)).limit(1);
    if (!candidate || candidate.checksum !== previousRevision || kindOf(candidate) !== kindOf(row)) return empty;
    reviews = await db.select().from(reviewBundle).where(and(eq(reviewBundle.imporBundleId, candidate.id), eq(reviewBundle.reviewerId, actorId)));
    items = await db.select().from(reviewItemBundle).where(and(eq(reviewItemBundle.imporBundleId, candidate.id), eq(reviewItemBundle.reviewerId, actorId)));
    if (reviews.length || items.length) { source = candidate; break; }
    const earlier = lineageOf(candidate);
    if (!earlier || earlier.rootImportId !== lineage.rootImportId) return empty;
    previousId = earlier.previousImportId;
    previousRevision = earlier.previousRevision;
  }
  if (!source) return empty;
  const previous = await bundleFor(source);
  const result = { ...empty, sourceImportId: source.id, sourceRevision: source.checksum };
  if ("entities" in previous && "entities" in bundle) {
    const context = (value: ValidatedIdeaBundle) => digest({ courseId: value.manifest.courseId, sourceMaterials: value.entities.sourceMaterials, sourceChunks: value.entities.sourceChunks, provenance: value.entities.provenance, relations: value.entities.relations, learningSections: value.entities.learningSections });
    if (context(previous) === context(bundle)) {
      const hashes = new Map(ideaReviewTargets(previous).map(target => [target.ideaId, target.ideaHash]));
      const targets = ideaReviewTargets(bundle);
      for (const target of targets) {
        const saved = items.find(item => item.targetType === "idea" && item.targetId === target.ideaId && item.status !== "pending");
        if (saved && hashes.get(target.ideaId) === target.ideaHash) {
          result.ideaItems.push({ ...target, status: saved.status as IdeaReviewItem["status"], notes: saved.notes });
          result.units.push(revisionEntityKey("idea", target.ideaId));
        }
      }
    }
  }
  if ("products" in previous && "products" in bundle) {
    for (const product of bundle.products) {
      const before = previous.products.find(candidate => candidate.id === product.id && candidate.productType === product.productType);
      if (!before || unitContext(before) !== unitContext(product)) continue;
      const dependencyContext = (value: ProductBundle) => value.dependencies.filter(dependency => dependency.downstreamEntityId === product.id).map(({ downstreamHash: _hash, downstreamVersion: _version, ...dependency }) => dependency).sort((a,b)=>a.id.localeCompare(b.id));
      if (digest(dependencyContext(previous)) !== digest(dependencyContext(bundle))) continue;
      if (product.productType === "article" && before.productType === "article") {
        for (const section of product.sections) {
          if (!before.sections.some(candidate => candidate.id === section.id)) continue;
          const currentHash = computeProductV4SectionSemanticHash(product, section.id);
          if (computeProductV4SectionSemanticHash(before, section.id) !== currentHash) continue;
          const saved = items.find(item => item.productId === product.id && item.targetType === "article_section" && item.targetId === section.id && item.status !== "pending");
          if (!saved) continue;
          result.sectionDecisions.push({ productId: product.id, sectionId: section.id, semanticHash: currentHash, decision: saved.status as "approved" | "changes_requested", ...(saved.notes ? { notes: saved.notes } : {}) });
          result.units.push(JSON.stringify([product.id, "section", section.id]));
        }
      }
      if (product.productType === "solution_collection" && before.productType === "solution_collection") {
        const review = reviews[0];
        if (!review?.notes) continue;
        let parsed: { revision?: string; productId?: string; items?: Parameters<typeof reviewSolutionCollection>[0]["items"] };
        try { parsed = JSON.parse(review.notes); } catch { continue; }
        if (parsed.revision !== source.checksum || parsed.productId !== before.id || !Array.isArray(parsed.items)) continue;
        for (const item of product.collection.items) {
          const old = before.collection.items.find(candidate => candidate.id === item.id);
          const saved = parsed.items.find(candidate => candidate.itemId === item.id);
          if (!old || !saved || solutionItemHash(old) !== solutionItemHash(item) || saved.itemHash !== solutionItemHash(item)) continue;
          result.solutionItems.push(saved);
          result.units.push(JSON.stringify([product.id, "item", item.id]));
        }
      }
    }
  }
  result.token = digest({ actorId, source: identitySnapshot(source), current: row.checksum, reviews: [...reviews].sort((a,b)=>a.id.localeCompare(b.id)), items: [...items].sort((a,b)=>a.id.localeCompare(b.id)), units: [...result.units].sort() });
  return result;
}

export async function getRevisionContext(input: RevisionSelector) {
  await authorize(input.actorId);
  const row = await rowFor(input.importId, input.expectedRevision, input.kind);
  const bundle = await bundleFor(row);
  const scope = await scopeFor(bundle);
  const lineage = lineageOf(row);
  const draft = ["draft", "validated", "approved", "rejected"].includes(row.status);
  let reviewContext: unknown = null;
  if (draft && input.kind === "idea") reviewContext = await getIdeaRevisionReviewContext({ importId: row.id, reviewerId: input.actorId, expectedRevision: row.checksum });
  if (draft && input.kind === "product" && row.version === 5) reviewContext = await getSolutionCollectionReviewContext({ importId: row.id, reviewerId: input.actorId, expectedRevision: row.checksum });
  if (draft && input.kind === "product" && row.version !== 5) {
    const products = productBundle(bundle).products;
    reviewContext = { policyVersion: (await import("@/lib/materials/quality-policy")).QUALITY_POLICY_VERSION, contentFingerprint: productPedagogyFingerprint(products), sections: products.flatMap(product => product.productType === "article" ? product.sections.map(section => ({ productId: product.id, sectionId: section.id, semanticHash: computeProductV4SectionSemanticHash(product, section.id) })) : []), readiness: await currentPublisherProductReadiness(row.id, input.actorId) };
  }
  return { kind: input.kind, importId: row.id, revision: row.checksum, version: row.version, schemaVersion: bundle.manifest.schemaVersion, status: row.status, scope, stagingRunId: lineage?.stagingRunId ?? null, draftLineage: lineage, bundle: "products" in bundle ? { manifest: bundle.manifest, products: bundle.products, dependencies: bundle.dependencies } : { manifest: bundle.manifest, entities: bundle.entities }, reviewContext, reviewReuse: draft ? await reusableEvidence(row, bundle, input.actorId) : null, nextActions: draft ? ["authoring.patch_revision", ...(row.version === 4 ? ["authoring.prepare_revision_verification"] : []), "authoring.review_revision", "authoring.plan_release"] : ["authoring.create_revision", "authoring.list_revisions", "authoring.restore_revision"] };
}

export async function listRevisionHistory(input: RevisionSelector) {
  await authorize(input.actorId);
  const row = await rowFor(input.importId, input.expectedRevision, input.kind);
  const root = lineageOf(row)?.rootImportId ?? row.id;
  const rows = await db.select().from(imporBundle).where(and(eq(imporBundle.bundleType, input.kind), or(eq(imporBundle.id, root), sql`${imporBundle.validationReport}->'revisionLineage'->>'rootImportId' = ${root}`))).orderBy(desc(imporBundle.createdAt), desc(imporBundle.id)).limit(100);
  return { kind: input.kind, importId: row.id, revision: row.checksum, rootImportId: root, revisions: rows.map(item => ({ importId: item.id, revision: item.checksum, status: item.status, createdAt: item.createdAt.toISOString(), actorId: item.requestedBy, lineage: lineageOf(item) })), limit: 100, nextActions: ["authoring.get_edit_context", "authoring.restore_revision"] };
}

export async function reviewRevisionDraft(input: RevisionReviewInput) {
  await authorize(input.actorId);
  const row = await rowFor(input.importId, input.expectedRevision, input.kind);
  const bundle = await bundleFor(row);
  if (!["draft", "validated", "approved", "rejected"].includes(row.status)) throw new Error("REVISION_DRAFT_REQUIRED");
  const evidence = { ...input.evidence };
  const reuse = await reusableEvidence(row, bundle, input.actorId);
  const reuseRequested = evidence.reuseUnchanged === true;
  if (reuseRequested && evidence.reuseToken !== reuse.token) throw new Error("REVISION_REVIEW_REUSE_STALE");
  const explicitItems = Array.isArray(evidence.items) ? evidence.items as Array<Record<string, unknown>> : [];
  const recordReview = async () => {
  let result: unknown;
  if (input.kind === "idea") {
    const supplied = explicitItems as IdeaReviewItem[];
    const items = reuseRequested ? [...supplied, ...reuse.ideaItems.filter(item => !supplied.some(candidate => candidate.ideaId === item.ideaId))] : supplied;
    result = await reviewIdeaBundleRevision({ importId: row.id, reviewerId: input.actorId, expectedRevision: row.checksum, decision: evidence.decision as "approved" | "rejected", items, notes: typeof evidence.notes === "string" ? evidence.notes : undefined });
  } else if (row.version === 5) {
    const supplied = explicitItems as Parameters<typeof reviewSolutionCollection>[0]["items"];
    const items = reuseRequested ? [...supplied, ...reuse.solutionItems.filter(item => !supplied.some(candidate => candidate.itemId === item.itemId))] : supplied;
    result = await reviewSolutionCollection({ importId: row.id, reviewerId: input.actorId, expectedRevision: row.checksum, expectedReviewVersion: String(evidence.expectedReviewVersion ?? ""), decision: evidence.decision as "approved" | "rejected", items });
  } else if (productBundle(bundle).products.some(product => product.productType === "article")) {
    const articles = productBundle(bundle).products.filter(product => product.productType === "article");
    const supplied = normalizeProductSectionDecisions(articles, Array.isArray(evidence.sectionDecisions) ? evidence.sectionDecisions as ProductV4SectionDecision[] : []);
    const sectionDecisions = reuseRequested ? [...supplied, ...reuse.sectionDecisions.filter(item => !supplied.some(candidate => productSectionReviewKey(candidate.productId, candidate.sectionId) === productSectionReviewKey(item.productId, item.sectionId)))] : supplied;
    result = await executePedagogicReview({ ...evidence, sectionDecisions, importId: row.id, reviewerId: input.actorId, expectedRevision: row.checksum, strictRevision: true } as ExecutePedagogicReviewInput);
  } else {
    result = await reviewProductBundle({ importId: row.id, reviewerId: input.actorId, expectedRevision: row.checksum, decision: evidence.decision as "approved" | "rejected", notes: typeof evidence.notes === "string" ? evidence.notes : undefined });
  }
    return result;
  };
  const result = reuseRequested ? await withRevisionReviewGuard(async tx => {
    if (!reuse.sourceImportId || !reuse.sourceRevision) throw new Error("REVISION_REVIEW_REUSE_STALE");
    for (const id of [...new Set([row.id,reuse.sourceImportId])].sort()) await tx.select({id:imporBundle.id}).from(imporBundle).where(eq(imporBundle.id,id)).limit(1).for("update");
    const source = await rowFor(reuse.sourceImportId,reuse.sourceRevision,input.kind,tx);
    const reviews = await tx.select().from(reviewBundle).where(and(eq(reviewBundle.imporBundleId,source.id),eq(reviewBundle.reviewerId,input.actorId))).for("share");
    const items = await tx.select().from(reviewItemBundle).where(and(eq(reviewItemBundle.imporBundleId,source.id),eq(reviewItemBundle.reviewerId,input.actorId))).for("share");
    const currentToken = digest({actorId:input.actorId,source:identitySnapshot(source),current:row.checksum,reviews:[...reviews].sort((a,b)=>a.id.localeCompare(b.id)),items:[...items].sort((a,b)=>a.id.localeCompare(b.id)),units:[...reuse.units].sort()});
    if (currentToken !== reuse.token) throw new Error("REVISION_REVIEW_REUSE_STALE");
  },recordReview) : await recordReview();
  await db.transaction(async tx => {
    await authorize(input.actorId, tx, true);
    const current = await rowFor(row.id, row.checksum, input.kind, tx, true);
    await audit(tx, input.actorId, current, "revision_review_recorded", { revision: row.checksum, explicitDecision: evidence.decision, reusedUnits: reuseRequested ? reuse.units : [], sourceImportId: reuseRequested ? reuse.sourceImportId : null, reuseToken: reuseRequested ? reuse.token : null });
  });
  return { kind: input.kind, importId: row.id, revision: row.checksum, result, reusedUnits: reuseRequested ? reuse.units : [], nextActions: ["authoring.plan_release"] };
}

type LoadedReleaseEntry = { row: Row; bundle: Bundle; base: Row; baseBundle: Bundle; scope: Awaited<ReturnType<typeof scopeFor>>; lineage: Lineage; verification: Awaited<ReturnType<typeof getProductV4VerificationReadiness>> | null; reviewFingerprint?: string; canonicalIdeaFingerprint?: string; canonicalIdeaIds?: string[]; retiredReplacements?: string[]; canonicalAuxiliaryFingerprint?: string };
type ReleaseBlocker = { code: string; importId?: string; entityId?: string; action: string };
async function auxiliarySnapshot(entry: LoadedReleaseEntry, connection: typeof db | Tx = db, lock = false) {
  const bundles = [ideaBundle(entry.baseBundle),ideaBundle(entry.bundle)];
  const relationIds = [...new Set(bundles.flatMap(bundle=>bundle.entities.relations.map(value=>value.id)))];
  const sectionIds = [...new Set(bundles.flatMap(bundle=>bundle.entities.learningSections.map(value=>value.id)))];
  const relationQuery = connection.select().from(relasiIde).where(inArray(relasiIde.id,relationIds)).orderBy(relasiIde.id);
  const sectionQuery = connection.select().from(bagianPembelajaran).where(inArray(bagianPembelajaran.id,sectionIds)).orderBy(bagianPembelajaran.id);
  const membershipQuery = connection.select().from(bagianPembelajaranIde).where(inArray(bagianPembelajaranIde.bagianPembelajaranId,sectionIds)).orderBy(bagianPembelajaranIde.id);
  const relations = relationIds.length ? await (lock ? relationQuery.for("share") : relationQuery) : [];
  const sections = sectionIds.length ? await (lock ? sectionQuery.for("share") : sectionQuery) : [];
  const memberships = sectionIds.length ? await (lock ? membershipQuery.for("share") : membershipQuery) : [];
  return {relations,sections,memberships};
}
async function attestRetiredAuxiliary(entry: LoadedReleaseEntry, blockers: ReleaseBlocker[]) {
  const snapshot = await auxiliarySnapshot(entry);
  entry.canonicalAuxiliaryFingerprint = digest(snapshot);
  const before = ideaBundle(entry.baseBundle), incoming = ideaBundle(entry.bundle);
  const added = [
    ...incoming.entities.relations.filter(value=>!before.entities.relations.some(old=>old.id===value.id)).map(value=>({type:"relation",id:value.id,version:value.version})),
    ...incoming.entities.learningSections.filter(value=>!before.entities.learningSections.some(old=>old.id===value.id)).map(value=>({type:"learning_section",id:value.id,version:1})),
  ];
  for (const value of added) {
    const canonical = value.type === "relation" ? snapshot.relations.find(row=>row.id===value.id) : snapshot.sections.find(row=>row.id===value.id);
    if (!canonical) continue;
    let attested = false;
    if (entry.lineage.restoredFrom && canonical.status === "withdrawn" && (value.type !== "relation" || value.version > canonical.version)) {
      const owners = await db.select({ row:imporBundle }).from(itemImporBundle).innerJoin(imporBundle,eq(imporBundle.id,itemImporBundle.imporBundleId)).where(and(eq(itemImporBundle.entityType,value.type),eq(itemImporBundle.entityId,value.id),eq(itemImporBundle.entityVersion,canonical.version),eq(imporBundle.bundleType,"idea"),or(eq(imporBundle.id,entry.lineage.rootImportId),sql`${imporBundle.validationReport}->'revisionLineage'->>'rootImportId' = ${entry.lineage.rootImportId}`))).limit(100);
      for (const owner of owners) {
        const historical = ideaBundle(await bundleFor(owner.row));
        if (value.type === "relation") {
          const row = snapshot.relations.find(row=>row.id===value.id)!;
          const proof = historical.entities.relations.find(item=>item.id===row.id && item.version===row.version);
          if (proof && digest({sourceIdeaId:proof.sourceIdeaId,targetIdeaId:proof.targetIdeaId,relationType:proof.relationType,explanation:proof.explanation??null})===digest({sourceIdeaId:row.sourceIdeaId,targetIdeaId:row.targetIdeaId,relationType:row.relationType,explanation:row.explanation})) attested=true;
        } else {
          const row = snapshot.sections.find(row=>row.id===value.id)!;
          const proof = historical.entities.learningSections.find(item=>item.id===row.id);
          const membership = snapshot.memberships.filter(item=>item.bagianPembelajaranId===row.id).map(item=>[item.ideId,item.role]).sort();
          if (proof && row.mataKuliahId===entry.scope.courseId && row.babId===entry.scope.chapterId && digest({stableKey:proof.stableKey,parent:proof.parentSectionId??null,title:proof.title,slug:proof.slug,objective:proof.learningObjective,sources:proof.sourceChunkIds,membership:[...proof.primaryIdeaIds.map(id=>[id,"primary"]),...proof.supportingIdeaIds.map(id=>[id,"supporting"])].sort()})===digest({stableKey:row.stableKey,parent:row.parentSectionId,title:row.title,slug:row.slug,objective:row.learningObjective,sources:row.sourceChunkIds,membership})) attested=true;
        }
        if (attested) break;
      }
    }
    if (attested) entry.retiredReplacements!.push(revisionEntityKey(value.type,value.id));
    else blockers.push({code:"REVISION_RESTORE_CANONICAL_CONFLICT",importId:entry.row.id,entityId:value.id,action:"Restore only retired canonical identities attested by this lineage's immutable history."});
  }
}

async function liveIdeaDependents(ideaIds: string[], connection: typeof db | Tx = db) {
  if (!ideaIds.length) return [] as Array<{ importId: string; entityId: string; reason: string }>;
  const edges = await connection.select().from(ketergantunganProduk).where(and(eq(ketergantunganProduk.upstreamEntityType, "idea"), inArray(ketergantunganProduk.upstreamEntityId, ideaIds)));
  const articles = await connection.select({ id: artikelIde.artikelId }).from(artikelIde).where(inArray(artikelIde.ideId, ideaIds));
  const diktats = await connection.select({ id: diktatIde.diktatMateriId }).from(diktatIde).where(inArray(diktatIde.ideId, ideaIds));
  const cards = await connection.select({ id: flashcardIde.flashcardId }).from(flashcardIde).where(inArray(flashcardIde.ideId, ideaIds));
  const collections = await connection.select({ id: solutionCollections.id }).from(solutionCollections).where(and(eq(solutionCollections.status, "published"), sql`exists (select 1 from jsonb_array_elements(${solutionCollections.trace}->'ideaLinks') link where link->>'id' in (${sql.join(ideaIds.map(id => sql`${id}`), sql`, `)}))`));
  const versioned = sql<string>`case when ${itemImporBundle.entityVersion} = 1 then ${itemImporBundle.entityId} else ${itemImporBundle.entityId} || ':v' || ${itemImporBundle.entityVersion}::text end`;
  const conditions = edges.map(edge=>and(eq(itemImporBundle.entityType,edge.downstreamEntityType),eq(itemImporBundle.entityId,edge.downstreamEntityId),eq(itemImporBundle.entityVersion,edge.downstreamVersion)));
  for (const [type, linked] of [["article",articles],["diktat",diktats],["flashcard",cards],["solution_collection",collections]] as const) if (linked.length) conditions.push(and(eq(itemImporBundle.entityType,type),inArray(versioned,linked.map(value=>value.id))));
  if (!conditions.length) return [];
  const owners = await connection.select({ importId: imporBundle.id, entityId: itemImporBundle.entityId }).from(itemImporBundle).innerJoin(imporBundle, eq(imporBundle.id, itemImporBundle.imporBundleId)).where(and(eq(imporBundle.bundleType, "product"), eq(imporBundle.status, "published"), or(...conditions)));
  return owners.map(owner => ({ ...owner, reason: "IDEA_REVISION_CHANGED" })).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
async function prepareRelease(input: RevisionReleaseInput) {
  await authorize(input.actorId);
  if (!input.entries.length || input.entries.length > 16 || new Set(input.entries.map(entry => entry.importId)).size !== input.entries.length) throw new Error("REVISION_RELEASE_ENTRY_LIMIT");
  const entries: LoadedReleaseEntry[] = [];
  for (const entry of [...input.entries].sort((a, b) => a.importId.localeCompare(b.importId))) {
    const row = await rowFor(entry.importId, entry.expectedRevision);
    const lineage = lineageOf(row);
    if (!lineage || !["draft", "validated", "approved", "rejected"].includes(row.status)) throw new Error("REVISION_DRAFT_REQUIRED");
    const bundle = await bundleFor(row), scope = await scopeFor(bundle);
    const base = await rowFor(lineage.baseImportId, lineage.baseRevision, kindOf(row));
    const baseBundle = await bundleFor(base);
    let verification: LoadedReleaseEntry["verification"] = null;
    if (row.version === 4) {
      const ref = row.validationReport.productV4Verification as { runId?: string } | undefined;
      if (ref?.runId) verification = await getProductV4VerificationReadiness(row.id, ref.runId).catch(() => null);
    }
    entries.push({ row, bundle, base, baseBundle, scope, lineage, verification });
  }
  if (new Set(entries.map(entry => entry.scope.courseId)).size !== 1) throw new Error("REVISION_RELEASE_COURSE_MISMATCH");
  if (new Set(entries.map(entry => entry.lineage.rootImportId)).size !== entries.length) throw new Error("REVISION_RELEASE_DUPLICATE_LINEAGE");
  const blockers: ReleaseBlocker[] = [], deferredChecks: ReleaseBlocker[] = [];
  const superseded = new Set(entries.filter(entry => entry.base.status === "published").map(entry => entry.base.id));
  const selectedKeys = new Map<string, string>();
  const changes: Array<{ importId: string; kind: RevisionKind; changed: ReturnType<typeof inventory>; removed: ReturnType<typeof inventory>; unchanged: string[]; reviewReuse: Awaited<ReturnType<typeof reusableEvidence>> }> = [];
  const reviewsForHash: unknown[] = [];
  const canonicalForHash: unknown[] = [];
  for (const entry of entries) {
    const { row, base, bundle, baseBundle, lineage } = entry;
    const live = await latestLive(lineage.rootImportId);
    if (base.status === "published" ? live.length !== 1 || live[0].id !== base.id || live[0].checksum !== base.checksum : live.length > 0) blockers.push({ code: "REVISION_LIVE_HEAD_CHANGED", importId: row.id, action: "Refresh the live revision and create or restore a draft against that exact head." });
    const before = new Map(inventory(baseBundle).map(item => [revisionEntityKey(item.entityType, item.entityId), item]));
    const current = inventory(bundle);
    const changed = current.filter(item => before.get(revisionEntityKey(item.entityType, item.entityId))?.entityHash !== item.entityHash);
    const currentKeys = new Set(current.map(item => revisionEntityKey(item.entityType, item.entityId)));
    const removed = [...before].filter(([key]) => !currentKeys.has(key)).map(([, item]) => item);
    if (!changed.length && !removed.length) blockers.push({ code: "REVISION_NO_CONTENT_CHANGE", importId: row.id, action: "Patch the intended entity before releasing; an unchanged fork does not replace live content." });
    for (const item of current) {
      const key = revisionEntityKey(item.entityType, item.entityId);
      if (selectedKeys.has(key) && selectedKeys.get(key) !== item.entityHash) blockers.push({ code: "REVISION_RELEASE_CONFLICTING_ENTITY", importId: row.id, entityId: item.entityId, action: "Provide the same exact entity revision in each shared owner, or remove the conflicting release entry." });
      selectedKeys.set(key, item.entityHash);
    }
    for (const item of changed) {
      const old = before.get(revisionEntityKey(item.entityType, item.entityId));
      if (old && ["idea", "relation", "article", "diktat", "flashcard", "flashcard_set", "solution_collection"].includes(item.entityType) && item.entityVersion <= old.entityVersion) blockers.push({ code: "REVISION_ENTITY_VERSION_REQUIRED", importId: row.id, entityId: item.entityId, action: "Rebuild this changed entity with a version newer than the live entity." });
      if (row.bundleType === "idea" && old) {
        const owners = await db.select({ id: imporBundle.id }).from(itemImporBundle).innerJoin(imporBundle, eq(imporBundle.id, itemImporBundle.imporBundleId)).where(and(eq(imporBundle.status, "published"), eq(itemImporBundle.entityType, item.entityType), eq(itemImporBundle.entityId, item.entityId)));
        for (const owner of owners) if (!superseded.has(owner.id)) blockers.push({ code: "REVISION_SHARED_IDEA_OWNER", importId: row.id, entityId: item.entityId, action: `Include an exact successor for published owner ${owner.id}, or keep the shared entity unchanged.` });
      }
    }
    if (row.bundleType === "idea") for (const item of removed) {
      const owners = await db.select({ id: imporBundle.id }).from(itemImporBundle).innerJoin(imporBundle, eq(imporBundle.id, itemImporBundle.imporBundleId)).where(and(eq(imporBundle.status, "published"), eq(itemImporBundle.entityType, item.entityType), eq(itemImporBundle.entityId, item.entityId)));
      for (const owner of owners) if (!superseded.has(owner.id)) blockers.push({ code: "REVISION_SHARED_IDEA_OWNER", importId: row.id, entityId: item.entityId, action: `Include an exact successor for published owner ${owner.id}, or retain this shared entity.` });
    }
    const reviews = await db.select().from(reviewBundle).where(and(eq(reviewBundle.imporBundleId, row.id), eq(reviewBundle.reviewerId, input.actorId)));
    const itemReviews = await db.select().from(reviewItemBundle).where(and(eq(reviewItemBundle.imporBundleId, row.id), eq(reviewItemBundle.reviewerId, input.actorId)));
    entry.reviewFingerprint = digest({ reviews: [...reviews].sort((a,b)=>a.id.localeCompare(b.id)), itemReviews: [...itemReviews].sort((a,b)=>a.id.localeCompare(b.id)) });
    reviewsForHash.push({ importId: row.id, fingerprint: entry.reviewFingerprint });
    if (row.bundleType === "idea") {
      const own = reviews.find(review => review.status === "approved");
      const targets = ideaReviewTargets(ideaBundle(bundle));
      if (!own || !targets.every(target => itemReviews.some(item => item.targetId === target.ideaId && item.targetType === "idea" && item.status === "approved"))) blockers.push({ code: "REVISION_EXPLICIT_REVIEW_REQUIRED", importId: row.id, action: "Review the exact current Idea revision, explicitly approving all changed or reusable item decisions." });
      const approvals = await db.select({ after: auditMutasi.afterSnapshot }).from(auditMutasi).where(and(eq(auditMutasi.entityId, row.id), eq(auditMutasi.actorId, input.actorId), eq(auditMutasi.action, "revision_reviewed")));
      if (!approvals.some(approval => approval.after?.revision === row.checksum && approval.after?.decision === "approved")) blockers.push({ code: "REVISION_BOUND_APPROVAL_REQUIRED", importId: row.id, action: "Record the publishing actor's exact-revision approval." });
      const ideas = ideaBundle(baseBundle).entities.ideas;
      entry.canonicalIdeaIds = [...new Set([...ideas, ...ideaBundle(bundle).entities.ideas].map(value => value.id))];
      const canonical = entry.canonicalIdeaIds.length ? await db.select().from(ide).where(inArray(ide.id, entry.canonicalIdeaIds)) : [];
      entry.canonicalIdeaFingerprint = digest([...canonical].sort((a,b)=>a.id.localeCompare(b.id)));
      canonicalForHash.push(entry.canonicalIdeaFingerprint);
      if (base.status === "published") for (const old of ideas) {
        const current = canonical.find(idea => idea.id === old.id);
        if (!current || current.version !== old.version || current.generationHash !== old.generationHash || current.status !== "published") blockers.push({ code: "REVISION_CANONICAL_HEAD_CHANGED", importId: row.id, entityId: old.id, action: "Read the current canonical Idea and rebase explicitly before release." });
      }
      entry.retiredReplacements = [];
      for (const incoming of ideaBundle(bundle).entities.ideas.filter(value => !ideas.some(old=>old.id === value.id))) {
        const current = canonical.find(value=>value.id === incoming.id);
        if (!current) continue;
        let attested = false;
        if (lineage.restoredFrom && current.status === "withdrawn" && current.mataKuliahId === entry.scope.courseId && incoming.version > current.version) {
          const historicalOwners = await db.select({ row: imporBundle }).from(itemImporBundle).innerJoin(imporBundle, eq(imporBundle.id, itemImporBundle.imporBundleId)).where(and(eq(itemImporBundle.entityType,"idea"),eq(itemImporBundle.entityId,current.id),eq(itemImporBundle.entityVersion,current.version),eq(imporBundle.bundleType,"idea"),or(eq(imporBundle.id,lineage.rootImportId),sql`${imporBundle.validationReport}->'revisionLineage'->>'rootImportId' = ${lineage.rootImportId}`))).limit(100);
          for (const owner of historicalOwners) {
            const historical = ideaBundle(await bundleFor(owner.row)).entities.ideas.find(value=>value.id === current.id && value.version === current.version);
            if (historical?.generationHash === current.generationHash && historical.semanticHash === current.semanticHash) { attested = true; break; }
          }
        }
        if (attested) entry.retiredReplacements.push(revisionEntityKey("idea",incoming.id));
        else blockers.push({ code:"REVISION_RESTORE_CANONICAL_CONFLICT",importId:row.id,entityId:incoming.id,action:"Restore only a retired canonical identity attested by this lineage's immutable history, with a fresh higher version." });
      }
      await attestRetiredAuxiliary(entry,blockers);
      canonicalForHash.push(entry.canonicalAuxiliaryFingerprint);
    } else {
      const readiness = await currentPublisherProductReadiness(row.id, input.actorId, { v4Verification: entry.verification });
      for (const code of new Set(readiness.blockingIssueCodes)) {
        const incomingIdeas = entries.filter(candidate => candidate.row.bundleType === "idea").map(candidate => ideaBundle(candidate.bundle));
        if (incomingIdeas.length && ["PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW", "PRODUCT_TRACEABILITY_INVALID", "PRODUCT_V5_LIVE_DEPENDENCY_MISMATCH"].includes(code)) {
          try {
            await assertProspectiveReleaseDependencies({ productBundle: productBundle(bundle), ideaDrafts: incomingIdeas, scope: entry.scope });
            deferredChecks.push({ code, importId: row.id, action: "The exact release candidate graph is validated; recheck it under release locks before promotion." });
          } catch {
            blockers.push({ code, importId: row.id, action: "Update every Idea, source, excerpt and dependency reference to match the exact incoming release graph, then request a fresh plan." });
          }
        } else blockers.push({ code, importId: row.id, action: "Resolve the current profile-specific readiness blocker, then request a fresh release plan." });
      }
    }
    const reuse = await reusableEvidence(row, bundle, input.actorId);
    changes.push({ importId: row.id, kind: kindOf(row), changed, removed, unchanged: current.filter(item => before.get(revisionEntityKey(item.entityType, item.entityId))?.entityHash === item.entityHash).map(item => item.entityId), reviewReuse: reuse });
  }
  // Current published Products depending on a changed Idea must be replaced in this release.
  const changedIdeaIds = changes.filter(change => change.kind === "idea").flatMap(change => [...change.changed, ...change.removed].filter(item => item.entityType === "idea").map(item => item.entityId));
  const dependentProducts = await liveIdeaDependents(changedIdeaIds);
  for (const owner of dependentProducts) if (!superseded.has(owner.importId)) blockers.push({ code: "REVISION_LIVE_DEPENDENT_REQUIRES_UPDATE", importId: owner.importId, entityId: owner.entityId, action: "Create a Product revision, explicitly update its Idea references, review it, and include it in this release." });
  const manifest = { schemaVersion: "authoring-release.v1", scopes: entries.map(entry => entry.scope), entries: entries.map(entry => ({ importId: entry.row.id, revision: entry.row.checksum, kind: kindOf(entry.row), schemaVersion: entry.bundle.manifest.schemaVersion, rootImportId: entry.lineage.rootImportId, replaces: entry.base.status === "published" ? { importId: entry.base.id, revision: entry.base.checksum } : null })), changes, dependentProducts, blockers, deferredChecks };
  const planHash = digest({ manifest, snapshots: entries.map(entry => ({ incoming: identitySnapshot(entry.row), base: identitySnapshot(entry.base) })), reviewsForHash, canonicalForHash });
  return { entries, manifest, planHash };
}

export async function planRevisionRelease(input: RevisionReleaseInput) {
  const prepared = await prepareRelease(input);
  return { ...prepared.manifest, planHash: prepared.planHash, publicationReady: prepared.manifest.blockers.length === 0, atomic: true, nextActions: prepared.manifest.blockers.length ? ["authoring.get_edit_context", "authoring.review_revision", "authoring.plan_release"] : ["authoring.publish_release"] };
}

export async function publishRevisionRelease(input: RevisionReleaseInput & { expectedPlanHash: string }) {
  await authorize(input.actorId);
  if (!/^[a-f0-9]{64}$/.test(input.expectedPlanHash)) throw new Error("REVISION_RELEASE_PLAN_REQUIRED");
  const [committed] = await db.select().from(auditMutasi).where(and(eq(auditMutasi.entityType, "authoring_release"), eq(auditMutasi.entityId, input.expectedPlanHash), eq(auditMutasi.actorId, input.actorId), eq(auditMutasi.action, "release_published"))).limit(1);
  const requested = [...input.entries].sort((a, b) => a.importId.localeCompare(b.importId));
  if (committed) {
    if (digest(committed.afterSnapshot?.entries) !== digest(requested)) throw new Error("REVISION_RELEASE_PLAN_MISMATCH");
    return { releaseId: input.expectedPlanHash, published: false, entries: requested, nextActions: ["authoring.list_revisions"] };
  }
  const prepared = await prepareRelease(input);
  if (prepared.planHash !== input.expectedPlanHash) throw new Error("REVISION_RELEASE_PLAN_STALE");
  if (prepared.manifest.blockers.length) throw new Error(`REVISION_RELEASE_BLOCKED:${prepared.manifest.blockers.map(blocker => blocker.code).join(",")}`);
  const dispatchCourses = new Set<string>();
  const verifications = new Map(prepared.entries.filter(entry => entry.verification).map(entry => [entry.row.id, entry.verification]));
  const replacements = new Set(prepared.entries.filter(entry => entry.row.bundleType === "idea" && entry.base.status === "published").flatMap(entry => {
    const before = new Map(inventory(entry.baseBundle).map(item => [revisionEntityKey(item.entityType, item.entityId), item.entityHash]));
    return [...inventory(entry.bundle).filter(item => before.has(revisionEntityKey(item.entityType, item.entityId)) && before.get(revisionEntityKey(item.entityType, item.entityId)) !== item.entityHash).map(item => revisionEntityKey(item.entityType, item.entityId)), ...(entry.retiredReplacements??[])];
  }));
  const unchangedProducts = new Set(prepared.entries.filter(entry => entry.row.bundleType === "product" && entry.base.status === "published").flatMap(entry => {
    const before = new Map(inventory(entry.baseBundle).map(item => [revisionEntityKey(item.entityType, item.entityId), item.entityHash]));
    return inventory(entry.bundle).filter(item => before.get(revisionEntityKey(item.entityType, item.entityId)) === item.entityHash).map(item => JSON.stringify([item.entityType, item.entityId, item.entityVersion]));
  }));
  const results = await db.transaction(async tx => {
    await authorize(input.actorId, tx, true);
    const importIds = [...new Set(prepared.entries.flatMap(entry => [entry.row.id, entry.base.id]))].sort();
    for (const importId of importIds) await tx.select({ id: imporBundle.id }).from(imporBundle).where(eq(imporBundle.id, importId)).limit(1).for("update");
    const locks: CanonicalLock[] = [];
    for (const entry of prepared.entries) for (const bundle of [entry.bundle, entry.baseBundle]) {
      if ("products" in bundle) locks.push(...await productPublicationLockIdentities(tx, bundle.products, bundle.dependencies));
      else {
        for (const item of inventory(bundle)) locks.push({ domain: "idea", entityType: item.entityType, entityId: item.entityId });
        for (const section of bundle.entities.learningSections) locks.push({domain:"idea",entityType:"learning_section_layout",entityId:section.chapterId});
      }
    }
    await lockCanonicalIdentities(tx, locks);
    const superseded = new Set(prepared.entries.filter(entry => entry.base.status === "published").map(entry => entry.base.id));
    const changedIdeaIds = prepared.manifest.changes.filter(change => change.kind === "idea").flatMap(change => [...change.changed, ...change.removed].filter(item => item.entityType === "idea").map(item=>item.entityId));
    for (const owner of await liveIdeaDependents(changedIdeaIds, tx)) if (!superseded.has(owner.importId)) throw new Error("REVISION_LIVE_DEPENDENT_REQUIRES_UPDATE");
    for (const change of prepared.manifest.changes.filter(change=>change.kind === "idea")) for (const item of [...change.changed, ...change.removed]) {
      const owners = await tx.select({ id: imporBundle.id }).from(itemImporBundle).innerJoin(imporBundle, eq(imporBundle.id, itemImporBundle.imporBundleId)).where(and(eq(imporBundle.status, "published"), eq(itemImporBundle.entityType, item.entityType), eq(itemImporBundle.entityId, item.entityId)));
      if (owners.some(owner => !superseded.has(owner.id))) throw new Error("REVISION_SHARED_IDEA_OWNER");
    }
    for (const entry of [...prepared.entries].sort((a, b) => a.row.id.localeCompare(b.row.id))) {
      const row = await rowFor(entry.row.id, entry.row.checksum, kindOf(entry.row), tx, true);
      const base = await rowFor(entry.base.id, entry.base.checksum, kindOf(entry.base), tx, true);
      if (identitySnapshot(row) !== identitySnapshot(entry.row) || identitySnapshot(base) !== identitySnapshot(entry.base)) throw new Error("REVISION_RELEASE_PLAN_STALE");
      const live = await latestLive(entry.lineage.rootImportId, tx);
      if (base.status === "published" ? live.length !== 1 || live[0].id !== base.id : live.length > 0) throw new Error("REVISION_LIVE_HEAD_CHANGED");
      const currentReviews = await tx.select().from(reviewBundle).where(and(eq(reviewBundle.imporBundleId, row.id), eq(reviewBundle.reviewerId, input.actorId))).for("share");
      const currentItemReviews = await tx.select().from(reviewItemBundle).where(and(eq(reviewItemBundle.imporBundleId, row.id), eq(reviewItemBundle.reviewerId, input.actorId))).for("share");
      if (digest({ reviews: [...currentReviews].sort((a,b)=>a.id.localeCompare(b.id)), itemReviews: [...currentItemReviews].sort((a,b)=>a.id.localeCompare(b.id)) }) !== entry.reviewFingerprint) throw new Error("REVISION_RELEASE_PLAN_STALE");
      if (entry.canonicalIdeaFingerprint) {
        const ids = entry.canonicalIdeaIds ?? ideaBundle(entry.baseBundle).entities.ideas.map(item => item.id);
        const current = ids.length ? await tx.select().from(ide).where(inArray(ide.id, ids)).for("share") : [];
        if (digest([...current].sort((a,b)=>a.id.localeCompare(b.id))) !== entry.canonicalIdeaFingerprint) throw new Error("REVISION_CANONICAL_HEAD_CHANGED");
      }
      if (entry.canonicalAuxiliaryFingerprint && digest(await auxiliarySnapshot(entry,tx,true)) !== entry.canonicalAuxiliaryFingerprint) throw new Error("REVISION_CANONICAL_HEAD_CHANGED");
      if (!currentReviews.some(review => review.status === "approved")) throw new Error("REVISION_EXPLICIT_REVIEW_REQUIRED");
    }
    const ideaDrafts = prepared.entries.filter(entry => entry.row.bundleType === "idea").map(entry => ideaBundle(entry.bundle));
    for (const entry of prepared.entries.filter(entry => entry.row.bundleType === "product")) {
      await assertProspectiveReleaseDependencies({ productBundle: productBundle(entry.bundle), ideaDrafts, scope: entry.scope, connection: tx });
    }
    await assertRevisionVerificationReleaseContext({ entries: prepared.entries.map(({ row, bundle }) => ({ row, bundle })), connection: tx });
    return withRevisionPublication({ tx, replacements, unchangedProducts, verifications, dispatchCourses }, async () => {
      // Provenance has no retired status and its semantic span is unique. Remove
      // only superseded, unshared rows before inserting replacement spans. The
      // immutable predecessor archive and its inventory retain the old evidence.
      const incomingProvenanceIds = new Set(prepared.entries.filter(entry => entry.row.bundleType === "idea").flatMap(entry => ideaBundle(entry.bundle).entities.provenance.map(value => value.id)));
      const removedProvenanceIds = [...new Set(prepared.entries.filter(entry => entry.row.bundleType === "idea" && entry.base.status === "published").flatMap(entry => ideaBundle(entry.baseBundle).entities.provenance.filter(value => !incomingProvenanceIds.has(value.id)).map(value => value.id)))];
      if (removedProvenanceIds.length) await tx.delete(asalIde).where(inArray(asalIde.id, removedProvenanceIds));
      const movingSectionIds = [...new Set(prepared.manifest.changes.filter(change=>change.kind==="idea").flatMap(change=>[...change.changed,...change.removed].filter(value=>value.entityType==="learning_section").map(value=>value.entityId)))];
      if (movingSectionIds.length) {
        const moving = await tx.select().from(bagianPembelajaran).where(inArray(bagianPembelajaran.id,movingSectionIds)).orderBy(bagianPembelajaran.id).for("update");
        for (const chapterId of [...new Set(moving.map(value=>value.babId))].sort()) {
          const layout = await tx.select({order:bagianPembelajaran.orderIndex}).from(bagianPembelajaran).where(eq(bagianPembelajaran.babId,chapterId));
          let next = Math.max(0,...layout.map(value=>value.order))+1;
          for (const section of moving.filter(value=>value.babId===chapterId)) await tx.update(bagianPembelajaran).set({orderIndex:next++}).where(eq(bagianPembelajaran.id,section.id));
        }
      }

      const published: unknown[] = [];
      for (const entry of [...prepared.entries].sort((a, b) => (a.row.bundleType === "idea" ? 0 : 1) - (b.row.bundleType === "idea" ? 0 : 1))) {
        if (entry.row.version === 5 && entry.base.status === "published") {
          await tx.update(solutionCollections).set({ status: "withdrawn", updatedAt: new Date() }).where(and(eq(solutionCollections.importId, entry.base.id), eq(solutionCollections.status, "published")));
        }
        published.push(entry.row.bundleType === "idea" ? await publishIdeaBundle({ importId: entry.row.id, expectedRevision: entry.row.checksum, publishedBy: input.actorId }) : await publishProductBundle({ importId: entry.row.id, expectedRevision: entry.row.checksum, publishedBy: input.actorId }));
      }
      for (const entry of [...prepared.entries].sort((a, b) => (a.base.bundleType === "product" ? 0 : 1) - (b.base.bundleType === "product" ? 0 : 1))) if (entry.base.status === "published") {
        if (entry.base.bundleType === "idea") await withdrawIdeaBundle({ importId: entry.base.id, expectedRevision: entry.base.checksum, withdrawnBy: input.actorId });
        else await withdrawProductBundle({ importId: entry.base.id, expectedRevision: entry.base.checksum, withdrawnBy: input.actorId });
      }
      // Logical Idea and chunk rows advance in place. Their previous version's
      // vector identity must be retired even though the new import owns the ID.
      for (const entry of prepared.entries.filter(entry => entry.row.bundleType === "idea" && entry.base.status === "published")) {
        const before = ideaBundle(entry.baseBundle), next = ideaBundle(entry.bundle);
        const retired = [
          ...before.entities.ideas.filter(old => next.entities.ideas.some(value => value.id === old.id && value.version !== old.version)).map(old => ({ namespace: "canonical_ideas", entityType: "idea", entityId: old.id, version: old.version })),
          ...before.entities.sourceChunks.filter(old => old.embeddingEligible && next.entities.sourceChunks.some(value => value.id === old.id && value.sourceVersion !== old.sourceVersion)).map(old => ({ namespace: "source_materials", entityType: "source_material", entityId: old.id, version: old.sourceVersion })),
        ];
        for (const identity of retired) await tx.insert(vectorSyncQueue).values({ id: `revision-retire-${digest([input.expectedPlanHash, identity])}`, courseId: entry.scope.legacyCourseId, koId: null, action: "delete", namespace: identity.namespace, payload: { entityType: identity.entityType, entityId: identity.entityId, version: identity.version } }).onConflictDoNothing();
      }
      await tx.insert(auditMutasi).values({ id: `audit-release-${input.expectedPlanHash}`, actorId: input.actorId, entityType: "authoring_release", entityId: input.expectedPlanHash, action: "release_published", afterSnapshot: { entries: requested, manifest: prepared.manifest, published, verificationContexts: prepared.entries.map(entry => ({ importId: entry.row.id, context: entry.row.validationReport.revisionVerificationContext ?? null })) }, correlationId: input.expectedPlanHash, courseId: prepared.entries[0].scope.legacyCourseId });
      return published;
    });
  });
  for (const courseId of dispatchCourses) await dispatchVectorSync(courseId);
  return { releaseId: input.expectedPlanHash, published: true, entries: requested, results, nextActions: ["authoring.list_revisions"] };
}
