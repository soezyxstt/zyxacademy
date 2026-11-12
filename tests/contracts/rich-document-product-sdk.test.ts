import { expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { unzipSync, zipSync, strToU8 } from "fflate";

process.env.BETTER_AUTH_SECRET = "local-test-secret-at-least-thirty-two-characters";
mock.module("server-only", () => ({}));
let ideaRows: unknown[] = [];
let currentCourse = "";
let currentChapter = "";
let sourceRow: any;
let sourceLookup = false;
let tables: Record<string, unknown> = {};
const inserted: Array<{ table: unknown; values: any }> = [];
const objects = new Map<string, Uint8Array>();
const db = { select: () => ({ from: (table: unknown) => {
  const rows = table === tables.ide ? ideaRows : table === tables.pengguna ? [{ id: "local" }] : table === tables.courses ? [{ id: currentCourse }] : table === tables.mataKuliah ? [{ id: currentCourse, code: currentCourse, title: currentCourse }] : table === tables.bab ? [{ id: currentChapter, courseId: currentCourse, code: currentChapter, title: currentChapter, orderIndex: 1 }] : table === tables.imporBundle ? (sourceLookup ? [sourceRow] : []) : null;
  if (!rows) throw new Error("UNEXPECTED_DATABASE_TABLE");
  const query: any = { where: () => query, orderBy: async () => rows, limit: async () => rows, then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject) };
  return query;
} }), transaction: async (fn: (tx: unknown) => Promise<void>) => fn({ insert: (table: unknown) => ({ values: async (values: unknown) => { if (![tables.imporBundle, tables.itemImporBundle, tables.auditMutasi].includes(table)) throw new Error("UNEXPECTED_INSERT"); inserted.push({ table, values }); } }) }) };
mock.module("@/db", () => ({ db }));
mock.module("@/lib/db", () => ({ db }));
mock.module("@/lib/storage", () => ({ storage: { exists: async (key: string) => objects.has(key), upload: async (bytes: Uint8Array, _name: string, _mime: string, options: { key: string }) => { objects.set(options.key, Uint8Array.from(bytes)); }, download: async (key: string) => { const bytes = objects.get(key); if (!bytes) throw new Error("MISSING_LOCAL_OBJECT"); return bytes; }, delete: async (key: string) => { objects.delete(key); } } }));

const schema = await import("@/db/schema");
tables = { ide: schema.ide, pengguna: schema.pengguna, courses: schema.courses, mataKuliah: schema.mataKuliah, bab: schema.bab, imporBundle: schema.imporBundle, itemImporBundle: schema.itemImporBundle, auditMutasi: schema.auditMutasi };
const { createAuthoringMcpServer } = await import("@/lib/authoring/mcp-server");
const { validateSourcePack } = await import("@/lib/authoring/source-pack");
const { readInteractiveDocumentAsset } = await import("@/lib/materials/interactive-document-assets");
const { RECOMMENDED_PLUGIN_VERSION } = await import("@/lib/authoring/mcp-playbook");
const { computeProductBundleChecksum, deterministicProductSerialization } = await import("@/lib/bundle/product-validator");
const { buildLocalVerificationFixture } = await import("../../scripts/authoring/local-verification-fixture");
const { createThermalArticle } = await import("../visual/fixtures/thermal-article-data");
const { readRichDocumentPair, richDocumentCases, pairEntries } = await import("../visual/fixtures/rich-document-packages");
const { richArticleArchive, createRichArticle, localHash } = await import("../visual/fixtures/rich-document-articles");

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sampleSourcePack(packId = "source-pack-test-01", provider: "google" | "openai" = "google"): { bytes: Uint8Array; originalSha256: string; markdownText: string } {
  const markdownText = "<!-- source-unit: 1 -->\n# Kalkulus Dasar\nLimit fungsi mendekati nol.\n";
  const markdown = strToU8(markdownText);
  const original = strToU8("PDF Content Mock");
  const originalSha256 = digest(original);
  const coverage = {
    documentId: "doc-kalkulus-01",
    status: "complete",
    expectedUnits: 1,
    processedUnits: [1],
    inventory: { headings: 1, formulas: 0, tables: 0, examples: 0, applications: 0, visuals: 0, questions: 0, solutions: 0 },
    outputCounts: { headings: 1, formulas: 0, tables: 0, examples: 0, applications: 0, visualExplanations: 0, questions: 0, solutions: 0 },
    unresolved: [],
    reviewPasses: ["inventory", "transcription", "visual", "reconciliation"],
  };
  const manifest = {
    schemaVersion: "zyx-source-pack.v1",
    packId,
    name: "Kalkulus Bab 1",
    language: "id",
    createdAt: "2026-08-28T00:00:00.000Z",
    generator: { provider, model: provider === "openai" ? "gpt-6" : "test", promptVersion: "stored-source.v1" },
    documents: [{
      id: "doc-kalkulus-01",
      title: "Materi Limit",
      originalFilename: "limit.pdf",
      originalMediaType: "application/pdf",
      originalSha256,
      role: "material",
      unitKind: "page",
      expectedUnits: 1,
      markdownPath: "documents/001-limit.md",
      coveragePath: "coverage/doc-kalkulus-01.json",
      markdownSha256: digest(markdown),
    }],
  };
  const bytes = zipSync({
    "manifest.json": strToU8(`${JSON.stringify(manifest)}\n`),
    "documents/001-limit.md": markdown,
    "coverage/doc-kalkulus-01.json": strToU8(`${JSON.stringify(coverage)}\n`),
  });
  return { bytes, originalSha256, markdownText };
}


function rawArchive(article: any, pair: Awaited<ReturnType<typeof readRichDocumentPair>>) {
  const encode = (x: unknown) => new TextEncoder().encode(deterministicProductSerialization(x));
  const hash = (x: Uint8Array) => createHash("sha256").update(x).digest("hex");
  const entries = pairEntries(pair);
  const files = new Map<string, Uint8Array>([["products.json", encode([article])], ["dependencies.json", encode([])], ...entries.map(e => [e.path, e.data] as [string, Uint8Array])]);
  const manifest = { ...buildLocalVerificationFixture().bundle.manifest, bundleId: "thermal-bundle", courseId: article.courseId, creatorId: article.creatorId, curatorId: article.curatorId, entityFiles: [{ path: "products.json", entityType: "products", checksum: hash(files.get("products.json")!), stableIds: [article.id] }, { path: "dependencies.json", entityType: "dependencies", checksum: hash(files.get("dependencies.json")!), stableIds: [] }], visualAssets: entries.map(({ data: _data, ...entry }) => entry), bundleChecksum: undefined };
  files.set("manifest.json", encode({ ...manifest, bundleChecksum: computeProductBundleChecksum(manifest as any, files) }));
  return zipSync(Object.fromEntries(files));
}

test("actual Product V4 packages through the in-memory MCP SDK", async () => {
  process.env.BETTER_AUTH_SECRET = "local-test-secret-at-least-thirty-two-characters";
  const principal = { userId: "local", actorId: "local", sessionId: "session", authMethod: "session" as const, scopes: ["authoring:read", "authoring:stage"] };
  const server = createAuthoringMcpServer(principal), client = new Client({ name: "rich-product-sdk", version: "1.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const requestSizes = new Map<string, number>();
  const send = ct.send.bind(ct);
  ct.send = async (message, options) => {
    const request = message as any;
    if (request.method === "tools/call" && request.params?.arguments?.filename) requestSizes.set(`${request.params.name}:${request.params.arguments.filename}`, Buffer.byteLength(JSON.stringify(message)));
    return send(message, options);
  };
  await Promise.all([server.connect(st), client.connect(ct)]);
  const results: any = { transport: "local MCP SDK InMemoryTransport", cases: {}, negatives: {}, limitations: ["Mock DB/storage; no HTTP, OAuth, real service, publication or provider limit exercised.", "Synthetic Source Packs and Ideas; independentSubagents capability is simulated solely to test protocol. No independent reviews occurred."] };
  const call = async (name: string, args: Record<string, unknown>) => { const response = await client.callTool({ name, arguments: args }); if (response.isError) throw new Error(`${name}: ${JSON.stringify(response.structuredContent)}`); return response.structuredContent as any; };
  try {
    const playbook = await call("workflow.get_playbook", { skill: "zyx-product-bundle-mcp", bootstrapProtocol: 1, pluginVersion: RECOMMENDED_PLUGIN_VERSION, clientCapabilities: { independentSubagents: true, localArtifactFiles: true, pdfRendering: false } });
    const bootstrapToken = playbook.bootstrapToken;
    expect(bootstrapToken).toBeTruthy();
    const start = async (courseId: string, chapterId: string) => {
      currentCourse = courseId; currentChapter = chapterId;
      const packId = `source-${courseId}-${chapterId}`;
      const pack = validateSourcePack(sampleSourcePack(packId).bytes);
      sourceRow = { id: `import-${packId}`, bundleType: "source", bundleId: packId, checksum: pack.archive.checksum, status: "validated", courseId, sourceUriOrKey: `local/${packId}`, createdAt: new Date(), updatedAt: new Date(), validationReport: { valid: true, name: pack.manifest.name, courseId, chapterId } };
      const courseKey = (await call("catalog.list_courses", {})).choices[0].key;
      const chapterKey = (await call("catalog.list_chapters", { courseKey })).choices[0].key;
      sourceLookup = true;
      try { return (await call("workflow.start", { workflow: "idea_product", courseKey, chapterKey, sourcePackId: packId, sourcePackImportId: sourceRow.id, bootstrapToken })).runToken as string; }
      finally { sourceLookup = false; }
    };
    for (const id of [...richDocumentCases, "thermal"] as const) {
      const brick = id === "thermal" ? await readRichDocumentPair("brick") : null;
      const archive = id === "thermal" ? { pair: brick!, article: createThermalArticle(brick!.spec), zip: rawArchive(createThermalArticle(brick!.spec), brick!) } : await richArticleArchive(id);
      const article = archive.article;
      if (!article.chapterId) throw new Error("FIXTURE_CHAPTER_REQUIRED");
      const runToken = await start(article.courseId, article.chapterId);
      const contract = await call("workflow.get_contract", { runToken, bootstrapToken });
      expect(contract.ok).toBe(true);
      ideaRows = [{ id: id === "thermal" ? "thermal-diffusion" : `${id}-idea`, courseId: article.courseId, version: 1, semanticHash: localHash, status: "published" }];
      const args = { runToken, bootstrapToken, filename: `${id}.zip`, bundleBase64: Buffer.from(archive.zip).toString("base64") };
      const validation = await call("authoring.validate_product_bundle", args);
      expect(validation.valid).toBe(true);
      expect(validation.publicationReady).toBe(false);
      const before = inserted.length;
      const staged = await call("authoring.submit_product_bundle", args);
      expect(staged.staged).toBe(true);
      expect(staged.publicationReady).toBe(false);
      const stored = inserted.slice(before).find(row => row.table === tables.imporBundle)?.values;
      const items = inserted.slice(before).find(row => row.table === tables.itemImporBundle)?.values;
      expect(stored).toMatchObject({ bundleId: validation.bundleId, checksum: validation.checksum, courseId: article.courseId, status: "draft", validationReport: { articleId: article.id, chapterId: article.chapterId } });
      expect(items).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "article", entityId: article.id, imporBundleId: stored.id })]));
      const storedZip = objects.get(stored.sourceUriOrKey)!;
      expect(Buffer.from(storedZip)).toEqual(Buffer.from(archive.zip));
      const storedFiles = unzipSync(storedZip);
      const storedArticle = JSON.parse(new TextDecoder().decode(storedFiles["products.json"]))[0];
      expect(storedArticle.visuals).toContainEqual(archive.pair.spec);
      expect(Buffer.from(await readInteractiveDocumentAsset(storedArticle.visuals.find((v: any) => v.id === archive.pair.spec.id), "document"))).toEqual(Buffer.from(archive.pair.document));
      expect(Buffer.from(await readInteractiveDocumentAsset(storedArticle.visuals.find((v: any) => v.id === archive.pair.spec.id), "print"))).toEqual(Buffer.from(archive.pair.print));
      results.cases[id] = { zipBytes: archive.zip.byteLength, requestBytes: requestSizes.get(`authoring.validate_product_bundle:${args.filename}`), response: validation, stageRequestBytes: requestSizes.get(`authoring.submit_product_bundle:${args.filename}`), stage: { staged: staged.staged, publicationReady: staged.publicationReady, bundleId: stored.bundleId, articleId: article.id, courseId: article.courseId, chapterId: article.chapterId } };
      if (id === "museum") {
        const files = unzipSync(archive.zip);
        delete files[`visuals/${archive.pair.spec.printSha256}.png`];
        const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
        manifest.bundleChecksum = computeProductBundleChecksum(manifest, new Map(Object.entries(files)));
        files["manifest.json"] = new TextEncoder().encode(deterministicProductSerialization(manifest));
        const missing = await call("authoring.validate_product_bundle", { ...args, filename: "missing.zip", bundleBase64: Buffer.from(zipSync(files)).toString("base64") });
        expect(missing.valid).toBe(false);
        expect(missing.issues[0].code).toBe("INTERACTIVE_DOCUMENT_ASSET_MISSING");
        const wrongRun = await start(article.courseId, "other-chapter");
        const wrongChapter = await call("authoring.validate_product_bundle", { ...args, runToken: wrongRun });
        expect(wrongChapter.valid).toBe(false);
        expect(wrongChapter.issues.map((issue: any) => issue.code)).toContain("AUTHORING_MCP_CHAPTER_SCOPE_MISMATCH");
        ideaRows = [{ id: "museum-idea", courseId: "other-course", version: 1, semanticHash: localHash, status: "published" }];
        const wrongIdea = await call("authoring.validate_product_bundle", args);
        expect(wrongIdea.valid).toBe(false);
        expect(wrongIdea.issues.map((issue: any) => issue.code)).toContain("PRODUCT_BUNDLE_IDEA_COURSE_MISMATCH");
        const deniedServer = createAuthoringMcpServer({ ...principal, scopes: [] });
        const deniedClient = new Client({ name: "scope-negative", version: "1" });
        const [dc, ds] = InMemoryTransport.createLinkedPair();
        await Promise.all([deniedServer.connect(ds), deniedClient.connect(dc)]);
        try { expect((await deniedClient.callTool({ name: "authoring.validate_product_bundle", arguments: args })).isError).toBe(true); }
        finally { await deniedClient.close(); await deniedServer.close(); }
        results.negatives = { missingPair: true, wrongChapter: true, wrongIdeaCourse: true, missingReadScope: true };
      }
    }
    await mkdir("artifacts/visual-quality/quality-95", { recursive: true });
    await writeFile("artifacts/visual-quality/quality-95/product-sdk-results.json", JSON.stringify(results, null, 2));
  } finally { await client.close(); await server.close(); }
}, 120_000);

test("synthetic Source Pack starts and stages a scoped Product workflow", async () => {
  process.env.BETTER_AUTH_SECRET = "local-test-secret-at-least-thirty-two-characters";
  const principal = { userId: "local", actorId: "local", sessionId: "session", authMethod: "session" as const, scopes: ["authoring:read", "authoring:stage"] };
  const server = createAuthoringMcpServer(principal), client = new Client({ name: "synthetic-source-start", version: "1" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  const call = async (name: string, args: Record<string, unknown>) => { const result = await client.callTool({ name, arguments: args }); expect(result.isError).not.toBe(true); return result.structuredContent as any; };
  try {
    currentCourse = "museum-course"; currentChapter = "museum-chapter";
    const pack = validateSourcePack(sampleSourcePack("synthetic-pack").bytes);
    sourceRow = { id: "synthetic-import", bundleType: "source", bundleId: pack.manifest.packId, checksum: pack.archive.checksum, status: "validated", courseId: currentCourse, sourceUriOrKey: "local/source", createdAt: new Date(), updatedAt: new Date(), validationReport: { valid: true, name: pack.manifest.name, courseId: currentCourse, chapterId: currentChapter } };
    const bootstrapToken = (await call("workflow.get_playbook", { skill: "zyx-product-bundle-mcp", bootstrapProtocol: 1, pluginVersion: RECOMMENDED_PLUGIN_VERSION, clientCapabilities: { independentSubagents: true, localArtifactFiles: true, pdfRendering: false } })).bootstrapToken;
    const courseKey = (await call("catalog.list_courses", {})).choices[0].key;
    const chapterKey = (await call("catalog.list_chapters", { courseKey })).choices[0].key;
    sourceLookup = true;
    const started = await call("workflow.start", { workflow: "idea_product", courseKey, chapterKey, sourcePackId: pack.manifest.packId, sourcePackImportId: sourceRow.id, bootstrapToken });
    sourceLookup = false;
    expect(started.runToken).toBeTruthy();
    expect((await call("workflow.get_contract", { runToken: started.runToken, bootstrapToken })).ok).toBe(true);
    const sharp = (await import("sharp")).default;
    const document = Buffer.from("<!doctype html><html lang=\"id\"><body>Denah sintetis</body></html>");
    const print = await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } }).png().toBuffer();
    const spec = { id: "synthetic-visual", kind: "interactive_document" as const, version: 1 as const, label: "Denah", description: "Denah sintetis", documentSha256: digest(document), documentBytes: document.length, printSha256: digest(print), printBytes: print.length, height: 240, staticFallback: { type: "text" as const, summary: "Denah", content: "Denah" }, printCaption: "Denah" };
    const article = createRichArticle("museum", spec);
    const { productArchive } = await import("../visual/fixtures/rich-document-packages");
    const manifest = { ...buildLocalVerificationFixture().bundle.manifest, bundleId: "synthetic-product", courseId: article.courseId, creatorId: article.creatorId, curatorId: article.curatorId };
    const archive = await productArchive({ manifest, products: [article], dependencies: [], pairs: [{ spec, document, print }] });
    ideaRows = [{ id: "museum-idea", courseId: currentCourse, version: 1, semanticHash: localHash, status: "published" }];
    const args = { runToken: started.runToken, bootstrapToken, filename: "synthetic.zip", bundleBase64: Buffer.from(archive.zip).toString("base64") };
    const validation = await call("authoring.validate_product_bundle", args);
    expect(validation.valid).toBe(true);
    expect(validation.publicationReady).toBe(false);
    const before = inserted.length;
    const staged = await call("authoring.submit_product_bundle", args);
    expect(staged.staged).toBe(true);
    expect(staged.publicationReady).toBe(false);
    const stored = inserted.slice(before).find(row => row.table === tables.imporBundle)?.values;
    expect(stored).toMatchObject({ bundleId: "synthetic-product", courseId: currentCourse, validationReport: { articleId: article.id, chapterId: currentChapter } });
    expect(Buffer.from(objects.get(stored.sourceUriOrKey)!)).toEqual(Buffer.from(archive.zip));
    expect(Buffer.from(await readInteractiveDocumentAsset(spec, "document"))).toEqual(document);
    expect(Buffer.from(await readInteractiveDocumentAsset(spec, "print"))).toEqual(print);
  } finally { sourceLookup = false; await client.close(); await server.close(); }
});


test("synthetic articles use distinct retrieval objectives and answer relationships", async () => {
  const { productEntitySchema } = await import("@/lib/bundle/product-validator");
  const spec = { id: "synthetic", kind: "interactive_document" as const, version: 1 as const, label: "Visual", description: "Visual model", documentSha256: "a".repeat(64), documentBytes: 1, printSha256: "b".repeat(64), printBytes: 1, height: 240, staticFallback: { type: "text" as const, summary: "Model", content: "Model" }, printCaption: "Model" };
  for (const id of richDocumentCases) {
    const article = productEntitySchema.parse(createRichArticle(id, spec));
    if (article.productType !== "article") throw new Error("ARTICLE_REQUIRED");
    const checks = article.sections.map(section => section.blocks.find(block => block.formativeCheckPayload)!);
    expect(new Set(checks.map(block => block.contentMarkdown)).size).toBe(3);
    expect(new Set(article.sections.map(section => {
      if (!section.pedagogy) throw new Error("FIXTURE_PEDAGOGY_REQUIRED");
      return section.pedagogy.objectives[0].description;
    })).size).toBe(3);
    for (const block of checks) {
      const check = block.formativeCheckPayload!;
      expect(check.options?.filter(option => option.isCorrect).map(option => option.text)).toEqual([check.answer]);
      expect(check.options?.some(option => !option.isCorrect && option.text !== check.answer)).toBe(true);
    }
  }
});
