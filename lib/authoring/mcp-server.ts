import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { asalIde, ide, relasiIde } from "@/db/schema";
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
  computeIdeaFacets,
  filterIdeaRecords,
  normalizeIdeaDifficultyLevel,
  normalizeIdeaInstructionalRole,
  normalizeIdeaKnowledgeKind,
  paginateIdeaRecords,
  IDEA_DIFFICULTY_LEVELS,
  IDEA_INSTRUCTIONAL_ROLES,
  IDEA_KNOWLEDGE_KINDS,
} from "@/lib/authoring/question-catalog";
import { reviewQuestionBankDraft } from "@/lib/authoring/question-draft-review";
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
    const [rawCode, ...details] = message.split(":");
    const code = rawCode.slice(0, 120);
    const detail = details.join(":").slice(0, 600);
    return toolResult({ ok: false, error: code, detail: detail || undefined }, true);
  }
}

function chunkValues<T>(values: readonly T[], size = 200): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
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
  const rows = [];
  for (const chunk of chunkValues(links.map((link) => link.id))) {
    rows.push(...await db.select({ id: ide.id, courseId: ide.mataKuliahId, version: ide.version, semanticHash: ide.semanticHash, status: ide.status }).from(ide).where(inArray(ide.id, chunk)));
  }
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

async function loadQuizScopeIdeaRows(courseId: string, chapterId: string, referencedIds: readonly string[]) {
  const catalogRows = await db
    .select({
      id: ide.id,
      code: ide.code,
      courseId: ide.mataKuliahId,
      chapterId: ide.babId,
      status: ide.status,
      statement: ide.canonicalStatement,
      explanation: ide.conciseExplanation,
      latex: ide.latex,
      knowledgeKind: ide.knowledgeKind,
      instructionalRole: ide.instructionalRole,
      difficultyMetadata: ide.difficultyMetadata,
      version: ide.version,
      semanticHash: ide.semanticHash,
    })
    .from(ide)
    .where(and(eq(ide.mataKuliahId, courseId), eq(ide.babId, chapterId), eq(ide.status, "published")))
    .orderBy(ide.code);

  const referencedRows = [];
  const knownIds = new Set(catalogRows.map((row) => row.id));
  const extraIds = [...new Set(referencedIds)].filter((id) => !knownIds.has(id));
  for (const chunk of chunkValues(extraIds)) {
    referencedRows.push(...await db
      .select({
        id: ide.id,
        code: ide.code,
        courseId: ide.mataKuliahId,
        chapterId: ide.babId,
        status: ide.status,
        statement: ide.canonicalStatement,
        explanation: ide.conciseExplanation,
        latex: ide.latex,
        knowledgeKind: ide.knowledgeKind,
        instructionalRole: ide.instructionalRole,
        difficultyMetadata: ide.difficultyMetadata,
        version: ide.version,
        semanticHash: ide.semanticHash,
      })
      .from(ide)
      .where(inArray(ide.id, chunk)));
  }
  return { catalogRows, referencedRows };
}

type QuizIdeaRow = Awaited<ReturnType<typeof loadQuizScopeIdeaRows>>["catalogRows"][number];

function reviewRowsForScope(rows: readonly QuizIdeaRow[]) {
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    courseId: row.courseId,
    chapterId: row.chapterId,
    status: row.status,
  }));
}

async function reviewDraftAgainstScope(run: ReturnType<typeof readMcpRunToken>, draft: NormalizedQuestionBankDraft) {
  const referencedIds = draft.items.flatMap((item) => item.ideaLinks.map((link) => link.ideaId));
  const { catalogRows, referencedRows } = await loadQuizScopeIdeaRows(run.courseId, run.chapterId, referencedIds);
  const review = reviewQuestionBankDraft({
    draft,
    scopeCourseId: run.courseId,
    scopeChapterId: run.chapterId,
    ideas: reviewRowsForScope([...catalogRows, ...referencedRows]),
  });
  return { review, catalogCount: catalogRows.length };
}

async function validateQuestionBankDraft(runToken: string, draft: NormalizedQuestionBankDraft) {
  const run = readMcpRunToken(runToken);
  if (run.workflow !== "quiz_bank") return { ok: false, valid: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
  const { review } = await reviewDraftAgainstScope(run, draft);
  if (!review.valid) {
    return {
      ok: false,
      valid: false,
      draftId: draft.draftId,
      schemaVersion: draft.schemaVersion,
      questionCount: review.stats.questionCount,
      linkedQuestionCount: review.stats.linkedQuestionCount,
      issues: review.issues.filter((issue) => issue.severity === "blocking"),
      warnings: review.issues.filter((issue) => issue.severity === "warning"),
      issuesTruncated: review.issuesTruncated,
      stats: review.stats,
      next: "agent_revision",
    };
  }
  try {
    await validateCanonicalQuestionBatch(canonicalBatchForRun(run, draft));
  } catch (error) {
    return {
      ok: false,
      valid: false,
      draftId: draft.draftId,
      schemaVersion: draft.schemaVersion,
      questionCount: review.stats.questionCount,
      linkedQuestionCount: review.stats.linkedQuestionCount,
      issues: [{ ...questionAuthoringIssue(error), severity: "blocking" as const }],
      warnings: review.issues.filter((issue) => issue.severity === "warning"),
      issuesTruncated: false,
      stats: review.stats,
      next: "agent_revision",
    };
  }
  return {
    ok: true,
    valid: true,
    draftId: draft.draftId,
    schemaVersion: draft.schemaVersion,
    questionCount: review.stats.questionCount,
    linkedQuestionCount: review.stats.linkedQuestionCount,
    issues: [],
    warnings: review.issues.filter((issue) => issue.severity === "warning"),
    issuesTruncated: false,
    stats: review.stats,
    next: "admin_review",
  };
}

async function stageQuestionBankDraft(principal: McpPrincipal, runToken: string, draft: NormalizedQuestionBankDraft) {
  requireMcpScope(principal, "authoring:stage");
  const run = readMcpRunToken(runToken);
  if (run.workflow !== "quiz_bank") return { ok: false, valid: false, staged: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
  const { review } = await reviewDraftAgainstScope(run, draft);
  if (!review.valid) {
    return {
      ok: false,
      valid: false,
      staged: false,
      draftId: draft.draftId,
      schemaVersion: draft.schemaVersion,
      questionCount: review.stats.questionCount,
      linkedQuestionCount: review.stats.linkedQuestionCount,
      issues: review.issues.filter((issue) => issue.severity === "blocking"),
      warnings: review.issues.filter((issue) => issue.severity === "warning"),
      issuesTruncated: review.issuesTruncated,
      stats: review.stats,
      next: "agent_revision",
    };
  }
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
      linkedQuestionCount: review.stats.linkedQuestionCount,
      createdCount: results.filter((result) => result.created).length,
      existingCount: results.filter((result) => result.unchanged).length,
      questionIds: results.map((result) => result.id),
      warnings: review.issues.filter((issue) => issue.severity === "warning"),
      stats: review.stats,
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
      questionCount: review.stats.questionCount,
      linkedQuestionCount: review.stats.linkedQuestionCount,
      issues: [{ ...questionAuthoringIssue(error), severity: "blocking" as const }],
      warnings: review.issues.filter((issue) => issue.severity === "warning"),
      issuesTruncated: false,
      stats: review.stats,
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
    description: "Mengunci mata kuliah, bab, dan workflow authoring. Source Pack wajib untuk idea_product dan opsional untuk quiz_bank.",
    inputSchema: {
      workflow: authoringWorkflowSchema,
      sourcePackToken: z.string().min(1).optional(),
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
    description: "Mengembalikan katalog Idea published pada mata kuliah dan bab yang dikunci, dengan pencarian teks, filter knowledge kind, instructional role, difficulty level, facets distribusi, dan paging.",
    inputSchema: {
      runToken: z.string().min(1),
      query: z.string().trim().max(200).optional(),
      knowledgeKinds: z.array(z.enum(IDEA_KNOWLEDGE_KINDS)).max(IDEA_KNOWLEDGE_KINDS.length).optional(),
      instructionalRoles: z.array(z.enum(IDEA_INSTRUCTIONAL_ROLES)).max(IDEA_INSTRUCTIONAL_ROLES.length).optional(),
      difficultyLevels: z.array(z.enum(IDEA_DIFFICULTY_LEVELS)).max(IDEA_DIFFICULTY_LEVELS.length).optional(),
      limit: z.number().int().min(1).max(200).default(100),
      offset: z.number().int().min(0).default(0),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, query, knowledgeKinds, instructionalRoles, difficultyLevels, limit, offset }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    if (run.workflow !== "quiz_bank") return { ok: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
    const rows = await db
      .select({
        id: ide.id,
        code: ide.code,
        statement: ide.canonicalStatement,
        explanation: ide.conciseExplanation,
        latex: ide.latex,
        knowledgeKind: ide.knowledgeKind,
        instructionalRole: ide.instructionalRole,
        difficultyMetadata: ide.difficultyMetadata,
        version: ide.version,
        semanticHash: ide.semanticHash,
      })
      .from(ide)
      .where(and(eq(ide.mataKuliahId, run.courseId), eq(ide.babId, run.chapterId), eq(ide.status, "published")))
      .orderBy(ide.code);
    const records = rows.map((row) => ({
      id: row.id,
      code: row.code,
      statement: row.statement,
      explanation: row.explanation,
      latex: row.latex,
      knowledgeKind: normalizeIdeaKnowledgeKind(row.knowledgeKind),
      instructionalRole: normalizeIdeaInstructionalRole(row.instructionalRole),
      difficultyLevel: normalizeIdeaDifficultyLevel((row.difficultyMetadata as Record<string, unknown> | null)?.level),
      version: row.version,
      semanticHash: row.semanticHash,
    }));
    const filtered = filterIdeaRecords(records, { query, knowledgeKinds, instructionalRoles, difficultyLevels });
    const page = paginateIdeaRecords(filtered, limit, offset);
    return {
      ok: true,
      scope: { course: run.courseLabel, chapter: run.chapterLabel },
      totalIdeaCount: records.length,
      ideaCount: page.total,
      ideas: page.items,
      facets: computeIdeaFacets(filtered),
      paging: { limit: page.limit, offset: page.offset, nextOffset: page.nextOffset },
      filters: {
        query: query ?? null,
        knowledgeKinds: knowledgeKinds ?? [],
        instructionalRoles: instructionalRoles ?? [],
        difficultyLevels: difficultyLevels ?? [],
      },
      linking: { required: false, weightRule: "Jika satu atau lebih Idea dipilih, bobot positif harus berjumlah 1." },
    };
  }));

  (server as any).registerTool("assessment.get_idea", {
    title: "Get published Idea detail",
    description: "Mengembalikan detail satu Idea published dalam scope run, termasuk relations aktif dan ringkasan provenance sumber.",
    inputSchema: {
      runToken: z.string().min(1),
      ideaId: z.string().trim().min(1),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, ideaId }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    if (run.workflow !== "quiz_bank") return { ok: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
    const [idea] = await db
      .select({
        id: ide.id,
        code: ide.code,
        statement: ide.canonicalStatement,
        explanation: ide.conciseExplanation,
        latex: ide.latex,
        knowledgeKind: ide.knowledgeKind,
        instructionalRole: ide.instructionalRole,
        difficultyMetadata: ide.difficultyMetadata,
        version: ide.version,
        status: ide.status,
        semanticHash: ide.semanticHash,
        courseId: ide.mataKuliahId,
        chapterId: ide.babId,
      })
      .from(ide)
      .where(eq(ide.id, ideaId))
      .limit(1);
    if (!idea || idea.courseId !== run.courseId || idea.chapterId !== run.chapterId || idea.status !== "published") {
      throw new Error("AUTHORING_MCP_IDEA_NOT_IN_SCOPE");
    }
    const outgoingRows = await db
      .select({
        relationType: relasiIde.relationType,
        counterpartId: relasiIde.targetIdeaId,
        counterpartCode: ide.code,
        explanation: relasiIde.explanation,
      })
      .from(relasiIde)
      .innerJoin(ide, eq(ide.id, relasiIde.targetIdeaId))
      .where(and(eq(relasiIde.status, "active"), eq(relasiIde.sourceIdeaId, ideaId), eq(ide.status, "published")));
    const incomingRows = await db
      .select({
        relationType: relasiIde.relationType,
        counterpartId: relasiIde.sourceIdeaId,
        counterpartCode: ide.code,
        explanation: relasiIde.explanation,
      })
      .from(relasiIde)
      .innerJoin(ide, eq(ide.id, relasiIde.sourceIdeaId))
      .where(and(eq(relasiIde.status, "active"), eq(relasiIde.targetIdeaId, ideaId), eq(ide.status, "published")));
    const provenanceCounts: Array<{ role: string; count: number }> = await db
      .select({ role: asalIde.provenanceRole, count: sql<number>`count(*)` })
      .from(asalIde)
      .where(eq(asalIde.ideId, ideaId))
      .groupBy(asalIde.provenanceRole);
    return {
      ok: true,
      scope: { course: run.courseLabel, chapter: run.chapterLabel },
      idea: {
        id: idea.id,
        code: idea.code,
        statement: idea.statement,
        explanation: idea.explanation,
        latex: idea.latex,
        knowledgeKind: normalizeIdeaKnowledgeKind(idea.knowledgeKind),
        instructionalRole: normalizeIdeaInstructionalRole(idea.instructionalRole),
        difficultyLevel: normalizeIdeaDifficultyLevel((idea.difficultyMetadata as Record<string, unknown> | null)?.level),
        version: idea.version,
        semanticHash: idea.semanticHash,
      },
      relations: [
        ...outgoingRows.map((row) => ({ relationType: row.relationType, direction: "outgoing", counterpart: { id: row.counterpartId, code: row.counterpartCode }, explanation: row.explanation })),
        ...incomingRows.map((row) => ({ relationType: row.relationType, direction: "incoming", counterpart: { id: row.counterpartId, code: row.counterpartCode }, explanation: row.explanation })),
      ],
      provenance: { counts: provenanceCounts.map((row) => ({ role: row.role, count: Number(row.count) })) },
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
