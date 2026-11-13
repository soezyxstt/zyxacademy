import { issueBoundMcpRunToken } from "../helpers/mcp-run";
import { afterAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { zipSync } from "fflate";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { computeProductBundleChecksum, deterministicProductSerialization, parseProductBundle } from "@/lib/bundle/product-validator";

process.env.BETTER_AUTH_SECRET = "local-product-headless-test-secret";
const { client, testDb } = await createPostgresTestDb();
const objects = new Map<string, Uint8Array>();
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
mock.module("@/lib/storage", () => ({ storage: {
  upload: async (bytes: Uint8Array, _name: string, _mime: string, options: { key: string }) => { objects.set(options.key, bytes); return { key: options.key }; },
  download: async (key: string) => { const bytes = objects.get(key); if (!bytes) throw new Error("FIXTURE_OBJECT_MISSING"); return bytes; },
  delete: async (key: string) => { objects.delete(key); },
} }));
mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: () => {} }));
const { assertLiveProductBundleDependencies, publishProductBundle } = await import("@/lib/bundle/product-publication");
const { stageProductBundle } = await import("@/lib/bundle/product-staging");
const { registerLegacyPdfRequest, rejectLegacyPdfRequest } = await import("@/lib/bundle/product-diktat-queue");
const { createAuthoringMcpServer } = await import("@/lib/authoring/mcp-server");
const { issueMcpBootstrapToken, issueMcpRunToken } = await import("@/lib/authoring/mcp-workflows");
const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");
afterAll(async () => { await client.close(); });

const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const ideaHash = "a".repeat(64), sourceHash = "b".repeat(64);
const principal = { userId: "admin", actorId: "admin", sessionId: "session", scopes: ["authoring:read", "authoring:stage", "authoring:review", "authoring:publish", "authoring:withdraw"], authMethod: "oauth" as const };
const clientCapabilities = { independentSubagents: true, localArtifactFiles: true, pdfRendering: false };
const bootstrapToken = issueMcpBootstrapToken({ actorId: "admin", sessionId: "session", stage: "product", clientCapabilities });
const boundRun = (scope: Parameters<typeof issueMcpRunToken>[0]) => issueBoundMcpRunToken(scope, bootstrapToken);
const runToken = boundRun({ workflow: "idea_product", courseId: "course", chapterId: "chapter" });
async function invoke(name: string, input: Record<string, unknown>, scopes = principal.scopes) {
  const server = createAuthoringMcpServer({ ...principal, scopes });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const response = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: input } }) }));
  return (await response.json() as any).result;
}
function fixture(version: 2 | 3, front: string, assessment = false, bundleSuffix = "", bundleId?: string, chapterId = "chapter", ideaLinkDrift?: "first" | "last") {
  const base = { courseId: "course", chapterId, version: 1, status: "draft", schemaVersion: "1.0", sourceHash, generationHash: ideaHash, creatorId: "admin", ideaLinks: [{ id: "idea", version: 1, semanticHash: ideaHash, weight: 1, role: "primary" }], sourceRefs: [{ sourceId: "source", version: 1, checksum: sourceHash, excerptIds: ["excerpt"] }] };
  const products: any[] = [
    { ...base, id: `set-${version}`, productType: "flashcard_set", title: "Set", cards: [`card-${version}`] },
    { ...base, id: `card-${version}`, productType: "flashcard", front, back: "Answer", atomic: true },
  ];
  if (assessment) products.push(
    { ...base, id: "question", productType: "question", questionType: "multiple_choice", prompt: "Question?", options: [{ id: "a", text: "A", isCorrect: true }, { id: "b", text: "B", isCorrect: false }], difficulty: "medium", cognitiveLevel: "understand", reasoningPattern: "definition", itbSource: { referenceId: "ref", eventName: "Exam" }, itbCuration: [{ referenceId: "ref", dimensions: { difficulty: "similar", format: "similar", terminology: "similar", reasoningPattern: "similar" }, curatorNote: "Review" }] },
    { ...base, id: "solution", productType: "solution", questionId: "question", content: "Answer" },
  );
  if (ideaLinkDrift) products[ideaLinkDrift === "first" ? 0 : products.length - 1].ideaLinks = [{ ...base.ideaLinks[0], semanticHash: "c".repeat(64) }];
  const encode = (value: unknown) => new TextEncoder().encode(deterministicProductSerialization(value));
  const files = new Map([["products.json", encode(products)], ["dependencies.json", encode([])]]);
  const manifest = { bundleId: bundleId ?? `bundle-${version}${assessment ? "-assessment" : ""}${bundleSuffix}`, bundleType: "product" as const, schemaVersion: `product-bundle.v${version}` as "product-bundle.v2" | "product-bundle.v3", courseId: "course", creatorId: "admin", createdAt: "2026-01-01T00:00:00Z", conflicts: [], entityFiles: [...files].map(([path, bytes]) => ({ path, checksum: hash(bytes), entityType: path === "products.json" ? "products" as const : "dependencies" as const, stableIds: path === "products.json" ? products.map(p => p.id) : [] })) };
  files.set("manifest.json", encode({ ...manifest, bundleChecksum: computeProductBundleChecksum(manifest, files) }));
  const parsed = parseProductBundle(files);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.issues));
  return { data: parsed.data, bytes: zipSync(Object.fromEntries(files), { level: 0 }) };
}
async function stage(value: ReturnType<typeof fixture>, previous?: string) {
  return stageProductBundle({ bundle: value.data, bytes: value.bytes, runId: "local-fixture", bundleId: value.data.manifest.bundleId, courseId: "course", checksum: value.data.checksum, requestedBy: "admin", expectedPreviousChecksum: previous });
}

test("scoped learning reviews and publication bind V2 and V3 to the exact staged revision", async () => {
  await testDb.insert(schema.courses).values({ id: "course", title: "Course", category: "Test" });
  await testDb.insert(schema.mataKuliah).values({ id: "course", code: "C", title: "Course", status: "active", legacyCourseId: "course" });
  await testDb.insert(schema.user).values({ id: "admin", name: "Admin", email: "admin@example.test", role: "admin" });
  await provisionPenggunaForNewUser({ id: "admin", role: "admin" });
  await testDb.insert(schema.bab).values({ id: "chapter", mataKuliahId: "course", code: "B", title: "Chapter", orderIndex: 0, status: "active" });
  await testDb.insert(schema.ide).values({ id: "idea", mataKuliahId: "course", babId: "chapter", stableKey: "idea", code: "I", canonicalStatement: "Idea", conciseExplanation: "Explanation", knowledgeKind: "definition", instructionalRole: "core", difficultyMetadata: {}, version: 1, status: "published", sourcePolicy: "source_grounded", schemaVersion: "1.0", semanticHash: ideaHash, generationHash: ideaHash, creatorId: "admin" });
  await testDb.insert(schema.sumberMateri).values({ id: "source", mataKuliahId: "course", babId: "chapter", sourceType: "markdown", title: "Source", canonicalUriOrR2Key: "fixture.md", version: 1, checksum: sourceHash, status: "active", creatorId: "admin" });
  await testDb.insert(schema.potonganSumber).values({ id: "excerpt", sumberMateriId: "source", sourceVersion: 1, content: "Source", startOffset: 0, endOffset: 6, checksum: sourceHash, embeddingEligible: false });
  for (const position of ["first", "last"] as const) {
    const staleLink = fixture(3, "Stale Idea link", false, `-stale-${position}`, undefined, "chapter", position);
    const objectCount = objects.size;
    const wrongProductId = position === "first" ? "set-3" : "card-3";
    for (const name of ["authoring.validate_product_bundle", "authoring.submit_product_bundle"]) {
      const result = await invoke(name, { runToken, bootstrapToken, filename: "stale.zip", bundleBase64: Buffer.from(staleLink.bytes).toString("base64") });
      expect(result.structuredContent.valid).toBe(false);
      const issue = result.structuredContent.issues.find((item: any) => item.code === "PRODUCT_BUNDLE_IDEA_VERSION_MISMATCH");
      expect(issue).toBeDefined();
      expect(issue.target.targetId).toContain(wrongProductId);
    }
    expect(await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.bundleId, staleLink.data.manifest.bundleId))).toHaveLength(0);
    expect(objects.size).toBe(objectCount);
  }
  const adminDraft = fixture(2, "Admin draft", false, "-adopt");
  const adminImport = await stage(adminDraft);
  await testDb.insert(schema.reviewBundle).values({ id: "admin-old-review", imporBundleId: adminImport.importId, reviewerId: "admin", status: "approved" });
  await testDb.insert(schema.buktiPdfBundle).values({ id: "admin-old-pdf", imporBundleId: adminImport.importId, productId: "old-diktat", articleVersion: 1, articleHash: ideaHash, diktatHash: sourceHash, rendererVersion: "old", printProfile: "old", status: "ready", pageCount: 1, storageKey: "old.pdf" });
  const adoption = { runToken, bootstrapToken, importId: adminImport.importId, expectedRevision: adminDraft.data.checksum, expectedStagingRunId: "local-fixture" };
  const legacyRun = issueMcpRunToken({ workflow: "idea_product", courseId: "course", chapterId: "chapter" });
  for (const name of ["authoring.get_product_review_context", "authoring.review_product_bundle", "authoring.publish_product_bundle", "authoring.discard_product_draft", "authoring.adopt_product_draft_run"]) {
    expect((await invoke(name, { ...adoption, runToken: legacyRun, decision: "approved" })).structuredContent.error).toBe("AUTHORING_MCP_LEGACY_RUN_RESTART_REQUIRED");
  }
  const beforeAdoption = await invoke("authoring.get_product_review_context", adoption);
  expect(beforeAdoption.structuredContent.result.stagingRunId).toBe("local-fixture");
  expect((await invoke("authoring.adopt_product_draft_run", { ...adoption, expectedStagingRunId: "stale" })).structuredContent.error).toBe("PRODUCT_BUNDLE_STALE_CONTEXT");
  const adopted = await invoke("authoring.adopt_product_draft_run", adoption);
  expect(adopted.structuredContent.result.adopted).toBe(true);
  expect((await testDb.select().from(schema.buktiPdfBundle).where(eq(schema.buktiPdfBundle.id, "admin-old-pdf")))[0].status).toBe("stale");
  expect(await testDb.select().from(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, adminImport.importId))).toHaveLength(0);
  expect((await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, adminImport.importId)))[0].validationReport.productRunAdoption).toBeDefined();
  expect((await invoke("authoring.adopt_product_draft_run", adoption)).structuredContent.result.adopted).toBe(false);
  const adoptedContext = await invoke("authoring.get_product_review_context", adoption);
  expect(adoptedContext.structuredContent.result.currentRunMatchesStaging).toBe(true);
  const audits = await testDb.select().from(schema.auditMutasi).where(eq(schema.auditMutasi.entityId, adminImport.importId));
  expect(audits.some(audit => audit.afterSnapshot?.operation === "run_adoption" && audit.beforeSnapshot?.stagingRunId === "local-fixture")).toBe(true);
  const oldFlag = process.env.FEATURE_STRUCTURED_ARTICLE_READER_V1;
  process.env.FEATURE_STRUCTURED_ARTICLE_READER_V1 = "1";
  try {
    const revised = fixture(2, "Revised legacy draft", false, "-adopt");
    const upload = { ...adoption, filename: "legacy.zip", bundleBase64: Buffer.from(revised.bytes).toString("base64") };
    expect((await invoke("authoring.validate_product_bundle", upload)).structuredContent.valid).toBe(false);
    expect((await invoke("authoring.validate_product_bundle", { ...upload, replaceImportId: adminImport.importId })).structuredContent.valid).toBe(true);
    expect((await invoke("authoring.validate_product_bundle", { ...upload, replaceImportId: adminImport.importId, expectedRevision: "0".repeat(64) })).structuredContent.error).toBe("PRODUCT_BUNDLE_STALE_CONTEXT");
    expect((await invoke("authoring.submit_product_bundle", upload)).structuredContent.ok).toBe(false);
    expect((await invoke("authoring.restage_product_bundle", { ...upload, expectedRevision: "0".repeat(64) })).structuredContent.error).toBe("PRODUCT_BUNDLE_STALE_CONTEXT");
    expect((await invoke("authoring.restage_product_bundle", upload)).structuredContent.staged).toBe(true);
  } finally {
    if (oldFlag === undefined) delete process.env.FEATURE_STRUCTURED_ARTICLE_READER_V1;
    else process.env.FEATURE_STRUCTURED_ARTICLE_READER_V1 = oldFlag;
  }
  for (const version of [2, 3] as const) {
    const first = fixture(version, "First"), revised = fixture(version, "Revised");
    const staged = await stage(first);
    await expect(stage(revised)).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
    await expect(publishProductBundle({ importId: staged.importId, publishedBy: "admin" } as any)).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
    await expect(publishProductBundle({ importId: staged.importId, publishedBy: "admin", expectedRevision: "0".repeat(64) })).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
    expect((await invoke("authoring.get_import", { bundleType: "product", importId: staged.importId })).structuredContent.import.publicationReady).toBe(false);
    const args = { runToken, bootstrapToken, importId: staged.importId, expectedRevision: first.data.checksum };
    expect((await invoke("authoring.discard_product_draft", { ...args, expectedRevision: "0".repeat(64) })).structuredContent.error).toBe("PRODUCT_BUNDLE_STALE_CONTEXT");
    expect((await invoke("authoring.discard_product_draft", { ...args, runToken: boundRun({ workflow: "idea_product", courseId: "course", chapterId: "other" }) })).structuredContent.error).toBe("AUTHORING_MCP_IMPORT_SCOPE_MISMATCH");
    const context = await invoke("authoring.get_product_review_context", args);
    expect(context.structuredContent.result.products).toHaveLength(2);
    expect(context.structuredContent.result.sections).toHaveLength(0);
    expect((await invoke("authoring.publish_product_bundle", args)).structuredContent.error).toBe("PRODUCT_BUNDLE_ADMIN_APPROVAL_REQUIRED");
    expect((await invoke("authoring.review_product_bundle", { ...args, decision: "approved" })).structuredContent.ok).toBe(true);
    await stage(revised, first.data.checksum);
    expect((await invoke("authoring.publish_product_bundle", args)).structuredContent.error).toBe("PRODUCT_BUNDLE_STALE_CONTEXT");
    const current = { ...args, expectedRevision: revised.data.checksum };
    expect((await invoke("authoring.publish_product_bundle", current)).structuredContent.error).toBe("PRODUCT_BUNDLE_ADMIN_APPROVAL_REQUIRED");
    const review = await invoke("authoring.review_product_bundle", { ...current, decision: "approved" });
    expect(review.structuredContent).toMatchObject({ ok: true });
    expect((await invoke("authoring.get_import", { bundleType: "product", importId: staged.importId })).structuredContent.import.publicationReady).toBe(true);
    expect((await invoke("authoring.get_product_review_context", current)).structuredContent.result.quality.publicationReady).toBe(true);
    await testDb.update(schema.sumberMateri).set({ version: 2 }).where(eq(schema.sumberMateri.id, "source"));
    expect((await invoke("authoring.get_import", { bundleType: "product", importId: staged.importId })).structuredContent.import.publicationReady).toBe(false);
    expect((await invoke("authoring.get_product_review_context", current)).structuredContent.result.quality.publicationReady).toBe(false);
    await testDb.update(schema.sumberMateri).set({ version: 1 }).where(eq(schema.sumberMateri.id, "source"));
    expect((await invoke("authoring.review_product_bundle", { ...current, decision: "approved" })).structuredContent.result.reviewId).toBe(review.structuredContent.result.reviewId);
    expect((await invoke("authoring.publish_product_bundle", current, ["authoring:read", "authoring:review"])).structuredContent.error).toBe("AUTHORING_MCP_SCOPE_REQUIRED");
    expect((await invoke("authoring.publish_product_bundle", { ...current, runToken: boundRun({ workflow: "idea_product", courseId: "course", chapterId: "other" }) })).structuredContent.error).toBe("AUTHORING_MCP_IMPORT_SCOPE_MISMATCH");
    const pdfRequest = { requestId: randomUUID(), importId: staged.importId, requestedBy: "admin", productId: "missing-diktat", expectedRevision: revised.data.checksum };
    await registerLegacyPdfRequest(pdfRequest);
    const pending = (await invoke("authoring.get_import", { bundleType: "product", importId: staged.importId })).structuredContent.import;
    expect(pending.publicationReady).toBe(false);
    expect(pending.currentReadiness.pdfEvidenceStatus).toBe("pending");
    expect(pending.currentReadiness.issues).toContainEqual(expect.objectContaining({ code: "PDF_REQUEST_PROCESSING" }));
    await expect(publishProductBundle({ importId: staged.importId, publishedBy: "admin", expectedRevision: revised.data.checksum })).rejects.toThrow("PDF_REQUEST_PROCESSING");
    await rejectLegacyPdfRequest(pdfRequest, "PRODUCT_DIKTAT_NOT_FOUND");
    expect((await invoke("authoring.publish_product_bundle", current)).structuredContent.result.published).toBe(true);
    expect((await invoke("authoring.publish_product_bundle", current)).structuredContent.result.published).toBe(false);
    expect((await invoke("authoring.publish_product_bundle", args)).structuredContent.error).toBe("PRODUCT_BUNDLE_STALE_CONTEXT");
  }
  const discardable = fixture(3, "Draft to discard", false, "-discard");
  const discardImport = await stage(discardable);
  const discardArgs = { runToken, bootstrapToken, importId: discardImport.importId, expectedRevision: discardable.data.checksum };
  expect((await invoke("authoring.discard_product_draft", { ...discardArgs, expectedRevision: "0".repeat(64) })).structuredContent.error).toBe("PRODUCT_BUNDLE_STALE_CONTEXT");
  expect(await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, discardImport.importId))).toHaveLength(1);
  expect((await invoke("authoring.discard_product_draft", discardArgs)).structuredContent.result.discarded).toBe(true);
  expect(await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, discardImport.importId))).toHaveLength(0);
  const dependency = { id: "external-live", upstreamEntityType: "product" as const, upstreamEntityId: "set-2", upstreamVersion: 1, upstreamHash: ideaHash, downstreamEntityType: "flashcard_set" as const, downstreamEntityId: "set-3", downstreamVersion: 1, downstreamHash: ideaHash, freshness: "UP_TO_DATE" as const };
  const dependencyInput = { courseId: "course", products: fixture(3, "Dependency check").data.products, dependencies: [dependency] };
  await expect(assertLiveProductBundleDependencies(dependencyInput)).resolves.toBeUndefined();
  await testDb.update(schema.setFlashcard).set({ status: "retired" }).where(eq(schema.setFlashcard.id, "set-2"));
  await expect(assertLiveProductBundleDependencies(dependencyInput)).rejects.toThrow("PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW");
  for (const version of [2, 3] as const) {
    const published = fixture(version, "Revised");
    const [row] = await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.bundleId, published.data.manifest.bundleId));
    const args = { runToken, bootstrapToken, importId: row.id, expectedRevision: published.data.checksum };
    expect((await invoke("authoring.withdraw_product_bundle", args, ["authoring:read"])).structuredContent.error).toBe("AUTHORING_MCP_SCOPE_REQUIRED");
    expect((await invoke("authoring.withdraw_product_bundle", { ...args, expectedRevision: "0".repeat(64) })).structuredContent.error).toBe("PRODUCT_BUNDLE_STALE_CONTEXT");
    expect((await invoke("authoring.withdraw_product_bundle", { ...args, runToken: boundRun({ workflow: "idea_product", courseId: "course", chapterId: "other" }) })).structuredContent.error).toBe("AUTHORING_MCP_IMPORT_SCOPE_MISMATCH");
    const { runToken: _run, ...exact } = args;
    expect((await invoke("authoring.withdraw_product_bundle", exact)).structuredContent.error).toBe("AUTHORING_MCP_RUN_REQUIRED");
    expect((await invoke("authoring.withdraw_product_bundle", { ...exact, recovery: "exact_import" })).structuredContent.result.withdrawn).toBe(true);
    if (version === 2) {
      await testDb.insert(schema.courses).values({ id: "wrong-withdrawal-course", title: "Other", category: "Test" });
      await testDb.update(schema.imporBundle).set({ courseId: "wrong-withdrawal-course" }).where(eq(schema.imporBundle.id, row.id));
      expect((await invoke("authoring.withdraw_product_bundle", { ...exact, recovery: "exact_import" })).structuredContent.error).toBe("AUTHORING_MCP_IMPORT_COURSE_SCOPE_MISMATCH");
      await testDb.update(schema.imporBundle).set({ courseId: "course" }).where(eq(schema.imporBundle.id, row.id));
    }
    expect((await invoke("authoring.withdraw_product_bundle", args)).structuredContent.result.withdrawn).toBe(false);
  }
  const chapterDraft = fixture(3, "Preserve this review", false, "-chapter-target");
  const chapterImport = await stage(chapterDraft);
  await testDb.insert(schema.reviewBundle).values({ id: "chapter-target-review", imporBundleId: chapterImport.importId, reviewerId: "admin", status: "approved" });
  const chapterReplacement = fixture(3, "Valid chapter B replacement", false, "", chapterDraft.data.manifest.bundleId, "chapter-b");
  const objectCount = objects.size;
  const deniedRestage = await invoke("authoring.restage_product_bundle", { runToken: boundRun({ workflow: "idea_product", courseId: "course", chapterId: "chapter-b" }), bootstrapToken, importId: chapterImport.importId, expectedRevision: chapterDraft.data.checksum, filename: "chapter-b.zip", bundleBase64: Buffer.from(chapterReplacement.bytes).toString("base64") });
  expect(deniedRestage.structuredContent.error).toBe("AUTHORING_MCP_IMPORT_SCOPE_MISMATCH");
  expect((await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, chapterImport.importId)))[0].checksum).toBe(chapterDraft.data.checksum);
  expect(await testDb.select().from(schema.reviewBundle).where(eq(schema.reviewBundle.id, "chapter-target-review"))).toHaveLength(1);
  expect(objects.size).toBe(objectCount);
  const legacyAssessment = fixture(2, "Assessment", true);
  const stagedAssessment = await stage(legacyAssessment);
  await testDb.insert(schema.reviewBundle).values({ id: "assessment-target-review", imporBundleId: stagedAssessment.importId, reviewerId: "admin", status: "approved" });
  const learningReplacement = fixture(3, "Learning-only replacement", false, "", legacyAssessment.data.manifest.bundleId);
  const assessmentObjectCount = objects.size;
  expect((await invoke("authoring.restage_product_bundle", { runToken, bootstrapToken, importId: stagedAssessment.importId, expectedRevision: legacyAssessment.data.checksum, filename: "learning.zip", bundleBase64: Buffer.from(learningReplacement.bytes).toString("base64") })).structuredContent.error).toBe("PRODUCT_BUNDLE_ASSESSMENT_FORBIDDEN");
  expect((await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, stagedAssessment.importId)))[0].checksum).toBe(legacyAssessment.data.checksum);
  expect(await testDb.select().from(schema.reviewBundle).where(eq(schema.reviewBundle.id, "assessment-target-review"))).toHaveLength(1);
  expect(objects.size).toBe(assessmentObjectCount);

  const args = { runToken, bootstrapToken, importId: stagedAssessment.importId, expectedRevision: legacyAssessment.data.checksum };
  expect((await invoke("authoring.publish_product_bundle", args)).structuredContent.error).toBe("PRODUCT_BUNDLE_ASSESSMENT_FORBIDDEN");
  expect((await invoke("authoring.review_product_bundle", { ...args, decision: "approved" })).structuredContent.error).toBe("PRODUCT_BUNDLE_ASSESSMENT_FORBIDDEN");
}, 30_000);
