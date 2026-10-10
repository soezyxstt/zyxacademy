import { createHash } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  aiQuestionBank,
  artikel,
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
  setFlashcard,
  soal,
  soalIde,
  soalItbReferensi,
  soalRelasiIde,
  sumberMateri,
  potonganSumber,
  user,
  pengguna,
  vectorSyncQueue,
} from "@/db/schema";
import { serializeDeterministically } from "@/lib/bundle/idea-bundle-v2";
import { redactQuestionAnswerKeys } from "@/lib/asesmen/question-options";
import { canonicalNamespaceForProductType } from "@/lib/vectorize/outbox";
import type { CanonicalEntityType, CanonicalNamespace } from "@/lib/vectorize/contracts";
import { resolveBundleIdentity } from "./attribution";
import { dispatchVectorSync } from "@/lib/vector-sync-dispatch";
import { parseStagedProductBundle, getProductBundleImport, productBundleLifecycleStatus } from "./product-staging";
import type { ProductDependency, ProductEntity } from "./product-validator";
import { compileArticleProduct } from "@/lib/materials/compiler";
import { assertProductSectionReviews, evaluateProductBundleQualityPolicy } from "./product-review-gate";

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

function targetId(product: ProductEntity): string {
  return product.version === 1 ? product.id : `${product.id}:v${product.version}`;
}

function articleMarkdown(product: Extract<ProductEntity, { productType: "article" }>): string {
  if (product.sections.length > 0) return compileArticleProduct(product, { strict: false }).markdown;
  return [...product.blocks].sort((left, right) => left.orderIndex - right.orderIndex).map((block) => block.content).join("\n\n");
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

function canonicalProductVectorSpec(product: ProductEntity): CanonicalProductVectorSpec | null {
  const namespace = canonicalNamespaceForProductType(product.productType);
  if (!namespace) return null;

  switch (product.productType) {
    case "article":
      return {
        namespace,
        entityType: "article",
        entityId: targetId(product),
        version: product.version,
        title: product.title,
        text: articleMarkdown(product),
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

async function insertArticle(tx: Tx, product: Extract<ProductEntity, { productType: "article" }>, course: { targetId: string }, now: Date): Promise<void> {
  const articleId = targetId(product);
  const chapterId = await resolveChapter(tx, product.chapterId, course.targetId);
  const [existing] = await tx.select({ id: artikel.id, title: artikel.title, version: artikel.version, sourceHash: artikel.sourceHash, generationHash: artikel.generationHash }).from(artikel).where(eq(artikel.id, articleId)).limit(1);
  const content = articleMarkdown(product);
  const visualMeta = product.visuals && product.visuals.length > 0
    ? `\n\n<!--__ZYX_V3_ARTICLE_VISUALS__:${Buffer.from(JSON.stringify(product.visuals)).toString("base64url")}-->`
    : "";
  const values = { id: articleId, mataKuliahId: course.targetId, babId: chapterId, slug: product.version === 1 ? product.slug : `${product.slug}-v${product.version}`, title: product.title, contentMarkdown: `${content}${visualMeta}`, structureStatus: product.sections.length > 0 ? "structured" as const : "legacy_unreviewed" as const, version: product.version, status: "published" as const, sourceHash: product.sourceHash, generationHash: product.generationHash, creatorId: product.creatorId, curatorId: product.curatorId ?? null, publishedAt: now, createdAt: now, updatedAt: now };
  if (existing) {
    if (!equal(existing.title, values.title) || existing.version !== values.version || existing.sourceHash !== values.sourceHash || existing.generationHash !== values.generationHash) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
  } else await tx.insert(artikel).values(values);
  for (const link of product.ideaLinks) await tx.insert(artikelIde).values({ id: id("artikel-ide", `${articleId}:${link.id}`), artikelId: articleId, ideId: link.id, weight: link.weight }).onConflictDoNothing();
  for (const block of product.blocks) await tx.insert(blokArtikel).values({ id: id("artikel-block", `${articleId}:${block.id}`), artikelId: articleId, bagianArtikelId: null, blockKey: block.id, blockType: block.blockType, title: null, orderIndex: block.orderIndex, content: block.content, version: product.version, generationHash: product.generationHash, status: "published", createdAt: now, updatedAt: now }).onConflictDoNothing();

  const sectionRowId = (sectionId: string) => id("artikel-section", `${articleId}:${sectionId}`);
  const pendingSections = new Map(product.sections.map((section) => [section.id, section]));
  const insertedSections = new Set<string>();
  while (pendingSections.size > 0) {
    let insertedInPass = 0;
    for (const section of pendingSections.values()) {
      if (section.parentSectionId && !insertedSections.has(section.parentSectionId)) continue;
      if (section.kind === "topic" && section.learningSectionId) {
        const [learningSection] = await tx.select({ id: bagianPembelajaran.id }).from(bagianPembelajaran).where(eq(bagianPembelajaran.id, section.learningSectionId)).limit(1);
        if (!learningSection) throw new Error(`PRODUCT_ARTICLE_LEARNING_SECTION_NOT_FOUND:${section.learningSectionId}`);
      }
      const wordCount = section.blocks.reduce((total, block) => total + block.contentMarkdown.trim().split(/\s+/).filter(Boolean).length, 0);
      const pedagogyMeta = section.pedagogy
        ? `\n<!--__ZYX_V3_SECTION_PEDAGOGY__:${Buffer.from(JSON.stringify(section.pedagogy)).toString("base64url")}-->`
        : "";
      await tx.insert(bagianArtikel).values({
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
      }).onConflictDoNothing();
      for (const block of section.blocks) {
        const blockId = id("artikel-block", `${articleId}:${block.id}`);
        let blockContent = block.contentMarkdown;
        if (block.workedExamplePayload || block.formativeCheckPayload || block.visualIds?.length) {
          const payloadMeta: Record<string, unknown> = {};
          if (block.workedExamplePayload) payloadMeta.workedExamplePayload = block.workedExamplePayload;
          if (block.formativeCheckPayload) payloadMeta.formativeCheckPayload = block.formativeCheckPayload;
          if (block.visualIds?.length) payloadMeta.visualIds = block.visualIds;
          blockContent = `${block.contentMarkdown}\n\n<!--__ZYX_V3_BLOCK_PAYLOAD__:${Buffer.from(JSON.stringify(payloadMeta)).toString("base64url")}-->`;
        }
        await tx.insert(blokArtikel).values({
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
        }).onConflictDoNothing();
        for (const ideaId of block.ideaIds) {
          await tx.insert(blokArtikelIde).values({ id: id("artikel-block-ide", `${blockId}:${ideaId}`), blokArtikelId: blockId, ideId: ideaId }).onConflictDoNothing();
        }
        for (const sourceRef of block.sourceRefs) {
          await tx.insert(blokArtikelSumber).values({
            id: id("artikel-block-source", `${blockId}:${sourceRef.sourceId}:${sourceRef.version}`),
            blokArtikelId: blockId,
            sumberMateriId: sourceRef.sourceId,
            sourceVersion: sourceRef.version,
            sourceChecksum: sourceRef.checksum,
            excerptIds: sourceRef.excerptIds,
          }).onConflictDoNothing();
        }
      }
      pendingSections.delete(section.id);
      insertedSections.add(section.id);
      insertedInPass++;
    }
    if (insertedInPass === 0) throw new Error("PRODUCT_ARTICLE_SECTION_PARENT_UNRESOLVED");
  }
}

async function insertDiktat(tx: Tx, product: Extract<ProductEntity, { productType: "diktat" }>, course: { targetId: string }, now: Date, fileKey: string): Promise<void> {
  const materialId = targetId(product);
  const chapterId = await resolveChapter(tx, product.chapterId, course.targetId);
  const [existing] = await tx.select({ id: diktatMateri.id, version: diktatMateri.version, sourceHash: diktatMateri.sourceHash, generationHash: diktatMateri.generationHash }).from(diktatMateri).where(eq(diktatMateri.id, materialId)).limit(1);
  const values = { id: materialId, mataKuliahId: course.targetId, babId: chapterId, title: product.title, contentMarkdown: product.contentMarkdown, fileKey, version: product.version, status: "published" as const, sourceHash: product.sourceHash, generationHash: product.generationHash, creatorId: product.creatorId, curatorId: product.curatorId ?? null, publishedAt: now, createdAt: now, updatedAt: now };
  if (existing) {
    if (existing.version !== values.version || existing.sourceHash !== values.sourceHash || existing.generationHash !== values.generationHash) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
  } else await tx.insert(diktatMateri).values(values);
  for (const link of product.ideaLinks) await tx.insert(diktatIde).values({ id: id("diktat-ide", `${materialId}:${link.id}`), diktatMateriId: materialId, ideId: link.id, weight: link.weight }).onConflictDoNothing();
}

async function insertQuestion(tx: Tx, product: Extract<ProductEntity, { productType: "question" }>, course: { targetId: string; legacyId: string }, now: Date): Promise<void> {
  const questionId = targetId(product);
  const chapterId = await resolveChapter(tx, product.chapterId, course.targetId);
  const sourceEventName = product.itbSource.eventName.trim();
  const sourceReferenceId = product.itbSource.referenceId;
  const values = { id: questionId, mataKuliahId: course.targetId, babId: chapterId, questionType: product.questionType, prompt: product.prompt, optionsSnapshot: product.options, origin: "itb_example" as const, sourceEventName, sourceReferenceId, version: product.version, status: "published" as const, difficulty: product.difficulty, cognitiveLevel: product.cognitiveLevel, reasoningPattern: product.reasoningPattern, generationHash: product.generationHash, creatorId: product.creatorId, curatorId: product.curatorId ?? null, publishedAt: now, createdAt: now, updatedAt: now };
  const [existing] = await tx.select({ id: soal.id, version: soal.version, generationHash: soal.generationHash, origin: soal.origin, sourceEventName: soal.sourceEventName, sourceReferenceId: soal.sourceReferenceId }).from(soal).where(eq(soal.id, questionId)).limit(1);
  if (existing) {
    if (existing.version !== values.version || existing.generationHash !== values.generationHash || existing.origin !== values.origin || existing.sourceEventName !== values.sourceEventName || existing.sourceReferenceId !== values.sourceReferenceId) throw new Error(`PRODUCT_BUNDLE_VERSION_CONFLICT:${product.id}`);
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
  const [existingCompatibility] = await tx.select({ id: aiQuestionBank.id, generationHash: aiQuestionBank.generationHash, origin: aiQuestionBank.origin, sourceEventName: aiQuestionBank.sourceEventName, sourceReferenceId: aiQuestionBank.sourceReferenceId }).from(aiQuestionBank).where(eq(aiQuestionBank.id, questionId)).limit(1);
  if (existingCompatibility) {
    if (existingCompatibility.generationHash !== compatibilityValues.generationHash || existingCompatibility.origin !== compatibilityValues.origin || existingCompatibility.sourceEventName !== compatibilityValues.sourceEventName || existingCompatibility.sourceReferenceId !== compatibilityValues.sourceReferenceId) throw new Error(`PRODUCT_BUNDLE_QUESTION_BANK_CONFLICT:${product.id}`);
  } else await tx.insert(aiQuestionBank).values(compatibilityValues);
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

/**
 * Publishes a staged Product Bundle, inserting all validated product entities,
 * verifying traceability to published Ideas, and enqueueing vector sync jobs.
 */
export async function publishProductBundle(input: { importId: string; publishedBy: string; testFailureAfter?: FailureStage }): Promise<{ publicationId: string; importId: string; published: boolean; productCount: number; vectorJobCount: number }> {
  enabled();
  const snapshot = await getProductBundleImport(input.importId);
  if (!snapshot) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  if (snapshot.status === "published") {
    const [publication] = await db.select({ id: publikasiBundle.id }).from(publikasiBundle).where(and(eq(publikasiBundle.imporBundleId, input.importId), eq(publikasiBundle.status, "published"))).limit(1);
    if (!publication) throw new Error("PRODUCT_BUNDLE_PUBLISHED_RECORD_MISSING");
    return { publicationId: publication.id, importId: input.importId, published: false, productCount: 0, vectorJobCount: 0 };
  }
  if (snapshot.status !== "draft") throw new Error("PRODUCT_BUNDLE_DRAFT_REQUIRED");
  const bundle = await parseStagedProductBundle(input.importId);
  if (bundle.publicationBlocked) throw new Error("PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW");
  let courseLegacyId: string | undefined;
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, input.importId)).limit(1);
    if (!row || row.bundleType !== "product") throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
    if (row.status === "published") {
      const [publication] = await tx.select({ id: publikasiBundle.id }).from(publikasiBundle).where(and(eq(publikasiBundle.imporBundleId, input.importId), eq(publikasiBundle.status, "published"))).limit(1);
      if (!publication) throw new Error("PRODUCT_BUNDLE_PUBLISHED_RECORD_MISSING");
      return { publicationId: publication.id, importId: input.importId, published: false, productCount: 0, vectorJobCount: 0 };
    }
    if (row.status !== "draft") throw new Error("PRODUCT_BUNDLE_DRAFT_REQUIRED");
    const [publisher] = await tx.select({ role: user.role }).from(user).where(eq(user.id, input.publishedBy)).limit(1);
    if (!publisher || publisher.role !== "admin") throw new Error("PRODUCT_BUNDLE_PUBLISH_FORBIDDEN");
    await requireIdentity(tx, input.publishedBy, "PRODUCT_BUNDLE_PUBLISHER_NOT_FOUND");
    let [review] = await tx.select({ id: reviewBundle.id, reviewerId: reviewBundle.reviewerId, status: reviewBundle.status }).from(reviewBundle).where(and(eq(reviewBundle.imporBundleId, input.importId), eq(reviewBundle.reviewerId, input.publishedBy), eq(reviewBundle.status, "approved"))).limit(1);
    const usesPedagogicApproval = bundle.manifest.schemaVersion === "product-bundle.v3" || bundle.products.some((p) => p.productType === "article" && (p.sections?.length ?? 0) > 0);
    if (!review && (!usesPedagogicApproval || !bundle.products.some((product) => product.productType === "article"))) throw new Error("PRODUCT_BUNDLE_ADMIN_APPROVAL_REQUIRED");

    if (usesPedagogicApproval) {
      const requiredSectionIds = bundle.products.flatMap((product) => product.productType === "article" ? product.sections.map((section) => section.id) : []);
      if (requiredSectionIds.length > 0) {
        const sectionReviews = await tx.select({ reviewerId: reviewItemBundle.reviewerId, targetType: reviewItemBundle.targetType, targetId: reviewItemBundle.targetId, status: reviewItemBundle.status }).from(reviewItemBundle).where(and(
          eq(reviewItemBundle.imporBundleId, input.importId),
          eq(reviewItemBundle.reviewerId, input.publishedBy),
          eq(reviewItemBundle.targetType, "article_section"),
        ));
        assertProductSectionReviews({ requiredSectionIds, reviewerId: input.publishedBy, reviews: sectionReviews });
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
        },
      );

      if (!qualityEvaluation.publicationReady) {
        const blocking = qualityEvaluation.issues.find((i) => i.severity === "blocking");
        throw new Error(`PRODUCT_BUNDLE_PUBLICATION_BLOCKED:${blocking ? blocking.code : "QUALITY_POLICY_FAILED"}`);
      }
    }
    if (!review) {
      // The current pedagogic approval was validated above; retain the publication audit foreign key.
      [review] = await tx.insert(reviewBundle).values({
        id: id("review-product", `${input.importId}:${input.publishedBy}`),
        imporBundleId: input.importId,
        reviewerId: input.publishedBy,
        status: "approved",
        reviewedAt: new Date(),
      }).onConflictDoUpdate({
        target: [reviewBundle.imporBundleId, reviewBundle.reviewerId],
        set: { status: "approved", reviewedAt: new Date() },
      }).returning({ id: reviewBundle.id, reviewerId: reviewBundle.reviewerId, status: reviewBundle.status });
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
      await verifyTraceability(tx, product);
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
    await verifyDependencies(tx, bundle.dependencies, products);
    const setProducts = products.filter((product): product is Extract<ProductEntity, { productType: "flashcard_set" }> => product.productType === "flashcard_set");
    const ordered = [...products].sort((left, right) => ["flashcard_set", "question", "article", "diktat", "flashcard", "solution", "assessment_blueprint"].indexOf(left.productType) - ["flashcard_set", "question", "article", "diktat", "flashcard", "solution", "assessment_blueprint"].indexOf(right.productType));
    for (const product of ordered) {
      switch (product.productType) {
        case "flashcard_set": await insertFlashcardSet(tx, product, course, now); break;
        case "question": await insertQuestion(tx, product, course, now); break;
        case "article": await insertArticle(tx, product, course, now); break;
        case "diktat": {
          const [pdfEvidence] = await tx.select({ storageKey: buktiPdfBundle.storageKey }).from(buktiPdfBundle).where(and(
            eq(buktiPdfBundle.imporBundleId, input.importId),
            eq(buktiPdfBundle.productId, product.id),
            eq(buktiPdfBundle.diktatHash, product.generationHash),
            eq(buktiPdfBundle.status, "ready"),
          )).limit(1);
          if (!pdfEvidence?.storageKey) throw new Error(`PRODUCT_DIKTAT_PDF_NOT_READY:${product.id}`);
          await insertDiktat(tx, product, course, now, pdfEvidence.storageKey);
          break;
        }
        case "flashcard": await insertFlashcard(tx, product, setProducts, now); break;
        case "solution": {
          const solutionId = targetId(product);
          const question = products.find((candidate) => candidate.productType === "question" && candidate.id === product.questionId);
          const questionId = question ? targetId(question) : product.questionId;
          const [existingQuestion] = await tx.select({ id: soal.id }).from(soal).where(eq(soal.id, questionId)).limit(1);
          if (!existingQuestion) throw new Error(`PRODUCT_BUNDLE_SOLUTION_QUESTION_MISSING:${product.id}`);
          await tx.insert(pembahasanSoal).values({ id: solutionId, soalId: questionId, version: product.version, content: product.content, status: "published", generationHash: product.generationHash, creatorId: product.creatorId, curatorId: product.curatorId ?? null, publishedAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing();
          await tx.update(aiQuestionBank).set({ explanation: product.content }).where(eq(aiQuestionBank.id, questionId));
          break;
        }
        case "assessment_blueprint": await insertBlueprint(tx, product, course, now); break;
      }
      maybeFail(input.testFailureAfter, product.productType);
    }
    for (const dependency of bundle.dependencies) {
      await tx.insert(ketergantunganProduk).values({ id: dependency.id, upstreamEntityType: dependency.upstreamEntityType, upstreamEntityId: dependency.upstreamEntityId, upstreamVersion: dependency.upstreamVersion, upstreamHash: dependency.upstreamHash, downstreamEntityType: dependency.downstreamEntityType, downstreamEntityId: dependency.downstreamEntityId, downstreamVersion: dependency.downstreamVersion, downstreamHash: dependency.downstreamHash, freshness: dependency.freshness, reason: null, createdAt: now, updatedAt: now }).onConflictDoNothing();
    }
    const vectorJobs = products.flatMap((product) => {
      const spec = canonicalProductVectorSpec(product);
      if (!spec) return [];
      return [{
        id: id("vector-product", `${product.id}:${product.version}`),
        courseId: course.legacyId,
        koId: null,
        action: "upsert" as const,
        namespace: spec.namespace,
        payload: {
          entityType: spec.entityType,
          entityId: spec.entityId,
          version: spec.version,
          text: spec.text,
          title: spec.title,
          metadata: {
            entityId: spec.entityId,
            version: spec.version,
            status: "published",
            ...(product.chapterId ? { chapterId: product.chapterId } : {}),
          },
        },
      }];
    });
    maybeFail(input.testFailureAfter, "outbox");
    for (const job of vectorJobs) await tx.insert(vectorSyncQueue).values(job).onConflictDoNothing();
    const publicationId = id("publikasi-product", input.importId);
    const publicationHash = createHash("sha256").update(serializeDeterministically({ bundleChecksum: bundle.manifest.bundleChecksum, productIds: bundle.products.map((product) => `${product.id}:${product.version}`).sort() }), "utf8").digest("hex");
    await tx.insert(publikasiBundle).values({ id: publicationId, imporBundleId: input.importId, approvedReviewId: review.id, version: 1, publicationHash, status: "published", publishedBy: input.publishedBy, publishedAt: now, createdAt: now });
    await tx.update(itemImporBundle).set({ status: "published" }).where(eq(itemImporBundle.imporBundleId, input.importId));
    await tx.update(imporBundle).set({ status: "published", updatedAt: now }).where(eq(imporBundle.id, input.importId));
    const itbSources = bundle.products.flatMap((product) => product.productType === "question" ? [{ questionId: product.id, referenceId: product.itbSource.referenceId, eventName: product.itbSource.eventName }] : []);
    const itbCuration = bundle.products.flatMap((product) => product.productType === "question" ? product.itbCuration.map((curation) => ({ questionId: product.id, referenceId: curation.referenceId, dimensions: curation.dimensions })) : []);
    await tx.insert(auditMutasi).values({ id: id("audit-product", `${input.importId}:published`), actorId: input.publishedBy, entityType: "product_bundle", entityId: input.importId, action: "published", beforeSnapshot: { status: "draft" }, afterSnapshot: { status: "published", productCount: bundle.products.length, vectorJobCount: vectorJobs.length, publicationHash, itbSources, itbCuration }, correlationId: input.importId });
    return { publicationId, importId: input.importId, published: true, productCount: bundle.products.length, vectorJobCount: vectorJobs.length };
  });
  if (courseLegacyId) {
    dispatchVectorSync(courseLegacyId);
  }
  return result;
}

export async function withdrawProductBundle(input: { importId: string; withdrawnBy: string }): Promise<{ importId: string; withdrawn: boolean; productCount: number; vectorJobCount: number }> {
  enabled();
  const [actor] = await db.select({ role: user.role }).from(user).where(eq(user.id, input.withdrawnBy)).limit(1);
  if (!actor || actor.role !== "admin") throw new Error("PRODUCT_BUNDLE_WITHDRAW_FORBIDDEN");
  const [withdrawer] = await db.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, input.withdrawnBy)).limit(1);
  if (!withdrawer) throw new Error(`PRODUCT_BUNDLE_WITHDRAWER_NOT_FOUND:${input.withdrawnBy}`);

  const snapshot = await getProductBundleImport(input.importId);
  if (!snapshot) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  if (productBundleLifecycleStatus(snapshot.status) === "withdrawn") {
    const bundle = await parseStagedProductBundle(input.importId);
    const course = await resolveCourse(db, bundle.manifest.courseId);
    if (course.legacyId) {
      await dispatchVectorSync(course.legacyId);
    }
    return { importId: input.importId, withdrawn: false, productCount: 0, vectorJobCount: 0 };
  }
  if (productBundleLifecycleStatus(snapshot.status) !== "published") throw new Error("PRODUCT_BUNDLE_PUBLISHED_REQUIRED");
  const bundle = await parseStagedProductBundle(input.importId);

  let courseLegacyId: string | undefined;
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, input.importId)).limit(1);
    if (!row || row.bundleType !== "product" || productBundleLifecycleStatus(row.status) !== "published") throw new Error("PRODUCT_BUNDLE_PUBLISHED_REQUIRED");
    await requireIdentity(tx, input.withdrawnBy, "PRODUCT_BUNDLE_WITHDRAWER_NOT_FOUND");
    const course = await resolveCourse(tx, bundle.manifest.courseId);
    courseLegacyId = course.legacyId;
    const now = new Date();
    const productIds = bundle.products.map(targetId);
    const byType = <T extends ProductEntity["productType"]>(type: T) => bundle.products.filter((product): product is Extract<ProductEntity, { productType: T }> => product.productType === type).map(targetId);
    const articleIds = byType("article");
    const diktatIds = byType("diktat");
    const questionIds = byType("question");
    const solutionIds = byType("solution");
    const setIds = byType("flashcard_set");
    const cardIds = byType("flashcard");
    const blueprintIds = byType("assessment_blueprint");

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

    const vectorJobs = bundle.products.flatMap((product) => {
      const spec = canonicalProductVectorSpec(product);
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
    await tx.update(imporBundle).set({ status: "withdrawn", updatedAt: now }).where(eq(imporBundle.id, input.importId));
    await tx.insert(auditMutasi).values({ id: id("audit-product", `${input.importId}:withdrawn`), actorId: input.withdrawnBy, entityType: "product_bundle", entityId: input.importId, action: "withdrawn", beforeSnapshot: { status: "published" }, afterSnapshot: { status: "withdrawn", productCount: productIds.length, vectorJobCount: vectorJobs.length }, correlationId: input.importId });
    return { importId: input.importId, withdrawn: true, productCount: productIds.length, vectorJobCount: vectorJobs.length };
  });
  if (courseLegacyId) {
    await dispatchVectorSync(courseLegacyId);
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
