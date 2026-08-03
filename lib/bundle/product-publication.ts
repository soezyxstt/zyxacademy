import { createHash } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  artikel,
  artikelIde,
  auditMutasi,
  bab,
  blueprintAsesmen,
  blokArtikel,
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
  setFlashcard,
  soal,
  soalIde,
  soalRelasiIde,
  sumberMateri,
  potonganSumber,
  user,
  pengguna,
  vectorSyncQueue,
} from "@/db/schema";
import { serializeDeterministically } from "@/lib/bundle/idea-bundle-v2";
import { parseStagedProductBundle, getProductBundleImport } from "./product-staging";
import type { ProductDependency, ProductEntity } from "./product-validator";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type FailureStage = ProductEntity["productType"] | "outbox";

function enabled(): void {
  if (process.env.FEATURE_PRODUCT_BUNDLE_V2 !== "1") throw new Error("PRODUCT_BUNDLE_V2_DISABLED");
}

function id(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(`${prefix}:${value}`, "utf8").digest("hex").slice(0, 32)}`;
}

function targetId(product: ProductEntity): string {
  return product.version === 1 ? product.id : `${product.id}:v${product.version}`;
}

function maybeFail(stage: FailureStage | undefined, expected: FailureStage): void {
  if (stage !== expected || (process.env.NODE_ENV !== "test" && process.env.STAGING_PRODUCT_FAILURE_TEST !== "1")) return;
  throw new Error(`PRODUCT_BUNDLE_TEST_FAILURE:${expected}`);
}

function equal(value: unknown, expected: unknown): boolean {
  return serializeDeterministically(value) === serializeDeterministically(expected);
}

async function requireIdentity(tx: Tx, identityId: string, code: string): Promise<void> {
  const [row] = await tx.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, identityId)).limit(1);
  if (!row) throw new Error(`${code}:${identityId}`);
}

async function resolveCourse(tx: Tx, courseId: string): Promise<{ targetId: string; legacyId: string }> {
  const [row] = await tx.select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId }).from(mataKuliah).where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId))).limit(1);
  if (!row) throw new Error(`PRODUCT_BUNDLE_COURSE_NOT_FOUND:${courseId}`);
  return { targetId: row.id, legacyId: row.legacyCourseId ?? row.id };
}

async function resolveChapter(tx: Tx, chapterId: string | undefined, courseTargetId: string): Promise<string | null> {
  if (!chapterId) return null;
  const [row] = await tx.select({ id: bab.id, courseId: bab.mataKuliahId }).from(bab).where(or(eq(bab.id, chapterId), eq(bab.legacyChapterId, chapterId))).limit(1);
  if (!row || row.courseId !== courseTargetId) throw new Error(`PRODUCT_BUNDLE_CHAPTER_NOT_FOUND:${chapterId}`);
  return row.id;
}

async function verifyTraceability(tx: Tx, product: ProductEntity): Promise<void> {
  for (const link of product.ideaLinks) {
    const [row] = await tx.select({ version: ide.version, semanticHash: ide.semanticHash, status: ide.status }).from(ide).where(eq(ide.id, link.id)).limit(1);
    if (!row || row.status !== "published") throw new Error(`PRODUCT_BUNDLE_IDEA_NOT_PUBLISHED:${link.id}`);
    if (row.version !== link.version || row.semanticHash !== link.semanticHash) throw new Error(`PRODUCT_BUNDLE_IDEA_VERSION_MISMATCH:${link.id}`);
  }
  for (const source of product.sourceRefs) {
    const [material] = await tx.select({ id: sumberMateri.id, version: sumberMateri.version, checksum: sumberMateri.checksum, status: sumberMateri.status }).from(sumberMateri).where(eq(sumberMateri.id, source.sourceId)).limit(1);
    if (!material || material.status !== "active" || material.version !== source.version || material.checksum !== source.checksum) throw new Error(`PRODUCT_BUNDLE_SOURCE_MISMATCH:${source.sourceId}`);
    const excerpts = await tx.select({ id: potonganSumber.id, sourceVersion: potonganSumber.sourceVersion }).from(potonganSumber).where(and(eq(potonganSumber.sumberMateriId, source.sourceId), inArray(potonganSumber.id, source.excerptIds)));
    if (excerpts.length !== source.excerptIds.length || excerpts.some((excerpt) => excerpt.sourceVersion !== source.version)) throw new Error(`PRODUCT_BUNDLE_EXCERPT_MISMATCH:${source.sourceId}`);
  }
}

async function currentProductDependency(tx: Tx, entityId: string): Promise<{ version: number; hash: string } | null> {
  const [article] = await tx.select({ version: artikel.version, hash: artikel.generationHash }).from(artikel).where(eq(artikel.id, entityId)).limit(1);
  if (article) return article;
  const [diktat] = await tx.select({ version: diktatMateri.version, hash: diktatMateri.generationHash }).from(diktatMateri).where(eq(diktatMateri.id, entityId)).limit(1);
  if (diktat) return diktat;
  const [question] = await tx.select({ version: soal.version, hash: soal.generationHash }).from(soal).where(eq(soal.id, entityId)).limit(1);
  if (question) return question;
  const [solution] = await tx.select({ version: pembahasanSoal.version, hash: pembahasanSoal.generationHash }).from(pembahasanSoal).where(eq(pembahasanSoal.id, entityId)).limit(1);
  if (solution) return solution;
  const [set] = await tx.select({ version: setFlashcard.version, hash: setFlashcard.generationHash }).from(setFlashcard).where(eq(setFlashcard.id, entityId)).limit(1);
  if (set) return set;
  const [card] = await tx.select({ version: flashcard.version, hash: flashcard.generationHash }).from(flashcard).where(eq(flashcard.id, entityId)).limit(1);
  if (card) return card;
  const [blueprint] = await tx.select({ version: blueprintAsesmen.version, hash: blueprintAsesmen.generationHash }).from(blueprintAsesmen).where(eq(blueprintAsesmen.id, entityId)).limit(1);
  return blueprint ?? null;
}

async function verifyDependencies(tx: Tx, dependencies: readonly ProductDependency[], products: readonly ProductEntity[]): Promise<void> {
  for (const dependency of dependencies) {
    if (dependency.freshness !== "UP_TO_DATE") throw new Error(`PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW:${dependency.id}`);
    let current: { version: number; hash: string } | null = null;
    if (dependency.upstreamEntityType === "idea") {
      const [ideaRow] = await tx.select({ version: ide.version, hash: ide.semanticHash, status: ide.status }).from(ide).where(eq(ide.id, dependency.upstreamEntityId)).limit(1);
      current = ideaRow && ideaRow.status === "published" ? { version: ideaRow.version, hash: ideaRow.hash } : null;
    } else if (dependency.upstreamEntityType === "source_material") {
      const [sourceRow] = await tx.select({ version: sumberMateri.version, hash: sumberMateri.checksum, status: sumberMateri.status }).from(sumberMateri).where(eq(sumberMateri.id, dependency.upstreamEntityId)).limit(1);
      current = sourceRow && sourceRow.status === "active" ? { version: sourceRow.version, hash: sourceRow.hash } : null;
    } else if (dependency.upstreamEntityType === "source_chunk") {
      const [chunkRow] = await tx.select({ version: potonganSumber.sourceVersion, hash: potonganSumber.checksum }).from(potonganSumber).where(eq(potonganSumber.id, dependency.upstreamEntityId)).limit(1);
      current = chunkRow ?? null;
    } else {
      const localProduct = products.find((product) => product.id === dependency.upstreamEntityId && product.version === dependency.upstreamVersion);
      current = localProduct ? { version: localProduct.version, hash: localProduct.generationHash } : await currentProductDependency(tx, dependency.upstreamEntityId);
    }
    if (!current || current.version !== dependency.upstreamVersion || current.hash !== dependency.upstreamHash) throw new Error(`PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW:${dependency.id}`);
  }
}

async function insertArticle(tx: Tx, product: Extract<ProductEntity, { productType: "article" }>, course: { targetId: string }, now: Date): Promise<void> {
  const articleId = targetId(product);
  const chapterId = await resolveChapter(tx, product.chapterId, course.targetId);
  const [existing] = await tx.select({ id: artikel.id, title: artikel.title, version: artikel.version, sourceHash: artikel.sourceHash, generationHash: artikel.generationHash }).from(artikel).where(eq(artikel.id, articleId)).limit(1);
  const content = [...product.blocks].sort((left, right) => left.orderIndex - right.orderIndex).map((block) => block.content).join("\n\n");
  const values = { id: articleId, mataKuliahId: course.targetId, babId: chapterId, slug: product.version === 1 ? product.slug : `${product.slug}-v${product.version}`, title: product.title, contentMarkdown: content, version: product.version, status: "published" as const, sourceHash: product.sourceHash, generationHash: product.generationHash, creatorId: product.creatorId, curatorId: product.curatorId ?? null, publishedAt: now, createdAt: now, updatedAt: now };
  if (existing) {
    if (!equal(existing.title, values.title) || existing.version !== values.version || existing.sourceHash !== values.sourceHash || existing.generationHash !== values.generationHash) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
  } else await tx.insert(artikel).values(values);
  for (const link of product.ideaLinks) await tx.insert(artikelIde).values({ id: id("artikel-ide", `${articleId}:${link.id}`), artikelId: articleId, ideId: link.id, weight: link.weight }).onConflictDoNothing();
  for (const block of product.blocks) await tx.insert(blokArtikel).values({ id: id("artikel-block", `${articleId}:${block.id}`), artikelId: articleId, blockKey: block.id, blockType: block.blockType, orderIndex: block.orderIndex, content: block.content, version: product.version, generationHash: product.generationHash, status: "published", createdAt: now, updatedAt: now }).onConflictDoNothing();
}

async function insertDiktat(tx: Tx, product: Extract<ProductEntity, { productType: "diktat" }>, course: { targetId: string }, now: Date): Promise<void> {
  const materialId = targetId(product);
  const chapterId = await resolveChapter(tx, product.chapterId, course.targetId);
  const [existing] = await tx.select({ id: diktatMateri.id, version: diktatMateri.version, sourceHash: diktatMateri.sourceHash, generationHash: diktatMateri.generationHash }).from(diktatMateri).where(eq(diktatMateri.id, materialId)).limit(1);
  const values = { id: materialId, mataKuliahId: course.targetId, babId: chapterId, title: product.title, contentMarkdown: product.contentMarkdown, fileKey: null, version: product.version, status: "published" as const, sourceHash: product.sourceHash, generationHash: product.generationHash, creatorId: product.creatorId, curatorId: product.curatorId ?? null, publishedAt: now, createdAt: now, updatedAt: now };
  if (existing) {
    if (existing.version !== values.version || existing.sourceHash !== values.sourceHash || existing.generationHash !== values.generationHash) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
  } else await tx.insert(diktatMateri).values(values);
  for (const link of product.ideaLinks) await tx.insert(diktatIde).values({ id: id("diktat-ide", `${materialId}:${link.id}`), diktatMateriId: materialId, ideId: link.id, weight: link.weight }).onConflictDoNothing();
}

async function insertQuestion(tx: Tx, product: Extract<ProductEntity, { productType: "question" }>, course: { targetId: string }, now: Date): Promise<void> {
  const questionId = targetId(product);
  const chapterId = await resolveChapter(tx, product.chapterId, course.targetId);
  const values = { id: questionId, mataKuliahId: course.targetId, babId: chapterId, questionType: product.questionType, prompt: product.prompt, optionsSnapshot: product.options, version: product.version, status: "published" as const, difficulty: product.difficulty, cognitiveLevel: product.cognitiveLevel, reasoningPattern: product.reasoningPattern, generationHash: product.generationHash, creatorId: product.creatorId, curatorId: product.curatorId ?? null, publishedAt: now, createdAt: now, updatedAt: now };
  const [existing] = await tx.select({ id: soal.id, version: soal.version, generationHash: soal.generationHash }).from(soal).where(eq(soal.id, questionId)).limit(1);
  if (existing) {
    if (existing.version !== values.version || existing.generationHash !== values.generationHash) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
  } else await tx.insert(soal).values(values);
  for (const link of product.ideaLinks) await tx.insert(soalIde).values({ id: id("soal-ide", `${questionId}:${link.id}`), soalId: questionId, ideId: link.id, weight: link.weight, role: link.role === "required" ? "required" : link.role === "primary" ? "primary" : "supporting" }).onConflictDoNothing();
  for (const relationType of product.relationTypes) await tx.insert(soalRelasiIde).values({ id: id("soal-relasi", `${questionId}:${relationType}`), soalId: questionId, ideId: product.ideaLinks[0].id, relationType, rationale: null, status: "active" }).onConflictDoNothing();
}

async function insertFlashcardSet(tx: Tx, product: Extract<ProductEntity, { productType: "flashcard_set" }>, course: { targetId: string }, now: Date): Promise<void> {
  const setId = targetId(product);
  const chapterId = await resolveChapter(tx, product.chapterId, course.targetId);
  const values = { id: setId, mataKuliahId: course.targetId, babId: chapterId, title: product.title, version: product.version, status: "published" as const, generationHash: product.generationHash, creatorId: product.creatorId, curatorId: product.curatorId ?? null, publishedAt: now, createdAt: now, updatedAt: now };
  const [existing] = await tx.select({ id: setFlashcard.id, version: setFlashcard.version, generationHash: setFlashcard.generationHash }).from(setFlashcard).where(eq(setFlashcard.id, setId)).limit(1);
  if (existing) {
    if (existing.version !== values.version || existing.generationHash !== values.generationHash) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
  } else await tx.insert(setFlashcard).values(values);
}

async function insertFlashcard(tx: Tx, product: Extract<ProductEntity, { productType: "flashcard" }>, setProducts: readonly Extract<ProductEntity, { productType: "flashcard_set" }>[], now: Date): Promise<void> {
  const setProduct = product.setId ? setProducts.find((candidate) => candidate.id === product.setId) : setProducts.find((candidate) => candidate.cards.includes(product.id));
  if (!setProduct) throw new Error(`PRODUCT_BUNDLE_FLASHCARD_SET_MISSING:${product.id}`);
  const cardId = targetId(product);
  const setId = targetId(setProduct);
  const values = { id: cardId, setFlashcardId: setId, front: product.front, back: product.back, explanation: product.explanation ?? null, version: product.version, status: "published" as const, generationHash: product.generationHash, createdAt: now, updatedAt: now };
  const [existing] = await tx.select({ id: flashcard.id, version: flashcard.version, generationHash: flashcard.generationHash }).from(flashcard).where(eq(flashcard.id, cardId)).limit(1);
  if (existing) {
    if (existing.version !== values.version || existing.generationHash !== values.generationHash) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
  } else await tx.insert(flashcard).values(values);
  for (const link of product.ideaLinks) await tx.insert(flashcardIde).values({ id: id("flashcard-ide", `${cardId}:${link.id}`), flashcardId: cardId, ideId: link.id, weight: link.weight }).onConflictDoNothing();
}

async function insertBlueprint(tx: Tx, product: Extract<ProductEntity, { productType: "assessment_blueprint" }>, course: { targetId: string }, now: Date): Promise<void> {
  const blueprintId = targetId(product);
  const values = { id: blueprintId, mataKuliahId: course.targetId, title: product.title, assessmentType: product.assessmentType, blueprint: { chapterIds: product.chapterIds, questionIds: product.questionIds }, version: product.version, status: "approved" as const, generationHash: product.generationHash, creatorId: product.creatorId, curatorId: product.curatorId ?? null, createdAt: now, updatedAt: now };
  const [existing] = await tx.select({ id: blueprintAsesmen.id, version: blueprintAsesmen.version, generationHash: blueprintAsesmen.generationHash }).from(blueprintAsesmen).where(eq(blueprintAsesmen.id, blueprintId)).limit(1);
  if (existing) {
    if (existing.version !== values.version || existing.generationHash !== values.generationHash) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
  } else await tx.insert(blueprintAsesmen).values(values);
}

export async function publishProductBundle(input: { importId: string; publishedBy: string; testFailureAfter?: FailureStage }): Promise<{ publicationId: string; importId: string; published: boolean; productCount: number; vectorJobCount: number }> {
  enabled();
  const snapshot = await getProductBundleImport(input.importId);
  if (!snapshot) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  if (snapshot.status === "published") {
    const [publication] = await db.select({ id: publikasiBundle.id }).from(publikasiBundle).where(and(eq(publikasiBundle.imporBundleId, input.importId), eq(publikasiBundle.status, "published"))).limit(1);
    if (!publication) throw new Error("PRODUCT_BUNDLE_PUBLISHED_RECORD_MISSING");
    return { publicationId: publication.id, importId: input.importId, published: false, productCount: 0, vectorJobCount: 0 };
  }
  if (snapshot.status !== "approved") throw new Error("PRODUCT_BUNDLE_ADMIN_APPROVAL_REQUIRED");
  const bundle = await parseStagedProductBundle(input.importId);
  if (bundle.publicationBlocked) throw new Error("PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, input.importId)).limit(1);
    if (!row || row.bundleType !== "product" || row.status !== "approved") throw new Error("PRODUCT_BUNDLE_ADMIN_APPROVAL_REQUIRED");
    const [publisher] = await tx.select({ role: user.role }).from(user).where(eq(user.id, input.publishedBy)).limit(1);
    if (!publisher || publisher.role !== "admin") throw new Error("PRODUCT_BUNDLE_PUBLISH_FORBIDDEN");
    await requireIdentity(tx, input.publishedBy, "PRODUCT_BUNDLE_PUBLISHER_NOT_FOUND");
    const [review] = await tx.select({ id: reviewBundle.id }).from(reviewBundle).innerJoin(user, eq(user.id, reviewBundle.reviewerId)).where(and(eq(reviewBundle.imporBundleId, input.importId), eq(reviewBundle.status, "approved"), eq(user.role, "admin"))).limit(1);
    if (!review) throw new Error("PRODUCT_BUNDLE_ADMIN_APPROVAL_REQUIRED");
    const course = await resolveCourse(tx, bundle.manifest.courseId);
    const now = new Date();
    for (const product of bundle.products) {
      await requireIdentity(tx, product.creatorId, "PRODUCT_BUNDLE_CREATOR_NOT_FOUND");
      if (product.curatorId) await requireIdentity(tx, product.curatorId, "PRODUCT_BUNDLE_CURATOR_NOT_FOUND");
      await verifyTraceability(tx, product);
    }
    await verifyDependencies(tx, bundle.dependencies, bundle.products);
    const setProducts = bundle.products.filter((product): product is Extract<ProductEntity, { productType: "flashcard_set" }> => product.productType === "flashcard_set");
    const ordered = [...bundle.products].sort((left, right) => ["flashcard_set", "question", "article", "diktat", "flashcard", "solution", "assessment_blueprint"].indexOf(left.productType) - ["flashcard_set", "question", "article", "diktat", "flashcard", "solution", "assessment_blueprint"].indexOf(right.productType));
    for (const product of ordered) {
      switch (product.productType) {
        case "flashcard_set": await insertFlashcardSet(tx, product, course, now); break;
        case "question": await insertQuestion(tx, product, course, now); break;
        case "article": await insertArticle(tx, product, course, now); break;
        case "diktat": await insertDiktat(tx, product, course, now); break;
        case "flashcard": await insertFlashcard(tx, product, setProducts, now); break;
        case "solution": {
          const solutionId = targetId(product);
          const question = bundle.products.find((candidate) => candidate.productType === "question" && candidate.id === product.questionId);
          const questionId = question ? targetId(question) : product.questionId;
          const [existingQuestion] = await tx.select({ id: soal.id }).from(soal).where(eq(soal.id, questionId)).limit(1);
          if (!existingQuestion) throw new Error(`PRODUCT_BUNDLE_SOLUTION_QUESTION_MISSING:${product.id}`);
          await tx.insert(pembahasanSoal).values({ id: solutionId, soalId: questionId, version: product.version, content: product.content, status: "published", generationHash: product.generationHash, creatorId: product.creatorId, curatorId: product.curatorId ?? null, publishedAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing();
          break;
        }
        case "assessment_blueprint": await insertBlueprint(tx, product, course, now); break;
      }
      maybeFail(input.testFailureAfter, product.productType);
    }
    for (const dependency of bundle.dependencies) {
      await tx.insert(ketergantunganProduk).values({ id: dependency.id, upstreamEntityType: dependency.upstreamEntityType, upstreamEntityId: dependency.upstreamEntityId, upstreamVersion: dependency.upstreamVersion, upstreamHash: dependency.upstreamHash, downstreamEntityType: dependency.downstreamEntityType, downstreamEntityId: dependency.downstreamEntityId, downstreamVersion: dependency.downstreamVersion, downstreamHash: dependency.downstreamHash, freshness: dependency.freshness, reason: null, createdAt: now, updatedAt: now }).onConflictDoNothing();
    }
    const vectorJobs = bundle.products.map((product) => ({ id: id("vector-product", `${product.id}:${product.version}`), courseId: course.legacyId, koId: null, action: "upsert" as const, namespace: "product", payload: { entityType: product.productType, entityId: product.id, version: product.version, generationHash: product.generationHash } }));
    maybeFail(input.testFailureAfter, "outbox");
    for (const job of vectorJobs) await tx.insert(vectorSyncQueue).values(job).onConflictDoNothing();
    const publicationId = id("publikasi-product", input.importId);
    const publicationHash = createHash("sha256").update(serializeDeterministically({ bundleChecksum: bundle.manifest.bundleChecksum, productIds: bundle.products.map((product) => `${product.id}:${product.version}`).sort() }), "utf8").digest("hex");
    await tx.insert(publikasiBundle).values({ id: publicationId, imporBundleId: input.importId, approvedReviewId: review.id, version: 1, publicationHash, status: "published", publishedBy: input.publishedBy, publishedAt: now, createdAt: now });
    await tx.update(itemImporBundle).set({ status: "published" }).where(eq(itemImporBundle.imporBundleId, input.importId));
    await tx.update(imporBundle).set({ status: "published", updatedAt: now }).where(eq(imporBundle.id, input.importId));
    await tx.insert(auditMutasi).values({ id: id("audit-product", `${input.importId}:published`), actorId: input.publishedBy, entityType: "product_bundle", entityId: input.importId, action: "published", beforeSnapshot: { status: "approved" }, afterSnapshot: { status: "published", productCount: bundle.products.length, vectorJobCount: vectorJobs.length, publicationHash }, correlationId: input.importId });
    return { publicationId, importId: input.importId, published: true, productCount: bundle.products.length, vectorJobCount: vectorJobs.length };
  });
}

export async function reconcileProductBundle(importId: string) {
  const row = await getProductBundleImport(importId);
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  const audits = await db.select({ id: auditMutasi.id }).from(auditMutasi).where(and(eq(auditMutasi.entityType, "product_bundle"), eq(auditMutasi.entityId, importId)));
  const publication = await db.select({ id: publikasiBundle.id, status: publikasiBundle.status }).from(publikasiBundle).where(eq(publikasiBundle.imporBundleId, importId));
  return { importId, status: row.status, itemCount: row.items.length, publishedItems: row.items.filter((item) => item.status === "published").length, auditCount: audits.length, publicationStatus: publication[0]?.status ?? null };
}
