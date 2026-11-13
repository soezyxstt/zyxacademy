import { issueBoundMcpRunToken } from "../helpers/mcp-run";
import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { zipSync } from "fflate";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { computeProductBundleChecksum, deterministicProductSerialization, findInvalidProductDependency, parseProductBundle, type ProductDependency, type ProductEntity } from "@/lib/bundle/product-validator";

process.env.BETTER_AUTH_SECRET = "local-dependency-scope-regression-secret";
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
const { stageProductBundle, reviewProductBundle } = await import("@/lib/bundle/product-staging");
const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");
const { currentPublisherProductReadiness } = await import("@/lib/bundle/product-readiness");
const { createAuthoringMcpServer } = await import("@/lib/authoring/mcp-server");
const { issueMcpBootstrapToken, readMcpBootstrapToken, issueMcpRunToken } = await import("@/lib/authoring/mcp-workflows");
afterAll(async () => { await client.close(); });

const a = "a".repeat(64), b = "b".repeat(64);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const base = { courseId: "legacy-main", chapterId: "chapter", version: 1, status: "draft" as const, schemaVersion: "1.0", sourceHash: b, generationHash: a, creatorId: "admin", ideaLinks: [{ id: "idea", version: 1, semanticHash: a, weight: 1, role: "primary" as const }], sourceRefs: [{ sourceId: "source", version: 1, checksum: b, excerptIds: ["chunk"] }] };
const products: ProductEntity[] = [
  { ...base, id: "set", productType: "flashcard_set", title: "Set", cards: ["card"] },
  { ...base, id: "card", productType: "flashcard", front: "Question?", back: "Answer", atomic: true },
];
const edge = (upstreamEntityType: ProductDependency["upstreamEntityType"], upstreamEntityId: string, upstreamHash = a, upstreamVersion = 1): ProductDependency => ({
  id: `edge-${upstreamEntityType}-${upstreamEntityId}`, upstreamEntityType, upstreamEntityId, upstreamVersion, upstreamHash,
  downstreamEntityType: "flashcard_set", downstreamEntityId: "set", downstreamVersion: 1, downstreamHash: a, freshness: "UP_TO_DATE",
});

function bundle(profile: 2 | 3, dependencies: ProductDependency[]) {
  const encode = (value: unknown) => new TextEncoder().encode(deterministicProductSerialization(value));
  const files = new Map([["products.json", encode(products)], ["dependencies.json", encode(dependencies)]]);
  const manifest = { bundleId: `scope-${profile}`, bundleType: "product" as const, schemaVersion: `product-bundle.v${profile}` as "product-bundle.v2" | "product-bundle.v3", courseId: "legacy-main", creatorId: "admin", createdAt: "2026-01-01T00:00:00Z", conflicts: [], entityFiles: [
    { path: "products.json", entityType: "products" as const, checksum: sha(files.get("products.json")!), stableIds: products.map(product => product.id) },
    { path: "dependencies.json", entityType: "dependencies" as const, checksum: sha(files.get("dependencies.json")!), stableIds: dependencies.map(dependency => dependency.id) },
  ] };
  files.set("manifest.json", encode({ ...manifest, bundleChecksum: computeProductBundleChecksum(manifest, files) }));
  return { parsed: parseProductBundle(files), bytes: zipSync(Object.fromEntries(files), { level: 0 }) };
}

beforeAll(async () => {
  await testDb.insert(schema.courses).values([{ id: "legacy-main", title: "Main", category: "Matematika" as const }, { id: "legacy-other", title: "Other", category: "Matematika" as const }]);
  await testDb.insert(schema.mataKuliah).values([{ id: "main", code: "M", title: "Main", legacyCourseId: "legacy-main" }, { id: "other", code: "O", title: "Other", legacyCourseId: "legacy-other" }]);
  await testDb.insert(schema.user).values({ id: "admin", name: "Admin", email: "admin@example.test", role: "admin" });
  await provisionPenggunaForNewUser({ id: "admin", role: "admin" });
  await testDb.insert(schema.bab).values([{ id: "chapter", mataKuliahId: "main", code: "M1", title: "Main", orderIndex: 0 }, { id: "other-chapter", mataKuliahId: "other", code: "O1", title: "Other", orderIndex: 0 }]);
  for (const [id, courseId, chapterId] of [["idea", "main", "chapter"], ["other-idea", "other", "other-chapter"]]) {
    await testDb.insert(schema.ide).values({ id, mataKuliahId: courseId, babId: chapterId, stableKey: id, code: id, canonicalStatement: "Idea", conciseExplanation: "Explanation", status: "published", semanticHash: a, generationHash: a, creatorId: "admin" });
  }
  for (const [id, courseId] of [["source", "main"], ["other-source", "other"]]) {
    await testDb.insert(schema.sumberMateri).values({ id, mataKuliahId: courseId, sourceType: "markdown", title: id, canonicalUriOrR2Key: `${id}.md`, version: 1, checksum: b, status: "active", creatorId: "admin" });
    await testDb.insert(schema.potonganSumber).values({ id: id === "source" ? "chunk" : "other-chunk", sumberMateriId: id, sourceVersion: 1, content: "Text", startOffset: 0, endOffset: 4, checksum: b });
  }
  await testDb.insert(schema.setFlashcard).values([
    { id: "same-set:v2", mataKuliahId: "main", title: "Same", version: 2, status: "published", generationHash: a, creatorId: "admin" },
    { id: "other-set", mataKuliahId: "other", title: "Other", version: 1, status: "published", generationHash: a, creatorId: "admin" },
  ]);
  await testDb.insert(schema.flashcard).values({ id: "other-card", setFlashcardId: "other-set", front: "Q", back: "A", status: "published", generationHash: a });
  await testDb.insert(schema.soal).values({ id: "other-question", mataKuliahId: "other", questionType: "essay", prompt: "Q", status: "published", difficulty: "easy", cognitiveLevel: "understand", reasoningPattern: "definition", generationHash: a, creatorId: "admin" });
  await testDb.insert(schema.pembahasanSoal).values({ id: "other-solution", soalId: "other-question", content: "A", status: "published", generationHash: a, creatorId: "admin" });
  await testDb.insert(schema.artikel).values({ id: "other-article", mataKuliahId: "other", slug: "other-article", title: "Other", contentMarkdown: "Text", status: "published", sourceHash: b, generationHash: a, creatorId: "admin" });
  await testDb.insert(schema.diktatMateri).values({ id: "other-diktat", mataKuliahId: "other", title: "Other", contentMarkdown: "Text", status: "published", sourceHash: b, generationHash: a, creatorId: "admin" });
  await testDb.insert(schema.blueprintAsesmen).values([
    { id: "same-blueprint", mataKuliahId: "main", title: "Same", assessmentType: "quiz", blueprint: {}, status: "approved", generationHash: a, creatorId: "admin" },
    { id: "other-blueprint", mataKuliahId: "other", title: "Other", assessmentType: "quiz", blueprint: {}, status: "approved", generationHash: a, creatorId: "admin" },
  ]);
});

test("V2 and V3 bind every target and local Product upstream to the bundled revision", async () => {
  const valid = edge("product", "card");
  const twoVersions = [...products, { ...products[0], version: 2 }, { ...products[1], version: 2 }];
  expect(findInvalidProductDependency([valid], twoVersions)).toBeNull();
  expect(findInvalidProductDependency([{ ...valid, upstreamVersion: 2, downstreamVersion: 2 }], twoVersions)).toBeNull();
  for (const profile of [2, 3] as const) {
    expect(bundle(profile, [valid]).parsed.success).toBe(true);
    const invalid: ProductDependency[] = [
      { ...valid, downstreamEntityId: "foreign-product" },
      { ...valid, downstreamEntityType: "flashcard" },
      { ...valid, downstreamVersion: 2 },
      { ...valid, downstreamHash: b },
    ];
    for (const dependency of invalid) {
      const result = bundle(profile, [dependency]).parsed;
      expect(result.success).toBe(false);
      if (!result.success) expect(result.issues[0].code).toBe("PRODUCT_DEPENDENCY_TARGET_MISMATCH");
      await expect(assertLiveProductBundleDependencies({ courseId: "legacy-main", products, dependencies: [dependency] })).rejects.toThrow("PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW");
    }
    for (const dependency of [{ ...valid, upstreamVersion: 2 }, { ...valid, upstreamHash: b }]) {
      const result = bundle(profile, [dependency]).parsed;
      expect(result.success).toBe(false);
      if (!result.success) expect(result.issues[0].code).toBe("PRODUCT_DEPENDENCY_LOCAL_UPSTREAM_MISMATCH");
    }
  }
  const diktat: ProductEntity = { ...base, id: "diktat", productType: "diktat", title: "Diktat", contentMarkdown: "Text", sourceArticleId: "card", sourceArticleVersion: 1, sourceArticleHash: a };
  const wrongType = { ...valid, downstreamEntityType: "diktat" as const, downstreamEntityId: "diktat" };
  expect(findInvalidProductDependency([wrongType], [...products, diktat])?.code).toBe("PRODUCT_DEPENDENCY_LOCAL_UPSTREAM_MISMATCH");
});

test("live readiness and publication reject cross-course upstreams, including parent-owned records", async () => {
  const input = (dependency: ProductDependency) => ({ courseId: "legacy-main", products, dependencies: [dependency] });
  for (const dependency of [edge("idea", "idea"), edge("source_material", "source", b), edge("source_chunk", "chunk", b), edge("product", "same-set", a, 2), edge("product", "same-blueprint")]) {
    await expect(assertLiveProductBundleDependencies(input(dependency))).resolves.toBeUndefined();
  }
  const foreign = [edge("idea", "other-idea"), edge("source_material", "other-source", b), edge("source_chunk", "other-chunk", b), ...["other-set", "other-card", "other-question", "other-solution", "other-article", "other-diktat", "other-blueprint"].map(id => edge("product", id))];
  for (const dependency of foreign) await expect(assertLiveProductBundleDependencies(input(dependency))).rejects.toThrow("PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW");
  await testDb.update(schema.setFlashcard).set({ status: "retired" }).where(eq(schema.setFlashcard.id, "same-set:v2"));
  await expect(assertLiveProductBundleDependencies(input(edge("product", "same-set", a, 2)))).rejects.toThrow("PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW");

  for (const profile of [2, 3] as const) {
    const { parsed, bytes } = bundle(profile, [edge("source_chunk", "other-chunk", b)]);
    if (!parsed.success) throw new Error(JSON.stringify(parsed.issues));
    const staged = await stageProductBundle({ bundle: parsed.data, bytes, runId: "scope-run", bundleId: parsed.data.manifest.bundleId, courseId: "legacy-main", checksum: parsed.data.checksum, requestedBy: "admin" });
    await reviewProductBundle({ importId: staged.importId, reviewerId: "admin", decision: "approved", expectedRevision: parsed.data.checksum });
    const readiness = await currentPublisherProductReadiness(staged.importId, "admin");
    expect(readiness.publicationReady).toBe(false);
    expect(readiness.blockingIssueCodes).toContain("PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW");
    await expect(publishProductBundle({ importId: staged.importId, publishedBy: "admin", expectedRevision: parsed.data.checksum })).rejects.toThrow("PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW");
    expect(await testDb.select().from(schema.ketergantunganProduk)).toHaveLength(0);
    expect((await testDb.select().from(schema.imporBundle).where(eq(schema.imporBundle.id, staged.importId)))[0].status).toBe("draft");
  }
  const chunkOnlyInput = { ...input(edge("source_chunk", "chunk", b)), products: products.map(product => ({ ...product, sourceRefs: [] })) };
  await testDb.update(schema.sumberMateri).set({ status: "archived" }).where(eq(schema.sumberMateri.id, "source"));
  await expect(assertLiveProductBundleDependencies(chunkOnlyInput)).rejects.toThrow("PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW");
  await testDb.update(schema.sumberMateri).set({ status: "active", version: 2 }).where(eq(schema.sumberMateri.id, "source"));
  await expect(assertLiveProductBundleDependencies(chunkOnlyInput)).rejects.toThrow("PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW");
  await testDb.update(schema.sumberMateri).set({ version: 1 }).where(eq(schema.sumberMateri.id, "source"));
  // A different canonical course may have the same ID as the bundle's legacy ID.
  await testDb.insert(schema.mataKuliah).values({ id: "legacy-main", code: "COLLISION", title: "Collision" });
  await testDb.insert(schema.setFlashcard).values({ id: "collision-set", mataKuliahId: "legacy-main", title: "Collision", status: "published", generationHash: a, creatorId: "admin" });
  await expect(assertLiveProductBundleDependencies({ courseId: "main", products, dependencies: [edge("product", "collision-set")] })).rejects.toThrow("PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW");
  await expect(assertLiveProductBundleDependencies({ courseId: "legacy-main", products, dependencies: [] })).rejects.toThrow("PRODUCT_BUNDLE_COURSE_AMBIGUOUS");
});

test("Idea and Product submit and restage bind both token and run bootstrap to the caller session", async () => {
  const principal = { userId: "admin", actorId: "admin", sessionId: "current-session", scopes: ["authoring:stage"], authMethod: "oauth" as const };
  const capabilities = { independentSubagents: true, localArtifactFiles: true, pdfRendering: false };
  async function invoke(name: string, input: Record<string, unknown>) {
    const server = createAuthoringMcpServer(principal);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const response = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: input } }) }));
    return (await response.json() as any).result.structuredContent;
  }
  for (const stage of ["idea", "product"] as const) {
    const token = issueMcpBootstrapToken({ actorId: "admin", sessionId: "other-session", stage, clientCapabilities: capabilities });
    const { kind: _kind, issuedAt: _issuedAt, expiresAt: _expiresAt, ...bootstrap } = readMcpBootstrapToken(token);
    const runToken = issueMcpRunToken({ workflow: "idea_product", courseId: "legacy-main", chapterId: "chapter" });
    const boundRunToken = issueMcpRunToken({ workflow: "idea_product", courseId: "legacy-main", chapterId: "chapter", bootstrap });
    const common = { filename: "invalid.zip", bundleBase64: Buffer.from(zipSync({ "manifest.json": new TextEncoder().encode("{}") }, { level: 0 })).toString("base64") };
    for (const action of ["submit", "restage"] as const) {
      const extra = action === "restage" ? { importId: "import", expectedRevision: a } : {};
      const name = `authoring.${action}_${stage}_bundle`;
      expect((await invoke(name, { ...common, ...extra, runToken, bootstrapToken: token })).error).toBe("AUTHORING_MCP_BOOTSTRAP_SESSION_MISMATCH");
      expect((await invoke(name, { ...common, ...extra, runToken: boundRunToken })).error).toBe("AUTHORING_MCP_BOOTSTRAP_SESSION_MISMATCH");
      const validToken = issueMcpBootstrapToken({ actorId: "admin", sessionId: "current-session", stage, clientCapabilities: capabilities });
      expect((await invoke(name, { ...common, ...extra, runToken: boundRunToken, bootstrapToken: validToken })).error).toBe("AUTHORING_MCP_BOOTSTRAP_SESSION_MISMATCH");
      const authorized = await invoke(name, { ...common, ...extra, runToken, bootstrapToken: validToken });
      if (action === "restage") {
        expect(authorized.error).toBe("AUTHORING_MCP_LEGACY_RUN_RESTART_REQUIRED");
        const currentRun = issueBoundMcpRunToken({ workflow: "idea_product", courseId: "legacy-main", chapterId: "chapter" }, validToken);
        expect((await invoke(name, { ...common, ...extra, runToken: currentRun, bootstrapToken: validToken })).error).toBe(stage === "idea" ? "IDEA_BUNDLE_NOT_FOUND" : "PRODUCT_BUNDLE_NOT_FOUND");
      }
      else expect(authorized).toMatchObject({ ok: false, valid: false, staged: false });
    }
  }
});
