import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  artikel,
  blueprintAsesmen,
  diktatMateri,
  flashcard,
  ide,
  imporBundle,
  itemImporBundle,
  mataKuliah,
  pembahasanSoal,
  potonganSumber,
  setFlashcard,
  soal,
  sumberMateri,
  soalItbReferensi,
  user,
} from "@/db/schema";
import {
  computeProductBundleChecksum,
  deterministicProductSerialization,
} from "@/lib/bundle/product-bundle-v2";
import { validateProductBundle, type ProductBundleManifest } from "@/lib/bundle/product-validator";
import { parseCliArgs, requiredCliArg, writeArtifact } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";
import { sha256Bytes, sha256Text } from "@/lib/bundle/validator";

type JsonRecord = Record<string, any>;
type FixtureFiles = Map<string, Uint8Array>;

function json<T>(files: FixtureFiles, path: string): T {
  const bytes = files.get(path);
  if (!bytes) throw new Error(`PRODUCT_FIXTURE_FILE_MISSING:${path}`);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function writeJson(files: FixtureFiles, path: string, value: unknown): void {
  files.set(path, strToU8(`${JSON.stringify(value, null, 2)}\n`));
}

function cloneFiles(files: FixtureFiles): FixtureFiles {
  return new Map([...files.entries()].map(([path, bytes]) => [path, new Uint8Array(bytes)]));
}

function archive(files: FixtureFiles): Uint8Array {
  return zipSync(Object.fromEntries([...files.entries()]));
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48);
}

function productHash(id: string, value: unknown): string {
  return sha256Text(`${id}:${deterministicProductSerialization(value)}`);
}

function targetId(product: JsonRecord): string {
  return product.version === 1 ? product.id : `${product.id}:v${product.version}`;
}

function refreshChecksums(files: FixtureFiles): void {
  const manifest = json<JsonRecord>(files, "manifest.json");
  for (const entityFile of manifest.entityFiles) {
    const bytes = files.get(entityFile.path);
    if (!bytes) throw new Error(`PRODUCT_ENTITY_FILE_MISSING:${entityFile.path}`);
    entityFile.checksum = sha256Bytes(bytes);
    entityFile.stableIds = json<JsonRecord[]>(files, entityFile.path).map((entity) => entity.id);
  }
  manifest.bundleChecksum = computeProductBundleChecksum(manifest as ProductBundleManifest, files);
  writeJson(files, "manifest.json", manifest);
}

async function findPrerequisites(): Promise<{ adminId: string; courseId: string; idea: typeof ide.$inferSelect; source: typeof sumberMateri.$inferSelect; chunk: typeof potonganSumber.$inferSelect; itbReference: typeof soalItbReferensi.$inferSelect; itbReferenceV2: typeof soalItbReferensi.$inferSelect }> {
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin")).limit(1);
  if (!admin) throw new Error("STAGING_PRODUCT_ADMIN_PREREQUISITE_MISSING");
  const candidates = await db.select().from(ide).where(eq(ide.status, "published")).limit(50);
  for (const idea of candidates) {
    const [source] = await db.select().from(sumberMateri).where(and(eq(sumberMateri.mataKuliahId, idea.mataKuliahId), eq(sumberMateri.status, "active"))).limit(1);
    if (!source) continue;
    const [chunk] = await db.select().from(potonganSumber).where(and(eq(potonganSumber.sumberMateriId, source.id), eq(potonganSumber.sourceVersion, source.version))).limit(1);
    if (!chunk) continue;
    const [course] = await db.select({ id: mataKuliah.id }).from(mataKuliah).where(eq(mataKuliah.id, idea.mataKuliahId)).limit(1);
    const itbReferences = await db.select().from(soalItbReferensi).where(and(eq(soalItbReferensi.authoringVisibility, "allowed"), isNull(soalItbReferensi.soalId))).limit(2);
    if (course && itbReferences.length === 2) return { adminId: admin.id, courseId: course.id, idea, source, chunk, itbReference: itbReferences[0], itbReferenceV2: itbReferences[1] };
  }
  throw new Error("STAGING_PRODUCT_IDEA_SOURCE_PREREQUISITE_MISSING");
}

function makeValidFiles(runId: string, courseId: string, idea: typeof ide.$inferSelect, source: typeof sumberMateri.$inferSelect, chunk: typeof potonganSumber.$inferSelect, itbReference: typeof soalItbReferensi.$inferSelect, actorId: string): FixtureFiles {
  const prefix = `p008-${safeSegment(runId)}`;
  const articleId = `${prefix}-article`;
  const diktatId = `${prefix}-diktat`;
  const questionId = `${prefix}-question`;
  const solutionId = `${prefix}-solution`;
  const setId = `${prefix}-flashcard-set`;
  const cardId = `${prefix}-flashcard`;
  const blueprintId = `${prefix}-blueprint`;
  const traceability = {
    courseId,
    chapterId: idea.babId,
    ideaLinks: [{ id: idea.id, version: idea.version, semanticHash: idea.semanticHash, weight: 1, role: "primary" }],
    sourceRefs: [{ sourceId: source.id, version: source.version, checksum: source.checksum, excerptIds: [chunk.id] }],
    schemaVersion: "product.v2",
    status: "draft",
    creatorId: actorId,
    curatorId: actorId,
    ai: { provider: "staging-fixture", model: "deterministic", promptVersion: "fixture-v1" },
  };
  const product = (id: string, productType: string, body: JsonRecord): JsonRecord => {
    const base = { id, productType, version: 1, ...traceability, ...body };
    return { ...base, sourceHash: productHash(id, { sourceId: source.id, checksum: source.checksum }), generationHash: productHash(id, base) };
  };
  const article = product(articleId, "article", { slug: `${prefix}-article`, title: "Staging Product Article", blocks: [
    "prior_knowledge_activation", "problem_introduction", "explanation", "verbal_representation",
    "mathematical_representation", "analogy", "worked_example", "misconception", "application",
    "retrieval_prompt", "summary", "retrieval_close",
  ].map((blockType, orderIndex) => ({ id: `${articleId}-${orderIndex}`, blockType, orderIndex, content: `${blockType} untuk verifikasi kualitas artikel berbasis Idea.` })) });
  const question = product(questionId, "question", { questionType: "multiple_choice", prompt: "Apa fungsi utama fixture Product Bundle V2 ini?", options: [{ id: "a", text: "Menguji traceability dan publication", isCorrect: true }, { id: "b", text: "Menghapus source lama", isCorrect: false }], difficulty: "medium", cognitiveLevel: "understand", reasoningPattern: "traceability_check", relationTypes: ["required"], itbSource: { referenceId: itbReference.id, eventName: itbReference.sourceLabel }, itbCuration: [{ referenceId: itbReference.id, dimensions: { difficulty: "similar", format: "similar", terminology: "similar", reasoningPattern: "similar" }, curatorNote: "Staging fixture uses an allowed ITB reference." }] });
  const diktat = product(diktatId, "diktat", { title: "Staging Product Diktat", contentMarkdown: "Materi diktat untuk verifikasi Product Bundle V2.", sourceArticleId: articleId, sourceArticleVersion: 1, sourceArticleHash: article.generationHash });
  const products = [
    article,
    diktat,
    question,
    product(solutionId, "solution", { questionId, content: "Solusi fixture memeriksa bahwa question yang dirujuk tersedia." }),
    product(setId, "flashcard_set", { title: "Staging Product Flashcards", cards: [cardId] }),
    product(cardId, "flashcard", { setId, front: "Apa yang diuji?", back: "Traceability, preview, dan publication atomik.", explanation: "Satu prompt dan satu jawaban.", atomic: true }),
    product(blueprintId, "assessment_blueprint", { title: "Staging Product Blueprint", assessmentType: "quiz", chapterIds: [idea.babId], questionIds: [questionId] }),
  ];
  const dependencies: JsonRecord[] = [{
    id: `${prefix}-article-diktat-dependency`,
    upstreamEntityType: "product",
    upstreamEntityId: articleId,
    upstreamVersion: 1,
    upstreamHash: article.generationHash,
    downstreamEntityType: "diktat",
    downstreamEntityId: diktatId,
    downstreamVersion: 1,
    downstreamHash: diktat.generationHash,
    freshness: "UP_TO_DATE",
  }];
  const manifest: JsonRecord = {
    bundleId: `${prefix}-bundle`,
    bundleType: "product",
    schemaVersion: "product-bundle.v2",
    courseId,
    entityFiles: [
      { path: "entities/products.json", entityType: "products", checksum: "0".repeat(64), stableIds: products.map((item) => item.id) },
      { path: "entities/dependencies.json", entityType: "dependencies", checksum: "0".repeat(64), stableIds: [] },
    ],
    creatorId: actorId,
    curatorId: actorId,
    createdAt: "2026-08-03T00:00:00.000Z",
    bundleChecksum: "0".repeat(64),
    conflicts: [],
  };
  const files: FixtureFiles = new Map([
    ["manifest.json", strToU8("{}\n")],
    ["entities/products.json", strToU8(`${JSON.stringify(products, null, 2)}\n`)],
    ["entities/dependencies.json", strToU8(`${JSON.stringify(dependencies, null, 2)}\n`)],
  ]);
  writeJson(files, "manifest.json", manifest);
  refreshChecksums(files);
  return files;
}

function stageInput(files: FixtureFiles, bytes: Uint8Array, runId: string, requestedBy: string) {
  const validation = validateProductBundle(bytes);
  if (!validation.success) throw new Error(`STAGING_PRODUCT_FIXTURE_INVALID:${validation.issues.map((issue) => issue.code).join(",")}`);
  return { runId, bundleId: validation.data.manifest.bundleId, courseId: validation.data.manifest.courseId, checksum: validation.data.manifest.bundleChecksum, bytes, requestedBy, bundle: validation.data, filename: `${validation.data.manifest.bundleId}.zip` };
}

function reasonCode(bytes: Uint8Array): string {
  const result = validateProductBundle(bytes);
  return result.success ? "VALID" : result.issues[0].code;
}

function cloneVersionTwo(files: FixtureFiles, bundleId: string, itbReferenceId: string, itbEventName: string): FixtureFiles {
  const next = cloneFiles(files);
  let products: JsonRecord[] = json<JsonRecord[]>(next, "entities/products.json").map((product): JsonRecord => {
    const versioned: JsonRecord = { ...product, version: 2 };
    if (versioned.productType === "question" && Array.isArray(versioned.itbCuration)) {
      versioned.itbCuration = versioned.itbCuration.map((entry: JsonRecord, index: number) => index === 0 ? { ...entry, referenceId: itbReferenceId } : entry);
      versioned.itbSource = { referenceId: itbReferenceId, eventName: itbEventName };
    }
    return { ...versioned, generationHash: productHash(product.id, { ...versioned, revision: "v2" }) };
  });
  const articlesById = new Map(products.filter((product) => product.productType === "article").map((product) => [String(product.id), product]));
  products = products.map((product): JsonRecord => {
    if (product.productType !== "diktat") return product;
    const article = articlesById.get(String(product.sourceArticleId));
    if (!article) return product;
    const versioned = { ...product, sourceArticleVersion: 2, sourceArticleHash: article.generationHash };
    return { ...versioned, generationHash: productHash(product.id, { ...versioned, revision: "v2-lineage" }) };
  });
  const productsById = new Map(products.map((product) => [String(product.id), product]));
  const dependencies = json<JsonRecord[]>(next, "entities/dependencies.json").map((dependency) => {
    const upstream = dependency.upstreamEntityType === "product" ? productsById.get(String(dependency.upstreamEntityId)) : undefined;
    const downstream = productsById.get(String(dependency.downstreamEntityId));
    return {
      ...dependency,
      upstreamVersion: upstream ? 2 : dependency.upstreamVersion,
      upstreamHash: upstream ? upstream.generationHash : dependency.upstreamHash,
      downstreamVersion: 2,
      downstreamHash: downstream?.generationHash ?? dependency.downstreamHash,
    };
  });
  const manifest = json<JsonRecord>(next, "manifest.json");
  manifest.bundleId = bundleId;
  manifest.createdAt = "2026-08-03T00:05:00.000Z";
  writeJson(next, "entities/products.json", products);
  writeJson(next, "entities/dependencies.json", dependencies);
  writeJson(next, "manifest.json", manifest);
  refreshChecksums(next);
  return next;
}

function cloneStale(files: FixtureFiles, bundleId: string): FixtureFiles {
  const next = cloneFiles(files);
  const products = json<JsonRecord[]>(next, "entities/products.json");
  const dependency = { id: `${bundleId}-dependency`, upstreamEntityType: "idea", upstreamEntityId: products[0].ideaLinks[0].id, upstreamVersion: products[0].ideaLinks[0].version, upstreamHash: products[0].ideaLinks[0].semanticHash, downstreamEntityType: products[0].productType, downstreamEntityId: products[0].id, downstreamVersion: products[0].version, downstreamHash: products[0].generationHash, freshness: "NEEDS_REVIEW" };
  const manifest = json<JsonRecord>(next, "manifest.json");
  manifest.bundleId = bundleId;
  writeJson(next, "entities/dependencies.json", [dependency]);
  writeJson(next, "manifest.json", manifest);
  refreshChecksums(next);
  return next;
}

async function visibleProductCount(products: readonly JsonRecord[]): Promise<number> {
  const idsByType = new Map<string, string[]>();
  for (const product of products) idsByType.set(product.productType, [...(idsByType.get(product.productType) ?? []), targetId(product)]);
  let count = 0;
  const queries: Array<Promise<Array<{ id: string }>>> = [];
  if (idsByType.get("article")?.length) queries.push(db.select({ id: artikel.id }).from(artikel).where(inArray(artikel.id, idsByType.get("article")!)));
  if (idsByType.get("diktat")?.length) queries.push(db.select({ id: diktatMateri.id }).from(diktatMateri).where(inArray(diktatMateri.id, idsByType.get("diktat")!)));
  if (idsByType.get("question")?.length) queries.push(db.select({ id: soal.id }).from(soal).where(inArray(soal.id, idsByType.get("question")!)));
  if (idsByType.get("solution")?.length) queries.push(db.select({ id: pembahasanSoal.id }).from(pembahasanSoal).where(inArray(pembahasanSoal.id, idsByType.get("solution")!)));
  if (idsByType.get("flashcard_set")?.length) queries.push(db.select({ id: setFlashcard.id }).from(setFlashcard).where(inArray(setFlashcard.id, idsByType.get("flashcard_set")!)));
  if (idsByType.get("flashcard")?.length) queries.push(db.select({ id: flashcard.id }).from(flashcard).where(inArray(flashcard.id, idsByType.get("flashcard")!)));
  if (idsByType.get("assessment_blueprint")?.length) queries.push(db.select({ id: blueprintAsesmen.id }).from(blueprintAsesmen).where(inArray(blueprintAsesmen.id, idsByType.get("assessment_blueprint")!)));
  for (const rows of await Promise.all(queries)) count += rows.length;
  return count;
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const fixtureMode = typeof args.fixture === "string" ? args.fixture : "all";
  const report: JsonRecord = { planNumber: "008", runId, fixture: fixtureMode, status: "blocked" };
  try {
    assertStagingEnvironment({ productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")), requiredResources: ["database", "authUrl"] });
    process.env.FEATURE_PRODUCT_BUNDLE_V2 = "1";
    process.env.STAGING_BUNDLE_WRANGLER_STORAGE = "1";
    const [{ publishProductBundle, reconcileProductBundle }, { reviewProductBundle, stageProductBundle }] = await Promise.all([
      import("@/lib/bundle/product-publication"),
      import("@/lib/bundle/product-staging"),
    ]);
    const prerequisites = await findPrerequisites();
    console.log(JSON.stringify({ phase: "fixture_prerequisites", courseId: prerequisites.courseId, ideaId: prerequisites.idea.id, sourceId: prerequisites.source.id }));

    const validFiles = makeValidFiles(runId, prerequisites.courseId, prerequisites.idea, prerequisites.source, prerequisites.chunk, prerequisites.itbReference, prerequisites.adminId);
    const validBytes = archive(validFiles);
    const validValidation = validateProductBundle(validBytes);
    if (!validValidation.success) throw new Error(`STAGING_PRODUCT_VALID_FIXTURE_INVALID:${validValidation.issues.map((issue) => issue.code).join(",")}`);
    const input = stageInput(validFiles, validBytes, runId, prerequisites.adminId);
    const beforeImports = await db.select({ id: imporBundle.id }).from(imporBundle);
    const staged = await stageProductBundle(input);
    const afterFirstStage = await db.select({ id: imporBundle.id }).from(imporBundle);
    const afterFirstItems = await db.select({ id: itemImporBundle.id }).from(itemImporBundle).where(eq(itemImporBundle.imporBundleId, staged.importId));
    const retry = await stageProductBundle(input);
    const afterRetryImports = await db.select({ id: imporBundle.id }).from(imporBundle);
    const afterRetryItems = await db.select({ id: itemImporBundle.id }).from(itemImporBundle).where(eq(itemImporBundle.imporBundleId, staged.importId));
    if (retry.created || afterRetryImports.length !== afterFirstStage.length || afterRetryItems.length !== afterFirstItems.length) throw new Error("STAGING_PRODUCT_IDEMPOTENCY_FAILED");

    const conflictFiles = cloneFiles(validFiles);
    const conflictManifest = json<JsonRecord>(conflictFiles, "manifest.json");
    conflictManifest.createdAt = "2026-08-03T00:01:00.000Z";
    writeJson(conflictFiles, "manifest.json", conflictManifest);
    refreshChecksums(conflictFiles);
    const replacement = await stageProductBundle(stageInput(conflictFiles, archive(conflictFiles), runId, prerequisites.adminId));
    if (!replacement.replaced || replacement.importId !== staged.importId || replacement.status !== "draft") throw new Error("STAGING_PRODUCT_DRAFT_REPLACEMENT_FAILED");

    const review = await reviewProductBundle({ importId: staged.importId, reviewerId: prerequisites.adminId, decision: "approved", notes: "Plan 008 staging fixture" });
    process.env.STAGING_PRODUCT_FAILURE_TEST = "1";
    let failureCode = "NONE";
    try {
      await publishProductBundle({ importId: staged.importId, publishedBy: prerequisites.adminId, testFailureAfter: "article" });
    } catch (error) {
      failureCode = error instanceof Error ? error.message.split(":", 1)[0] : "UNKNOWN";
    } finally {
      delete process.env.STAGING_PRODUCT_FAILURE_TEST;
    }
    if (failureCode !== "PRODUCT_BUNDLE_TEST_FAILURE") throw new Error(`STAGING_PRODUCT_PARTIAL_FAILURE_EXPECTATION_FAILED:${failureCode}`);
    const products = validValidation.data.products as readonly JsonRecord[];
    const failedVisibleProducts = await visibleProductCount(products);
    const [failedImport] = await db.select({ status: imporBundle.status }).from(imporBundle).where(eq(imporBundle.id, staged.importId)).limit(1);
    if (failedImport?.status !== "draft" || failedVisibleProducts !== 0) throw new Error(`STAGING_PRODUCT_PARTIAL_PUBLICATION_ROLLBACK_FAILED:${failedVisibleProducts}`);

    const failureStages = ["flashcard_set", "question", "diktat", "flashcard", "solution", "assessment_blueprint", "outbox"] as const;
    const failureMatrix: JsonRecord[] = [];
    for (const failureStage of failureStages) {
      const failureFiles = makeValidFiles(`${runId}-${failureStage}`, prerequisites.courseId, prerequisites.idea, prerequisites.source, prerequisites.chunk, prerequisites.itbReference, prerequisites.adminId);
      const failureBytes = archive(failureFiles);
      const failureValidation = validateProductBundle(failureBytes);
      if (!failureValidation.success) throw new Error(`STAGING_PRODUCT_FAILURE_FIXTURE_INVALID:${failureStage}`);
      const failureStageResult = await stageProductBundle(stageInput(failureFiles, failureBytes, runId, prerequisites.adminId));
      await reviewProductBundle({ importId: failureStageResult.importId, reviewerId: prerequisites.adminId, decision: "approved", notes: `Plan 008 forced failure ${failureStage}` });
      let stageCode = "NONE";
      process.env.STAGING_PRODUCT_FAILURE_TEST = "1";
      try {
        await publishProductBundle({ importId: failureStageResult.importId, publishedBy: prerequisites.adminId, testFailureAfter: failureStage });
      } catch (error) {
        stageCode = error instanceof Error ? error.message.split(":", 1)[0] : "UNKNOWN";
      } finally {
        delete process.env.STAGING_PRODUCT_FAILURE_TEST;
      }
      const visibleAfterStageFailure = await visibleProductCount(failureValidation.data.products as readonly JsonRecord[]);
      const [failedStageImport] = await db.select({ status: imporBundle.status }).from(imporBundle).where(eq(imporBundle.id, failureStageResult.importId)).limit(1);
      if (stageCode !== "PRODUCT_BUNDLE_TEST_FAILURE" || failedStageImport?.status !== "draft" || visibleAfterStageFailure !== 0) throw new Error(`STAGING_PRODUCT_FAILURE_MATRIX_FAILED:${failureStage}:${stageCode}:${visibleAfterStageFailure}`);
      failureMatrix.push({ stage: failureStage, importId: failureStageResult.importId, code: stageCode, statusAfterRollback: failedStageImport.status, visibleProductsAfterRollback: visibleAfterStageFailure });
    }

    const published = await publishProductBundle({ importId: staged.importId, publishedBy: prerequisites.adminId });
    const reconcile = await reconcileProductBundle(staged.importId);
    if (!published.published || reconcile.publicationStatus !== "published" || reconcile.publishedItems !== products.length) throw new Error("STAGING_PRODUCT_VALID_PUBLICATION_EXPECTATION_FAILED");

    const staleFiles = cloneStale(validFiles, `p008-${safeSegment(runId)}-stale-bundle`);
    const staleBytes = archive(staleFiles);
    const staleStage = await stageProductBundle(stageInput(staleFiles, staleBytes, runId, prerequisites.adminId));
    await reviewProductBundle({ importId: staleStage.importId, reviewerId: prerequisites.adminId, decision: "approved", notes: "Expected dependency hold" });
    let staleCode = "NONE";
    try {
      await publishProductBundle({ importId: staleStage.importId, publishedBy: prerequisites.adminId });
    } catch (error) {
      staleCode = error instanceof Error ? error.message.split(":", 1)[0] : "UNKNOWN";
    }
    if (staleCode !== "PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW") throw new Error(`STAGING_PRODUCT_STALE_EXPECTATION_FAILED:${staleCode}`);

    const versionFiles = cloneVersionTwo(validFiles, `p008-${safeSegment(runId)}-v2-bundle`, prerequisites.itbReferenceV2.id, prerequisites.itbReferenceV2.sourceLabel);
    const versionStage = await stageProductBundle(stageInput(versionFiles, archive(versionFiles), runId, prerequisites.adminId));
    await reviewProductBundle({ importId: versionStage.importId, reviewerId: prerequisites.adminId, decision: "approved", notes: "Plan 008 versioned reimport" });
    const versionPublished = await publishProductBundle({ importId: versionStage.importId, publishedBy: prerequisites.adminId });
    const versionProducts = json<JsonRecord[]>(versionFiles, "entities/products.json");
    const versionVisible = await visibleProductCount(versionProducts);
    const originalVisible = await visibleProductCount(products);
    if (!versionPublished.published || versionVisible !== versionProducts.length || originalVisible !== products.length) throw new Error("STAGING_PRODUCT_VERSIONED_REIMPORT_FAILED");

    const holdoutFiles = cloneFiles(validFiles);
    const holdoutProducts = json<JsonRecord[]>(holdoutFiles, "entities/products.json");
    const holdoutArticle = holdoutProducts.find((product) => product.productType === "article");
    if (!holdoutArticle) throw new Error("STAGING_PRODUCT_HOLDOUT_FIXTURE_MISSING");
    holdoutArticle.blocks[0].content = "HOLDOUT_CANARY";
    const holdoutManifest = json<JsonRecord>(holdoutFiles, "manifest.json");
    holdoutManifest.bundleId = `p008-${safeSegment(runId)}-holdout-bundle`;
    writeJson(holdoutFiles, "entities/products.json", holdoutProducts);
    writeJson(holdoutFiles, "manifest.json", holdoutManifest);
    refreshChecksums(holdoutFiles);
    const invalidCases = { holdoutLeak: reasonCode(archive(holdoutFiles)), staleDependency: staleCode };
    if (invalidCases.holdoutLeak !== "PRODUCT_HOLDOUT_LEAK") throw new Error(`STAGING_PRODUCT_INVALID_FIXTURE_EXPECTATION_FAILED:${JSON.stringify(invalidCases)}`);

    report.status = "passed";
    report.prerequisites = { adminId: prerequisites.adminId, courseId: prerequisites.courseId, ideaId: prerequisites.idea.id, sourceId: prerequisites.source.id, excerptId: prerequisites.chunk.id };
    report.import = { importId: staged.importId, bundleId: staged.bundleId, checksum: staged.checksum, reviewStatus: review.status };
    report.idempotency = { beforeImportCount: beforeImports.length, afterFirstImportCount: afterFirstStage.length, afterRetryImportCount: afterRetryImports.length, retryCreated: retry.created };
    report.draftReplacement = { importId: replacement.importId, replaced: replacement.replaced, status: replacement.status };
    report.partialPublishFailure = { code: failureCode, importStatusAfterRollback: failedImport?.status ?? null, visibleProductsAfterRollback: failedVisibleProducts };
    report.failureMatrix = failureMatrix;
    report.publication = { result: published, reconcile };
    report.staleDependency = { importId: staleStage.importId, code: staleCode };
    report.versionedReimport = { importId: versionStage.importId, result: versionPublished, version2ProductCount: versionVisible, originalProductCount: originalVisible };
    report.invalidFixtures = invalidCases;
    report.featureFlags = { FEATURE_PRODUCT_BUNDLE_V2: process.env.FEATURE_PRODUCT_BUNDLE_V2 };
    report.operatorTimestamp = new Date().toISOString();
    await writeArtifact(runId, "plan-008-result.json", report);
    console.log(JSON.stringify({ status: report.status, runId, importId: staged.importId, staleImportId: staleStage.importId, versionImportId: versionStage.importId, productCount: published.productCount, vectorJobCount: published.vectorJobCount }));
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    report.operatorTimestamp = new Date().toISOString();
    await writeArtifact(runId, "plan-008-result.json", report);
    console.error(JSON.stringify({ status: "blocked", runId, error: report.error }));
    process.exitCode = 1;
  }
}

void main();
