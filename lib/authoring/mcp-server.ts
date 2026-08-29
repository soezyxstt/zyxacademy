import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { asalIde, artikel, artikelIde, diktatIde, diktatMateri, flashcard, flashcardIde, ide, mataKuliah, potonganSumber, relasiIde, setFlashcard, soal, soalIde, sumberMateri } from "@/db/schema";
import { serializeDeterministically, validateIdeaBundleZip, type ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { previewIdeaBundle } from "@/lib/bundle/idea-preview";
import { getIdeaBundleImport, listIdeaBundleImports, reviewIdeaBundle, stageIdeaBundle } from "@/lib/bundle/staging";
import { validateProductBundle } from "@/lib/bundle/product-validator";
import { previewProducts } from "@/lib/bundle/product-preview";
import { discardProductBundleDraft, getProductBundleImport, listProductBundleImports, reviewProductBundle, stageProductBundle } from "@/lib/bundle/product-staging";
import { withdrawProductBundle } from "@/lib/bundle/product-publication";
import { evaluateIdeaBundleQuality } from "@/lib/authoring/quality/idea-bundle";
import { evaluateProductBundleQuality } from "@/lib/authoring/quality/product-bundle";
import { sha256Text } from "@/lib/bundle/validator";
import { createCanonicalQuestionBatch, QuestionAuthoringError, updateCanonicalQuestion, validateCanonicalQuestionBatch } from "@/lib/question-authoring";
import { questionAuthoringQuestionSchema, questionIdeaLinkSchema } from "@/lib/question-authoring-contract";
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
import {
  listStoredSourceFiles,
  loadStoredOriginals,
  mergeSourceOriginals,
  readStoredSourceFile,
} from "@/lib/authoring/mcp-source-files";

type ToolPayload = Record<string, unknown>;

type ExtraToolContent =
  | { type: "image"; data: string; mimeType: "image/png" }
  | { type: "resource"; resource: { uri: string; mimeType: "application/pdf"; blob: string } };

function toolResult(payload: ToolPayload, isError = false, extraContent: ExtraToolContent[] = []) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }, ...extraContent],
    structuredContent: payload,
    ...(isError ? { isError: true } : {}),
  };
}

async function safeTool(handler: () => Promise<ToolPayload> | ToolPayload) {
  try {
    return toolResult(await handler());
  } catch (error) {
    return toolError(error);
  }
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : "AUTHORING_MCP_REQUEST_FAILED";
  const [rawCode, ...details] = message.split(":");
  const code = rawCode.slice(0, 120);
  const detail = details.join(":").slice(0, 600);
  return toolResult({ ok: false, error: code, detail: detail || undefined }, true);
}

export function formatSourceFileReadResult(result: Awaited<ReturnType<typeof readStoredSourceFile>>) {
  if (result.mode === "blob") {
    const payload = {
      ok: true,
      mode: result.mode,
      title: result.title,
      checksum: result.checksum,
      size: result.size,
      mimeType: "application/pdf",
    };
    return toolResult(payload, false, [{
      type: "resource",
      resource: {
        uri: `zyx-authoring://stored-pdf/${result.checksum}`,
        mimeType: "application/pdf",
        blob: Buffer.from(result.bytes).toString("base64"),
      },
    }]);
  }
  const payload = {
    ok: true,
    mode: result.mode,
    title: result.title,
    checksum: result.checksum,
    size: result.size,
    totalPages: result.totalPages,
    pages: result.pages.map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
      width: page.width,
      height: page.height,
    })),
  };
  return toolResult(payload, false, result.pages.map((page) => ({
    type: "image" as const,
    data: Buffer.from(page.png).toString("base64"),
    mimeType: "image/png" as const,
  })));
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

const storedSourceOriginalSchema = z.array(z.object({
  documentId: z.string().min(1),
  fileKey: z.string().min(1),
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

async function resolveSourceOriginals(
  directInput: readonly { documentId: string; contentBase64: string }[] | undefined,
  storedInput: readonly { documentId: string; fileKey: string }[] | undefined,
) {
  const direct = new Map(decodeSourceOriginals(directInput) ?? []);
  const stored = storedInput?.length
    ? await loadStoredOriginals(storedInput)
    : { originals: new Map<string, Uint8Array>(), boundScope: null, totalBytes: 0 };
  return mergeSourceOriginals(direct, stored);
}

async function assertImportRunScope(storedCourseId: string | null, runCourseId: string): Promise<void> {
  const [course] = await db
    .select({ legacyCourseId: mataKuliah.legacyCourseId })
    .from(mataKuliah)
    .where(eq(mataKuliah.id, runCourseId))
    .limit(1);
  if (!course || !course.legacyCourseId || storedCourseId !== course.legacyCourseId) {
    throw new Error("AUTHORING_MCP_IMPORT_COURSE_SCOPE_MISMATCH");
  }
}

function publicBundleImport(row: NonNullable<Awaited<ReturnType<typeof getIdeaBundleImport>> | Awaited<ReturnType<typeof getProductBundleImport>>>) {
  return {
    importId: row.id,
    bundleId: row.bundleId,
    bundleType: row.bundleType,
    checksum: row.checksum,
    version: row.version,
    status: row.status,
    validationReport: row.validationReport,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => ({
      entityType: item.entityType,
      entityId: item.entityId,
      entityVersion: item.entityVersion,
      entityHash: item.entityHash,
      status: item.status,
    })),
    reviews: row.reviews.map((review) => ({
      decision: review.status,
      notes: review.notes,
      reviewedAt: review.reviewedAt,
    })),
  };
}

async function stageIdeaArtifact(input: {
  principal: McpPrincipal;
  runToken: string;
  filename: string;
  bundleBase64: string;
  replaceImportId?: string;
}) {
  const run = readMcpRunToken(input.runToken);
  if (run.workflow !== "idea_product") return { ok: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
  const bytes = decodeMcpArtifact(input.bundleBase64, AUTHORING_MCP_MAX_BUNDLE_BYTES);
  const validation = validateIdeaBundleZip(bytes);
  if (!validation.success) return { ok: false, valid: false, staged: false, filename: input.filename, issues: validation.issues };
  if (validation.data.manifest.courseId !== run.courseId) return { ok: false, valid: false, staged: false, filename: input.filename, issues: [{ code: "AUTHORING_MCP_COURSE_SCOPE_MISMATCH", message: "Idea Bundle course does not match the locked run scope", path: "manifest.json.courseId" }] };
  const chapterScope = validateIdeaChapterScope(run, validation.data);
  const quality = evaluateIdeaBundleQuality(validation.data);
  if (!chapterScope.valid || !quality.valid) return { ok: false, valid: false, staged: false, filename: input.filename, issues: [...chapterScope.issues, ...quality.issues], quality };
  if (input.replaceImportId) {
    const target = await getIdeaBundleImport(input.replaceImportId);
    if (!target) throw new Error("IDEA_BUNDLE_NOT_FOUND");
    if (target.bundleId !== validation.data.manifest.bundleId) throw new Error("AUTHORING_MCP_IMPORT_BUNDLE_MISMATCH");
    await assertImportRunScope(target.courseId, run.courseId);
  }
  const result = await stageIdeaBundle({
    runId: run.runId,
    bundleId: validation.data.manifest.bundleId,
    courseId: run.courseId,
    schemaVersion: schemaVersionNumber(validation.data.manifest.schemaVersion),
    checksum: validation.data.manifest.bundleChecksum,
    bytes,
    requestedBy: input.principal.actorId,
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
    filename: input.filename,
    replaceImportId: input.replaceImportId,
  });
  return { ok: true, valid: true, staged: true, result, quality, next: "admin_review" };
}

async function stageProductArtifact(input: {
  principal: McpPrincipal;
  runToken: string;
  filename: string;
  bundleBase64: string;
  replaceImportId?: string;
}) {
  const run = readMcpRunToken(input.runToken);
  if (run.workflow !== "idea_product") return { ok: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
  const bytes = decodeMcpArtifact(input.bundleBase64, AUTHORING_MCP_MAX_BUNDLE_BYTES);
  const validation = validateProductBundle(bytes);
  if (!validation.success) return { ok: false, valid: false, staged: false, filename: input.filename, issues: validation.issues };
  if (validation.data.manifest.courseId !== run.courseId) return { ok: false, valid: false, staged: false, filename: input.filename, issues: [{ code: "AUTHORING_MCP_COURSE_SCOPE_MISMATCH", message: "Product Bundle course does not match the locked run scope", path: "manifest.json.courseId" }] };
  const chapterScope = validateProductChapterScope(run, validation.data);
  const ideaScope = await validateProductIdeaScope(run, validation.data);
  const quality = evaluateProductBundleQuality(validation.data);
  const dependencyIssues = validation.data.publicationBlocked ? [{ code: "PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW", message: "Product Bundle has dependencies that are not up to date.", path: "entities/dependencies.json" }] : [];
  const blockingIssues = [...chapterScope.issues, ...ideaScope.issues, ...dependencyIssues, ...quality.issues];
  if (blockingIssues.length > 0) return { ok: false, valid: false, staged: false, filename: input.filename, issues: blockingIssues, quality, publicationBlocked: validation.data.publicationBlocked };
  if (input.replaceImportId) {
    const target = await getProductBundleImport(input.replaceImportId);
    if (!target) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
    if (target.bundleId !== validation.data.manifest.bundleId) throw new Error("AUTHORING_MCP_IMPORT_BUNDLE_MISMATCH");
    if (target.status !== "draft") throw new Error("PRODUCT_BUNDLE_DRAFT_REQUIRED");
    await assertImportRunScope(target.courseId, run.courseId);
  }
  const result = await stageProductBundle({
    runId: run.runId,
    bundleId: validation.data.manifest.bundleId,
    courseId: run.courseId,
    checksum: validation.data.manifest.bundleChecksum,
    bytes,
    requestedBy: input.principal.actorId,
    bundle: validation.data,
    qualityReport: quality as unknown as Record<string, unknown>,
    filename: input.filename,
  });
  if (input.replaceImportId && result.importId !== input.replaceImportId) throw new Error("AUTHORING_MCP_IMPORT_REPLACE_TARGET_MISMATCH");
  return { ok: true, valid: true, staged: true, result, quality, next: "admin_review" };
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

  (server as any).registerTool("source.list_files", {
    title: "List stored source files",
    description: "Mengembalikan PDF tersimpan untuk mata kuliah dan bab terpilih dengan fileKey sementara tanpa membuka ID database atau R2 key.",
    inputSchema: {
      courseKey: z.string().min(1),
      chapterKey: z.string().min(1),
      categories: z.array(z.enum(["materi", "soal", "pembahasan_soal"])).max(3).optional(),
      cursor: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(100).default(50),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ courseKey, chapterKey, categories, cursor, limit }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    return {
      ok: true,
      ...(await listStoredSourceFiles({ courseKey, chapterKey, categories, cursor, limit })),
    };
  }));

  (server as any).registerTool("source.read_file", {
    title: "Read stored PDF",
    description: "Membaca PDF tersimpan sebagai teks dan gambar halaman. Gunakan mode blob hanya sebagai fallback eksplisit setelah pembacaan halaman gagal atau timeout.",
    inputSchema: {
      fileKey: z.string().min(1),
      mode: z.enum(["pages", "blob"]).default("pages"),
      pages: z.array(z.number().int().positive()).min(1).max(4).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ fileKey, mode, pages }: any) => {
    try {
      requireMcpScope(principal, "authoring:read");
      const result = await readStoredSourceFile({ fileKey, mode, pages });
      return formatSourceFileReadResult(result);
    } catch (error) {
      return toolError(error);
    }
  });

  (server as any).registerTool("source.ingest", {
    title: "Ingest Source Pack",
    description: "Menerima Source Pack sebagai base64 melalui MCP, menjalankan compatibility checking, dan mengembalikan token sumber tervalidasi.",
    inputSchema: {
      filename: z.string().min(1).max(255),
      contentBase64: z.string().min(1).max(96 * 1024 * 1024),
      originals: sourceOriginalSchema,
      storedOriginals: storedSourceOriginalSchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ filename, contentBase64, originals, storedOriginals }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const resolved = await resolveSourceOriginals(originals, storedOriginals);
    return ingestMcpSourcePack(filename, contentBase64, resolved.originals, resolved.boundScope);
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
    return stageIdeaArtifact({ principal, runToken, filename, bundleBase64 });
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
    return stageProductArtifact({ principal, runToken, filename, bundleBase64 });
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

function registerLifecycleTools(server: McpServer, principal: McpPrincipal): void {
  (server as any).registerTool("authoring.list_imports", {
    title: "List staged bundle imports",
    description: "Mengembalikan inventory Idea atau Product Bundle untuk inspeksi lifecycle sebelum edit, review, atau withdrawal.",
    inputSchema: {
      bundleType: z.enum(["idea", "product"]),
      limit: z.number().int().min(1).max(100).default(50),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ bundleType, limit }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const rows = bundleType === "idea" ? await listIdeaBundleImports(limit) : await listProductBundleImports(limit);
    return {
      ok: true,
      bundleType,
      imports: rows.map((row) => ({
        importId: row.id,
        bundleId: row.bundleId,
        checksum: row.checksum,
        version: row.version,
        status: row.status,
        validationReport: row.validationReport,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    };
  }));

  (server as any).registerTool("authoring.get_import", {
    title: "Get staged bundle import",
    description: "Mengembalikan detail import, inventory entity, laporan validasi, dan keputusan review tanpa mengekspos storage key atau identity internal reviewer.",
    inputSchema: {
      bundleType: z.enum(["idea", "product"]),
      importId: z.string().trim().min(1),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ bundleType, importId }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const row = bundleType === "idea" ? await getIdeaBundleImport(importId) : await getProductBundleImport(importId);
    if (!row) throw new Error(bundleType === "idea" ? "IDEA_BUNDLE_NOT_FOUND" : "PRODUCT_BUNDLE_NOT_FOUND");
    return { ok: true, import: publicBundleImport(row) };
  }));

  (server as any).registerTool("authoring.restage_idea_bundle", {
    title: "Replace staged Idea Bundle",
    description: "Memvalidasi ulang lalu mengganti import Idea Bundle yang belum published. Review lama direset oleh lifecycle service.",
    inputSchema: {
      runToken: z.string().min(1),
      importId: z.string().trim().min(1),
      filename: z.string().min(1).max(255),
      bundleBase64: z.string().min(1).max(48 * 1024 * 1024),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ runToken, importId, filename, bundleBase64 }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:stage");
    return stageIdeaArtifact({ principal, runToken, filename, bundleBase64, replaceImportId: importId });
  }));

  (server as any).registerTool("authoring.restage_product_bundle", {
    title: "Replace staged Product Bundle",
    description: "Memvalidasi ulang lalu mengganti Product Bundle draft dengan bundle ID dan scope yang sama.",
    inputSchema: {
      runToken: z.string().min(1),
      importId: z.string().trim().min(1),
      filename: z.string().min(1).max(255),
      bundleBase64: z.string().min(1).max(48 * 1024 * 1024),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ runToken, importId, filename, bundleBase64 }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:stage");
    return stageProductArtifact({ principal, runToken, filename, bundleBase64, replaceImportId: importId });
  }));

  (server as any).registerTool("authoring.discard_product_draft", {
    title: "Discard Product Bundle draft",
    description: "Menghapus Product Bundle yang masih draft beserta artifact staging-nya. Published atau withdrawn bundle tidak dapat dihapus.",
    inputSchema: { importId: z.string().trim().min(1) },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ importId }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:withdraw");
    return { ok: true, result: await discardProductBundleDraft({ importId, actorId: principal.actorId }) };
  }));

  (server as any).registerTool("authoring.review_idea_bundle", {
    title: "Review Idea Bundle",
    description: "Mencatat keputusan review immutable untuk Idea Bundle. Admin approval mengubah import menjadi approved; rejection menjadi rejected.",
    inputSchema: {
      importId: z.string().trim().min(1),
      decision: z.enum(["approved", "rejected"]),
      notes: z.string().trim().max(4000).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ importId, decision, notes }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:review");
    return { ok: true, result: await reviewIdeaBundle({ importId, reviewerId: principal.actorId, decision, notes }) };
  }));

  (server as any).registerTool("authoring.review_product_bundle", {
    title: "Review Product Bundle",
    description: "Mencatat keputusan review immutable untuk Product Bundle draft tanpa mempublikasikannya.",
    inputSchema: {
      importId: z.string().trim().min(1),
      decision: z.enum(["approved", "rejected"]),
      notes: z.string().trim().max(4000).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ importId, decision, notes }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:review");
    return { ok: true, result: await reviewProductBundle({ importId, reviewerId: principal.actorId, decision, notes }) };
  }));

  (server as any).registerTool("authoring.withdraw_product_bundle", {
    title: "Withdraw published Product Bundle",
    description: "Menarik Product Bundle published melalui lifecycle audited, meretire projection canonical, dan mengantrekan penghapusan vector. Tool ini idempotent.",
    inputSchema: { importId: z.string().trim().min(1) },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ importId }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:withdraw");
    return { ok: true, result: await withdrawProductBundle({ importId, withdrawnBy: principal.actorId }) };
  }));

  (server as any).registerTool("assessment.update_question", {
    title: "Edit draft question",
    description: "Memperbarui soal canonical Zyx original dalam scope run dan mengembalikannya ke generated untuk review. Soal published, retired, atau contoh ITB tidak dapat diedit melalui tool ini.",
    inputSchema: {
      runToken: z.string().min(1),
      questionId: z.string().trim().min(1),
      question: questionAuthoringQuestionSchema,
      ideaLinks: z.array(questionIdeaLinkSchema).max(50).default([]),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ runToken, questionId, question, ideaLinks }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:stage");
    const run = readMcpRunToken(runToken);
    if (run.workflow !== "quiz_bank") throw new Error("AUTHORING_MCP_WORKFLOW_MISMATCH");
    const [existing] = await db
      .select({ id: soal.id, courseId: soal.mataKuliahId, chapterId: soal.babId, origin: soal.origin, status: soal.status })
      .from(soal)
      .where(eq(soal.id, questionId))
      .limit(1);
    if (!existing || existing.courseId !== run.courseId || existing.chapterId !== run.chapterId) throw new Error("AUTHORING_MCP_QUESTION_NOT_IN_SCOPE");
    if (existing.origin === "itb_example") throw new Error("QUESTION_AUTHORING_ITB_IMMUTABLE");
    if (existing.status === "published" || existing.status === "retired") throw new Error("AUTHORING_MCP_QUESTION_EDIT_DRAFT_REQUIRED");
    const result = await updateCanonicalQuestion({
      ...question,
      courseId: run.courseId,
      chapterId: run.chapterId,
      ideaLinks,
      reviewStatus: "generated",
    }, principal.actorId, questionId);
    return { ok: true, result, next: "admin_review" };
  }));
}

function registerKnowledgeTools(server: McpServer, principal: McpPrincipal): void {
  (server as any).registerTool("knowledge.search_ideas", {
    title: "Search published Ideas",
    description: "Mencari dan memfilter Idea published pada mata kuliah dan bab yang dikunci. Tersedia untuk semua workflow.",
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
    };
  }));

  (server as any).registerTool("knowledge.get_idea", {
    title: "Get Idea detail",
    description: "Mengembalikan detail satu Idea published dalam scope run, termasuk relations aktif dan ringkasan provenance sumber.",
    inputSchema: {
      runToken: z.string().min(1),
      ideaId: z.string().trim().min(1),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, ideaId }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
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
        ...outgoingRows.map((row) => ({ relationType: row.relationType, direction: "outgoing" as const, counterpart: { id: row.counterpartId, code: row.counterpartCode }, explanation: row.explanation })),
        ...incomingRows.map((row) => ({ relationType: row.relationType, direction: "incoming" as const, counterpart: { id: row.counterpartId, code: row.counterpartCode }, explanation: row.explanation })),
      ],
      provenance: { counts: provenanceCounts.map((row) => ({ role: row.role, count: Number(row.count) })) },
    };
  }));

  (server as any).registerTool("knowledge.list_products", {
    title: "List products in chapter scope",
    description: "Mengembalikan ringkasan produk (artikel, diktat, flashcard set, soal) yang sudah ada dalam scope run, dihitung per tipe dan per Idea.",
    inputSchema: {
      runToken: z.string().min(1),
      ideaIds: z.array(z.string().min(1)).max(50).optional(),
      productTypes: z.array(z.enum(["article", "diktat", "flashcard_set", "question"])).max(4).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, ideaIds, productTypes }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    const types = productTypes ?? ["article", "diktat", "flashcard_set", "question"];
    const result: Record<string, unknown> = { ok: true, scope: { course: run.courseLabel, chapter: run.chapterLabel } };

    if (types.includes("article")) {
      const rows = await db
        .select({ id: artikel.id, title: artikel.title, slug: artikel.slug, version: artikel.version, ideaCount: sql<number>`count(${artikelIde.ideId})` })
        .from(artikel)
        .leftJoin(artikelIde, eq(artikelIde.artikelId, artikel.id))
        .where(and(eq(artikel.mataKuliahId, run.courseId), eq(artikel.babId, run.chapterId), eq(artikel.status, "published")))
        .groupBy(artikel.id)
        .orderBy(asc(artikel.slug));
      result.articles = rows.map((row) => ({ id: row.id, title: row.title, slug: row.slug, version: row.version, ideaCount: Number(row.ideaCount) }));
    }

    if (types.includes("diktat")) {
      const rows = await db
        .select({ id: diktatMateri.id, title: diktatMateri.title, version: diktatMateri.version, ideaCount: sql<number>`count(${diktatIde.ideId})` })
        .from(diktatMateri)
        .leftJoin(diktatIde, eq(diktatIde.diktatMateriId, diktatMateri.id))
        .where(and(eq(diktatMateri.mataKuliahId, run.courseId), eq(diktatMateri.babId, run.chapterId), eq(diktatMateri.status, "published")))
        .groupBy(diktatMateri.id)
        .orderBy(asc(diktatMateri.title));
      result.diktat = rows.map((row) => ({ id: row.id, title: row.title, version: row.version, ideaCount: Number(row.ideaCount) }));
    }

    if (types.includes("flashcard_set")) {
      const rows = await db
        .select({ id: setFlashcard.id, title: setFlashcard.title, version: setFlashcard.version, cardCount: sql<number>`count(${flashcard.id})` })
        .from(setFlashcard)
        .leftJoin(flashcard, eq(flashcard.setFlashcardId, setFlashcard.id))
        .where(and(eq(setFlashcard.mataKuliahId, run.courseId), eq(setFlashcard.babId, run.chapterId), eq(setFlashcard.status, "published")))
        .groupBy(setFlashcard.id)
        .orderBy(asc(setFlashcard.title));
      result.flashcardSets = rows.map((row) => ({ id: row.id, title: row.title, version: row.version, cardCount: Number(row.cardCount) }));
    }

    if (types.includes("question")) {
      const rows = await db
        .select({ id: soal.id, questionType: soal.questionType, difficulty: soal.difficulty, cognitiveLevel: soal.cognitiveLevel, origin: soal.origin })
        .from(soal)
        .where(and(eq(soal.mataKuliahId, run.courseId), eq(soal.babId, run.chapterId), eq(soal.status, "published")))
        .orderBy(asc(soal.id));
      result.questions = rows.map((row) => ({ id: row.id, questionType: row.questionType, difficulty: row.difficulty, cognitiveLevel: row.cognitiveLevel, origin: row.origin }));
    }

    if (ideaIds && ideaIds.length > 0) {
      const ideaProductCounts: Record<string, Record<string, number>> = {};
      for (const id of ideaIds) ideaProductCounts[id] = { articles: 0, diktat: 0, flashcards: 0, questions: 0 };

      if (types.includes("article")) {
        const articleLinks = await db.select({ ideId: artikelIde.ideId, count: sql<number>`count(*)` }).from(artikelIde).innerJoin(artikel, eq(artikel.id, artikelIde.artikelId)).where(and(eq(artikel.mataKuliahId, run.courseId), eq(artikel.babId, run.chapterId), eq(artikel.status, "published"), inArray(artikelIde.ideId, ideaIds))).groupBy(artikelIde.ideId);
        for (const row of articleLinks) if (ideaProductCounts[row.ideId]) ideaProductCounts[row.ideId].articles = Number(row.count);
      }
      if (types.includes("diktat")) {
        const diktatLinks = await db.select({ ideId: diktatIde.ideId, count: sql<number>`count(*)` }).from(diktatIde).innerJoin(diktatMateri, eq(diktatMateri.id, diktatIde.diktatMateriId)).where(and(eq(diktatMateri.mataKuliahId, run.courseId), eq(diktatMateri.babId, run.chapterId), eq(diktatMateri.status, "published"), inArray(diktatIde.ideId, ideaIds))).groupBy(diktatIde.ideId);
        for (const row of diktatLinks) if (ideaProductCounts[row.ideId]) ideaProductCounts[row.ideId].diktat = Number(row.count);
      }
      if (types.includes("flashcard_set")) {
        const flashcardLinks = await db.select({ ideId: flashcardIde.ideId, count: sql<number>`count(*)` }).from(flashcardIde).innerJoin(flashcard, eq(flashcard.id, flashcardIde.flashcardId)).innerJoin(setFlashcard, eq(setFlashcard.id, flashcard.setFlashcardId)).where(and(eq(setFlashcard.mataKuliahId, run.courseId), eq(setFlashcard.babId, run.chapterId), eq(setFlashcard.status, "published"), inArray(flashcardIde.ideId, ideaIds))).groupBy(flashcardIde.ideId);
        for (const row of flashcardLinks) if (ideaProductCounts[row.ideId]) ideaProductCounts[row.ideId].flashcards = Number(row.count);
      }
      if (types.includes("question")) {
        const questionLinks = await db.select({ ideId: soalIde.ideId, count: sql<number>`count(*)` }).from(soalIde).innerJoin(soal, eq(soal.id, soalIde.soalId)).where(and(eq(soal.mataKuliahId, run.courseId), eq(soal.babId, run.chapterId), eq(soal.status, "published"), inArray(soalIde.ideId, ideaIds))).groupBy(soalIde.ideId);
        for (const row of questionLinks) if (ideaProductCounts[row.ideId]) ideaProductCounts[row.ideId].questions = Number(row.count);
      }

      result.ideaProductCounts = ideaProductCounts;
    }

    return result;
  }));

  (server as any).registerTool("knowledge.get_product", {
    title: "Get product detail",
    description: "Mengembalikan detail satu produk (artikel, diktat, flashcard set, atau soal) beserta Idea links dan status dependency.",
    inputSchema: {
      runToken: z.string().min(1),
      productType: z.enum(["article", "diktat", "flashcard_set", "question"]),
      productId: z.string().trim().min(1),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, productType, productId }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);

    if (productType === "article") {
      const [row] = await db.select().from(artikel).where(and(eq(artikel.id, productId), eq(artikel.mataKuliahId, run.courseId), eq(artikel.babId, run.chapterId))).limit(1);
      if (!row) throw new Error("AUTHORING_MCP_PRODUCT_NOT_IN_SCOPE");
      const links = await db.select({ ideId: artikelIde.ideId, code: ide.code, weight: artikelIde.weight }).from(artikelIde).innerJoin(ide, eq(ide.id, artikelIde.ideId)).where(eq(artikelIde.artikelId, productId));
      return { ok: true, productType: "article", product: { id: row.id, title: row.title, slug: row.slug, version: row.version, status: row.status }, ideaLinks: links };
    }
    if (productType === "diktat") {
      const [row] = await db.select().from(diktatMateri).where(and(eq(diktatMateri.id, productId), eq(diktatMateri.mataKuliahId, run.courseId), eq(diktatMateri.babId, run.chapterId))).limit(1);
      if (!row) throw new Error("AUTHORING_MCP_PRODUCT_NOT_IN_SCOPE");
      const links = await db.select({ ideId: diktatIde.ideId, code: ide.code, weight: diktatIde.weight }).from(diktatIde).innerJoin(ide, eq(ide.id, diktatIde.ideId)).where(eq(diktatIde.diktatMateriId, productId));
      return { ok: true, productType: "diktat", product: { id: row.id, title: row.title, version: row.version, status: row.status }, ideaLinks: links };
    }
    if (productType === "flashcard_set") {
      const [row] = await db.select().from(setFlashcard).where(and(eq(setFlashcard.id, productId), eq(setFlashcard.mataKuliahId, run.courseId), eq(setFlashcard.babId, run.chapterId))).limit(1);
      if (!row) throw new Error("AUTHORING_MCP_PRODUCT_NOT_IN_SCOPE");
      const cards = await db.select({ id: flashcard.id, front: flashcard.front, back: flashcard.back, status: flashcard.status }).from(flashcard).where(eq(flashcard.setFlashcardId, productId));
      return { ok: true, productType: "flashcard_set", product: { id: row.id, title: row.title, version: row.version, status: row.status, cardCount: cards.length }, cards };
    }
    if (productType === "question") {
      const [row] = await db.select().from(soal).where(and(eq(soal.id, productId), eq(soal.mataKuliahId, run.courseId), eq(soal.babId, run.chapterId))).limit(1);
      if (!row) throw new Error("AUTHORING_MCP_PRODUCT_NOT_IN_SCOPE");
      const links = await db.select({ ideId: soalIde.ideId, code: ide.code, weight: soalIde.weight, role: soalIde.role }).from(soalIde).innerJoin(ide, eq(ide.id, soalIde.ideId)).where(eq(soalIde.soalId, productId));
      return { ok: true, productType: "question", product: { id: row.id, questionType: row.questionType, difficulty: row.difficulty, cognitiveLevel: row.cognitiveLevel, origin: row.origin, version: row.version, status: row.status }, ideaLinks: links };
    }
    throw new Error("AUTHORING_MCP_PRODUCT_TYPE_INVALID");
  }));

  (server as any).registerTool("knowledge.list_sources", {
    title: "List source materials",
    description: "Mengembalikan daftar sumber materi dalam scope run beserta jumlah chunk masing-masing.",
    inputSchema: {
      runToken: z.string().min(1),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    const rows = await db
      .select({
        id: sumberMateri.id,
        title: sumberMateri.title,
        sourceType: sumberMateri.sourceType,
        version: sumberMateri.version,
        checksum: sumberMateri.checksum,
        status: sumberMateri.status,
        chunkCount: sql<number>`count(${potonganSumber.id})`,
      })
      .from(sumberMateri)
      .leftJoin(potonganSumber, eq(potonganSumber.sumberMateriId, sumberMateri.id))
      .where(and(eq(sumberMateri.mataKuliahId, run.courseId), eq(sumberMateri.babId, run.chapterId), eq(sumberMateri.status, "active")))
      .groupBy(sumberMateri.id)
      .orderBy(asc(sumberMateri.title));
    return {
      ok: true,
      scope: { course: run.courseLabel, chapter: run.chapterLabel },
      sources: rows.map((row) => ({ id: row.id, title: row.title, sourceType: row.sourceType, version: row.version, checksum: row.checksum, chunkCount: Number(row.chunkCount) })),
    };
  }));

  (server as any).registerTool("knowledge.get_source", {
    title: "Get source material detail",
    description: "Mengembalikan detail sumber materi beserta daftar chunk (offset, sectionLocator, checksum).",
    inputSchema: {
      runToken: z.string().min(1),
      sourceId: z.string().trim().min(1),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, sourceId }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    const [source] = await db.select().from(sumberMateri).where(and(eq(sumberMateri.id, sourceId), eq(sumberMateri.mataKuliahId, run.courseId), eq(sumberMateri.babId, run.chapterId), eq(sumberMateri.status, "active"))).limit(1);
    if (!source) throw new Error("AUTHORING_MCP_SOURCE_NOT_IN_SCOPE");
    const chunks = await db
      .select({ id: potonganSumber.id, sourceVersion: potonganSumber.sourceVersion, startOffset: potonganSumber.startOffset, endOffset: potonganSumber.endOffset, pageNumber: potonganSumber.pageNumber, sectionLocator: potonganSumber.sectionLocator, checksum: potonganSumber.checksum })
      .from(potonganSumber)
      .where(eq(potonganSumber.sumberMateriId, sourceId))
      .orderBy(asc(potonganSumber.startOffset));
    return {
      ok: true,
      scope: { course: run.courseLabel, chapter: run.chapterLabel },
      source: { id: source.id, title: source.title, sourceType: source.sourceType, version: source.version, checksum: source.checksum },
      chunks: chunks.map((chunk) => ({ id: chunk.id, sourceVersion: chunk.sourceVersion, startOffset: chunk.startOffset, endOffset: chunk.endOffset, pageNumber: chunk.pageNumber, sectionLocator: chunk.sectionLocator, checksum: chunk.checksum })),
    };
  }));

  (server as any).registerTool("knowledge.search_source_chunks", {
    title: "Search source material chunks",
    description: "Mencari chunk sumber materi berdasarkan teks. Berguna untuk menemukan bagian sumber yang menjelaskan topik tertentu.",
    inputSchema: {
      runToken: z.string().min(1),
      query: z.string().trim().min(1).max(200),
      sourceId: z.string().trim().min(1).optional(),
      limit: z.number().int().min(1).max(50).default(10),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, query, sourceId, limit }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    const conditions = [
      eq(sumberMateri.mataKuliahId, run.courseId),
      eq(sumberMateri.babId, run.chapterId),
      eq(sumberMateri.status, "active"),
      like(potonganSumber.content, `%${query}%`),
    ];
    if (sourceId) conditions.push(eq(potonganSumber.sumberMateriId, sourceId));
    const rows = await db
      .select({
        chunkId: potonganSumber.id,
        sourceId: sumberMateri.id,
        sourceTitle: sumberMateri.title,
        startOffset: potonganSumber.startOffset,
        endOffset: potonganSumber.endOffset,
        pageNumber: potonganSumber.pageNumber,
        sectionLocator: potonganSumber.sectionLocator,
        content: potonganSumber.content,
      })
      .from(potonganSumber)
      .innerJoin(sumberMateri, eq(sumberMateri.id, potonganSumber.sumberMateriId))
      .where(and(...conditions))
      .limit(limit);
    return {
      ok: true,
      scope: { course: run.courseLabel, chapter: run.chapterLabel },
      query,
      matchCount: rows.length,
      matches: rows.map((row) => ({
        chunkId: row.chunkId,
        sourceId: row.sourceId,
        sourceTitle: row.sourceTitle,
        startOffset: row.startOffset,
        endOffset: row.endOffset,
        pageNumber: row.pageNumber,
        sectionLocator: row.sectionLocator,
        excerpt: row.content.length > 500 ? row.content.slice(0, 500) + "..." : row.content,
      })),
    };
  }));
}

function registerAnalysisTools(server: McpServer, principal: McpPrincipal): void {
  (server as any).registerTool("analysis.get_coverage", {
    title: "Get Idea coverage matrix",
    description: "Mengembalikan matriks cakupan Idea terhadap sumber, artikel, flashcard, dan soal dalam scope run. Berguna untuk mengetahui apa yang sudah ada dan apa yang masih perlu dibuat.",
    inputSchema: {
      runToken: z.string().min(1),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);

    const ideaRows = await db
      .select({ id: ide.id, code: ide.code, statement: ide.canonicalStatement, knowledgeKind: ide.knowledgeKind, instructionalRole: ide.instructionalRole })
      .from(ide)
      .where(and(eq(ide.mataKuliahId, run.courseId), eq(ide.babId, run.chapterId), eq(ide.status, "published")))
      .orderBy(ide.code);

    const ideaIds = ideaRows.map((row) => row.id);
    if (ideaIds.length === 0) {
      return { ok: true, scope: { course: run.courseLabel, chapter: run.chapterLabel }, ideas: [], summary: { totalIdeas: 0, coveredIdeas: 0, uncoveredIdeas: 0, totalSources: 0, totalArticles: 0, totalFlashcardSets: 0, totalQuestions: 0, uncoveredIdeaIds: [] } };
    }

    const sourceCounts = await db
      .select({ ideId: asalIde.ideId, count: sql<number>`count(distinct ${asalIde.sourceChunkId})` })
      .from(asalIde)
      .innerJoin(potonganSumber, eq(potonganSumber.id, asalIde.sourceChunkId))
      .innerJoin(sumberMateri, eq(sumberMateri.id, potonganSumber.sumberMateriId))
      .where(and(eq(sumberMateri.mataKuliahId, run.courseId), eq(sumberMateri.babId, run.chapterId), inArray(asalIde.ideId, ideaIds)))
      .groupBy(asalIde.ideId);
    const sourceCountMap = new Map(sourceCounts.map((row) => [row.ideId, Number(row.count)]));

    const articleCounts = await db.select({ ideId: artikelIde.ideId, count: sql<number>`count(*)` }).from(artikelIde).innerJoin(artikel, eq(artikel.id, artikelIde.artikelId)).where(and(eq(artikel.mataKuliahId, run.courseId), eq(artikel.babId, run.chapterId), eq(artikel.status, "published"), inArray(artikelIde.ideId, ideaIds))).groupBy(artikelIde.ideId);
    const articleCountMap = new Map(articleCounts.map((row) => [row.ideId, Number(row.count)]));

    const flashcardCounts = await db.select({ ideId: flashcardIde.ideId, count: sql<number>`count(*)` }).from(flashcardIde).innerJoin(flashcard, eq(flashcard.id, flashcardIde.flashcardId)).innerJoin(setFlashcard, eq(setFlashcard.id, flashcard.setFlashcardId)).where(and(eq(setFlashcard.mataKuliahId, run.courseId), eq(setFlashcard.babId, run.chapterId), eq(setFlashcard.status, "published"), inArray(flashcardIde.ideId, ideaIds))).groupBy(flashcardIde.ideId);
    const flashcardCountMap = new Map(flashcardCounts.map((row) => [row.ideId, Number(row.count)]));

    const questionCounts = await db.select({ ideId: soalIde.ideId, count: sql<number>`count(*)` }).from(soalIde).innerJoin(soal, eq(soal.id, soalIde.soalId)).where(and(eq(soal.mataKuliahId, run.courseId), eq(soal.babId, run.chapterId), eq(soal.status, "published"), inArray(soalIde.ideId, ideaIds))).groupBy(soalIde.ideId);
    const questionCountMap = new Map(questionCounts.map((row) => [row.ideId, Number(row.count)]));

    const totalSourceCount = await db.select({ count: sql<number>`count(distinct ${sumberMateri.id})` }).from(sumberMateri).where(and(eq(sumberMateri.mataKuliahId, run.courseId), eq(sumberMateri.babId, run.chapterId), eq(sumberMateri.status, "active")));
    const totalArticleCount = await db.select({ count: sql<number>`count(*)` }).from(artikel).where(and(eq(artikel.mataKuliahId, run.courseId), eq(artikel.babId, run.chapterId), eq(artikel.status, "published")));
    const totalFlashcardSetCount = await db.select({ count: sql<number>`count(*)` }).from(setFlashcard).where(and(eq(setFlashcard.mataKuliahId, run.courseId), eq(setFlashcard.babId, run.chapterId), eq(setFlashcard.status, "published")));
    const totalQuestionCount = await db.select({ count: sql<number>`count(*)` }).from(soal).where(and(eq(soal.mataKuliahId, run.courseId), eq(soal.babId, run.chapterId), eq(soal.status, "published")));

    const ideas = ideaRows.map((row) => ({
      id: row.id,
      code: row.code,
      statement: row.statement,
      knowledgeKind: normalizeIdeaKnowledgeKind(row.knowledgeKind),
      instructionalRole: normalizeIdeaInstructionalRole(row.instructionalRole),
      sources: sourceCountMap.get(row.id) ?? 0,
      articles: articleCountMap.get(row.id) ?? 0,
      flashcards: flashcardCountMap.get(row.id) ?? 0,
      questions: questionCountMap.get(row.id) ?? 0,
    }));

    const uncoveredIdeaIds = ideas.filter((idea) => idea.sources === 0 && idea.articles === 0 && idea.flashcards === 0 && idea.questions === 0).map((idea) => idea.id);
    const coveredIdeas = ideas.filter((idea) => idea.sources > 0 || idea.articles > 0 || idea.flashcards > 0 || idea.questions > 0);

    return {
      ok: true,
      scope: { course: run.courseLabel, chapter: run.chapterLabel },
      ideas,
      summary: {
        totalIdeas: ideas.length,
        coveredIdeas: coveredIdeas.length,
        uncoveredIdeas: uncoveredIdeaIds.length,
        uncoveredIdeaIds,
        totalSources: Number(totalSourceCount[0]?.count ?? 0),
        totalArticles: Number(totalArticleCount[0]?.count ?? 0),
        totalFlashcardSets: Number(totalFlashcardSetCount[0]?.count ?? 0),
        totalQuestions: Number(totalQuestionCount[0]?.count ?? 0),
      },
    };
  }));
}

function registerAssessmentAnalysisTools(server: McpServer, principal: McpPrincipal): void {
  (server as any).registerTool("assessment.list_questions", {
    title: "List questions",
    description: "Mengembalikan soal dalam scope run, termasuk draft dan in-review, dengan filter status, difficulty, cognitive level, question type, dan pencarian teks.",
    inputSchema: {
      runToken: z.string().min(1),
      query: z.string().trim().max(200).optional(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      cognitiveLevel: z.enum(["remember", "understand", "apply", "analyze", "evaluate", "create"]).optional(),
      questionType: z.enum(["multiple_choice", "multiple_choices", "short_answer", "essay"]).optional(),
      origin: z.enum(["zyx_original", "itb_example"]).optional(),
      status: z.enum(["draft", "in_review", "published", "retired"]).optional(),
      limit: z.number().int().min(1).max(200).default(100),
      offset: z.number().int().min(0).default(0),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, query, difficulty, cognitiveLevel, questionType, origin, status, limit, offset }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    const conditions = [eq(soal.mataKuliahId, run.courseId), eq(soal.babId, run.chapterId)];
    if (difficulty) conditions.push(eq(soal.difficulty, difficulty));
    if (cognitiveLevel) conditions.push(eq(soal.cognitiveLevel, cognitiveLevel));
    if (questionType) conditions.push(eq(soal.questionType, questionType));
    if (origin) conditions.push(eq(soal.origin, origin));
    if (status) conditions.push(eq(soal.status, status));
    const rows = await db
      .select({ id: soal.id, questionType: soal.questionType, prompt: soal.prompt, difficulty: soal.difficulty, cognitiveLevel: soal.cognitiveLevel, reasoningPattern: soal.reasoningPattern, origin: soal.origin, version: soal.version, status: soal.status })
      .from(soal)
      .where(and(...conditions))
      .orderBy(asc(soal.id));
    const filtered = query ? rows.filter((row) => row.prompt.toLowerCase().includes(query.toLowerCase())) : rows;
    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);
    return {
      ok: true,
      scope: { course: run.courseLabel, chapter: run.chapterLabel },
      totalQuestionCount: total,
      questionCount: page.length,
      questions: page.map((row) => ({ id: row.id, questionType: row.questionType, prompt: row.prompt.length > 200 ? row.prompt.slice(0, 200) + "..." : row.prompt, difficulty: row.difficulty, cognitiveLevel: row.cognitiveLevel, reasoningPattern: row.reasoningPattern, origin: row.origin, version: row.version, status: row.status })),
      paging: { limit, offset, nextOffset: offset + limit < total ? offset + limit : null },
    };
  }));

  (server as any).registerTool("assessment.get_question", {
    title: "Get question detail",
    description: "Mengembalikan detail satu soal beserta Idea links dan explanation.",
    inputSchema: {
      runToken: z.string().min(1),
      questionId: z.string().trim().min(1),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, questionId }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    const [question] = await db.select().from(soal).where(and(eq(soal.id, questionId), eq(soal.mataKuliahId, run.courseId), eq(soal.babId, run.chapterId))).limit(1);
    if (!question) throw new Error("AUTHORING_MCP_QUESTION_NOT_IN_SCOPE");
    const links = await db.select({ ideId: soalIde.ideId, code: ide.code, weight: soalIde.weight, role: soalIde.role }).from(soalIde).innerJoin(ide, eq(ide.id, soalIde.ideId)).where(eq(soalIde.soalId, questionId));
    return {
      ok: true,
      scope: { course: run.courseLabel, chapter: run.chapterLabel },
      question: {
        id: question.id, questionType: question.questionType, prompt: question.prompt,
        optionsSnapshot: question.optionsSnapshot, difficulty: question.difficulty,
        cognitiveLevel: question.cognitiveLevel, reasoningPattern: question.reasoningPattern,
        origin: question.origin, version: question.version, status: question.status,
      },
      ideaLinks: links,
    };
  }));

  (server as any).registerTool("assessment.analyze_bank", {
    title: "Analyze question bank",
    description: "Menganalisis distribusi soal berdasarkan difficulty, cognitive level, dan Idea coverage dalam scope run.",
    inputSchema: {
      runToken: z.string().min(1),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    const rows = await db
      .select({ id: soal.id, difficulty: soal.difficulty, cognitiveLevel: soal.cognitiveLevel, origin: soal.origin })
      .from(soal)
      .where(and(eq(soal.mataKuliahId, run.courseId), eq(soal.babId, run.chapterId), eq(soal.status, "published")));

    const difficultyDistribution = { easy: 0, medium: 0, hard: 0 };
    const cognitiveDistribution = { remember: 0, understand: 0, apply: 0, analyze: 0, evaluate: 0, create: 0 };
    const originDistribution = { zyx_original: 0, itb_example: 0 };
    for (const row of rows) {
      if (row.difficulty in difficultyDistribution) difficultyDistribution[row.difficulty as keyof typeof difficultyDistribution]++;
      if (row.cognitiveLevel in cognitiveDistribution) cognitiveDistribution[row.cognitiveLevel as keyof typeof cognitiveDistribution]++;
      if (row.origin in originDistribution) originDistribution[row.origin as keyof typeof originDistribution]++;
    }

    const questionIds = rows.map((row) => row.id);
    const ideaCoverage: Record<string, number> = {};
    if (questionIds.length > 0) {
      for (const chunk of chunkValues(questionIds, 200)) {
        const links = await db.select({ ideId: soalIde.ideId, count: sql<number>`count(*)` }).from(soalIde).where(inArray(soalIde.soalId, chunk)).groupBy(soalIde.ideId);
        for (const link of links) ideaCoverage[link.ideId] = (ideaCoverage[link.ideId] ?? 0) + Number(link.count);
      }
    }

    const allIdeaRows = await db.select({ id: ide.id, code: ide.code }).from(ide).where(and(eq(ide.mataKuliahId, run.courseId), eq(ide.babId, run.chapterId), eq(ide.status, "published"))).orderBy(ide.code);
    const uncoveredIdeas = allIdeaRows.filter((row) => !ideaCoverage[row.id]).map((row) => ({ id: row.id, code: row.code }));
    const overRepresented = Object.entries(ideaCoverage).filter(([_, count]) => count > rows.length * 0.2).map(([ideaId, count]) => ({ ideaId, questionCount: count }));

    return {
      ok: true,
      scope: { course: run.courseLabel, chapter: run.chapterLabel },
      totalQuestions: rows.length,
      difficulty: difficultyDistribution,
      cognitiveLevel: cognitiveDistribution,
      origin: originDistribution,
      ideaCoverage,
      uncoveredIdeas,
      overRepresentedIdeas: overRepresented,
      issues: [
        ...uncoveredIdeas.map((idea) => ({ type: "uncovered_idea" as const, message: `${idea.code} (${idea.id}) belum memiliki soal.`, ideaId: idea.id })),
        ...overRepresented.map((item) => ({ type: "over_represented_idea" as const, message: `${item.ideaId} memiliki ${item.questionCount} soal (>20% dari total).`, ideaId: item.ideaId, questionCount: item.questionCount })),
      ],
    };
  }));

  (server as any).registerTool("assessment.find_similar", {
    title: "Find similar questions",
    description: "Mencari soal serupa berdasarkan difficulty, cognitive level, dan proximity prompt dalam scope run.",
    inputSchema: {
      runToken: z.string().min(1),
      questionId: z.string().trim().min(1),
      limit: z.number().int().min(1).max(20).default(5),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, questionId, limit }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    const [question] = await db.select().from(soal).where(and(eq(soal.id, questionId), eq(soal.mataKuliahId, run.courseId), eq(soal.babId, run.chapterId))).limit(1);
    if (!question) throw new Error("AUTHORING_MCP_QUESTION_NOT_IN_SCOPE");
    const candidates = await db
      .select({ id: soal.id, prompt: soal.prompt, questionType: soal.questionType, difficulty: soal.difficulty, cognitiveLevel: soal.cognitiveLevel, reasoningPattern: soal.reasoningPattern })
      .from(soal)
      .where(and(eq(soal.mataKuliahId, run.courseId), eq(soal.babId, run.chapterId), eq(soal.status, "published"), sql`${soal.id} != ${questionId}`))
      .orderBy(asc(soal.id));
    const scored = candidates.map((candidate) => {
      let score = 0;
      if (candidate.difficulty === question.difficulty) score += 2;
      if (candidate.cognitiveLevel === question.cognitiveLevel) score += 2;
      if (candidate.questionType === question.questionType) score += 1;
      const promptWords = question.prompt.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const candidateWords = new Set(candidate.prompt.toLowerCase().split(/\s+/));
      const overlap = promptWords.filter((w) => candidateWords.has(w)).length;
      score += overlap;
      return { ...candidate, similarityScore: score };
    });
    scored.sort((a, b) => b.similarityScore - a.similarityScore);
    const results = scored.slice(0, limit);
    return {
      ok: true,
      scope: { course: run.courseLabel, chapter: run.chapterLabel },
      referenceQuestion: { id: question.id, difficulty: question.difficulty, cognitiveLevel: question.cognitiveLevel, questionType: question.questionType },
      similarQuestions: results.map((row) => ({ id: row.id, prompt: row.prompt.length > 200 ? row.prompt.slice(0, 200) + "..." : row.prompt, difficulty: row.difficulty, cognitiveLevel: row.cognitiveLevel, questionType: row.questionType, similarityScore: row.similarityScore })),
    };
  }));
}

export function createAuthoringMcpServer(principal: McpPrincipal): McpServer {
  const server = new McpServer({ name: "zyx-authoring", version: "1.0.0" }, { capabilities: { tools: {} } });
  registerWorkflowTools(server, principal);
  registerValidationTools(server, principal);
  registerLifecycleTools(server, principal);
  registerKnowledgeTools(server, principal);
  registerAnalysisTools(server, principal);
  registerAssessmentAnalysisTools(server, principal);
  return server;
}
