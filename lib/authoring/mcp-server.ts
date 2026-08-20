import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { ide } from "@/db/schema";
import { serializeDeterministically, validateIdeaBundleZip, type ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { previewIdeaBundle } from "@/lib/bundle/idea-preview";
import { stageIdeaBundle } from "@/lib/bundle/staging";
import { validateProductBundle } from "@/lib/bundle/product-validator";
import { previewProducts } from "@/lib/bundle/product-preview";
import { stageProductBundle } from "@/lib/bundle/product-staging";
import { evaluateIdeaBundleQuality } from "@/lib/authoring/quality/idea-bundle";
import { evaluateProductBundleQuality } from "@/lib/authoring/quality/product-bundle";
import { sha256Text } from "@/lib/bundle/validator";
import { createCanonicalQuestionBatch, QuestionAuthoringError, validateCanonicalQuestionBatch } from "@/lib/question-authoring";
import { normalizeQuestionBankDraft, parseQuestionBankDraftJson, type NormalizedQuestionBankDraft } from "@/lib/authoring/question-bank-draft";
import {
  AUTHORING_MCP_MAX_BUNDLE_BYTES,
  AUTHORING_MCP_MAX_ORIGINAL_BYTES,
  authoringWorkflowSchema,
  decodeMcpArtifact,
  ingestMcpSourcePack,
  listAuthoringWorkflows,
  listMcpChapterChoices,
  listMcpCourseChoices,
  publicMcpRun,
  readMcpRunToken,
  startAuthoringWorkflow,
  workflowContract,
} from "@/lib/authoring/mcp-workflows";
import { requireMcpScope, type McpPrincipal } from "@/lib/authoring/mcp-auth";

type ToolPayload = Record<string, unknown>;

function toolResult(payload: ToolPayload, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
    ...(isError ? { isError: true } : {}),
  };
}

async function safeTool(handler: () => Promise<ToolPayload> | ToolPayload) {
  try {
    return toolResult(await handler());
  } catch (error) {
    const message = error instanceof Error ? error.message : "AUTHORING_MCP_REQUEST_FAILED";
    const [code, ...details] = message.split(":");
    return toolResult({ ok: false, error: code, detail: details.join(":") || undefined }, true);
  }
}

function ideaStageItems(bundle: ValidatedIdeaBundle) {
  return [
    ...bundle.entities.sourceMaterials.map((entity) => ({ entityType: "source_material", entityId: entity.id, entityVersion: entity.version, entityHash: sha256Text(serializeDeterministically(entity)) })),
    ...bundle.entities.sourceChunks.map((entity) => ({ entityType: "source_chunk", entityId: entity.id, entityVersion: entity.sourceVersion, entityHash: sha256Text(serializeDeterministically(entity)) })),
    ...bundle.entities.ideas.map((entity) => ({ entityType: "idea", entityId: entity.id, entityVersion: entity.version, entityHash: sha256Text(serializeDeterministically(entity)) })),
    ...bundle.entities.provenance.map((entity) => ({ entityType: "provenance", entityId: entity.id, entityVersion: 1, entityHash: sha256Text(serializeDeterministically(entity)) })),
    ...bundle.entities.relations.map((entity) => ({ entityType: "relation", entityId: entity.id, entityVersion: entity.version, entityHash: sha256Text(serializeDeterministically(entity)) })),
  ];
}

function schemaVersionNumber(value: string): number {
  const match = value.match(/\.v(\d+)$/);
  return match ? Number(match[1]) : 2;
}

const sourceOriginalSchema = z.array(z.object({
  documentId: z.string().min(1),
  contentBase64: z.string().min(1).max(48 * 1024 * 1024),
}).strict()).max(64).optional();

function decodeSourceOriginals(originals: readonly { documentId: string; contentBase64: string }[] | undefined): ReadonlyMap<string, Uint8Array> | undefined {
  if (!originals) return undefined;
  const files = new Map<string, Uint8Array>();
  let totalBytes = 0;
  for (const original of originals) {
    if (files.has(original.documentId)) throw new Error(`SOURCE_PACK_ORIGINAL_DOCUMENT_DUPLICATE:${original.documentId}`);
    const bytes = decodeMcpArtifact(original.contentBase64, AUTHORING_MCP_MAX_ORIGINAL_BYTES);
    totalBytes += bytes.byteLength;
    if (totalBytes > 96 * 1024 * 1024) throw new Error("AUTHORING_MCP_ORIGINALS_LIMIT");
    files.set(original.documentId, bytes);
  }
  return files;
}

function scopeIssue(code: string, message: string, path: string) {
  return { code, message, path };
}

async function validateProductIdeaScope(run: ReturnType<typeof readMcpRunToken>, bundle: Extract<ReturnType<typeof validateProductBundle>, { success: true }>['data']) {
  const links = [...new Map(bundle.products.flatMap((product) => product.ideaLinks.map((link) => [link.id, link] as const))).values()];
  if (links.length === 0) return { valid: false, issues: [scopeIssue("PRODUCT_IDEA_LINK_MISSING", "Product Bundle must reference at least one Idea.", "entities/products.json")] };
  const rows = await db.select({ id: ide.id, courseId: ide.mataKuliahId, version: ide.version, semanticHash: ide.semanticHash, status: ide.status }).from(ide).where(inArray(ide.id, links.map((link) => link.id)));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const issues = [];
  for (const link of links) {
    const row = byId.get(link.id);
    if (!row || row.status !== "published") issues.push(scopeIssue("PRODUCT_BUNDLE_IDEA_NOT_PUBLISHED", `Idea ${link.id} must be published before Product Bundle staging.`, `entities/products.json:${link.id}`));
    else {
      if (row.courseId !== run.courseId) issues.push(scopeIssue("PRODUCT_BUNDLE_IDEA_COURSE_MISMATCH", `Idea ${link.id} belongs to another course.`, `entities/products.json:${link.id}`));
      if (row.version !== link.version || row.semanticHash !== link.semanticHash) issues.push(scopeIssue("PRODUCT_BUNDLE_IDEA_VERSION_MISMATCH", `Idea ${link.id} version or semantic hash is stale.`, `entities/products.json:${link.id}`));
    }
  }
  return { valid: issues.length === 0, issues };
}

function validateIdeaChapterScope(run: ReturnType<typeof readMcpRunToken>, bundle: ValidatedIdeaBundle) {
  const issues = [];
  for (const idea of bundle.entities.ideas) {
    if (idea.chapterId !== run.chapterId) issues.push(scopeIssue("AUTHORING_MCP_CHAPTER_SCOPE_MISMATCH", `Idea ${idea.id} does not belong to the locked chapter.`, `entities/ideas.json:${idea.id}`));
  }
  return { valid: issues.length === 0, issues };
}

function validateProductChapterScope(run: ReturnType<typeof readMcpRunToken>, bundle: Extract<ReturnType<typeof validateProductBundle>, { success: true }>['data']) {
  const issues = [];
  for (const product of bundle.products) {
    if (!product.chapterId) issues.push(scopeIssue("AUTHORING_MCP_CHAPTER_SCOPE_MISSING", `Product ${product.id} must declare the locked chapter.`, `entities/products.json:${product.id}`));
    else if (product.chapterId !== run.chapterId) issues.push(scopeIssue("AUTHORING_MCP_CHAPTER_SCOPE_MISMATCH", `Product ${product.id} does not belong to the locked chapter.`, `entities/products.json:${product.id}`));
  }
  return { valid: issues.length === 0, issues };
}

function questionIdForRun(runId: string, externalId: string): string {
  return `mcp-q-${sha256Text(`${runId}:${externalId}`).slice(0, 32)}`;
}

function canonicalBatchForRun(run: ReturnType<typeof readMcpRunToken>, draft: NormalizedQuestionBankDraft) {
  return {
    courseId: run.courseId,
    chapterId: run.chapterId,
    reviewStatus: "generated" as const,
    items: draft.items.map((item) => ({
      questionId: questionIdForRun(run.runId, item.externalId),
      question: item.question,
      ideaLinks: item.ideaLinks,
    })),
  };
}

function questionAuthoringIssue(error: unknown) {
  if (error instanceof QuestionAuthoringError) {
    return { code: error.code, message: error.message };
  }
  return { code: "QUESTION_BANK_DRAFT_VALIDATION_FAILED", message: error instanceof Error ? error.message : "Validasi soal gagal." };
}

async function validateQuestionBankDraft(runToken: string, draft: NormalizedQuestionBankDraft) {
  const run = readMcpRunToken(runToken);
  if (run.workflow !== "quiz_bank") return { ok: false, valid: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
  try {
    await validateCanonicalQuestionBatch(canonicalBatchForRun(run, draft));
    return {
      ok: true,
      valid: true,
      draftId: draft.draftId,
      schemaVersion: draft.schemaVersion,
      questionCount: draft.items.length,
      linkedQuestionCount: draft.items.filter((item) => item.ideaLinks.length > 0).length,
      issues: [],
      next: "admin_review",
    };
  } catch (error) {
    return {
      ok: false,
      valid: false,
      draftId: draft.draftId,
      schemaVersion: draft.schemaVersion,
      questionCount: draft.items.length,
      issues: [questionAuthoringIssue(error)],
      next: "agent_revision",
    };
  }
}

async function stageQuestionBankDraft(principal: McpPrincipal, runToken: string, draft: NormalizedQuestionBankDraft) {
  requireMcpScope(principal, "authoring:stage");
  const run = readMcpRunToken(runToken);
  if (run.workflow !== "quiz_bank") return { ok: false, valid: false, staged: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
  try {
    const results = await createCanonicalQuestionBatch({
      ...canonicalBatchForRun(run, draft),
      creatorId: principal.actorId,
      createOnly: true,
    });
    return {
      ok: true,
      valid: true,
      staged: true,
      draftId: draft.draftId,
      schemaVersion: draft.schemaVersion,
      questionCount: results.length,
      linkedQuestionCount: draft.items.filter((item) => item.ideaLinks.length > 0).length,
      createdCount: results.filter((result) => result.created).length,
      existingCount: results.filter((result) => result.unchanged).length,
      questionIds: results.map((result) => result.id),
      issues: [],
      next: "admin_review",
    };
  } catch (error) {
    return {
      ok: false,
      valid: false,
      staged: false,
      draftId: draft.draftId,
      schemaVersion: draft.schemaVersion,
      questionCount: draft.items.length,
      issues: [questionAuthoringIssue(error)],
      next: "agent_revision",
    };
  }
}

function registerWorkflowTools(server: McpServer, principal: McpPrincipal): void {
  (server as any).registerTool("workflow.list", {
    title: "List authoring workflows",
    description: "Mengembalikan pilihan workflow authoring. Pilihan sengaja tidak menyediakan opsi gabungan.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => {
    requireMcpScope(principal, "authoring:read");
    return toolResult({ version: "authoring-mcp.v1", workflows: listAuthoringWorkflows() });
  });

  (server as any).registerTool("catalog.list_courses", {
    title: "List courses",
    description: "Mengembalikan pilihan mata kuliah dengan key sementara yang tidak mengekspos ID internal.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    return { ok: true, choices: await listMcpCourseChoices() };
  }));

  (server as any).registerTool("catalog.list_chapters", {
    title: "List chapters",
    description: "Mengembalikan bab aktif untuk mata kuliah yang dipilih.",
    inputSchema: { courseKey: z.string().min(1) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ courseKey }: { courseKey: string }) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    return { ok: true, choices: await listMcpChapterChoices(courseKey) };
  }));

  (server as any).registerTool("source.ingest", {
    title: "Ingest Source Pack",
    description: "Menerima Source Pack sebagai base64 melalui MCP, menjalankan compatibility checking, dan mengembalikan token sumber tervalidasi.",
    inputSchema: {
      filename: z.string().min(1).max(255),
      contentBase64: z.string().min(1).max(96 * 1024 * 1024),
      originals: sourceOriginalSchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ filename, contentBase64, originals }: any) => safeTool(() => {
    requireMcpScope(principal, "authoring:read");
    return ingestMcpSourcePack(filename, contentBase64, decodeSourceOriginals(originals));
  }));

  (server as any).registerTool("workflow.start", {
    title: "Start authoring workflow",
    description: "Mengunci Source Pack, mata kuliah, bab, dan salah satu dari dua workflow authoring.",
    inputSchema: {
      workflow: authoringWorkflowSchema,
      sourcePackToken: z.string().min(1),
      courseKey: z.string().min(1),
      chapterKey: z.string().min(1),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ workflow, sourcePackToken, courseKey, chapterKey }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    return {
      ok: true,
      ...(await startAuthoringWorkflow({ workflow, sourcePackToken, courseKey, chapterKey })),
    };
  }));

  (server as any).registerTool("workflow.get_run", {
    title: "Get authoring run",
    description: "Mengembalikan scope yang sudah dikunci tanpa membuka ID internal kepada agent.",
    inputSchema: { runToken: z.string().min(1) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken }: { runToken: string }) => safeTool(() => {
    requireMcpScope(principal, "authoring:read");
    return { ok: true, ...publicMcpRun(runToken) };
  }));

  (server as any).registerTool("workflow.get_contract", {
    title: "Get workflow contract",
    description: "Mengembalikan aturan output dan compatibility gate untuk workflow yang dipilih.",
    inputSchema: { runToken: z.string().min(1) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken }: { runToken: string }) => safeTool(() => {
    requireMcpScope(principal, "authoring:read");
    return { ok: true, ...workflowContract(runToken) };
  }));
}

function registerValidationTools(server: McpServer, principal: McpPrincipal): void {
  (server as any).registerTool("authoring.validate_idea_bundle", {
    title: "Validate Idea Bundle",
    description: "Memeriksa ZIP Idea Bundle terhadap kontrak, checksum, provenance, dan scope run.",
    inputSchema: {
      runToken: z.string().min(1),
      filename: z.string().min(1).max(255),
      bundleBase64: z.string().min(1).max(48 * 1024 * 1024),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, filename, bundleBase64 }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    if (run.workflow !== "idea_product") return { ok: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
    const validation = validateIdeaBundleZip(decodeMcpArtifact(bundleBase64, AUTHORING_MCP_MAX_BUNDLE_BYTES));
    if (!validation.success) return { ok: false, valid: false, filename, issues: validation.issues };
    if (validation.data.manifest.courseId !== run.courseId) {
      return { ok: false, valid: false, filename, issues: [{ code: "AUTHORING_MCP_COURSE_SCOPE_MISMATCH", message: "Idea Bundle course does not match the locked run scope", path: "manifest.json.courseId" }] };
    }
    const chapterScope = validateIdeaChapterScope(run, validation.data);
    const quality = evaluateIdeaBundleQuality(validation.data);
    const scopeIssues = chapterScope.issues;
    if (!chapterScope.valid || !quality.valid) return { ok: false, valid: false, filename, issues: [...scopeIssues, ...quality.issues], quality };
    return {
      ok: true,
      valid: true,
      filename,
      bundleId: validation.data.manifest.bundleId,
      checksum: validation.data.manifest.bundleChecksum,
      preview: previewIdeaBundle(validation.data),
      quality,
      next: "admin_review",
    };
  }));

  (server as any).registerTool("authoring.submit_idea_bundle", {
    title: "Submit Idea Bundle for review",
    description: "Memvalidasi lalu menaruh Idea Bundle sebagai import tervalidasi untuk review admin. Tool ini tidak dapat mempublikasikan bundle.",
    inputSchema: {
      runToken: z.string().min(1),
      filename: z.string().min(1).max(255),
      bundleBase64: z.string().min(1).max(48 * 1024 * 1024),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, filename, bundleBase64 }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:stage");
    const run = readMcpRunToken(runToken);
    if (run.workflow !== "idea_product") return { ok: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
    const bytes = decodeMcpArtifact(bundleBase64, AUTHORING_MCP_MAX_BUNDLE_BYTES);
    const validation = validateIdeaBundleZip(bytes);
    if (!validation.success) return { ok: false, valid: false, staged: false, filename, issues: validation.issues };
    if (validation.data.manifest.courseId !== run.courseId) return { ok: false, valid: false, staged: false, filename, issues: [{ code: "AUTHORING_MCP_COURSE_SCOPE_MISMATCH", message: "Idea Bundle course does not match the locked run scope", path: "manifest.json.courseId" }] };
    const chapterScope = validateIdeaChapterScope(run, validation.data);
    const quality = evaluateIdeaBundleQuality(validation.data);
    if (!chapterScope.valid || !quality.valid) return { ok: false, valid: false, staged: false, filename, issues: [...chapterScope.issues, ...quality.issues], quality };
    const result = await stageIdeaBundle({
      runId: run.runId,
      bundleId: validation.data.manifest.bundleId,
      courseId: run.courseId,
      schemaVersion: schemaVersionNumber(validation.data.manifest.schemaVersion),
      checksum: validation.data.manifest.bundleChecksum,
      bytes,
      requestedBy: principal.actorId,
      items: ideaStageItems(validation.data),
      validationReport: {
        valid: true,
        reasonCodes: [],
        fileCount: validation.data.files.size,
        entityCount: ideaStageItems(validation.data).length,
        sourceCount: validation.data.entities.sourceMaterials.length,
        relationCount: validation.data.entities.relations.length,
        warnings: [],
        quality: quality as unknown as Record<string, unknown>,
      },
      filename,
    });
    return { ok: true, valid: true, staged: true, result, quality, next: "admin_review" };
  }));

  (server as any).registerTool("authoring.validate_product_bundle", {
    title: "Validate Product Bundle",
    description: "Memeriksa ZIP Product Bundle terhadap kontrak, checksum, dependency, provenance, dan scope run.",
    inputSchema: {
      runToken: z.string().min(1),
      filename: z.string().min(1).max(255),
      bundleBase64: z.string().min(1).max(48 * 1024 * 1024),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, filename, bundleBase64 }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    if (run.workflow !== "idea_product") return { ok: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
    const validation = validateProductBundle(decodeMcpArtifact(bundleBase64, AUTHORING_MCP_MAX_BUNDLE_BYTES));
    if (!validation.success) return { ok: false, valid: false, filename, issues: validation.issues };
    if (validation.data.manifest.courseId !== run.courseId) {
      return { ok: false, valid: false, filename, issues: [{ code: "AUTHORING_MCP_COURSE_SCOPE_MISMATCH", message: "Product Bundle course does not match the locked run scope", path: "manifest.json.courseId" }] };
    }
    const chapterScope = validateProductChapterScope(run, validation.data);
    const ideaScope = await validateProductIdeaScope(run, validation.data);
    const quality = evaluateProductBundleQuality(validation.data);
    const dependencyIssues = validation.data.publicationBlocked ? [{ code: "PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW", message: "Product Bundle has dependencies that are not up to date.", path: "entities/dependencies.json" }] : [];
    const blockingIssues = [...chapterScope.issues, ...ideaScope.issues, ...dependencyIssues, ...quality.issues];
    if (blockingIssues.length > 0) return { ok: false, valid: false, filename, issues: blockingIssues, quality, publicationBlocked: validation.data.publicationBlocked };
    return {
      ok: true,
      valid: true,
      filename,
      bundleId: validation.data.manifest.bundleId,
      checksum: validation.data.manifest.bundleChecksum,
      publicationBlocked: validation.data.publicationBlocked,
      issues: validation.data.issues,
      quality,
      previews: previewProducts(validation.data.products),
      next: "admin_review",
    };
  }));

  (server as any).registerTool("authoring.submit_product_bundle", {
    title: "Submit Product Bundle for review",
    description: "Memvalidasi lalu menaruh Product Bundle sebagai draft untuk review admin. Tool ini tidak dapat mempublikasikan bundle.",
    inputSchema: {
      runToken: z.string().min(1),
      filename: z.string().min(1).max(255),
      bundleBase64: z.string().min(1).max(48 * 1024 * 1024),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, filename, bundleBase64 }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:stage");
    const run = readMcpRunToken(runToken);
    if (run.workflow !== "idea_product") return { ok: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
    const bytes = decodeMcpArtifact(bundleBase64, AUTHORING_MCP_MAX_BUNDLE_BYTES);
    const validation = validateProductBundle(bytes);
    if (!validation.success) return { ok: false, valid: false, staged: false, filename, issues: validation.issues };
    if (validation.data.manifest.courseId !== run.courseId) return { ok: false, valid: false, staged: false, filename, issues: [{ code: "AUTHORING_MCP_COURSE_SCOPE_MISMATCH", message: "Product Bundle course does not match the locked run scope", path: "manifest.json.courseId" }] };
    const chapterScope = validateProductChapterScope(run, validation.data);
    const ideaScope = await validateProductIdeaScope(run, validation.data);
    const quality = evaluateProductBundleQuality(validation.data);
    const dependencyIssues = validation.data.publicationBlocked ? [{ code: "PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW", message: "Product Bundle has dependencies that are not up to date.", path: "entities/dependencies.json" }] : [];
    const blockingIssues = [...chapterScope.issues, ...ideaScope.issues, ...dependencyIssues, ...quality.issues];
    if (blockingIssues.length > 0) return { ok: false, valid: false, staged: false, filename, issues: blockingIssues, quality, publicationBlocked: validation.data.publicationBlocked };
    const result = await stageProductBundle({
      runId: run.runId,
      bundleId: validation.data.manifest.bundleId,
      courseId: run.courseId,
      checksum: validation.data.manifest.bundleChecksum,
      bytes,
      requestedBy: principal.actorId,
      bundle: validation.data,
      qualityReport: quality as unknown as Record<string, unknown>,
      filename,
    });
    return { ok: true, valid: true, staged: true, result, quality, next: "admin_review" };
  }));

  (server as any).registerTool("assessment.list_ideas", {
    title: "List published Ideas for question authoring",
    description: "Mengembalikan Idea published dalam mata kuliah dan bab yang dikunci oleh run bank soal.",
    inputSchema: { runToken: z.string().min(1) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken }: { runToken: string }) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    if (run.workflow !== "quiz_bank") return { ok: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
    const ideas = await db
      .select({
        ideaId: ide.id,
        code: ide.code,
        statement: ide.canonicalStatement,
        explanation: ide.conciseExplanation,
        latex: ide.latex,
        knowledgeKind: ide.knowledgeKind,
        instructionalRole: ide.instructionalRole,
        version: ide.version,
        semanticHash: ide.semanticHash,
      })
      .from(ide)
      .where(and(eq(ide.mataKuliahId, run.courseId), eq(ide.babId, run.chapterId), eq(ide.status, "published")))
      .orderBy(ide.code);
    return {
      ok: true,
      scope: { course: run.courseLabel, chapter: run.chapterLabel },
      ideaCount: ideas.length,
      ideas,
      linking: { required: false, weightRule: "Jika satu atau lebih Idea dipilih, bobot positif harus berjumlah 1." },
    };
  }));

  (server as any).registerTool("assessment.validate_quiz_draft", {
    title: "Validate question bank draft",
    description: "Memeriksa draft soal terstruktur, relasi Idea opsional, dan scope sebelum masuk ke review bank soal.",
    inputSchema: {
      runToken: z.string().min(1),
      draftJson: z.string().min(1).max(8 * 1024 * 1024),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, draftJson }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const parsed = parseQuestionBankDraftJson(draftJson);
    if (!parsed.success) return { ok: false, valid: false, issues: parsed.issues, next: "agent_revision" };
    return validateQuestionBankDraft(runToken, normalizeQuestionBankDraft(parsed.data));
  }));

  (server as any).registerTool("assessment.submit_quiz_draft", {
    title: "Submit question bank draft for review",
    description: "Memvalidasi lalu menyimpan soal canonical dan projection kompatibilitas sebagai generated. Tool ini tidak dapat mempublikasikan soal.",
    inputSchema: {
      runToken: z.string().min(1),
      draftJson: z.string().min(1).max(8 * 1024 * 1024),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, draftJson }: any) => safeTool(async () => {
    const parsed = parseQuestionBankDraftJson(draftJson);
    if (!parsed.success) return { ok: false, valid: false, staged: false, issues: parsed.issues, next: "agent_revision" };
    return stageQuestionBankDraft(principal, runToken, normalizeQuestionBankDraft(parsed.data));
  }));
}

export function createAuthoringMcpServer(principal: McpPrincipal): McpServer {
  const server = new McpServer({ name: "zyx-authoring", version: "1.0.0" }, { capabilities: { tools: {} } });
  registerWorkflowTools(server, principal);
  registerValidationTools(server, principal);
  return server;
}
