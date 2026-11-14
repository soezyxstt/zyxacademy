import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { artikel, auditMutasi, bab, blueprintAsesmen, buktiPdfBundle, diktatMateri, flashcard, ide, imporBundle, mataKuliah, pembahasanSoal, potonganSumber, setFlashcard, soal, solutionCollections, sumberMateri } from "@/db/schema";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { storage } from "@/lib/storage";
import { parseIdeaBundle, serializeDeterministically, type ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { parseAdmittedProductBundle } from "@/lib/bundle/product-staged-worker";
import { readSecureZip } from "@/lib/bundle/zip-reader";
import { productVersionId } from "@/lib/bundle/product-identity";
import { lockCanonicalIdentities, type CanonicalLock } from "@/lib/vectorize/canonical-locks";
import type { ProductV4LiveDependency } from "@/lib/compute/product-v4-runtime-binding";
import type { ProductBundleValidation } from "@/lib/bundle/product-validator";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Connection = typeof db | Tx;
type Row = typeof imporBundle.$inferSelect;
type ProductBundle = Extract<ProductBundleValidation, { success: true }>["data"];
type GraphBundle = { manifest: ProductBundle["manifest"]; products: readonly ProductBundle["products"][number][]; dependencies: readonly ProductBundle["dependencies"][number][] };
type Bundle = ProductBundle | ValidatedIdeaBundle;
type Entry = { importId: string; expectedRevision: string };
type Loaded = { row: Row; bundle: Bundle; base: Row; baseBundle: Bundle };
const hash = (value: unknown) => createHash("sha256").update(serializeDeterministically(value)).digest("hex");
const checksum = (bundle: Bundle) => "products" in bundle ? bundle.checksum : bundle.canonicalChecksum;
const sorted = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const entrySchema = z.object({ importId: z.string().min(1), expectedRevision: hex }).strict();
const identitySchema = z.object({ id: z.string(), revision: hex, bundleId: z.string(), sourceUriOrKey: z.string(), courseId: z.string(), kind: z.enum(["idea", "product"]), version: z.number().int().min(3), lineageHash: hex }).strict();
const ideaHeadSchema = z.object({ id: z.string(), version: z.number().int().positive(), hash: hex, generationHash: hex, status: z.string(), courseId: z.string(), chapterId: z.string() }).strict();
const liveRowSchema = z.object({ type: z.enum(["idea", "source_material", "source_chunk", "product"]), id: z.string(), version: z.number().int().positive(), hash: hex, status: z.string(), courseId: z.string(), sourceId: z.string().optional() }).strict();
export const revisionVerificationPointerSchema = z.object({ schema: z.literal("revision-verification-context.v1"), auditId: z.string().min(1), digest: hex }).strict();
const contextSchema = z.object({
  schema: z.literal("revision-verification-context.v1"), actorId: z.string().min(1), courseId: z.string().min(1), entries: z.array(entrySchema).min(2).max(16),
  artifacts: z.array(identitySchema).min(2).max(16), bases: z.array(identitySchema).min(1).max(16),
  candidates: z.array(ideaHeadSchema), canonicalIdeaHeads: z.array(ideaHeadSchema), sources: z.array(liveRowSchema),
}).strict();
type Context = z.infer<typeof contextSchema>;
type Pointer = z.infer<typeof revisionVerificationPointerSchema>;

function identity(row: Row) {
  if (!row.courseId || !["idea", "product"].includes(row.bundleType) || row.version < 3) throw new Error("REVISION_VERIFICATION_PROFILE_REQUIRED");
  return identitySchema.parse({ id: row.id, revision: row.checksum, bundleId: row.bundleId, sourceUriOrKey: row.sourceUriOrKey, courseId: row.courseId, kind: row.bundleType, version: row.version, lineageHash: hash(row.validationReport.revisionLineage ?? null) });
}
async function bundleFor(row: Row): Promise<Bundle> {
  identity(row);
  if (!storage.download) throw new Error("REVISION_VERIFICATION_STORAGE_REQUIRED");
  const bytes = await storage.download(row.sourceUriOrKey);
  const bundle = row.bundleType === "idea" ? parseIdeaBundle(readSecureZip(bytes)) : parseAdmittedProductBundle(bytes, row);
  if (bundle.manifest.bundleId !== row.bundleId || checksum(bundle) !== row.checksum || bundle.manifest.schemaVersion !== `${row.bundleType}-bundle.v${row.version}` || (row.bundleType === "idea" && row.version !== 3)) throw new Error("REVISION_VERIFICATION_ARTIFACT_CHANGED");
  if ("products" in bundle && bundle.products.some(product => !["article", "diktat", "flashcard_set", "flashcard", "solution_collection"].includes(product.productType))) throw new Error("REVISION_VERIFICATION_LEARNING_REQUIRED");
  return bundle;
}
async function courseFor(bundle: Bundle, connection: Connection) {
  const candidates = await connection.select().from(mataKuliah).where(or(eq(mataKuliah.id, bundle.manifest.courseId), eq(mataKuliah.legacyCourseId, bundle.manifest.courseId))).limit(2);
  if (candidates.length !== 1 || !candidates[0].legacyCourseId) throw new Error("REVISION_VERIFICATION_COURSE_AMBIGUOUS");
  const course = candidates[0];
  const chapterIds = "entities" in bundle ? [...new Set([...bundle.entities.ideas, ...bundle.entities.learningSections, ...bundle.entities.sourceMaterials].flatMap(value => value.chapterId ? [value.chapterId] : []))] : [...new Set(bundle.products.flatMap(value => "chapterIds" in value ? value.chapterIds : value.chapterId ? [value.chapterId] : []))];
  if (chapterIds.length !== 1) throw new Error("REVISION_VERIFICATION_CHAPTER_REQUIRED");
  const [chapter] = await connection.select({ id: bab.id }).from(bab).where(and(eq(bab.id, chapterIds[0]), eq(bab.mataKuliahId, course.id))).limit(1);
  if (!chapter) throw new Error("REVISION_VERIFICATION_SCOPE_MISMATCH");
  return course;
}
async function loadEntries(entries: Entry[], connection: Connection): Promise<Loaded[]> {
  if (entries.length < 2 || entries.length > 16 || new Set(entries.map(value => value.importId)).size !== entries.length) throw new Error("REVISION_VERIFICATION_ENTRIES_REQUIRED");
  const result: Loaded[] = [];
  for (const entry of [...entries].sort((a, b) => a.importId.localeCompare(b.importId))) {
    entrySchema.parse(entry);
    const [row] = await connection.select().from(imporBundle).where(eq(imporBundle.id, entry.importId)).limit(1);
    if (!row || row.checksum !== entry.expectedRevision) throw new Error("REVISION_VERIFICATION_DRAFT_CHANGED");
    const lineage = row.validationReport.revisionLineage as { schema?: unknown; baseImportId?: unknown; baseRevision?: unknown } | undefined;
    if (lineage?.schema !== "authoring-revision.v1" || typeof lineage.baseImportId !== "string" || typeof lineage.baseRevision !== "string") throw new Error("REVISION_VERIFICATION_REVISION_REQUIRED");
    const [base] = await connection.select().from(imporBundle).where(eq(imporBundle.id, lineage.baseImportId)).limit(1);
    if (!base || base.checksum !== lineage.baseRevision || base.bundleType !== row.bundleType || base.courseId !== row.courseId) throw new Error("REVISION_VERIFICATION_BASE_CHANGED");
    result.push({ row, base, bundle: await bundleFor(row), baseBundle: await bundleFor(base) });
  }
  return result;
}
function prospectiveHeads(ideaDrafts: readonly ValidatedIdeaBundle[], courseId: string, courseAliases: readonly string[] = [courseId]) {
  const heads = new Map<string, z.infer<typeof ideaHeadSchema>>();
  for (const bundle of ideaDrafts) {
    if (bundle.manifest.schemaVersion !== "idea-bundle.v3" || !courseAliases.includes(bundle.manifest.courseId)) throw new Error("REVISION_VERIFICATION_SCOPE_MISMATCH");
    for (const idea of bundle.entities.ideas) {
      if (idea.courseId !== bundle.manifest.courseId || idea.status !== "published") throw new Error("REVISION_VERIFICATION_IDEA_AMBIGUOUS");
      const head = { id: idea.id, version: idea.version, hash: idea.semanticHash, generationHash: idea.generationHash, status: "published", courseId, chapterId: idea.chapterId };
      const existing = heads.get(idea.id);
      if (existing && hash(existing) !== hash(head)) throw new Error("REVISION_VERIFICATION_IDEA_AMBIGUOUS");
      heads.set(idea.id, head);
    }
  }
  return sorted([...heads.values()]);
}

async function graphRows(productBundle: Pick<GraphBundle, "products" | "dependencies">, ideaDrafts: readonly ValidatedIdeaBundle[], connection: Connection, extraIdeaIds: readonly string[] = []) {
  const dependencies = productBundle.dependencies;
  const ids = (type: ProductV4LiveDependency["type"]) => dependencies.filter(value => value.upstreamEntityType === type).map(value => value.upstreamEntityId);
  const ideaIds = [...new Set([...ids("idea"), ...productBundle.products.flatMap(product => product.ideaLinks.map(link => link.id)), ...ideaDrafts.flatMap(bundle => bundle.entities.ideas.map(idea => idea.id)), ...extraIdeaIds])];
  const chunkIds = [...new Set([...ids("source_chunk"), ...productBundle.products.flatMap(product => product.sourceRefs.flatMap(ref => ref.excerptIds)), ...ideaDrafts.flatMap(bundle => bundle.entities.sourceChunks.map(chunk => chunk.id))])];
  const canonicalIdeaHeads = ideaIds.length ? await connection.select({ id: ide.id, version: ide.version, hash: ide.semanticHash, generationHash: ide.generationHash, status: ide.status, courseId: ide.mataKuliahId, chapterId: ide.babId }).from(ide).where(inArray(ide.id, ideaIds)) : [];
  const rows: ProductV4LiveDependency[] = canonicalIdeaHeads.map(({ generationHash: _generationHash, chapterId: _chapterId, ...row }) => ({ ...row, type: "idea" }));
  const chunks = chunkIds.length ? await connection.select({ id: potonganSumber.id, version: potonganSumber.sourceVersion, hash: potonganSumber.checksum, sourceId: potonganSumber.sumberMateriId, courseId: sumberMateri.mataKuliahId, status: sumberMateri.status }).from(potonganSumber).innerJoin(sumberMateri, eq(potonganSumber.sumberMateriId, sumberMateri.id)).where(inArray(potonganSumber.id, chunkIds)) : [];
  rows.push(...chunks.map(row => ({ ...row, type: "source_chunk" as const })));
  const sourceIds = [...new Set([...ids("source_material"), ...productBundle.products.flatMap(product => product.sourceRefs.map(ref => ref.sourceId)), ...chunks.map(chunk => chunk.sourceId), ...ideaDrafts.flatMap(bundle => bundle.entities.sourceMaterials.map(source => source.id))])];
  if (sourceIds.length) rows.push(...(await connection.select({ id: sumberMateri.id, version: sumberMateri.version, hash: sumberMateri.checksum, status: sumberMateri.status, courseId: sumberMateri.mataKuliahId }).from(sumberMateri).where(inArray(sumberMateri.id, sourceIds))).map(row => ({ ...row, type: "source_material" as const })));
  const productIds = [...new Set(dependencies.filter(value => value.upstreamEntityType === "product" && !productBundle.products.some(product => product.id === value.upstreamEntityId && product.version === value.upstreamVersion)).map(value => productVersionId(value.upstreamEntityId, value.upstreamVersion)))];
  if (productIds.length) {
    for (const table of [artikel, diktatMateri, soal, setFlashcard, blueprintAsesmen]) rows.push(...(await connection.select({ id: table.id, version: table.version, hash: table.generationHash, status: table.status, courseId: table.mataKuliahId }).from(table).where(inArray(table.id, productIds))).map(row => ({ ...row, type: "product" as const })));
    rows.push(...(await connection.select({ id: flashcard.id, version: flashcard.version, hash: flashcard.generationHash, status: flashcard.status, courseId: setFlashcard.mataKuliahId }).from(flashcard).innerJoin(setFlashcard, eq(flashcard.setFlashcardId, setFlashcard.id)).where(inArray(flashcard.id, productIds))).map(row => ({ ...row, type: "product" as const })));
    rows.push(...(await connection.select({ id: pembahasanSoal.id, version: pembahasanSoal.version, hash: pembahasanSoal.generationHash, status: pembahasanSoal.status, courseId: soal.mataKuliahId }).from(pembahasanSoal).innerJoin(soal, eq(pembahasanSoal.soalId, soal.id)).where(inArray(pembahasanSoal.id, productIds))).map(row => ({ ...row, type: "product" as const })));
    rows.push(...(await connection.select({ id: solutionCollections.id, version: solutionCollections.version, hash: solutionCollections.generationHash, status: solutionCollections.status, courseId: solutionCollections.courseId }).from(solutionCollections).where(inArray(solutionCollections.id, productIds))).map(row => ({ ...row, type: "product" as const })));
  }
  return { rows, canonicalIdeaHeads: sorted(canonicalIdeaHeads), sources: rows.filter(row => row.type === "source_material" || row.type === "source_chunk").sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`)) };
}

/** Pure graph check shared by release planning and trusted runtime resolution. */
export function assertProspectiveDependencyGraph(input: { productBundle: GraphBundle; ideaDrafts: readonly ValidatedIdeaBundle[]; courseId: string; courseAliases?: readonly string[]; rows: readonly ProductV4LiveDependency[] }) {
  const aliases = input.courseAliases ?? [input.courseId];
  const prospective = prospectiveHeads(input.ideaDrafts, input.courseId, aliases);
  const candidates = new Map(prospective.map(value => [value.id, value]));
  const current = new Map(input.rows.map(value => [`${value.type}:${value.id}`, value]));
  if (current.size !== input.rows.length || !aliases.includes(input.productBundle.manifest.courseId)) throw new Error("REVISION_VERIFICATION_SCOPE_MISMATCH");
  const requireRow = (type: ProductV4LiveDependency["type"], id: string, version: number, hash?: string) => {
    const candidate = type === "idea" ? candidates.get(id) : undefined;
    const row = candidate ? { ...candidate, type: "idea" as const } : current.get(`${type}:${type === "product" ? productVersionId(id, version) : id}`);
    if (!row || row.courseId !== input.courseId || row.version !== version || hash !== undefined && row.hash !== hash || type === "idea" && row.status !== "published" || (type === "source_material" || type === "source_chunk") && row.status !== "active" || type === "product" && !["published", "approved"].includes(row.status)) throw new Error(`REVISION_PROSPECTIVE_DEPENDENCY_CHANGED:${type}:${id}`);
    return row;
  };
  for (const bundle of input.ideaDrafts) {
    for (const source of bundle.entities.sourceMaterials) requireRow("source_material", source.id, source.version, source.checksum);
    for (const chunk of bundle.entities.sourceChunks) if (requireRow("source_chunk", chunk.id, chunk.sourceVersion, chunk.checksum).sourceId !== chunk.sourceMaterialId) throw new Error("REVISION_PROSPECTIVE_EXCERPT_SCOPE_MISMATCH");
  }
  for (const product of input.productBundle.products) {
    if (product.courseId !== input.productBundle.manifest.courseId) throw new Error("REVISION_VERIFICATION_SCOPE_MISMATCH");
    for (const idea of product.ideaLinks) requireRow("idea", idea.id, idea.version, idea.semanticHash);
    for (const source of product.sourceRefs) {
      requireRow("source_material", source.sourceId, source.version, source.checksum);
      for (const id of source.excerptIds) if (requireRow("source_chunk", id, source.version).sourceId !== source.sourceId) throw new Error("REVISION_PROSPECTIVE_EXCERPT_SCOPE_MISMATCH");
    }
  }
  for (const dependency of input.productBundle.dependencies) {
    const downstream = input.productBundle.products.find(product => product.id === dependency.downstreamEntityId && product.productType === dependency.downstreamEntityType);
    if (!downstream || downstream.version !== dependency.downstreamVersion || downstream.generationHash !== dependency.downstreamHash || dependency.freshness !== "UP_TO_DATE") throw new Error("REVISION_PROSPECTIVE_DEPENDENCY_STALE");
    const local = dependency.upstreamEntityType === "product" ? input.productBundle.products.find(product => product.id === dependency.upstreamEntityId && product.version === dependency.upstreamVersion) : undefined;
    if (local) { if (local.generationHash !== dependency.upstreamHash) throw new Error("REVISION_PROSPECTIVE_DEPENDENCY_STALE"); }
    else requireRow(dependency.upstreamEntityType, dependency.upstreamEntityId, dependency.upstreamVersion, dependency.upstreamHash);
  }
  for (const chunk of input.rows.filter(row => row.type === "source_chunk")) requireRow("source_material", chunk.sourceId ?? "", chunk.version);
  const requiredIdeaIds = new Set([...candidates.keys(), ...input.productBundle.products.flatMap(product => product.ideaLinks.map(link => link.id)), ...input.productBundle.dependencies.filter(value => value.upstreamEntityType === "idea").map(value => value.upstreamEntityId)]);
  return input.rows.filter(row => row.type !== "idea" || !candidates.has(row.id) && requiredIdeaIds.has(row.id)).concat(prospective.map(({ generationHash: _generationHash, chapterId: _chapterId, ...value }) => ({ ...value, type: "idea" as const })));
}

export async function assertProspectiveReleaseDependencies(input: { productBundle: GraphBundle; ideaDrafts: readonly ValidatedIdeaBundle[]; scope: { courseId: string; artifactCourseId?: string }; connection?: Connection }) {
  const connection = input.connection ?? db;
  const [course] = await connection.select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId }).from(mataKuliah).where(eq(mataKuliah.id, input.scope.courseId)).limit(1);
  if (!course || input.scope.artifactCourseId && input.scope.artifactCourseId !== input.productBundle.manifest.courseId) throw new Error("REVISION_VERIFICATION_SCOPE_MISMATCH");
  const courseAliases = [course.id, ...(course.legacyCourseId ? [course.legacyCourseId] : [])];
  const current = await graphRows(input.productBundle, input.ideaDrafts, connection);
  return { dependencies: assertProspectiveDependencyGraph({ ...input, courseId: course.id, courseAliases, rows: current.rows }), canonicalIdeaHeads: current.canonicalIdeaHeads, sources: current.sources };
}

async function lockIdentities(entries: readonly Loaded[], connection: Connection): Promise<CanonicalLock[]> {
  const locks = entries.flatMap(entry => [entry.bundle, entry.baseBundle].flatMap(bundle => "entities" in bundle ? [
    ...bundle.entities.ideas.map(value => ({ domain: "idea" as const, entityType: "idea", entityId: value.id })),
    ...bundle.entities.sourceMaterials.map(value => ({ domain: "idea" as const, entityType: "source_material", entityId: value.id })),
    ...bundle.entities.sourceChunks.map(value => ({ domain: "idea" as const, entityType: "source_chunk", entityId: value.id })),
  ] : [...bundle.products.flatMap(product => [
    { domain: "product" as const, entityType: product.productType, entityId: productVersionId(product.id, product.version) },
    ...product.ideaLinks.map(value => ({ domain: "idea" as const, entityType: "idea", entityId: value.id })),
    ...product.sourceRefs.flatMap(source => [{ domain: "idea" as const, entityType: "source_material", entityId: source.sourceId }, ...source.excerptIds.map(id => ({ domain: "idea" as const, entityType: "source_chunk", entityId: id }))]),
  ]), ...bundle.dependencies.flatMap(dependency => dependency.upstreamEntityType === "product"
    ? ["article", "diktat", "question", "solution", "flashcard_set", "flashcard", "assessment_blueprint", "solution_collection"].map(entityType => ({ domain: "product" as const, entityType, entityId: productVersionId(dependency.upstreamEntityId, dependency.upstreamVersion) }))
    : [{ domain: "idea" as const, entityType: dependency.upstreamEntityType, entityId: dependency.upstreamEntityId }]) ]));
  const chunks = [...new Set(locks.filter(lock => lock.entityType === "source_chunk").map(lock => lock.entityId))];
  if (chunks.length) for (const row of await connection.select({ sourceId: potonganSumber.sumberMateriId }).from(potonganSumber).where(inArray(potonganSumber.id, chunks))) locks.push({ domain: "idea", entityType: "source_material", entityId: row.sourceId });
  return locks;
}

async function buildContext(actorId: string, entries: Loaded[], connection: Connection): Promise<Context> {
  const courses = await Promise.all(entries.map(entry => courseFor(entry.bundle, connection)));
  if (new Set(courses.map(course => course.id)).size !== 1 || entries.some(entry => entry.row.courseId !== courses[0].legacyCourseId)) throw new Error("REVISION_VERIFICATION_SCOPE_MISMATCH");
  const courseId = courses[0].id;
  const ideaDrafts = entries.flatMap(entry => "entities" in entry.bundle ? [entry.bundle] : []);
  const products = entries.filter(entry => "products" in entry.bundle);
  if (!ideaDrafts.length || !products.some(entry => entry.row.version === 4)) throw new Error("REVISION_VERIFICATION_MIXED_V4_REQUIRED");
  const aliases = [courseId, courses[0].legacyCourseId!];
  const candidates = prospectiveHeads(ideaDrafts, courseId, aliases);
  const baseIdeaIds = entries.flatMap(entry => "entities" in entry.baseBundle ? entry.baseBundle.entities.ideas.map(idea => idea.id) : []);
  const removedIdeaIds = new Set(baseIdeaIds.filter(id => !candidates.some(candidate => candidate.id === id)));
  const heads = new Map<string, z.infer<typeof ideaHeadSchema>>(), sources = new Map<string, ProductV4LiveDependency>();
  for (const entry of products) {
    const bundle = entry.bundle as ProductBundle;
    if (bundle.products.some(product => product.ideaLinks.some(link => removedIdeaIds.has(link.id))) || bundle.dependencies.some(dependency => dependency.upstreamEntityType === "idea" && removedIdeaIds.has(dependency.upstreamEntityId))) throw new Error("REVISION_VERIFICATION_REMOVED_IDEA_REFERENCED");
    const graph = await graphRows(entry.bundle as ProductBundle, ideaDrafts, connection, baseIdeaIds);
    assertProspectiveDependencyGraph({ productBundle: entry.bundle as ProductBundle, ideaDrafts, courseId, courseAliases: aliases, rows: graph.rows });
    for (const head of graph.canonicalIdeaHeads) heads.set(head.id, head);
    for (const source of graph.sources) sources.set(`${source.type}:${source.id}`, source);
  }
  for (const entry of entries.filter(entry => "entities" in entry.baseBundle)) if (entry.base.status === "published") {
    for (const old of (entry.baseBundle as ValidatedIdeaBundle).entities.ideas) {
      const live = heads.get(old.id);
      if (!live || live.courseId !== courseId || live.status !== "published" || live.version !== old.version || live.hash !== old.semanticHash || live.generationHash !== old.generationHash) throw new Error("REVISION_VERIFICATION_CANONICAL_HEAD_CHANGED");
    }
  }
  for (const candidate of candidates) {
    const prior = heads.get(candidate.id);
    if (prior && (prior.hash !== candidate.hash || prior.generationHash !== candidate.generationHash) && candidate.version <= prior.version) throw new Error("REVISION_VERIFICATION_IDEA_VERSION_REQUIRED");
  }
  return contextSchema.parse({ schema: "revision-verification-context.v1", actorId, courseId, entries: entries.map(entry => ({ importId: entry.row.id, expectedRevision: entry.row.checksum })), artifacts: entries.map(entry => identity(entry.row)), bases: sorted([...new Map(entries.map(entry => [entry.base.id, identity(entry.base)])).values()]), candidates, canonicalIdeaHeads: sorted([...heads.values()]), sources: [...sources.values()].sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`)) });
}

/** Explicit stage mutation. No author-supplied verification data or signatures are accepted. */
export async function prepareRevisionVerification(input: { actorId: string; entries: Entry[] }) {
  await assertAuthoringActor(db, input.actorId, { roles: ["admin"], requireLegacyAdmin: true, error: "REVISION_ADMIN_REQUIRED" });
  const observed = await loadEntries(input.entries, db);
  return db.transaction(async tx => {
    await assertAuthoringActor(tx, input.actorId, { roles: ["admin"], requireLegacyAdmin: true, lock: true, error: "REVISION_ADMIN_REQUIRED" });
    const ids = [...new Set(observed.flatMap(entry => [entry.row.id, entry.base.id]))].sort();
    for (const id of ids) await tx.select({ id: imporBundle.id }).from(imporBundle).where(eq(imporBundle.id, id)).limit(1).for("update");
    const entries = await loadEntries(input.entries, tx);
    if (entries.some(entry => entry.row.bundleType === "product" ? entry.row.status !== "draft" : !["validated", "approved", "rejected"].includes(entry.row.status))) throw new Error("REVISION_VERIFICATION_DRAFT_REQUIRED");
    if (!sameIdentityList(observed, entries)) throw new Error("REVISION_VERIFICATION_DRAFT_CHANGED");
    await lockCanonicalIdentities(tx, await lockIdentities(entries, tx));
    const context = await buildContext(input.actorId, entries, tx);
    const digest = hash(context);
    const productEntries = entries.filter(entry => entry.row.version === 4 && entry.row.bundleType === "product");
    const existing = productEntries.map(entry => revisionVerificationPointerSchema.safeParse(entry.row.validationReport.revisionVerificationContext));
    if (existing.every(value => value.success && value.data.digest === digest) && new Set(existing.map(value => value.success ? value.data.auditId : "")).size === 1) {
      const pointer = (existing[0] as { success: true; data: Pointer }).data;
      await readContext(pointer, tx);
      return { contextId: pointer.auditId, digest, entries: context.entries, products: productEntries.map(entry => ({ importId: entry.row.id, expectedRevision: entry.row.checksum })), invalidated: false, nextActions: ["authoring.verify_product_bundle"] };
    }
    const contextId = `revision-verification-${randomUUID()}`;
    const pointer: Pointer = { schema: "revision-verification-context.v1", auditId: contextId, digest };
    await tx.insert(auditMutasi).values({ id: contextId, actorId: input.actorId, entityType: "authoring_revision_verification", entityId: contextId, action: "verification_context_prepared", courseId: productEntries[0].row.courseId, correlationId: digest, afterSnapshot: context });
    for (const entry of productEntries) {
      const { productV4Verification: verification, productV4PdfEvidence: pdf, ...report } = entry.row.validationReport;
      await tx.insert(auditMutasi).values({ id: `revision-verification-reset-${randomUUID()}`, actorId: input.actorId, entityType: "authoring_revision", entityId: entry.row.id, action: "verification_context_invalidated", courseId: entry.row.courseId, correlationId: contextId, beforeSnapshot: { verification: verification ?? null, pdf: pdf ?? null, context: entry.row.validationReport.revisionVerificationContext ?? null }, afterSnapshot: { context: pointer, revision: entry.row.checksum, explicitReviewRequired: true } });
      await tx.update(imporBundle).set({ validationReport: { ...report, revisionVerificationContext: pointer }, updatedAt: new Date() }).where(eq(imporBundle.id, entry.row.id));
      await tx.update(buktiPdfBundle).set({ status: "stale", updatedAt: new Date() }).where(eq(buktiPdfBundle.imporBundleId, entry.row.id));
    }
    return { contextId, digest, entries: context.entries, products: productEntries.map(entry => ({ importId: entry.row.id, expectedRevision: entry.row.checksum })), invalidated: true, nextActions: ["authoring.verify_product_bundle", "authoring.review_revision", "authoring.plan_release"] };
  });
}

function sameIdentityList(left: Loaded[], right: Loaded[]) {
  return hash(left.map(entry => ({ artifact: identity(entry.row), base: identity(entry.base) }))) === hash(right.map(entry => ({ artifact: identity(entry.row), base: identity(entry.base) })));
}
async function readContext(pointer: Pointer, connection: Connection) {
  const [audit] = await connection.select().from(auditMutasi).where(and(eq(auditMutasi.id, pointer.auditId), eq(auditMutasi.entityType, "authoring_revision_verification"), eq(auditMutasi.entityId, pointer.auditId), eq(auditMutasi.action, "verification_context_prepared"))).limit(1);
  const context = contextSchema.parse(audit?.afterSnapshot);
  if (!audit || audit.actorId !== context.actorId || audit.correlationId !== pointer.digest || hash(context) !== pointer.digest) throw new Error("REVISION_VERIFICATION_CONTEXT_FORGED");
  return context;
}

async function validateContext(pointer: Pointer, connection: Connection, expectedEntries?: Entry[], allowCommitted = true) {
  const context = await readContext(pointer, connection);
  if (expectedEntries && hash([...expectedEntries].sort((a, b) => a.importId.localeCompare(b.importId))) !== hash(context.entries)) throw new Error("REVISION_VERIFICATION_RELEASE_CHANGED");
  await assertAuthoringActor(connection, context.actorId, { roles: ["admin"], requireLegacyAdmin: true, error: "REVISION_VERIFICATION_ACTOR_INACTIVE" });
  const entries = await loadEntries(context.entries, connection);
  if (hash(entries.map(entry => identity(entry.row))) !== hash(context.artifacts) || hash(sorted([...new Map(entries.map(entry => [entry.base.id, identity(entry.base)])).values()])) !== hash(context.bases)) throw new Error("REVISION_VERIFICATION_DRAFT_CHANGED");
  let committed = false;
  if (allowCommitted && entries.every(entry => entry.row.status === "published")) {
    const audits = await connection.select({ after: auditMutasi.afterSnapshot }).from(auditMutasi).where(and(eq(auditMutasi.entityType, "authoring_release"), eq(auditMutasi.action, "release_published"), sql`${auditMutasi.afterSnapshot}->'entries' = ${JSON.stringify(context.entries)}::jsonb`));
    committed = audits.some(audit => Array.isArray(audit.after?.verificationContexts) && context.artifacts.filter(artifact => artifact.kind === "product" && artifact.version === 4).every(artifact => (audit.after!.verificationContexts as unknown[]).some(value => {
      const record = value as { importId?: unknown; context?: unknown };
      return record.importId === artifact.id && hash(record.context) === hash(pointer);
    })));
  }
  if (!committed && entries.some(entry => entry.row.bundleType === "product" ? entry.row.status !== "draft" : !["validated", "approved", "rejected"].includes(entry.row.status))) throw new Error("REVISION_VERIFICATION_DRAFT_CHANGED");
  for (const entry of entries) {
    const [storedBase] = context.bases.filter(value => value.id === entry.base.id);
    if (!storedBase || (committed ? !["published", "withdrawn"].includes(entry.base.status) : entry.base.status !== "published" && !["draft", "validated", "approved", "rejected"].includes(entry.base.status))) throw new Error("REVISION_VERIFICATION_BASE_CHANGED");
    const course = await courseFor(entry.bundle, connection);
    if (course.id !== context.courseId || entry.row.courseId !== course.legacyCourseId) throw new Error("REVISION_VERIFICATION_SCOPE_MISMATCH");
  }
  const ideaDrafts = entries.flatMap(entry => "entities" in entry.bundle ? [entry.bundle] : []);
  const [course] = await connection.select({ legacyCourseId: mataKuliah.legacyCourseId }).from(mataKuliah).where(eq(mataKuliah.id, context.courseId)).limit(1);
  if (!course?.legacyCourseId) throw new Error("REVISION_VERIFICATION_SCOPE_MISMATCH");
  const aliases = [context.courseId, course.legacyCourseId];
  if (hash(prospectiveHeads(ideaDrafts, context.courseId, aliases)) !== hash(context.candidates)) throw new Error("REVISION_VERIFICATION_CANDIDATE_CHANGED");
  const heads = new Map<string, z.infer<typeof ideaHeadSchema>>(), sources = new Map<string, ProductV4LiveDependency>();
  const dependencies = new Map<string, ProductV4LiveDependency[]>();
  for (const entry of entries) if ("products" in entry.bundle) {
    const graph = await graphRows(entry.bundle, ideaDrafts, connection, context.canonicalIdeaHeads.map(head => head.id));
    dependencies.set(entry.row.id, assertProspectiveDependencyGraph({ productBundle: entry.bundle, ideaDrafts, courseId: context.courseId, courseAliases: aliases, rows: graph.rows }));
    for (const row of graph.canonicalIdeaHeads) heads.set(row.id, row);
    for (const row of graph.sources) sources.set(`${row.type}:${row.id}`, row);
  }
  const expectedHeads = new Map(context.canonicalIdeaHeads.map(value => [value.id, value]));
  if (committed) {
    const candidateIds = new Set(context.candidates.map(value => value.id));
    const removedIds = new Set(entries.flatMap(entry => "entities" in entry.baseBundle ? entry.baseBundle.entities.ideas.map(idea => idea.id).filter(id => !candidateIds.has(id)) : []));
    for (const id of removedIds) {
      const previous = expectedHeads.get(id), current = heads.get(id);
      if (previous && current && ["published", "withdrawn"].includes(current.status)) expectedHeads.set(id, { ...previous, status: current.status });
    }
    for (const candidate of context.candidates) expectedHeads.set(candidate.id, candidate);
  }
  if (hash(sorted([...heads.values()])) !== hash(sorted([...expectedHeads.values()])) || hash([...sources.values()].sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`))) !== hash(context.sources)) throw new Error("REVISION_VERIFICATION_CANONICAL_HEAD_CHANGED");
  return { context, entries, dependencies };
}

/** Coordinator rechecks attestation while holding its exact import and canonical locks, before promotion. */
export async function assertRevisionVerificationReleaseContext(input: { entries: Array<{ row: Row; bundle: Bundle }>; connection: Connection }) {
  const expectedEntries = input.entries.map(entry => ({ importId: entry.row.id, expectedRevision: entry.row.checksum }));
  for (const entry of input.entries) if (entry.row.version === 4 && entry.row.bundleType === "product") {
    const pointer = revisionVerificationPointerSchema.safeParse(entry.row.validationReport.revisionVerificationContext);
    if (pointer.success) await validateContext(pointer.data, input.connection, expectedEntries, false);
    else if (entry.row.validationReport.revisionVerificationContext) throw new Error("REVISION_VERIFICATION_CONTEXT_FORGED");
    else if (input.entries.some(candidate => candidate.row.bundleType === "idea")) throw new Error("REVISION_VERIFICATION_PREPARATION_REQUIRED");
  }
}

/** Resolve only prospective rows attested by the server; normal live verification remains unchanged. */
export async function resolveRevisionVerificationContext(input: { row: { id: string; checksum: string; bundleId: string }; bundle: GraphBundle; rows: readonly ProductV4LiveDependency[] }, connection: Connection = db): Promise<{ rows: ProductV4LiveDependency[]; contextDigest?: string }> {
  const [current] = await connection.select().from(imporBundle).where(eq(imporBundle.id, input.row.id)).limit(1);
  if (!current || current.checksum !== input.row.checksum || current.bundleId !== input.row.bundleId || current.bundleType !== "product" || current.version !== 4) throw new Error("REVISION_VERIFICATION_DRAFT_CHANGED");
  if (!current.validationReport.revisionVerificationContext) return { rows: [...input.rows] };
  const pointer = revisionVerificationPointerSchema.parse(current.validationReport.revisionVerificationContext);
  const { entries, dependencies } = await validateContext(pointer, connection);
  const product = entries.find(entry => entry.row.id === current.id);
  if (!product || !("products" in product.bundle) || hash({ manifest: product.bundle.manifest, products: product.bundle.products, dependencies: product.bundle.dependencies }) !== hash({ manifest: input.bundle.manifest, products: input.bundle.products, dependencies: input.bundle.dependencies })) throw new Error("REVISION_VERIFICATION_ARTIFACT_CHANGED");
  const resolved = dependencies.get(current.id);
  if (!resolved) throw new Error("REVISION_VERIFICATION_ARTIFACT_CHANGED");
  return { rows: resolved, contextDigest: pointer.digest };
}
