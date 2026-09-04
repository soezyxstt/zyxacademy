import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { buildSourcePackKey } from "@/lib/storage/keys";
import { validateSourcePack } from "@/lib/authoring/source-pack";
import {
  stageSourcePack,
  listSourcePackImports,
  getSourcePackImport,
  readStoredSourcePackDocument,
} from "@/lib/bundle/source-staging";
import {
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
import { courses, mataKuliah, bab, user } from "@/db/schema";
import { eq } from "drizzle-orm";

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sampleSourcePack(packId = "source-pack-test-01"): { bytes: Uint8Array; originalSha256: string; markdownText: string } {
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
    generator: { provider: "google", model: "test", promptVersion: "stored-source.v1" },
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
    const [existingUser] = await db.select({ id: user.id }).from(user).limit(1);
    const actorId = existingUser?.id ?? "test-user-id";

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
});
