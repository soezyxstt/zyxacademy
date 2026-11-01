import { sourceReadJob } from "@/lib/authoring/source-read-jobs";
import { sourcePageMetadata } from "@/lib/authoring/source-page-metadata";
import { readSourceFileMetadata } from "@/lib/authoring/source-file-metadata";
import { resolveStoredSourceFile } from "@/lib/authoring/mcp-source-files";
import { isSourceReadTimeout, timePdfStage } from "@/lib/compute/pdf-read-options";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAuthoringSkills } from "./mcp-skills";
import { registerProductV4Tools } from "./mcp-v4-tools";
import { computeProductV4VerificationContentHash } from "@/lib/bundle/product-v4-verification";
import { computeProductV4SectionSemanticHash, productV4ReviewContextShape } from "@/lib/bundle/product-v4-review";
import type { SkillCatalogProfile } from "./skill-catalog";
import { z } from "zod";
import { createHash } from "node:crypto";
import { storage, type StorageProvider } from "@/lib/storage";
import { buildSourcePageImageKey } from "@/lib/storage/keys";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiQuestionBank, asalIde, artikel, artikelIde, assessmentSources, bab, bagianArtikel, blokArtikel, buktiPdfBundle, diktatIde, diktatMateri, flashcard, flashcardIde, ide, ketergantunganProduk, mataKuliah, pembahasanSoal, potonganSumber, questionReferenceLinks, relasiIde, reviewPedagogiBundle, setFlashcard, soal, soalIde, soalItbReferensi, sumberMateri } from "@/db/schema";
import { normalizeDate } from "@/lib/date-utils";
import { serializeDeterministically, validateIdeaBundleZip, type ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { previewIdeaBundle } from "@/lib/bundle/idea-preview";
import { getIdeaBundleImport, listIdeaBundleImports, reviewIdeaBundle, stageIdeaBundle } from "@/lib/bundle/staging";
import { validateProductBundle } from "@/lib/bundle/product-validator";
import { previewProducts } from "@/lib/bundle/product-preview";
import { discardProductBundleDraft, getProductBundleImport, listProductBundleImports, stageProductBundle } from "@/lib/bundle/product-staging";
import {
  getSourcePackImport,
  listSourcePackImports,
  normalizeSourcePackChecksum,
  readStoredSourcePack,
  readStoredSourcePackDocument,
  reconcileSourcePackChecksums,
  reconcileSourcePackImportIds,
  resolveSourcePackImport,
  stageSourcePack,
} from "@/lib/bundle/source-staging";
import { validateSourcePack } from "@/lib/authoring/source-pack";
import { withdrawProductBundle } from "@/lib/bundle/product-publication";
import { isStructuredArticleReaderEnabled } from "@/lib/articles/feature";
import { evaluateIdeaBundleQuality } from "@/lib/authoring/quality/idea-bundle";
import {
  evaluateProductBundleQualityPolicy,
  evaluateProductBundleReviewAndPdfGate,
} from "@/lib/bundle/product-review-gate";
import { executePedagogicReview } from "@/lib/bundle/product-pedagogic-review";
import {
  QUALITY_POLICY_VERSION,
  pedagogicRubricItemSchema,
  pedagogicExceptionSchema,
  type DiagnosticIssue,
} from "@/lib/materials/quality-policy";
import {
  type PdfArtifactEvidence,
} from "@/lib/materials/pdf-artifact-contract";
import { sha256Text } from "@/lib/bundle/validator";
import { createCanonicalQuestionBatch, createHistoricalQuestionBatch, QuestionAuthoringError, updateCanonicalQuestion, validateCanonicalQuestionBatch } from "@/lib/question-authoring";
import { questionAuthoringQuestionSchema, questionIdeaLinkSchema } from "@/lib/question-authoring-contract";
import { normalizeQuestionBankDraft, parseQuestionBankDraftJson, type NormalizedQuestionBankDraft } from "@/lib/authoring/question-bank-draft";
import {
  computeIdeaFacets,
  filterIdeaRecords,
  matchesIdeaFilters,
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
  parseReferenceQuestionDraftJson,
  validateReferenceQuestionDraft,
  type ReferenceQuestionDraft,
} from "@/lib/authoring/reference-question-draft";
import {
  AUTHORING_MCP_MAX_BUNDLE_BYTES,
  AUTHORING_MCP_MAX_ORIGINAL_BYTES,
  AUTHORING_MCP_MAX_SOURCE_PACK_BYTES,
  authoringWorkflowSchema,
  decodeMcpArtifact,
  getMcpPlaybook,
  ingestMcpSourcePack,
  issueSourcePackToken,
  listAuthoringWorkflows,
  listMcpChapterChoices,
  listMcpCourseChoices,
  publicMcpRun,
  readMcpCatalogScope,
  readMcpCourseChoice,
  readMcpRunToken,
  readMcpSourcePackToken,
  startAuthoringWorkflow,
  verifyMcpExecutionBootstrap,
  workflowContract,
  quizBankScopeGuidance,
} from "@/lib/authoring/mcp-workflows";
import {
  authoringMcpSkillSchema,
  authoringPlaybookModuleKeySchema,
  authoringPlaybookStageSchema,
  clientCapabilitiesSchema,
  resolveAuthoringMcpEnvironment,
} from "@/lib/authoring/mcp-playbook";
import { requireMcpScope, type McpPrincipal } from "@/lib/authoring/mcp-auth";
import {
  createQuizWithQuestions,
  getQuizDetail,
  listQuizzes,
  updateQuizMeta,
  setQuizQuestions,
} from "@/lib/authoring/quiz-assembly";
import {
  listStoredSourceFiles,
  listStoredReferenceFiles,
  getStoredReferenceSourceFile,
  loadStoredOriginals,
  mergeSourceOriginals,
  normalizeSha256Checksum,
  readStoredSourceFile,
} from "@/lib/authoring/mcp-source-files";

type ToolPayload = Record<string, unknown>;

type ExtraToolContent =
  | { type: "text"; text: string }
  | { type: "resource_link"; uri: string; name: string; mimeType: "image/png" }
  | { type: "resource"; resource: { uri: string; mimeType: "application/pdf"; blob: string } };

function serializeMcpTimestamp(value: Date | number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return normalizeDate(value).toISOString();
}

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

function redactSensitiveDetails(text: string): string {
  if (!text) return "";
  return text
    .replace(/(?:overhaul|courses|uploads|blog|forms|pka|media|zyx-attachments)\/[^\s"']+/gi, "[storage-key-redacted]")
    .replace(/(?:password|secret|token|credential)\s*[:=]\s*[^\s,]+/gi, "$1=[redacted]");
}

function toolError(error: unknown) {
  const message = isSourceReadTimeout(error) ? "SOURCE_READ_TIMEOUT" : error instanceof Error ? error.message : "AUTHORING_MCP_REQUEST_FAILED";
  const firstLine = message.split("\n")[0] ?? "AUTHORING_MCP_REQUEST_FAILED";
  const [rawCode, ...details] = firstLine.split(":");
  const code = redactSensitiveDetails(rawCode.slice(0, 120)).trim();
  const rawDetail = details.join(":").slice(0, 600);
  const detail = rawDetail ? redactSensitiveDetails(rawDetail).trim() : undefined;
  const issues = (error as any)?.issues;
  const safeIssues = Array.isArray(issues) ? issues.map((iss: any) => ({
    code: redactSensitiveDetails(String(iss.code ?? "")),
    severity: iss.severity === "warning" ? "warning" : "blocking",
    target: {
      targetType: iss.target?.targetType ?? "document",
      targetId: redactSensitiveDetails(String(iss.target?.targetId ?? "")),
    },
    reason: redactSensitiveDetails(String(iss.reason ?? "")),
    remediation: redactSensitiveDetails(String(iss.remediation ?? "")),
  })) : undefined;
  return toolResult({ ok: false, error: code, detail: detail || undefined, ...(safeIssues ? { issues: safeIssues } : {}) }, true);
}

export async function formatSourceFileReadResult(
  result: Awaited<ReturnType<typeof readStoredSourceFile>>,
  imageStorage: Pick<StorageProvider, "upload" | "getUrl"> & Partial<Pick<StorageProvider, "exists">> = storage,
) {
  const safeChecksum = normalizeSha256Checksum(result.checksum);
  const safeSize = typeof result.size === "number" && Number.isFinite(result.size) && result.size > 0 ? result.size : null;
  if (result.mode === "blob") {
    const payload = {
      ok: true,
      mode: result.mode,
      title: result.title,
      checksum: safeChecksum,
      size: safeSize,
      mimeType: "application/pdf",
    };
    return toolResult(payload, false, [{
      type: "resource",
      resource: {
        uri: `zyx-authoring://stored-pdf/${safeChecksum ?? "unverified"}`,
        mimeType: "application/pdf",
        blob: Buffer.from(result.bytes).toString("base64"),
      },
    }]);
  }
  if (!safeChecksum) throw new Error("AUTHORING_MCP_SOURCE_IMAGE_CHECKSUM_REQUIRED");
  const pages = [];
  for (const page of result.pages) {
    const metadata = sourcePageMetadata(page.pageNumber, page.text, result.representation === "image");
    const { textQuality, ...pageLocation } = metadata;
    const citation = { title: result.title, pageNumber: page.pageNumber, documentChecksum: safeChecksum, ...pageLocation,
      label: `Sumber: ${result.title}, halaman PDF ${page.pageNumber}` };
    if (result.representation === "text") {
      pages.push({ pageNumber: page.pageNumber, text: page.text, textQuality, citation });
      continue;
    }
    const imageChecksum = createHash("sha256").update(page.png).digest("hex");
    const key = page.imageKey ?? buildSourcePageImageKey({
      ...result.imageSource,
      documentChecksum: safeChecksum,
      imageChecksum,
      pageNumber: page.pageNumber,
    });
    if (!page.imageKey && (!imageStorage.exists || !await imageStorage.exists(key))) {
      await imageStorage.upload(page.png, key.split("/").pop()!, "image/png", {
        key,
        metadata: { "document-sha256": safeChecksum, "page-number": String(page.pageNumber) },
      });
    }
    pages.push({
      pageNumber: page.pageNumber,
      ...(result.representation === "image" ? {} : { text: page.text }),
      textQuality,
      width: page.width,
      height: page.height,
      imageUrl: new URL(imageStorage.getUrl(key), resolveAuthBaseUrl()).href,
      citation,
    });
  }
  const payload = {
    ok: true,
    mode: result.mode,
    title: result.title,
    checksum: safeChecksum,
    size: safeSize,
    totalPages: result.totalPages,
    pages,
  };
  return toolResult(payload, false, pages.flatMap((page) => "imageUrl" in page ? [{
    type: "resource_link" as const,
    uri: page.imageUrl,
    name: page.citation.label,
    mimeType: "image/png" as const,
  }] : []));
}

function chunkValues<T>(values: readonly T[], size = 200): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function runScope(run: ReturnType<typeof readMcpRunToken>) {
  return run.chapterLabel ? { course: run.courseLabel, chapter: run.chapterLabel } : { course: run.courseLabel };
}

function requireReferenceWorkflow(runToken: string) {
  const run = readMcpRunToken(runToken);
  if (run.workflow !== "reference_question_ingest" || run.chapterId || run.chapterLabel || run.sourcePackId) {
    throw new Error("AUTHORING_MCP_WORKFLOW_MISMATCH");
  }
  return run;
}

function requireHistoricalReadWorkflow(runToken: string) {
  const run = readMcpRunToken(runToken);
  if (run.workflow === "reference_question_ingest") return requireReferenceWorkflow(runToken);
  if (run.workflow === "quiz_bank") return run;
  throw new Error("AUTHORING_MCP_WORKFLOW_MISMATCH");
}

async function resolveReferenceCourse(run: ReturnType<typeof readMcpRunToken>) {
  const [course] = await db
    .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
    .from(mataKuliah)
    .where(and(eq(mataKuliah.id, run.courseId), eq(mataKuliah.status, "active")))
    .limit(1);
  if (!course || !course.legacyCourseId) throw new Error("AUTHORING_MCP_COURSE_NOT_FOUND");
  return course;
}

async function resolveReferenceDraftContext(run: ReturnType<typeof readMcpRunToken>, draft: ReferenceQuestionDraft) {
  const course = await resolveReferenceCourse(run);
  const source = await getStoredReferenceSourceFile(draft.source.sourceFileKey);
  if (source.row.courseId !== course.legacyCourseId || source.row.type !== "soal") throw new Error("AUTHORING_MCP_SOURCE_FILE_NOT_IN_SCOPE");
  if (source.metadata.title !== draft.source.title) throw new Error("HISTORICAL_SOURCE_TITLE_MISMATCH");
  let solution: Awaited<ReturnType<typeof getStoredReferenceSourceFile>> | null = null;
  if (draft.source.solutionFileKey) {
    solution = await getStoredReferenceSourceFile(draft.source.solutionFileKey);
    if (solution.row.courseId !== course.legacyCourseId || solution.row.type !== "pembahasan_soal") throw new Error("AUTHORING_MCP_SOURCE_FILE_NOT_IN_SCOPE");
  }
  const ideaIds = [...new Set(draft.questions.flatMap((question) => question.ideaLinks.map((link) => link.ideaId)))];
  const ideas = ideaIds.length > 0
    ? await db.select({ id: ide.id, courseId: ide.mataKuliahId, chapterId: ide.babId, status: ide.status }).from(ide).where(inArray(ide.id, ideaIds))
    : [];
  return {
    course,
    source,
    solution,
    ideas: new Map(ideas.map((idea) => [idea.id, idea])),
  };
}

function ideaStageItems(bundle: ValidatedIdeaBundle) {
  return [
    ...bundle.entities.sourceMaterials.map((entity) => ({ entityType: "source_material", entityId: entity.id, entityVersion: entity.version, entityHash: sha256Text(serializeDeterministically(entity)) })),
    ...bundle.entities.sourceChunks.map((entity) => ({ entityType: "source_chunk", entityId: entity.id, entityVersion: entity.sourceVersion, entityHash: sha256Text(serializeDeterministically(entity)) })),
    ...bundle.entities.ideas.map((entity) => ({ entityType: "idea", entityId: entity.id, entityVersion: entity.version, entityHash: sha256Text(serializeDeterministically(entity)) })),
    ...bundle.entities.provenance.map((entity) => ({ entityType: "provenance", entityId: entity.id, entityVersion: 1, entityHash: sha256Text(serializeDeterministically(entity)) })),
    ...bundle.entities.relations.map((entity) => ({ entityType: "relation", entityId: entity.id, entityVersion: entity.version, entityHash: sha256Text(serializeDeterministically(entity)) })),
    ...bundle.entities.learningSections.map((entity) => ({ entityType: "learning_section", entityId: entity.id, entityVersion: 1, entityHash: sha256Text(serializeDeterministically(entity)) })),
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

function validateProductAssessmentBoundary(bundle: Extract<ReturnType<typeof validateProductBundle>, { success: true }>['data']): DiagnosticIssue[] {
  return bundle.products
    .filter((product) => product.productType === "question" || product.productType === "solution" || product.productType === "assessment_blueprint")
    .map((product) => ({
      code: "PRODUCT_BUNDLE_ASSESSMENT_FORBIDDEN",
      severity: "blocking" as const,
      target: { targetType: "document" as const, targetId: `entities/products.json:${product.id}` },
      reason: `Product ${product.id} has assessment type '${product.productType}', which is not allowed in a new Product Bundle MCP submission.`,
      remediation: "Move original questions to quiz_bank or historical questions to reference_question_ingest. Keep Product Bundle outputs to article, diktat, flashcard_set, and flashcard.",
    }));
}

async function validateIdeaDbConflicts(
  run: ReturnType<typeof readMcpRunToken>,
  bundle: ValidatedIdeaBundle,
): Promise<{ valid: boolean; issues: { code: string; message: string; path: string }[]; warnings: string[] }> {
  const issues: { code: string; message: string; path: string }[] = [];
  const warnings: string[] = [];

  const sourceIds = bundle.entities.sourceMaterials.map((s) => s.id);
  if (sourceIds.length > 0) {
    for (const source of bundle.entities.sourceMaterials) {
      if (/^source-doc-\d+$/i.test(source.id)) {
        warnings.push(`Source material ID '${source.id}' is unscoped. Prefer a chapter-scoped format such as 'source-doc-${run.chapterId}-${source.id}'.`);
      }
    }
    for (const chunk of chunkValues(sourceIds)) {
      const existingSources = await db
        .select({ id: sumberMateri.id, babId: sumberMateri.babId, mataKuliahId: sumberMateri.mataKuliahId, checksum: sumberMateri.checksum, version: sumberMateri.version })
        .from(sumberMateri)
        .where(inArray(sumberMateri.id, chunk));

      const existingMap = new Map(existingSources.map((s) => [s.id, s]));
      for (const source of bundle.entities.sourceMaterials) {
        const existing = existingMap.get(source.id);
        if (existing) {
          if (existing.babId !== run.chapterId) {
            issues.push(scopeIssue(
              "IDEA_BUNDLE_SOURCE_VERSION_CONFLICT",
              `Source material '${source.id}' already exists in chapter '${existing.babId}' but this bundle is for chapter '${run.chapterId}'. Use a chapter-scoped ID.`,
              `entities/source_materials.json:${source.id}`,
            ));
          } else if (existing.mataKuliahId !== run.courseId) {
            issues.push(scopeIssue(
              "IDEA_BUNDLE_SOURCE_VERSION_CONFLICT",
              `Source material '${source.id}' already exists in course '${existing.mataKuliahId}' but this bundle is for course '${run.courseId}'.`,
              `entities/source_materials.json:${source.id}`,
            ));
          } else if (existing.checksum !== source.checksum || existing.version !== source.version) {
            issues.push(scopeIssue(
              "IDEA_BUNDLE_SOURCE_VERSION_CONFLICT",
              `Source material '${source.id}' already exists with different checksum or version.`,
              `entities/source_materials.json:${source.id}`,
            ));
          }
        }
      }
    }
  }

  const chunkIds = bundle.entities.sourceChunks.map((c) => c.id);
  if (chunkIds.length > 0) {
    for (const chunk of bundle.entities.sourceChunks) {
      if (/^chunk-\d+$/i.test(chunk.id)) {
        warnings.push(`Source chunk ID '${chunk.id}' is unscoped. Prefer a chapter-scoped format such as 'chunk-${run.chapterId}-${chunk.id}'.`);
      }
    }
    for (const chunkBatch of chunkValues(chunkIds)) {
      const existingChunks = await db
        .select({ id: potonganSumber.id, sumberMateriId: potonganSumber.sumberMateriId, checksum: potonganSumber.checksum })
        .from(potonganSumber)
        .where(inArray(potonganSumber.id, chunkBatch));

      const existingMap = new Map(existingChunks.map((c) => [c.id, c]));
      for (const chunk of bundle.entities.sourceChunks) {
        const existing = existingMap.get(chunk.id);
        if (existing) {
          if (existing.sumberMateriId !== chunk.sourceMaterialId || existing.checksum !== chunk.checksum) {
            issues.push(scopeIssue(
              "IDEA_BUNDLE_SOURCE_CHUNK_CONFLICT",
              `Source chunk '${chunk.id}' already exists pointing to different material '${existing.sumberMateriId}' or has different checksum. Use a chapter-scoped ID.`,
              `entities/source_chunks.json:${chunk.id}`,
            ));
          }
        }
      }
    }
  }

  const provIds = bundle.entities.provenance.map((p) => p.id);
  if (provIds.length > 0) {
    for (const prov of bundle.entities.provenance) {
      if (/^prov-\d+$/i.test(prov.id)) {
        warnings.push(`Provenance ID '${prov.id}' is unscoped. Prefer a chapter-scoped format such as 'prov-${run.chapterId}-${prov.id}'.`);
      }
    }
    for (const chunk of chunkValues(provIds)) {
      const existingProvs = await db
        .select({ id: asalIde.id, ideId: asalIde.ideId, sourceChunkId: asalIde.sourceChunkId })
        .from(asalIde)
        .where(inArray(asalIde.id, chunk));

      const existingMap = new Map(existingProvs.map((p) => [p.id, p]));
      for (const prov of bundle.entities.provenance) {
        const existing = existingMap.get(prov.id);
        if (existing) {
          if (existing.ideId !== prov.ideaId || existing.sourceChunkId !== prov.sourceChunkId) {
            issues.push(scopeIssue(
              "IDEA_BUNDLE_PROVENANCE_CONFLICT",
              `Provenance record '${prov.id}' already exists pointing to different idea '${existing.ideId}' or chunk '${existing.sourceChunkId}'. Use a chapter-scoped ID.`,
              `entities/provenance.json:${prov.id}`,
            ));
          }
        }
      }
    }
  }

  const relIds = bundle.entities.relations.map((r) => r.id);
  if (relIds.length > 0) {
    for (const rel of bundle.entities.relations) {
      if (/^rel-\d+$/i.test(rel.id)) {
        warnings.push(`Relation ID '${rel.id}' is unscoped. Prefer a chapter-scoped format such as 'rel-${run.chapterId}-${rel.id}'.`);
      }
    }
    for (const chunk of chunkValues(relIds)) {
      const existingRels = await db
        .select({ id: relasiIde.id, sourceIdeaId: relasiIde.sourceIdeaId, targetIdeaId: relasiIde.targetIdeaId, relationType: relasiIde.relationType })
        .from(relasiIde)
        .where(inArray(relasiIde.id, chunk));

      const existingMap = new Map(existingRels.map((r) => [r.id, r]));
      for (const rel of bundle.entities.relations) {
        const existing = existingMap.get(rel.id);
        if (existing) {
          if (existing.sourceIdeaId !== rel.sourceIdeaId || existing.targetIdeaId !== rel.targetIdeaId || existing.relationType !== rel.relationType) {
            issues.push(scopeIssue(
              "IDEA_BUNDLE_RELATION_CONFLICT",
              `Relation record '${rel.id}' already exists with different source/target or relation type. Use a chapter-scoped ID.`,
              `entities/relations.json:${rel.id}`,
            ));
          }
        }
      }
    }
  }

  return { valid: issues.length === 0, issues, warnings };
}

async function validateProductDbReferences(
  run: ReturnType<typeof readMcpRunToken>,
  bundle: Extract<ReturnType<typeof validateProductBundle>, { success: true }>['data'],
): Promise<{ valid: boolean; issues: { code: string; message: string; path: string }[] }> {
  const issues: { code: string; message: string; path: string }[] = [];
  const questionProducts = bundle.products.filter((p) => p.productType === "question");

  if (questionProducts.length > 0) {
    const itbRefIds = [
      ...new Set(
        questionProducts.flatMap((p: any) => [
          p.itbSource?.referenceId,
          ...(p.itbCuration?.map((c: any) => c.referenceId) ?? []),
        ]).filter(Boolean),
      ),
    ];

    if (itbRefIds.length > 0) {
      for (const chunk of chunkValues(itbRefIds)) {
        const existingRefs = await db
          .select({ id: soalItbReferensi.id, authoringVisibility: soalItbReferensi.authoringVisibility })
          .from(soalItbReferensi)
          .where(inArray(soalItbReferensi.id, chunk));

        const existingMap = new Map(existingRefs.map((r) => [r.id, r]));
        for (const refId of chunk) {
          const existing = existingMap.get(refId);
          if (!existing) {
            issues.push(scopeIssue(
              "PRODUCT_ITB_REFERENCE_MISSING",
              `ITB reference '${refId}' does not exist in staging database. For standalone quiz bank authoring, use the 'zyx-question-authoring-mcp' workflow instead.`,
              `entities/products.json:${refId}`,
            ));
          } else if (existing.authoringVisibility !== "allowed") {
            issues.push(scopeIssue(
              "PRODUCT_ITB_REFERENCE_NOT_ALLOWED",
              `ITB reference '${refId}' is not allowed for authoring.`,
              `entities/products.json:${refId}`,
            ));
          }
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

function questionIdForRun(runId: string, externalId: string): string {
  return `mcp-q-${sha256Text(`${runId}:${externalId}`).slice(0, 32)}`;
}

/**
 * Constructs a canonical question batch input with published review status from an active run token and normalized draft.
 *
 * @param run - The validated MCP run token containing courseId and chapterId.
 * @param draft - The normalized question bank draft.
 * @returns Canonical batch payload ready for persistence.
 */
function canonicalBatchForRun(run: ReturnType<typeof readMcpRunToken>, draft: NormalizedQuestionBankDraft) {
  return {
    courseId: run.courseId,
    chapterId: run.chapterId,
    reviewStatus: "published" as const,
    items: draft.items.map((item) => ({
      questionId: questionIdForRun(run.runId, item.externalId),
      question: item.question,
      ideaLinks: item.ideaLinks,
      referenceLinks: item.referenceLinks,
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

async function validateQuestionBankDraft(
  principal: McpPrincipal,
  runToken: string,
  draft: NormalizedQuestionBankDraft,
  bootstrapToken?: string,
) {
  const run = readMcpRunToken(runToken);
  if (run.workflow !== "quiz_bank") return { ok: false, valid: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
  verifyMcpExecutionBootstrap({
    actorId: principal.actorId,
    sessionId: principal.sessionId,
    bootstrapToken,
    run,
    requiredStage: "quiz",
    expectedWorkflow: "quiz_bank",
  });
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

async function stageQuestionBankDraft(
  principal: McpPrincipal,
  runToken: string,
  draft: NormalizedQuestionBankDraft,
  bootstrapToken?: string,
) {
  requireMcpScope(principal, "authoring:stage");
  const run = readMcpRunToken(runToken);
  if (run.workflow !== "quiz_bank") return { ok: false, valid: false, staged: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
  verifyMcpExecutionBootstrap({
    actorId: principal.actorId,
    sessionId: principal.sessionId,
    bootstrapToken,
    run,
    requiredStage: "quiz",
    expectedWorkflow: "quiz_bank",
  });
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

const REVIEW_AND_PDF_GATE_CODES = new Set([
  "PEDAGOGIC_REVIEW_MISSING",
  "POLICY_VERSION_MISMATCH",
  "FINGERPRINT_MISMATCH",
  "REVIEWER_CONTEXT_MISMATCH",
  "PEDAGOGIC_REVIEW_REJECTED",
  "PEDAGOGIC_REVIEW_CHANGES_REQUESTED",
  "PEDAGOGIC_REVIEW_PENDING",
  "PEDAGOGIC_REVIEW_NOT_APPROVED",
  "RUBRIC_CRITERION_DUPLICATE",
  "RUBRIC_CRITERION_UNANCHORED",
  "RUBRIC_CRITERION_MISSING",
  "RUBRIC_CRITERION_NOT_MET",
  "EXCEPTION_WITHOUT_REASON",
  "PDF_EVIDENCE_MISSING",
  "PDF_EVIDENCE_PENDING",
  "PDF_EVIDENCE_FAILED",
  "PDF_EVIDENCE_STALE",
  "PDF_EVIDENCE_NOT_READY",
  "PDF_LINEAGE_HASH_MISMATCH",
  "PDF_RENDERER_METADATA_MISSING",
  "PDF_PROFILE_METADATA_MISSING",
  "PDF_STORAGE_KEY_MISSING",
  "PDF_PAGE_COUNT_MISSING",
  "PDF_PAGE_BUDGET_EXCEEDED",
  "PDF_FAILURE_CODE_UNEXPECTED",
  "PDF_FAILURE_CODE_MISSING",
]);

type PedagogicReviewSummaryRow = {
  id: string;
  status: "pending" | "approved" | "rejected" | "changes_requested" | string;
  policyVersion: string;
  contentFingerprint: string;
  rubric: unknown;
  exceptions: unknown;
  notes: string | null;
  createdAt: Date | number | string;
};

type PdfEvidenceSummaryRow = typeof buktiPdfBundle.$inferSelect;

function formatSnapshotValidationReport(
  validationReport: Record<string, unknown> | null,
  createdAt: Date | number | string,
): Record<string, unknown> | null {
  if (!validationReport) return null;
  const snapshotAt = serializeMcpTimestamp(createdAt);
  const quality = typeof validationReport.quality === "object" && validationReport.quality !== null
    ? { ...(validationReport.quality as Record<string, unknown>), snapshotAt }
    : undefined;
  return {
    ...validationReport,
    snapshotAt,
    ...(quality ? { quality } : {}),
  };
}

function computeCurrentProductImportReadiness(
  row: {
    id: string;
    status: string;
    validationReport: Record<string, unknown> | null;
    items?: ReadonlyArray<{ entityType: string; entityId: string; entityVersion: number; entityHash: string; status: string }>;
  },
  pedReviews: readonly PedagogicReviewSummaryRow[] = [],
  pdfEvidenceRows: readonly PdfEvidenceSummaryRow[] = [],
) {
  const evaluatedAt = new Date().toISOString();
  const report = (row.validationReport ?? {}) as Record<string, unknown>;
  const quality = (typeof report.quality === "object" && report.quality !== null ? report.quality : {}) as Record<string, unknown>;
  const contentFingerprint = typeof report.contentFingerprint === "string"
    ? report.contentFingerprint
    : typeof quality.contentFingerprint === "string"
      ? quality.contentFingerprint
      : "";
  const rawSavedIssues = Array.isArray(quality.issues)
    ? (quality.issues as DiagnosticIssue[])
    : Array.isArray(report.issues)
      ? (report.issues as DiagnosticIssue[])
      : [];
  const deterministicIssues = rawSavedIssues.filter((issue) => !REVIEW_AND_PDF_GATE_CODES.has(issue.code));
  const deterministicBlocking = deterministicIssues.filter((issue) => issue.severity === "blocking");
  const valid = deterministicBlocking.length === 0 && report.valid !== false && quality.valid !== false;

  const articleItem = row.items?.find((item) => item.entityType === "article");
  const diktatItem = row.items?.find((item) => item.entityType === "diktat");
  const articleCount = typeof report.articleCount === "number"
    ? report.articleCount
    : typeof (quality.metrics as Record<string, unknown> | undefined)?.articleCount === "number"
      ? Number((quality.metrics as Record<string, unknown>).articleCount)
      : articleItem
        ? 1
        : contentFingerprint
          ? 1
          : 0;
  const hasArticle = articleCount > 0 || Boolean(articleItem) || Boolean(contentFingerprint);
  const articleTargetId = (typeof report.articleId === "string" && report.articleId ? report.articleId : null)
    ?? articleItem?.entityId
    ?? rawSavedIssues.find((issue) => issue.target?.targetType === "rubric")?.target.targetId
    ?? row.id;
  const diktatTargetId = (typeof report.diktatId === "string" && report.diktatId ? report.diktatId : null)
    ?? diktatItem?.entityId
    ?? null;

  const expectedArticleGenHash = typeof report.articleGenerationHash === "string"
    ? report.articleGenerationHash
    : typeof (quality as Record<string, unknown>).articleGenerationHash === "string"
      ? String((quality as Record<string, unknown>).articleGenerationHash)
      : null;
  const expectedDiktatGenHash = typeof report.diktatGenerationHash === "string"
    ? report.diktatGenerationHash
    : typeof (quality as Record<string, unknown>).diktatGenerationHash === "string"
      ? String((quality as Record<string, unknown>).diktatGenerationHash)
      : null;

  const gateEval = evaluateProductBundleReviewAndPdfGate({
    imporBundleId: row.id,
    bundleStatus: row.status,
    hasArticle,
    articleId: articleTargetId,
    diktatId: diktatTargetId,
    contentFingerprint,
    articleGenerationHash: expectedArticleGenHash,
    diktatGenerationHash: expectedDiktatGenHash,
    reviewRows: pedReviews.map((r) => ({
      id: r.id,
      imporBundleId: row.id,
      status: r.status,
      policyVersion: r.policyVersion,
      contentFingerprint: r.contentFingerprint,
      rubric: r.rubric,
      exceptions: r.exceptions,
      notes: r.notes,
    })),
    pdfEvidenceRows: pdfEvidenceRows.map((e) => ({
      id: e.id,
      imporBundleId: e.imporBundleId,
      productId: e.productId,
      articleVersion: e.articleVersion,
      articleHash: e.articleHash,
      diktatHash: e.diktatHash,
      rendererVersion: e.rendererVersion,
      printProfile: e.printProfile,
      status: e.status,
      storageKey: e.storageKey ?? undefined,
      pageCount: e.pageCount ?? undefined,
      failureCode: (e.failureCode as PdfArtifactEvidence["failureCode"]) ?? undefined,
    })),
  });

  const issues: DiagnosticIssue[] = [...deterministicIssues, ...gateEval.issues];
  const blockingIssues = issues.filter((issue) => issue.severity === "blocking");
  const publicationReady = valid && blockingIssues.length === 0;

  return {
    evaluatedAt,
    valid,
    publicationReady,
    policyVersion: QUALITY_POLICY_VERSION,
    contentFingerprint,
    reviewStatus: gateEval.reviewStatus,
    pdfEvidenceStatus: gateEval.pdfEvidenceStatus,
    issues,
    blockingIssueCodes: blockingIssues.map((issue) => issue.code),
  };
}

function publicBundleImport(
  row: NonNullable<Awaited<ReturnType<typeof getIdeaBundleImport>> | Awaited<ReturnType<typeof getProductBundleImport>>>,
  pedReviews: Array<PedagogicReviewSummaryRow> = [],
  pdfEvidenceRows: Array<PdfEvidenceSummaryRow> = [],
) {
  const isProduct = row.bundleType === "product";
  const currentReadiness = isProduct
    ? computeCurrentProductImportReadiness(row, pedReviews, pdfEvidenceRows)
    : undefined;
  return {
    importId: row.id,
    bundleId: row.bundleId,
    bundleType: row.bundleType,
    checksum: row.checksum,
    version: row.version,
    status: row.status,
    ...(currentReadiness ? {
      publicationReady: currentReadiness.publicationReady,
      currentReadiness,
    } : {}),
    validationReport: formatSnapshotValidationReport(row.validationReport, row.createdAt),
    createdAt: serializeMcpTimestamp(row.createdAt),
    updatedAt: serializeMcpTimestamp(row.updatedAt),
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
      reviewedAt: serializeMcpTimestamp(review.reviewedAt),
    })),
    ...(isProduct ? {
      pedagogicReviews: pedReviews.map((r) => ({
        status: r.status,
        policyVersion: r.policyVersion,
        contentFingerprint: r.contentFingerprint,
        criteriaCount: Array.isArray((r.rubric as any)?.criteria) ? (r.rubric as any).criteria.length : Array.isArray(r.rubric) ? (r.rubric as any).length : 0,
        notes: r.notes,
        reviewedAt: serializeMcpTimestamp(r.createdAt),
      })),
    } : {}),
  };
}

async function stageIdeaArtifact(input: {
  principal: McpPrincipal;
  runToken: string;
  filename: string;
  bundleBase64: string;
  replaceImportId?: string;
  bootstrapToken?: string;
}) {
  const run = readMcpRunToken(input.runToken);
  if (run.workflow !== "idea_product") return { ok: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
  verifyMcpExecutionBootstrap({
    actorId: input.principal.actorId,
    bootstrapToken: input.bootstrapToken,
    run,
    requiredStage: "idea",
    expectedWorkflow: "idea_product",
  });
  const bytes = decodeMcpArtifact(input.bundleBase64, AUTHORING_MCP_MAX_BUNDLE_BYTES);
  const validation = validateIdeaBundleZip(bytes);
  if (!validation.success) return { ok: false, valid: false, staged: false, filename: input.filename, issues: validation.issues };
  if (isStructuredArticleReaderEnabled() && validation.data.manifest.schemaVersion !== "idea-bundle.v3") {
    return { ok: false, valid: false, staged: false, filename: input.filename, issues: [{ code: "AUTHORING_MCP_IDEA_V3_REQUIRED", message: "Submission baru wajib memakai Idea Bundle V3 saat structured reader aktif.", path: "manifest.json.schemaVersion" }] };
  }
  if (validation.data.manifest.courseId !== run.courseId) return { ok: false, valid: false, staged: false, filename: input.filename, issues: [{ code: "AUTHORING_MCP_COURSE_SCOPE_MISMATCH", message: "Idea Bundle course does not match the locked run scope", path: "manifest.json.courseId" }] };
  const chapterScope = validateIdeaChapterScope(run, validation.data);
  const dbConflicts = await validateIdeaDbConflicts(run, validation.data);
  const quality = evaluateIdeaBundleQuality(validation.data);
  if (!chapterScope.valid || !dbConflicts.valid || !quality.valid) return { ok: false, valid: false, staged: false, filename: input.filename, issues: [...chapterScope.issues, ...dbConflicts.issues, ...quality.issues], warnings: dbConflicts.warnings, quality };
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
      chapterId: run.chapterId ?? validation.data.entities.ideas[0]?.chapterId ?? validation.data.entities.learningSections[0]?.chapterId ?? null,
      chapterTitle: run.chapterLabel ?? validation.data.entities.learningSections[0]?.title ?? null,
      bundleTitle: validation.data.entities.learningSections[0]?.title ?? null,
      warnings: dbConflicts.warnings,
      quality: quality as unknown as Record<string, unknown>,
    },
    filename: input.filename,
    replaceImportId: input.replaceImportId,
  });
  const safeResult = {
    importId: result.importId,
    bundleId: result.bundleId,
    checksum: result.checksum,
    status: result.status,
    created: result.created,
    replaced: Boolean(input.replaceImportId),
    itemCount: result.itemCount,

  };
  return { ok: true, valid: true, staged: true, result: safeResult, warnings: dbConflicts.warnings, quality, next: "admin_review" };
}

async function stageProductArtifact(input: {
  principal: McpPrincipal;
  runToken: string;
  filename: string;
  bundleBase64: string;
  replaceImportId?: string;
  bootstrapToken?: string;
}) {
  const run = readMcpRunToken(input.runToken);
  if (run.workflow !== "idea_product") return { ok: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
  verifyMcpExecutionBootstrap({
    actorId: input.principal.actorId,
    bootstrapToken: input.bootstrapToken,
    run,
    requiredStage: "product",
    expectedWorkflow: "idea_product",
  });
  const bytes = decodeMcpArtifact(input.bundleBase64, AUTHORING_MCP_MAX_BUNDLE_BYTES);
  const validation = validateProductBundle(bytes);
  if (!validation.success) {
    const mappedIssues = validation.issues.map((iss) =>
      productValidationIssueToDiagnostic(iss, input.filename),
    );
    return { ok: false, valid: false, staged: false, publicationReady: false, filename: input.filename, issues: mappedIssues };
  }
  if (isStructuredArticleReaderEnabled() && !["product-bundle.v3", "product-bundle.v4"].includes(validation.data.manifest.schemaVersion)) {
    return {
      ok: false,
      valid: false,
      staged: false,
      publicationReady: false,
      filename: input.filename,
      issues: [{
        code: "AUTHORING_MCP_PRODUCT_V3_REQUIRED",
        severity: "blocking",
        target: { targetType: "document", targetId: "manifest.json.schemaVersion" },
        reason: "Submission baru wajib memakai Product Bundle V3 saat structured reader aktif.",
        remediation: "Use product-bundle.v4 for new authoring; preserve V3 only for an explicit legacy revision.",
      }],
    };
  }
  if (validation.data.manifest.courseId !== run.courseId) {
    return {
      ok: false,
      valid: false,
      staged: false,
      publicationReady: false,
      filename: input.filename,
      issues: [{
        code: "AUTHORING_MCP_COURSE_SCOPE_MISMATCH",
        severity: "blocking",
        target: { targetType: "document", targetId: "manifest.json.courseId" },
        reason: "Product Bundle course does not match the locked run scope",
        remediation: "Ensure bundle manifest courseId matches the active run scope.",
      }],
    };
  }
  const chapterScope = validateProductChapterScope(run, validation.data);
  const assessmentBoundaryIssues = validateProductAssessmentBoundary(validation.data);
  const ideaScope = await validateProductIdeaScope(run, validation.data);
  const dbReferences = await validateProductDbReferences(run, validation.data);
  const scopeIssues: DiagnosticIssue[] = [
    ...assessmentBoundaryIssues,
    ...chapterScope.issues.map((i) => ({ code: i.code, severity: "blocking" as const, target: { targetType: "document" as const, targetId: i.path }, reason: i.message, remediation: "Ensure all products declare and match the locked chapter." })),
    ...ideaScope.issues.map((i) => ({ code: i.code, severity: "blocking" as const, target: { targetType: "idea" as const, targetId: i.path }, reason: i.message, remediation: "Ensure all referenced Ideas are published and in the course scope." })),
    ...dbReferences.issues.map((i) => ({ code: i.code, severity: "blocking" as const, target: { targetType: "document" as const, targetId: i.path }, reason: i.message, remediation: "Ensure all external references exist and are permitted for authoring." })),
  ];

  const policyEvaluation = await evaluateProductBundleQualityPolicy({
    bundle: validation.data,
    dependencies: validation.data.dependencies,
  });

  const allIssues = [...scopeIssues, ...policyEvaluation.issues];
  const deterministicValid = scopeIssues.length === 0 && policyEvaluation.valid;

  if (!deterministicValid) {
    return {
      ok: false,
      valid: false,
      staged: false,
      publicationReady: false,
      filename: input.filename,
      bundleId: validation.data.manifest.bundleId,
      checksum: validation.data.manifest.bundleChecksum,
      policyVersion: policyEvaluation.policyVersion,
      contentFingerprint: policyEvaluation.contentFingerprint,
      issues: allIssues,
      next: "agent_revision",
    };
  }

  if (input.replaceImportId) {
    const target = await getProductBundleImport(input.replaceImportId);
    if (!target) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
    if (target.bundleId !== validation.data.manifest.bundleId) throw new Error("AUTHORING_MCP_IMPORT_BUNDLE_MISMATCH");
    if (target.status !== "draft") throw new Error("PRODUCT_BUNDLE_DRAFT_REQUIRED");
    await assertImportRunScope(target.courseId, run.courseId);
  }

  const rawResult = await stageProductBundle({
    runId: run.runId,
    bundleId: validation.data.manifest.bundleId,
    courseId: run.courseId,
    checksum: validation.data.manifest.bundleChecksum,
    bytes,
    requestedBy: input.principal.actorId,
    bundle: validation.data,
    qualityReport: policyEvaluation as unknown as Record<string, unknown>,
    filename: input.filename,
    preserveUnchangedItemReviews: true,
  });

  if (input.replaceImportId && rawResult.importId !== input.replaceImportId) {
    throw new Error("AUTHORING_MCP_IMPORT_REPLACE_TARGET_MISMATCH");
  }

  const safeResult = {
    importId: rawResult.importId,
    bundleId: rawResult.bundleId,
    checksum: rawResult.checksum,
    status: rawResult.status,
    created: rawResult.created,
    replaced: rawResult.replaced,
    itemCount: rawResult.itemCount,
  };

  return {
    ok: true,
    valid: true,
    staged: true,
    publicationReady: policyEvaluation.publicationReady,
    result: safeResult,
    policyVersion: policyEvaluation.policyVersion,
    contentFingerprint: policyEvaluation.contentFingerprint,
    issues: policyEvaluation.issues,
    metrics: policyEvaluation.metrics,
    next: "admin_review",
  };
}

function productValidationIssueToDiagnostic(
  issue: { code: string; message: string; path?: string },
  filename: string,
): DiagnosticIssue {
  const visualValidationMessage =
    issue.code === "BUNDLE_ENTITY_INVALID" &&
    /(?:xMin must be strictly less than xMax|yMin must be strictly less than yMax|limitPoint .* x bounds|limitValue .* y bounds|delta neighborhood|epsilon band|Forbidden executable or markup pattern)/i.test(
      issue.message,
    );

  return {
    code: visualValidationMessage ? "VISUAL_SPEC_INVALID" : issue.code,
    severity: "blocking",
    target: { targetType: "document", targetId: issue.path || filename },
    reason: issue.message,
    remediation: visualValidationMessage
      ? "Correct the typed visual specification, numeric bounds, and static fallback."
      : "Correct the product bundle ZIP structure or schema according to manifest and entity specifications.",
  };
}

function registerWorkflowTools(server: McpServer, principal: McpPrincipal, traceId?: string): void {
  (server as any).registerTool("workflow.list", {
    title: "List authoring workflows",
    description: "Mengembalikan pilihan workflow authoring. Pilihan sengaja tidak menyediakan opsi gabungan.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => {
    requireMcpScope(principal, "authoring:read");
    return toolResult({ version: "authoring-mcp.v1", workflows: listAuthoringWorkflows(), sourceReader: {
      version: "pdf-reader.v2", representations: ["text", "image", "both"], imageWidth: { min: 320, max: 2048, default: 1280 },
      jobTool: "source.get_read_job", pollingFallback: "Repeat source.read_file with the same arguments if the host tool catalog is stale.",
    } });
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

  (server as any).registerTool("source.list_reference_files", {
    title: "List historical reference files",
    description: "Mengembalikan file soal dan pembahasan tersimpan untuk seluruh mata kuliah pada run historical reference.",
    inputSchema: {
      runToken: z.string().min(1),
      categories: z.array(z.enum(["soal", "pembahasan_soal"])).max(2).optional(),
      cursor: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(100).default(50),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, categories, cursor, limit }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = requireReferenceWorkflow(runToken);
    const course = await resolveReferenceCourse(run);
    if (!course.legacyCourseId) throw new Error("AUTHORING_MCP_LEGACY_COURSE_MAPPING_MISSING");
    return {
      ok: true,
      scope: runScope(run),
      ...(await listStoredReferenceFiles({ courseId: course.id, legacyCourseId: course.legacyCourseId, categories, cursor, limit })),
    };
  }));

  (server as any).registerTool("source.read_file", {
    title: "Read stored PDF",
    description: "Membaca teks PDF secara default. Minta representation image atau both untuk grafik, rumus, atau tata letak, dengan imageWidth 320 sampai 2048 px. Gambar halaman tersimpan di R2 beserta kutipan sumber. Mode pages memerlukan authoring:stage dan mengembalikan jobId jika belum siap. Periksa source.get_read_job. Mode download menyediakan URL biner sementara dengan HTTP Range; blob adalah alias download.",
    inputSchema: {
      fileKey: z.string().min(1),
      mode: z.enum(["pages", "download", "blob"]).default("pages"),
      pages: z.array(z.number().int().positive()).min(1).max(4).optional(),
      representation: z.enum(["text", "image", "both"]).default("text"),
      imageWidth: z.number().int().min(320).max(2048).default(1280),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ fileKey, mode, pages, representation, imageWidth }: any) => {
    const requestId = traceId ?? crypto.randomUUID();
    try {
      requireMcpScope(principal, "authoring:read");
      if (mode === "download" || mode === "blob") {
        const { row, token } = await resolveStoredSourceFile(fileKey);
        if (!storage.getSignedUrl) throw new Error("AUTHORING_MCP_SOURCE_DOWNLOAD_UNSUPPORTED");
        const expectedChecksum = normalizeSha256Checksum(row.checksum);
        const metadata = expectedChecksum ? null : await readSourceFileMetadata({ storageKey: row.fileUrl,
          updatedAtMs: token.updatedAtMs, checksum: expectedChecksum });
        let checksum = expectedChecksum ?? metadata?.checksum ?? null;
        let checksumJobId: string | undefined;
        if (!checksum && principal.scopes.includes("authoring:stage")) {
          try {
            const job = await sourceReadJob({ fileKey, representation: "text", pages: [1], requestId,
              actorId: principal.actorId, sessionId: principal.sessionId });
            if (job.status !== "failed") checksumJobId = job.jobId;
            if (job.status === "complete") checksum = job.result.checksum;
          } catch {
            console.warn(JSON.stringify({ requestId, event: "source.checksum", errorCode: "SOURCE_CHECKSUM_PREPARATION_FAILED" }));
          }
        }
        const url = await timePdfStage(requestId, "download.sign", () => storage.getSignedUrl!(row.fileUrl, "get", "application/pdf", 900));
        return toolResult({ ok: true, requestId, mode: "download", title: row.title, mimeType: "application/pdf",
          url, expiresInSeconds: 900, checksum, checksumStatus: checksum ? "ready" : checksumJobId ? "pending" : "unavailable",
          ...(checksumJobId && !checksum ? { checksumJobId } : {}), supportsRange: true });
      }
      requireMcpScope(principal, "authoring:stage");
      const job = await timePdfStage(requestId, "job.lookup", () => sourceReadJob({ fileKey, pages, representation, imageWidth, requestId,
        actorId: principal.actorId, sessionId: principal.sessionId }));
      if (job.status !== "complete") return toolResult({ ok: true, requestId, ...job });
      const result = job.result;
      return await timePdfStage(requestId, "send.format", async () => {
        const formatted = await formatSourceFileReadResult(result);
        return toolResult({ ...formatted.structuredContent, requestId, jobId: job.jobId }, false, formatted.content.slice(1));
      });
    } catch (error) {
      return toolResult({ ...toolError(error).structuredContent, requestId }, true);
    }
  });

  (server as any).registerTool("source.get_read_job", {
    title: "Get PDF page job",
    description: "Memeriksa hasil job halaman PDF. retryFailed hanya mengulang halaman yang gagal setelah retry worker habis.",
    inputSchema: { fileKey: z.string().min(1), jobId: z.string().regex(/^[a-f0-9]{64}$/), retryFailed: z.boolean().default(false) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ fileKey, jobId, retryFailed }: any) => {
    const requestId = traceId ?? crypto.randomUUID();
    try {
      requireMcpScope(principal, "authoring:read");
      requireMcpScope(principal, "authoring:stage");
      const job = await sourceReadJob({ fileKey, jobId, retryFailed, requestId, actorId: principal.actorId, sessionId: principal.sessionId });
      if (job.status !== "complete") return toolResult({ ok: true, requestId, ...job });
      const formatted = await timePdfStage(requestId, "send.format", () => formatSourceFileReadResult(job.result));
      return toolResult({ ...formatted.structuredContent, requestId, jobId }, false, formatted.content.slice(1));
    } catch (error) {
      return toolResult({ ...toolError(error).structuredContent, requestId }, true);
    }
  });

  (server as any).registerTool("workflow.get_playbook", {
    title: "Get authoring playbook and bootstrap token",
    description: "Mengambil playbook tahap authoring dari server, memeriksa kompatibilitas versi plugin dan protokol bootstrap, serta menerbitkan bootstrapToken bertanda tangan untuk mengikat operasi authoring.",
    inputSchema: {
      skill: authoringMcpSkillSchema.optional(),
      bootstrapProtocol: z.number().int().positive().default(1),
      pluginVersion: z.string().trim().min(1).max(64).optional(),
      stage: authoringPlaybookStageSchema.optional(),
      modules: z.array(authoringPlaybookModuleKeySchema).max(20).optional(),
      expectedPlaybookRevision: z.string().trim().min(1).optional(),
      runToken: z.string().trim().min(1).optional(),
      clientCapabilities: clientCapabilitiesSchema.optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (input: any) => {
    try {
      requireMcpScope(principal, "authoring:read");
      const result = getMcpPlaybook({
        actorId: principal.actorId,
        sessionId: principal.sessionId,
        skill: input.skill,
        bootstrapProtocol: input.bootstrapProtocol,
        pluginVersion: input.pluginVersion,
        stage: input.stage,
        modules: input.modules,
        expectedPlaybookRevision: input.expectedPlaybookRevision,
        runToken: input.runToken,
        clientCapabilities: input.clientCapabilities,
      });
      return toolResult(result, !result.ok);
    } catch (error) {
      return toolError(error);
    }
  });

  (server as any).registerTool("source.ingest", {
    title: "Ingest Source Pack",
    description: "Menerima Source Pack sebagai base64 melalui MCP, menjalankan compatibility checking, menyimpan ke R2 dan database, dan mengembalikan token sumber tervalidasi.",
    inputSchema: {
      filename: z.string().min(1).max(255),
      contentBase64: z.string().min(1).max(96 * 1024 * 1024),
      originals: sourceOriginalSchema,
      storedOriginals: storedSourceOriginalSchema,
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ filename, contentBase64, originals, storedOriginals, bootstrapToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    verifyMcpExecutionBootstrap({
      actorId: principal.actorId,
      sessionId: principal.sessionId,
      bootstrapToken,
      requiredStage: "source",
    });
    const resolved = await resolveSourceOriginals(originals, storedOriginals);
    let ingestResult: any;
    const hasStoredRefs = resolved.originals && [...resolved.originals.values()].some(
      (v: any) => typeof v === "object" && v !== null && "kind" in v && v.kind === "stored"
    );

    if (hasStoredRefs && process.env.COMPUTE_SERVICE_URL) {
      const { resolveSourcePackOnCompute } = await import("@/lib/compute-client/source-pack");
      const storedRefs: Array<{ documentId: string; storageKey: string; checksum: string }> = [];
      const directRefs: Array<{ documentId: string; contentBase64: string }> = [];

      for (const [docId, val] of resolved.originals!) {
        if (typeof val === "object" && val !== null && "kind" in val && (val as any).kind === "stored") {
          storedRefs.push({
            documentId: docId,
            storageKey: (val as any).storageKey,
            checksum: (val as any).checksum,
          });
        } else {
          const bytes = val instanceof Uint8Array ? val : (val as any).bytes;
          directRefs.push({
            documentId: docId,
            contentBase64: Buffer.from(bytes).toString("base64"),
          });
        }
      }

      ingestResult = await resolveSourcePackOnCompute({
        filename,
        contentBase64,
        directOriginals: directRefs.length > 0 ? directRefs : undefined,
        storedOriginals: storedRefs.length > 0 ? storedRefs : undefined,
        boundScope: resolved.boundScope,
      });
    } else {
      const { toRawByteOriginals } = await import("@/lib/authoring/mcp-source-files");
      ingestResult = ingestMcpSourcePack(filename, contentBase64, toRawByteOriginals(resolved.originals), resolved.boundScope);
    }
    if (!ingestResult.ok) return ingestResult;

    const bytes = decodeMcpArtifact(contentBase64, AUTHORING_MCP_MAX_SOURCE_PACK_BYTES);
    const sourcePack = validateSourcePack(bytes);

    if (resolved.boundScope?.chapterId) {
      const docIds = sourcePack.documents.map((doc) => doc.id);
      for (const chunk of chunkValues(docIds)) {
        const existingDocs = await db
          .select({ id: sumberMateri.id, babId: sumberMateri.babId })
          .from(sumberMateri)
          .where(inArray(sumberMateri.id, chunk));
        for (const existing of existingDocs) {
          if (existing.babId !== resolved.boundScope.chapterId) {
            throw new Error(`SOURCE_PACK_DOCUMENT_ID_COLLISION: documentId '${existing.id}' is already registered under another chapter '${existing.babId}'. Use scoped documentId like 'source-doc-${resolved.boundScope.chapterId}-001'.`);
          }
        }
      }
    }

    const staged = await stageSourcePack({
      filename,
      bytes,
      sourcePack,
      requestedBy: principal.actorId,
      courseId: resolved.boundScope?.courseId,
      chapterId: resolved.boundScope?.chapterId,
      quality: ingestResult.quality,
      summary: ingestResult.source,
    });

    ingestResult.sourcePackToken = issueSourcePackToken({
      importId: staged.importId,
      checksum: sourcePack.archive.checksum,
      packId: sourcePack.manifest.packId,
      name: sourcePack.manifest.name,
      summary: ingestResult.source,
      courseId: resolved.boundScope?.courseId,
      chapterId: resolved.boundScope?.chapterId,
    });

    return {
      ...ingestResult,
      persisted: {
        importId: staged.importId,
        packId: staged.packId,
        checksum: staged.checksum,
        sourceKey: staged.sourceKey,
        created: staged.created,
      },
    };
  }));

  (server as any).registerTool("source.list_packs", {
    title: "List stored Source Packs",
    description: "Mengembalikan daftar Source Pack tervalidasi yang tersimpan di R2 dan database untuk mata kuliah dan bab terpilih, lengkap dengan token sumber siap pakai.",
    inputSchema: {
      courseKey: z.string().min(1),
      chapterKey: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(100).default(50),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ courseKey, chapterKey, limit }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const scope = chapterKey
      ? readMcpCatalogScope(courseKey, chapterKey)
      : readMcpCourseChoice(courseKey);
    const chapterId = "chapterId" in scope ? (scope as { chapterId: string }).chapterId : undefined;
    const rows = await listSourcePackImports({
      courseId: scope.courseId,
      chapterId,
      limit,
    });
    return {
      ok: true,
      packs: rows.map((row) => ({
        importId: row.id,
        packId: row.bundleId,
        checksum: row.checksum,
        sourcePackToken: issueSourcePackToken({
          importId: row.id,
          checksum: row.checksum,
          packId: row.bundleId,
          name: row.validationReport?.name ?? row.bundleId,
          summary: (row.validationReport?.summary as any) ?? {
            packId: row.bundleId,
            name: row.validationReport?.name ?? row.bundleId,
            archiveChecksum: row.checksum,
            documentCount: row.validationReport?.documentCount ?? 0,
            unitCount: 0,
            sectionCount: 0,
            questionCount: 0,
            solutionCount: 0,
            quality: row.validationReport?.quality as any,
            documents: (row.validationReport?.documents as any) ?? [],
          },
          courseId: (row.validationReport?.courseId as string | undefined) ?? row.courseId ?? scope.courseId,
          chapterId: (row.validationReport?.chapterId as string | undefined) ?? chapterId,
        }),
        summary: row.validationReport?.summary,
        documentCount: row.validationReport?.documentCount,
        createdAt: serializeMcpTimestamp(row.createdAt),
        updatedAt: serializeMcpTimestamp(row.updatedAt),
      })),
    };
  }));

  (server as any).registerTool("source.get_pack", {
    title: "Get stored Source Pack detail",
    description: "Mengambil metadata, ringkasan, atau isi teks transkripsi Markdown dokumen dari Source Pack yang tersimpan. Mendukung pemilihan revisi tegas melalui importId, sourcePackToken, runToken, atau checksum.",
    inputSchema: {
      packId: z.string().trim().min(1),
      importId: z.string().trim().min(1).optional(),
      sourcePackToken: z.string().trim().min(1).optional(),
      runToken: z.string().trim().min(1).optional(),
      checksum: z.string().trim().regex(/^[a-f0-9]{64}$/i).optional(),
      documentId: z.string().trim().optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ packId, importId, sourcePackToken, runToken, checksum, documentId }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");

    const tokenPayload = sourcePackToken ? readMcpSourcePackToken(sourcePackToken) : null;
    if (tokenPayload && tokenPayload.packId !== packId) {
      throw new Error(
        `AUTHORING_MCP_SOURCE_PACK_IMPORT_MISMATCH: sourcePackToken belongs to packId '${tokenPayload.packId}', not '${packId}'`,
      );
    }

    const runPayload = runToken ? readMcpRunToken(runToken) : null;
    if (runPayload && (!runPayload.sourcePackId || runPayload.sourcePackId !== packId)) {
      throw new Error(
        `AUTHORING_MCP_SOURCE_PACK_IMPORT_MISMATCH: runToken is bound to packId '${runPayload.sourcePackId ?? "none"}', not '${packId}'`,
      );
    }

    const targetImportId = reconcileSourcePackImportIds([
      importId,
      tokenPayload?.importId,
      runPayload?.sourcePackImportId,
    ]);
    const targetChecksum = reconcileSourcePackChecksums([
      checksum,
      tokenPayload?.checksum,
      runPayload?.sourcePackChecksum,
    ]);

    const stored = await resolveSourcePackImport({
      packId,
      importId: targetImportId,
      checksum: targetChecksum,
    });
    if (!stored) throw new Error("AUTHORING_MCP_SOURCE_PACK_NOT_FOUND");

    const token = issueSourcePackToken({
      importId: stored.id,
      checksum: stored.checksum,
      packId: stored.bundleId,
      name: stored.validationReport?.name ?? stored.bundleId,
      summary: (stored.validationReport?.summary as any) ?? {
        packId: stored.bundleId,
        name: stored.validationReport?.name ?? stored.bundleId,
        archiveChecksum: stored.checksum,
        documentCount: stored.validationReport?.documentCount ?? 0,
        unitCount: 0,
        sectionCount: 0,
        questionCount: 0,
        solutionCount: 0,
        quality: stored.validationReport?.quality as any,
        documents: (stored.validationReport?.documents as any) ?? [],
      },
      courseId: stored.validationReport?.courseId ?? stored.courseId ?? undefined,
      chapterId: stored.validationReport?.chapterId ?? undefined,
    });

    if (documentId) {
      const { document } = await readStoredSourcePackDocument(stored.sourceUriOrKey, documentId);
      return {
        ok: true,
        importId: stored.id,
        packId: stored.bundleId,
        checksum: stored.checksum,
        documentHash: document.markdownSha256,
        markdownSha256: document.markdownSha256,
        sourcePackToken: token,
        createdAt: serializeMcpTimestamp(stored.createdAt),
        updatedAt: serializeMcpTimestamp(stored.updatedAt),
        summary: stored.validationReport?.summary,
        quality: stored.validationReport?.quality,
        document: {
          id: document.id,
          title: document.title,
          role: document.role,
          unitKind: document.unitKind,
          expectedUnits: document.expectedUnits,
          markdown: document.markdown,
          markdownSha256: document.markdownSha256,
          documentHash: document.markdownSha256,
          originalFilename: document.originalFilename,
          originalSha256: document.originalSha256,
          sections: document.sections,
          counts: document.counts,
        },
      };
    }

    let documentsWithHashes = stored.validationReport?.documents ?? [];
    try {
      const parsedPack = await readStoredSourcePack(stored.sourceUriOrKey);
      const hashById = new Map<string, string>();
      for (const doc of parsedPack.manifest.documents) {
        hashById.set(doc.id, doc.markdownSha256);
      }
      documentsWithHashes = documentsWithHashes.map((doc) => ({
        ...doc,
        markdownSha256: hashById.get(doc.id) ?? doc.markdownSha256,
        documentHash: hashById.get(doc.id) ?? doc.markdownSha256,
      }));
    } catch {
      // Fallback if archive is not readable in metadata-only call
    }

    return {
      ok: true,
      importId: stored.id,
      packId: stored.bundleId,
      checksum: stored.checksum,
      sourcePackToken: token,
      summary: stored.validationReport?.summary,
      documents: documentsWithHashes,
      quality: stored.validationReport?.quality,
      createdAt: serializeMcpTimestamp(stored.createdAt),
      updatedAt: serializeMcpTimestamp(stored.updatedAt),
    };
  }));

  (server as any).registerTool("workflow.start", {
    title: "Start authoring workflow",
    description: "Mengunci scope dan workflow authoring. Historical reference berjalan pada scope course tanpa bab dan tanpa Source Pack.",
    inputSchema: {
      workflow: authoringWorkflowSchema,
      sourcePackToken: z.string().min(1).optional(),
      sourcePackId: z.string().min(1).optional(),
      sourcePackImportId: z.string().min(1).optional(),
      courseKey: z.string().min(1),
      chapterKey: z.string().min(1).optional(),
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ workflow, sourcePackToken, sourcePackId, sourcePackImportId, courseKey, chapterKey, bootstrapToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    if (workflow === "reference_question_ingest" && (chapterKey || sourcePackToken || sourcePackId || sourcePackImportId)) throw new Error("WORKFLOW_SCOPE_INVALID");
    let resolvedToken = sourcePackToken;
    if (resolvedToken) {
      const tokenPayload = readMcpSourcePackToken(resolvedToken);
      if (sourcePackId && tokenPayload.packId !== sourcePackId) {
        throw new Error(`AUTHORING_MCP_SOURCE_PACK_IMPORT_MISMATCH: sourcePackToken belongs to packId '${tokenPayload.packId}', not '${sourcePackId}'`);
      }
      const reconciledImportId = reconcileSourcePackImportIds([
        sourcePackImportId,
        tokenPayload.importId,
      ]);
      const reconciledChecksum = normalizeSourcePackChecksum(tokenPayload.checksum);
      if (!tokenPayload.importId || sourcePackImportId) {
        const stored = await resolveSourcePackImport({
          packId: tokenPayload.packId,
          importId: reconciledImportId,
          checksum: reconciledChecksum,
        });
        if (stored) {
          resolvedToken = issueSourcePackToken({
            importId: stored.id,
            checksum: stored.checksum,
            packId: stored.bundleId,
            name: tokenPayload.name,
            summary: tokenPayload.summary,
            courseId: tokenPayload.courseId,
            chapterId: tokenPayload.chapterId,
          });
        }
      }
    } else if (sourcePackId || sourcePackImportId) {
      const stored = await resolveSourcePackImport({
        packId: sourcePackId,
        importId: sourcePackImportId,
      });
      if (!stored) throw new Error("AUTHORING_MCP_SOURCE_PACK_NOT_FOUND");
      resolvedToken = issueSourcePackToken({
        importId: stored.id,
        checksum: stored.checksum,
        packId: stored.bundleId,
        name: stored.validationReport?.name ?? stored.bundleId,
        summary: (stored.validationReport?.summary as any) ?? {
          packId: stored.bundleId,
          name: stored.validationReport?.name ?? stored.bundleId,
          archiveChecksum: stored.checksum,
          documentCount: stored.validationReport?.documentCount ?? 0,
          unitCount: 0,
          sectionCount: 0,
          questionCount: 0,
          solutionCount: 0,
          quality: stored.validationReport?.quality as any,
          documents: (stored.validationReport?.documents as any) ?? [],
        },
        courseId: stored.validationReport?.courseId ?? stored.courseId ?? undefined,
        chapterId: stored.validationReport?.chapterId ?? undefined,
      });
    }
    return {
      ok: true,
      ...(await startAuthoringWorkflow({ workflow, sourcePackToken: resolvedToken, courseKey, chapterKey, actorId: principal.actorId, sessionId: principal.sessionId, bootstrapToken })),
    };
  }));

  (server as any).registerTool("workflow.get_run", {
    title: "Get authoring run",
    description: "Mengembalikan scope yang sudah dikunci tanpa membuka ID internal kepada agent.",
    inputSchema: { runToken: z.string().min(1) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken }: { runToken: string }) => safeTool(() => {
    requireMcpScope(principal, "authoring:read");
    return { ok: true, ...publicMcpRun(runToken, principal) };
  }));

  (server as any).registerTool("workflow.get_contract", {
    title: "Get workflow contract",
    description: "Mengembalikan aturan output dan compatibility gate untuk workflow yang dipilih.",
    inputSchema: {
      runToken: z.string().min(1),
      bootstrapToken: z.string().min(1).optional(),
      skill: authoringMcpSkillSchema.optional(),
      bootstrapProtocol: z.number().int().positive().optional(),
      pluginVersion: z.string().trim().min(1).max(64).optional(),
      clientCapabilities: clientCapabilitiesSchema.optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, bootstrapToken, skill, bootstrapProtocol, pluginVersion, clientCapabilities }: any) => safeTool(() => {
    requireMcpScope(principal, "authoring:read");
    return {
      ok: true,
      ...workflowContract(runToken, {
        actorId: principal.actorId,
        sessionId: principal.sessionId,
        bootstrapToken,
        skill,
        bootstrapProtocol,
        pluginVersion,
        clientCapabilities,
      }),
    };
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
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, filename, bundleBase64, bootstrapToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    if (run.workflow !== "idea_product") return { ok: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
    verifyMcpExecutionBootstrap({
      actorId: principal.actorId,
      sessionId: principal.sessionId,
      run,
      bootstrapToken,
      requiredStage: "idea",
      expectedWorkflow: "idea_product",
    });
    const validation = validateIdeaBundleZip(decodeMcpArtifact(bundleBase64, AUTHORING_MCP_MAX_BUNDLE_BYTES));
    if (!validation.success) return { ok: false, valid: false, filename, issues: validation.issues };
    if (validation.data.manifest.courseId !== run.courseId) {
      return { ok: false, valid: false, filename, issues: [{ code: "AUTHORING_MCP_COURSE_SCOPE_MISMATCH", message: "Idea Bundle course does not match the locked run scope", path: "manifest.json.courseId" }] };
    }
    const chapterScope = validateIdeaChapterScope(run, validation.data);
    const dbConflicts = await validateIdeaDbConflicts(run, validation.data);
    const quality = evaluateIdeaBundleQuality(validation.data);
    const scopeIssues = [...chapterScope.issues, ...dbConflicts.issues];
    if (!chapterScope.valid || !dbConflicts.valid || !quality.valid) return { ok: false, valid: false, filename, issues: [...scopeIssues, ...quality.issues], warnings: dbConflicts.warnings, quality };
    return {
      ok: true,
      valid: true,
      filename,
      bundleId: validation.data.manifest.bundleId,
      checksum: validation.data.manifest.bundleChecksum,
      preview: previewIdeaBundle(validation.data),
      warnings: dbConflicts.warnings,
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
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, filename, bundleBase64, bootstrapToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:stage");
    return stageIdeaArtifact({ principal, runToken, filename, bundleBase64, bootstrapToken });
  }));

  (server as any).registerTool("authoring.validate_product_bundle", {
    title: "Validate Product Bundle",
    description: "Memeriksa ZIP Product Bundle terhadap kontrak, checksum, dependency, provenance, dan scope run.",
    inputSchema: {
      runToken: z.string().min(1),
      filename: z.string().min(1).max(255),
      bundleBase64: z.string().min(1).max(48 * 1024 * 1024),
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, filename, bundleBase64, bootstrapToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    if (run.workflow !== "idea_product") return { ok: false, error: "AUTHORING_MCP_WORKFLOW_MISMATCH" };
    verifyMcpExecutionBootstrap({
      actorId: principal.actorId,
      sessionId: principal.sessionId,
      run,
      bootstrapToken,
      requiredStage: "product",
      expectedWorkflow: "idea_product",
    });
    const bytes = decodeMcpArtifact(bundleBase64, AUTHORING_MCP_MAX_BUNDLE_BYTES);
    const validation = validateProductBundle(bytes);
    if (!validation.success) {
      const mappedIssues = validation.issues.map((iss) =>
        productValidationIssueToDiagnostic(iss, filename),
      );
      return {
        ok: false,
        valid: false,
        publicationReady: false,
        policyVersion: QUALITY_POLICY_VERSION,
        contentFingerprint: "",
        filename,
        issues: mappedIssues,
        next: "agent_revision",
      };
    }
    if (isStructuredArticleReaderEnabled() && !["product-bundle.v3", "product-bundle.v4"].includes(validation.data.manifest.schemaVersion)) {
      return {
        ok: false,
        valid: false,
        publicationReady: false,
        policyVersion: QUALITY_POLICY_VERSION,
        contentFingerprint: "",
        filename,
        issues: [{
          code: "AUTHORING_MCP_PRODUCT_V3_REQUIRED",
          severity: "blocking",
          target: { targetType: "document", targetId: "manifest.json.schemaVersion" },
          reason: "Submission baru wajib memakai Product Bundle V3 saat structured reader aktif.",
          remediation: "Use product-bundle.v4 for new authoring; preserve V3 only for an explicit legacy revision.",
        }],
        next: "agent_revision",
      };
    }
    if (validation.data.manifest.courseId !== run.courseId) {
      return {
        ok: false,
        valid: false,
        publicationReady: false,
        policyVersion: QUALITY_POLICY_VERSION,
        contentFingerprint: "",
        filename,
        issues: [{
          code: "AUTHORING_MCP_COURSE_SCOPE_MISMATCH",
          severity: "blocking",
          target: { targetType: "document", targetId: "manifest.json.courseId" },
          reason: "Product Bundle course does not match the locked run scope",
          remediation: "Ensure bundle manifest courseId matches the active run scope.",
        }],
        next: "agent_revision",
      };
    }
    const chapterScope = validateProductChapterScope(run, validation.data);
    const assessmentBoundaryIssues = validateProductAssessmentBoundary(validation.data);
    const ideaScope = await validateProductIdeaScope(run, validation.data);
    const dbReferences = await validateProductDbReferences(run, validation.data);
    const scopeIssues: DiagnosticIssue[] = [
      ...assessmentBoundaryIssues,
      ...chapterScope.issues.map((i) => ({ code: i.code, severity: "blocking" as const, target: { targetType: "document" as const, targetId: i.path }, reason: i.message, remediation: "Ensure all products declare and match the locked chapter." })),
      ...ideaScope.issues.map((i) => ({ code: i.code, severity: "blocking" as const, target: { targetType: "idea" as const, targetId: i.path }, reason: i.message, remediation: "Ensure all referenced Ideas are published and in the course scope." })),
      ...dbReferences.issues.map((i) => ({ code: i.code, severity: "blocking" as const, target: { targetType: "document" as const, targetId: i.path }, reason: i.message, remediation: "Ensure all external references exist and are permitted for authoring." })),
    ];

    const policyEvaluation = await evaluateProductBundleQualityPolicy({
      bundle: validation.data,
      dependencies: validation.data.dependencies,
    });

    const allIssues = [...scopeIssues, ...policyEvaluation.issues];
    const valid = scopeIssues.length === 0 && policyEvaluation.valid;
    const publicationReady = scopeIssues.length === 0 && policyEvaluation.publicationReady;

    return {
      ok: valid,
      valid,
      publicationReady,
      filename,
      bundleId: validation.data.manifest.bundleId,
      checksum: validation.data.manifest.bundleChecksum,
      policyVersion: policyEvaluation.policyVersion,
      contentFingerprint: policyEvaluation.contentFingerprint,
      issues: allIssues,
      metrics: policyEvaluation.metrics,
      previews: previewProducts(validation.data.products),
      next: valid ? (publicationReady ? "ready_for_publication" : "submit_for_review") : "agent_revision",
    };
  }));

  (server as any).registerTool("authoring.submit_product_bundle", {
    title: "Submit Product Bundle for review",
    description: "Memvalidasi lalu menaruh Product Bundle sebagai draft untuk review admin. Tool ini tidak dapat mempublikasikan bundle.",
    inputSchema: {
      runToken: z.string().min(1),
      filename: z.string().min(1).max(255),
      bundleBase64: z.string().min(1).max(48 * 1024 * 1024),
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, filename, bundleBase64, bootstrapToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:stage");
    return stageProductArtifact({ principal, runToken, filename, bundleBase64, bootstrapToken });
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
      linking: quizBankScopeGuidance().linkingPolicy,
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
    if (!idea || idea.courseId !== run.courseId || idea.status !== "published" || (run.workflow !== "reference_question_ingest" && idea.chapterId !== run.chapterId)) {
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
      scope: runScope(run),
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
      linking: quizBankScopeGuidance().linkingPolicy,
    };
  }));

  (server as any).registerTool("assessment.validate_quiz_draft", {
    title: "Validate question bank draft",
    description: "Memeriksa draft soal dengan minimal satu Idea published dalam scope bab dan tepat satu primary sebelum review bank soal.",
    inputSchema: {
      runToken: z.string().min(1),
      draftJson: z.string().min(1).max(8 * 1024 * 1024),
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, draftJson, bootstrapToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const parsed = parseQuestionBankDraftJson(draftJson);
    if (!parsed.success) return { ok: false, valid: false, issues: parsed.issues, next: "agent_revision" };
    return validateQuestionBankDraft(principal, runToken, normalizeQuestionBankDraft(parsed.data), bootstrapToken);
  }));

  (server as any).registerTool("assessment.submit_quiz_draft", {
    title: "Submit question bank draft for review",
    description: "Memvalidasi lalu menyimpan soal canonical dan projection kompatibilitas sebagai generated. Tool ini tidak dapat mempublikasikan soal.",
    inputSchema: {
      runToken: z.string().min(1),
      draftJson: z.string().min(1).max(8 * 1024 * 1024),
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, draftJson, bootstrapToken }: any) => safeTool(async () => {
    const parsed = parseQuestionBankDraftJson(draftJson);
    if (!parsed.success) return { ok: false, valid: false, staged: false, issues: parsed.issues, next: "agent_revision" };
    return stageQuestionBankDraft(principal, runToken, normalizeQuestionBankDraft(parsed.data), bootstrapToken);
  }));
}

function historicalSourceAttribution(row: {
  title?: string | null;
  sourceTitle?: string | null;
  institution: string | null;
  assessmentType: string | null;
  year: number | null;
  academicYearLabel: string | null;
  term: string | null;
  sourceQuestionNumber: string | null;
  sourceQuestionPart: string | null;
  sourcePage: number | null;
}) {
  return {
    title: row.title ?? row.sourceTitle ?? null,
    institution: row.institution,
    assessmentType: row.assessmentType,
    year: row.year,
    academicYearLabel: row.academicYearLabel,
    term: row.term,
    questionNumber: row.sourceQuestionNumber,
    part: row.sourceQuestionPart,
    page: row.sourcePage,
  };
}

function referenceDraftSourceInput(
  resolved: Awaited<ReturnType<typeof resolveReferenceDraftContext>>,
  draft: ReferenceQuestionDraft,
) {
  return {
    sourceDocumentId: resolved.source.row.id,
    solutionDocumentId: resolved.solution?.row.id ?? null,
    sourceFileKey: draft.source.sourceFileKey,
    solutionFileKey: draft.source.solutionFileKey,
    sourceMetadata: resolved.source.metadata,
    solutionMetadata: resolved.solution?.metadata ?? null,
  };
}

/**
 * Registers MCP tool endpoints for validating, submitting, and querying historical reference questions.
 *
 * @param server - The active McpServer instance.
 * @param principal - Authenticated principal with lifecycle authoring scopes.
 */
function registerReferenceQuestionTools(server: McpServer, principal: McpPrincipal): void {
  (server as any).registerTool("assessment.validate_reference_draft", {
    title: "Validate historical reference draft",
    description: "Memeriksa draft soal historis, fidelity source, provenance jawaban, Idea links, dan eligibility quiz.",
    inputSchema: {
      runToken: z.string().min(1),
      draftJson: z.string().min(1).max(8 * 1024 * 1024),
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, draftJson, bootstrapToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = requireReferenceWorkflow(runToken);
    verifyMcpExecutionBootstrap({
      actorId: principal.actorId,
      sessionId: principal.sessionId,
      run,
      bootstrapToken,
      requiredStage: "reference",
      expectedWorkflow: "reference_question_ingest",
    });
    const parsed = parseReferenceQuestionDraftJson(draftJson);
    if (!parsed.success) return { ok: false, valid: false, issues: parsed.issues, next: "agent_revision" };
    const resolved = await resolveReferenceDraftContext(run, parsed.data);
    const validation = validateReferenceQuestionDraft(parsed.data, {
      courseId: run.courseId,
      source: resolved.source.metadata,
      solution: resolved.solution?.metadata ?? null,
      ideas: resolved.ideas,
    });
    return {
      ok: validation.valid,
      valid: validation.valid,
      issues: validation.issues,
      stats: { questionCount: validation.questionCount, eligibleCount: validation.eligibleCount },
      next: validation.valid ? "assessment.submit_reference_draft" : "agent_revision",
    };
  }));

  (server as any).registerTool("assessment.submit_reference_draft", {
    title: "Submit historical reference draft",
    description: "Menyimpan soal historis sebagai canonical record published (status published, reviewRequired false, publicationTarget reference_question_bank) beserta projection kompatibilitas. Soal yang memiliki jawaban terverifikasi langsung quizEligible dan dapat dipakai untuk kuis.",
    inputSchema: {
      runToken: z.string().min(1),
      draftJson: z.string().min(1).max(8 * 1024 * 1024),
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, draftJson, bootstrapToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:stage");
    const run = requireReferenceWorkflow(runToken);
    verifyMcpExecutionBootstrap({
      actorId: principal.actorId,
      sessionId: principal.sessionId,
      run,
      bootstrapToken,
      requiredStage: "reference",
      expectedWorkflow: "reference_question_ingest",
    });
    const parsed = parseReferenceQuestionDraftJson(draftJson);
    if (!parsed.success) return { ok: false, valid: false, staged: false, published: false, issues: parsed.issues, next: "agent_revision" };
    const resolved = await resolveReferenceDraftContext(run, parsed.data);
    const validation = validateReferenceQuestionDraft(parsed.data, {
      courseId: run.courseId,
      source: resolved.source.metadata,
      solution: resolved.solution?.metadata ?? null,
      ideas: resolved.ideas,
    });
    if (!validation.valid) return { ok: false, valid: false, staged: false, published: false, issues: validation.issues, next: "agent_revision" };
    const results = await createHistoricalQuestionBatch({
      courseId: run.courseId,
      creatorId: principal.actorId,
      draft: parsed.data,
      source: referenceDraftSourceInput(resolved, parsed.data),
    });
    return {
      ok: true,
      valid: true,
      staged: true,
      published: true,
      reviewRequired: false,
      publicationTarget: "reference_question_bank",
      status: "published",
      questionCount: results.length,
      quizEligibleCount: validation.eligibleCount,
      questions: results.map((result, index) => {
        const draftQuestion = parsed.data.questions[index];
        const quizEligible = Boolean(draftQuestion?.quizEligible);
        return {
          id: result.id,
          localId: draftQuestion?.localId,
          version: result.version,
          status: result.reviewStatus,
          quizEligible,
          unchanged: result.unchanged,
        };
      }),
      next: "ready_for_quiz",
    };
  }));

  (server as any).registerTool("assessment.list_reference_questions", {
    title: "List historical reference questions",
    description: "Mencari soal historical_reference lintas bab dalam course run dengan filter provenance, attribution, dan quiz eligibility.",
    inputSchema: {
      runToken: z.string().min(1),
      query: z.string().trim().max(200).optional(),
      ideaId: z.string().trim().min(1).optional(),
      chapterKey: z.string().trim().min(1).optional(),
      assessmentType: z.enum(["uts", "uas", "quiz", "tutorial", "homework", "exercise", "other"]).optional(),
      year: z.number().int().min(1900).max(2100).optional(),
      institution: z.string().trim().min(1).optional(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      cognitiveLevel: z.enum(["remember", "understand", "apply", "analyze", "evaluate", "create"]).optional(),
      questionType: z.enum(["multiple_choice", "multiple_choices", "short_answer", "essay"]).optional(),
      quizEligible: z.boolean().optional(),
      status: z.enum(["draft", "in_review", "published", "retired"]).optional(),
      limit: z.number().int().min(1).max(10).default(10),
      offset: z.number().int().min(0).default(0),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (input: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = requireHistoricalReadWorkflow(input.runToken);
    const conditions = [eq(soal.mataKuliahId, run.courseId), eq(soal.origin, "historical_reference" as const)];
    if (input.difficulty) conditions.push(eq(soal.difficulty, input.difficulty));
    if (input.cognitiveLevel) conditions.push(eq(soal.cognitiveLevel, input.cognitiveLevel));
    if (input.questionType) conditions.push(eq(soal.questionType, input.questionType));
    if (input.quizEligible !== undefined) conditions.push(eq(soal.quizEligible, input.quizEligible));
    if (input.status) conditions.push(eq(soal.status, input.status));
    const rows = await db.select({
      id: soal.id,
      prompt: soal.prompt,
      questionType: soal.questionType,
      difficulty: soal.difficulty,
      cognitiveLevel: soal.cognitiveLevel,
      origin: soal.origin,
      status: soal.status,
      quizEligible: soal.quizEligible,
      sourceQuestionNumber: soal.sourceQuestionNumber,
      sourceQuestionPart: soal.sourceQuestionPart,
      sourcePage: soal.sourcePage,
      answerProvenance: soal.answerProvenance,
      solutionProvenance: soal.solutionProvenance,
      sourceId: assessmentSources.id,
      sourceTitle: assessmentSources.title,
      institution: assessmentSources.institution,
      assessmentType: assessmentSources.assessmentType,
      year: assessmentSources.year,
      academicYearLabel: assessmentSources.academicYearLabel,
      term: assessmentSources.term,
    }).from(soal).innerJoin(assessmentSources, eq(assessmentSources.id, soal.assessmentSourceId)).where(and(...conditions)).orderBy(asc(soal.id));
    let filtered = input.query ? rows.filter((row) => row.prompt.toLowerCase().includes(input.query.toLowerCase())) : rows;
    if (input.assessmentType) filtered = filtered.filter((row) => row.assessmentType === input.assessmentType);
    if (input.year !== undefined) filtered = filtered.filter((row) => row.year === input.year);
    if (input.institution) filtered = filtered.filter((row) => row.institution?.toLowerCase().includes(input.institution.toLowerCase()));
    const ids = filtered.map((row) => row.id);
    if (input.ideaId && ids.length > 0) {
      const linked = await db.select({ questionId: soalIde.soalId }).from(soalIde).where(and(eq(soalIde.ideId, input.ideaId), inArray(soalIde.soalId, ids)));
      const linkedIds = new Set(linked.map((row) => row.questionId));
      filtered = filtered.filter((row) => linkedIds.has(row.id));
    }
    if (input.chapterKey && filtered.length > 0) {
      const linkedIdeas = await db.select({ questionId: soalIde.soalId, chapterId: ide.babId, chapterCode: bab.code }).from(soalIde).innerJoin(ide, eq(ide.id, soalIde.ideId)).leftJoin(bab, eq(bab.id, ide.babId)).where(inArray(soalIde.soalId, filtered.map((row) => row.id)));
      const chapterIds = new Set(linkedIdeas.filter((row) => row.chapterId === input.chapterKey || row.chapterCode === input.chapterKey).map((row) => row.questionId));
      filtered = filtered.filter((row) => chapterIds.has(row.id));
    }
    const total = filtered.length;
    const page = filtered.slice(input.offset, input.offset + input.limit);
    return {
      ok: true,
      scope: runScope(run),
      totalQuestionCount: total,
      questionCount: page.length,
      questions: page.map((row) => ({
        id: row.id,
        prompt: row.prompt.length > 240 ? `${row.prompt.slice(0, 240)}...` : row.prompt,
        questionType: row.questionType,
        difficulty: row.difficulty,
        cognitiveLevel: row.cognitiveLevel,
        origin: row.origin,
        status: row.status,
        quizEligible: row.quizEligible,
        answerProvenance: row.answerProvenance,
        solutionProvenance: row.solutionProvenance,
        source: historicalSourceAttribution(row),
        attribution: historicalSourceAttribution(row),
      })),
      paging: { limit: input.limit, offset: input.offset, nextOffset: input.offset + input.limit < total ? input.offset + input.limit : null },
    };
  }));

  (server as any).registerTool("assessment.get_reference_question", {
    title: "Get historical reference question",
    description: "Mengembalikan soal historis beserta attribution, provenance, pembahasan, dan Idea links.",
    inputSchema: { runToken: z.string().min(1), questionId: z.string().trim().min(1) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, questionId }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = requireHistoricalReadWorkflow(runToken);
    const [question] = await db.select({
      id: soal.id,
      courseId: soal.mataKuliahId,
      questionType: soal.questionType,
      prompt: soal.prompt,
      optionsSnapshot: soal.optionsSnapshot,
      difficulty: soal.difficulty,
      cognitiveLevel: soal.cognitiveLevel,
      origin: soal.origin,
      version: soal.version,
      status: soal.status,
      quizEligible: soal.quizEligible,
      sourceQuestionNumber: soal.sourceQuestionNumber,
      sourceQuestionPart: soal.sourceQuestionPart,
      sourcePage: soal.sourcePage,
      answerProvenance: soal.answerProvenance,
      solutionProvenance: soal.solutionProvenance,
      sourceTitle: assessmentSources.title,
      institution: assessmentSources.institution,
      assessmentType: assessmentSources.assessmentType,
      year: assessmentSources.year,
      academicYearLabel: assessmentSources.academicYearLabel,
      term: assessmentSources.term,
    }).from(soal).innerJoin(assessmentSources, eq(assessmentSources.id, soal.assessmentSourceId)).where(and(eq(soal.id, questionId), eq(soal.mataKuliahId, run.courseId))).limit(1);
    if (!question) throw new Error("AUTHORING_MCP_QUESTION_NOT_IN_SCOPE");
    if (question.origin !== "historical_reference") throw new Error("QUESTION_NOT_HISTORICAL_REFERENCE");
    const [compatibility] = await db.select({
      correctIndices: aiQuestionBank.correctIndices,
      acceptableAnswers: aiQuestionBank.acceptableAnswers,
      explanation: aiQuestionBank.explanation,
    }).from(aiQuestionBank).where(eq(aiQuestionBank.id, questionId)).limit(1);
    const links = await db.select({ ideId: soalIde.ideId, code: ide.code, weight: soalIde.weight, role: soalIde.role }).from(soalIde).innerJoin(ide, eq(ide.id, soalIde.ideId)).where(eq(soalIde.soalId, questionId));
    const [solution] = await db.select({ content: pembahasanSoal.content, status: pembahasanSoal.status, version: pembahasanSoal.version }).from(pembahasanSoal).where(eq(pembahasanSoal.soalId, questionId)).orderBy(desc(pembahasanSoal.version)).limit(1);
    const attribution = historicalSourceAttribution(question);
    const answer = {
      correctIndices: compatibility?.correctIndices ?? [],
      acceptableAnswers: compatibility?.acceptableAnswers ?? [],
      provenance: question.answerProvenance,
    };
    return {
      ok: true,
      scope: runScope(run),
      question: {
        id: question.id,
        questionType: question.questionType,
        prompt: question.prompt,
        optionsSnapshot: question.optionsSnapshot,
        difficulty: question.difficulty,
        cognitiveLevel: question.cognitiveLevel,
        origin: question.origin,
        version: question.version,
        status: question.status,
        quizEligible: question.quizEligible,
        answerProvenance: question.answerProvenance,
        solutionProvenance: question.solutionProvenance,
        questionNumber: question.sourceQuestionNumber,
        part: question.sourceQuestionPart,
        page: question.sourcePage,
        source: attribution,
        attribution,
        answer,
        solution: solution ?? null,
        explanation: compatibility?.explanation ?? solution?.content ?? null,
      },
      ideaLinks: links,
    };
  }));
}

/** Registers bundle import, review, and publication lifecycle MCP tools. */
function registerLifecycleTools(server: McpServer, principal: McpPrincipal): void {
  (server as any).registerTool("authoring.list_imports", {
    title: "List staged bundle imports",
    description: "Mengembalikan inventory Source Pack, Idea, atau Product Bundle untuk inspeksi lifecycle sebelum edit, review, atau withdrawal.",
    inputSchema: {
      bundleType: z.enum(["source", "idea", "product"]),
      limit: z.number().int().min(1).max(100).default(50),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ bundleType, limit }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const rows = bundleType === "source"
      ? await listSourcePackImports({ limit })
      : bundleType === "idea"
        ? await listIdeaBundleImports(limit)
        : await listProductBundleImports(limit);

    const pedReviewsByImport = new Map<string, PedagogicReviewSummaryRow[]>();
    const pdfEvidenceByImport = new Map<string, PdfEvidenceSummaryRow[]>();
    if (bundleType === "product" && rows.length > 0) {
      const importIds = rows.map((row) => row.id);
      const allPedReviews = await db
        .select({
          id: reviewPedagogiBundle.id,
          imporBundleId: reviewPedagogiBundle.imporBundleId,
          status: reviewPedagogiBundle.status,
          policyVersion: reviewPedagogiBundle.policyVersion,
          contentFingerprint: reviewPedagogiBundle.contentFingerprint,
          rubric: reviewPedagogiBundle.rubric,
          exceptions: reviewPedagogiBundle.exceptions,
          notes: reviewPedagogiBundle.notes,
          createdAt: reviewPedagogiBundle.createdAt,
        })
        .from(reviewPedagogiBundle)
        .where(inArray(reviewPedagogiBundle.imporBundleId, importIds))
        .orderBy(desc(reviewPedagogiBundle.createdAt), desc(reviewPedagogiBundle.id));
      for (const review of allPedReviews) {
        const list = pedReviewsByImport.get(review.imporBundleId) ?? [];
        list.push(review);
        pedReviewsByImport.set(review.imporBundleId, list);
      }

      const allPdfEvidence = await db
        .select()
        .from(buktiPdfBundle)
        .where(inArray(buktiPdfBundle.imporBundleId, importIds))
        .orderBy(desc(buktiPdfBundle.createdAt), desc(buktiPdfBundle.id));
      for (const evidence of allPdfEvidence) {
        const list = pdfEvidenceByImport.get(evidence.imporBundleId) ?? [];
        list.push(evidence);
        pdfEvidenceByImport.set(evidence.imporBundleId, list);
      }
    }

    return {
      ok: true,
      bundleType,
      imports: rows.map((row) => {
        const currentReadiness = bundleType === "product"
          ? computeCurrentProductImportReadiness(
              row,
              pedReviewsByImport.get(row.id) ?? [],
              pdfEvidenceByImport.get(row.id) ?? [],
            )
          : undefined;
        return {
          importId: row.id,
          bundleId: row.bundleId,
          checksum: row.checksum,
          version: row.version,
          status: row.status,
          ...(currentReadiness ? {
            publicationReady: currentReadiness.publicationReady,
            currentReadiness,
          } : {}),
          validationReport: formatSnapshotValidationReport(row.validationReport as Record<string, unknown> | null, row.createdAt),
          createdAt: serializeMcpTimestamp(row.createdAt),
          updatedAt: serializeMcpTimestamp(row.updatedAt),
        };
      }),
    };
  }));

  (server as any).registerTool("authoring.get_import", {
    title: "Get staged bundle import",
    description: "Mengembalikan detail import, inventory entity, laporan validasi, dan keputusan review tanpa mengekspos storage key atau identity internal reviewer.",
    inputSchema: {
      bundleType: z.enum(["source", "idea", "product"]),
      importId: z.string().trim().min(1),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ bundleType, importId }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    if (bundleType === "source") {
      const row = await getSourcePackImport(importId);
      if (!row) throw new Error("SOURCE_PACK_NOT_FOUND");
      return {
        ok: true,
        import: {
          importId: row.id,
          bundleId: row.bundleId,
          checksum: row.checksum,
          version: row.version,
          status: row.status,
          validationReport: formatSnapshotValidationReport(row.validationReport as Record<string, unknown> | null, row.createdAt),
          createdAt: serializeMcpTimestamp(row.createdAt),
          updatedAt: serializeMcpTimestamp(row.updatedAt),
        },
      };
    }
    const row = bundleType === "idea" ? await getIdeaBundleImport(importId) : await getProductBundleImport(importId);
    if (!row) throw new Error(bundleType === "idea" ? "IDEA_BUNDLE_NOT_FOUND" : "PRODUCT_BUNDLE_NOT_FOUND");
    if (bundleType === "product") {
      const pedReviews = await db
        .select({
          id: reviewPedagogiBundle.id,
          status: reviewPedagogiBundle.status,
          policyVersion: reviewPedagogiBundle.policyVersion,
          contentFingerprint: reviewPedagogiBundle.contentFingerprint,
          rubric: reviewPedagogiBundle.rubric,
          exceptions: reviewPedagogiBundle.exceptions,
          notes: reviewPedagogiBundle.notes,
          createdAt: reviewPedagogiBundle.createdAt,
        })
        .from(reviewPedagogiBundle)
        .where(eq(reviewPedagogiBundle.imporBundleId, importId))
        .orderBy(desc(reviewPedagogiBundle.createdAt), desc(reviewPedagogiBundle.id));
      const pdfEvidenceRows = await db
        .select()
        .from(buktiPdfBundle)
        .where(eq(buktiPdfBundle.imporBundleId, importId))
        .orderBy(desc(buktiPdfBundle.createdAt), desc(buktiPdfBundle.id));
      if (row.version === 4) {
        const { parseStagedProductBundle } = await import("@/lib/bundle/product-staging");
        const bundle = await parseStagedProductBundle(importId);
        const article = bundle.products.find(product => product.productType === "article");
        const ref = row.validationReport.productV4Verification as { runId?: unknown } | undefined;
        const verification = typeof ref?.runId === "string" ? await (await import("@/lib/bundle/product-v4-verification-service")).getProductV4VerificationReadiness(importId, ref.runId) : null;
        const quality = await evaluateProductBundleQualityPolicy({ bundle }, { imporBundleId: importId, v4Verification: verification });
        return { ok: true, import: { ...publicBundleImport(row, pedReviews, pdfEvidenceRows), publicationReady: quality.publicationReady, quality,
          verificationContentHash: computeProductV4VerificationContentHash(bundle),
          reviewContext: { expectedRevision: row.checksum, policyVersion: quality.policyVersion, contentFingerprint: quality.contentFingerprint,
            verificationPlanHash: verification?.plan.planHash ?? null, verificationReceiptSignature: (verification?.receipt as { signature?: string } | null)?.signature ?? null,
            sections: article?.productType === "article" ? article.sections.map(section => ({ sectionId: section.id, semanticHash: computeProductV4SectionSemanticHash(article, section.id) })) : [],
          }, verification,
        } };
      }
      return { ok: true, import: publicBundleImport(row, pedReviews, pdfEvidenceRows) };
    }
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
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ runToken, importId, filename, bundleBase64, bootstrapToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:stage");
    return stageIdeaArtifact({ principal, runToken, filename, bundleBase64, replaceImportId: importId, bootstrapToken });
  }));

  (server as any).registerTool("authoring.restage_product_bundle", {
    title: "Replace staged Product Bundle",
    description: "Memvalidasi ulang lalu mengganti Product Bundle draft dengan bundle ID dan scope yang sama.",
    inputSchema: {
      runToken: z.string().min(1),
      importId: z.string().trim().min(1),
      filename: z.string().min(1).max(255),
      bundleBase64: z.string().min(1).max(48 * 1024 * 1024),
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ runToken, importId, filename, bundleBase64, bootstrapToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:stage");
    return stageProductArtifact({ principal, runToken, filename, bundleBase64, replaceImportId: importId, bootstrapToken });
  }));

  (server as any).registerTool("authoring.discard_product_draft", {
    title: "Discard Product Bundle draft",
    description: "Menghapus Product Bundle yang masih draft beserta artifact staging-nya. Published atau withdrawn bundle tidak dapat dihapus.",
    inputSchema: {
      importId: z.string().trim().min(1),
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ importId, bootstrapToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:withdraw");
    verifyMcpExecutionBootstrap({
      actorId: principal.actorId,
      sessionId: principal.sessionId,
      bootstrapToken,
      requiredStage: "product",
    });
    return { ok: true, result: await discardProductBundleDraft({ importId, actorId: principal.actorId }) };
  }));

  (server as any).registerTool("authoring.review_idea_bundle", {
    title: "Review Idea Bundle",
    description: "Mencatat keputusan review immutable untuk Idea Bundle. Admin approval mengubah import menjadi approved; rejection menjadi rejected.",
    inputSchema: {
      importId: z.string().trim().min(1),
      decision: z.enum(["approved", "rejected"]),
      notes: z.string().trim().max(4000).optional(),
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ importId, decision, notes, bootstrapToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:review");
    verifyMcpExecutionBootstrap({
      actorId: principal.actorId,
      sessionId: principal.sessionId,
      bootstrapToken,
      requiredStage: "idea",
    });
    return { ok: true, result: await reviewIdeaBundle({ importId, reviewerId: principal.actorId, decision, notes }) };
  }));

  (server as any).registerTool("authoring.review_product_bundle", {
    title: "Review Product Bundle",
    description: "Mencatat keputusan review Product Bundle draft tanpa mempublikasikannya.",
    inputSchema: {
      ...productV4ReviewContextShape,
      importId: z.string().trim().min(1),
      runToken: z.string().min(1).optional(),
      decision: z.enum(["approved", "rejected", "changes_requested"]),
      policyVersion: z.string().trim().min(1).optional(),
      contentFingerprint: z.string().trim().min(1).optional(),
      criteria: z.array(pedagogicRubricItemSchema).optional(),
      exceptions: z.array(pedagogicExceptionSchema).default([]),
      expectedRevision: z.union([z.string(), z.number()]).optional(),
      notes: z.string().trim().max(4000).optional(),
      reason: z.string().trim().max(4000).optional(),
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async (input: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:review");

    let run: ReturnType<typeof readMcpRunToken> | null = null;
    if (input.runToken) {
      run = readMcpRunToken(input.runToken);
      if (run.workflow !== "idea_product") throw new Error("AUTHORING_MCP_WORKFLOW_MISMATCH");
      const row = await getProductBundleImport(input.importId);
      if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
      await assertImportRunScope(row.courseId, run.courseId);
    }

    verifyMcpExecutionBootstrap({
      actorId: principal.actorId,
      sessionId: principal.sessionId,
      run,
      bootstrapToken: input.bootstrapToken,
      requiredStage: "product",
    });

    const result = await executePedagogicReview({
      importId: input.importId,
      reviewerId: principal.actorId,
      decision: input.decision,
      policyVersion: input.policyVersion,
      contentFingerprint: input.contentFingerprint,
      criteria: input.criteria,
      exceptions: input.exceptions,
      expectedRevision: input.expectedRevision,
      verificationPlanHash: input.verificationPlanHash,
      verificationReceiptSignature: input.verificationReceiptSignature,
      sectionDecisions: input.sectionDecisions,
      notes: input.notes,
      reason: input.reason,
    });

    return {
      ...result,
      next: input.decision === "approved" ? "ready_for_pdf_and_publication" : "author_remediation",
    };
  }));

  (server as any).registerTool("authoring.withdraw_product_bundle", {
    title: "Withdraw published Product Bundle",
    description: "Menarik Product Bundle published melalui lifecycle audited, meretire projection canonical, dan mengantrekan penghapusan vector. Tool ini idempotent.",
    inputSchema: {
      importId: z.string().trim().min(1),
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ importId, bootstrapToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:withdraw");
    verifyMcpExecutionBootstrap({
      actorId: principal.actorId,
      sessionId: principal.sessionId,
      bootstrapToken,
      requiredStage: "product",
    });
    return { ok: true, result: await withdrawProductBundle({ importId, withdrawnBy: principal.actorId }) };
  }));

  (server as any).registerTool("assessment.update_question", {
    title: "Edit draft question",
    description: "Memperbarui soal canonical Zyx original dalam scope run dan mengembalikannya ke generated untuk review. Soal published, retired, atau origin selain zyx_original tidak dapat diedit melalui tool ini.",
    inputSchema: {
      runToken: z.string().min(1),
      questionId: z.string().trim().min(1),
      question: questionAuthoringQuestionSchema,
      ideaLinks: z.array(questionIdeaLinkSchema).min(1).max(50),
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ runToken, questionId, question, ideaLinks, bootstrapToken }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:stage");
    const run = readMcpRunToken(runToken);
    if (run.workflow !== "quiz_bank") throw new Error("AUTHORING_MCP_WORKFLOW_MISMATCH");
    verifyMcpExecutionBootstrap({
      actorId: principal.actorId,
      sessionId: principal.sessionId,
      run,
      bootstrapToken,
      requiredStage: "quiz",
      expectedWorkflow: "quiz_bank",
    });
    const [existing] = await db
      .select({ id: soal.id, courseId: soal.mataKuliahId, chapterId: soal.babId, origin: soal.origin, status: soal.status })
      .from(soal)
      .where(eq(soal.id, questionId))
      .limit(1);
    if (!existing || existing.courseId !== run.courseId) throw new Error("AUTHORING_MCP_QUESTION_NOT_IN_SCOPE");
    if (existing.origin !== "zyx_original") throw new Error("HISTORICAL_QUESTION_IMMUTABLE");
    if (existing.chapterId !== run.chapterId) throw new Error("AUTHORING_MCP_QUESTION_NOT_IN_SCOPE");
    if (existing.status === "published" || existing.status === "retired") throw new Error("AUTHORING_MCP_QUESTION_EDIT_DRAFT_REQUIRED");
    const { review } = await reviewDraftAgainstScope(run, {
      schemaVersion: "question-bank-draft.v2",
      draftId: questionId,
      items: [{ externalId: questionId, question, ideaLinks, referenceLinks: [] }],
    });
    if (!review.valid) throw new Error(review.issues.find((issue) => issue.severity === "blocking")?.code ?? "QUESTION_BANK_DRAFT_REVIEW_FAILED");
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

const ARTICLE_VISUALS_META_RE = /\n*<!--__ZYX_V3_ARTICLE_VISUALS__:([A-Za-z0-9_-]+)-->\s*$/;
const SECTION_PEDAGOGY_META_RE = /\n*<!--__ZYX_V3_SECTION_PEDAGOGY__:([A-Za-z0-9_-]+)-->\s*$/;
const BLOCK_PAYLOAD_META_RE = /\n*<!--__ZYX_V3_BLOCK_PAYLOAD__:([A-Za-z0-9_-]+)-->\s*$/;

function parseArticleRowContent(rawMarkdown: string | null | undefined) {
  const text = rawMarkdown ?? "";
  const match = ARTICLE_VISUALS_META_RE.exec(text);
  if (!match) {
    return { contentMarkdown: text || null, visuals: [] as unknown[] };
  }
  const stripped = text.slice(0, match.index).trimEnd();
  let visuals: unknown[] = [];
  try {
    const parsed = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
    if (Array.isArray(parsed)) visuals = parsed;
  } catch {
    visuals = [];
  }
  return { contentMarkdown: stripped || null, visuals };
}

function parseArticleSectionObjective(rawObjective: string | null | undefined) {
  const text = rawObjective ?? "";
  const match = SECTION_PEDAGOGY_META_RE.exec(text);
  if (!match) {
    return { learningObjective: text, pedagogy: null as Record<string, unknown> | null };
  }
  const stripped = text.slice(0, match.index).trimEnd();
  let pedagogy: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
    if (parsed && typeof parsed === "object") pedagogy = parsed as Record<string, unknown>;
  } catch {
    pedagogy = null;
  }
  return { learningObjective: stripped, pedagogy };
}

function parseArticleBlockContent(rawContent: string | null | undefined) {
  const text = rawContent ?? "";
  const match = BLOCK_PAYLOAD_META_RE.exec(text);
  if (!match) {
    return {
      contentMarkdown: text,
      workedExamplePayload: null as unknown,
      formativeCheckPayload: null as unknown,
      visualIds: [] as string[],
    };
  }
  const stripped = text.slice(0, match.index).trimEnd();
  let workedExamplePayload: unknown = null;
  let formativeCheckPayload: unknown = null;
  let visualIds: string[] = [];
  try {
    const parsed = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      workedExamplePayload = parsed.workedExamplePayload ?? null;
      formativeCheckPayload = parsed.formativeCheckPayload ?? null;
      if (Array.isArray(parsed.visualIds)) {
        visualIds = parsed.visualIds.map((v) => String(v));
      }
    }
  } catch {
    // Ignore malformed metadata comment
  }
  return { contentMarkdown: stripped, workedExamplePayload, formativeCheckPayload, visualIds };
}

async function resolveProductDependencyState(
  productType: "article" | "diktat" | "flashcard_set" | "question",
  productId: string,
  ideaLinks: ReadonlyArray<{ ideId: string; code: string; status?: string | null; version?: number | null; semanticHash?: string | null }>,
) {
  const baseProductId = productId.replace(/:v\d+$/, "");
  const rawEdges = await db
    .select()
    .from(ketergantunganProduk)
    .where(
      and(
        eq(ketergantunganProduk.downstreamEntityType, productType),
        or(
          eq(ketergantunganProduk.downstreamEntityId, productId),
          eq(ketergantunganProduk.downstreamEntityId, baseProductId),
        ),
      ),
    )
    .orderBy(asc(ketergantunganProduk.upstreamEntityType), asc(ketergantunganProduk.upstreamEntityId));

  const upstreamByType = {
    idea: [...new Set(rawEdges.filter((e) => e.upstreamEntityType === "idea").map((e) => e.upstreamEntityId))],
    source_material: [...new Set(rawEdges.filter((e) => e.upstreamEntityType === "source_material").map((e) => e.upstreamEntityId))],
    source_chunk: [...new Set(rawEdges.filter((e) => e.upstreamEntityType === "source_chunk").map((e) => e.upstreamEntityId))],
    product: [...new Set(rawEdges.filter((e) => e.upstreamEntityType === "product").map((e) => e.upstreamEntityId))],
  };

  const liveIdeas = new Map<string, { version: number; hash: string; status: string }>();
  for (const chunk of chunkValues(upstreamByType.idea)) {
    const rows = await db.select({ id: ide.id, version: ide.version, hash: ide.semanticHash, status: ide.status }).from(ide).where(inArray(ide.id, chunk));
    for (const r of rows) liveIdeas.set(r.id, r);
  }

  const liveSources = new Map<string, { version: number; hash: string | null; status: string }>();
  for (const chunk of chunkValues(upstreamByType.source_material)) {
    const rows = await db.select({ id: sumberMateri.id, version: sumberMateri.version, hash: sumberMateri.checksum, status: sumberMateri.status }).from(sumberMateri).where(inArray(sumberMateri.id, chunk));
    for (const r of rows) liveSources.set(r.id, r);
  }

  const liveChunks = new Map<string, { version: number; hash: string; status: string }>();
  for (const chunk of chunkValues(upstreamByType.source_chunk)) {
    const rows = await db.select({ id: potonganSumber.id, version: potonganSumber.sourceVersion, hash: potonganSumber.checksum }).from(potonganSumber).where(inArray(potonganSumber.id, chunk));
    for (const r of rows) liveChunks.set(r.id, { ...r, status: "active" });
  }

  const liveProducts = new Map<string, { version: number; hash: string; status: string }>();
  for (const chunk of chunkValues(upstreamByType.product)) {
    for (const table of [artikel, diktatMateri, setFlashcard, soal, pembahasanSoal] as const) {
      const rows = await db.select({ id: table.id, version: table.version, hash: table.generationHash, status: table.status }).from(table).where(inArray(table.id, chunk));
      for (const r of rows) {
        if (!liveProducts.has(r.id)) liveProducts.set(r.id, r);
      }
    }
  }

  let staleCount = 0;
  let missingCount = 0;
  const evaluatedEdges = rawEdges.map((edge) => {
    const live = edge.upstreamEntityType === "idea"
      ? liveIdeas.get(edge.upstreamEntityId)
      : edge.upstreamEntityType === "source_material"
        ? liveSources.get(edge.upstreamEntityId)
        : edge.upstreamEntityType === "source_chunk"
          ? liveChunks.get(edge.upstreamEntityId)
          : liveProducts.get(edge.upstreamEntityId);

    const activeStatus = edge.upstreamEntityType === "source_material" || edge.upstreamEntityType === "source_chunk"
      ? "active"
      : "published";
    const isMissing = !live || live.status !== activeStatus;
    const isVersionOrHashMismatch = Boolean(
      live && (live.version !== edge.upstreamVersion || (live.hash && live.hash !== edge.upstreamHash)),
    );
    const isStale = !isMissing && (edge.freshness !== "UP_TO_DATE" || isVersionOrHashMismatch);

    let state: "up_to_date" | "stale" | "missing" = "up_to_date";
    if (isMissing) {
      state = "missing";
      missingCount++;
    } else if (isStale) {
      state = "stale";
      staleCount++;
    }

    return {
      id: edge.id,
      upstreamEntityType: edge.upstreamEntityType,
      upstreamEntityId: edge.upstreamEntityId,
      upstreamVersion: edge.upstreamVersion,
      upstreamHash: edge.upstreamHash,
      currentUpstreamVersion: live?.version ?? null,
      currentUpstreamHash: live?.hash ?? null,
      currentUpstreamStatus: live?.status ?? null,
      downstreamVersion: edge.downstreamVersion,
      downstreamHash: edge.downstreamHash,
      freshness: edge.freshness,
      state,
      reason: edge.reason,
    };
  });

  const nonPublishedIdeaLinks = ideaLinks.filter((link) => link.status && link.status !== "published");
  const ideaLinkStatus: "up_to_date" | "stale" = nonPublishedIdeaLinks.length > 0 ? "stale" : "up_to_date";
  if (nonPublishedIdeaLinks.length > 0) {
    staleCount += nonPublishedIdeaLinks.length;
  }

  const status: "up_to_date" | "stale" | "missing" | "none" = missingCount > 0
    ? "missing"
    : staleCount > 0
      ? "stale"
      : evaluatedEdges.length > 0 || ideaLinks.length > 0
        ? "up_to_date"
        : "none";

  return {
    status,
    upToDate: missingCount === 0 && staleCount === 0,
    totalCount: evaluatedEdges.length,
    staleCount,
    missingCount,
    ideaLinkStatus,
    edges: evaluatedEdges,
  };
}

async function loadQuestionExplanationAndSolution(question: typeof soal.$inferSelect) {
  const [solutionRow] = await db
    .select({
      id: pembahasanSoal.id,
      content: pembahasanSoal.content,
      status: pembahasanSoal.status,
      version: pembahasanSoal.version,
      generationHash: pembahasanSoal.generationHash,
    })
    .from(pembahasanSoal)
    .where(eq(pembahasanSoal.soalId, question.id))
    .orderBy(desc(pembahasanSoal.version))
    .limit(1);

  const [compatibility] = await db
    .select({
      correctIndices: aiQuestionBank.correctIndices,
      acceptableAnswers: aiQuestionBank.acceptableAnswers,
      explanation: aiQuestionBank.explanation,
    })
    .from(aiQuestionBank)
    .where(eq(aiQuestionBank.id, question.id))
    .limit(1);

  const solutionContent = solutionRow?.content?.trim() ? solutionRow.content : null;
  const compatibilityExplanation = compatibility?.explanation?.trim() ? compatibility.explanation : null;
  const explanationText = solutionContent ?? compatibilityExplanation ?? null;

  const optionIndicesFromSnapshot = Array.isArray(question.optionsSnapshot)
    ? question.optionsSnapshot
        .map((opt, idx) => (opt && typeof opt === "object" && (opt as { isCorrect?: boolean }).isCorrect === true ? idx : -1))
        .filter((idx) => idx >= 0)
    : [];
  const correctIndices = Array.isArray(compatibility?.correctIndices) && compatibility.correctIndices.length > 0
    ? compatibility.correctIndices
    : optionIndicesFromSnapshot;
  const acceptableAnswers = Array.isArray(compatibility?.acceptableAnswers)
    ? compatibility.acceptableAnswers
    : [];

  const solution = solutionRow
    ? {
        id: solutionRow.id,
        content: solutionContent,
        status: solutionRow.status,
        version: solutionRow.version,
        generationHash: solutionRow.generationHash,
        provenance: question.solutionProvenance ?? null,
      }
    : explanationText
      ? {
          id: null,
          content: explanationText,
          status: question.status,
          version: question.version,
          generationHash: null,
          provenance: question.solutionProvenance ?? null,
        }
      : null;

  return {
    explanation: explanationText,
    solution,
    answer: {
      correctIndices,
      acceptableAnswers,
      provenance: question.answerProvenance ?? null,
    },
  };
}

function registerKnowledgeTools(server: McpServer, principal: McpPrincipal): void {
  (server as any).registerTool("knowledge.search_course_ideas", {
    title: "Search course Ideas",
    description: "Mencari Idea published lintas bab dalam course historical reference tanpa membuka ID internal.",
    inputSchema: {
      runToken: z.string().min(1),
      query: z.string().trim().min(1).max(200),
      chapterKey: z.string().trim().min(1).optional(),
      knowledgeKinds: z.array(z.enum(IDEA_KNOWLEDGE_KINDS)).max(IDEA_KNOWLEDGE_KINDS.length).optional(),
      instructionalRoles: z.array(z.enum(IDEA_INSTRUCTIONAL_ROLES)).max(IDEA_INSTRUCTIONAL_ROLES.length).optional(),
      difficultyLevels: z.array(z.enum(IDEA_DIFFICULTY_LEVELS)).max(IDEA_DIFFICULTY_LEVELS.length).optional(),
      limit: z.number().int().min(1).max(25).default(10),
      offset: z.number().int().min(0).default(0),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, query, chapterKey, knowledgeKinds, instructionalRoles, difficultyLevels, limit, offset }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = requireReferenceWorkflow(runToken);
    const rows = await db.select({
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
      chapterId: ide.babId,
      chapterCode: bab.code,
      chapterLabel: bab.title,
    }).from(ide).leftJoin(bab, eq(bab.id, ide.babId)).where(and(eq(ide.mataKuliahId, run.courseId), eq(ide.status, "published"))).orderBy(ide.code);
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
      chapter: { key: row.chapterCode ?? row.chapterId ?? "unassigned", label: row.chapterLabel ?? "Tanpa bab" },
    }));
    const filtered = records
      .filter((record) => matchesIdeaFilters(record, { query, knowledgeKinds, instructionalRoles, difficultyLevels }))
      .filter((record) => !chapterKey || record.chapter.key === chapterKey);
    const page = filtered.slice(offset, offset + limit);
    return {
      ok: true,
      scope: runScope(run),
      totalIdeaCount: filtered.length,
      ideaCount: page.length,
      ideas: page.map((record) => ({ ideaId: record.id, code: record.code, statement: record.statement, explanation: record.explanation, latex: record.latex, knowledgeKind: record.knowledgeKind, instructionalRole: record.instructionalRole, difficultyLevel: record.difficultyLevel, version: record.version, semanticHash: record.semanticHash, chapter: record.chapter })),
      paging: { limit, offset, nextOffset: offset + limit < filtered.length ? offset + limit : null },
    };
  }));

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
    if (!idea || idea.courseId !== run.courseId || idea.status !== "published" || (run.workflow !== "reference_question_ingest" && idea.chapterId !== run.chapterId)) {
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
      scope: runScope(run),
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
    description: "Mengembalikan detail satu produk (artikel, diktat, flashcard set, atau soal) beserta isi konten, Idea links, dan status dependency.",
    inputSchema: {
      runToken: z.string().min(1),
      productType: z.enum(["article", "diktat", "flashcard_set", "question"]),
      productId: z.string().trim().min(1),
      includeContent: z.boolean().default(true),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, productType, productId, includeContent = true }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);

    if (productType === "article") {
      const [row] = await db.select().from(artikel).where(and(eq(artikel.id, productId), eq(artikel.mataKuliahId, run.courseId), eq(artikel.babId, run.chapterId))).limit(1);
      if (!row) throw new Error("AUTHORING_MCP_PRODUCT_NOT_IN_SCOPE");
      const links = await db.select({ ideId: artikelIde.ideId, code: ide.code, weight: artikelIde.weight, status: ide.status, version: ide.version, semanticHash: ide.semanticHash }).from(artikelIde).innerJoin(ide, eq(ide.id, artikelIde.ideId)).where(eq(artikelIde.artikelId, productId));
      const dependencies = await resolveProductDependencyState("article", row.id, links);
      const parsedArticle = parseArticleRowContent(row.contentMarkdown);
      const allSectionRows = includeContent
        ? await db.select().from(bagianArtikel).where(eq(bagianArtikel.artikelId, row.id)).orderBy(asc(bagianArtikel.orderIndex), asc(bagianArtikel.id))
        : [];
      const allBlockRows = includeContent
        ? await db.select().from(blokArtikel).where(eq(blokArtikel.artikelId, row.id)).orderBy(asc(blokArtikel.orderIndex), asc(blokArtikel.id))
        : [];
      const sectionRows = allSectionRows.some((sec) => sec.version === row.version)
        ? allSectionRows.filter((sec) => sec.version === row.version)
        : allSectionRows;
      const blockRows = allBlockRows.some((blk) => blk.version === row.version)
        ? allBlockRows.filter((blk) => blk.version === row.version)
        : allBlockRows;
      const sectionIdToKey = new Map(sectionRows.map((sec) => [sec.id, sec.sectionKey]));
      const parsedBlocksBySectionId = new Map<string, Array<Record<string, unknown>>>();
      const rootBlocks: Array<Record<string, unknown>> = [];
      for (const blk of blockRows) {
        const parsedBlk = parseArticleBlockContent(blk.content);
        const formattedBlk = {
          id: blk.blockKey,
          rowId: blk.id,
          sectionId: blk.bagianArtikelId ? (sectionIdToKey.get(blk.bagianArtikelId) ?? blk.bagianArtikelId) : null,
          blockType: blk.blockType,
          title: blk.title,
          orderIndex: blk.orderIndex,
          contentMarkdown: parsedBlk.contentMarkdown,
          workedExamplePayload: parsedBlk.workedExamplePayload,
          formativeCheckPayload: parsedBlk.formativeCheckPayload,
          visualIds: parsedBlk.visualIds,
          version: blk.version,
          status: blk.status,
        };
        if (blk.bagianArtikelId) {
          const list = parsedBlocksBySectionId.get(blk.bagianArtikelId) ?? [];
          list.push(formattedBlk);
          parsedBlocksBySectionId.set(blk.bagianArtikelId, list);
        } else {
          rootBlocks.push(formattedBlk);
        }
      }
      const sections = sectionRows.map((sec) => {
        const parsedSec = parseArticleSectionObjective(sec.learningObjective);
        return {
          id: sec.sectionKey,
          rowId: sec.id,
          parentSectionId: sec.parentSectionId ? (sectionIdToKey.get(sec.parentSectionId) ?? sec.parentSectionId) : null,
          learningSectionId: sec.bagianPembelajaranId,
          kind: sec.sectionKind,
          slug: sec.slug,
          title: sec.title,
          learningObjective: parsedSec.learningObjective,
          pedagogy: parsedSec.pedagogy,
          orderIndex: sec.orderIndex,
          estimatedReadingMinutes: sec.estimatedReadingMinutes,
          version: sec.version,
          status: sec.status,
          blocks: parsedBlocksBySectionId.get(sec.id) ?? [],
        };
      });
      const ideaLinks = links.map(({ ideId, code, weight }) => ({ ideId, code, weight }));
      return {
        ok: true,
        productType: "article",
        product: {
          id: row.id,
          title: row.title,
          slug: row.slug,
          version: row.version,
          status: row.status,
          structureStatus: row.structureStatus,
          sourceHash: row.sourceHash,
          generationHash: row.generationHash,
          contentMarkdown: includeContent ? parsedArticle.contentMarkdown : null,
          visuals: includeContent ? parsedArticle.visuals : [],
          sections: includeContent ? sections : [],
          blocks: includeContent ? rootBlocks : [],
        },
        content: {
          available: Boolean(parsedArticle.contentMarkdown || sections.length > 0 || rootBlocks.length > 0),
          included: includeContent,
          contentMarkdown: includeContent ? parsedArticle.contentMarkdown : null,
          visuals: includeContent ? parsedArticle.visuals : [],
          sections: includeContent ? sections : [],
          blocks: includeContent ? rootBlocks : [],
        },
        sections: includeContent ? sections : [],
        blocks: includeContent ? rootBlocks : [],
        visuals: includeContent ? parsedArticle.visuals : [],
        ideaLinks,
        dependencies,
      };
    }
    if (productType === "diktat") {
      const [row] = await db.select().from(diktatMateri).where(and(eq(diktatMateri.id, productId), eq(diktatMateri.mataKuliahId, run.courseId), eq(diktatMateri.babId, run.chapterId))).limit(1);
      if (!row) throw new Error("AUTHORING_MCP_PRODUCT_NOT_IN_SCOPE");
      const links = await db.select({ ideId: diktatIde.ideId, code: ide.code, weight: diktatIde.weight, status: ide.status, version: ide.version, semanticHash: ide.semanticHash }).from(diktatIde).innerJoin(ide, eq(ide.id, diktatIde.ideId)).where(eq(diktatIde.diktatMateriId, productId));
      const dependencies = await resolveProductDependencyState("diktat", row.id, links);
      const ideaLinks = links.map(({ ideId, code, weight }) => ({ ideId, code, weight }));
      const contentMarkdown = row.contentMarkdown ?? null;
      return {
        ok: true,
        productType: "diktat",
        product: {
          id: row.id,
          title: row.title,
          version: row.version,
          status: row.status,
          sourceHash: row.sourceHash,
          generationHash: row.generationHash,
          hasPdfFile: Boolean(row.fileKey),
          contentMarkdown: includeContent ? contentMarkdown : null,
        },
        content: {
          available: Boolean(contentMarkdown),
          included: includeContent,
          contentMarkdown: includeContent ? contentMarkdown : null,
          hasPdfFile: Boolean(row.fileKey),
        },
        ideaLinks,
        dependencies,
      };
    }
    if (productType === "flashcard_set") {
      const [row] = await db.select().from(setFlashcard).where(and(eq(setFlashcard.id, productId), eq(setFlashcard.mataKuliahId, run.courseId), eq(setFlashcard.babId, run.chapterId))).limit(1);
      if (!row) throw new Error("AUTHORING_MCP_PRODUCT_NOT_IN_SCOPE");
      const cards = includeContent
        ? await db.select({ id: flashcard.id, front: flashcard.front, back: flashcard.back, status: flashcard.status }).from(flashcard).where(eq(flashcard.setFlashcardId, productId))
        : [];
      const cardIdeaRows = await db
        .select({ ideId: flashcardIde.ideId, code: ide.code, weight: flashcardIde.weight, status: ide.status, version: ide.version, semanticHash: ide.semanticHash })
        .from(flashcardIde)
        .innerJoin(flashcard, eq(flashcard.id, flashcardIde.flashcardId))
        .innerJoin(ide, eq(ide.id, flashcardIde.ideId))
        .where(eq(flashcard.setFlashcardId, productId));
      const uniqueIdeaLinksMap = new Map<string, (typeof cardIdeaRows)[number]>();
      for (const link of cardIdeaRows) {
        if (!uniqueIdeaLinksMap.has(link.ideId)) uniqueIdeaLinksMap.set(link.ideId, link);
      }
      const uniqueIdeaLinks = [...uniqueIdeaLinksMap.values()];
      const dependencies = await resolveProductDependencyState("flashcard_set", row.id, uniqueIdeaLinks);
      const ideaLinks = uniqueIdeaLinks.map(({ ideId, code, weight }) => ({ ideId, code, weight }));
      return {
        ok: true,
        productType: "flashcard_set",
        product: {
          id: row.id,
          title: row.title,
          version: row.version,
          status: row.status,
          sourceHash: null,
          generationHash: row.generationHash,
          cardCount: cards.length,
        },
        content: {
          available: cards.length > 0,
          included: includeContent,
          cards: includeContent ? cards : [],
        },
        cards,
        ideaLinks,
        dependencies,
      };
    }
    if (productType === "question") {
      const [row] = await db.select().from(soal).where(and(eq(soal.id, productId), eq(soal.mataKuliahId, run.courseId), eq(soal.babId, run.chapterId))).limit(1);
      if (!row) throw new Error("AUTHORING_MCP_PRODUCT_NOT_IN_SCOPE");
      const links = await db.select({ ideId: soalIde.ideId, code: ide.code, weight: soalIde.weight, role: soalIde.role, status: ide.status, version: ide.version, semanticHash: ide.semanticHash }).from(soalIde).innerJoin(ide, eq(ide.id, soalIde.ideId)).where(eq(soalIde.soalId, productId));
      const dependencies = await resolveProductDependencyState("question", row.id, links);
      const detail = await loadQuestionExplanationAndSolution(row);
      const ideaLinks = links.map(({ ideId, code, weight, role }) => ({ ideId, code, weight, role }));
      return {
        ok: true,
        productType: "question",
        product: {
          id: row.id,
          questionType: row.questionType,
          prompt: includeContent ? row.prompt : null,
          optionsSnapshot: includeContent ? row.optionsSnapshot : [],
          difficulty: row.difficulty,
          cognitiveLevel: row.cognitiveLevel,
          reasoningPattern: row.reasoningPattern,
          origin: row.origin,
          version: row.version,
          status: row.status,
          quizEligible: Boolean(row.quizEligible),
          answerProvenance: row.answerProvenance ?? null,
          solutionProvenance: row.solutionProvenance ?? null,
          answer: includeContent ? detail.answer : null,
          explanation: includeContent ? detail.explanation : null,
          solution: includeContent ? detail.solution : null,
        },
        content: {
          available: Boolean(row.prompt),
          included: includeContent,
          prompt: includeContent ? row.prompt : null,
          optionsSnapshot: includeContent ? row.optionsSnapshot : [],
          answer: includeContent ? detail.answer : null,
          explanation: includeContent ? detail.explanation : null,
          solution: includeContent ? detail.solution : null,
        },
        explanation: includeContent ? detail.explanation : null,
        solution: includeContent ? detail.solution : null,
        answer: includeContent ? detail.answer : null,
        ideaLinks,
        dependencies,
      };
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
      sources: rows.map((row) => ({
        id: row.id,
        title: row.title,
        sourceType: row.sourceType,
        version: row.version,
        checksum: normalizeSha256Checksum(row.checksum),
        chunkCount: Number(row.chunkCount),
      })),
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
      source: { id: source.id, title: source.title, sourceType: source.sourceType, version: source.version, checksum: normalizeSha256Checksum(source.checksum) },
      chunks: chunks.map((chunk) => ({ id: chunk.id, sourceVersion: chunk.sourceVersion, startOffset: chunk.startOffset, endOffset: chunk.endOffset, pageNumber: chunk.pageNumber, sectionLocator: chunk.sectionLocator, checksum: normalizeSha256Checksum(chunk.checksum) })),
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
      origin: z.enum(["zyx_original", "historical_reference", "itb_example"]).optional(),
      status: z.enum(["draft", "in_review", "published", "retired"]).optional(),
      limit: z.number().int().min(1).max(200).default(100),
      offset: z.number().int().min(0).default(0),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, query, difficulty, cognitiveLevel, questionType, origin, status, limit, offset }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    const conditions = [eq(soal.mataKuliahId, run.courseId)];
    if (run.chapterId) conditions.push(eq(soal.babId, run.chapterId));
    else conditions.push(eq(soal.origin, "historical_reference"));
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
      scope: runScope(run),
      totalQuestionCount: total,
      questionCount: page.length,
      questions: page.map((row) => ({ id: row.id, questionType: row.questionType, prompt: row.prompt.length > 200 ? row.prompt.slice(0, 200) + "..." : row.prompt, difficulty: row.difficulty, cognitiveLevel: row.cognitiveLevel, reasoningPattern: row.reasoningPattern, origin: row.origin, version: row.version, status: row.status })),
      paging: { limit, offset, nextOffset: offset + limit < total ? offset + limit : null },
    };
  }));

  (server as any).registerTool("assessment.get_question", {
    title: "Get question detail",
    description: "Mengembalikan detail satu soal beserta Idea links, jawaban, pembahasan/solution, dan explanation.",
    inputSchema: {
      runToken: z.string().min(1),
      questionId: z.string().trim().min(1),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ runToken, questionId }: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    const run = readMcpRunToken(runToken);
    const questionConditions = [eq(soal.id, questionId), eq(soal.mataKuliahId, run.courseId)];
    if (run.chapterId) questionConditions.push(eq(soal.babId, run.chapterId));
    else questionConditions.push(eq(soal.origin, "historical_reference"));
    const [question] = await db.select().from(soal).where(and(...questionConditions)).limit(1);
    if (!question) throw new Error("AUTHORING_MCP_QUESTION_NOT_IN_SCOPE");
    const links = await db.select({ ideId: soalIde.ideId, code: ide.code, weight: soalIde.weight, role: soalIde.role }).from(soalIde).innerJoin(ide, eq(ide.id, soalIde.ideId)).where(eq(soalIde.soalId, questionId));
    const referenceLinks = await db.select({
      referenceQuestionId: questionReferenceLinks.referenceQuestionId,
      role: questionReferenceLinks.role,
      notes: questionReferenceLinks.notes,
    }).from(questionReferenceLinks).where(eq(questionReferenceLinks.questionId, questionId));
    const detail = await loadQuestionExplanationAndSolution(question);
    return {
      ok: true,
      scope: runScope(run),
      question: {
        id: question.id,
        questionType: question.questionType,
        prompt: question.prompt,
        optionsSnapshot: question.optionsSnapshot,
        difficulty: question.difficulty,
        cognitiveLevel: question.cognitiveLevel,
        reasoningPattern: question.reasoningPattern,
        origin: question.origin,
        version: question.version,
        status: question.status,
        quizEligible: Boolean(question.quizEligible),
        answerProvenance: question.answerProvenance ?? null,
        solutionProvenance: question.solutionProvenance ?? null,
        answer: detail.answer,
        explanation: detail.explanation,
        solution: detail.solution,
      },
      explanation: detail.explanation,
      solution: detail.solution,
      answer: detail.answer,
      ideaLinks: links,
      referenceLinks,
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
      .where(and(eq(soal.mataKuliahId, run.courseId), ...(run.chapterId ? [eq(soal.babId, run.chapterId)] : [eq(soal.origin, "historical_reference")]), eq(soal.status, "published")));

    const difficultyDistribution = { easy: 0, medium: 0, hard: 0 };
    const cognitiveDistribution = { remember: 0, understand: 0, apply: 0, analyze: 0, evaluate: 0, create: 0 };
    const originDistribution = { zyx_original: 0, historical_reference: 0, itb_example: 0 };
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

function registerQuizAssemblyTools(server: McpServer, principal: McpPrincipal): void {
  (server as any).registerTool("quiz.create", {
    title: "Create Quiz",
    description: "Membuat entitas kuis utuh pada mata kuliah tertentu dengan judul, durasi, dan daftar butir soal (fixedQuestionIds).",
    inputSchema: {
      courseKey: z.string().trim().min(1),
      title: z.string().trim().min(1).max(255),
      questionIds: z.array(z.string().trim().min(1)).min(1),
      chapterKey: z.string().trim().min(1).optional(),
      category: z.enum(["chapter", "weekly", "daily", "simulation", "premium"]).default("chapter"),
      timeLimitSeconds: z.number().int().min(60).optional(),
      maxAttempts: z.number().int().min(1).nullable().optional(),
      visibility: z.enum(["free", "paid"]).default("free"),
      status: z.enum(["draft", "published"]).default("draft"),
      manualStatus: z.enum(["open", "closed", "scheduled"]).default("scheduled"),
      showDiscussion: z.boolean().default(true),
      shuffleQuestions: z.boolean().default(false),
      shuffleOptions: z.boolean().default(false),
      canGoBack: z.boolean().default(true),
      requireAllAnswered: z.boolean().default(false),
      passingScore: z.number().min(0).max(100).default(70),
      runToken: z.string().min(1).optional(),
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (input: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:stage");
    verifyMcpExecutionBootstrap({
      actorId: principal.actorId,
      sessionId: principal.sessionId,
      run: input.runToken ? readMcpRunToken(input.runToken) : null,
      bootstrapToken: input.bootstrapToken,
    });
    return createQuizWithQuestions(input, principal.actorId);
  }));

  (server as any).registerTool("quiz.get", {
    title: "Get Quiz Details",
    description: "Mengambil detail konfigurasi kuis beserta daftar soal yang terpasang.",
    inputSchema: {
      quizId: z.string().trim().min(1),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ quizId }: { quizId: string }) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    return getQuizDetail(quizId);
  }));

  (server as any).registerTool("quiz.list", {
    title: "List Quizzes",
    description: "Melihat daftar kuis yang terdaftar pada suatu mata kuliah.",
    inputSchema: {
      courseKey: z.string().trim().min(1),
      category: z.enum(["chapter", "weekly", "daily", "simulation", "premium"]).optional(),
      status: z.enum(["draft", "published"]).optional(),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (input: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:read");
    return listQuizzes(input);
  }));

  (server as any).registerTool("quiz.update", {
    title: "Update Quiz Metadata",
    description: "Memperbarui metadata kuis (judul, kategori, durasi, status, visibilitas).",
    inputSchema: {
      quizId: z.string().trim().min(1),
      title: z.string().trim().min(1).max(255).optional(),
      category: z.enum(["chapter", "weekly", "daily", "simulation", "premium"]).optional(),
      timeLimitSeconds: z.number().int().min(60).nullable().optional(),
      maxAttempts: z.number().int().min(1).nullable().optional(),
      status: z.enum(["draft", "published"]).optional(),
      visibility: z.enum(["free", "paid"]).optional(),
      manualStatus: z.enum(["open", "closed", "scheduled"]).optional(),
      showDiscussion: z.boolean().optional(),
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (input: any) => safeTool(async () => {
    requireMcpScope(principal, "authoring:stage");
    verifyMcpExecutionBootstrap({
      actorId: principal.actorId,
      sessionId: principal.sessionId,
      bootstrapToken: input.bootstrapToken,
    });
    return updateQuizMeta(input, principal.actorId);
  }));

  (server as any).registerTool("quiz.set_questions", {
    title: "Set Quiz Questions",
    description: "Mengganti atau mengatur ulang daftar butir soal (fixedQuestionIds) pada kuis dan menyinkronkan item_asesmen.",
    inputSchema: {
      quizId: z.string().trim().min(1),
      questionIds: z.array(z.string().trim().min(1)).min(1),
      bootstrapToken: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ quizId, questionIds, bootstrapToken }: { quizId: string; questionIds: string[]; bootstrapToken?: string }) => safeTool(async () => {
    requireMcpScope(principal, "authoring:stage");
    verifyMcpExecutionBootstrap({
      actorId: principal.actorId,
      sessionId: principal.sessionId,
      bootstrapToken,
    });
    return setQuizQuestions(quizId, questionIds, principal.actorId);
  }));
}

export function createAuthoringMcpServer(principal: McpPrincipal, requestId?: string, skillsProfile: SkillCatalogProfile = "chatgpt"): McpServer {
  const server = new McpServer(
    { name: "zyx-authoring", version: "1.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Panggil workflow.get_playbook sebelum memulai authoring, setiap berpindah tahap, dan saat melanjutkan run untuk mengambil playbook terbaru serta bootstrapToken bertanda tangan.",
    },
  );
  registerWorkflowTools(server, principal, requestId);
  registerProductV4Tools(server, principal);
  registerAuthoringSkills(server, skillsProfile, undefined, resolveAuthoringMcpEnvironment());
  registerValidationTools(server, principal);
  registerReferenceQuestionTools(server, principal);
  registerLifecycleTools(server, principal);
  registerKnowledgeTools(server, principal);
  registerAnalysisTools(server, principal);
  registerAssessmentAnalysisTools(server, principal);
  registerQuizAssemblyTools(server, principal);
  return server;
}
