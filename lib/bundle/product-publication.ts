import { revisionPublicationConnection, revisionPublicationTransaction, dispatchRevisionPublication, revisionPublicationVerification, inRevisionPublication, reusesRevisionProduct } from "@/lib/authoring/revision-publication-context";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { assertSolutionImportScope, lockSolutionImportScope, type SolutionImportScope } from "@/lib/solutions/import-scope";
import { productVersionId } from "./product-identity";
import { productEntityHash } from "./product-bundle-v2";
import { legacyArticlePublicMarkdown } from "@/lib/materials/legacy-article-public";
import { articleIndexableMarkdown } from "@/lib/articles/structured-read-model";
import { createHash } from "node:crypto";
import { flattenArticleParts } from "@/lib/materials/article-parts";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@/db";
import {
  aiQuestionBank,
  artikel,
  codingProblems,
  artikelIde,
  auditMutasi,
  bab,
  bagianArtikel,
  bagianPembelajaran,
  blueprintAsesmen,
  buktiPdfBundle,
  blokArtikel,
  blokArtikelIde,
  blokArtikelSumber,
  courses,
  diktatIde,
  diktatMateri,
  flashcard,
  flashcardIde,
  ide,
  imporBundle,
  itemImporBundle,
  ketergantunganProduk,
  mataKuliah,
  pembahasanSoal,
  publikasiBundle,
  reviewBundle,
  reviewItemBundle,
  reviewPedagogiBundle,
  setFlashcard,
  soal,
  soalIde,
  soalItbReferensi,
  soalRelasiIde,
  solutionCollections,
  sumberMateri,
  potonganSumber,
  pengguna,
  vectorSyncQueue,
} from "@/db/schema";
import { serializeDeterministically } from "@/lib/bundle/idea-bundle-v2";
import { redactQuestionAnswerKeys } from "@/lib/asesmen/question-options";
import { canonicalNamespaceForProductType } from "@/lib/vectorize/outbox";
import type { CanonicalEntityType, CanonicalNamespace } from "@/lib/vectorize/contracts";
import { resolveBundleIdentity } from "./attribution";
import { parseStagedProductBundle, getProductBundleImport, productBundleLifecycleStatus } from "./product-staging";
import { deterministicProductSerialization, findInvalidProductDependency, hasProductBundleDependencyBlock, productInteractiveDocuments, type ProductDependency, type ProductEntity } from "./product-validator";
import { z } from "zod";
import { productV4ReviewContextShape, validateProductV4ReviewContext } from "./product-v4-review";
import { QUALITY_POLICY_VERSION, pedagogicRubricItemSchema } from "@/lib/materials/quality-policy";
import type { getProductV4VerificationReadiness } from "./product-v4-verification-service";
import { compileArticleProduct } from "@/lib/materials/compiler";
import { assertProductSectionReviews, evaluateProductBundleQualityPolicy, evaluateProductBundleReviewAndPdfGate } from "./product-review-gate";
import { resolveProductV4PdfBinding } from "./product-pdf-selection";
import type { PdfArtifactEvidence } from "@/lib/materials/pdf-artifact-contract";
import { claimProductReviewSnapshot } from "./product-review-snapshot";
import { listProcessingLegacyPdfRequests } from "./product-diktat-queue";
import { assertStoredSolutionReview } from "@/lib/solutions/review";
import { lockCanonicalIdentities, type CanonicalLock } from "@/lib/vectorize/canonical-locks";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;
type FailureStage = ProductEntity["productType"] | "outbox";
type CanonicalProductVectorSpec = {
  namespace: CanonicalNamespace;
  entityType: CanonicalEntityType;
  entityId: string;
  version: number;
  title: string;
  text: string;
};

function enabled(): void {}

function id(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(`${prefix}:${value}`, "utf8").digest("hex").slice(0, 32)}`;
}

function chunksOf<T>(values: readonly T[], size = 40): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function targetId(product: ProductEntity): string {
  return productVersionId(product.id, product.version);
}

function articleMarkdown(product: Extract<ProductEntity, { productType: "article" }>): string {
  if (product.sections.length > 0) return compileArticleProduct(product, { strict: false }).markdown;
  return legacyArticlePublicMarkdown(product.blocks);
}

function maybeFail(stage: FailureStage | undefined, expected: FailureStage): void {
  if (stage !== expected || (process.env.NODE_ENV !== "test" && process.env.STAGING_PRODUCT_FAILURE_TEST !== "1")) return;
  throw new Error(`PRODUCT_BUNDLE_TEST_FAILURE:${expected}`);
}

function equal(value: unknown, expected: unknown): boolean {
  return serializeDeterministically(value) === serializeDeterministically(expected);
}

function sortedById<T extends { id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

// Lock the persisted identity, including rows that do not exist yet. Every
// publisher and withdrawer takes the complete set in the same order.
export async function productPublicationLockIdentities(tx: Tx, products: readonly ProductEntity[], dependencies: readonly ProductDependency[] = []): Promise<CanonicalLock[]> {
  const locks: CanonicalLock[] = products.map(product => ({ domain: "product", entityType: product.productType, entityId: targetId(product) }));
  const sourceIds = new Set(products.flatMap(product => product.sourceRefs.map(source => source.sourceId)));
  const chunkIds = new Set(products.flatMap(product => product.sourceRefs.flatMap(source => source.excerptIds)));
  for (const product of products) for (const link of product.ideaLinks) locks.push({ domain: "idea", entityType: "idea", entityId: link.id });
  for (const dependency of dependencies) {
    if (dependency.upstreamEntityType === "product") {
      // The dependency contract does not carry the upstream Product type.
      // Lock every possible table identity before any dependency row share lock.
      for (const type of ["article", "diktat", "question", "solution", "flashcard_set", "flashcard", "assessment_blueprint", "solution_collection"]) {
        locks.push({ domain: "product", entityType: type, entityId: productVersionId(dependency.upstreamEntityId, dependency.upstreamVersion) });
      }
    } else if (dependency.upstreamEntityType === "idea") locks.push({ domain: "idea", entityType: "idea", entityId: dependency.upstreamEntityId });
    else if (dependency.upstreamEntityType === "source_material") sourceIds.add(dependency.upstreamEntityId);
    else if (dependency.upstreamEntityType === "source_chunk") chunkIds.add(dependency.upstreamEntityId);
  }
  // Discovery has no row locks. Canonical parent links are immutable on publication.
  for (const batch of chunksOf([...chunkIds])) {
    const chunks = await tx.select({ sourceId: potonganSumber.sumberMateriId }).from(potonganSumber).where(inArray(potonganSumber.id, batch));
    for (const chunk of chunks) sourceIds.add(chunk.sourceId);
  }
  for (const entityId of chunkIds) locks.push({ domain: "idea", entityType: "source_chunk", entityId });
  for (const entityId of sourceIds) locks.push({ domain: "idea", entityType: "source_material", entityId });
  // One complete sorted set: Product identities, then Idea/source identities.
  // Never hold an Idea row while waiting for an advisory lock used by withdrawal.
  return locks;
}

async function lockCanonicalProducts(tx: Tx, products: readonly ProductEntity[], dependencies: readonly ProductDependency[] = []): Promise<void> {
  await lockCanonicalIdentities(tx, await productPublicationLockIdentities(tx, products, dependencies));
}

async function productsOwnedByOtherPublishedImports(tx: Tx, importId: string, products: readonly ProductEntity[]): Promise<Set<string>> {
  const owned = new Set<string>();
  const ids = [...new Set(products.map((product) => product.id))];
  for (const batch of chunksOf(ids)) {
    const rows = await tx.select({ type: itemImporBundle.entityType, id: itemImporBundle.entityId, version: itemImporBundle.entityVersion })
      .from(itemImporBundle)
      .innerJoin(imporBundle, eq(itemImporBundle.imporBundleId, imporBundle.id))
      .where(and(inArray(itemImporBundle.entityId, batch), ne(itemImporBundle.imporBundleId, importId), eq(imporBundle.status, "published")));
    for (const row of rows) owned.add(JSON.stringify([row.type, row.id, row.version]));
  }
  return owned;
}

function productOwnershipKey(product: ProductEntity): string {
  return JSON.stringify([product.productType, product.id, product.version]);
}

// Some authored fields are not materialized in the canonical tables. The
// staged item hash binds those fields to the complete original product.
async function requireMatchingPublishedProduct(tx: Tx, product: ProductEntity): Promise<void> {
  const owners = await tx.select({ hash: itemImporBundle.entityHash }).from(itemImporBundle)
    .innerJoin(imporBundle, eq(itemImporBundle.imporBundleId, imporBundle.id))
    .where(and(eq(itemImporBundle.entityType, product.productType), eq(itemImporBundle.entityId, product.id), eq(itemImporBundle.entityVersion, product.version), eq(itemImporBundle.status, "published"), eq(imporBundle.status, "published")));
  const expectedHash = productEntityHash(product);
  if (owners.length === 0 || owners.some((owner) => owner.hash !== expectedHash)) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
}

async function requireIdentity(tx: Tx, identityId: string, code: string): Promise<void> {
  const [row] = await tx.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, identityId)).limit(1);
  if (!row) throw new Error(`${code}:${identityId}`);
}

async function resolveCourse(tx: Tx, courseId: string): Promise<{ targetId: string; legacyId: string }> {
  const matches = await tx.select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId }).from(mataKuliah).where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId))).limit(2);
  if (matches.length > 1) throw new Error(`PRODUCT_BUNDLE_COURSE_AMBIGUOUS:${courseId}`);
  const row = matches[0];
  if (!row) throw new Error(`PRODUCT_BUNDLE_COURSE_NOT_FOUND:${courseId}`);
  return { targetId: row.id, legacyId: row.legacyCourseId ?? row.id };
}

async function requireLegacyCourse(tx: Tx, legacyId: string): Promise<void> {
  const [row] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, legacyId)).limit(1);
  if (!row) throw new Error(`PRODUCT_BUNDLE_LEGACY_COURSE_MAPPING_MISSING:${legacyId}`);
}

async function resolveChapter(tx: Tx, chapterId: string | undefined, courseTargetId: string): Promise<string | null> {
  if (!chapterId) return null;
  const [row] = await tx.select({ id: bab.id, courseId: bab.mataKuliahId }).from(bab).where(or(eq(bab.id, chapterId), eq(bab.legacyChapterId, chapterId))).limit(1);
  if (!row || row.courseId !== courseTargetId) throw new Error(`PRODUCT_BUNDLE_CHAPTER_NOT_FOUND:${chapterId}`);
  return row.id;
}

async function verifyTraceability(tx: Tx, products: readonly ProductEntity[], courseId: string): Promise<void> {
  const ideaIds = [...new Set(products.flatMap((product) => product.ideaLinks.map((link) => link.id)))];
  const sourceRefs = products.flatMap((product) => product.sourceRefs);
  const sourceIds = [...new Set(sourceRefs.map((source) => source.sourceId))];
  const excerptIds = [...new Set(sourceRefs.flatMap((source) => source.excerptIds))];
  const ideaRows = [];
  const sourceRows = [];
  const excerptRows = [];
  for (const batch of chunksOf(ideaIds)) ideaRows.push(...await tx.select({ id: ide.id, version: ide.version, semanticHash: ide.semanticHash, status: ide.status, courseId: ide.mataKuliahId }).from(ide).where(inArray(ide.id, batch)).for("share"));
  for (const batch of chunksOf(sourceIds)) sourceRows.push(...await tx.select({ id: sumberMateri.id, version: sumberMateri.version, checksum: sumberMateri.checksum, status: sumberMateri.status, courseId: sumberMateri.mataKuliahId }).from(sumberMateri).where(inArray(sumberMateri.id, batch)).for("share"));
  for (const batch of chunksOf(excerptIds)) excerptRows.push(...await tx.select({ id: potonganSumber.id, sourceId: potonganSumber.sumberMateriId, sourceVersion: potonganSumber.sourceVersion }).from(potonganSumber).where(inArray(potonganSumber.id, batch)).for("share"));
  const ideasById = new Map(ideaRows.map((row) => [row.id, row]));
  const sourcesById = new Map(sourceRows.map((row) => [row.id, row]));
  const excerptsById = new Map(excerptRows.map((row) => [row.id, row]));

  for (const product of products) {
    for (const link of product.ideaLinks) {
      const row = ideasById.get(link.id);
      if (!row || row.status !== "published" || row.courseId !== courseId) throw new Error(`PRODUCT_BUNDLE_IDEA_NOT_PUBLISHED:${link.id}`);
      if (row.version !== link.version || row.semanticHash !== link.semanticHash) throw new Error(`PRODUCT_BUNDLE_IDEA_VERSION_MISMATCH:${link.id}`);
    }
    for (const source of product.sourceRefs) {
      const material = sourcesById.get(source.sourceId);
      if (!material || material.status !== "active" || material.version !== source.version || material.checksum !== source.checksum || material.courseId !== courseId) throw new Error(`PRODUCT_BUNDLE_SOURCE_MISMATCH:${source.sourceId}`);
      if (new Set(source.excerptIds).size !== source.excerptIds.length || source.excerptIds.some((excerptId) => {
        const excerpt = excerptsById.get(excerptId);
        return !excerpt || excerpt.sourceId !== source.sourceId || excerpt.sourceVersion !== source.version;
      })) throw new Error(`PRODUCT_BUNDLE_EXCERPT_MISMATCH:${source.sourceId}`);
    }
  }
}

async function verifyDependencies(tx: Tx, dependencies: readonly ProductDependency[], products: readonly ProductEntity[], course: { targetId: string; legacyId: string }): Promise<void> {
  const invalidDependency = findInvalidProductDependency(dependencies, products);
  if (invalidDependency) throw new Error(`PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW:${invalidDependency.dependency.id}`);
  for (const dependency of dependencies) {
    if (dependency.freshness !== "UP_TO_DATE") throw new Error(`PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW:${dependency.id}`);
  }

  // These tables store canonical mata_kuliah IDs. A legacy ID can also be the
  // canonical ID of a different course, so resolve it before comparing rows.
  const allowedCourseIds = new Set([course.targetId]);
  const idsFor = (type: ProductDependency["upstreamEntityType"]) => [...new Set(dependencies.filter((dependency) => dependency.upstreamEntityType === type).map((dependency) => dependency.upstreamEntityId))];
  const ideaIds = idsFor("idea");
  const sourceIds = idsFor("source_material");
  const chunkIds = idsFor("source_chunk");
  const ideaRows = [];
  const sourceRows = [];
  const chunkRows = [];
  for (const batch of chunksOf(ideaIds)) ideaRows.push(...await tx.select({ id: ide.id, version: ide.version, hash: ide.semanticHash, status: ide.status, courseId: ide.mataKuliahId }).from(ide).where(inArray(ide.id, batch)).for("share"));
  for (const batch of chunksOf(sourceIds)) sourceRows.push(...await tx.select({ id: sumberMateri.id, version: sumberMateri.version, hash: sumberMateri.checksum, status: sumberMateri.status, courseId: sumberMateri.mataKuliahId }).from(sumberMateri).where(inArray(sumberMateri.id, batch)).for("share"));
  for (const batch of chunksOf(chunkIds)) chunkRows.push(...await tx.select({ id: potonganSumber.id, version: potonganSumber.sourceVersion, hash: potonganSumber.checksum, courseId: sumberMateri.mataKuliahId, sourceStatus: sumberMateri.status, sourceVersion: sumberMateri.version }).from(potonganSumber).innerJoin(sumberMateri, eq(potonganSumber.sumberMateriId, sumberMateri.id)).where(inArray(potonganSumber.id, batch)).for("share"));
  const ideasById = new Map(ideaRows.filter((row) => row.status === "published" && allowedCourseIds.has(row.courseId)).map((row) => [row.id, row]));
  const sourcesById = new Map(sourceRows.filter((row) => row.status === "active" && allowedCourseIds.has(row.courseId)).map((row) => [row.id, row]));
  const chunksById = new Map(chunkRows.filter((row) => row.sourceStatus === "active" && row.sourceVersion === row.version && allowedCourseIds.has(row.courseId)).map((row) => [row.id, row]));
  const localProducts = new Map(products.map(product => [`${product.id}:${product.version}`, product]));
  const localProductIds = new Set(products.map(product => product.id));
  const externalProductIds = [...new Set(dependencies.filter((dependency) => dependency.upstreamEntityType === "product" && !localProductIds.has(dependency.upstreamEntityId)).map((dependency) => productVersionId(dependency.upstreamEntityId, dependency.upstreamVersion)))];
  const productsById = new Map<string, { version: number; hash: string }>();
  for (const batch of chunksOf(externalProductIds)) {
    const articles = await tx.select({ id: artikel.id, version: artikel.version, hash: artikel.generationHash, status: artikel.status, courseId: artikel.mataKuliahId }).from(artikel).where(inArray(artikel.id, batch)).for("share");
    articles.forEach((row) => { if (row.status === "published" && allowedCourseIds.has(row.courseId) && !productsById.has(row.id)) productsById.set(row.id, row); });
    const diktats = await tx.select({ id: diktatMateri.id, version: diktatMateri.version, hash: diktatMateri.generationHash, status: diktatMateri.status, courseId: diktatMateri.mataKuliahId }).from(diktatMateri).where(inArray(diktatMateri.id, batch)).for("share");
    diktats.forEach((row) => { if (row.status === "published" && allowedCourseIds.has(row.courseId) && !productsById.has(row.id)) productsById.set(row.id, row); });
    const questions = await tx.select({ id: soal.id, version: soal.version, hash: soal.generationHash, status: soal.status, courseId: soal.mataKuliahId }).from(soal).where(inArray(soal.id, batch)).for("share");
    questions.forEach((row) => { if (row.status === "published" && allowedCourseIds.has(row.courseId) && !productsById.has(row.id)) productsById.set(row.id, row); });
    const solutions = await tx.select({ id: pembahasanSoal.id, version: pembahasanSoal.version, hash: pembahasanSoal.generationHash, status: pembahasanSoal.status, courseId: soal.mataKuliahId }).from(pembahasanSoal).innerJoin(soal, eq(pembahasanSoal.soalId, soal.id)).where(inArray(pembahasanSoal.id, batch)).for("share");
    solutions.forEach((row) => { if (row.status === "published" && allowedCourseIds.has(row.courseId) && !productsById.has(row.id)) productsById.set(row.id, row); });
    const sets = await tx.select({ id: setFlashcard.id, version: setFlashcard.version, hash: setFlashcard.generationHash, status: setFlashcard.status, courseId: setFlashcard.mataKuliahId }).from(setFlashcard).where(inArray(setFlashcard.id, batch)).for("share");
    sets.forEach((row) => { if (row.status === "published" && allowedCourseIds.has(row.courseId) && !productsById.has(row.id)) productsById.set(row.id, row); });
    const cards = await tx.select({ id: flashcard.id, version: flashcard.version, hash: flashcard.generationHash, status: flashcard.status, courseId: setFlashcard.mataKuliahId }).from(flashcard).innerJoin(setFlashcard, eq(flashcard.setFlashcardId, setFlashcard.id)).where(inArray(flashcard.id, batch)).for("share");
    cards.forEach((row) => { if (row.status === "published" && allowedCourseIds.has(row.courseId) && !productsById.has(row.id)) productsById.set(row.id, row); });
    const blueprints = await tx.select({ id: blueprintAsesmen.id, version: blueprintAsesmen.version, hash: blueprintAsesmen.generationHash, status: blueprintAsesmen.status, courseId: blueprintAsesmen.mataKuliahId }).from(blueprintAsesmen).where(inArray(blueprintAsesmen.id, batch)).for("share");
    blueprints.forEach((row) => { if (row.status === "approved" && allowedCourseIds.has(row.courseId) && !productsById.has(row.id)) productsById.set(row.id, row); });
  }

  for (const dependency of dependencies) {
    let current: { version: number; hash: string } | null = null;
    if (dependency.upstreamEntityType === "idea") current = ideasById.get(dependency.upstreamEntityId) ?? null;
    else if (dependency.upstreamEntityType === "source_material") current = sourcesById.get(dependency.upstreamEntityId) ?? null;
    else if (dependency.upstreamEntityType === "source_chunk") current = chunksById.get(dependency.upstreamEntityId) ?? null;
    else {
      const localProduct = localProducts.get(`${dependency.upstreamEntityId}:${dependency.upstreamVersion}`);
      current = localProduct ? { version: localProduct.version, hash: localProduct.generationHash } : productsById.get(productVersionId(dependency.upstreamEntityId, dependency.upstreamVersion)) ?? null;
    }
    if (!current || current.version !== dependency.upstreamVersion || current.hash !== dependency.upstreamHash) throw new Error(`PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW:${dependency.id}`);
  }
}

function canonicalProductVectorIdentity(product: ProductEntity): Pick<CanonicalProductVectorSpec, "namespace" | "entityType" | "entityId" | "version"> | null {
  if (product.productType !== "article" && product.productType !== "question" && product.productType !== "solution") return null;
  const namespace = canonicalNamespaceForProductType(product.productType);
  if (!namespace) return null;
  return { namespace, entityType: product.productType, entityId: targetId(product), version: product.version };
}

function canonicalProductVectorSpec(product: ProductEntity): CanonicalProductVectorSpec | null {
  const identity = canonicalProductVectorIdentity(product);
  if (!identity) return null;
  const { namespace } = identity;

  switch (product.productType) {
    case "article":
      return {
        namespace,
        entityType: "article",
        entityId: targetId(product),
        version: product.version,
        title: product.title,
        text: articleIndexableMarkdown(articleMarkdown(product)),
      };
    case "question":
      return {
        namespace,
        entityType: "question",
        entityId: targetId(product),
        version: product.version,
        title: "Published question",
        text: `${product.prompt}\n\nOptions: ${serializeDeterministically(redactQuestionAnswerKeys(product.options))}`,
      };
    case "solution":
      return {
        namespace,
        entityType: "solution",
        entityId: targetId(product),
        version: product.version,
        title: "Published solution",
        text: product.content,
      };
    default:
      return null;
  }
}
async function insertArticle(tx: Tx, product: Extract<ProductEntity, { productType: "article" }>, originalProduct: Extract<ProductEntity, { productType: "article" }>, course: { targetId: string }, now: Date): Promise<void> {
  const exercises = flattenArticleParts(product.sections.flatMap((section) => section.blocks.flatMap((block) => block.parts ?? []))).filter((part) => part.kind === "coding_exercise");
  for (const exercise of exercises) {
    const [problem] = await tx.select({ id: codingProblems.id }).from(codingProblems).where(and(eq(codingProblems.id, exercise.problem.problemId), eq(codingProblems.version, exercise.problem.version), eq(codingProblems.courseId, course.targetId), eq(codingProblems.status, "published"))).limit(1);
    if (!problem) throw new Error("PRODUCT_CODING_PROBLEM_UNAVAILABLE");
  }
  const articleId = targetId(product);
  const chapterId = await resolveChapter(tx, product.chapterId, course.targetId);
  const [existing] = await tx.select({ id: artikel.id, mataKuliahId: artikel.mataKuliahId, babId: artikel.babId, slug: artikel.slug, title: artikel.title, contentMarkdown: artikel.contentMarkdown, structureStatus: artikel.structureStatus, version: artikel.version, status: artikel.status, sourceHash: artikel.sourceHash, generationHash: artikel.generationHash, creatorId: artikel.creatorId, curatorId: artikel.curatorId }).from(artikel).where(eq(artikel.id, articleId)).limit(1);
  const baseSlug = product.version === 1 ? product.slug : `${product.slug}-v${product.version}`;
  const [slugOwner] = await tx.select({ id: artikel.id }).from(artikel).where(eq(artikel.slug, baseSlug)).limit(1);
  const slug = slugOwner && slugOwner.id !== articleId
    ? `${baseSlug}-${createHash("sha256").update(articleId, "utf8").digest("hex")}`
    : baseSlug;
  const content = articleMarkdown(product);
  const visualMeta = product.visuals && product.visuals.length > 0
    ? `\n\n<!--__ZYX_V3_ARTICLE_VISUALS__:${Buffer.from(JSON.stringify(product.visuals)).toString("base64url")}-->`
    : "";
  const values = { id: articleId, mataKuliahId: course.targetId, babId: chapterId, slug, title: product.title, contentMarkdown: `${content}${visualMeta}`, structureStatus: product.sections.length > 0 ? "structured" as const : "legacy_unreviewed" as const, version: product.version, status: "published" as const, sourceHash: product.sourceHash, generationHash: product.generationHash, creatorId: product.creatorId, curatorId: product.curatorId ?? null, publishedAt: now, createdAt: now, updatedAt: now };
  const articleIdeaValues = product.ideaLinks.map((link) => ({ id: id("artikel-ide", `${articleId}:${link.id}`), artikelId: articleId, ideId: link.id, weight: link.weight }));

  const sectionRowId = (sectionId: string) => id("artikel-section", `${articleId}:${sectionId}`);
  const pendingSections = new Map(product.sections.map((section) => [section.id, section]));
  const insertedSections = new Set<string>();
  const orderedSections = [] as typeof product.sections;
  const allSectionValues: (typeof bagianArtikel.$inferInsert)[] = [];
  while (pendingSections.size > 0) {
    const ready = [...pendingSections.values()].filter((section) => !section.parentSectionId || insertedSections.has(section.parentSectionId));
    if (ready.length === 0) throw new Error("PRODUCT_ARTICLE_SECTION_PARENT_UNRESOLVED");
    const learningSectionIds = [...new Set(ready.flatMap((section) => section.kind === "topic" && section.learningSectionId ? [section.learningSectionId] : []))];
    const learningSections = learningSectionIds.length
      ? await tx.select({ id: bagianPembelajaran.id }).from(bagianPembelajaran).where(inArray(bagianPembelajaran.id, learningSectionIds))
      : [];
    const validLearningSectionIds = new Set(learningSections.map((section) => section.id));
    for (const section of ready) {
      if (section.kind === "topic" && section.learningSectionId && !validLearningSectionIds.has(section.learningSectionId)) throw new Error(`PRODUCT_ARTICLE_LEARNING_SECTION_NOT_FOUND:${section.learningSectionId}`);
    }
    const sectionValues: (typeof bagianArtikel.$inferInsert)[] = ready.map((section) => {
      const wordCount = section.blocks.reduce((total, block) => total + block.contentMarkdown.trim().split(/\s+/).filter(Boolean).length, 0);
      const pedagogyMeta = section.pedagogy
        ? `\n<!--__ZYX_V3_SECTION_PEDAGOGY__:${Buffer.from(JSON.stringify(section.pedagogy)).toString("base64url")}-->`
        : "";
      return {
        id: sectionRowId(section.id),
        artikelId: articleId,
        bagianPembelajaranId: section.learningSectionId ?? null,
        parentSectionId: section.parentSectionId ? sectionRowId(section.parentSectionId) : null,
        sectionKey: section.id,
        sectionKind: section.kind,
        slug: section.slug,
        title: section.title,
        learningObjective: `${section.learningObjective}${pedagogyMeta}`,
        orderIndex: section.orderIndex,
        estimatedReadingMinutes: Math.max(1, Math.ceil(wordCount / 180)),
        version: product.version,
        status: "published",
        createdAt: now,
        updatedAt: now,
      };
    });
    allSectionValues.push(...sectionValues);
    for (const section of ready) {
      pendingSections.delete(section.id);
      insertedSections.add(section.id);
      orderedSections.push(section);
    }
  }

  const blockValues: (typeof blokArtikel.$inferInsert)[] = product.blocks.map((block) => ({
    id: id("artikel-block", `${articleId}:${block.id}`),
    artikelId: articleId,
    bagianArtikelId: null,
    blockKey: block.id,
    blockType: block.blockType,
    title: null,
    orderIndex: block.orderIndex,
    content: block.content,
    version: product.version,
    generationHash: product.generationHash,
    status: "published",
    createdAt: now,
    updatedAt: now,
  }));
  const blockIdeaValues: (typeof blokArtikelIde.$inferInsert)[] = [];
  const blockSourceValues: (typeof blokArtikelSumber.$inferInsert)[] = [];
  for (const section of orderedSections) {
    for (const block of section.blocks) {
      const blockId = id("artikel-block", `${articleId}:${block.id}`);
      let blockContent = block.contentMarkdown;
      if (block.workedExamplePayload || block.formativeCheckPayload || block.visualIds?.length || block.parts) {
        const payloadMeta: Record<string, unknown> = {};
        if (block.parts) { payloadMeta.parts = block.parts; payloadMeta.schemaVersion = "article.v4"; }
        if (block.workedExamplePayload) payloadMeta.workedExamplePayload = block.workedExamplePayload;
        if (block.formativeCheckPayload) payloadMeta.formativeCheckPayload = block.formativeCheckPayload;
        if (block.visualIds?.length) payloadMeta.visualIds = block.visualIds;
        blockContent = `${block.contentMarkdown}\n\n<!--__ZYX_${block.parts ? "V4" : "V3"}_BLOCK_PAYLOAD__:${Buffer.from(JSON.stringify(payloadMeta)).toString("base64url")}-->`;
      }
      blockValues.push({
          id: blockId,
          artikelId: articleId,
          bagianArtikelId: sectionRowId(section.id),
          blockKey: block.id,
          blockType: block.blockType,
          title: block.title ?? null,
          orderIndex: block.orderIndex,
          content: blockContent,
          version: product.version,
          generationHash: product.generationHash,
          status: "published",
          createdAt: now,
          updatedAt: now,
      });
      blockIdeaValues.push(...block.ideaIds.map((ideaId) => ({ id: id("artikel-block-ide", `${blockId}:${ideaId}`), blokArtikelId: blockId, ideId: ideaId })));
      blockSourceValues.push(...block.sourceRefs.map((sourceRef) => ({
        id: id("artikel-block-source", `${blockId}:${sourceRef.sourceId}:${sourceRef.version}`),
        blokArtikelId: blockId,
        sumberMateriId: sourceRef.sourceId,
        sourceVersion: sourceRef.version,
        sourceChecksum: sourceRef.checksum,
        excerptIds: sourceRef.excerptIds,
      })));
    }
  }
  if (existing) {
    await requireMatchingPublishedProduct(tx, originalProduct);
    if (reusesRevisionProduct(product.productType, product.id, product.version)) {
      values.creatorId = existing.creatorId;
      values.curatorId = existing.curatorId;
    }
    const { publishedAt: _publishedAt, createdAt: _createdAt, updatedAt: _updatedAt, ...articleProjection } = values;
    const existingIdeas = await tx.select({ id: artikelIde.id, artikelId: artikelIde.artikelId, ideId: artikelIde.ideId, weight: artikelIde.weight }).from(artikelIde).where(eq(artikelIde.artikelId, articleId));
    const existingSections = await tx.select({ id: bagianArtikel.id, artikelId: bagianArtikel.artikelId, bagianPembelajaranId: bagianArtikel.bagianPembelajaranId, parentSectionId: bagianArtikel.parentSectionId, sectionKey: bagianArtikel.sectionKey, sectionKind: bagianArtikel.sectionKind, slug: bagianArtikel.slug, title: bagianArtikel.title, learningObjective: bagianArtikel.learningObjective, orderIndex: bagianArtikel.orderIndex, estimatedReadingMinutes: bagianArtikel.estimatedReadingMinutes, version: bagianArtikel.version, status: bagianArtikel.status }).from(bagianArtikel).where(eq(bagianArtikel.artikelId, articleId));
    const existingBlocks = await tx.select({ id: blokArtikel.id, artikelId: blokArtikel.artikelId, bagianArtikelId: blokArtikel.bagianArtikelId, blockKey: blokArtikel.blockKey, blockType: blokArtikel.blockType, title: blokArtikel.title, orderIndex: blokArtikel.orderIndex, content: blokArtikel.content, version: blokArtikel.version, generationHash: blokArtikel.generationHash, status: blokArtikel.status }).from(blokArtikel).where(eq(blokArtikel.artikelId, articleId));
    const existingBlockIdeas: { id: string; blokArtikelId: string; ideId: string }[] = [];
    const existingBlockSources: { id: string; blokArtikelId: string; sumberMateriId: string; sourceVersion: number; sourceChecksum: string; excerptIds: string[] }[] = [];
    for (const batch of chunksOf(existingBlocks.map((block) => block.id))) {
      existingBlockIdeas.push(...await tx.select({ id: blokArtikelIde.id, blokArtikelId: blokArtikelIde.blokArtikelId, ideId: blokArtikelIde.ideId }).from(blokArtikelIde).where(inArray(blokArtikelIde.blokArtikelId, batch)));
      existingBlockSources.push(...await tx.select({ id: blokArtikelSumber.id, blokArtikelId: blokArtikelSumber.blokArtikelId, sumberMateriId: blokArtikelSumber.sumberMateriId, sourceVersion: blokArtikelSumber.sourceVersion, sourceChecksum: blokArtikelSumber.sourceChecksum, excerptIds: blokArtikelSumber.excerptIds }).from(blokArtikelSumber).where(inArray(blokArtikelSumber.blokArtikelId, batch)));
    }
    const sections = allSectionValues.map(({ createdAt: _created, updatedAt: _updated, ...section }) => section);
    const blocks = blockValues.map(({ createdAt: _created, updatedAt: _updated, ...block }) => block);
    if (!equal(existing, articleProjection) || !equal(sortedById(existingIdeas), sortedById(articleIdeaValues)) || !equal(sortedById(existingSections), sortedById(sections)) || !equal(sortedById(existingBlocks), sortedById(blocks)) || !equal(sortedById(existingBlockIdeas), sortedById(blockIdeaValues)) || !equal(sortedById(existingBlockSources), sortedById(blockSourceValues))) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
    return;
  }

  await tx.insert(artikel).values(values);
  for (const batch of chunksOf(articleIdeaValues)) await tx.insert(artikelIde).values(batch);
  for (const batch of chunksOf(allSectionValues)) await tx.insert(bagianArtikel).values(batch);
  for (const batch of chunksOf(blockValues)) await tx.insert(blokArtikel).values(batch);
  for (const batch of chunksOf(blockIdeaValues)) await tx.insert(blokArtikelIde).values(batch);
  for (const batch of chunksOf(blockSourceValues)) await tx.insert(blokArtikelSumber).values(batch);
}

async function insertDiktat(tx: Tx, product: Extract<ProductEntity, { productType: "diktat" }>, originalProduct: Extract<ProductEntity, { productType: "diktat" }>, course: { targetId: string }, now: Date, fileKey: string): Promise<void> {
  const materialId = targetId(product);
  const chapterId = await resolveChapter(tx, product.chapterId, course.targetId);
  const [existing] = await tx.select({ id: diktatMateri.id, mataKuliahId: diktatMateri.mataKuliahId, babId: diktatMateri.babId, title: diktatMateri.title, contentMarkdown: diktatMateri.contentMarkdown, fileKey: diktatMateri.fileKey, version: diktatMateri.version, status: diktatMateri.status, sourceHash: diktatMateri.sourceHash, generationHash: diktatMateri.generationHash, creatorId: diktatMateri.creatorId, curatorId: diktatMateri.curatorId }).from(diktatMateri).where(eq(diktatMateri.id, materialId)).limit(1);
  const values = { id: materialId, mataKuliahId: course.targetId, babId: chapterId, title: product.title, contentMarkdown: product.contentMarkdown, fileKey, version: product.version, status: "published" as const, sourceHash: product.sourceHash, generationHash: product.generationHash, creatorId: product.creatorId, curatorId: product.curatorId ?? null, publishedAt: now, createdAt: now, updatedAt: now };
  const ideaValues = product.ideaLinks.map((link) => ({ id: id("diktat-ide", `${materialId}:${link.id}`), diktatMateriId: materialId, ideId: link.id, weight: link.weight }));
  if (existing) {
    // An existing canonical version can only be reused with the reviewed PDF.
    if (reusesRevisionProduct(product.productType, product.id, product.version)) {
      values.creatorId = existing.creatorId;
      values.curatorId = existing.curatorId;
    }
    const { fileKey: existingFileKey, ...existingProjection } = existing;
    const { fileKey: _fileKey, publishedAt: _publishedAt, createdAt: _createdAt, updatedAt: _updatedAt, ...projection } = values;
    const existingIdeas = await tx.select({ id: diktatIde.id, diktatMateriId: diktatIde.diktatMateriId, ideId: diktatIde.ideId, weight: diktatIde.weight }).from(diktatIde).where(eq(diktatIde.diktatMateriId, materialId));
    if (existingFileKey !== fileKey || !equal(existingProjection, projection) || !equal(sortedById(existingIdeas), sortedById(ideaValues))) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
    await requireMatchingPublishedProduct(tx, originalProduct);
    return;
  }
  await tx.insert(diktatMateri).values(values);
  for (const batch of chunksOf(ideaValues)) await tx.insert(diktatIde).values(batch);
}

async function insertQuestion(tx: Tx, product: Extract<ProductEntity, { productType: "question" }>, course: { targetId: string; legacyId: string }, now: Date): Promise<void> {
  const questionId = targetId(product);
  const chapterId = await resolveChapter(tx, product.chapterId, course.targetId);
  const sourceEventName = product.itbSource.eventName.trim();
  const sourceReferenceId = product.itbSource.referenceId;
  const values = { id: questionId, mataKuliahId: course.targetId, babId: chapterId, questionType: product.questionType, prompt: product.prompt, optionsSnapshot: product.options, origin: "itb_example" as const, sourceEventName, sourceReferenceId, version: product.version, status: "published" as const, difficulty: product.difficulty, cognitiveLevel: product.cognitiveLevel, reasoningPattern: product.reasoningPattern, generationHash: product.generationHash, creatorId: product.creatorId, curatorId: product.curatorId ?? null, publishedAt: now, createdAt: now, updatedAt: now };
  const [existing] = await tx.select({ id: soal.id, version: soal.version, status: soal.status, generationHash: soal.generationHash, origin: soal.origin, sourceEventName: soal.sourceEventName, sourceReferenceId: soal.sourceReferenceId }).from(soal).where(eq(soal.id, questionId)).limit(1);
  if (existing) {
    if (existing.status !== "published" || existing.version !== values.version || existing.generationHash !== values.generationHash || existing.origin !== values.origin || existing.sourceEventName !== values.sourceEventName || existing.sourceReferenceId !== values.sourceReferenceId) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
  } else await tx.insert(soal).values(values);
  for (const link of product.ideaLinks) await tx.insert(soalIde).values({ id: id("soal-ide", `${questionId}:${link.id}`), soalId: questionId, ideId: link.id, weight: link.weight, role: link.role === "required" ? "required" : link.role === "primary" ? "primary" : "supporting" }).onConflictDoNothing();
  const relations = product.ideaRelations.length > 0
    ? product.ideaRelations
    : product.relationTypes.map((relationType) => ({ ideaId: product.ideaLinks[0].id, relationType, rationale: undefined }));
  for (const relation of relations) {
    await tx.insert(soalRelasiIde).values({
      id: id("soal-relasi", `${questionId}:${relation.ideaId}:${relation.relationType}`),
      soalId: questionId,
      ideId: relation.ideaId,
      relationType: relation.relationType,
      rationale: relation.rationale ?? null,
      status: "active",
    }).onConflictDoNothing();
  }
  const referenceIds = [...new Set([sourceReferenceId, ...product.itbCuration.map((curation) => curation.referenceId)])];
  for (const referenceId of referenceIds) {
    const [reference] = await tx
      .select({ id: soalItbReferensi.id, soalId: soalItbReferensi.soalId, sourceLabel: soalItbReferensi.sourceLabel, authoringVisibility: soalItbReferensi.authoringVisibility })
      .from(soalItbReferensi)
      .where(eq(soalItbReferensi.id, referenceId))
      .limit(1);
    if (!reference) throw new Error(`PRODUCT_ITB_REFERENCE_MISSING:${referenceId}`);
    if (reference.authoringVisibility !== "allowed") throw new Error(`PRODUCT_ITB_REFERENCE_NOT_ALLOWED:${referenceId}`);
    if (referenceId !== sourceReferenceId) continue;
    if (reference.sourceLabel.trim() !== sourceEventName) throw new Error(`PRODUCT_ITB_SOURCE_LABEL_MISMATCH:${referenceId}`);
    if (reference.soalId && reference.soalId !== questionId) throw new Error(`PRODUCT_ITB_REFERENCE_ALREADY_LINKED:${referenceId}`);
    await tx.update(soalItbReferensi).set({ soalId: questionId }).where(eq(soalItbReferensi.id, referenceId));
  }

  await requireLegacyCourse(tx, course.legacyId);
  const correctIndices = product.options.flatMap((option, index) => option.isCorrect ? [index] : []);
  const compatibilityValues = {
    id: questionId,
    courseId: course.legacyId,
    origin: "itb_example" as const,
    sourceEventName,
    sourceReferenceId,
    generationHash: product.generationHash,
    status: "active",
    difficulty: product.difficulty,
    questionType: product.questionType,
    tags: ["contoh_itb"],
    prompt: product.prompt,
    options: product.options.map((option) => option.text),
    correctIndices,
    acceptableAnswers: [],
    distractorMap: [],
    explanation: "",
    reviewStatus: "published" as const,
    reasoningType: product.reasoningPattern,
    createdAt: now,
  };
  const [existingCompatibility] = await tx.select({ id: aiQuestionBank.id, status: aiQuestionBank.status, reviewStatus: aiQuestionBank.reviewStatus, generationHash: aiQuestionBank.generationHash, origin: aiQuestionBank.origin, sourceEventName: aiQuestionBank.sourceEventName, sourceReferenceId: aiQuestionBank.sourceReferenceId }).from(aiQuestionBank).where(eq(aiQuestionBank.id, questionId)).limit(1);
  if (existingCompatibility) {
    if (existingCompatibility.status !== "active" || existingCompatibility.reviewStatus !== "published" || existingCompatibility.generationHash !== compatibilityValues.generationHash || existingCompatibility.origin !== compatibilityValues.origin || existingCompatibility.sourceEventName !== compatibilityValues.sourceEventName || existingCompatibility.sourceReferenceId !== compatibilityValues.sourceReferenceId) throw new Error(`PRODUCT_BUNDLE_QUESTION_BANK_CONFLICT:${product.id}`);
  } else await tx.insert(aiQuestionBank).values(compatibilityValues);
}

async function insertFlashcardSet(tx: Tx, product: Extract<ProductEntity, { productType: "flashcard_set" }>, originalProduct: Extract<ProductEntity, { productType: "flashcard_set" }>, course: { targetId: string }, now: Date): Promise<void> {
  const setId = targetId(product);
  const chapterId = await resolveChapter(tx, product.chapterId, course.targetId);
  const values = { id: setId, mataKuliahId: course.targetId, babId: chapterId, title: product.title, version: product.version, status: "published" as const, generationHash: product.generationHash, creatorId: product.creatorId, curatorId: product.curatorId ?? null, publishedAt: now, createdAt: now, updatedAt: now };
  const [existing] = await tx.select({ id: setFlashcard.id, mataKuliahId: setFlashcard.mataKuliahId, babId: setFlashcard.babId, title: setFlashcard.title, version: setFlashcard.version, status: setFlashcard.status, generationHash: setFlashcard.generationHash, creatorId: setFlashcard.creatorId, curatorId: setFlashcard.curatorId }).from(setFlashcard).where(eq(setFlashcard.id, setId)).limit(1);
  if (existing) {
    if (reusesRevisionProduct(product.productType, product.id, product.version)) {
      values.creatorId = existing.creatorId;
      values.curatorId = existing.curatorId;
    }
    const { publishedAt: _publishedAt, createdAt: _createdAt, updatedAt: _updatedAt, ...projection } = values;
    if (!equal(existing, projection)) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
    await requireMatchingPublishedProduct(tx, originalProduct);
  } else await tx.insert(setFlashcard).values(values);
}

async function insertFlashcards(tx: Tx, products: readonly Extract<ProductEntity, { productType: "flashcard" }>[], originalProducts: readonly ProductEntity[], setProducts: readonly Extract<ProductEntity, { productType: "flashcard_set" }>[], now: Date): Promise<void> {
  const cards = products.map((product) => {
    const setProduct = product.setId ? setProducts.find((candidate) => candidate.id === product.setId) : setProducts.find((candidate) => candidate.cards.includes(product.id));
    if (!setProduct) throw new Error(`PRODUCT_BUNDLE_FLASHCARD_SET_MISSING:${product.id}`);
    return {
      product,
      values: { id: targetId(product), setFlashcardId: targetId(setProduct), front: product.front, back: product.back, explanation: product.explanation ?? null, version: product.version, status: "published" as const, generationHash: product.generationHash, createdAt: now, updatedAt: now },
    };
  });
  const existingRows = [];
  for (const batch of chunksOf(cards.map(({ values }) => values.id))) {
    existingRows.push(...await tx.select({ id: flashcard.id, setFlashcardId: flashcard.setFlashcardId, front: flashcard.front, back: flashcard.back, explanation: flashcard.explanation, version: flashcard.version, status: flashcard.status, generationHash: flashcard.generationHash }).from(flashcard).where(inArray(flashcard.id, batch)));
  }
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  const existingIdeas: { id: string; flashcardId: string; ideId: string; weight: number }[] = [];
  for (const batch of chunksOf(existingRows.map((row) => row.id))) existingIdeas.push(...await tx.select({ id: flashcardIde.id, flashcardId: flashcardIde.flashcardId, ideId: flashcardIde.ideId, weight: flashcardIde.weight }).from(flashcardIde).where(inArray(flashcardIde.flashcardId, batch)));
  const newCards: (typeof flashcard.$inferInsert)[] = [];
  const ideaValues: (typeof flashcardIde.$inferInsert)[] = [];
  for (const { product, values } of cards) {
    const ideas = product.ideaLinks.map((link) => ({ id: id("flashcard-ide", `${values.id}:${link.id}`), flashcardId: values.id, ideId: link.id, weight: link.weight }));
    const existing = existingById.get(values.id);
    if (existing) {
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...projection } = values;
      if (!equal(existing, projection) || !equal(sortedById(existingIdeas.filter((idea) => idea.flashcardId === values.id)), sortedById(ideas))) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
      const original = originalProducts.find((candidate) => candidate.productType === "flashcard" && candidate.id === product.id && candidate.version === product.version);
      if (!original) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
      await requireMatchingPublishedProduct(tx, original);
    } else {
      newCards.push(values);
      ideaValues.push(...ideas);
    }
  }
  for (const batch of chunksOf(newCards)) await tx.insert(flashcard).values(batch);
  for (const batch of chunksOf(ideaValues)) await tx.insert(flashcardIde).values(batch);
}

async function insertBlueprint(tx: Tx, product: Extract<ProductEntity, { productType: "assessment_blueprint" }>, course: { targetId: string }, now: Date): Promise<void> {
  const blueprintId = targetId(product);
  const values = { id: blueprintId, mataKuliahId: course.targetId, title: product.title, assessmentType: product.assessmentType, blueprint: { chapterIds: product.chapterIds, questionIds: product.questionIds }, version: product.version, status: "approved" as const, generationHash: product.generationHash, creatorId: product.creatorId, curatorId: product.curatorId ?? null, createdAt: now, updatedAt: now };
  const [existing] = await tx.select({ id: blueprintAsesmen.id, version: blueprintAsesmen.version, status: blueprintAsesmen.status, generationHash: blueprintAsesmen.generationHash }).from(blueprintAsesmen).where(eq(blueprintAsesmen.id, blueprintId)).limit(1);
  if (existing) {
    if (existing.status !== "approved" || existing.version !== values.version || existing.generationHash !== values.generationHash) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
  } else await tx.insert(blueprintAsesmen).values(values);
}

/** Read-only readiness probe. Publication repeats these reads under transaction locks. */
export async function assertLiveProductBundleDependencies(input: { courseId: string; products: readonly ProductEntity[]; dependencies: readonly ProductDependency[] }) {
  const course = await resolveCourse(db, input.courseId);
  await verifyTraceability(db, input.products, course.targetId);
  await verifyDependencies(db, input.dependencies, input.products, course);
}

export async function assertLiveSolutionCollectionDependencies(input: {
  product: Extract<ProductEntity, { productType: "solution_collection" }>;
  dependencies: readonly ProductDependency[];
  connection?: Tx;
}): Promise<void> {
  const connection = input.connection ?? db;
  const course = await resolveCourse(connection, input.product.courseId);
  const chapterId = await resolveChapter(connection, input.product.chapterId, course.targetId);
  const [chapter] = await connection.select({ status: bab.status, title: bab.title }).from(bab).where(eq(bab.id, chapterId!)).limit(1);
  const [currentCourse] = await connection.select({ status: mataKuliah.status, title: mataKuliah.title }).from(mataKuliah).where(eq(mataKuliah.id, course.targetId)).limit(1);
  if (chapter?.status !== "active" || currentCourse?.status !== "active") throw new Error("PRODUCT_V5_SCOPE_INACTIVE");
  if (input.product.collection.course.title !== currentCourse.title || input.product.collection.chapter.title !== chapter.title) throw new Error("PRODUCT_V5_SCOPE_TITLE_MISMATCH");
  if (input.connection) await lockCanonicalProducts(input.connection, [input.product], input.dependencies);
  await verifyTraceability(connection, [input.product], course.targetId);
  await verifyDependencies(connection, input.dependencies, [input.product], course);
}

/** The readiness probe and publication use identical receipt-bound review validation. */
export async function assertCurrentProductV4Review(input: {
  importId: string; publisherId: string; checksum: string; fingerprint: string;
  products: readonly ProductEntity[]; verification: Awaited<ReturnType<typeof getProductV4VerificationReadiness>>;
  connection?: Tx;
}): Promise<void> {
  const connection = input.connection ?? db;
  const article = input.products.find(product => product.productType === "article");
  const [approval] = await connection.select({ rubric: reviewPedagogiBundle.rubric }).from(reviewPedagogiBundle).where(and(
    eq(reviewPedagogiBundle.imporBundleId, input.importId), eq(reviewPedagogiBundle.reviewerId, input.publisherId),
    eq(reviewPedagogiBundle.contentFingerprint, input.fingerprint), eq(reviewPedagogiBundle.policyVersion, QUALITY_POLICY_VERSION), eq(reviewPedagogiBundle.status, "approved"),
  )).limit(1);
  if (!article || article.productType !== "article" || !approval || !input.verification) throw new Error("PRODUCT_V4_REVIEW_REQUIRED");
  const recorded = z.object({ ...productV4ReviewContextShape, criteria: z.array(pedagogicRubricItemSchema) }).parse(approval.rubric);
  validateProductV4ReviewContext({ article, importId: input.importId, checksum: input.checksum, fingerprint: input.fingerprint,
    review: { ...recorded, decision: "approved", expectedRevision: input.checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: input.fingerprint },
    verification: { ready: input.verification.evaluation.ready, planHash: input.verification.plan.planHash, importId: input.importId, receiptSignature: (input.verification.receipt as { signature?: string } | null)?.signature ?? "" },
  });
}

/**
 * Publishes a staged Product Bundle, inserting all validated product entities,
 * verifying traceability to published Ideas, and enqueueing vector sync jobs.
 */
export async function publishProductBundle(input: { importId: string; publishedBy: string; expectedRevision: string; solutionScope?: SolutionImportScope; testFailureAfter?: FailureStage }): Promise<{ publicationId: string; importId: string; published: boolean; productCount: number; vectorJobCount: number }> {
  enabled();
  await assertAuthoringActor(revisionPublicationConnection(), input.publishedBy, { roles: ["admin"], error: "PRODUCT_BUNDLE_PUBLISH_FORBIDDEN", requireLegacyAdmin: true });
  const snapshot = await getProductBundleImport(input.importId);
  if (!snapshot) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  if (!/^[a-f0-9]{64}$/.test(input.expectedRevision ?? "") || input.expectedRevision !== snapshot.checksum) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  if (input.solutionScope) assertSolutionImportScope(snapshot, null, input.solutionScope);
  if (snapshot.status === "published") {
    return revisionPublicationTransaction(async tx => {
      await assertAuthoringActor(tx, input.publishedBy, { roles: ["admin"], error: "PRODUCT_BUNDLE_PUBLISH_FORBIDDEN", lock: true, requireLegacyAdmin: true });
      if (input.solutionScope) {
        const locked = await lockSolutionImportScope(tx, input.importId, input.solutionScope);
        if (locked.status !== "published") throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
      }
      const [publication] = await tx.select({ id: publikasiBundle.id }).from(publikasiBundle).where(and(eq(publikasiBundle.imporBundleId, input.importId), eq(publikasiBundle.status, "published"))).limit(1);
      if (!publication) throw new Error("PRODUCT_BUNDLE_PUBLISHED_RECORD_MISSING");
      return { publicationId: publication.id, importId: input.importId, published: false, productCount: 0, vectorJobCount: 0 };
    });
  }
  if (snapshot.status !== "draft") throw new Error("PRODUCT_BUNDLE_DRAFT_REQUIRED");
  const bundle = await parseStagedProductBundle(input.importId);
  if (bundle.checksum !== snapshot.checksum || bundle.manifest.bundleId !== snapshot.bundleId) throw new Error("PRODUCT_BUNDLE_PUBLICATION_CONFLICT");
  if (input.solutionScope) assertSolutionImportScope(snapshot, bundle, input.solutionScope);
  const documents = productInteractiveDocuments(bundle.products);
  if (documents.length) {
    const { readInteractiveDocumentAsset } = await import("@/lib/materials/interactive-document-assets");
    for (const spec of documents) {
      await readInteractiveDocumentAsset(spec, "document");
      await readInteractiveDocumentAsset(spec, "print");
    }
  }
  const isV4 = bundle.manifest.schemaVersion === "product-bundle.v4";
  const isV5 = bundle.manifest.schemaVersion === "product-bundle.v5";
  if (hasProductBundleDependencyBlock(bundle)) throw new Error("PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW");
  let v4Verification: Awaited<ReturnType<typeof getProductV4VerificationReadiness>> | undefined;
  if (isV4) {
    const ref = snapshot.validationReport.productV4Verification as { runId?: unknown; planHash?: unknown } | undefined;
    if (typeof ref?.runId !== "string" || typeof ref.planHash !== "string") throw new Error("PRODUCT_V4_VERIFICATION_REQUIRED");
    v4Verification = (revisionPublicationVerification(input.importId) as typeof v4Verification) ?? await (await import("./product-v4-verification-service")).getProductV4VerificationReadiness(input.importId, ref.runId);
    if (!v4Verification.evaluation.ready || v4Verification.plan.planHash !== ref.planHash) throw new Error("PRODUCT_V4_VERIFICATION_REQUIRED");
  }
  let courseLegacyId: string | undefined;
  const result = await revisionPublicationTransaction(async (tx) => {
    await assertAuthoringActor(tx, input.publishedBy, { roles: ["admin"], error: "PRODUCT_BUNDLE_PUBLISH_FORBIDDEN", lock: true, requireLegacyAdmin: true });
    if (input.solutionScope) await lockSolutionImportScope(tx, input.importId, input.solutionScope);
    const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, input.importId)).limit(1);
    if (!row || row.bundleType !== "product") throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
    if (row.checksum !== snapshot.checksum || row.sourceUriOrKey !== snapshot.sourceUriOrKey || deterministicProductSerialization(row.validationReport) !== deterministicProductSerialization(snapshot.validationReport)) throw new Error("PRODUCT_BUNDLE_PUBLICATION_CONFLICT");
    if (row.status === "published") {
      const [publication] = await tx.select({ id: publikasiBundle.id }).from(publikasiBundle).where(and(eq(publikasiBundle.imporBundleId, input.importId), eq(publikasiBundle.status, "published"))).limit(1);
      if (!publication) throw new Error("PRODUCT_BUNDLE_PUBLISHED_RECORD_MISSING");
      return { publicationId: publication.id, importId: input.importId, published: false, productCount: 0, vectorJobCount: 0 };
    }
    if (row.status !== "draft") throw new Error("PRODUCT_BUNDLE_DRAFT_REQUIRED");
    await claimProductReviewSnapshot(tx, row, new Date());
    if (!isV4 && !isV5 && (await listProcessingLegacyPdfRequests({ importId: input.importId, expectedRevision: row.checksum, connection: tx })).length) throw new Error("PRODUCT_BUNDLE_PUBLICATION_BLOCKED:PDF_REQUEST_PROCESSING");
    // Keep the same claimed evidence snapshot for both quality evaluation and insertion.
    const pdfEvidenceRows = await tx.select().from(buktiPdfBundle).where(eq(buktiPdfBundle.imporBundleId, input.importId)) as unknown as PdfArtifactEvidence[];
    await lockCanonicalProducts(tx, bundle.products, bundle.dependencies);
    await requireIdentity(tx, input.publishedBy, "PRODUCT_BUNDLE_PUBLISHER_NOT_FOUND");
    const [review] = await tx.select({ id: reviewBundle.id, reviewerId: reviewBundle.reviewerId, status: reviewBundle.status, notes: reviewBundle.notes }).from(reviewBundle).where(and(eq(reviewBundle.imporBundleId, input.importId), eq(reviewBundle.reviewerId, input.publishedBy), eq(reviewBundle.status, "approved"))).limit(1);
    const usesPedagogicApproval = bundle.products.some((p) => p.productType === "article");
    if (!review) throw new Error("PRODUCT_BUNDLE_ADMIN_APPROVAL_REQUIRED");
    if (isV5) {
      const product = bundle.products[0];
      if (!review || product?.productType !== "solution_collection") throw new Error("PRODUCT_V5_REVIEW_REQUIRED");
      assertStoredSolutionReview({ product, revision: row.checksum, notes: review.notes });
    }

    if (usesPedagogicApproval) {
      const requiredSections = bundle.products.flatMap((product) => product.productType === "article" ? product.sections.map((section) => ({ productId: product.id, sectionId: section.id })) : []);
      if (requiredSections.length > 0) {
        const sectionReviews = await tx.select({ productId: reviewItemBundle.productId, reviewerId: reviewItemBundle.reviewerId, targetType: reviewItemBundle.targetType, targetId: reviewItemBundle.targetId, status: reviewItemBundle.status }).from(reviewItemBundle).where(and(
          eq(reviewItemBundle.imporBundleId, input.importId),
          eq(reviewItemBundle.reviewerId, input.publishedBy),
          eq(reviewItemBundle.targetType, "article_section"),
        ));
        assertProductSectionReviews({ requiredSections, reviewerId: input.publishedBy, reviews: sectionReviews });
      }

      const qualityEvaluation = await evaluateProductBundleQualityPolicy(
        {
          products: bundle.products,
          dependencies: bundle.dependencies,
          manifest: bundle.manifest,
        },
        {
          imporBundleId: input.importId,
          publisherId: input.publishedBy,
          tx,
          pdfEvidence: pdfEvidenceRows,
          v4Verification,
        },
      );

      if (!qualityEvaluation.publicationReady) {
        const blocking = qualityEvaluation.issues.find((i) => i.severity === "blocking");
        throw new Error(`PRODUCT_BUNDLE_PUBLICATION_BLOCKED:${blocking ? blocking.code : "QUALITY_POLICY_FAILED"}`);
      }
      if (isV4) {
        if (!v4Verification) throw new Error("PRODUCT_V4_REVIEW_REQUIRED");
        await assertCurrentProductV4Review({ importId: input.importId, publisherId: input.publishedBy, checksum: row.checksum, fingerprint: qualityEvaluation.contentFingerprint, products: bundle.products, verification: v4Verification, connection: tx });
      }
    }
    const course = await resolveCourse(tx, bundle.manifest.courseId);
    courseLegacyId = course.legacyId;
    const now = new Date();
    const attribution = { uploaderId: row.requestedBy, approvingReviewerId: review.reviewerId };
    const manifestCreatorId = resolveBundleIdentity(bundle.manifest.creatorId, attribution);
    await requireIdentity(tx, manifestCreatorId, "PRODUCT_BUNDLE_CREATOR_NOT_FOUND");
    if (bundle.manifest.curatorId) {
      const manifestCuratorId = resolveBundleIdentity(bundle.manifest.curatorId, attribution);
      await requireIdentity(tx, manifestCuratorId, "PRODUCT_BUNDLE_CURATOR_NOT_FOUND");
    }
    const products = bundle.products.map((product) => ({
      ...product,
      creatorId: resolveBundleIdentity(product.creatorId, attribution),
      curatorId: product.curatorId ? resolveBundleIdentity(product.curatorId, attribution) : undefined,
    })) as readonly ProductEntity[];
    for (const product of products) {
      await requireIdentity(tx, product.creatorId, "PRODUCT_BUNDLE_CREATOR_NOT_FOUND");
      if (product.curatorId) await requireIdentity(tx, product.curatorId, "PRODUCT_BUNDLE_CURATOR_NOT_FOUND");
      if (product.productType === "diktat" && product.sourceArticleId && product.sourceArticleVersion !== undefined && product.sourceArticleHash) {
        const lineageDependency = bundle.dependencies.find((dependency) =>
          dependency.upstreamEntityType === "product" &&
          dependency.upstreamEntityId === product.sourceArticleId &&
          dependency.upstreamVersion === product.sourceArticleVersion &&
          dependency.upstreamHash === product.sourceArticleHash &&
          dependency.downstreamEntityType === "diktat" &&
          dependency.downstreamEntityId === product.id &&
          dependency.downstreamVersion === product.version &&
          dependency.downstreamHash === product.generationHash,
        );
        if (!lineageDependency) throw new Error(`PRODUCT_DIKTAT_LINEAGE_DEPENDENCY_MISSING:${product.id}`);
      }
    }
    if (isV5) {
      const collection = products[0];
      if (collection?.productType !== "solution_collection") throw new Error("PRODUCT_V5_PROFILE_REQUIRED");
      const chapterId = await resolveChapter(tx, collection.chapterId, course.targetId);
      const [chapter] = await tx.select({ status: bab.status, title: bab.title }).from(bab).where(eq(bab.id, chapterId!)).limit(1).for("share");
      const [currentCourse] = await tx.select({ status: mataKuliah.status, title: mataKuliah.title }).from(mataKuliah).where(eq(mataKuliah.id, course.targetId)).limit(1).for("share");
      if (chapter?.status !== "active" || currentCourse?.status !== "active") throw new Error("PRODUCT_V5_SCOPE_INACTIVE");
      if (collection.collection.course.title !== currentCourse.title || collection.collection.chapter.title !== chapter.title) throw new Error("PRODUCT_V5_SCOPE_TITLE_MISMATCH");
      for (const batch of chunksOf(collection.ideaLinks.map(link => link.id).sort())) await tx.select({ id: ide.id }).from(ide).where(inArray(ide.id, batch)).for("share");
      for (const batch of chunksOf(collection.sourceRefs.map(ref => ref.sourceId).sort())) await tx.select({ id: sumberMateri.id }).from(sumberMateri).where(inArray(sumberMateri.id, batch)).for("share");
      for (const batch of chunksOf(collection.sourceRefs.flatMap(ref => ref.excerptIds).sort())) await tx.select({ id: potonganSumber.id }).from(potonganSumber).where(inArray(potonganSumber.id, batch)).for("share");
    }
    await verifyTraceability(tx, products, course.targetId);
    await verifyDependencies(tx, bundle.dependencies, products, course);
    const setProducts = products.filter((product): product is Extract<ProductEntity, { productType: "flashcard_set" }> => product.productType === "flashcard_set");
    const flashcardProducts = products.filter((product): product is Extract<ProductEntity, { productType: "flashcard" }> => product.productType === "flashcard");
    const ordered = [...products].sort((left, right) => ["flashcard_set", "question", "article", "diktat", "flashcard", "solution", "assessment_blueprint"].indexOf(left.productType) - ["flashcard_set", "question", "article", "diktat", "flashcard", "solution", "assessment_blueprint"].indexOf(right.productType));
    let flashcardsInserted = false;
    for (const product of ordered) {
      switch (product.productType) {
        case "solution_collection": {
          const chapterId = await resolveChapter(tx, product.chapterId, course.targetId);
          if (!chapterId) throw new Error("PRODUCT_V5_CHAPTER_REQUIRED");
          await tx.insert(solutionCollections).values({ id: targetId(product), productId: product.id, version: product.version, courseId: course.targetId, chapterId, importId: input.importId, title: product.title, content: product.collection, trace: { ideaLinks: product.ideaLinks, sourceRefs: product.sourceRefs, sourceHash: product.sourceHash, dependencies: bundle.dependencies, creatorId: product.creatorId, curatorId: product.curatorId ?? null, bundleChecksum: bundle.checksum }, generationHash: product.generationHash, status: "published", publishedAt: now, updatedAt: now });
          break;
        }
        case "flashcard_set": {
          const original = bundle.products.find((candidate) => candidate.productType === "flashcard_set" && candidate.id === product.id && candidate.version === product.version);
          if (!original || original.productType !== "flashcard_set") throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
          await insertFlashcardSet(tx, product, original, course, now);
          break;
        }
        case "question": await insertQuestion(tx, product, course, now); break;
        case "article": {
          const original = bundle.products.find((candidate) => candidate.productType === "article" && candidate.id === product.id && candidate.version === product.version);
          if (!original || original.productType !== "article") throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
          await insertArticle(tx, product, original, course, now);
          break;
        }
        case "diktat": {
          const sourceArticle = bundle.products.find(candidate => candidate.productType === "article" && candidate.id === product.sourceArticleId);
          if (!sourceArticle || sourceArticle.productType !== "article") throw new Error(`PRODUCT_DIKTAT_PDF_NOT_READY:${product.id}`);
          const pdfGate = evaluateProductBundleReviewAndPdfGate({
            imporBundleId: input.importId, hasArticle: true, articleId: sourceArticle.id, diktatId: product.id,
            contentFingerprint: "", articleVersion: sourceArticle.version, articleGenerationHash: sourceArticle.generationHash,
            diktatGenerationHash: product.generationHash, pdfEvidenceRows,
            v4PdfBinding: isV4 ? resolveProductV4PdfBinding({ importId: input.importId, diktatId: product.id, validationReport: row.validationReport, verification: v4Verification }) : undefined,
          });
          const pdfEvidence = pdfGate.selectedPdfEvidence;
          if (!pdfEvidence?.storageKey) throw new Error(`PRODUCT_DIKTAT_PDF_NOT_READY:${product.id}`);
          const original = bundle.products.find((candidate) => candidate.productType === "diktat" && candidate.id === product.id && candidate.version === product.version);
          if (!original || original.productType !== "diktat") throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
          await insertDiktat(tx, product, original, course, now, pdfEvidence.storageKey);
          break;
        }
        case "flashcard":
          if (!flashcardsInserted) {
            await insertFlashcards(tx, flashcardProducts, bundle.products, setProducts, now);
            flashcardsInserted = true;
          }
          break;
        case "solution": {
          const solutionId = targetId(product);
          const question = products.find((candidate) => candidate.productType === "question" && candidate.id === product.questionId);
          const questionId = question ? targetId(question) : product.questionId;
          const [existingQuestion] = await tx.select({ id: soal.id }).from(soal).where(eq(soal.id, questionId)).limit(1);
          if (!existingQuestion) throw new Error(`PRODUCT_BUNDLE_SOLUTION_QUESTION_MISSING:${product.id}`);
          const solutionValues = { id: solutionId, soalId: questionId, version: product.version, content: product.content, status: "published" as const, generationHash: product.generationHash, creatorId: product.creatorId, curatorId: product.curatorId ?? null };
          const [existingSolution] = await tx.select({ id: pembahasanSoal.id, soalId: pembahasanSoal.soalId, version: pembahasanSoal.version, content: pembahasanSoal.content, status: pembahasanSoal.status, generationHash: pembahasanSoal.generationHash, creatorId: pembahasanSoal.creatorId, curatorId: pembahasanSoal.curatorId }).from(pembahasanSoal).where(eq(pembahasanSoal.id, solutionId)).limit(1);
          if (existingSolution) {
            if (!equal(existingSolution, solutionValues)) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
          } else await tx.insert(pembahasanSoal).values({ ...solutionValues, publishedAt: now, createdAt: now, updatedAt: now });
          await tx.update(aiQuestionBank).set({ explanation: product.content }).where(eq(aiQuestionBank.id, questionId));
          break;
        }
        case "assessment_blueprint": await insertBlueprint(tx, product, course, now); break;
      }
      maybeFail(input.testFailureAfter, product.productType);
    }
    const dependencyCandidates = bundle.dependencies.map((dependency) => ({ id: id("canonical-dependency", serializeDeterministically([dependency.upstreamEntityType, dependency.upstreamEntityId, dependency.upstreamVersion, dependency.downstreamEntityType, dependency.downstreamEntityId, dependency.downstreamVersion])), upstreamEntityType: dependency.upstreamEntityType, upstreamEntityId: dependency.upstreamEntityId, upstreamVersion: dependency.upstreamVersion, upstreamHash: dependency.upstreamHash, downstreamEntityType: dependency.downstreamEntityType, downstreamEntityId: dependency.downstreamEntityId, downstreamVersion: dependency.downstreamVersion, downstreamHash: dependency.downstreamHash, freshness: dependency.freshness, reason: null, createdAt: now, updatedAt: now }));
    const dependencyProjection = ({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...value }: typeof ketergantunganProduk.$inferSelect) => value;
    const uniqueDependencies = new Map<string, typeof dependencyCandidates[number]>();
    for (const dependency of dependencyCandidates) {
      const previous = uniqueDependencies.get(dependency.id);
      if (previous && !equal(dependencyProjection(previous), dependencyProjection(dependency))) throw new Error(`PRODUCT_BUNDLE_DEPENDENCY_VERSION_CONFLICT:${dependency.downstreamEntityId}`);
      uniqueDependencies.set(dependency.id, dependency);
    }
    const dependencyValues = [...uniqueDependencies.values()];
    for (const product of bundle.products) {
      const expected = dependencyValues.filter(value=>value.downstreamEntityType === product.productType && value.downstreamEntityId === product.id && value.downstreamVersion === product.version);
      const existing = await tx.select().from(ketergantunganProduk).where(and(eq(ketergantunganProduk.downstreamEntityType, product.productType),eq(ketergantunganProduk.downstreamEntityId, product.id),eq(ketergantunganProduk.downstreamVersion, product.version))).for("share");
      const comparable = (values: typeof existing) => values.map(dependencyProjection).map(value=>serializeDeterministically(value)).sort();
      if (existing.length && !equal(comparable(existing),comparable(expected))) throw new Error(`PRODUCT_BUNDLE_DEPENDENCY_VERSION_CONFLICT:${product.id}`);
      if (!existing.length && expected.length) for (const batch of chunksOf(expected)) await tx.insert(ketergantunganProduk).values(batch);
    }
    const vectorChapters = new Map<string, string | null>();
    for (const product of products) if (product.chapterId && !vectorChapters.has(product.chapterId)) vectorChapters.set(product.chapterId, await resolveChapter(tx, product.chapterId, course.targetId));
    const vectorJobs = products.flatMap((product) => {
      const spec = canonicalProductVectorSpec(product);
      if (!spec) return [];
      return [{
        id: id("vector-product", `${input.importId}:${product.id}:${product.version}`),
        courseId: course.legacyId,
        koId: null,
        action: "upsert" as const,
        namespace: spec.namespace,
        payload: {
          canonicalCourseId: course.targetId,
          entityType: spec.entityType,
          entityId: spec.entityId,
          version: spec.version,
          text: spec.text,
          title: spec.title,
          metadata: {
            entityId: spec.entityId,
            version: spec.version,
            status: "published",
            ...(product.chapterId && vectorChapters.get(product.chapterId) ? { chapterId: vectorChapters.get(product.chapterId)! } : {}),
          },
        },
      }];
    });
    maybeFail(input.testFailureAfter, "outbox");
    let insertedVectorJobCount = 0;
    for (const batch of chunksOf(vectorJobs)) insertedVectorJobCount += (await tx.insert(vectorSyncQueue).values(batch).onConflictDoNothing().returning({ id: vectorSyncQueue.id })).length;
    const publicationId = id("publikasi-product", input.importId);
    const publicationHash = createHash("sha256").update(serializeDeterministically({ bundleChecksum: bundle.manifest.bundleChecksum, productIds: bundle.products.map((product) => `${product.id}:${product.version}`).sort() }), "utf8").digest("hex");
    await tx.insert(publikasiBundle).values({ id: publicationId, imporBundleId: input.importId, approvedReviewId: review.id, version: 1, publicationHash, status: "published", publishedBy: input.publishedBy, publishedAt: now, createdAt: now });
    await tx.update(itemImporBundle).set({ status: "published" }).where(eq(itemImporBundle.imporBundleId, input.importId));
    const publishedRows = await tx.update(imporBundle).set({ status: "published", updatedAt: now }).where(and(eq(imporBundle.id, input.importId), eq(imporBundle.status, "draft"), eq(imporBundle.checksum, snapshot.checksum), eq(imporBundle.sourceUriOrKey, snapshot.sourceUriOrKey), eq(imporBundle.validationReport, row.validationReport))).returning({ id: imporBundle.id });
    if (publishedRows.length !== 1) throw new Error("PRODUCT_BUNDLE_PUBLICATION_CONFLICT");
    const itbSources = bundle.products.flatMap((product) => product.productType === "question" ? [{ questionId: product.id, referenceId: product.itbSource.referenceId, eventName: product.itbSource.eventName }] : []);
    const itbCuration = bundle.products.flatMap((product) => product.productType === "question" ? product.itbCuration.map((curation) => ({ questionId: product.id, referenceId: curation.referenceId, dimensions: curation.dimensions })) : []);
    await tx.insert(auditMutasi).values({ id: id("audit-product", `${input.importId}:published`), actorId: input.publishedBy, entityType: "product_bundle", entityId: input.importId, action: "published", beforeSnapshot: { status: "draft" }, afterSnapshot: { status: "published", productCount: bundle.products.length, vectorJobCount: insertedVectorJobCount, publicationHash, itbSources, itbCuration }, correlationId: input.importId });
    return { publicationId, importId: input.importId, published: true, productCount: bundle.products.length, vectorJobCount: insertedVectorJobCount };
  });
  if (courseLegacyId && !isV5) {
    dispatchRevisionPublication(courseLegacyId);
  }
  return result;
}

export async function withdrawProductBundle(input: { importId: string; withdrawnBy: string; expectedRevision: string; expectedCourseId?: string }): Promise<{ importId: string; withdrawn: boolean; productCount: number; vectorJobCount: number }> {
  enabled();
  await assertAuthoringActor(revisionPublicationConnection(), input.withdrawnBy, { roles: ["admin"], error: "PRODUCT_BUNDLE_WITHDRAW_FORBIDDEN", requireLegacyAdmin: true });
  const [withdrawer] = await revisionPublicationConnection().select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, input.withdrawnBy)).limit(1);
  if (!withdrawer) throw new Error(`PRODUCT_BUNDLE_WITHDRAWER_NOT_FOUND:${input.withdrawnBy}`);

  const snapshot = await getProductBundleImport(input.importId);
  if (!snapshot) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  if (!/^[a-f0-9]{64}$/.test(input.expectedRevision ?? "") || snapshot.checksum !== input.expectedRevision || (input.expectedCourseId !== undefined && input.expectedCourseId !== snapshot.courseId)) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  if (productBundleLifecycleStatus(snapshot.status) === "withdrawn") {
    await revisionPublicationTransaction(async tx => {
      await assertAuthoringActor(tx, input.withdrawnBy, { roles: ["admin"], error: "PRODUCT_BUNDLE_WITHDRAW_FORBIDDEN", lock: true, requireLegacyAdmin: true });
      const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, input.importId)).limit(1).for("update");
      if (!row || row.status !== snapshot.status || row.checksum !== input.expectedRevision || row.courseId !== snapshot.courseId || row.sourceUriOrKey !== snapshot.sourceUriOrKey) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
    });
    const bundle = await parseStagedProductBundle(input.importId);
    const course = await resolveCourse(revisionPublicationConnection(), bundle.manifest.courseId);
    if (course.legacyId && bundle.manifest.schemaVersion !== "product-bundle.v5") {
      await dispatchRevisionPublication(course.legacyId);
    }
    return { importId: input.importId, withdrawn: false, productCount: 0, vectorJobCount: 0 };
  }
  if (productBundleLifecycleStatus(snapshot.status) !== "published") throw new Error("PRODUCT_BUNDLE_PUBLISHED_REQUIRED");
  const bundle = await parseStagedProductBundle(input.importId);
  if (bundle.checksum !== input.expectedRevision || bundle.manifest.bundleId !== snapshot.bundleId) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");

  let courseLegacyId: string | undefined;
  const result = await revisionPublicationTransaction(async (tx) => {
    await assertAuthoringActor(tx, input.withdrawnBy, { roles: ["admin"], error: "PRODUCT_BUNDLE_WITHDRAW_FORBIDDEN", lock: true, requireLegacyAdmin: true });
    const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, input.importId)).limit(1).for("update");
    if (!row || row.bundleType !== "product") throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
    if (row.checksum !== input.expectedRevision || row.sourceUriOrKey !== snapshot.sourceUriOrKey || row.courseId !== snapshot.courseId || row.bundleId !== snapshot.bundleId || row.version !== snapshot.version || deterministicProductSerialization(row.validationReport) !== deterministicProductSerialization(snapshot.validationReport)) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
    if (productBundleLifecycleStatus(row.status) === "withdrawn") return { importId: input.importId, withdrawn: false, productCount: 0, vectorJobCount: 0 };
    if (productBundleLifecycleStatus(row.status) !== "published") throw new Error("PRODUCT_BUNDLE_PUBLISHED_REQUIRED");
    await lockCanonicalProducts(tx, bundle.products);
    await requireIdentity(tx, input.withdrawnBy, "PRODUCT_BUNDLE_WITHDRAWER_NOT_FOUND");
    const course = await resolveCourse(tx, bundle.manifest.courseId);
    courseLegacyId = course.legacyId;
    const now = new Date();
    const productIds = bundle.products.map(targetId);
    const ownedElsewhere = await productsOwnedByOtherPublishedImports(tx, input.importId, bundle.products);
    const retiringProducts = bundle.products.filter((product) => !ownedElsewhere.has(productOwnershipKey(product)));
    for (const product of retiringProducts) await tx.delete(ketergantunganProduk).where(and(eq(ketergantunganProduk.downstreamEntityType, product.productType),eq(ketergantunganProduk.downstreamEntityId, product.id),eq(ketergantunganProduk.downstreamVersion, product.version)));
    const byType = <T extends ProductEntity["productType"]>(type: T) => retiringProducts.filter((product): product is Extract<ProductEntity, { productType: T }> => product.productType === type).map(targetId);
    const articleIds = byType("article");
    const diktatIds = byType("diktat");
    const questionIds = byType("question");
    const solutionIds = byType("solution");
    const setIds = byType("flashcard_set");
    const cardIds = byType("flashcard");
    const blueprintIds = byType("assessment_blueprint");
    const collectionIds = bundle.products.filter((product) => product.productType === "solution_collection").map(targetId);

    if (articleIds.length > 0) {
      await tx.update(artikel).set({ status: "withdrawn", updatedAt: now }).where(inArray(artikel.id, articleIds));
      await tx.update(blokArtikel).set({ status: "withdrawn", updatedAt: now }).where(inArray(blokArtikel.artikelId, articleIds));
    }
    if (diktatIds.length > 0) await tx.update(diktatMateri).set({ status: "withdrawn", updatedAt: now }).where(inArray(diktatMateri.id, diktatIds));
    if (questionIds.length > 0) {
      await tx.update(soal).set({ status: "retired", updatedAt: now }).where(inArray(soal.id, questionIds));
      await tx.update(soalRelasiIde).set({ status: "withdrawn" }).where(inArray(soalRelasiIde.soalId, questionIds));
      await tx.update(aiQuestionBank).set({ status: "retired", reviewStatus: "retired" }).where(inArray(aiQuestionBank.id, questionIds));
    }
    if (solutionIds.length > 0) await tx.update(pembahasanSoal).set({ status: "retired", updatedAt: now }).where(inArray(pembahasanSoal.id, solutionIds));
    if (setIds.length > 0) await tx.update(setFlashcard).set({ status: "retired", updatedAt: now }).where(inArray(setFlashcard.id, setIds));
    if (cardIds.length > 0) await tx.update(flashcard).set({ status: "retired", updatedAt: now }).where(inArray(flashcard.id, cardIds));
    if (blueprintIds.length > 0) await tx.update(blueprintAsesmen).set({ status: "retired", updatedAt: now }).where(inArray(blueprintAsesmen.id, blueprintIds));
    if (collectionIds.length > 0) {
      const withdrawn = await tx.update(solutionCollections).set({ status: "withdrawn", updatedAt: now }).where(and(eq(solutionCollections.importId, input.importId), inArray(solutionCollections.status, inRevisionPublication() ? ["published", "withdrawn"] : ["published"]), inArray(solutionCollections.id, collectionIds))).returning({ id: solutionCollections.id });
      if (withdrawn.length !== collectionIds.length) throw new Error("PRODUCT_V5_PUBLICATION_MISSING");
    }

    const vectorJobs = retiringProducts.flatMap((product) => {
      const spec = canonicalProductVectorIdentity(product);
      if (!spec) return [];
      return [{
        id: id("vector-product-withdraw", `${input.importId}:${spec.entityId}:${spec.version}`),
        courseId: course.legacyId,
        koId: null,
        action: "delete" as const,
        namespace: spec.namespace,
        payload: { entityType: spec.entityType, entityId: spec.entityId, version: spec.version, metadata: { entityId: spec.entityId, version: spec.version } },
      }];
    });
    for (const job of vectorJobs) await tx.insert(vectorSyncQueue).values(job).onConflictDoNothing();
    await tx.update(publikasiBundle).set({ status: "withdrawn" }).where(and(eq(publikasiBundle.imporBundleId, input.importId), eq(publikasiBundle.status, "published")));
    await tx.update(itemImporBundle).set({ status: "withdrawn" }).where(eq(itemImporBundle.imporBundleId, input.importId));
    const withdrawnRows = await tx.update(imporBundle).set({ status: "withdrawn", updatedAt: now }).where(and(eq(imporBundle.id, input.importId), eq(imporBundle.status, "published"), eq(imporBundle.checksum, snapshot.checksum))).returning({ id: imporBundle.id });
    if (withdrawnRows.length !== 1) throw new Error("PRODUCT_BUNDLE_PUBLICATION_CONFLICT");
    await tx.insert(auditMutasi).values({ id: id("audit-product", `${input.importId}:withdrawn`), actorId: input.withdrawnBy, entityType: "product_bundle", entityId: input.importId, action: "withdrawn", beforeSnapshot: { status: "published" }, afterSnapshot: { status: "withdrawn", productCount: productIds.length, vectorJobCount: vectorJobs.length }, correlationId: input.importId });
    return { importId: input.importId, withdrawn: true, productCount: productIds.length, vectorJobCount: vectorJobs.length };
  });
  if (courseLegacyId && bundle.manifest.schemaVersion !== "product-bundle.v5") {
    await dispatchRevisionPublication(courseLegacyId);
  }
  return result;
}

export async function reconcileProductBundle(importId: string) {
  const row = await getProductBundleImport(importId);
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  const audits = await db.select({ id: auditMutasi.id }).from(auditMutasi).where(and(eq(auditMutasi.entityType, "product_bundle"), eq(auditMutasi.entityId, importId)));
  const publication = await db.select({ id: publikasiBundle.id, status: publikasiBundle.status }).from(publikasiBundle).where(eq(publikasiBundle.imporBundleId, importId));
  return { importId, status: row.status, itemCount: row.items.length, publishedItems: row.items.filter((item) => item.status === "published").length, auditCount: audits.length, publicationStatus: publication[0]?.status ?? null };
}
