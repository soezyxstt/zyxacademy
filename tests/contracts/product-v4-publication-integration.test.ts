import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";
import { buildProductV4RuntimeBinding } from "@/lib/compute/product-v4-runtime-binding";
import { deriveProductV4PdfEvidence } from "@/lib/compute/product-v4-pdf-evidence";
import { deriveProductV4VerificationPlan, evaluateProductV4Verification, runProductV4Verification } from "@/lib/bundle/product-v4-verification";
import { computeProductV4SectionSemanticHash } from "@/lib/bundle/product-v4-review";
import { computePedagogyContentFingerprint, PEDAGOGIC_CRITERION_IDS, QUALITY_POLICY_VERSION } from "@/lib/materials/quality-policy";
import { PRODUCT_DIKTAT_PRINT_PROFILE } from "@/lib/bundle/product-diktat-pdf";
import * as originalVerificationService from "@/lib/bundle/product-v4-verification-service";

const originalVerificationExports = { ...originalVerificationService };
const client = createClient({ url: "file::memory:?cache=shared" });
const testDb = drizzle(client, { schema });
const { bundle } = buildLocalVerificationFixture();
const article = bundle.products.find(product => product.productType === "article")!;
const diktat = bundle.products.find(product => product.productType === "diktat")!;
if (article.productType !== "article" || diktat.productType !== "diktat") throw new Error("V4_TEST_PRODUCTS_REQUIRED");
const publisherId = "local-verification-reviewer";
const importId = "v4-publication-fixture";
const authority = { signingKey: "sqlite-only-verification-fixture-signing-key", executorId: "sqlite-fixture-executor" };
const hash = "a".repeat(64);
const attemptId = "11111111-1111-4111-8111-111111111111";
const bindingPorts = {
  async course() { return { id: bundle.manifest.courseId, legacyCourseId: "sqlite-legacy-course" }; },
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
  const binding = await buildProductV4RuntimeBinding({ row: await getRow(), bundle, runId: "sqlite-run" }, bindingPorts);
  return deriveProductV4VerificationPlan({ bundle, binding });
}
let trustedReceipt: Awaited<ReturnType<typeof runProductV4Verification>>;
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/bundle/product-staging", () => ({ getProductBundleImport: getRow, parseStagedProductBundle: async () => bundle, productBundleLifecycleStatus: (status: string) => status }));
mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: () => undefined }));
mock.module("@/lib/bundle/product-v4-verification-service", () => ({ ...originalVerificationExports, async getProductV4VerificationReadiness() {
  const plan = await currentPlan();
  return { jobId: plan.planHash, plan, receipt: trustedReceipt, state: { status: "complete" }, evaluation: evaluateProductV4Verification(plan, [trustedReceipt], authority) };
} }));
const { publishProductBundle } = await import("@/lib/bundle/product-publication");
const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");

beforeAll(async () => { await migrate(testDb, { migrationsFolder: "./drizzle" }); });
afterAll(() => { mock.module("@/lib/bundle/product-v4-verification-service", () => originalVerificationExports); client.close(); });

async function seedReady() {
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%drizzle%'");
  await client.execute("PRAGMA foreign_keys=OFF");
  for (const table of tables.rows) await client.execute(`DELETE FROM "${String(table.name).replaceAll('"', '""')}"`);
  await client.execute("PRAGMA foreign_keys=ON");
  for (const id of new Set([publisherId, bundle.manifest.creatorId, bundle.manifest.curatorId!])) {
    await testDb.insert(schema.user).values({ id, name: "Fixture admin", email: `${id}@example.test`, emailVerified: true, role: "admin", createdAt: new Date(0), updatedAt: new Date(0) });
    await provisionPenggunaForNewUser({ id, role: "admin" });
  }
  await testDb.insert(schema.courses).values({ id: "sqlite-legacy-course", title: "Local V4", category: "Matematika", description: "Local publication test" });
  await testDb.insert(schema.mataKuliah).values({ id: bundle.manifest.courseId, code: "V4SQL", title: "Local V4", legacyCourseId: "sqlite-legacy-course" });
  await testDb.insert(schema.bab).values({ id: "chapter-limit", mataKuliahId: bundle.manifest.courseId, code: "V4", title: "Limit", orderIndex: 1 });
  for (const idea of article.ideaLinks) await testDb.insert(schema.ide).values({ id: idea.id, mataKuliahId: bundle.manifest.courseId, babId: "chapter-limit", stableKey: idea.id, code: idea.id, canonicalStatement: "Limit statement", conciseExplanation: "Limit explanation", semanticHash: idea.semanticHash, generationHash: hash, version: idea.version, status: "published", creatorId: publisherId });
  for (const source of article.sourceRefs) {
    await testDb.insert(schema.sumberMateri).values({ id: source.sourceId, mataKuliahId: bundle.manifest.courseId, title: "Fixture source", canonicalUriOrR2Key: `fixture/${source.sourceId}`, checksum: source.checksum, version: source.version, status: "active", creatorId: publisherId });
    for (const [index, id] of source.excerptIds.entries()) await testDb.insert(schema.potonganSumber).values({ id, sumberMateriId: source.sourceId, sourceVersion: source.version, content: "Fixture source", startOffset: index * 20, endOffset: index * 20 + 14, checksum: source.checksum });
  }
  for (const [index, section] of article.sections.entries()) if (section.learningSectionId) await testDb.insert(schema.bagianPembelajaran).values({ id: section.learningSectionId, mataKuliahId: bundle.manifest.courseId, babId: "chapter-limit", stableKey: section.learningSectionId, title: section.title, slug: section.slug, orderIndex: index, learningObjective: section.learningObjective });
  await testDb.insert(schema.imporBundle).values({ id: importId, bundleId: bundle.manifest.bundleId, checksum: bundle.checksum, bundleType: "product", courseId: "sqlite-legacy-course", sourceUriOrKey: "fixture-v4.zip", version: 4, status: "draft", requestedBy: publisherId });
  const plan = await currentPlan();
  // Fixture executor tests publication wiring only; these bytes are not browser/PDF verification evidence.
  const pdf = new TextEncoder().encode("%PDF-1.7\nfixture\n%%EOF");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  trustedReceipt = await runProductV4Verification(plan, authority, async requirement => ({ checkId: requirement.id, status: "PASS", expected: "Fixture machine check", observed: "Fixture executor observation", pageCount: requirement.layer === "print" ? 1 : undefined, artifacts: [{ id: `artifact-${attemptId}-${requirement.id}-0.${requirement.artifactType === "application/pdf" ? "pdf" : requirement.artifactType === "image/png" ? "png" : "json"}`, mediaType: requirement.artifactType, bytes: requirement.artifactType === "application/pdf" ? pdf : requirement.artifactType === "image/png" ? png : new TextEncoder().encode("{}"), pageNumber: requirement.layer === "print" && requirement.artifactType === "image/png" ? 1 : undefined }] }));
  await testDb.update(schema.imporBundle).set({ validationReport: { productV4Verification: { runId: "sqlite-run", planHash: plan.planHash, attemptId } } }).where(eq(schema.imporBundle.id, importId));
  const fingerprint = computePedagogyContentFingerprint({ article: Object.fromEntries(Object.entries(article)), diktat: Object.fromEntries(Object.entries(diktat)) });
  await testDb.insert(schema.reviewPedagogiBundle).values({ id: "v4-pedagogic-review", imporBundleId: importId, reviewerId: publisherId, contentFingerprint: fingerprint, policyVersion: QUALITY_POLICY_VERSION, status: "approved", exceptions: [], rubric: { verificationPlanHash: plan.planHash, verificationReceiptSignature: trustedReceipt.signature, sectionDecisions: article.sections.map(section => ({ sectionId: section.id, semanticHash: computeProductV4SectionSemanticHash(article, section.id), decision: "approved" })), criteria: PEDAGOGIC_CRITERION_IDS.map(criterionId => ({ criterionId, status: "met", contentAnchors: [{ targetType: "section", targetId: article.sections[0].id }], reason: "Explicit fixture section review" })) } });
  for (const section of article.sections) await testDb.insert(schema.reviewItemBundle).values({ id: `v4-section-${section.id}`, imporBundleId: importId, productId: article.id, reviewerId: publisherId, targetType: "article_section", targetId: section.id, status: "approved" });
  const snapshot = { importId, checksum: bundle.checksum, sourceUriOrKey: "fixture-v4.zip", bundle, binding: plan.binding, verificationAttemptId: attemptId, verificationPlanHash: plan.planHash };
  const artifactBytes = new Map(trustedReceipt.results.flatMap(result => result.artifacts.filter(artifact => artifact.mediaType === "application/pdf").map(artifact => [artifact.id, pdf] as const)));
  const evidence = deriveProductV4PdfEvidence({ snapshot, plan, attemptId, receipt: trustedReceipt, authority, artifactBytes });
  for (const row of evidence) await testDb.insert(schema.buktiPdfBundle).values(row);
}

test("real V4 SQLite publication requires a current receipt, explicit review and PDF evidence", async () => {
  await seedReady();
  expect((await publishProductBundle({ importId, publishedBy: publisherId })).published).toBe(true);
  expect((await testDb.select().from(schema.artikel).where(eq(schema.artikel.id, article.id)))[0].status).toBe("published");
  expect((await testDb.select().from(schema.diktatMateri).where(eq(schema.diktatMateri.id, diktat.id)))[0].status).toBe("published");
  for (const failure of ["receipt", "review", "pdf", "source", "section"] as const) {
    await seedReady();
    if (failure === "receipt") trustedReceipt = { ...trustedReceipt, signature: "0".repeat(64) };
    if (failure === "review") await testDb.update(schema.reviewPedagogiBundle).set({ rubric: { criteria: [] } }).where(eq(schema.reviewPedagogiBundle.id, "v4-pedagogic-review"));
    if (failure === "pdf") await testDb.update(schema.buktiPdfBundle).set({ status: "stale" }).where(eq(schema.buktiPdfBundle.imporBundleId, importId));
    if (failure === "source") await testDb.update(schema.sumberMateri).set({ version: 2 }).where(eq(schema.sumberMateri.id, article.sourceRefs[0].sourceId));
    if (failure === "section") await testDb.delete(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, importId));
    await expect(publishProductBundle({ importId, publishedBy: publisherId })).rejects.toThrow();
    expect(await testDb.select().from(schema.artikel)).toHaveLength(0);
    expect((await getRow()).status).toBe("draft");
    expect(await testDb.select().from(schema.auditMutasi).where(eq(schema.auditMutasi.action, "published"))).toHaveLength(0);
  }
}, 30000);
