import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { zipSync } from "fflate";
import * as schema from "@/db/schema";
import { computeIdeaBundleChecksum, serializeDeterministically, validateIdeaBundle, type ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { computeProductBundleChecksum, parseProductBundle, productEntitySchema, type ProductEntity, type ProductDependency } from "@/lib/bundle/product-validator";
import { finalizeProductBundleDraft } from "@/lib/bundle/product-draft";
import { productVersionId } from "@/lib/bundle/product-identity";
import { parseAdmittedProductBundle } from "@/lib/bundle/product-staged-worker";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import * as realRuntime from "@/lib/compute/product-v4-runtime-binding";
import { parseProductV4VerificationReceipt, type ProductV4VerificationRequirement } from "@/lib/bundle/product-v4-verification";
import { computeProductV4SectionSemanticHash } from "@/lib/bundle/product-v4-review";
import { productPedagogyFingerprint } from "@/lib/bundle/product-review-gate";
import { PEDAGOGIC_CRITERION_IDS, QUALITY_POLICY_VERSION } from "@/lib/materials/quality-policy";
import { PRODUCT_DIKTAT_PRINT_PROFILE } from "@/lib/bundle/product-diktat-pdf";
import { buildProductVerificationKey } from "@/lib/storage/keys";
import { createPostgresTestDb } from "../helpers/postgres";

// Integration boundary: real PostgreSQL constraints, archive parsing, runtime
// dependency binding, signed receipt machinery, PDF persistence, review gates,
// publication and atomic release coordinator. Only storage, job delivery,
// installed-renderer fingerprint and browser/PDF execution are substituted.
// The synthetic artifacts below are NOT evidence of actual browser/PDF quality.
const { client, testDb } = await createPostgresTestDb();
const objects = new Map<string, Uint8Array>();
const originalDb = { ...await import("@/db") };
const originalStorage = { ...await import("@/lib/storage") };
const originalDispatch = { ...await import("@/lib/vector-sync-dispatch") };
const originalJobs = { ...await import("@/jobs/client") };
const originalRuntime = { ...realRuntime };
const buildRealBinding = realRuntime.buildProductV4RuntimeBinding;
const previousSecret = process.env.BETTER_AUTH_SECRET;
const previousBrowser = process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER;
process.env.BETTER_AUTH_SECRET = "local-test-only-revision-verification-signing-secret";
process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER = "cloudflare";
let renders = 0, deliveries = 0;
const checkpoint = (phase: string) => { if (process.env.ZYX_REVISION_V4_TEST_TRACE === "1") console.info(`[revision-v4-test] ${phase}`); };
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/storage", () => ({ ...originalStorage, storage: {
  download: async (key: string) => {
    const value = objects.get(key);
    if (!value) throw Object.assign(new Error("Fixture object absent"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
    return new Uint8Array(value);
  },
  upload: async (bytes: Uint8Array, _filename: string, _mime: string, input: { key: string }) => { objects.set(input.key, new Uint8Array(bytes)); return { key: input.key, url: "memory", size: bytes.length }; },
} }));
mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: async () => undefined }));
mock.module("@/jobs/client", () => ({ inngest: { send: async () => { deliveries++; return { ids: [] }; } } }));
const fixedHash = "a".repeat(64);
mock.module("@/lib/compute/product-v4-runtime-binding", () => ({ ...originalRuntime, buildProductV4RuntimeBinding: async (input: Parameters<typeof buildRealBinding>[0], _ports?: Parameters<typeof buildRealBinding>[1], read?: Parameters<typeof buildRealBinding>[2], connection?: Parameters<typeof buildRealBinding>[3]) => {
  // The mocked runtime executes against PGlite even when its public port is
  // typed as the production driver. Keep that adapter local to this fixture.
  const database = (connection ?? testDb) as unknown as typeof testDb;
  return buildRealBinding(input, {
  async course() { return { id: "course-physics", legacyCourseId: "legacy-physics" }; },
  async figure(): Promise<never> { throw new Error("NO_SOURCE_FIGURES_IN_FIXTURE"); },
  async download(): Promise<never> { throw new Error("NO_REMOTE_ASSETS_IN_FIXTURE"); },
  async runtime() { return { rendererChecksum: fixedHash, fontChecksum: fixedHash, contractChecksum: fixedHash, playbookChecksum: fixedHash, printProfile: PRODUCT_DIKTAT_PRINT_PROFILE }; },
  async dependencies(bundle) {
    const { assertProspectiveReleaseDependencies } = await import("@/lib/authoring/revision-verification-context");
    // Read the authoritative rows without pretending the candidate is live.
    // A prospective context is resolved by the separate attested port below.
    const ideas = await database.select().from(schema.ide);
    const sources = await database.select().from(schema.sumberMateri);
    const chunks = await database.select().from(schema.potonganSumber);
    const rows: realRuntime.ProductV4LiveDependency[] = [
      ...ideas.map(row => ({ type: "idea" as const, id: row.id, version: row.version, hash: row.semanticHash, status: row.status, courseId: row.mataKuliahId })),
      ...sources.map(row => ({ type: "source_material" as const, id: row.id, version: row.version, hash: row.checksum, status: row.status, courseId: row.mataKuliahId })),
      ...chunks.map(row => ({ type: "source_chunk" as const, id: row.id, version: row.sourceVersion, hash: row.checksum, status: sources.find(source => source.id === row.sumberMateriId)!.status, courseId: "course-physics", sourceId: row.sumberMateriId })),
    ];
    // Guard accidental fixture drift in the regular live case using the same
    // complete graph validator. Prospective references intentionally fail here.
    const [importRow] = await database.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, input.row.id));
    if (!importRow.validationReport.revisionVerificationContext) await assertProspectiveReleaseDependencies({ productBundle: bundle, ideaDrafts: [], scope: { courseId: "course-physics" }, connection: database as unknown as NonNullable<Parameters<typeof assertProspectiveReleaseDependencies>[0]["connection"]> });
    return rows;
  },
  async revisionDependencies(value) {
    const { resolveRevisionVerificationContext } = await import("@/lib/authoring/revision-verification-context");
    return resolveRevisionVerificationContext(value, database as unknown as NonNullable<Parameters<typeof resolveRevisionVerificationContext>[1]>);
  },
  }, read, connection);
} }));
const revisions = await import("@/lib/authoring/revision-service");
const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");
const { getIdeaRevisionReviewContext, reviewIdeaBundleRevision, publishIdeaBundle } = await import("@/lib/bundle/publication");
const { stageProductBundle } = await import("@/lib/bundle/product-staging");
const { publishProductBundle } = await import("@/lib/bundle/product-publication");
const { createProductV4ApplicationService, getProductV4VerificationReadiness } = await import("@/lib/bundle/product-v4-verification-service");
const { latestProductV4StagingAudit } = await import("@/lib/bundle/product-v4-staging-identity");
const { executePedagogicReview } = await import("@/lib/bundle/product-pedagogic-review");
checkpoint("imports ready");
afterAll(async () => {
  mock.module("@/db", () => originalDb);
  mock.module("@/lib/storage", () => originalStorage);
  mock.module("@/lib/vector-sync-dispatch", () => originalDispatch);
  mock.module("@/jobs/client", () => originalJobs);
  mock.module("@/lib/compute/product-v4-runtime-binding", () => originalRuntime);
  if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET; else process.env.BETTER_AUTH_SECRET = previousSecret;
  if (previousBrowser === undefined) delete process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER; else process.env.AUTHORING_VERIFICATION_BROWSER_PROVIDER = previousBrowser;
  await client.close();
});

const encode = (value: unknown) => new TextEncoder().encode(`${serializeDeterministically(value)}\n`);
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const generationHash = (value: Omit<ProductEntity, "generationHash"> | Record<string, unknown>) => sha(encode(value).subarray(0, encode(value).length - 1));
function ideaFixture() {
  const directory = join(process.cwd(), "tests/fixtures/bundles/idea-v2");
  const paths = ["manifest.json", "sources/kinematika.md", "entities/source-materials.json", "entities/source-chunks.json", "entities/ideas.json", "entities/provenance.json", "entities/relations.json"];
  const files = new Map(paths.map(path => [path, new Uint8Array(readFileSync(join(directory, path)))]));
  const read = (path: string) => JSON.parse(new TextDecoder().decode(files.get(path)!));
  const manifest = read("manifest.json"), idea = read("entities/ideas.json")[0], proof = read("entities/provenance.json")[0];
  const section = { id: "section-motion", courseId: idea.courseId, chapterId: idea.chapterId, stableKey: "section-motion", title: "Gerak", slug: "gerak", orderIndex: 0, learningObjective: "Memahami gerak", primaryIdeaIds: [idea.id], supportingIdeaIds: [], sourceChunkIds: [proof.sourceChunkId] };
  manifest.schemaVersion = "idea-bundle.v3";
  files.set("entities/learning-sections.json", encode([section]));
  manifest.entityFiles.push({ path: "entities/learning-sections.json", entityType: "learning_sections", checksum: sha(files.get("entities/learning-sections.json")!), stableIds: [section.id] });
  manifest.bundleChecksum = computeIdeaBundleChecksum(manifest, files); files.set("manifest.json", encode(manifest));
  const parsed = validateIdeaBundle(files); if (!parsed.success) throw new Error(JSON.stringify(parsed.issues));
  return { bundle: parsed.data, bytes: zipSync(Object.fromEntries(files), { level: 0 }) };
}
const ideaArchive = ideaFixture();
function productFixture(ideas: ValidatedIdeaBundle) {
  const original = buildLocalVerificationFixture().bundle;
  const idea = ideas.entities.ideas[0], source = ideas.entities.sourceMaterials[0], chunk = ideas.entities.sourceChunks[0];
  const refs = [{ sourceId: source.id, version: source.version, checksum: source.checksum, excerptIds: [chunk.id] }];
  const rewrite = (value: unknown): any => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "courseId" ? idea.courseId : key === "chapterId" ? idea.chapterId : key === "ideaIds" ? [idea.id] : key === "sourceRefs" ? refs : key === "sourceHash" ? source.checksum : key === "ideaLinks" ? [{ id: idea.id, version: idea.version, semanticHash: idea.semanticHash, weight: 1, role: "primary" }] : rewrite(item)]));
  };
  const remapped = { ...original, manifest: { ...original.manifest, bundleId: "v4-release-initial", courseId: idea.courseId }, products: original.products.map(product => productEntitySchema.parse(rewrite(product))) };
  const finalized = finalizeProductBundleDraft(remapped, { products: [...remapped.products] });
  const article = finalized.bundle.products.find(product => product.productType === "article")!;
  const common = { courseId: article.courseId, chapterId: article.chapterId, version: 1, status: "draft", ideaLinks: article.ideaLinks, sourceRefs: article.sourceRefs, sourceHash: article.sourceHash, creatorId: article.creatorId, curatorId: article.curatorId };
  const setBody = { ...common, id: "release-cards", productType: "flashcard_set", schemaVersion: "flashcard_set.v1", title: "Limit", cards: ["release-card"] };
  const cardBody = { ...common, id: "release-card", productType: "flashcard", schemaVersion: "flashcard.v1", setId: "release-cards", front: "Apa peran delta?", back: "Delta membatasi jarak masukan.", atomic: true };
  const products = [...finalized.bundle.products, productEntitySchema.parse({ ...setBody, generationHash: generationHash(setBody) }), productEntitySchema.parse({ ...cardBody, generationHash: generationHash(cardBody) })];
  const dependencies: ProductDependency[] = [...finalized.bundle.dependencies,
    ...products.map(product => ({ id: `release-idea-${product.id}`, upstreamEntityType: "idea" as const, upstreamEntityId: idea.id, upstreamVersion: idea.version, upstreamHash: idea.semanticHash, downstreamEntityType: product.productType, downstreamEntityId: product.id, downstreamVersion: product.version, downstreamHash: product.generationHash, freshness: "UP_TO_DATE" as const })),
    { id: "release-card-parent", upstreamEntityType: "product", upstreamEntityId: "release-cards", upstreamVersion: 1, upstreamHash: products.find(product => product.id === "release-cards")!.generationHash, downstreamEntityType: "flashcard", downstreamEntityId: "release-card", downstreamVersion: 1, downstreamHash: products.find(product => product.id === "release-card")!.generationHash, freshness: "UP_TO_DATE" },
  ];
  const files = new Map(finalized.bundle.files);
  const entityFiles = finalized.bundle.manifest.entityFiles.map(file => { const values = file.entityType === "products" ? products : dependencies; files.set(file.path, encode(values)); return { ...file, stableIds: values.map(value => value.id), checksum: sha(files.get(file.path)!) }; });
  const manifest = { ...finalized.bundle.manifest, entityFiles };
  files.set("manifest.json", encode({ ...manifest, bundleChecksum: computeProductBundleChecksum(manifest, files) }));
  const parsed = parseProductBundle(files); if (!parsed.success) throw new Error(JSON.stringify(parsed.issues));
  return { bundle: parsed.data, bytes: zipSync(Object.fromEntries(files), { level: 0 }) };
}
const initialProduct = productFixture(ideaArchive.bundle);
const actorId = "local-verification-reviewer";
const rowFor = async (id: string) => (await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, id)))[0];
const storedBundle = async (id: string) => { const row = await rowFor(id); return parseAdmittedProductBundle(objects.get(row.sourceUriOrKey)!, row); };
const executeFixture = async ({ requirement }: { requirement: ProductV4VerificationRequirement }) => {
  renders++;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  const bytes = requirement.artifactType === "application/pdf" ? new TextEncoder().encode(`%PDF-1.7\nSYNTHETIC TEST ONLY ${renders}\n%%EOF`) : requirement.artifactType === "image/png" ? png : new TextEncoder().encode("{}");
  return { checkId: requirement.id, status: "PASS" as const, expected: "Injected integration observation", observed: "Synthetic executor, no browser or PDF renderer", artifacts: [{ id: "fixture", mediaType: requirement.artifactType, bytes, ...(requirement.layer === "print" && requirement.artifactType === "image/png" ? { pageNumber: 1 } : {}) }], ...(requirement.layer === "print" ? { pageCount: 1 } : {}) };
};
async function verify(importId: string) {
  checkpoint("verification request");
  const staging = await latestProductV4StagingAudit(testDb, importId);
  if (!staging?.correlationId) throw new Error("FIXTURE_STAGING_RUN_REQUIRED");
  const service = await createProductV4ApplicationService(executeFixture, async () => { deliveries++; });
  const requested = await service.request({ importId, runId: staging.correlationId });
  checkpoint("verification process");
  const complete = await service.process({ importId, runId: staging.correlationId, planHash: requested.plan.planHash, attemptId: requested.attemptId! });
  checkpoint("verification completed");
  expect(complete.evaluation.ready).toBe(true);
  const receipt = parseProductV4VerificationReceipt(complete.receipt);
  const pdf = receipt.results.flatMap(result => result.artifacts).find(artifact => artifact.mediaType === "application/pdf")!;
  const selectedKey = buildProductVerificationKey(complete.plan.planHash, pdf.id);
  expect(objects.has(selectedKey)).toBe(true);
  return { ...complete, receipt, selectedKey };
}
async function approveProduct(importId: string, verification: Awaited<ReturnType<typeof verify>>, throughRevision: boolean) {
  const row = await rowFor(importId), bundle = await storedBundle(importId);
  const article = bundle.products.find(product => product.productType === "article")!;
  if (article.productType !== "article") throw new Error("FIXTURE_ARTICLE_REQUIRED");
  const evidence = { decision: "approved" as const, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: productPedagogyFingerprint(bundle.products), verificationPlanHash: verification.plan.planHash, verificationReceiptSignature: verification.receipt.signature,
    sectionDecisions: article.sections.map(section => ({ productId: article.id, sectionId: section.id, semanticHash: computeProductV4SectionSemanticHash(article, section.id), decision: "approved" as const })),
    criteria: PEDAGOGIC_CRITERION_IDS.map(criterionId => ({ criterionId, status: "met" as const, contentAnchors: [{ targetType: "section" as const, targetId: article.sections[0].id }], reason: "Explicit synthetic-boundary integration review" })),
  };
  return throughRevision ? revisions.reviewRevisionDraft({ actorId, kind: "product", importId, expectedRevision: row.checksum, evidence }) : executePedagogicReview({ ...evidence, importId, reviewerId: actorId, expectedRevision: row.checksum });
}
async function approveIdea(importId: string, expectedRevision: string, throughRevision = false) {
  const context = await getIdeaRevisionReviewContext({ importId, reviewerId: actorId, expectedRevision });
  const evidence = { decision: "approved" as const, items: context.ideas.map(idea => ({ ideaId: idea.id, ideaHash: idea.ideaHash!, status: "approved" as const })) };
  return throughRevision ? revisions.reviewRevisionDraft({ actorId, kind: "idea", importId, expectedRevision, evidence }) : reviewIdeaBundleRevision({ importId, reviewerId: actorId, expectedRevision, ...evidence });
}
let liveProductId = "";
beforeEach(async () => {
  checkpoint("seed start");
  objects.clear(); renders = 0; deliveries = 0;
  await testDb.delete(schema.ketergantunganProduk);
  await client.exec('TRUNCATE TABLE "user", courses, mata_kuliah, peran CASCADE');
  for (const id of new Set([actorId, "local-verification-author", "creator-1", "curator-1"])) {
    await testDb.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role: "admin" });
    await provisionPenggunaForNewUser({ id, role: "admin" });
  }
  await testDb.insert(schema.courses).values({ id: "legacy-physics", title: "Fisika", category: "Fisika" });
  await testDb.insert(schema.mataKuliah).values({ id: "course-physics", code: "PHY", title: "Fisika", legacyCourseId: "legacy-physics" });
  await testDb.insert(schema.bab).values({ id: "chapter-kinematics", mataKuliahId: "course-physics", code: "KIN", title: "Gerak", orderIndex: 0 });
  objects.set("fixture-idea.zip", ideaArchive.bytes);
  await testDb.insert(schema.imporBundle).values({ id: "v4-idea-live", bundleId: ideaArchive.bundle.manifest.bundleId, bundleType: "idea", version: 3, checksum: ideaArchive.bundle.canonicalChecksum, courseId: "legacy-physics", sourceUriOrKey: "fixture-idea.zip", status: "validated", requestedBy: actorId, validationReport: { valid: true } });
  await approveIdea("v4-idea-live", ideaArchive.bundle.canonicalChecksum);
  await publishIdeaBundle({ importId: "v4-idea-live", publishedBy: actorId, expectedRevision: ideaArchive.bundle.canonicalChecksum });
  checkpoint("Idea baseline published");
  const article = initialProduct.bundle.products.find(product => product.productType === "article")!;
  if (article.productType !== "article") throw new Error("FIXTURE_ARTICLE_REQUIRED");
  for (const [index, section] of article.sections.entries()) if (section.learningSectionId) await testDb.insert(schema.bagianPembelajaran).values({ id: section.learningSectionId, mataKuliahId: "course-physics", babId: "chapter-kinematics", stableKey: section.learningSectionId, title: section.title, slug: section.slug, orderIndex: index + 1, learningObjective: section.learningObjective });
  const staged = await stageProductBundle({ runId: "v4-initial-run", bundleId: initialProduct.bundle.manifest.bundleId, courseId: initialProduct.bundle.manifest.courseId, checksum: initialProduct.bundle.checksum, bytes: initialProduct.bytes, bundle: initialProduct.bundle, requestedBy: actorId });
  liveProductId = staged.importId;
  checkpoint("Product baseline staged");
  const verified = await verify(liveProductId);
  await approveProduct(liveProductId, verified, false);
  checkpoint("Product baseline reviewed");
  expect((await publishProductBundle({ importId: liveProductId, publishedBy: actorId, expectedRevision: initialProduct.bundle.checksum })).published).toBe(true);
  checkpoint("Product baseline published");
}, 30000);

test("a card-only V4 revision obtains a fresh immutable Diktat PDF and publishes atomically", async () => {
  checkpoint("card revision start");
  const original = await storedBundle(liveProductId);
  const article = original.products.find(product => product.productType === "article")!;
  const diktat = original.products.find(product => product.productType === "diktat")!;
  if (diktat.productType !== "diktat") throw new Error("FIXTURE_DIKTAT_REQUIRED");
  const [oldCanonicalDiktat] = await testDb.select().from(schema.diktatMateri).where(eq(schema.diktatMateri.id, productVersionId(diktat.id, diktat.version)));
  const fork = await revisions.createRevisionDraft({ actorId, kind: "product", baseImportId: liveProductId, expectedRevision: original.checksum });
  const patched = await revisions.patchRevisionDraft({ actorId, kind: "product", importId: fork.importId, expectedRevision: fork.revision, operations: [{ op: "set", target: { entityType: "flashcard", entityId: "release-card" }, field: "back", value: "Delta membatasi jarak masukan untuk menjamin toleransi keluaran epsilon." }] });
  const changed = await storedBundle(patched.importId);
  const nextDiktat = changed.products.find(product => product.productType === "diktat")!;
  if (nextDiktat.productType !== "diktat") throw new Error("FIXTURE_DIKTAT_REQUIRED");
  expect(changed.products.find(product => product.id === article.id)).toEqual(article);
  expect(nextDiktat.units).toEqual(diktat.units);
  expect(nextDiktat.contentMarkdown).toBe(diktat.contentMarkdown);
  expect(nextDiktat.version).toBe(diktat.version + 1);
  expect(nextDiktat.generationHash).not.toBe(diktat.generationHash);
  expect((await rowFor(liveProductId)).status).toBe("published");
  const entries = [{ importId: patched.importId, expectedRevision: patched.revision }];
  expect((await revisions.planRevisionRelease({ actorId, entries })).publicationReady).toBe(false);
  const fresh = await verify(patched.importId);
  expect(fresh.selectedKey).not.toBe(oldCanonicalDiktat.fileKey);
  await approveProduct(patched.importId, fresh, true);
  const plan = await revisions.planRevisionRelease({ actorId, entries });
  checkpoint("card release planned");
  expect(plan.blockers).toEqual([]);
  expect(plan.publicationReady).toBe(true);
  expect((await revisions.publishRevisionRelease({ actorId, entries, expectedPlanHash: plan.planHash })).published).toBe(true);
  checkpoint("card release published");
  expect((await rowFor(liveProductId)).status).toBe("withdrawn");
  expect((await rowFor(patched.importId)).status).toBe("published");
  expect((await testDb.select().from(schema.artikel).where(eq(schema.artikel.id, productVersionId(article.id, article.version))))[0]).toMatchObject({ version: article.version, status: "published", generationHash: article.generationHash });
  const [canonical] = await testDb.select().from(schema.diktatMateri).where(eq(schema.diktatMateri.id, productVersionId(nextDiktat.id, nextDiktat.version)));
  expect(canonical).toMatchObject({ fileKey: fresh.selectedKey, generationHash: nextDiktat.generationHash, version: nextDiktat.version, status: "published" });
  const [historical] = await testDb.select().from(schema.diktatMateri).where(eq(schema.diktatMateri.id, productVersionId(diktat.id, diktat.version)));
  expect(historical.fileKey).toBe(oldCanonicalDiktat.fileKey);
  expect(historical.status).toBe("withdrawn");
  const rows = await testDb.select().from(schema.ketergantunganProduk);
  for (const edge of changed.dependencies) expect(rows.find(row => row.upstreamEntityType === edge.upstreamEntityType && row.upstreamEntityId === edge.upstreamEntityId && row.upstreamVersion === edge.upstreamVersion && row.downstreamEntityType === edge.downstreamEntityType && row.downstreamEntityId === edge.downstreamEntityId && row.downstreamVersion === edge.downstreamVersion)).toMatchObject({ upstreamHash: edge.upstreamHash, downstreamHash: edge.downstreamHash, freshness: "UP_TO_DATE" });
  expect(rows.some(row => row.downstreamEntityType === "diktat" && row.downstreamEntityId === diktat.id && row.downstreamVersion === diktat.version)).toBe(false);
  expect(renders).toBeGreaterThan(0);
  expect(deliveries).toBeGreaterThanOrEqual(2);
}, 30000);

test("a mixed Idea and V4 release verifies the exact prospective graph before atomic promotion", async () => {
  checkpoint("mixed revision start");
  const idea = ideaArchive.bundle.entities.ideas[0];
  const ideaFork = await revisions.createRevisionDraft({ actorId, kind: "idea", baseImportId: "v4-idea-live", expectedRevision: ideaArchive.bundle.canonicalChecksum });
  const ideaPatch = await revisions.patchRevisionDraft({ actorId, kind: "idea", importId: ideaFork.importId, expectedRevision: ideaFork.revision, operations: [{ op: "set", target: { entityType: "idea", entityId: idea.id }, field: "conciseExplanation", value: "Kecepatan rata-rata membandingkan perubahan posisi dengan selang waktu yang bersesuaian." }] });
  const incoming = (ideaPatch.bundle as { entities: ValidatedIdeaBundle["entities"] }).entities.ideas.find(value => value.id === idea.id)!;
  const original = await storedBundle(liveProductId);
  const productFork = await revisions.createRevisionDraft({ actorId, kind: "product", baseImportId: liveProductId, expectedRevision: original.checksum });
  const productPatch = await revisions.patchRevisionDraft({ actorId, kind: "product", importId: productFork.importId, expectedRevision: productFork.revision, operations: [
    ...original.products.map(product => ({ op: "set" as const, target: { entityType: product.productType, entityId: product.id }, field: "ideaLinks", value: product.ideaLinks.map(link => link.id === incoming.id ? { ...link, version: incoming.version, semanticHash: incoming.semanticHash } : link) })),
    ...original.dependencies.filter(edge => edge.upstreamEntityType === "idea" && edge.upstreamEntityId === incoming.id).flatMap(edge => [{ op: "set" as const, target: { entityType: "dependency", entityId: edge.id }, field: "upstreamVersion", value: incoming.version }, { op: "set" as const, target: { entityType: "dependency", entityId: edge.id }, field: "upstreamHash", value: incoming.semanticHash }]),
    { op: "set", target: { entityType: "diktat", entityId: "local-diktat" }, field: "units[local-summary].parts[summary-heading].markdown", value: "## Menghubungkan toleransi input dan keluaran secara bertahap" },
  ] });
  const entries = [{ importId: ideaPatch.importId, expectedRevision: ideaPatch.revision }, { importId: productPatch.importId, expectedRevision: productPatch.revision }];
  await expect(verify(productPatch.importId)).rejects.toThrow("DEPENDENCY_CHANGED");
  const prepared = await revisions.prepareRevisionVerification({ actorId, entries });
  checkpoint("mixed verification context prepared");
  expect(prepared.invalidated).toBe(true);
  const verified = await verify(productPatch.importId);
  expect((await testDb.select().from(schema.ide).where(eq(schema.ide.id, idea.id)))[0].version).toBe(idea.version);
  await approveIdea(ideaPatch.importId, ideaPatch.revision, true);
  await approveProduct(productPatch.importId, verified, true);
  const plan = await revisions.planRevisionRelease({ actorId, entries });
  checkpoint("mixed release planned");
  expect(plan.blockers).toEqual([]);
  expect(plan.publicationReady).toBe(true);
  await revisions.publishRevisionRelease({ actorId, entries, expectedPlanHash: plan.planHash });
  checkpoint("mixed release published");
  expect((await testDb.select().from(schema.ide).where(eq(schema.ide.id, idea.id)))[0]).toMatchObject({ version: incoming.version, semanticHash: incoming.semanticHash, generationHash: incoming.generationHash, status: "published" });
  expect((await rowFor("v4-idea-live")).status).toBe("withdrawn");
  expect((await rowFor(liveProductId)).status).toBe("withdrawn");
  expect((await rowFor(productPatch.importId)).status).toBe("published");
  const current = await getProductV4VerificationReadiness(productPatch.importId, verified.plan.binding.runId);
  expect(current.evaluation.ready).toBe(true);
  expect(current.plan.planHash).toBe(verified.plan.planHash);
  const next = await storedBundle(productPatch.importId), diktat = next.products.find(product => product.productType === "diktat")!;
  expect((await testDb.select().from(schema.diktatMateri).where(eq(schema.diktatMateri.id, productVersionId(diktat.id, diktat.version))))[0].fileKey).toBe(verified.selectedKey);
}, 30000);
