import { describe, expect, test, beforeAll, beforeEach, mock } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { zipSync } from "fflate";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as schema from "@/db/schema";
import {
  createAuthoringMcpServer,
  type McpPrincipal,
} from "@/lib/authoring/mcp-server";
import {
  issueMcpRunToken,
  workflowContract,
} from "@/lib/authoring/mcp-workflows";
import { requestedScopes } from "@/lib/authoring/mcp-oauth";
import {
  QUALITY_POLICY_VERSION,
  computePedagogyContentFingerprint,
  type PedagogicRubricItem,
} from "@/lib/materials/quality-policy";
import {
  computeProductBundleChecksum,
  deterministicProductSerialization,
  validateProductBundle,
  type ProductDependency,
  type ProductEntity,
} from "@/lib/bundle/product-validator";
import { evaluateProductBundleQualityPolicy } from "@/lib/bundle/product-review-gate";
import { provisionPenggunaForNewUser } from "@/lib/auth/authorization";
import {
  LIMIT_ARTICLE_FIXTURE,
  LIMIT_EPSILON_DELTA_GRAPH,
} from "../fixtures/product-learning/limit-epsilon-delta";
import { LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL } from "../fixtures/product-learning/human-rubric-cases";

const storageMap: Map<string, Uint8Array> =
  ((globalThis as any).__mcpSharedStorageMap ??= new Map<string, Uint8Array>());
const mockStorage = {
  upload: async (
    file: Uint8Array | Buffer | { arrayBuffer: () => Promise<ArrayBuffer> },
    filename: string,
    _mimeType: string,
    options?: { key?: string; metadata?: Record<string, unknown> },
  ) => {
    const key = options?.key ?? filename;
    let bytes: Uint8Array;
    if (file instanceof Uint8Array) {
      bytes = file;
    } else if (Buffer.isBuffer(file)) {
      bytes = new Uint8Array(file);
    } else {
      bytes = new Uint8Array(await file.arrayBuffer());
    }
    storageMap.set(key, bytes);
    return { url: `memory://${key}`, key, size: bytes.byteLength };
  },
  delete: async (key: string) => {
    storageMap.delete(key);
  },
  getUrl: (key: string) => `memory://${key}`,
  exists: async (key: string) => storageMap.has(key),
  download: async (key: string) => {
    const data = storageMap.get(key);
    if (!data) {
      throw new Error(`PRODUCT_BUNDLE_STORAGE_DOWNLOAD_UNAVAILABLE:${key}`);
    }
    return data;
  },
  copy: async (sourceKey: string, destKey: string) => {
    const data = storageMap.get(sourceKey);
    if (!data) throw new Error(`Source not found: ${sourceKey}`);
    storageMap.set(destKey, data);
    return { url: `memory://${destKey}`, key: destKey };
  },
  getPresignedUrl: async (key: string) => `memory://${key}`,
  downloadBytes: async (key: string) => {
    const data = storageMap.get(key);
    if (!data) throw new Error(`STORAGE_NOT_FOUND:${key}`);
    return data;
  },
  headObject: async (key: string) => {
    const data = storageMap.get(key);
    return data ? { exists: true, size: data.byteLength } : { exists: false };
  },
  listObjects: async () => ({ objects: [], isTruncated: false }),
};

const client = createClient({
  url: "file::memory:?cache=shared",
});
const testDb = drizzle(client, { schema });

mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
mock.module("@/lib/storage", () => ({
  getStorage: () => mockStorage,
  storage: mockStorage,
}));

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

const adminPrincipal: McpPrincipal = {
  userId: "user-admin-cp3",
  actorId: "user-admin-cp3",
  sessionId: "session-admin-cp3",
  scopes: ["authoring:read", "authoring:stage", "authoring:review", "authoring:withdraw"],
  authMethod: "session",
};

const authorPrincipal: McpPrincipal = {
  userId: "user-author-cp3",
  actorId: "user-author-cp3",
  sessionId: "session-author-cp3",
  scopes: ["authoring:read", "authoring:stage"],
  authMethod: "session",
};

const readOnlyPrincipal: McpPrincipal = {
  userId: "user-reader-cp3",
  actorId: "user-reader-cp3",
  sessionId: "session-reader-cp3",
  scopes: ["authoring:read"],
  authMethod: "session",
};

function sha(bytes: Uint8Array): string {
  return Bun.CryptoHasher.hash("sha256", bytes, "hex");
}

function buildBundleZip(
  products: ProductEntity[],
  dependencies: ProductDependency[] = [],
  bundleId = "product-bundle-cp3",
  courseId = "course-cp3",
  options?: { skipBundleValidation?: boolean },
): {
  bytes: Uint8Array;
  checksum: string;
  bundleId: string;
  validation?: Extract<
    ReturnType<typeof validateProductBundle>,
    { success: true }
  >["data"];
} {
  const encode = (value: unknown) =>
    new TextEncoder().encode(`${deterministicProductSerialization(value)}\n`);
  const files = new Map<string, Uint8Array>();
  const productBytes = encode(products);
  const dependencyBytes = encode(dependencies);
  files.set("entities/products.json", productBytes);
  files.set("entities/dependencies.json", dependencyBytes);

  const manifestBase = {
    bundleId,
    bundleType: "product" as const,
    schemaVersion: "product-bundle.v3" as const,
    courseId,
    entityFiles: [
      {
        path: "entities/products.json",
        entityType: "products" as const,
        checksum: sha(productBytes),
        stableIds: products.map((product) => String(product.id)),
      },
      {
        path: "entities/dependencies.json",
        entityType: "dependencies" as const,
        checksum: sha(dependencyBytes),
        stableIds: dependencies.map((dependency) => dependency.id),
      },
    ],
    creatorId: "user-admin-cp3",
    curatorId: "user-admin-cp3",
    createdAt: "2026-09-05T00:00:00.000Z",
    conflicts: [],
  };

  const checksum = computeProductBundleChecksum(manifestBase, files);
  const manifest = { ...manifestBase, bundleChecksum: checksum };
  files.set("manifest.json", encode(manifest));

  const zipBytes = zipSync(Object.fromEntries(files));
  const validation = validateProductBundle(zipBytes);
  if (!validation.success && !options?.skipBundleValidation) {
    throw new Error(`Fixture validation failed: ${JSON.stringify(validation.issues)}`);
  }

  return {
    bytes: zipBytes,
    checksum,
    bundleId,
    validation: validation.success ? validation.data : undefined,
  };
}

function createV3Article(
  articleId = "article-cp3-001",
  courseId = "course-cp3",
  chapterId = "bab-cp3-001",
): Extract<ProductEntity, { productType: "article" }> {
  const cloned = structuredClone(LIMIT_ARTICLE_FIXTURE);
  const clonedGraph = structuredClone(LIMIT_EPSILON_DELTA_GRAPH);
  const sourceRef = {
    sourceId: "source-cp3-001",
    version: 1,
    checksum: HASH_B,
    excerptIds: ["ex-cp3-1"],
  };

  return {
    id: articleId,
    productType: "article",
    slug: `${articleId}-slug`,
    title: cloned.title,
    courseId,
    chapterId,
    version: 1,
    status: "draft",
    ideaLinks: [
      {
        id: "idea-limit-cp3",
        version: 1,
        semanticHash: HASH_A,
        weight: 1,
        role: "primary",
      },
    ],
    sourceRefs: [sourceRef],
    schemaVersion: "1.0",
    sourceHash: HASH_B,
    generationHash: cloned.generationHash,
    creatorId: "user-admin-cp3",
    curatorId: "user-admin-cp3",
    blocks: [],
    sections: cloned.sections.map((s) => ({
      id: s.id,
      kind: s.kind,
      learningSectionId: s.kind === "topic" ? "ls-limit-cp3" : undefined,
      parentSectionId: s.parentSectionId,
      title: s.title,
      slug: s.slug,
      orderIndex: s.orderIndex,
      learningObjective: s.learningObjective,
      ideaIds: ["idea-limit-cp3"],
      sourceRefs: [sourceRef],
      pedagogy: s.pedagogy ? structuredClone(s.pedagogy) : undefined,
      blocks: s.blocks.map((b) => ({
        id: b.id,
        blockType: b.blockType,
        title: b.title,
        orderIndex: b.orderIndex,
        contentMarkdown: b.content,
        ideaIds: ["idea-limit-cp3"],
        sourceRefs: [sourceRef],
        workedExamplePayload: b.workedExamplePayload
          ? structuredClone(b.workedExamplePayload)
          : undefined,
        formativeCheckPayload: b.formativeCheckPayload
          ? structuredClone(b.formativeCheckPayload)
          : undefined,
      })),
    })),
    visuals: [clonedGraph],
  };
}

function createDiktat(
  article: Extract<ProductEntity, { productType: "article" }>,
  diktatId = "diktat-cp3-001",
): Extract<ProductEntity, { productType: "diktat" }> {
  return {
    id: diktatId,
    productType: "diktat",
    title: `Diktat: ${article.title}`,
    courseId: article.courseId,
    chapterId: article.chapterId,
    version: 1,
    status: "draft",
    ideaLinks: structuredClone(article.ideaLinks),
    sourceRefs: structuredClone(article.sourceRefs),
    schemaVersion: "1.0",
    sourceHash: article.sourceHash,
    generationHash: article.generationHash,
    creatorId: "user-admin-cp3",
    curatorId: "user-admin-cp3",
    contentMarkdown: "# Diktat Limit\n\nRangkuman materi kalkulus limit.",
    sourceArticleId: article.id,
    sourceArticleVersion: article.version,
    sourceArticleHash: article.generationHash,
  };
}

function createDiktatDependency(
  article: Extract<ProductEntity, { productType: "article" }>,
  diktat: Extract<ProductEntity, { productType: "diktat" }>,
): ProductDependency {
  return {
    id: `dep-${diktat.id}-${article.id}`,
    upstreamEntityType: "product",
    upstreamEntityId: article.id,
    upstreamVersion: article.version,
    upstreamHash: article.generationHash,
    downstreamEntityType: "diktat",
    downstreamEntityId: diktat.id,
    downstreamVersion: diktat.version,
    downstreamHash: diktat.generationHash,
    freshness: "UP_TO_DATE",
  };
}

async function callMcpTool(
  principal: McpPrincipal,
  name: string,
  args: Record<string, unknown>,
) {
  const server = createAuthoringMcpServer(principal);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(
    new Request("http://localhost/api/mcp/authoring", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  const body = (await response.json()) as {
    result?: {
      isError?: boolean;
      content?: Array<{ type: string; text: string }>;
      structuredContent?: any;
    };
  };
  let structured = body.result?.structuredContent;
  if (!structured && body.result?.content?.[0]?.text) {
    try {
      structured = JSON.parse(body.result.content[0].text);
    } catch {
      structured = { error: body.result.content[0].text };
    }
  }
  return {
    isError: Boolean(body.result?.isError),
    data: structured,
    raw: body,
  };
}

describe("PB-CP3 Authoring MCP Contract and Quality Parity", () => {
  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-for-mcp-contracts";
    process.env.FEATURE_STRUCTURED_ARTICLE_READER_V1 = "true";
    try {
      await migrate(testDb, { migrationsFolder: "./drizzle" });
    } catch (err) {
      if (!(err instanceof Error && err.message.includes("already exists"))) {
        throw err;
      }
    }
    await client.execute("PRAGMA foreign_keys = ON");
  });

  beforeEach(async () => {
    storageMap.clear();

    await client.execute("PRAGMA foreign_keys = OFF");
    await client.execute("DELETE FROM item_asesmen");
    await client.execute("DELETE FROM asesmen");
    await client.execute("DELETE FROM blueprint_asesmen");
    await client.execute("DELETE FROM quiz_templates");
    await client.execute("DELETE FROM vector_sync_queue");
    await client.execute("DELETE FROM audit_mutasi");
    await client.execute("DELETE FROM publikasi_bundle");
    await client.execute("DELETE FROM review_pedagogi_bundle");
    await client.execute("DELETE FROM bukti_pdf_bundle");
    await client.execute("DELETE FROM review_item_bundle");
    await client.execute("DELETE FROM review_bundle");
    await client.execute("DELETE FROM ketergantungan_produk");
    await client.execute("DELETE FROM blok_artikel_sumber");
    await client.execute("DELETE FROM blok_artikel_ide");
    await client.execute("DELETE FROM blok_artikel");
    await client.execute("DELETE FROM bagian_artikel");
    await client.execute("DELETE FROM artikel_ide");
    await client.execute("DELETE FROM artikel");
    await client.execute("DELETE FROM diktat_ide");
    await client.execute("DELETE FROM diktat_materi");
    await client.execute("DELETE FROM pembahasan_soal");
    await client.execute("DELETE FROM soal_ide");
    await client.execute("DELETE FROM soal");
    await client.execute("DELETE FROM assessment_sources");
    await client.execute("DELETE FROM course_materials");
    await client.execute("DELETE FROM item_impor_bundle");
    await client.execute("DELETE FROM impor_bundle");
    await client.execute("DELETE FROM potongan_sumber");
    await client.execute("DELETE FROM sumber_materi");
    await client.execute("DELETE FROM ide");
    await client.execute("DELETE FROM bagian_pembelajaran");
    await client.execute("DELETE FROM bab");
    await client.execute("DELETE FROM pengguna_peran");
    await client.execute("DELETE FROM peran");
    await client.execute("DELETE FROM pengguna");
    await client.execute("DELETE FROM user");
    await client.execute("DELETE FROM mata_kuliah");
    await client.execute("DELETE FROM courses");
    await client.execute("PRAGMA foreign_keys = ON");

    // 1. Setup Courses and Mata Kuliah
    await client.execute({
      sql: "INSERT INTO courses (id, title, category, description) VALUES (?, ?, ?, ?)",
      args: ["course-cp3", "Kalkulus CP3", "Matematika", "Deskripsi Kalkulus CP3"],
    });
    await client.execute({
      sql: "INSERT INTO mata_kuliah (id, code, title, status, legacy_course_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0)",
      args: ["course-cp3", "KAL-CP3", "Kalkulus CP3", "active", "course-cp3"],
    });

    // 2. Setup Users and Pengguna
    await client.execute({
      sql: "INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at) VALUES (?, ?, ?, 1, 'admin', 0, 0)",
      args: ["user-admin-cp3", "Admin CP3", "admin.cp3@example.test"],
    });
    await provisionPenggunaForNewUser({ id: "user-admin-cp3", role: "admin" });

    await client.execute({
      sql: "INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at) VALUES (?, ?, ?, 1, 'teacher', 0, 0)",
      args: ["user-author-cp3", "Author CP3", "author.cp3@example.test"],
    });
    await provisionPenggunaForNewUser({ id: "user-author-cp3", role: "teacher" });

    await client.execute({
      sql: "INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at) VALUES (?, ?, ?, 1, 'student', 0, 0)",
      args: ["user-reader-cp3", "Reader CP3", "reader.cp3@example.test"],
    });
    await provisionPenggunaForNewUser({ id: "user-reader-cp3", role: "student" });

    // 3. Setup Chapter
    await testDb.insert(schema.bab).values({
      id: "bab-cp3-001",
      mataKuliahId: "course-cp3",
      code: "BAB-CP3-01",
      title: "Bab 1 Limit Presisi",
      orderIndex: 0,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 4. Setup Learning Section
    await testDb.insert(schema.bagianPembelajaran).values({
      id: "ls-limit-cp3",
      mataKuliahId: "course-cp3",
      babId: "bab-cp3-001",
      stableKey: "key-ls-limit-cp3",
      title: "Bagian Pembelajaran Limit CP3",
      slug: "ls-limit-slug-cp3",
      orderIndex: 0,
      learningObjective: "Tujuan pembelajaran limit formal",
      version: 1,
      status: "published",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 5. Setup Published Idea
    await testDb.insert(schema.ide).values({
      id: "idea-limit-cp3",
      mataKuliahId: "course-cp3",
      babId: "bab-cp3-001",
      stableKey: "key-idea-limit-cp3",
      code: "MA-CP3-01",
      canonicalStatement: "Definisi limit formal epsilon-delta",
      conciseExplanation: "Untuk setiap epsilon lebih besar nol ada delta lebih besar nol.",
      knowledgeKind: "definition",
      instructionalRole: "core",
      difficultyMetadata: {},
      version: 1,
      status: "published",
      sourcePolicy: "source_grounded",
      schemaVersion: "1.0",
      semanticHash: HASH_A,
      generationHash: HASH_A,
      creatorId: "user-admin-cp3",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 6. Setup active Source Material and Excerpt
    await testDb.insert(schema.sumberMateri).values({
      id: "source-cp3-001",
      mataKuliahId: "course-cp3",
      babId: "bab-cp3-001",
      sourceType: "markdown",
      title: "Buku Sumber Limit CP3",
      canonicalUriOrR2Key: "courses/source-cp3-1.md",
      version: 1,
      checksum: HASH_B,
      status: "active",
      creatorId: "user-admin-cp3",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await testDb.insert(schema.potonganSumber).values({
      id: "ex-cp3-1",
      sumberMateriId: "source-cp3-001",
      sourceVersion: 1,
      content: "Kutipan teks limit CP3.",
      startOffset: 0,
      endOffset: 100,
      checksum: HASH_B,
      embeddingEligible: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  describe("workflow.get_contract validation", () => {
    test("exposes complete product-bundle.v3 contract through workflowContract and MCP tool", async () => {
      const runToken = issueMcpRunToken({
        workflow: "idea_product",
        courseId: "course-cp3",
        chapterId: "bab-cp3-001",
      });

      const localContract = workflowContract(runToken);
      expect(localContract.workflow.key).toBe("idea_product");
      const pbContract = localContract.outputs.productBundle;
      expect(pbContract.schemaVersion).toBe("product-bundle.v4");
      expect(pbContract.compatibleReadVersions).toEqual(["product-bundle.v2", "product-bundle.v3", "product-bundle.v4"]);
      expect(pbContract.publicationPermitted).toBe(false);
      expect(pbContract.reviewRequired).toBe(true);
      expect(pbContract.ideaPublicationRequired).toBe(true);

      // Tool sequence
      expect(pbContract.toolSequence).toEqual([
        "authoring.validate_product_bundle",
        "authoring.submit_product_bundle",
        "authoring.restage_product_bundle",
        "authoring.verify_product_bundle",
        "authoring.get_verification",
        "authoring.review_product_bundle",
      ]);

      // Evaluation stages distinction
      expect(Object.keys(pbContract.evaluationStages)).toEqual([
        "authorPreflight",
        "deterministicValid",
        "adminReview",
        "pdfEvidence",
        "publicationReady",
      ]);

      // Section and block pedagogy fields
      expect(pbContract.pedagogyFields.section).toHaveProperty("objectives");
      expect(pbContract.pedagogyFields.section).toHaveProperty("prerequisites");
      expect(pbContract.pedagogyFields.section).toHaveProperty("symbols");
      expect(pbContract.pedagogyFields.section).toHaveProperty("timeEstimate");
      expect(pbContract.pedagogyFields.section).toHaveProperty("visualRequirement");
      expect(pbContract.pedagogyFields.blocks).toHaveProperty("workedExample");
      expect(pbContract.pedagogyFields.blocks).toHaveProperty("formativeCheckPayload");

      // Typed visual specifications
      expect(pbContract.typedVisuals.supportedKinds).toContain("epsilon_delta_graph");
      expect(pbContract.typedVisuals.supportedKinds).toContain("learning_canvas");
      expect(pbContract.typedVisuals.securityRestrictions).toContain("No executable JavaScript");

      // Review rubric (8 criteria)
      expect(pbContract.reviewRubric.criteriaCount).toBe(8);
      expect(pbContract.reviewRubric.criteria).toEqual([
        "concept_accuracy",
        "prerequisite_completeness",
        "explanation_sequence",
        "symbol_and_condition_clarity",
        "example_reasoning",
        "representation_or_visual",
        "misconceptions_and_limits",
        "formative_check_and_explanation",
      ]);

      // PDF evidence states and bounds
      expect(pbContract.pdfEvidenceStates.statuses).toEqual(["pending", "ready", "failed", "stale"]);
      expect(pbContract.pdfEvidenceStates.readyPageRange).toEqual({ minPages: 1, maxPages: 4 });
      expect(pbContract.pdfEvidenceStates.safeFailureCodes).toContain("RENDER_TIMEOUT");
      expect(pbContract.pdfEvidenceStates.safeFailureCodes).toContain("PAGE_BUDGET_EXCEEDED");

      // Verify invocation via MCP tool
      const toolRes = await callMcpTool(readOnlyPrincipal, "workflow.get_contract", { runToken });
      expect(toolRes.isError).toBe(false);
      expect(toolRes.data.ok).toBe(true);
      expect(toolRes.data.outputs.productBundle.schemaVersion).toBe("product-bundle.v4");
      expect(toolRes.data.outputs.productBundle.publicationPermitted).toBe(false);
    });
  });

  describe("Fixture Parity: Direct Evaluator vs MCP validation tool", () => {
    test("achieves exact parity on valid draft with missing review and PDF prerequisites", async () => {
      const article = createV3Article();
      const diktat = createDiktat(article);
      const dep = createDiktatDependency(article, diktat);
      const bundle = buildBundleZip([article, diktat], [dep], "bundle-parity-001");

      // Direct evaluator
      const directEval = await evaluateProductBundleQualityPolicy({
        bundle: bundle.validation!,
        dependencies: bundle.validation!.dependencies,
      });

      expect(directEval.valid).toBe(true);
      expect(directEval.publicationReady).toBe(false);
      expect(directEval.policyVersion).toBe(QUALITY_POLICY_VERSION);
      expect(directEval.contentFingerprint).toMatch(/^[a-f0-9]{64}$/);

      const runToken = issueMcpRunToken({
        workflow: "idea_product",
        courseId: "course-cp3",
        chapterId: "bab-cp3-001",
      });

      // MCP validation tool
      const mcpRes = await callMcpTool(readOnlyPrincipal, "authoring.validate_product_bundle", {
        runToken,
        filename: "bundle-parity-001.zip",
        bundleBase64: Buffer.from(bundle.bytes).toString("base64"),
      });

      expect(mcpRes.isError).toBe(false);
      const mcpData = mcpRes.data;

      // Parity assertions
      expect(mcpData.ok).toBe(true);
      expect(mcpData.valid).toBe(directEval.valid);
      expect(mcpData.publicationReady).toBe(directEval.publicationReady);
      expect(mcpData.policyVersion).toBe(directEval.policyVersion);
      expect(mcpData.contentFingerprint).toBe(directEval.contentFingerprint);

      // Issues comparison
      expect(mcpData.issues.map((i: any) => i.code)).toEqual(
        directEval.issues.map((i) => i.code),
      );
      expect(mcpData.issues.map((i: any) => i.target)).toEqual(
        directEval.issues.map((i) => i.target),
      );
      expect(mcpData.issues.map((i: any) => i.reason)).toEqual(
        directEval.issues.map((i) => i.reason),
      );
      expect(mcpData.issues.map((i: any) => i.remediation)).toEqual(
        directEval.issues.map((i) => i.remediation),
      );

      // Verify the two expected non-blocking prerequisites
      const issueCodes = mcpData.issues.map((i: any) => i.code);
      expect(issueCodes).toContain("PEDAGOGIC_REVIEW_MISSING");
      expect(issueCodes).toContain("PDF_EVIDENCE_MISSING");
    });
  });

  describe("Deterministic Rejection Parity", () => {
    test("rejects broken visual bounds consistently in direct evaluator and MCP tool", async () => {
      const article = createV3Article();
      // Invalidate visual spec: bounds xMin >= xMax
      article.visuals[0].bounds = { xMin: 5, xMax: 2, yMin: 0, yMax: 10 };
      const diktat = createDiktat(article);
      const dep = createDiktatDependency(article, diktat);
      const bundle = buildBundleZip([article, diktat], [dep], "bundle-bad-visual", "course-cp3", { skipBundleValidation: true });

      const directEval = await evaluateProductBundleQualityPolicy({
        products: [article, diktat],
        dependencies: [dep],
      });
      expect(directEval.valid).toBe(false);
      const directVisualIssue = directEval.issues.find(
        (i) => i.code === "VISUAL_SPEC_INVALID",
      );
      expect(directVisualIssue).toBeDefined();

      const runToken = issueMcpRunToken({
        workflow: "idea_product",
        courseId: "course-cp3",
        chapterId: "bab-cp3-001",
      });

      const mcpRes = await callMcpTool(readOnlyPrincipal, "authoring.validate_product_bundle", {
        runToken,
        filename: "bundle-bad-visual.zip",
        bundleBase64: Buffer.from(bundle.bytes).toString("base64"),
      });

      expect(mcpRes.data.valid).toBe(false);
      expect(mcpRes.data.ok).toBe(false);
      const mcpVisualIssue = mcpRes.data.issues.find(
        (issue: any) => issue.code === directVisualIssue?.code,
      );
      expect(mcpVisualIssue).toBeDefined();
      expect(mcpVisualIssue.reason).toContain(directVisualIssue?.reason);
    });

    test("rejects invalid formative check payload consistently in direct evaluator and MCP tool", async () => {
      const article = createV3Article();
      // Invalidate formative check: multiple choice with fewer than 2 options
      const chkBlock = article.sections.flatMap((s) => s.blocks).find((b) => b.formativeCheckPayload);
      if (chkBlock?.formativeCheckPayload) {
        chkBlock.formativeCheckPayload.options = [
          { id: "opt-1", text: "Hanya satu opsi", isCorrect: true },
        ];
      }
      const diktat = createDiktat(article);
      const dep = createDiktatDependency(article, diktat);
      const bundle = buildBundleZip([article, diktat], [dep], "bundle-bad-formative", "course-cp3", { skipBundleValidation: true });

      const directEval = await evaluateProductBundleQualityPolicy({
        products: [article, diktat],
        dependencies: [dep],
      });
      expect(directEval.valid).toBe(false);
      const directFormativeIssue = directEval.issues.find(
        (i) => i.code === "FORMATIVE_CHECK_PAYLOAD_INVALID",
      );
      expect(directFormativeIssue).toBeDefined();
      expect(directFormativeIssue?.reason).toContain("Multiple choice formative checks require at least two options");

      const runToken = issueMcpRunToken({
        workflow: "idea_product",
        courseId: "course-cp3",
        chapterId: "bab-cp3-001",
      });

      const mcpRes = await callMcpTool(readOnlyPrincipal, "authoring.validate_product_bundle", {
        runToken,
        filename: "bundle-bad-formative.zip",
        bundleBase64: Buffer.from(bundle.bytes).toString("base64"),
      });

      expect(mcpRes.data.valid).toBe(false);
      expect(mcpRes.data.ok).toBe(false);
      const mcpHasFormativeError = mcpRes.data.issues.some((i: any) =>
        i.reason.includes("Multiple choice formative checks require at least two options"),
      );
      expect(mcpHasFormativeError).toBe(true);
    });

    test("rejects non-contiguous worked example steps consistently in direct evaluator and MCP tool", async () => {
      const article = createV3Article();
      // Invalidate worked example steps: non-contiguous step indices (0, 2)
      const weBlock = article.sections.flatMap((s) => s.blocks).find((b) => b.workedExamplePayload);
      if (weBlock?.workedExamplePayload) {
        weBlock.workedExamplePayload.steps = [
          {
            stepIndex: 0,
            label: "Langkah 1",
            explanation: "Penjelasan 1",
            reason: "Alasan 1",
          },
          {
            stepIndex: 2,
            label: "Langkah 3",
            explanation: "Penjelasan 3 lompat indeks",
            reason: "Alasan 3",
          },
        ];
      }
      const diktat = createDiktat(article);
      const dep = createDiktatDependency(article, diktat);
      const bundle = buildBundleZip([article, diktat], [dep], "bundle-bad-worked-example", "course-cp3", { skipBundleValidation: true });

      const directEval = await evaluateProductBundleQualityPolicy({
        products: [article, diktat],
        dependencies: [dep],
      });
      expect(directEval.valid).toBe(false);
      const directWeIssue = directEval.issues.find(
        (i) => i.code === "WORKED_EXAMPLE_PAYLOAD_INVALID",
      );
      expect(directWeIssue).toBeDefined();
      expect(directWeIssue?.reason).toContain("Worked example step indexes must be contiguous");

      const runToken = issueMcpRunToken({
        workflow: "idea_product",
        courseId: "course-cp3",
        chapterId: "bab-cp3-001",
      });

      const mcpRes = await callMcpTool(readOnlyPrincipal, "authoring.validate_product_bundle", {
        runToken,
        filename: "bundle-bad-worked-example.zip",
        bundleBase64: Buffer.from(bundle.bytes).toString("base64"),
      });

      expect(mcpRes.data.valid).toBe(false);
      expect(mcpRes.data.ok).toBe(false);
      const mcpHasWeError = mcpRes.data.issues.some((i: any) =>
        i.reason.includes("Worked example step indexes must be contiguous"),
      );
      expect(mcpHasWeError).toBe(true);
    });

    test("rejects dangling pedagogy explanation block consistently in direct evaluator and MCP tool", async () => {
      const article = createV3Article();
      // Invalidate pedagogy: objective references non-existent explanation block
      const targetSection = article.sections.find((s) => s.pedagogy);
      if (targetSection?.pedagogy) {
        targetSection.pedagogy.objectives[0].explanationBlockIds = ["non-existent-explanation-block"];
      }
      const diktat = createDiktat(article);
      const dep = createDiktatDependency(article, diktat);
      const bundle = buildBundleZip([article, diktat], [dep], "bundle-bad-pedagogy-ref", "course-cp3", { skipBundleValidation: true });

      const directEval = await evaluateProductBundleQualityPolicy({
        products: [article, diktat],
        dependencies: [dep],
      });
      expect(directEval.valid).toBe(false);
      const directPedIssue = directEval.issues.find(
        (i) => i.code === "PEDAGOGY_DANGLING_EXPLANATION_BLOCK",
      );
      expect(directPedIssue).toBeDefined();

      const runToken = issueMcpRunToken({
        workflow: "idea_product",
        courseId: "course-cp3",
        chapterId: "bab-cp3-001",
      });

      const mcpRes = await callMcpTool(readOnlyPrincipal, "authoring.validate_product_bundle", {
        runToken,
        filename: "bundle-bad-pedagogy-ref.zip",
        bundleBase64: Buffer.from(bundle.bytes).toString("base64"),
      });

      expect(mcpRes.data.valid).toBe(false);
      expect(mcpRes.data.ok).toBe(false);
      const mcpHasPedError = mcpRes.data.issues.some((i: any) =>
        i.reason.includes("PEDAGOGY_DANGLING_EXPLANATION_BLOCK") &&
        i.reason.includes("non-existent-explanation-block"),
      );
      expect(mcpHasPedError).toBe(true);
    });
  });

  describe("Submit and Restage Lifecycle Safety", () => {
    test("stages valid draft without review or PDF evidence and redacts raw sourceKey", async () => {
      const article = createV3Article("article-submit-001");
      const diktat = createDiktat(article, "diktat-submit-001");
      const dep = createDiktatDependency(article, diktat);
      const bundle = buildBundleZip([article, diktat], [dep], "bundle-submit-001");

      const runToken = issueMcpRunToken({
        workflow: "idea_product",
        courseId: "course-cp3",
        chapterId: "bab-cp3-001",
      });

      const submitRes = await callMcpTool(authorPrincipal, "authoring.submit_product_bundle", {
        runToken,
        filename: "bundle-submit-001.zip",
        bundleBase64: Buffer.from(bundle.bytes).toString("base64"),
      });

      expect(submitRes.isError).toBe(false);
      expect(submitRes.data.ok).toBe(true);
      expect(submitRes.data.valid).toBe(true);
      expect(submitRes.data.staged).toBe(true);
      expect(submitRes.data.publicationReady).toBe(false);
      expect(submitRes.data.result.sourceKey).toBeUndefined();
      expect(submitRes.data.result.status).toBe("draft");
      expect(submitRes.data.result.bundleId).toBe("bundle-submit-001");

      // Verify in DB
      const [stagedRow] = await testDb
        .select()
        .from(schema.imporBundle)
        .where(eq(schema.imporBundle.id, submitRes.data.result.importId));
      expect(stagedRow).toBeDefined();
      expect(stagedRow.status).toBe("draft");
      expect(stagedRow.bundleId).toBe("bundle-submit-001");
    });

    test("blocks staging mutation when product bundle is deterministically invalid", async () => {
      const article = createV3Article("article-invalid-submit");
      article.visuals[0].bounds = { xMin: 10, xMax: 1, yMin: 0, yMax: 10 };
      const diktat = createDiktat(article, "diktat-invalid-submit");
      const dep = createDiktatDependency(article, diktat);
      const bundle = buildBundleZip([article, diktat], [dep], "bundle-invalid-submit", "course-cp3", { skipBundleValidation: true });

      const runToken = issueMcpRunToken({
        workflow: "idea_product",
        courseId: "course-cp3",
        chapterId: "bab-cp3-001",
      });

      const submitRes = await callMcpTool(authorPrincipal, "authoring.submit_product_bundle", {
        runToken,
        filename: "bundle-invalid-submit.zip",
        bundleBase64: Buffer.from(bundle.bytes).toString("base64"),
      });

      expect(submitRes.data.ok).toBe(false);
      expect(submitRes.data.valid).toBe(false);
      expect(submitRes.data.staged).toBe(false);

      // Verify database has zero records for this bundleId
      const rows = await testDb
        .select()
        .from(schema.imporBundle)
        .where(eq(schema.imporBundle.bundleId, "bundle-invalid-submit"));
      expect(rows).toHaveLength(0);
    });

    test("restages modified draft with checksum update and redacts sourceKey", async () => {
      const article1 = createV3Article("article-restage-001");
      const diktat1 = createDiktat(article1, "diktat-restage-001");
      const dep1 = createDiktatDependency(article1, diktat1);
      const bundle1 = buildBundleZip([article1, diktat1], [dep1], "bundle-restage-001");

      const runToken = issueMcpRunToken({
        workflow: "idea_product",
        courseId: "course-cp3",
        chapterId: "bab-cp3-001",
      });

      const submitRes = await callMcpTool(authorPrincipal, "authoring.submit_product_bundle", {
        runToken,
        filename: "bundle-restage-001.zip",
        bundleBase64: Buffer.from(bundle1.bytes).toString("base64"),
      });
      expect(submitRes.data.ok).toBe(true);
      const importId = submitRes.data.result.importId;

      // Amend article title for restaging
      const article2 = createV3Article("article-restage-001");
      article2.title = "Definisi Formal Limit Presisi Edisi Revisi";
      const diktat2 = createDiktat(article2, "diktat-restage-001");
      const dep2 = createDiktatDependency(article2, diktat2);
      const bundle2 = buildBundleZip([article2, diktat2], [dep2], "bundle-restage-001");

      const restageRes = await callMcpTool(authorPrincipal, "authoring.restage_product_bundle", {
        runToken,
        importId,
        filename: "bundle-restage-001-v2.zip",
        bundleBase64: Buffer.from(bundle2.bytes).toString("base64"),
      });

      expect(restageRes.isError).toBe(false);
      expect(restageRes.data.ok).toBe(true);
      expect(restageRes.data.staged).toBe(true);
      expect(restageRes.data.result.checksum).toBe(bundle2.checksum);
      expect(restageRes.data.result.sourceKey).toBeUndefined();
    });
  });

  describe("Authorized 8-Criterion Review and Persistence", () => {
    let stagedImportId: string;
    let freshFingerprint: string;

    beforeEach(async () => {
      const article = createV3Article("article-review-001");
      const diktat = createDiktat(article, "diktat-review-001");
      const dep = createDiktatDependency(article, diktat);
      const bundle = buildBundleZip([article, diktat], [dep], "bundle-review-001");

      freshFingerprint = computePedagogyContentFingerprint({
        article: article as unknown as Record<string, unknown>,
        diktat: diktat as unknown as Record<string, unknown>,
      });

      const runToken = issueMcpRunToken({
        workflow: "idea_product",
        courseId: "course-cp3",
        chapterId: "bab-cp3-001",
      });

      const submitRes = await callMcpTool(authorPrincipal, "authoring.submit_product_bundle", {
        runToken,
        filename: "bundle-review-001.zip",
        bundleBase64: Buffer.from(bundle.bytes).toString("base64"),
      });
      expect(submitRes.data.ok).toBe(true);
      stagedImportId = submitRes.data.result.importId;
    });

    test("records complete 8-criterion review into reviewPedagogiBundle without publishing", async () => {
      const validCriteria: PedagogicRubricItem[] = LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria.map((c) => {
        if (c.criterionId === "example_reasoning") {
          return {
            ...c,
            contentAnchors: [{ targetType: "block" as const, targetId: "block-ed-example-linear" }],
          };
        }
        if (c.criterionId === "misconceptions_and_limits") {
          return {
            ...c,
            contentAnchors: [{ targetType: "block" as const, targetId: "block-sum-close" }],
          };
        }
        return c;
      });

      const reviewRes = await callMcpTool(adminPrincipal, "authoring.review_product_bundle", {
        importId: stagedImportId,
        decision: "approved",
        policyVersion: QUALITY_POLICY_VERSION,
        contentFingerprint: freshFingerprint,
        criteria: validCriteria,
        notes: "Evaluasi pedagogi 8 kriteria disetujui penuh oleh tim kurikulum.",
      });

      expect(reviewRes.isError).toBe(false);
      expect(reviewRes.data.ok).toBe(true);
      expect(reviewRes.data.decision).toBe("approved");
      expect(reviewRes.data.criteriaCount).toBe(8);

      // Verify row persisted in database
      const rows = await testDb
        .select()
        .from(schema.reviewPedagogiBundle)
        .where(eq(schema.reviewPedagogiBundle.imporBundleId, stagedImportId));
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("approved");
      expect(rows[0].policyVersion).toBe(QUALITY_POLICY_VERSION);
      expect(rows[0].contentFingerprint).toBe(freshFingerprint);
      expect((rows[0].rubric as any).criteria).toHaveLength(8);

      // Verify import inspection redacts internal reviewer ID
      const inspectRes = await callMcpTool(readOnlyPrincipal, "authoring.get_import", {
        bundleType: "product",
        importId: stagedImportId,
      });
      expect(inspectRes.data.ok).toBe(true);
      expect(inspectRes.data.import.pedagogicReviews).toBeDefined();
      expect(inspectRes.data.import.pedagogicReviews[0].status).toBe("approved");
      expect(inspectRes.data.import.pedagogicReviews[0].reviewerId).toBeUndefined();
      expect(inspectRes.data.import.sourceKey).toBeUndefined();
    });

    test("rejects review with missing rubric criteria (< 8 items)", async () => {
      // Provide only 7 criteria
      const incompleteCriteria = LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria.slice(0, 7);

      const reviewRes = await callMcpTool(adminPrincipal, "authoring.review_product_bundle", {
        importId: stagedImportId,
        decision: "approved",
        policyVersion: QUALITY_POLICY_VERSION,
        contentFingerprint: freshFingerprint,
        criteria: incompleteCriteria,
      });

      expect(reviewRes.isError).toBe(true);
      expect(reviewRes.data.error).toBe("RUBRIC_CRITERION_MISSING");
    });

    test("rejects review with unanchored rubric criterion", async () => {
      const unanchoredCriteria = structuredClone(LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria);
      unanchoredCriteria[0].contentAnchors = [];

      const reviewRes = await callMcpTool(adminPrincipal, "authoring.review_product_bundle", {
        importId: stagedImportId,
        decision: "approved",
        policyVersion: QUALITY_POLICY_VERSION,
        contentFingerprint: freshFingerprint,
        criteria: unanchoredCriteria,
      });

      expect(reviewRes.isError).toBe(true);
    });

    test("rejects review referencing non-existent content anchor", async () => {
      const badAnchorCriteria = structuredClone(LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria);
      badAnchorCriteria[0].contentAnchors = [
        { targetType: "block", targetId: "block-that-does-not-exist" },
      ];

      const reviewRes = await callMcpTool(adminPrincipal, "authoring.review_product_bundle", {
        importId: stagedImportId,
        decision: "approved",
        policyVersion: QUALITY_POLICY_VERSION,
        contentFingerprint: freshFingerprint,
        criteria: badAnchorCriteria,
      });

      expect(reviewRes.isError).toBe(true);
      expect(reviewRes.data.error).toContain("RUBRIC_ANCHOR_NOT_FOUND");
    });

    test("rejects review when content fingerprint does not match staged artifact", async () => {
      const badFingerprint = "f".repeat(64);

      const reviewRes = await callMcpTool(adminPrincipal, "authoring.review_product_bundle", {
        importId: stagedImportId,
        decision: "approved",
        policyVersion: QUALITY_POLICY_VERSION,
        contentFingerprint: badFingerprint,
        criteria: LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria,
      });

      expect(reviewRes.isError).toBe(true);
      expect(reviewRes.data.error).toContain("FINGERPRINT_MISMATCH");
    });

    test("rejects review with stale policy version", async () => {
      const reviewRes = await callMcpTool(adminPrincipal, "authoring.review_product_bundle", {
        importId: stagedImportId,
        decision: "approved",
        policyVersion: "2025.01.1",
        contentFingerprint: freshFingerprint,
        criteria: LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria,
      });

      expect(reviewRes.isError).toBe(true);
      expect(reviewRes.data.error).toContain("POLICY_VERSION_MISMATCH");
    });

    test("rejects review with stale context revision mismatch", async () => {
      const reviewRes = await callMcpTool(adminPrincipal, "authoring.review_product_bundle", {
        importId: stagedImportId,
        decision: "approved",
        policyVersion: QUALITY_POLICY_VERSION,
        contentFingerprint: freshFingerprint,
        criteria: LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria,
        expectedRevision: 999,
      });

      expect(reviewRes.isError).toBe(true);
      expect(reviewRes.data.error).toContain("PRODUCT_BUNDLE_STALE_CONTEXT");
    });

    test("rejects review when principal lacks authoring:review scope", async () => {
      const reviewRes = await callMcpTool(authorPrincipal, "authoring.review_product_bundle", {
        importId: stagedImportId,
        decision: "approved",
        policyVersion: QUALITY_POLICY_VERSION,
        contentFingerprint: freshFingerprint,
        criteria: LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria,
      });

      expect(reviewRes.isError).toBe(true);
      expect(reviewRes.data.error).toBe("AUTHORING_MCP_SCOPE_REQUIRED");
      expect(reviewRes.data.detail).toBe("authoring:review");
    });

    test("rejects review when actor lacks admin role or tutor course access", async () => {
      const studentWithReviewScope: McpPrincipal = {
        userId: "user-reader-cp3",
        actorId: "user-reader-cp3",
        sessionId: "session-reader-cp3",
        scopes: ["authoring:read", "authoring:review"],
        authMethod: "session",
      };

      const reviewRes = await callMcpTool(studentWithReviewScope, "authoring.review_product_bundle", {
        importId: stagedImportId,
        decision: "approved",
        policyVersion: QUALITY_POLICY_VERSION,
        contentFingerprint: freshFingerprint,
        criteria: LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria,
      });

      expect(reviewRes.isError).toBe(true);
      expect(reviewRes.data.error).toContain("PRODUCT_BUNDLE_REVIEW_FORBIDDEN");
    });
  });

  describe("MCP Registry Inspection and Publication Immunity", () => {
    test("advertises zero publishing tools and strictly excludes publication scopes", async () => {
      const server = createAuthoringMcpServer(adminPrincipal);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);

      const response = await transport.handleRequest(
        new Request("http://localhost/api/mcp/authoring", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list", params: {} }),
        }),
      );
      const body = (await response.json()) as {
        result?: { tools?: Array<{ name: string; description: string }> };
      };
      const tools = body.result?.tools ?? [];
      const toolNames = tools.map((t) => t.name);

      // Asserts zero tools contain publish
      const publishTools = toolNames.filter((name) => name.toLowerCase().includes("publish"));
      expect(publishTools).toEqual([]);

      // Asserts authoring:publish is rejected as an invalid scope
      expect(() => requestedScopes("authoring:publish")).toThrow("invalid_scope");

      // Verify publikasi_bundle table has zero records
      const publications = await testDb.select().from(schema.publikasiBundle);
      expect(publications).toHaveLength(0);
    });
  });

  describe("Redaction Verification", () => {
    test("redacts internal storage keys and stack traces across responses and previews", async () => {
      const article = createV3Article("article-redact-001");
      const diktat = createDiktat(article, "diktat-redact-001");
      const dep = createDiktatDependency(article, diktat);
      const bundle = buildBundleZip([article, diktat], [dep], "bundle-redact-001");

      const runToken = issueMcpRunToken({
        workflow: "idea_product",
        courseId: "course-cp3",
        chapterId: "bab-cp3-001",
      });

      const validateRes = await callMcpTool(readOnlyPrincipal, "authoring.validate_product_bundle", {
        runToken,
        filename: "bundle-redact-001.zip",
        bundleBase64: Buffer.from(bundle.bytes).toString("base64"),
      });

      const jsonStr = JSON.stringify(validateRes);
      expect(jsonStr).not.toContain("overhaul/product-bundles/");
      expect(jsonStr).not.toMatch(/\s+at\s+[\w\.\/]+:\d+:\d+/);

      const submitRes = await callMcpTool(authorPrincipal, "authoring.submit_product_bundle", {
        runToken,
        filename: "bundle-redact-001.zip",
        bundleBase64: Buffer.from(bundle.bytes).toString("base64"),
      });

      const submitJson = JSON.stringify(submitRes);
      expect(submitJson).not.toContain("overhaul/product-bundles/");
      expect(submitRes.data.result.sourceKey).toBeUndefined();
    });
  });

  describe("Live Bug Report Acceptance Tests (Bugs 2, 3, 4, 5, 6)", () => {
    test("Bug 2: reconciles currentReadiness via shared evaluator, invalidates approval when content/fingerprint changes, and rejects stale/mismatched PDF evidence", async () => {
      const article = createV3Article("article-bug2-001");
      const diktat = createDiktat(article, "diktat-bug2-001");
      const dep = createDiktatDependency(article, diktat);
      const bundle = buildBundleZip([article, diktat], [dep], "bundle-bug2-001");

      const fingerprint = computePedagogyContentFingerprint({
        article: article as unknown as Record<string, unknown>,
        diktat: diktat as unknown as Record<string, unknown>,
      });

      const runToken = issueMcpRunToken({
        workflow: "idea_product",
        courseId: "course-cp3",
        chapterId: "bab-cp3-001",
      });

      const submitRes = await callMcpTool(authorPrincipal, "authoring.submit_product_bundle", {
        runToken,
        filename: "bundle-bug2-001.zip",
        bundleBase64: Buffer.from(bundle.bytes).toString("base64"),
      });
      expect(submitRes.data.ok).toBe(true);
      const importId = submitRes.data.result.importId;

      // Before review approval, currentReadiness reports PEDAGOGIC_REVIEW_MISSING
      const beforeInspect = await callMcpTool(readOnlyPrincipal, "authoring.get_import", {
        bundleType: "product",
        importId,
      });
      expect(beforeInspect.data.ok).toBe(true);
      expect(beforeInspect.data.import.currentReadiness.reviewStatus).toBe("missing");
      expect(beforeInspect.data.import.currentReadiness.blockingIssueCodes).toContain("PEDAGOGIC_REVIEW_MISSING");
      expect(beforeInspect.data.import.validationReport.snapshotAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // Approve pedagogic review for the current fingerprint
      const validCriteria: PedagogicRubricItem[] = LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria.map((c) => {
        if (c.criterionId === "example_reasoning") {
          return { ...c, contentAnchors: [{ targetType: "block" as const, targetId: "block-ed-example-linear" }] };
        }
        if (c.criterionId === "misconceptions_and_limits") {
          return { ...c, contentAnchors: [{ targetType: "block" as const, targetId: "block-sum-close" }] };
        }
        return c;
      });

      const reviewRes = await callMcpTool(adminPrincipal, "authoring.review_product_bundle", {
        importId,
        decision: "approved",
        policyVersion: QUALITY_POLICY_VERSION,
        contentFingerprint: fingerprint,
        criteria: validCriteria,
      });
      expect(reviewRes.data.ok).toBe(true);

      // After approving review for current fingerprint, currentReadiness must no longer report PEDAGOGIC_REVIEW_MISSING
      const afterReviewInspect = await callMcpTool(readOnlyPrincipal, "authoring.get_import", {
        bundleType: "product",
        importId,
      });
      expect(afterReviewInspect.data.ok).toBe(true);
      expect(afterReviewInspect.data.import.currentReadiness.reviewStatus).toBe("approved");
      expect(afterReviewInspect.data.import.currentReadiness.evaluatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(afterReviewInspect.data.import.currentReadiness.blockingIssueCodes).not.toContain("PEDAGOGIC_REVIEW_MISSING");

      // Record ready PDF evidence and verify publicationReady becomes true in get_import, list_imports, AND publication gate
      await testDb.insert(schema.buktiPdfBundle).values({
        id: "pdf-ev-bug2-001",
        imporBundleId: importId,
        productId: diktat.id,
        articleVersion: article.version,
        articleHash: article.generationHash,
        diktatHash: diktat.generationHash,
        rendererVersion: "typst-0.12.0",
        printProfile: "a4_standard",
        status: "ready",
        storageKey: "courses/course-cp3/materials/diktat-bug2-001.pdf",
        pageCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const readyInspect = await callMcpTool(readOnlyPrincipal, "authoring.get_import", {
        bundleType: "product",
        importId,
      });
      expect(readyInspect.data.import.publicationReady).toBe(true);
      expect(readyInspect.data.import.currentReadiness.publicationReady).toBe(true);
      expect(readyInspect.data.import.currentReadiness.pdfEvidenceStatus).toBe("ready");
      expect(readyInspect.data.import.currentReadiness.blockingIssueCodes).toEqual([]);

      // Verify shared evaluator consistency with publication gate (evaluateProductBundleQualityPolicy)
      const pubGateReady = await evaluateProductBundleQualityPolicy([article, diktat], {
        imporBundleId: importId,
        tx: testDb,
      });
      expect(pubGateReady.publicationReady).toBe(readyInspect.data.import.currentReadiness.publicationReady);
      expect(pubGateReady.issues.filter((i) => i.severity === "blocking")).toHaveLength(0);

      const listImportsRes = await callMcpTool(readOnlyPrincipal, "authoring.list_imports", {
        bundleType: "product",
        limit: 20,
      });
      const listedImport = listImportsRes.data.imports.find((item: any) => item.importId === importId);
      expect(listedImport).toBeDefined();
      expect(listedImport.publicationReady).toBe(true);
      expect(listedImport.currentReadiness.reviewStatus).toBe("approved");
      expect(listedImport.currentReadiness.blockingIssueCodes).toEqual([]);

      // Strengthened Bug 2 Case A: Change content/fingerprint after review approval -> old approval must no longer satisfy readiness
      const articleModified = createV3Article("article-bug2-001");
      articleModified.title = "Definisi Formal Limit (Konten Diubah Setelah Review)";
      articleModified.generationHash = "9".repeat(64);
      const diktatModified = createDiktat(articleModified, "diktat-bug2-001");
      diktatModified.generationHash = "8".repeat(64);
      const depModified = createDiktatDependency(articleModified, diktatModified);
      const bundleModified = buildBundleZip([articleModified, diktatModified], [depModified], "bundle-bug2-001");

      const newFingerprint = computePedagogyContentFingerprint({
        article: articleModified as unknown as Record<string, unknown>,
        diktat: diktatModified as unknown as Record<string, unknown>,
      });
      expect(newFingerprint).not.toBe(fingerprint);

      // Update the import's validationReport fingerprint and lineage hashes (simulating content update while old review row remains)
      const [currentImportRow] = await testDb
        .select()
        .from(schema.imporBundle)
        .where(eq(schema.imporBundle.id, importId));
      const updatedReport = {
        ...(currentImportRow.validationReport as Record<string, unknown>),
        contentFingerprint: newFingerprint,
        articleGenerationHash: articleModified.generationHash,
        diktatGenerationHash: diktatModified.generationHash,
      };
      await testDb
        .update(schema.imporBundle)
        .set({ validationReport: updatedReport })
        .where(eq(schema.imporBundle.id, importId));

      const afterContentChangeInspect = await callMcpTool(readOnlyPrincipal, "authoring.get_import", {
        bundleType: "product",
        importId,
      });
      expect(afterContentChangeInspect.data.import.publicationReady).toBe(false);
      expect(afterContentChangeInspect.data.import.currentReadiness.publicationReady).toBe(false);
      expect(afterContentChangeInspect.data.import.currentReadiness.reviewStatus).toBe("stale");
      expect(afterContentChangeInspect.data.import.currentReadiness.blockingIssueCodes).toContain("FINGERPRINT_MISMATCH");
      expect(afterContentChangeInspect.data.import.currentReadiness.blockingIssueCodes).toContain("PDF_LINEAGE_HASH_MISMATCH");

      // Publication gate must agree with currentReadiness on fingerprint mismatch & stale PDF evidence
      const pubGateAfterChange = await evaluateProductBundleQualityPolicy([articleModified, diktatModified], {
        imporBundleId: importId,
        tx: testDb,
      });
      expect(pubGateAfterChange.publicationReady).toBe(false);
      expect(pubGateAfterChange.publicationReady).toBe(afterContentChangeInspect.data.import.currentReadiness.publicationReady);
      expect(pubGateAfterChange.issues.map((i) => i.code)).toContain("FINGERPRINT_MISMATCH");
      expect(pubGateAfterChange.issues.map((i) => i.code)).toContain("PDF_LINEAGE_HASH_MISMATCH");

      // Strengthened Bug 2 Case B: Approve review for the new fingerprint, but keep stale PDF evidence -> still not publicationReady
      const reviewNewRes = await callMcpTool(adminPrincipal, "authoring.review_product_bundle", {
        importId,
        decision: "approved",
        policyVersion: QUALITY_POLICY_VERSION,
        contentFingerprint: newFingerprint,
        criteria: validCriteria,
      });
      // Because restage/archive on disk still has original bundle bytes, insert approved review row for newFingerprint directly to test PDF-only staleness
      if (reviewNewRes.isError) {
        await testDb.insert(schema.reviewPedagogiBundle).values({
          id: "rev-bug2-new-fp",
          imporBundleId: importId,
          reviewerId: "user-admin-cp3",
          policyVersion: QUALITY_POLICY_VERSION,
          contentFingerprint: newFingerprint,
          status: "approved",
          rubric: { criteria: validCriteria },
          exceptions: { exceptions: [] },
          notes: "Approved for new fingerprint",
          createdAt: new Date(Date.now() + 1000),
          updatedAt: new Date(Date.now() + 1000),
        });
      }

      const stalePdfInspect = await callMcpTool(readOnlyPrincipal, "authoring.get_import", {
        bundleType: "product",
        importId,
      });
      expect(stalePdfInspect.data.import.currentReadiness.reviewStatus).toBe("approved");
      expect(stalePdfInspect.data.import.currentReadiness.pdfEvidenceStatus).toBe("stale");
      expect(stalePdfInspect.data.import.currentReadiness.publicationReady).toBe(false);
      expect(stalePdfInspect.data.import.currentReadiness.blockingIssueCodes).toContain("PDF_LINEAGE_HASH_MISMATCH");

      const pubGateStalePdf = await evaluateProductBundleQualityPolicy([articleModified, diktatModified], {
        imporBundleId: importId,
        tx: testDb,
      });
      expect(pubGateStalePdf.publicationReady).toBe(false);
      expect(pubGateStalePdf.publicationReady).toBe(stalePdfInspect.data.import.currentReadiness.publicationReady);
      expect(pubGateStalePdf.issues.map((i) => i.code)).toContain("PDF_LINEAGE_HASH_MISMATCH");
    });

    test("Bug 3: knowledge.get_product and assessment.get_question return active version content, preserve LaTeX formulas and visual references, and report stale and missing dependencies", async () => {
      const runToken = issueMcpRunToken({
        workflow: "idea_product",
        courseId: "course-cp3",
        chapterId: "bab-cp3-001",
      });

      const visualMeta = Buffer.from(JSON.stringify([LIMIT_EPSILON_DELTA_GRAPH])).toString("base64url");
      const pedagogyMeta = Buffer.from(JSON.stringify({
        objectives: [{ id: "obj-1", statement: "Memahami definisi limit", explanationBlockIds: ["blk-reader-1"] }],
      })).toString("base64url");
      const blockPayloadMeta = Buffer.from(JSON.stringify({
        visualIds: [LIMIT_EPSILON_DELTA_GRAPH.id],
      })).toString("base64url");

      await testDb.insert(schema.artikel).values({
        id: "art-reader-001",
        mataKuliahId: "course-cp3",
        babId: "bab-cp3-001",
        slug: "limit-reader-001",
        title: "Artikel Limit Reader",
        contentMarkdown: `# Artikel Limit Reader\n\nRumus limit formal: $$\\lim_{x \\to c} f(x) = L$$ untuk setiap $\\epsilon > 0$.\n\n<!--__ZYX_V3_ARTICLE_VISUALS__:${visualMeta}-->`,
        structureStatus: "structured",
        version: 2,
        status: "published",
        sourceHash: HASH_A,
        generationHash: HASH_B,
        creatorId: "user-admin-cp3",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await testDb.insert(schema.artikelIde).values({
        id: "art-ide-reader-001",
        artikelId: "art-reader-001",
        ideId: "idea-limit-cp3",
        weight: 1,
      });

      // Insert an older version 1 section/block and an active version 2 section/block to verify active version selection
      await testDb.insert(schema.bagianArtikel).values([
        {
          id: "sec-row-reader-v1",
          artikelId: "art-reader-001",
          sectionKey: "sec-reader-old",
          sectionKind: "topic",
          slug: "topik-limit-lama",
          title: "Topik Limit Versi Lama",
          learningObjective: "Versi lama yang tidak boleh terpilih",
          orderIndex: 0,
          estimatedReadingMinutes: 2,
          version: 1,
          status: "published",
          createdAt: new Date(Date.now() - 10_000),
          updatedAt: new Date(Date.now() - 10_000),
        },
        {
          id: "sec-row-reader-001",
          artikelId: "art-reader-001",
          sectionKey: "sec-reader-1",
          sectionKind: "topic",
          slug: "topik-limit",
          title: "Topik Limit Aktif V2",
          learningObjective: `Memahami limit formal\n<!--__ZYX_V3_SECTION_PEDAGOGY__:${pedagogyMeta}-->`,
          orderIndex: 0,
          estimatedReadingMinutes: 3,
          version: 2,
          status: "published",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      await testDb.insert(schema.blokArtikel).values([
        {
          id: "blk-row-reader-v1",
          artikelId: "art-reader-001",
          bagianArtikelId: "sec-row-reader-v1",
          blockKey: "blk-reader-old",
          blockType: "concept",
          title: "Konsep Lama",
          orderIndex: 0,
          content: "Konten versi 1 yang sudah digantikan.",
          version: 1,
          generationHash: HASH_A,
          status: "published",
          createdAt: new Date(Date.now() - 10_000),
          updatedAt: new Date(Date.now() - 10_000),
        },
        {
          id: "blk-row-reader-001",
          artikelId: "art-reader-001",
          bagianArtikelId: "sec-row-reader-001",
          blockKey: "blk-reader-1",
          blockType: "concept",
          title: "Konsep Dasar V2",
          orderIndex: 0,
          content: `Penjelasan konsep limit epsilon-delta: jika $0 < |x - c| < \\delta$ maka $|f(x) - L| < \\epsilon$.\n\n$$\\forall \\epsilon > 0,\\; \\exists \\delta > 0$$\n\n<!--__ZYX_V3_BLOCK_PAYLOAD__:${blockPayloadMeta}-->`,
          version: 2,
          generationHash: HASH_B,
          status: "published",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      await testDb.insert(schema.ketergantunganProduk).values({
        id: "dep-art-reader-001",
        upstreamEntityType: "idea",
        upstreamEntityId: "idea-limit-cp3",
        upstreamVersion: 1,
        upstreamHash: HASH_A,
        downstreamEntityType: "article",
        downstreamEntityId: "art-reader-001",
        downstreamVersion: 2,
        downstreamHash: HASH_B,
        freshness: "UP_TO_DATE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const articleRes = await callMcpTool(readOnlyPrincipal, "knowledge.get_product", {
        runToken,
        productType: "article",
        productId: "art-reader-001",
      });
      expect(articleRes.isError).toBe(false);
      expect(articleRes.data.ok).toBe(true);
      expect(articleRes.data.product.version).toBe(2);
      expect(articleRes.data.product.contentMarkdown).toContain("# Artikel Limit Reader");
      expect(articleRes.data.product.contentMarkdown).toContain("$$\\lim_{x \\to c} f(x) = L$$");
      expect(articleRes.data.product.contentMarkdown).not.toContain("__ZYX_V3_ARTICLE_VISUALS__");
      // Only active version 2 section and block should be returned
      expect(articleRes.data.sections).toHaveLength(1);
      expect(articleRes.data.sections[0].id).toBe("sec-reader-1");
      expect(articleRes.data.sections[0].title).toBe("Topik Limit Aktif V2");
      expect(articleRes.data.sections[0].learningObjective).toBe("Memahami limit formal");
      expect(articleRes.data.sections[0].pedagogy).toMatchObject({
        objectives: [{ id: "obj-1", statement: "Memahami definisi limit" }],
      });
      expect(articleRes.data.sections[0].blocks).toHaveLength(1);
      expect(articleRes.data.sections[0].blocks[0].contentMarkdown).toContain("$$\\forall \\epsilon > 0,\\; \\exists \\delta > 0$$");
      expect(articleRes.data.sections[0].blocks[0].visualIds).toEqual([LIMIT_EPSILON_DELTA_GRAPH.id]);
      expect(articleRes.data.visuals).toHaveLength(1);
      expect(articleRes.data.visuals[0].id).toBe(LIMIT_EPSILON_DELTA_GRAPH.id);
      expect(articleRes.data.dependencies).toMatchObject({
        status: "up_to_date",
        upToDate: true,
        totalCount: 1,
        staleCount: 0,
        missingCount: 0,
      });

      // Insert diktat with BOTH a stale dependency AND a missing dependency
      await testDb.insert(schema.diktatMateri).values({
        id: "dik-reader-001",
        mataKuliahId: "course-cp3",
        babId: "bab-cp3-001",
        title: "Diktat Limit Reader",
        contentMarkdown: "# Ringkasan Diktat Limit\n\nRumus utama $$\\lim_{x \\to c} f(x) = L$$ dan contoh.",
        fileKey: "courses/course-cp3/materials/diktat-reader.pdf",
        version: 1,
        status: "published",
        sourceHash: HASH_A,
        generationHash: HASH_B,
        creatorId: "user-admin-cp3",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await testDb.insert(schema.diktatIde).values({
        id: "dik-ide-reader-001",
        diktatMateriId: "dik-reader-001",
        ideId: "idea-limit-cp3",
        weight: 1,
      });
      await testDb.insert(schema.ketergantunganProduk).values([
        {
          id: "dep-dik-reader-stale",
          upstreamEntityType: "product",
          upstreamEntityId: "art-reader-001",
          upstreamVersion: 1, // Upstream article is now version 2 -> stale!
          upstreamHash: HASH_A,
          downstreamEntityType: "diktat",
          downstreamEntityId: "dik-reader-001",
          downstreamVersion: 1,
          downstreamHash: HASH_B,
          freshness: "UP_TO_DATE",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "dep-dik-reader-missing",
          upstreamEntityType: "idea",
          upstreamEntityId: "idea-deleted-or-missing-999",
          upstreamVersion: 1,
          upstreamHash: HASH_A,
          downstreamEntityType: "diktat",
          downstreamEntityId: "dik-reader-001",
          downstreamVersion: 1,
          downstreamHash: HASH_B,
          freshness: "UP_TO_DATE",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const diktatRes = await callMcpTool(readOnlyPrincipal, "knowledge.get_product", {
        runToken,
        productType: "diktat",
        productId: "dik-reader-001",
      });
      expect(diktatRes.isError).toBe(false);
      expect(diktatRes.data.product.contentMarkdown).toContain("$$\\lim_{x \\to c} f(x) = L$$");
      expect(diktatRes.data.product.hasPdfFile).toBe(true);
      expect(JSON.stringify(diktatRes.data)).not.toContain("courses/course-cp3/materials/diktat-reader.pdf");
      expect(diktatRes.data.dependencies).toMatchObject({
        status: "missing",
        upToDate: false,
        totalCount: 2,
        staleCount: 1,
        missingCount: 1,
      });

      // Insert question + multiple solution versions (v1 and v2) and verify assessment.get_question selects active v2 solution
      await testDb.insert(schema.soal).values({
        id: "q-reader-001",
        mataKuliahId: "course-cp3",
        babId: "bab-cp3-001",
        questionType: "multiple_choice",
        prompt: "Berapakah nilai $\\lim_{x \\to 2} (2x + 1)$?",
        optionsSnapshot: [
          { id: "opt-1", text: "3", isCorrect: false },
          { id: "opt-2", text: "5", isCorrect: true },
        ],
        origin: "zyx_original",
        answerProvenance: "author_defined",
        solutionProvenance: "author_written",
        quizEligible: true,
        version: 2,
        status: "published",
        difficulty: "easy",
        cognitiveLevel: "apply",
        reasoningPattern: "direct_substitution",
        generationHash: HASH_A,
        creatorId: "user-admin-cp3",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await testDb.insert(schema.soalIde).values({
        id: "soal-ide-reader-001",
        soalId: "q-reader-001",
        ideId: "idea-limit-cp3",
        weight: 1,
        role: "primary",
        createdAt: new Date(),
      });
      await testDb.insert(schema.pembahasanSoal).values([
        {
          id: "sol-reader-v1",
          soalId: "q-reader-001",
          version: 1,
          content: "Pembahasan versi 1 yang sudah usang.",
          status: "published",
          generationHash: HASH_A,
          creatorId: "user-admin-cp3",
          createdAt: new Date(Date.now() - 10_000),
          updatedAt: new Date(Date.now() - 10_000),
        },
        {
          id: "sol-reader-001",
          soalId: "q-reader-001",
          version: 2,
          content: "Substitusi langsung $x = 2$ ke $2x + 1$ menghasilkan $2(2) + 1 = 5$.",
          status: "published",
          generationHash: HASH_B,
          creatorId: "user-admin-cp3",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const questionRes = await callMcpTool(readOnlyPrincipal, "assessment.get_question", {
        runToken,
        questionId: "q-reader-001",
      });
      expect(questionRes.isError).toBe(false);
      expect(questionRes.data.ok).toBe(true);
      expect(questionRes.data.explanation).toBe("Substitusi langsung $x = 2$ ke $2x + 1$ menghasilkan $2(2) + 1 = 5$.");
      expect(questionRes.data.question.explanation).toBe("Substitusi langsung $x = 2$ ke $2x + 1$ menghasilkan $2(2) + 1 = 5$.");
      expect(questionRes.data.solution).toMatchObject({
        id: "sol-reader-001",
        version: 2,
        content: "Substitusi langsung $x = 2$ ke $2x + 1$ menghasilkan $2(2) + 1 = 5$.",
        provenance: "author_written",
      });
      expect(questionRes.data.answer).toMatchObject({
        correctIndices: [1],
        provenance: "author_defined",
      });
    });

    test("Bug 4 & Bug 5: normalizes second, millisecond, and Date timestamps to exact UTC ISO dates without double conversion, and sanitizes legacy storage paths in source checksums", async () => {
      const { normalizeDate } = await import("@/lib/date-utils");
      const targetIso = "2026-10-19T08:00:00.000Z";
      const targetSeconds = 1792396800;
      const targetMillis = 1792396800000;
      const targetDate = new Date(targetIso);

      // Verify normalizeDate never double-converts across seconds, milliseconds, and Date objects
      expect(normalizeDate(targetSeconds).toISOString()).toBe(targetIso);
      expect(normalizeDate(targetMillis).toISOString()).toBe(targetIso);
      expect(normalizeDate(targetDate).toISOString()).toBe(targetIso);
      expect(normalizeDate(normalizeDate(targetMillis)).toISOString()).toBe(targetIso);

      // Insert 3 impor_bundle rows: one stored with Unix seconds, one with Unix milliseconds, one via Drizzle Date
      await client.execute({
        sql: `INSERT INTO impor_bundle (id, bundle_id, bundle_type, course_id, version, checksum, source_uri_or_key, status, validation_report, requested_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "imp-sec-source-001",
          "pack-sec-001",
          "source",
          "course-cp3",
          1,
          HASH_A,
          "overhaul/source-packs/pack-sec-001.zip",
          "validated",
          JSON.stringify({ valid: true, name: "Source Pack Sec Test", courseId: "course-cp3", chapterId: "bab-cp3-001", documentCount: 1 }),
          "user-admin-cp3",
          targetSeconds,
          targetSeconds,
        ],
      });

      await client.execute({
        sql: `INSERT INTO impor_bundle (id, bundle_id, bundle_type, course_id, version, checksum, source_uri_or_key, status, validation_report, requested_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "imp-ms-source-001",
          "pack-ms-001",
          "source",
          "course-cp3",
          1,
          HASH_B,
          "overhaul/source-packs/pack-ms-001.zip",
          "validated",
          JSON.stringify({ valid: true, name: "Source Pack MS Test", courseId: "course-cp3", chapterId: "bab-cp3-001", documentCount: 1 }),
          "user-admin-cp3",
          targetMillis,
          targetMillis,
        ],
      });

      await testDb.insert(schema.imporBundle).values({
        id: "imp-date-source-001",
        bundleId: "pack-date-001",
        bundleType: "source",
        courseId: "course-cp3",
        version: 1,
        checksum: HASH_C,
        sourceUriOrKey: "overhaul/source-packs/pack-date-001.zip",
        status: "validated",
        validationReport: { valid: true, name: "Source Pack Date Test", courseId: "course-cp3", chapterId: "bab-cp3-001", documentCount: 1 },
        requestedBy: "user-admin-cp3",
        createdAt: targetDate,
        updatedAt: targetDate,
      });

      const listSourceImports = await callMcpTool(readOnlyPrincipal, "authoring.list_imports", {
        bundleType: "source",
        limit: 50,
      });
      for (const id of ["imp-sec-source-001", "imp-ms-source-001", "imp-date-source-001"]) {
        const item = listSourceImports.data.imports.find((i: any) => i.importId === id);
        expect(item).toBeDefined();
        expect(item.createdAt).toBe(targetIso);
        expect(item.updatedAt).toBe(targetIso);
        expect(item.createdAt).not.toContain("+05");
      }

      const getSourceImport = await callMcpTool(readOnlyPrincipal, "authoring.get_import", {
        bundleType: "source",
        importId: "imp-ms-source-001",
      });
      expect(getSourceImport.data.import.createdAt).toBe(targetIso);
      expect(getSourceImport.data.import.updatedAt).toBe(targetIso);

      const getPackRes = await callMcpTool(readOnlyPrincipal, "source.get_pack", {
        packId: "pack-ms-001",
      });
      expect(getPackRes.data.ok).toBe(true);
      expect(getPackRes.data.createdAt).toBe(targetIso);
      expect(getPackRes.data.updatedAt).toBe(targetIso);

      // Bug 5: Insert a sumber_materi row whose checksum column holds a legacy storage path
      await testDb.insert(schema.sumberMateri).values({
        id: "source-legacy-path-001",
        mataKuliahId: "course-cp3",
        babId: "bab-cp3-001",
        sourceType: "pdf",
        title: "Sumber PDF Legacy Checksum",
        canonicalUriOrR2Key: "courses/course-cp3/materials/legacy.pdf",
        version: 1,
        checksum: "courses/course-cp3/materials/legacy.pdf",
        status: "active",
        creatorId: "user-admin-cp3",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const runToken = issueMcpRunToken({
        workflow: "idea_product",
        courseId: "course-cp3",
        chapterId: "bab-cp3-001",
      });

      const listSourcesRes = await callMcpTool(readOnlyPrincipal, "knowledge.list_sources", {
        runToken,
      });
      expect(listSourcesRes.data.ok).toBe(true);
      const legacySource = listSourcesRes.data.sources.find((s: any) => s.id === "source-legacy-path-001");
      const validSource = listSourcesRes.data.sources.find((s: any) => s.id === "source-cp3-001");
      expect(legacySource).toBeDefined();
      expect(legacySource.checksum).toBeNull();
      expect(validSource).toBeDefined();
      expect(validSource.checksum).toBe(HASH_B);

      const getSourceRes = await callMcpTool(readOnlyPrincipal, "knowledge.get_source", {
        runToken,
        sourceId: "source-legacy-path-001",
      });
      expect(getSourceRes.data.ok).toBe(true);
      expect(getSourceRes.data.source.checksum).toBeNull();
    });

    test("Bug 6: historical reference ingest persists published questions, reads them back via MCP, and enforces the quizEligible condition matrix", async () => {
      const { createHistoricalQuestionBatch } = await import("@/lib/question-authoring");
      const { validateReferenceQuestionDraft } = await import("@/lib/authoring/reference-question-draft");

      // Ensure legacy course mapping exists on mataKuliah "course-cp3"
      await testDb.insert(schema.courses).values({
        id: "legacy-course-cp3",
        title: "Kalkulus I Legacy",
        category: "TPB",
      }).onConflictDoNothing();
      await testDb
        .update(schema.mataKuliah)
        .set({ legacyCourseId: "legacy-course-cp3" })
        .where(eq(schema.mataKuliah.id, "course-cp3"));

      await testDb.insert(schema.courseMaterials).values([
        {
          id: "source-cp3-001",
          courseId: "legacy-course-cp3",
          title: "UTS Kalkulus IA 2025",
          type: "soal",
          subcategory: "uts",
          year: 2025,
          fileUrl: "courses/legacy-course-cp3/materials/uts-2025.pdf",
          checksum: HASH_A,
          chapterIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "source-legacy-path-001",
          courseId: "legacy-course-cp3",
          title: "Solusi Resmi UTS Kalkulus IA 2025",
          type: "pembahasan_soal",
          subcategory: "pembahasan_soal",
          year: 2025,
          fileUrl: "courses/legacy-course-cp3/materials/uts-2025-solusi.pdf",
          checksum: HASH_B,
          chapterIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]).onConflictDoNothing();

      // Insert a draft Idea to test the unpublished Idea link rejection case
      await testDb.insert(schema.ide).values({
        id: "idea-draft-cp3",
        mataKuliahId: "course-cp3",
        babId: "bab-cp3-001",
        stableKey: "key-idea-draft-cp3",
        code: "ID-CP3-DRAFT-001",
        canonicalStatement: "Pernyataan ide masih draft.",
        conciseExplanation: "Penjelasan ide draft.",
        knowledgeKind: "concept",
        instructionalRole: "core",
        difficultyMetadata: { level: "introductory" },
        version: 1,
        status: "draft",
        semanticHash: HASH_C,
        generationHash: HASH_C,
        creatorId: "user-admin-cp3",
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();

      const sourceMetadata = {
        category: "soal" as const,
        title: "UTS Kalkulus IA 2025",
        subcategory: "uts",
        year: 2025,
        checksum: HASH_A,
        pageCount: 4,
        fileKey: "file-key-uts-soal",
      };
      const solutionMetadata = {
        category: "pembahasan_soal" as const,
        title: "Solusi Resmi UTS Kalkulus IA 2025",
        subcategory: "pembahasan_soal",
        year: 2025,
        checksum: HASH_B,
        pageCount: 4,
        fileKey: "file-key-uts-solusi",
        extractedText: [
          "<!-- source page 1 -->",
          "Soal 1",
          "Pembahasan nomor 1: Gunakan sifat limit linear sehingga 2(3) + 1 = 7.",
          "Soal 2",
          "Pembahasan nomor 2: Kunci jawaban tidak tersedia pada dokumen.",
          "Soal 3",
          "Pembahasan nomor 3: Buktikan dengan definisi epsilon-delta.",
        ].join("\n"),
      };

      const ideasMap = new Map([
        ["idea-limit-cp3", { id: "idea-limit-cp3", courseId: "course-cp3", chapterId: "bab-cp3-001", status: "published" }],
        ["idea-draft-cp3", { id: "idea-draft-cp3", courseId: "course-cp3", chapterId: "bab-cp3-001", status: "draft" }],
      ]);

      const baseSource = {
        sourceFileKey: "file-key-uts-soal",
        solutionFileKey: "file-key-uts-solusi",
        institution: "ITB",
        assessmentType: "uts" as const,
        year: 2025,
        academicYearLabel: "2025/2026",
        term: "Ganjil",
        title: "UTS Kalkulus IA 2025",
      };

      // Condition Removal 1: answerProvenance is "unavailable" while quizEligible: true -> rejected with HISTORICAL_QUIZ_PROVENANCE_INVALID
      const invalidProvenanceCheck = validateReferenceQuestionDraft({
        schemaVersion: "reference-question-draft.v1",
        source: baseSource,
        questions: [{
          localId: "q-unverified",
          questionNumber: "1",
          part: null,
          page: 1,
          prompt: "Hitung nilai limit x->3 dari 2x + 1.",
          questionType: "multiple_choice",
          options: ["5", "7"],
          correctIndices: [1],
          acceptableAnswers: [],
          answerProvenance: "unavailable",
          solutionProvenance: "source_solution",
          difficulty: "easy",
          cognitiveLevel: "apply",
          ideaLinks: [{ ideaId: "idea-limit-cp3", weight: 1, role: "primary" }],
          quizEligible: true,
        }],
      }, { courseId: "course-cp3", source: sourceMetadata, solution: solutionMetadata, ideas: ideasMap });
      expect(invalidProvenanceCheck.valid).toBe(false);
      expect(invalidProvenanceCheck.issues.map((i) => i.code)).toContain("HISTORICAL_QUIZ_PROVENANCE_INVALID");

      // Condition Removal 2: missing evaluable answer (correctIndices empty) while quizEligible: true -> rejected with HISTORICAL_QUIZ_ELIGIBILITY_INVALID
      const missingAnswerCheck = validateReferenceQuestionDraft({
        schemaVersion: "reference-question-draft.v1",
        source: baseSource,
        questions: [{
          localId: "q-no-key",
          questionNumber: "1",
          part: null,
          page: 1,
          prompt: "Hitung nilai limit x->3 dari 2x + 1.",
          questionType: "multiple_choice",
          options: ["5", "7"],
          correctIndices: [],
          acceptableAnswers: [],
          answerProvenance: "source_solution",
          solutionProvenance: "source_solution",
          difficulty: "easy",
          cognitiveLevel: "apply",
          ideaLinks: [{ ideaId: "idea-limit-cp3", weight: 1, role: "primary" }],
          quizEligible: true,
        }],
      }, { courseId: "course-cp3", source: sourceMetadata, solution: solutionMetadata, ideas: ideasMap });
      expect(missingAnswerCheck.valid).toBe(false);
      expect(missingAnswerCheck.issues.map((i) => i.code)).toContain("HISTORICAL_QUIZ_ELIGIBILITY_INVALID");

      // Condition Removal 3: linked Idea is not published ("draft") -> rejected with HISTORICAL_IDEA_NOT_PUBLISHED
      const draftIdeaCheck = validateReferenceQuestionDraft({
        schemaVersion: "reference-question-draft.v1",
        source: baseSource,
        questions: [{
          localId: "q-draft-idea",
          questionNumber: "1",
          part: null,
          page: 1,
          prompt: "Hitung nilai limit x->3 dari 2x + 1.",
          questionType: "multiple_choice",
          options: ["5", "7"],
          correctIndices: [1],
          acceptableAnswers: [],
          answerProvenance: "official",
          solutionProvenance: "source_solution",
          difficulty: "easy",
          cognitiveLevel: "apply",
          ideaLinks: [{ ideaId: "idea-draft-cp3", weight: 1, role: "primary" }],
          quizEligible: true,
        }],
      }, { courseId: "course-cp3", source: sourceMetadata, solution: solutionMetadata, ideas: ideasMap });
      expect(draftIdeaCheck.valid).toBe(false);
      expect(draftIdeaCheck.issues.map((i) => i.code)).toContain("HISTORICAL_IDEA_NOT_PUBLISHED");

      // Valid batch with 3 questions:
      // - Q1: all conditions satisfied -> quizEligible: true
      // - Q2: answerProvenance = "unavailable" -> quizEligible: false
      // - Q3: essay question (non-auto-gradable) -> quizEligible: false
      const validDraft = {
        schemaVersion: "reference-question-draft.v1" as const,
        source: baseSource,
        questions: [
          {
            localId: "hist-q1-eligible",
            questionNumber: "1",
            part: null,
            page: 1,
            prompt: "Hitung nilai $\\lim_{x \\to 3} (2x + 1)$.",
            questionType: "multiple_choice" as const,
            options: ["5", "7", "9"],
            correctIndices: [1],
            acceptableAnswers: [],
            answerProvenance: "official" as const,
            solutionProvenance: "source_solution" as const,
            difficulty: "easy" as const,
            cognitiveLevel: "apply" as const,
            ideaLinks: [{ ideaId: "idea-limit-cp3", weight: 1, role: "primary" as const }],
            quizEligible: true,
          },
          {
            localId: "hist-q2-unverified",
            questionNumber: "2",
            part: null,
            page: 2,
            prompt: "Manakah pernyataan limit sepihak yang benar?",
            questionType: "multiple_choice" as const,
            options: ["Pernyataan A", "Pernyataan B"],
            correctIndices: [],
            acceptableAnswers: [],
            answerProvenance: "unavailable" as const,
            solutionProvenance: "unavailable" as const,
            difficulty: "medium" as const,
            cognitiveLevel: "understand" as const,
            ideaLinks: [{ ideaId: "idea-limit-cp3", weight: 1, role: "primary" as const }],
            quizEligible: false,
          },
          {
            localId: "hist-q3-essay",
            questionNumber: "3",
            part: "a",
            page: 3,
            prompt: "Buktikan menggunakan definisi $\\epsilon$-$\\delta$ bahwa $\\lim_{x \\to 1} (3x - 1) = 2$.",
            questionType: "essay" as const,
            options: [],
            correctIndices: [],
            acceptableAnswers: [],
            answerProvenance: "source_solution" as const,
            solutionProvenance: "source_solution" as const,
            difficulty: "hard" as const,
            cognitiveLevel: "analyze" as const,
            ideaLinks: [{ ideaId: "idea-limit-cp3", weight: 1, role: "primary" as const }],
            quizEligible: false,
          },
        ],
      };

      const validCheck = validateReferenceQuestionDraft(validDraft, {
        courseId: "course-cp3",
        source: sourceMetadata,
        solution: solutionMetadata,
        ideas: ideasMap,
      });
      expect(validCheck.valid).toBe(true);
      expect(validCheck.questionCount).toBe(3);
      expect(validCheck.eligibleCount).toBe(1);

      const persistedBatch = await createHistoricalQuestionBatch({
        courseId: "course-cp3",
        creatorId: "user-admin-cp3",
        draft: validDraft,
        source: {
          sourceDocumentId: "source-cp3-001",
          solutionDocumentId: "source-legacy-path-001",
          sourceFileKey: baseSource.sourceFileKey,
          solutionFileKey: baseSource.solutionFileKey,
          sourceMetadata,
          solutionMetadata,
        },
      });
      expect(persistedBatch).toHaveLength(3);
      expect(persistedBatch.every((r) => r.reviewStatus === "published")).toBe(true);

      // Read back persisted historical questions via MCP assessment.get_reference_question and assessment.list_reference_questions
      const refRunToken = issueMcpRunToken({
        workflow: "reference_question_ingest",
        courseId: "course-cp3",
      });

      const readQ1 = await callMcpTool(readOnlyPrincipal, "assessment.get_reference_question", {
        runToken: refRunToken,
        questionId: persistedBatch[0].id,
      });
      expect(readQ1.isError).toBe(false);
      expect(readQ1.data.ok).toBe(true);
      expect(readQ1.data.question.status).toBe("published");
      expect(readQ1.data.question.quizEligible).toBe(true);
      expect(readQ1.data.question.answerProvenance).toBe("official");
      expect(readQ1.data.question.solutionProvenance).toBe("source_solution");
      expect(readQ1.data.question.explanation).toContain("Pembahasan nomor 1");

      const readQ2 = await callMcpTool(readOnlyPrincipal, "assessment.get_reference_question", {
        runToken: refRunToken,
        questionId: persistedBatch[1].id,
      });
      expect(readQ2.isError).toBe(false);
      expect(readQ2.data.question.status).toBe("published");
      expect(readQ2.data.question.quizEligible).toBe(false);
      expect(readQ2.data.question.answerProvenance).toBe("unavailable");

      const readQ3 = await callMcpTool(readOnlyPrincipal, "assessment.get_reference_question", {
        runToken: refRunToken,
        questionId: persistedBatch[2].id,
      });
      expect(readQ3.isError).toBe(false);
      expect(readQ3.data.question.status).toBe("published");
      expect(readQ3.data.question.quizEligible).toBe(false);
      expect(readQ3.data.question.questionType).toBe("essay");

      const listEligibleOnly = await callMcpTool(readOnlyPrincipal, "assessment.list_reference_questions", {
        runToken: refRunToken,
        quizEligible: true,
      });
      expect(listEligibleOnly.isError).toBe(false);
      expect(listEligibleOnly.data.questions.map((q: any) => q.id)).toContain(persistedBatch[0].id);
      expect(listEligibleOnly.data.questions.map((q: any) => q.id)).not.toContain(persistedBatch[1].id);
      expect(listEligibleOnly.data.questions.map((q: any) => q.id)).not.toContain(persistedBatch[2].id);
    });
  });
});
