import { describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";

const sourcePackStorageMap: Map<string, Uint8Array> =
  ((globalThis as any).__mcpSharedStorageMap ??= new Map<string, Uint8Array>());
const mockSourcePackStorage = {
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
    sourcePackStorageMap.set(key, bytes);
    return { url: `memory://${key}`, key, size: bytes.byteLength };
  },
  delete: async (key: string) => {
    sourcePackStorageMap.delete(key);
  },
  getUrl: (key: string) => `memory://${key}`,
  exists: async (key: string) => sourcePackStorageMap.has(key),
  download: async (key: string) => {
    const data = sourcePackStorageMap.get(key);
    if (!data) {
      throw new Error(`PRODUCT_BUNDLE_STORAGE_DOWNLOAD_UNAVAILABLE:${key}`);
    }
    return data;
  },
  copy: async (sourceKey: string, destKey: string) => {
    const data = sourcePackStorageMap.get(sourceKey);
    if (!data) throw new Error(`Source not found: ${sourceKey}`);
    sourcePackStorageMap.set(destKey, data);
    return { url: `memory://${destKey}`, key: destKey };
  },
  getPresignedUrl: async (key: string) => `memory://${key}`,
  downloadBytes: async (key: string) => {
    const data = sourcePackStorageMap.get(key);
    if (!data) throw new Error(`STORAGE_NOT_FOUND:${key}`);
    return data;
  },
  headObject: async (key: string) => {
    const data = sourcePackStorageMap.get(key);
    return data ? { exists: true, size: data.byteLength } : { exists: false };
  },
  listObjects: async () => ({ objects: [], isTruncated: false }),
};

mock.module("@/lib/storage", () => ({
  getStorage: () => mockSourcePackStorage,
  storage: mockSourcePackStorage,
}));

import { buildSourcePackKey } from "@/lib/storage/keys";
import { validateSourcePack } from "@/lib/authoring/source-pack";
import {
  stageSourcePack,
  listSourcePackImports,
  getSourcePackImport,
  readStoredSourcePackDocument,
} from "@/lib/bundle/source-staging";
import {
  issueMcpRunToken,
  issueSourcePackToken,
  listMcpChapterChoices,
  listMcpCourseChoices,
  readMcpCatalogScope,
  readMcpSourcePackBinding,
  startAuthoringWorkflow,
} from "@/lib/authoring/mcp-workflows";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAuthoringMcpServer } from "@/lib/authoring/mcp-server";
import { db } from "@/db";
import { courses, mataKuliah, bab, user, pengguna } from "@/db/schema";
import { eq } from "drizzle-orm";

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

describe("Source Pack Storage & Persistence", () => {
  it("accepts truthful OpenAI generator provenance", () => {
    const { bytes } = sampleSourcePack("source-pack-openai-01", "openai");
    expect(validateSourcePack(bytes).manifest.generator.provider).toBe("openai");
  });

  it("builds consistent R2 object keys using buildSourcePackKey", () => {
    const checksum = "b".repeat(64);
    const key = buildSourcePackKey({
      scopeKey: "kalkulus-1",
      packId: "pack-limit",
      checksum,
    });
    expect(key).toBe(`overhaul/source-packs/kalkulus-1/pack-limit-${checksum.slice(0, 16)}.zip`);

    const defaultKey = buildSourcePackKey({
      packId: "pack-shared",
      checksum,
    });
    expect(defaultKey).toBe(`overhaul/source-packs/shared/pack-shared-${checksum.slice(0, 16)}.zip`);
  });

  it("stages Source Pack into R2 and database and returns valid import result", async () => {
    const { bytes } = sampleSourcePack("source-pack-persistence-01");
    const parsed = validateSourcePack(bytes);

    // Get an existing course or use test actor
    const [existingCourse] = await db.select({ id: courses.id }).from(courses).limit(1);
    const courseId = existingCourse?.id ?? "test-course-id";
    if (!existingCourse) {
      await db.insert(courses).values({ id: courseId, title: "Test Course", category: "TPB" }).onConflictDoNothing();
    }
    const [existingUser] = await db.select({ id: user.id }).from(user).limit(1);
    const actorId = existingUser?.id ?? "test-user-id";
    if (!existingUser) {
      await db.insert(user).values({
        id: actorId,
        name: "Test User",
        email: "test-user@zyx.test",
        emailVerified: true,
        role: "admin",
        createdAt: new Date("2026-10-19T08:00:00.000Z"),
        updatedAt: new Date("2026-10-19T08:00:00.000Z"),
      }).onConflictDoNothing();
    }
    await db.insert(pengguna).values({ id: actorId, status: "active" }).onConflictDoNothing();

    const result = await stageSourcePack({
      bytes,
      sourcePack: parsed,
      requestedBy: actorId,
      courseId,
      chapterId: "test-chapter-1",
      scopeKey: "matematika",
    });

    expect(result.created).toBe(true);
    expect(result.status).toBe("validated");
    expect(result.packId).toBe("source-pack-persistence-01");
    expect(result.sourceKey).toContain("overhaul/source-packs/matematika/source-pack-persistence-01-");

    // Re-staging the same pack is idempotent
    const idempotent = await stageSourcePack({
      bytes,
      sourcePack: parsed,
      requestedBy: actorId,
      courseId,
      chapterId: "test-chapter-1",
      scopeKey: "matematika",
    });

    expect(idempotent.created).toBe(false);
    expect(idempotent.status).toBe("existing");
    expect(idempotent.packId).toBe(result.packId);
    expect(idempotent.checksum).toBe(result.checksum);
  });

  it("lists and gets staged Source Packs with query filters", async () => {
    const pack = await getSourcePackImport("source-pack-persistence-01");
    expect(pack).not.toBeNull();
    expect(pack?.bundleId).toBe("source-pack-persistence-01");
    expect(pack?.validationReport.valid).toBe(true);
    expect(pack?.validationReport.documents?.length).toBe(1);

    const list = await listSourcePackImports({ chapterId: "test-chapter-1" });
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((item) => item.bundleId === "source-pack-persistence-01")).toBe(true);
  });

  it("reads stored document markdown directly from staged Source Pack in storage", async () => {
    const pack = await getSourcePackImport("source-pack-persistence-01");
    expect(pack).not.toBeNull();

    const { document } = await readStoredSourcePackDocument(pack!.sourceUriOrKey, "doc-kalkulus-01");
    expect(document.id).toBe("doc-kalkulus-01");
    expect(document.markdown).toContain("Kalkulus Dasar");
    expect(document.markdown).toContain("Limit fungsi mendekati nol.");
  });

  it("issues a ready-to-use sourcePackToken from stored record", async () => {
    const stored = await getSourcePackImport("source-pack-persistence-01");
    expect(stored).not.toBeNull();

    const token = issueSourcePackToken({
      checksum: stored!.checksum,
      packId: stored!.bundleId,
      name: stored!.validationReport.name ?? stored!.bundleId,
      summary: (stored!.validationReport.summary as any) ?? {
        packId: stored!.bundleId,
        name: stored!.validationReport.name ?? stored!.bundleId,
        archiveChecksum: stored!.checksum,
        documentCount: 1,
        unitCount: 1,
        sectionCount: 1,
        questionCount: 0,
        solutionCount: 0,
        quality: stored!.validationReport.quality as any,
        documents: stored!.validationReport.documents as any,
      },
      courseId: stored!.courseId ?? undefined,
      chapterId: stored!.validationReport.chapterId,
    });

    expect(token).toBeDefined();
    const binding = readMcpSourcePackBinding(token);
    expect(binding.courseId).toBe(stored!.courseId ?? undefined);
    expect(binding.chapterId).toBe(stored!.validationReport.chapterId);
  });

  it("serves source.get_pack, authoring.list_imports, and authoring.get_import via MCP tools", async () => {
    const testPrincipal = {
      userId: "test-admin",
      actorId: "test-admin",
      sessionId: "test-session",
      scopes: ["authoring:read", "authoring:stage", "authoring:review", "authoring:withdraw"],
      authMethod: "session" as const,
    };

    async function callTool(name: string, args: Record<string, unknown>) {
      const server = createAuthoringMcpServer(testPrincipal);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      const response = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      }));
      return response.json() as Promise<any>;
    }

    // Call source.get_pack
    const getPackBody = await callTool("source.get_pack", { packId: "source-pack-persistence-01", documentId: "doc-kalkulus-01" });
    expect(getPackBody.result?.isError).toBeFalsy();
    expect(getPackBody.result?.structuredContent?.ok).toBe(true);
    expect(getPackBody.result?.structuredContent?.document?.markdown).toContain("Kalkulus Dasar");
    expect(getPackBody.result?.structuredContent?.sourcePackToken).toBeDefined();

    // Call authoring.list_imports with bundleType: "source"
    const listImportsBody = await callTool("authoring.list_imports", { bundleType: "source", limit: 10 });
    expect(listImportsBody.result?.isError).toBeFalsy();
    expect(listImportsBody.result?.structuredContent?.ok).toBe(true);
    expect(listImportsBody.result?.structuredContent?.bundleType).toBe("source");
    expect(listImportsBody.result?.structuredContent?.imports?.some((item: any) => item.bundleId === "source-pack-persistence-01")).toBe(true);

    // Call authoring.get_import with bundleType: "source"
    const getImportBody = await callTool("authoring.get_import", { bundleType: "source", importId: "source-pack-persistence-01" });
    expect(getImportBody.result?.isError).toBeFalsy();
    expect(getImportBody.result?.structuredContent?.ok).toBe(true);
    expect(getImportBody.result?.structuredContent?.import?.bundleId).toBe("source-pack-persistence-01");
  });

  it("allows starting authoring workflow directly using sourcePackId", async () => {
    const courses = await listMcpCourseChoices();
    if (courses.length === 0) return;
    const courseChoice = courses[0];
    const chapters = await listMcpChapterChoices(courseChoice.key);
    if (chapters.length === 0) return;
    const chapterChoice = chapters[0];

    // Stage a pack specifically for this course and chapter
    const { bytes } = sampleSourcePack("source-pack-workflow-reuse-01");
    const parsed = validateSourcePack(bytes);
    const [existingUser] = await db.select({ id: user.id }).from(user).limit(1);
    const actorId = existingUser?.id ?? "test-user-id";

    // Read real courseId & chapterId from choice tokens
    const binding = readMcpCatalogScope(courseChoice.key, chapterChoice.key);

    await stageSourcePack({
      bytes,
      sourcePack: parsed,
      requestedBy: actorId,
      courseId: binding.courseId,
      chapterId: binding.chapterId,
      scopeKey: "matematika",
    });

    const testPrincipal = {
      userId: "test-admin",
      actorId: "test-admin",
      sessionId: "test-session",
      scopes: ["authoring:read", "authoring:stage", "authoring:review", "authoring:withdraw"],
      authMethod: "session" as const,
    };

    const server = createAuthoringMcpServer(testPrincipal);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);

    // Call workflow.start with sourcePackId
    const startResponse = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 20,
        method: "tools/call",
        params: {
          name: "workflow.start",
          arguments: {
            workflow: "idea_product",
            sourcePackId: "source-pack-workflow-reuse-01",
            courseKey: courseChoice.key,
            chapterKey: chapterChoice.key,
          },
        },
      }),
    }));
    const startBody = await startResponse.json() as any;
    expect(startBody.result?.isError).toBeFalsy();
    expect(startBody.result?.structuredContent?.ok).toBe(true);
    expect(startBody.result?.structuredContent?.runToken).toBeDefined();
    expect(startBody.result?.structuredContent?.source?.packId).toBe("source-pack-workflow-reuse-01");
  });

  it("handles two Source Pack revisions with the same packId (synthetic Kimia Bab 5 Energi dan Perubahannya 5-correction scenario), explicit importId selection, default latest selection, equal-timestamp tie-breaker, Markdown hash verification, checksum conflict & case-insensitivity, and workflow revision pinning", async () => {
    const sharedPackId = "8c4b7d11-1ebe-4433-b51c-56fdd0f523e2";
    const docId = "source-doc-kimia-bab5-scl";

    function buildKimiaPack(markdownText: string, name: string) {
      const markdown = strToU8(markdownText);
      const markdownSha256 = digest(markdown);
      const original = strToU8(`PDF-KIMIA-BAB5:${name}`);
      const originalSha256 = digest(original);
      const coverage = {
        documentId: docId,
        status: "complete",
        expectedUnits: 6,
        processedUnits: [1, 2, 3, 4, 5, 6],
        inventory: { headings: 2, formulas: 5, tables: 0, examples: 1, applications: 0, visuals: 0, questions: 1, solutions: 0 },
        outputCounts: { headings: 2, formulas: 5, tables: 0, examples: 1, applications: 0, visualExplanations: 0, questions: 1, solutions: 0 },
        unresolved: [],
        reviewPasses: ["inventory", "transcription", "visual", "reconciliation"],
      };
      const manifest = {
        schemaVersion: "zyx-source-pack.v1",
        packId: sharedPackId,
        name,
        language: "id",
        createdAt: "2026-10-19T08:00:00.000Z",
        generator: { provider: "openai", model: "gpt-5", promptVersion: "stored-source.v1" },
        documents: [{
          id: docId,
          title: "Bab 5 Energi dan Perubahannya",
          originalFilename: "kimia-bab-5-scl.pdf",
          originalMediaType: "application/pdf",
          originalSha256,
          role: "material",
          unitKind: "page",
          expectedUnits: 6,
          markdownPath: "documents/001-kimia-bab5.md",
          coveragePath: `coverage/${docId}.json`,
          markdownSha256,
        }],
      };
      const bytes = zipSync({
        "manifest.json": strToU8(`${JSON.stringify(manifest)}\n`),
        "documents/001-kimia-bab5.md": markdown,
        [`coverage/${docId}.json`]: strToU8(`${JSON.stringify(coverage)}\n`),
      });
      return { bytes, markdownText, markdownSha256 };
    }

    // Synthetic fixture modeling Bab 5 Energi dan Perubahannya:
    // Revision A has lowercase c on page 1 (2 places) and spurious ^\circ on page 6 soal 5 (3 places)
    const revisionAMarkdown = [
      "<!-- source-unit: 1 -->",
      "# Bab 5 Energi dan Perubahannya",
      "Kapasitas kalor kalorimeter bom pada halaman 1: $q_{\\text{kal}} = c_{\\text{kal}} \\Delta T$.",
      "Hubungan kapasitas kalor dan kalor jenis pada halaman 1: $c = m \\cdot s$.",
      "<!-- source-unit: 2 -->",
      "Entalpi sistem pada tekanan tetap.",
      "<!-- source-unit: 3 -->",
      "Hukum Hess dan kalorimetri.",
      "<!-- source-unit: 4 -->",
      "Entalpi pembentukan standar.",
      "<!-- source-unit: 5 -->",
      "Energi ikatan rata-rata.",
      "<!-- source-unit: 6 -->",
      "## Soal 5",
      "Diketahui pada halaman 6 soal 5: $\\Delta H_1^\\circ = -285,8\\text{ kJ}$, $\\Delta H_2^\\circ = -393,5\\text{ kJ}$, dan $\\Delta H_{\\text{reaksi}}^\\circ = -890,4\\text{ kJ}$.",
      "",
    ].join("\n");

    // Revision B: 2 changes c -> C on page 1, and 3 removals of ^\circ on page 6 soal 5
    const fiveKimiaCorrections = [
      "Kapasitas kalor kalorimeter bom pada halaman 1: $q_{\\text{kal}} = C_{\\text{kal}} \\Delta T$.",
      "Hubungan kapasitas kalor dan kalor jenis pada halaman 1: $C = m \\cdot s$.",
      "$\\Delta H_1 = -285,8\\text{ kJ}$",
      "$\\Delta H_2 = -393,5\\text{ kJ}$",
      "$\\Delta H_{\\text{reaksi}} = -890,4\\text{ kJ}$",
    ];
    const revisionBMarkdown = [
      "<!-- source-unit: 1 -->",
      "# Bab 5 Energi dan Perubahannya",
      fiveKimiaCorrections[0],
      fiveKimiaCorrections[1],
      "<!-- source-unit: 2 -->",
      "Entalpi sistem pada tekanan tetap.",
      "<!-- source-unit: 3 -->",
      "Hukum Hess dan kalorimetri.",
      "<!-- source-unit: 4 -->",
      "Entalpi pembentukan standar.",
      "<!-- source-unit: 5 -->",
      "Energi ikatan rata-rata.",
      "<!-- source-unit: 6 -->",
      "## Soal 5",
      `Diketahui pada halaman 6 soal 5: ${fiveKimiaCorrections[2]}, ${fiveKimiaCorrections[3]}, dan ${fiveKimiaCorrections[4]}.`,
      "",
    ].join("\n");

    const packA = buildKimiaPack(revisionAMarkdown, "Kimia Bab 5 Revisi A");
    const packB = buildKimiaPack(revisionBMarkdown, "Kimia Bab 5 Revisi B");
    const parsedA = validateSourcePack(packA.bytes);
    const parsedB = validateSourcePack(packB.bytes);

    // Ensure a valid course & chapter exist for workflow binding
    await db.insert(user).values({
      id: "admin-kimia-rev",
      name: "Admin Kimia",
      email: "admin-kimia-rev@zyx.test",
      emailVerified: true,
      role: "admin",
      createdAt: new Date("2026-10-19T08:00:00.000Z"),
      updatedAt: new Date("2026-10-19T08:00:00.000Z"),
    }).onConflictDoNothing();
    await db.insert(pengguna).values({
      id: "admin-kimia-rev",
      status: "active",
    }).onConflictDoNothing();
    await db.insert(courses).values({
      id: "legacy-ki1101-rev",
      title: "Kimia Dasar I",
      category: "TPB",
    }).onConflictDoNothing();
    await db.insert(mataKuliah).values({
      id: "mk-ki1101-rev",
      code: "KI1101-REV",
      title: "Kimia Dasar I",
      legacyCourseId: "legacy-ki1101-rev",
      status: "active",
    }).onConflictDoNothing();
    await db.insert(bab).values({
      id: "bab-ki1101-rev-05",
      mataKuliahId: "mk-ki1101-rev",
      code: "BAB-05",
      title: "Energi dan Perubahannya",
      orderIndex: 5,
      status: "active",
    }).onConflictDoNothing();

    // 1. Stage Revision A first
    const stagedA = await stageSourcePack({
      bytes: packA.bytes,
      sourcePack: parsedA,
      requestedBy: "admin-kimia-rev",
      courseId: "mk-ki1101-rev",
      chapterId: "bab-ki1101-rev-05",
      scopeKey: "kimia-dasar-1",
    });
    expect(stagedA.created).toBe(true);

    const testPrincipal = {
      userId: "admin-kimia-rev",
      actorId: "admin-kimia-rev",
      sessionId: "test-session-kimia",
      scopes: ["authoring:read", "authoring:stage", "authoring:review", "authoring:withdraw"],
      authMethod: "session" as const,
    };

    async function callTool(name: string, args: Record<string, unknown>) {
      const server = createAuthoringMcpServer(testPrincipal);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      const response = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      }));
      return response.json() as Promise<any>;
    }

    // Lock workflow run to Revision A BEFORE Revision B is staged
    const coursesList = await listMcpCourseChoices();
    const kimiaCourse = coursesList.find((c) => c.code === "KI1101-REV")!;
    expect(kimiaCourse).toBeDefined();
    const chaptersList = await listMcpChapterChoices(kimiaCourse.key);
    const kimiaChapter = chaptersList.find((ch) => ch.code === "BAB-05") ?? chaptersList[0]!;
    expect(kimiaChapter).toBeDefined();

    const readABeforeB = await callTool("source.get_pack", {
      packId: sharedPackId,
      importId: stagedA.importId,
      documentId: docId,
    });
    expect(readABeforeB.result?.isError).toBeFalsy();
    const tokenA = readABeforeB.result.structuredContent.sourcePackToken as string;
    expect(tokenA).toBeDefined();

    const workflowARes = await callTool("workflow.start", {
      workflow: "idea_product",
      sourcePackToken: tokenA,
      courseKey: kimiaCourse.key,
      chapterKey: kimiaChapter.key,
    });
    expect(workflowARes.result?.isError).toBeFalsy();
    const runTokenA = workflowARes.result.structuredContent.runToken as string;
    expect(workflowARes.result.structuredContent.source.importId).toBe(stagedA.importId);
    expect(workflowARes.result.structuredContent.source.checksum).toBe(stagedA.checksum);

    // 1b. Now stage Revision B with the SAME packId and different content
    const stagedB = await stageSourcePack({
      bytes: packB.bytes,
      sourcePack: parsedB,
      requestedBy: "admin-kimia-rev",
      courseId: "mk-ki1101-rev",
      chapterId: "bab-ki1101-rev-05",
      scopeKey: "kimia-dasar-1",
    });
    expect(stagedB.created).toBe(true);
    expect(stagedB.importId).not.toBe(stagedA.importId);
    expect(stagedB.packId).toBe(sharedPackId);
    expect(stagedB.checksum).not.toBe(stagedA.checksum);

    // 2. Read A and B explicitly via importId; verify each returns its exact content and metadata
    const explicitReadA = await callTool("source.get_pack", {
      packId: sharedPackId,
      importId: stagedA.importId,
      documentId: docId,
    });
    expect(explicitReadA.result?.isError).toBeFalsy();
    const contentA = explicitReadA.result.structuredContent;
    expect(contentA.importId).toBe(stagedA.importId);
    expect(contentA.packId).toBe(sharedPackId);
    expect(contentA.checksum).toBe(stagedA.checksum);
    expect(contentA.document.markdown).toBe(revisionAMarkdown);
    expect(contentA.document.markdown).toContain("c_{\\text{kal}}");
    expect(contentA.document.markdown).toContain("\\Delta H_1^\\circ");
    for (const correction of fiveKimiaCorrections) {
      expect(contentA.document.markdown).not.toContain(correction);
    }

    const explicitReadB = await callTool("source.get_pack", {
      packId: sharedPackId,
      importId: stagedB.importId,
      documentId: docId,
    });
    expect(explicitReadB.result?.isError).toBeFalsy();
    const contentB = explicitReadB.result.structuredContent;
    expect(contentB.importId).toBe(stagedB.importId);
    expect(contentB.packId).toBe(sharedPackId);
    expect(contentB.checksum).toBe(stagedB.checksum);
    expect(contentB.document.markdown).toBe(revisionBMarkdown);
    const tokenB = contentB.sourcePackToken as string;
    expect(tokenB).toBeDefined();
    // Verify all 5 Kimia Bab 5 corrections are present in the returned Markdown and old errors are gone
    for (const correction of fiveKimiaCorrections) {
      expect(contentB.document.markdown).toContain(correction);
    }
    expect(contentB.document.markdown).not.toContain("c_{\\text{kal}}");
    expect(contentB.document.markdown).not.toContain("^\\circ");

    // 3. Read without selector; must deterministically select Revision B (latest valid import)
    const defaultRead = await callTool("source.get_pack", {
      packId: sharedPackId,
      documentId: docId,
    });
    expect(defaultRead.result?.isError).toBeFalsy();
    const defaultContent = defaultRead.result.structuredContent;
    expect(defaultContent.importId).toBe(stagedB.importId);
    expect(defaultContent.checksum).toBe(stagedB.checksum);
    expect(defaultContent.document.markdown).toBe(revisionBMarkdown);
    for (const correction of fiveKimiaCorrections) {
      expect(defaultContent.document.markdown).toContain(correction);
    }

    // Also test equal-timestamp tie-breaking: set identical createdAt & updatedAt on A and B, and verify rowid DESC still selects B
    const { imporBundle } = await import("@/db/schema");
    const { inArray } = await import("drizzle-orm");
    const sameTime = new Date("2026-10-19T09:00:00.000Z");
    await db
      .update(imporBundle)
      .set({ createdAt: sameTime, updatedAt: sameTime })
      .where(inArray(imporBundle.id, [stagedA.importId, stagedB.importId]));

    const tieBreakRead = await callTool("source.get_pack", {
      packId: sharedPackId,
      documentId: docId,
    });
    expect(tieBreakRead.result?.isError).toBeFalsy();
    expect(tieBreakRead.result.structuredContent.importId).toBe(stagedB.importId);
    expect(tieBreakRead.result.structuredContent.checksum).toBe(stagedB.checksum);

    // 4. Compute SHA-256 of returned Markdown and match against documentHash / markdownSha256 of the selected import
    const computedHashA = digest(strToU8(contentA.document.markdown));
    expect(computedHashA).toBe(packA.markdownSha256);
    expect(contentA.documentHash).toBe(computedHashA);
    expect(contentA.markdownSha256).toBe(computedHashA);
    expect(contentA.document.markdownSha256).toBe(computedHashA);

    const computedHashB = digest(strToU8(defaultContent.document.markdown));
    expect(computedHashB).toBe(packB.markdownSha256);
    expect(defaultContent.documentHash).toBe(computedHashB);
    expect(defaultContent.markdownSha256).toBe(computedHashB);
    expect(defaultContent.document.markdownSha256).toBe(computedHashB);

    // Metadata-only read (without documentId) also returns matching importId, checksum, and document hash
    const metaReadB = await callTool("source.get_pack", {
      packId: sharedPackId,
    });
    expect(metaReadB.result?.isError).toBeFalsy();
    expect(metaReadB.result.structuredContent.importId).toBe(stagedB.importId);
    expect(metaReadB.result.structuredContent.checksum).toBe(stagedB.checksum);
    expect(metaReadB.result.structuredContent.documents[0].markdownSha256).toBe(computedHashB);

    // 5. Verify identity mismatch rejection & checksum conflict / case-insensitivity rules:
    // 5a. Passing importId from another packId must fail with AUTHORING_MCP_SOURCE_PACK_IMPORT_MISMATCH
    const mismatchRead = await callTool("source.get_pack", {
      packId: "source-pack-persistence-01",
      importId: stagedB.importId,
    });
    expect(mismatchRead.result?.isError).toBe(true);
    expect(mismatchRead.result?.structuredContent?.error).toContain("AUTHORING_MCP_SOURCE_PACK_IMPORT_MISMATCH");

    // 5b. Legacy sourcePackToken (without importId) pointing to Revision A, while checksum argument points to Revision B -> must reject conflict
    const legacyTokenAWithoutImportId = issueSourcePackToken({
      importId: null,
      checksum: stagedA.checksum,
      packId: sharedPackId,
      name: "Kimia Bab 5 Revisi A",
      summary: parsedA.summary,
      courseId: "mk-ki1101-rev",
      chapterId: "bab-ki1101-rev-05",
    });
    const conflictLegacyTokenVsChecksumB = await callTool("source.get_pack", {
      packId: sharedPackId,
      sourcePackToken: legacyTokenAWithoutImportId,
      checksum: stagedB.checksum,
      documentId: docId,
    });
    expect(conflictLegacyTokenVsChecksumB.result?.isError).toBe(true);
    expect(conflictLegacyTokenVsChecksumB.result?.structuredContent?.error).toContain(
      "AUTHORING_MCP_SOURCE_PACK_IMPORT_MISMATCH",
    );

    // 5c. New sourcePackToken pointing to Revision B, while legacy runToken binds checksum A without sourcePackImportId -> must reject conflict
    const legacyRunTokenAWithoutImportId = issueMcpRunToken({
      workflow: "idea_product",
      courseId: "mk-ki1101-rev",
      legacyCourseId: "legacy-ki1101-rev",
      courseCode: "KI1101-REV",
      courseTitle: "Kimia Dasar I",
      chapterId: "bab-ki1101-rev-05",
      legacyChapterId: null,
      chapterCode: "BAB-05",
      chapterTitle: "Energi dan Perubahannya",
      chapterOrder: 5,
      sourcePackImportId: null,
      sourcePackId: sharedPackId,
      sourcePackChecksum: stagedA.checksum,
      sourcePackName: "Kimia Bab 5 Revisi A",
      sourceDocumentCount: 1,
      sourceUnitCount: 6,
    });
    const conflictNewTokenBVsLegacyRunA = await callTool("source.get_pack", {
      packId: sharedPackId,
      sourcePackToken: tokenB,
      runToken: legacyRunTokenAWithoutImportId,
      documentId: docId,
    });
    expect(conflictNewTokenBVsLegacyRunA.result?.isError).toBe(true);
    expect(conflictNewTokenBVsLegacyRunA.result?.structuredContent?.error).toContain(
      "AUTHORING_MCP_SOURCE_PACK_IMPORT_MISMATCH",
    );

    // 5d. Uppercase and lowercase checksum arguments both select the exact same import
    const upperChecksumRead = await callTool("source.get_pack", {
      packId: sharedPackId,
      checksum: stagedB.checksum.toUpperCase(),
      documentId: docId,
    });
    const lowerChecksumRead = await callTool("source.get_pack", {
      packId: sharedPackId,
      checksum: stagedB.checksum.toLowerCase(),
      documentId: docId,
    });
    expect(upperChecksumRead.result?.isError).toBeFalsy();
    expect(lowerChecksumRead.result?.isError).toBeFalsy();
    expect(upperChecksumRead.result.structuredContent.importId).toBe(stagedB.importId);
    expect(lowerChecksumRead.result.structuredContent.importId).toBe(stagedB.importId);
    expect(upperChecksumRead.result.structuredContent.importId).toBe(
      lowerChecksumRead.result.structuredContent.importId,
    );
    expect(upperChecksumRead.result.structuredContent.checksum).toBe(stagedB.checksum.toLowerCase());
    expect(upperChecksumRead.result.structuredContent.documentHash).toBe(computedHashB);

    // 6. Verify workflow bound to Revision A continues using Revision A even after Revision B is staged
    const getRunARes = await callTool("workflow.get_run", {
      runToken: runTokenA,
    });
    expect(getRunARes.result?.isError).toBeFalsy();
    expect(getRunARes.result.structuredContent.source.importId).toBe(stagedA.importId);
    expect(getRunARes.result.structuredContent.source.checksum).toBe(stagedA.checksum);

    const readViaRunTokenA = await callTool("source.get_pack", {
      packId: sharedPackId,
      runToken: runTokenA,
      documentId: docId,
    });
    expect(readViaRunTokenA.result?.isError).toBeFalsy();
    expect(readViaRunTokenA.result.structuredContent.importId).toBe(stagedA.importId);
    expect(readViaRunTokenA.result.structuredContent.checksum).toBe(stagedA.checksum);
    expect(readViaRunTokenA.result.structuredContent.document.markdown).toBe(revisionAMarkdown);

    const readViaSourceTokenA = await callTool("source.get_pack", {
      packId: sharedPackId,
      sourcePackToken: tokenA,
      documentId: docId,
    });
    expect(readViaSourceTokenA.result?.isError).toBeFalsy();
    expect(readViaSourceTokenA.result.structuredContent.importId).toBe(stagedA.importId);
    expect(readViaSourceTokenA.result.structuredContent.checksum).toBe(stagedA.checksum);
    expect(readViaSourceTokenA.result.structuredContent.document.markdown).toBe(revisionAMarkdown);
  });
});
