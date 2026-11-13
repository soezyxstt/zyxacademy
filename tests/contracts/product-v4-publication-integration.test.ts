import { createHash } from "node:crypto";
import { issueBoundMcpRunToken } from "../helpers/mcp-run";
import { afterAll, expect, mock, test } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import { buildProductV4RuntimeBinding } from "@/lib/compute/product-v4-runtime-binding";
import { deriveProductV4PdfEvidence } from "@/lib/compute/product-v4-pdf-evidence";
import { deriveProductV4VerificationPlan, evaluateProductV4Verification, runProductV4Verification } from "@/lib/bundle/product-v4-verification";
import { computeProductV4SectionSemanticHash } from "@/lib/bundle/product-v4-review";
import { computePedagogyContentFingerprint, PEDAGOGIC_CRITERION_IDS, QUALITY_POLICY_VERSION } from "@/lib/materials/quality-policy";
import { PRODUCT_DIKTAT_PRINT_PROFILE } from "@/lib/bundle/product-diktat-pdf";
import * as originalVerificationService from "@/lib/bundle/product-v4-verification-service";
import { createProductBundleDraft, finalizeProductBundleDraft } from "@/lib/bundle/product-draft";
import { validateProductBundle } from "@/lib/bundle/product-validator";
import { productEntityHash } from "@/lib/bundle/product-bundle-v2";
import { buildProductVerificationKey } from "@/lib/storage/keys";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

const originalVerificationExports = { ...originalVerificationService };
const { client } = await createPostgresTestDb();
const publicationQueries: { sql: string; params: unknown[] }[] = [];
const testDb = drizzle(client, { schema, logger: { logQuery(sql, params) { publicationQueries.push({ sql, params }); } } });
const fixture = buildLocalVerificationFixture();
const parsed = validateProductBundle(fixture.bytes);
if (!parsed.success) throw new Error("V4_TEST_BUNDLE_INVALID");
const readyBundle = parsed.data;
let bundle = readyBundle;
const article = bundle.products.find(product => product.productType === "article")!;
const diktat = bundle.products.find(product => product.productType === "diktat")!;
if (article.productType !== "article" || diktat.productType !== "diktat") throw new Error("V4_TEST_PRODUCTS_REQUIRED");
const publisherId = "local-verification-reviewer";
const importId = "v4-publication-fixture";
const authority = { signingKey: "postgres-only-verification-fixture-signing-key", executorId: "zyx-product-v4-server-runner.v1" };
const previousSecret = process.env.BETTER_AUTH_SECRET;
process.env.BETTER_AUTH_SECRET = authority.signingKey;
const originalStorage = { ...await import("@/lib/storage") };
const historicalObjects = new Map<string, Uint8Array>();
mock.module("@/lib/storage", () => ({ storage: { download: async (key: string) => {
  const bytes = historicalObjects.get(key);
  if (!bytes) throw Object.assign(new Error("Fixture object absent"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
  return bytes;
} } }));
const hash = "a".repeat(64);
const attemptId = "11111111-1111-4111-8111-111111111111";
const bindingPorts = {
  async course() { return { id: bundle.manifest.courseId, legacyCourseId: "postgres-legacy-course" }; },
  async figure(): Promise<never> { throw new Error("No source figures in fixture"); },
  async download(): Promise<Uint8Array> { throw new Error("No external storage in fixture"); },
  async runtime() { return { rendererChecksum: hash, fontChecksum: hash, contractChecksum: hash, playbookChecksum: hash, printProfile: PRODUCT_DIKTAT_PRINT_PROFILE }; },
  async dependencies() {
    const ideas = await testDb.select().from(schema.ide);
    const sources = await testDb.select().from(schema.sumberMateri);
    const chunks = await testDb.select().from(schema.potonganSumber);
    return [
      ...ideas.map(row => ({ type: "idea" as const, id: row.id, version: row.version, hash: row.semanticHash, status: row.status, courseId: row.mataKuliahId })),
      ...sources.map(row => ({ type: "source_material" as const, id: row.id, version: row.version, hash: row.checksum, status: row.status, courseId: row.mataKuliahId })),
      ...chunks.map(row => ({ type: "source_chunk" as const, id: row.id, version: row.sourceVersion, hash: row.checksum, status: "active", courseId: bundle.manifest.courseId, sourceId: row.sumberMateriId })),
    ];
  },
};
const getRow = async () => (await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, importId)))[0];
async function currentPlan() {
  const binding = await buildProductV4RuntimeBinding({ row: await getRow(), bundle, runId: "postgres-run" }, bindingPorts);
  return deriveProductV4VerificationPlan({ bundle, binding });
}
let trustedReceipt: Awaited<ReturnType<typeof runProductV4Verification>>;
let verificationUnavailable = false;
let verificationReads = 0;
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
mock.module("@/lib/bundle/product-staging", () => ({
  getProductBundleImport: async () => ({ ...await getRow(), items: await testDb.select().from(schema.itemImporBundle).where(eq(schema.itemImporBundle.imporBundleId, importId)), reviews: await testDb.select().from(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, importId)) }),
  parseStagedProductBundle: async () => bundle,
  productBundleLifecycleStatus: (status: string) => status,
  listProductBlockReviews: async () => testDb.select().from(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, importId)),
  listProductItemReviews: async () => testDb.select().from(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, importId)),
  listProductBundleImports: async () => [],
  reviewProductBundle: async () => { throw new Error("Readiness must not review a bundle"); },
  adoptProductDraftRun: async () => { throw new Error("Readiness must not adopt a bundle"); },
  stageProductBundle: async () => { throw new Error("GET must not stage a bundle"); },
  discardProductBundleDraft: async () => { throw new Error("GET must not discard a bundle"); },
}));
mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: () => undefined }));
mock.module("@/lib/bundle/product-v4-verification-service", () => ({ ...originalVerificationExports, async getProductV4VerificationReadiness() {
  verificationReads++;
  if (verificationUnavailable) throw new Error("Fixture verification unavailable");
  const plan = await currentPlan();
  return { jobId: plan.planHash, attemptId, stagingAuditId: "fixture-stage", plan, receipt: trustedReceipt, state: { status: "complete" }, evaluation: evaluateProductV4Verification(plan, [trustedReceipt], authority) };
} }));
const { publishProductBundle } = await import("@/lib/bundle/product-publication");
const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");

afterAll(async () => { mock.module("@/lib/bundle/product-v4-verification-service", () => originalVerificationExports); mock.module("@/lib/storage", () => originalStorage); if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET; else process.env.BETTER_AUTH_SECRET = previousSecret; await client.close(); });

async function seedReady() {
  bundle = readyBundle;
  verificationUnavailable = false;
  verificationReads = 0;
  await client.exec('TRUNCATE TABLE "user", courses, mata_kuliah, peran CASCADE');
  await testDb.delete(schema.auditMutasi).where(eq(schema.auditMutasi.id, "fixture-stage"));
  for (const id of new Set([publisherId, bundle.manifest.creatorId, bundle.manifest.curatorId!])) {
    await testDb.insert(schema.user).values({ id, name: "Fixture admin", email: `${id}@example.test`, emailVerified: true, role: "admin", createdAt: new Date(0), updatedAt: new Date(0) });
    await provisionPenggunaForNewUser({ id, role: "admin" });
  }
  await testDb.insert(schema.courses).values({ id: "postgres-legacy-course", title: "Local V4", category: "Matematika", description: "Local publication test" });
  await testDb.insert(schema.mataKuliah).values({ id: bundle.manifest.courseId, code: "V4SQL", title: "Local V4", legacyCourseId: "postgres-legacy-course" });
  await testDb.insert(schema.bab).values({ id: "chapter-limit", mataKuliahId: bundle.manifest.courseId, code: "V4", title: "Limit", orderIndex: 1 });
  for (const idea of article.ideaLinks) await testDb.insert(schema.ide).values({ id: idea.id, mataKuliahId: bundle.manifest.courseId, babId: "chapter-limit", stableKey: idea.id, code: idea.id, canonicalStatement: "Limit statement", conciseExplanation: "Limit explanation", semanticHash: idea.semanticHash, generationHash: hash, version: idea.version, status: "published", creatorId: publisherId });
  for (const source of article.sourceRefs) {
    await testDb.insert(schema.sumberMateri).values({ id: source.sourceId, mataKuliahId: bundle.manifest.courseId, title: "Fixture source", canonicalUriOrR2Key: `fixture/${source.sourceId}`, checksum: source.checksum, version: source.version, status: "active", creatorId: publisherId });
    for (const [index, id] of source.excerptIds.entries()) await testDb.insert(schema.potonganSumber).values({ id, sumberMateriId: source.sourceId, sourceVersion: source.version, content: "Fixture source", startOffset: index * 20, endOffset: index * 20 + 14, checksum: source.checksum });
  }
  for (const [index, section] of article.sections.entries()) if (section.learningSectionId) await testDb.insert(schema.bagianPembelajaran).values({ id: section.learningSectionId, mataKuliahId: bundle.manifest.courseId, babId: "chapter-limit", stableKey: section.learningSectionId, title: section.title, slug: section.slug, orderIndex: index, learningObjective: section.learningObjective });
  await testDb.insert(schema.imporBundle).values({ id: importId, bundleId: bundle.manifest.bundleId, checksum: bundle.checksum, bundleType: "product", courseId: "postgres-legacy-course", sourceUriOrKey: "fixture-v4.zip", version: 4, status: "draft", requestedBy: publisherId });
  await testDb.insert(schema.auditMutasi).values({ id: "fixture-stage", entityType: "product_bundle", entityId: importId, action: "draft_created", correlationId: "postgres-run", afterSnapshot: { checksum: bundle.checksum } });
  await testDb.insert(schema.reviewBundle).values({ id: "v4-bundle-review", imporBundleId: importId, reviewerId: publisherId, status: "approved" });
  const plan = await currentPlan();
  // Fixture executor tests publication wiring only; these bytes are not browser/PDF verification evidence.
  const pdf = new TextEncoder().encode("%PDF-1.7\nfixture\n%%EOF");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  trustedReceipt = await runProductV4Verification(plan, authority, async requirement => ({ checkId: requirement.id, status: "PASS", expected: "Fixture machine check", observed: "Fixture executor observation", pageCount: requirement.layer === "print" ? 1 : undefined, artifacts: [{ id: `artifact-${attemptId}-${requirement.id}-0.${requirement.artifactType === "application/pdf" ? "pdf" : requirement.artifactType === "image/png" ? "png" : "json"}`, mediaType: requirement.artifactType, bytes: requirement.artifactType === "application/pdf" ? pdf : requirement.artifactType === "image/png" ? png : new TextEncoder().encode("{}"), pageNumber: requirement.layer === "print" && requirement.artifactType === "image/png" ? 1 : undefined }] }));
  await testDb.update(schema.imporBundle).set({ validationReport: { productV4Verification: { runId: "postgres-run", stagingAuditId: "fixture-stage", planHash: plan.planHash, attemptId }, productV4PdfEvidence: { planHash: plan.planHash, attemptId, receiptSignature: trustedReceipt.signature } } }).where(eq(schema.imporBundle.id, importId));
  const fingerprint = computePedagogyContentFingerprint({ article: Object.fromEntries(Object.entries(article)), diktat: Object.fromEntries(Object.entries(diktat)) });
  await testDb.insert(schema.reviewPedagogiBundle).values({ id: "v4-pedagogic-review", imporBundleId: importId, reviewerId: publisherId, contentFingerprint: fingerprint, policyVersion: QUALITY_POLICY_VERSION, status: "approved", exceptions: [], rubric: { verificationPlanHash: plan.planHash, verificationReceiptSignature: trustedReceipt.signature, sectionDecisions: article.sections.map(section => ({ sectionId: section.id, semanticHash: computeProductV4SectionSemanticHash(article, section.id), decision: "approved" })), criteria: PEDAGOGIC_CRITERION_IDS.map(criterionId => ({ criterionId, status: "met", contentAnchors: [{ targetType: "section", targetId: article.sections[0].id }], reason: "Explicit fixture section review" })) } });
  for (const section of article.sections) await testDb.insert(schema.reviewItemBundle).values({ id: `v4-section-${section.id}`, imporBundleId: importId, productId: article.id, reviewerId: publisherId, targetType: "article_section", targetId: section.id, status: "approved" });
  const snapshot = { importId, checksum: bundle.checksum, sourceUriOrKey: "fixture-v4.zip", stagingAuditId: "fixture-stage", stagingRunId: "postgres-run", importState: { bundleType: "product" as const, bundleId: bundle.manifest.bundleId, courseId: "postgres-legacy-course", version: 4, status: "draft" as const, validationReport: {} }, bundle, binding: plan.binding, verificationAttemptId: attemptId, verificationPlanHash: plan.planHash };
  const artifactBytes = new Map(trustedReceipt.results.flatMap(result => result.artifacts.filter(artifact => artifact.mediaType === "application/pdf").map(artifact => [artifact.id, pdf] as const)));
  const evidence = deriveProductV4PdfEvidence({ snapshot, plan, attemptId, receipt: trustedReceipt, authority, artifactBytes });
  for (const row of evidence) await testDb.insert(schema.buktiPdfBundle).values(row);
}

test("real V4 PostgreSQL publication requires a current receipt, explicit review and PDF evidence", async () => {
  await seedReady();
  const previousJobId = `vector-product-${createHash("sha256").update(`vector-product:${article.id}:${article.version}`).digest("hex").slice(0, 32)}`;
  await testDb.insert(schema.vectorSyncQueue).values({ id: previousJobId, courseId: "postgres-legacy-course", namespace: "published_articles", action: "upsert", status: "failed", attempts: 10, payload: { entityId: article.id, version: article.version, text: "Old exhausted publication job" } });
  publicationQueries.length = 0;
  const publication = await publishProductBundle({ importId, publishedBy: publisherId, expectedRevision: bundle.checksum });
  expect(publication.published).toBe(true);
  const jobs = await testDb.select().from(schema.vectorSyncQueue);
  const freshJobs = jobs.filter(row => row.id !== previousJobId);
  expect(freshJobs).toHaveLength(1);
  expect(freshJobs[0]).toMatchObject({ status: "pending", attempts: 0, namespace: "published_articles" });
  expect(publication.vectorJobCount).toBe(freshJobs.length);
  expect(jobs.find(row => row.id === previousJobId)).toMatchObject({ status: "failed", attempts: 10 });
  const lockQueries = publicationQueries.map((query, index) => ({ ...query, index })).filter(query => query.sql.includes("pg_advisory_xact_lock"));
  const ideaLocks = lockQueries.filter(query => String(query.params[0]).startsWith("zyx:idea-canonical:"));
  expect(ideaLocks.map(query => query.params[0])).toEqual(expect.arrayContaining([
    ...article.ideaLinks.map(link => `zyx:idea-canonical:${JSON.stringify(["idea", link.id])}`),
    ...article.sourceRefs.flatMap(source => [`zyx:idea-canonical:${JSON.stringify(["source_material", source.sourceId])}`, ...source.excerptIds.map(id => `zyx:idea-canonical:${JSON.stringify(["source_chunk", id])}`)]),
  ]));
  const productLocks = lockQueries.filter(query => String(query.params[0]).startsWith("zyx:product:"));
  expect(Math.max(...productLocks.map(query => query.index))).toBeLessThan(Math.min(...ideaLocks.map(query => query.index)));
  const firstDependencyRowLock = publicationQueries.findIndex(query => /from "(ide|sumber_materi|potongan_sumber)"/.test(query.sql) && query.sql.includes("for share"));
  expect(firstDependencyRowLock).toBeGreaterThan(Math.max(...ideaLocks.map(query => query.index)));
  expect((await testDb.select().from(schema.artikel).where(eq(schema.artikel.id, article.id)))[0].status).toBe("published");
  expect((await testDb.select().from(schema.diktatMateri).where(eq(schema.diktatMateri.id, diktat.id)))[0].status).toBe("published");
  for (const failure of ["receipt", "review", "pdf", "source", "section"] as const) {
    await seedReady();
    if (failure === "receipt") trustedReceipt = { ...trustedReceipt, signature: "0".repeat(64) };
    if (failure === "review") await testDb.update(schema.reviewPedagogiBundle).set({ rubric: { criteria: [] } }).where(eq(schema.reviewPedagogiBundle.id, "v4-pedagogic-review"));
    if (failure === "pdf") await testDb.update(schema.buktiPdfBundle).set({ status: "stale" }).where(eq(schema.buktiPdfBundle.imporBundleId, importId));
    if (failure === "source") await testDb.update(schema.sumberMateri).set({ version: 2 }).where(eq(schema.sumberMateri.id, article.sourceRefs[0].sourceId));
    if (failure === "section") await testDb.delete(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, importId));
    await expect(publishProductBundle({ importId, publishedBy: publisherId, expectedRevision: bundle.checksum })).rejects.toThrow();
    expect(await testDb.select().from(schema.artikel)).toHaveLength(0);
    expect((await getRow()).status).toBe("draft");
    expect(await testDb.select().from(schema.auditMutasi).where(eq(schema.auditMutasi.action, "published"))).toHaveLength(0);
  }
}, 30000);

test("publication inserts only the current receipt PDF when another profile has a ready row", async () => {
  await seedReady();
  const [current] = await testDb.select().from(schema.buktiPdfBundle).where(eq(schema.buktiPdfBundle.imporBundleId, importId));
  await testDb.insert(schema.buktiPdfBundle).values({ ...current, id: "old-profile-pdf", printProfile: "a-old-profile", articleHash: "b".repeat(64), storageKey: "old-unreviewed.pdf" });
  await publishProductBundle({ importId, publishedBy: publisherId, expectedRevision: bundle.checksum });
  const [published] = await testDb.select().from(schema.diktatMateri).where(eq(schema.diktatMateri.id, diktat.id));
  expect(published.fileKey).toBe(current.storageKey);
}, 30000);

for (const failure of ["old-pdf", "attempt", "plan", "signature", "missing"] as const) {
  test(`a current receipt rejects ${failure} PDF evidence`, async () => {
    await seedReady();
    const [row] = await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, importId));
    const attachment = row.validationReport.productV4PdfEvidence as { planHash: string; attemptId: string; receiptSignature: string };
    if (failure === "old-pdf") await testDb.update(schema.buktiPdfBundle).set({ storageKey: "old-unreviewed.pdf" }).where(eq(schema.buktiPdfBundle.imporBundleId, importId));
    else {
      const changed = failure === "missing" ? undefined : { ...attachment, ...(failure === "attempt" ? { attemptId: "22222222-2222-4222-8222-222222222222" } : failure === "plan" ? { planHash: "b".repeat(64) } : { receiptSignature: "b".repeat(64) }) };
      await testDb.update(schema.imporBundle).set({ validationReport: { ...row.validationReport, productV4PdfEvidence: changed } }).where(eq(schema.imporBundle.id, importId));
    }
    await expect(publishProductBundle({ importId, publishedBy: publisherId, expectedRevision: bundle.checksum })).rejects.toThrow();
    expect(await testDb.select().from(schema.diktatMateri)).toHaveLength(0);
  }, 30000);
}

test("shared V4 review refuses missing and partial section decisions", async () => {
  await seedReady();
  const { executePedagogicReview } = await import("@/lib/bundle/product-pedagogic-review");
  const fingerprint = computePedagogyContentFingerprint({ article: Object.fromEntries(Object.entries(article)), diktat: Object.fromEntries(Object.entries(diktat)) });
  const input = { importId, reviewerId: publisherId, decision: "approved" as const, expectedRevision: bundle.checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: fingerprint, criteria: PEDAGOGIC_CRITERION_IDS.map(criterionId => ({ criterionId, status: "met" as const, contentAnchors: [{ targetType: "section" as const, targetId: article.sections[0].id }], reason: "Reviewed" })) };
  await expect(executePedagogicReview(input)).rejects.toThrow("PRODUCT_BUNDLE_REVIEW_CONTEXT_REQUIRED");
  await expect(executePedagogicReview({ ...input, sectionDecisions: [] })).rejects.toThrow();
}, 30000);

test("Admin review rejects missing, numeric and stale Product revisions", async () => {
  await seedReady();
  mock.module("next/headers", () => ({ headers: async () => new Headers() }));
  mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: publisherId, role: "admin" } }) } } }));
  const { POST } = await import("../../app/api/admin/bundles/product/[id]/review/route");
  const send = (expectedRevision: unknown) => POST(new Request("https://example.test/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "approved", ...(expectedRevision === undefined ? {} : { expectedRevision }) }) }) as any, { params: Promise.resolve({ id: importId }) });
  expect((await send(undefined)).status).toBe(400);
  expect((await send(4)).status).toBe(400);
  expect((await send("0".repeat(64))).status).toBe(409);
}, 30000);

test("scoped review context and import readiness both reject a changed V4 receipt", async () => {
  await seedReady();
  const { createAuthoringMcpServer } = await import("@/lib/authoring/mcp-server");
  const { issueMcpRunToken, issueMcpBootstrapToken } = await import("@/lib/authoring/mcp-workflows");
  const bootstrapToken = issueMcpBootstrapToken({ actorId: publisherId, sessionId: "fixture-session", stage: "product", clientCapabilities: { independentSubagents: true, localArtifactFiles: true, pdfRendering: false } });
  const runToken = issueBoundMcpRunToken({ workflow: "idea_product", courseId: bundle.manifest.courseId, chapterId: "chapter-limit" }, bootstrapToken);
  async function call(name: string, args: Record<string, unknown>) {
    const server = createAuthoringMcpServer({ userId: publisherId, actorId: publisherId, sessionId: "fixture-session", scopes: ["authoring:read"], authMethod: "oauth" });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const response = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }));
    const result = (await response.json() as any).result.structuredContent;
    await server.close();
    return result;
  }
  const context = () => call("authoring.get_product_review_context", { importId, runToken, bootstrapToken, expectedRevision: bundle.checksum });
  const imported = () => call("authoring.get_import", { bundleType: "product", importId });
  expect((await context()).result.quality.publicationReady).toBe((await imported()).import.publicationReady);
  trustedReceipt = { ...trustedReceipt, signature: "0".repeat(64) };
  expect((await context()).result.quality.publicationReady).toBe(false);
  expect((await imported()).import.publicationReady).toBe(false);
}, 30000);

async function adminDetail() {
  mock.module("next/headers", () => ({ headers: async () => new Headers() }));
  mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: publisherId, role: "admin" } }) } } }));
  const { GET } = await import("../../app/api/admin/bundles/product/[id]/route");
  const response = await GET(new Request("https://example.test/api/admin/bundles/product/" + importId), { params: Promise.resolve({ id: importId }) });
  expect(response.status).toBe(200);
  return response.json();
}

test("Admin detail enables publication for the verified bundle", async () => {
  await seedReady();
  const ready = await adminDetail();
  expect(readyBundle.publicationBlocked).toBe(true);
  expect(ready.bundle.currentReview.status).toBe("approved");
  expect(ready.publicationBlocked).toBe(false);
  expect(ready.qualityEvaluation.publicationReady).toBe(true);
  expect(ready.blockingIssues).toEqual([]);
  expect(ready.v4ReviewContext.verificationReady).toBe(true);
  expect(ready.revisionFreshness.isFresh).toBe(true);
  expect(ready.pdfStatus.status).toBe("ready");
  expect(verificationReads).toBe(1);
  expect((await publishProductBundle({ importId, publishedBy: publisherId, expectedRevision: bundle.checksum })).published).toBe(true);
}, 30000);

test("published V4 historical preview uses its recorded canonical PDF without granting draft readiness", async () => {
  await seedReady();
  historicalObjects.clear();
  await testDb.insert(schema.itemImporBundle).values({ id: "published-diktat-inventory", imporBundleId: importId, entityType: "diktat", entityId: diktat.id, entityVersion: diktat.version, entityHash: productEntityHash(diktat), status: "draft" });
  expect(productEntityHash(diktat)).not.toBe(diktat.generationHash);
  await publishProductBundle({ importId, publishedBy: publisherId, expectedRevision: bundle.checksum });
  const before = await getRow();
  const { stagingAuditId: _identity, ...unbound } = before.validationReport.productV4Verification as Record<string, unknown>;
  await testDb.update(schema.imporBundle).set({ validationReport: { ...before.validationReport, productV4Verification: unbound } }).where(eq(schema.imporBundle.id, importId));
  const { getDiktatPdfContext, assertDiktatPdfBytes, assertDiktatPdfStillCurrent } = await import("@/lib/bundle/product-diktat-evidence");
  const receiptKey = buildProductVerificationKey(trustedReceipt.planHash, `receipt-${attemptId}.json`);
  const signedReceiptBytes = new TextEncoder().encode(JSON.stringify(trustedReceipt));
  historicalObjects.set(receiptKey, signedReceiptBytes);
  const read = () => getDiktatPdfContext(importId, diktat.id, bundle.checksum);
  const context = await read();
  const [canonical] = await testDb.select().from(schema.diktatMateri).where(eq(schema.diktatMateri.id, diktat.id));
  expect(context.status).toBe("ready");
  expect(context.evidence?.storageKey).toBe(canonical.fileKey);
  const pdfBytes = new TextEncoder().encode("%PDF-1.7\nfixture\n%%EOF");
  historicalObjects.set(canonical.fileKey!, pdfBytes);
  expect(() => assertDiktatPdfBytes(context, pdfBytes)).not.toThrow();
  expect(() => assertDiktatPdfBytes(context, new Uint8Array(pdfBytes.length))).toThrow("PDF_STALE");
  await assertDiktatPdfStillCurrent(context);
  const detail = await adminDetail();
  expect(detail.pdfStatus.status).toBe("ready");
  expect(detail.qualityEvaluation.publicationReady).toBe(false);
  expect((await getRow()).validationReport.productV4Verification).toEqual(unbound);
  const { GET } = await import("../../app/api/admin/bundles/product/[id]/pdf/route");
  const preview = () => GET(new Request(`https://example.test/api/admin/bundles/product/${importId}/pdf?productId=${diktat.id}&expectedRevision=${bundle.checksum}`), { params: Promise.resolve({ id: importId }) });
  const response = await preview();
  expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdfBytes);
  historicalObjects.set(canonical.fileKey!, new Uint8Array(pdfBytes.length));
  expect((await preview()).status).toBe(409);
  historicalObjects.set(canonical.fileKey!, pdfBytes);
  for (const bytes of [null, new TextEncoder().encode("{}"), new TextEncoder().encode(JSON.stringify({ ...trustedReceipt, signature: "0".repeat(64) }))]) {
    if (bytes) historicalObjects.set(receiptKey, bytes); else historicalObjects.delete(receiptKey);
    expect((await read()).status).not.toBe("ready");
    expect((await preview()).status).not.toBe(200);
  }
  historicalObjects.set(receiptKey, signedReceiptBytes);
  await testDb.update(schema.itemImporBundle).set({ entityHash: diktat.generationHash }).where(eq(schema.itemImporBundle.id, "published-diktat-inventory"));
  expect((await read()).status).not.toBe("ready");
  await testDb.update(schema.itemImporBundle).set({ entityHash: productEntityHash(diktat) }).where(eq(schema.itemImporBundle.id, "published-diktat-inventory"));
  for (const change of [{ fileKey: "unrecorded.pdf" }, { status: "withdrawn" as const }, { generationHash: "f".repeat(64) }, { sourceHash: "f".repeat(64) }, { version: 2 }]) {
    await testDb.update(schema.diktatMateri).set(change).where(eq(schema.diktatMateri.id, diktat.id));
    expect((await read()).status).not.toBe("ready");
    await expect(assertDiktatPdfStillCurrent(context)).rejects.toThrow("PDF_STALE");
    await testDb.update(schema.diktatMateri).set({ fileKey: canonical.fileKey, status: canonical.status, generationHash: canonical.generationHash, sourceHash: canonical.sourceHash, version: canonical.version }).where(eq(schema.diktatMateri.id, diktat.id));
  }
  await testDb.update(schema.itemImporBundle).set({ status: "withdrawn" }).where(eq(schema.itemImporBundle.id, "published-diktat-inventory"));
  expect((await read()).status).not.toBe("ready");
  await testDb.update(schema.itemImporBundle).set({ status: "published" }).where(eq(schema.itemImporBundle.id, "published-diktat-inventory"));
  await testDb.update(schema.publikasiBundle).set({ status: "withdrawn" }).where(eq(schema.publikasiBundle.imporBundleId, importId));
  expect((await read()).status).not.toBe("ready");
  await testDb.update(schema.publikasiBundle).set({ status: "published" }).where(eq(schema.publikasiBundle.imporBundleId, importId));
  await testDb.update(schema.imporBundle).set({ status: "draft" }).where(eq(schema.imporBundle.id, importId));
  expect((await read()).status).not.toBe("ready");
  await expect(publishProductBundle({ importId, publishedBy: publisherId, expectedRevision: bundle.checksum })).rejects.toThrow();
}, 30000);

for (const failure of ["unavailable", "stale", "pdf", "review", "reviewer", "source"] as const) {
  test(`Admin readiness rejects ${failure} evidence`, async () => {
    await seedReady();
    if (failure === "unavailable") verificationUnavailable = true;
    if (failure === "stale") trustedReceipt = { ...trustedReceipt, signature: "0".repeat(64) };
    if (failure === "pdf") await testDb.update(schema.buktiPdfBundle).set({ status: "stale" }).where(eq(schema.buktiPdfBundle.imporBundleId, importId));
    if (failure === "review") await testDb.update(schema.reviewPedagogiBundle).set({ status: "pending" }).where(eq(schema.reviewPedagogiBundle.id, "v4-pedagogic-review"));
    if (failure === "reviewer") await testDb.update(schema.reviewPedagogiBundle).set({ reviewerId: bundle.manifest.creatorId }).where(eq(schema.reviewPedagogiBundle.id, "v4-pedagogic-review"));
    if (failure === "source") await testDb.update(schema.sumberMateri).set({ version: 2 }).where(eq(schema.sumberMateri.id, article.sourceRefs[0].sourceId));
    const blocked = await adminDetail();
    expect(verificationReads).toBe(1);
    expect(blocked.publicationBlocked).toBe(false);
    expect(blocked.qualityEvaluation.publicationReady).toBe(false);
    expect(blocked.blockingIssues.length).toBeGreaterThan(0);
    if (failure === "unavailable" || failure === "stale") expect(blocked.v4ReviewContext.verificationReady).toBe(false);
    expect((await getRow()).status).toBe("draft");
  }, 30000);
}
for (const freshness of ["STALE", "NEEDS_REVIEW"] as const) {
  test(`Admin dependency readiness rejects ${freshness}`, async () => {
    await seedReady();
    const stale = { ...bundle, dependencies: bundle.dependencies.map(dependency => ({ ...dependency, freshness })) };
    bundle = finalizeProductBundleDraft(stale, createProductBundleDraft(stale)).bundle;
    await testDb.update(schema.imporBundle).set({ checksum: bundle.checksum }).where(eq(schema.imporBundle.id, importId));
    expect(bundle.publicationBlocked).toBe(true);
    const blocked = await adminDetail();
    expect(blocked.publicationBlocked).toBe(true);
    expect(blocked.qualityEvaluation.publicationReady).toBe(false);
  }, 30000);
}
