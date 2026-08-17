import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiQuestionBank, bab, courses, ide, knowledgeObjects, mataKuliah } from "@/db/schema";
import { serializeDeterministically, validateIdeaBundleZip, type ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { previewIdeaBundle } from "@/lib/bundle/idea-preview";
import { stageIdeaBundle } from "@/lib/bundle/staging";
import { validateProductBundle } from "@/lib/bundle/product-validator";
import { previewProducts } from "@/lib/bundle/product-preview";
import { stageProductBundle } from "@/lib/bundle/product-staging";
import { evaluateIdeaBundleQuality } from "@/lib/authoring/quality/idea-bundle";
import { evaluateProductBundleQuality } from "@/lib/authoring/quality/product-bundle";
import { sha256Text } from "@/lib/bundle/validator";
import { validateQuestion } from "@/lib/question-validator";
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

const quizDraftSchema = z.object({
  schemaVersion: z.literal("quiz-bank-draft.v1"),
  draftId: z.string().min(1),
  questions: z.array(z.object({
    id: z.string().min(1),
    knowledgeObjectId: z.string().min(1),
    itemFormat: z.enum(["multiple_choice", "multiple_choices"]),
    prompt: z.string().min(1),
    options: z.array(z.string().min(1)),
    correctIndices: z.array(z.number().int().nonnegative()),
    explanation: z.string().min(1),
    difficulty: z.enum(["easy", "medium", "hard"]),
    cognitiveLevel: z.enum(["remember", "understand", "apply", "analyze", "evaluate", "create"]),
    reasoningPattern: z.string().min(1),
    tags: z.array(z.string()).default([]),
    acceptableAnswers: z.array(z.string()).default([]),
    applicationLevel: z.number().int().min(0).max(5).optional(),
    estimatedSteps: z.number().int().positive().optional(),
  }).strict()).min(1),
}).strict();

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

async function legacyScopeForRun(courseId: string, chapterId: string): Promise<{ courseId: string; chapterId: string }> {
  const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).limit(1);
  const [courseTarget] = await db.select({ legacyCourseId: mataKuliah.legacyCourseId }).from(mataKuliah).where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId))).limit(1);
  const legacyCourseId = course?.id ?? courseTarget?.legacyCourseId;
  if (!legacyCourseId) throw new Error("AUTHORING_MCP_COURSE_NOT_FOUND");
  const [chapter] = await db.select({ legacyChapterId: bab.legacyChapterId }).from(bab).where(and(eq(bab.id, chapterId), eq(bab.mataKuliahId, courseId))).limit(1);
  if (!chapter?.legacyChapterId) throw new Error("AUTHORING_MCP_CHAPTER_MAPPING_MISSING");
  return { courseId: legacyCourseId, chapterId: chapter.legacyChapterId };
}

async function stageQuizDraft(principal: McpPrincipal, runToken: string, draft: z.infer<typeof quizDraftSchema>) {
  requireMcpScope(principal, "authoring:stage");
  const run = readMcpRunToken(runToken);
  if (run.workflow !== "quiz_bank") throw new Error("AUTHORING_MCP_WORKFLOW_MISMATCH");
  const scope = await legacyScopeForRun(run.courseId, run.chapterId);
  const checks = await Promise.all(draft.questions.map(async (question) => {
    const [knowledgeObject] = await db
      .select({ courseId: knowledgeObjects.courseId, chapterId: knowledgeObjects.chapterId, status: knowledgeObjects.status })
      .from(knowledgeObjects)
      .where(eq(knowledgeObjects.id, question.knowledgeObjectId))
      .limit(1);
    const result = await validateQuestion(question);
    const errors = [...result.errors];
    if (!knowledgeObject) errors.push("Knowledge Object tidak ditemukan.");
    else {
      if (knowledgeObject.status !== "active") errors.push("Knowledge Object tidak aktif.");
      if (knowledgeObject.courseId !== scope.courseId) errors.push("Knowledge Object berada di mata kuliah lain.");
      if (knowledgeObject.chapterId !== scope.chapterId) errors.push("Knowledge Object berada di bab lain.");
    }
    return { question, errors, warnings: result.warnings };
  }));
  const issues = checks.flatMap((check) => [
    ...check.errors.map((message) => ({ code: "QUIZ_DRAFT_INVALID", message, path: check.question.id })),
    ...check.warnings.map((message) => ({ code: "QUIZ_DRAFT_WARNING", message, path: check.question.id })),
  ]);
  if (checks.some((check) => check.errors.length > 0)) return { ok: false, valid: false, staged: false, draftId: draft.draftId, questionCount: draft.questions.length, issues, next: "agent_revision" };

  const rows = draft.questions.map((question) => {
    const generationHash = sha256Text(serializeDeterministically({ runId: run.runId, question }));
    const id = `mcp-q-${sha256Text(`${run.runId}:${question.id}`).slice(0, 32)}`;
    return {
      id,
      courseId: scope.courseId,
      origin: "zyx_original" as const,
      sourceEventName: null,
      sourceReferenceId: null,
      knowledgeObjectId: question.knowledgeObjectId,
      status: "active",
      isStale: false,
      difficulty: question.difficulty,
      questionType: question.itemFormat,
      tags: question.tags,
      prompt: question.prompt,
      options: question.options,
      correctIndices: question.correctIndices,
      acceptableAnswers: question.acceptableAnswers,
      explanation: question.explanation,
      generationHash,
      reviewStatus: "generated" as const,
      pattern: question.reasoningPattern,
      applicationLevel: question.applicationLevel,
      estimatedSteps: question.estimatedSteps,
    };
  });
  const existing = await db.select({ id: aiQuestionBank.id, generationHash: aiQuestionBank.generationHash }).from(aiQuestionBank).where(inArray(aiQuestionBank.id, rows.map((row) => row.id)));
  const existingById = new Map(existing.map((row) => [row.id, row.generationHash]));
  for (const row of rows) {
    const existingHash = existingById.get(row.id);
    if (existingHash && existingHash !== row.generationHash) throw new Error(`QUIZ_DRAFT_CONFLICT:${row.id}`);
  }
  const pendingRows = rows.filter((row) => !existingById.has(row.id));
  if (pendingRows.length > 0) {
    await db.transaction(async (tx) => {
      await tx.insert(aiQuestionBank).values(pendingRows);
    });
  }
  return {
    ok: true,
    valid: true,
    staged: true,
    draftId: draft.draftId,
    questionCount: rows.length,
    createdCount: pendingRows.length,
    existingCount: rows.length - pendingRows.length,
    issues,
    next: "admin_review",
  };
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

  (server as any).registerTool("assessment.validate_quiz_draft", {
    title: "Validate quiz bank draft",
    description: "Memeriksa draft soal kuis secara terstruktur sebelum masuk ke review bank soal.",
    inputSchema: {
      runToken: z.string().min(1),
      draftJson: z.string().min(1).max(8 * 1024 * 1024),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, draftJson }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    if (run.workflow !== "quiz_bank") return { ok: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(draftJson);
    } catch {
      return { ok: false, valid: false, issues: [{ code: "QUIZ_DRAFT_INVALID_JSON", message: "Draft JSON tidak valid" }] };
    }
    const draft = quizDraftSchema.safeParse(parsed);
    if (!draft.success) {
      return { ok: false, valid: false, issues: draft.error.issues.map((issue) => ({ code: "QUIZ_DRAFT_SCHEMA_INVALID", message: issue.message, path: issue.path.join(".") })) };
    }
    const checks = await Promise.all(draft.data.questions.map(async (question) => ({
      id: question.id,
      result: await validateQuestion(question),
    })));
    const issues = checks.flatMap((check) => [
      ...check.result.errors.map((message) => ({ code: "QUIZ_DRAFT_INVALID", message, path: check.id })),
      ...check.result.warnings.map((message) => ({ code: "QUIZ_DRAFT_WARNING", message, path: check.id })),
    ]);
    const errors = checks.reduce((total, check) => total + check.result.errors.length, 0);
    return {
      ok: errors === 0,
      valid: errors === 0,
      draftId: draft.data.draftId,
      questionCount: draft.data.questions.length,
      issues,
      next: errors === 0 ? "admin_review" : "agent_revision",
    };
  }));

  (server as any).registerTool("assessment.submit_quiz_draft", {
    title: "Submit quiz bank draft for review",
    description: "Memvalidasi lalu menaruh draft soal kuis sebagai generated di bank soal. Tool ini tidak dapat mempublikasikan soal.",
    inputSchema: {
      runToken: z.string().min(1),
      draftJson: z.string().min(1).max(8 * 1024 * 1024),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, draftJson }: any) => safeTool(async () => {
    const run = readMcpRunToken(runToken);
    if (run.workflow !== "quiz_bank") return { ok: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(draftJson);
    } catch {
      return { ok: false, valid: false, staged: false, issues: [{ code: "QUIZ_DRAFT_INVALID_JSON", message: "Draft JSON tidak valid" }] };
    }
    const draft = quizDraftSchema.safeParse(parsed);
    if (!draft.success) return { ok: false, valid: false, staged: false, issues: draft.error.issues.map((issue) => ({ code: "QUIZ_DRAFT_SCHEMA_INVALID", message: issue.message, path: issue.path.join(".") })) };
    return stageQuizDraft(principal, runToken, draft.data);
  }));
}

export function createAuthoringMcpServer(principal: McpPrincipal): McpServer {
  const server = new McpServer({ name: "zyx-authoring", version: "1.0.0" }, { capabilities: { tools: {} } });
  registerWorkflowTools(server, principal);
  registerValidationTools(server, principal);
  return server;
}
