import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getAuthoringCourseOption, listAuthoringCourseOptions } from "@/lib/authoring/catalog";
import { validateSourcePack, type ValidatedSourcePack } from "@/lib/authoring/source-pack";
import { evaluateSourcePackQuality, type SourcePackQualityReport } from "@/lib/authoring/quality/source-pack";
import { ZipSecurityError } from "@/lib/bundle/zip-reader";
import { resolveAuthSecret } from "@/lib/auth-secret";

export const AUTHORING_MCP_VERSION = "authoring-mcp.v1";
export const AUTHORING_MCP_MAX_SOURCE_PACK_BYTES = 64 * 1024 * 1024;
export const AUTHORING_MCP_MAX_BUNDLE_BYTES = 32 * 1024 * 1024;
export const AUTHORING_MCP_MAX_ORIGINAL_BYTES = 32 * 1024 * 1024;
export const MCP_CONNECTION_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export const authoringWorkflowSchema = z.enum(["idea_product", "quiz_bank", "reference_question_ingest"]);
export type AuthoringWorkflow = z.infer<typeof authoringWorkflowSchema>;

type SignedTokenKind = "course_choice" | "chapter_choice" | "source_file" | "source" | "run" | "connection" | "client";

type SignedTokenPayload = {
  kind: SignedTokenKind;
  issuedAt: number;
  expiresAt: number;
  [key: string]: unknown;
};

type SourceTokenPayload = SignedTokenPayload & {
  kind: "source";
  checksum: string;
  packId: string;
  name: string;
  summary: SourcePackSummary;
  courseId?: string;
  chapterId?: string;
};

type McpSourceFileReference = {
  materialId: string;
  storageKey: string;
  courseId: string;
  chapterId?: string;
  legacyCourseId: string;
  legacyChapterId?: string;
  updatedAtMs: number;
  checksum: string | null;
};

export type McpSourceFileTokenPayload = SignedTokenPayload & McpSourceFileReference & {
  kind: "source_file";
};

type RunSourceFields = {
  sourcePackChecksum: string | null;
  sourcePackId: string | null;
  sourcePackName: string | null;
  sourcePackSummary: SourcePackSummary | null;
};

type RunTokenPayload = SignedTokenPayload & {
  kind: "run";
  runId: string;
  workflow: AuthoringWorkflow;
  courseId: string;
  chapterId: string;
  courseLabel: string;
  chapterLabel: string;
} & RunSourceFields;

export type McpConnectionTokenPayload = SignedTokenPayload & {
  kind: "connection";
  userId: string;
  sessionId: string;
  clientId: string;
  resource: string;
  scopes: string[];
};

export type McpClientPayload = SignedTokenPayload & {
  kind: "client";
  clientName: string;
  redirectUris: string[];
};

export const MCP_AUTHORING_DEFAULT_SCOPES = ["authoring:read", "authoring:stage"] as const;
export const MCP_AUTHORING_SCOPES = [
  ...MCP_AUTHORING_DEFAULT_SCOPES,
  "authoring:review",
  "authoring:withdraw",
] as const;

export type SourcePackSummary = {
  packId: string;
  name: string;
  archiveChecksum: string;
  documentCount: number;
  unitCount: number;
  sectionCount: number;
  questionCount: number;
  solutionCount: number;
  quality: SourcePackQualityReport;
  documents: Array<{
    id: string;
    title: string;
    role: string;
    unitKind: string;
    expectedUnits: number;
    sectionCount: number;
    counts: ValidatedSourcePack["documents"][number]["counts"];
  }>;
};

export type SourceSummary = SourcePackSummary;

export type AuthoringWorkflowOption = {
  key: AuthoringWorkflow;
  label: string;
  description: string;
  sourcePackRequired: boolean;
  scope: ["course", "chapter"] | ["course"];
  reviewRequired: true;
  publicationTarget: "idea_and_product_review" | "quiz_bank_review" | "reference_question_review";
};

const WORKFLOW_OPTIONS: readonly AuthoringWorkflowOption[] = [
  {
    key: "idea_product",
    label: "Idea dan Product Bundle",
    description: "Menyusun Idea Bundle lalu Product Bundle dari Source Pack yang sama.",
    sourcePackRequired: true,
    scope: ["course", "chapter"],
    reviewRequired: true,
    publicationTarget: "idea_and_product_review",
  },
  {
    key: "quiz_bank",
    label: "Bank soal kuis",
    description: "Menyusun draft soal yang terhubung ke Idea published, dengan atau tanpa Source Pack konteks.",
    sourcePackRequired: false,
    scope: ["course", "chapter"],
    reviewRequired: true,
    publicationTarget: "quiz_bank_review",
  },
  {
    key: "reference_question_ingest",
    label: "Soal referensi historis",
    description: "Mengimpor soal historis dari source tersimpan, mempertahankan provenance, dan mengaitkannya ke Idea published.",
    sourcePackRequired: false,
    scope: ["course"],
    reviewRequired: true,
    publicationTarget: "reference_question_review",
  },
];

function signingSecret(): string {
  return createHmac("sha256", resolveAuthSecret()).update("zyx-authoring-mcp.v1", "utf8").digest("hex");
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("AUTHORING_MCP_TOKEN_INVALID");
  }
}

function signature(body: string): string {
  return createHmac("sha256", signingSecret()).update(body, "utf8").digest("base64url");
}

function issueToken(payload: Omit<SignedTokenPayload, "issuedAt" | "expiresAt"> & { ttlMs: number }): string {
  const now = Date.now();
  const body = encode({
    ...payload,
    issuedAt: now,
    expiresAt: now + payload.ttlMs,
  });
  return `${body}.${signature(body)}`;
}

function verifyToken<T extends SignedTokenPayload>(token: string, expectedKind: SignedTokenKind): T {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("AUTHORING_MCP_TOKEN_INVALID");
  const expectedSignature = signature(parts[0]);
  const receivedBytes = Buffer.from(parts[1], "utf8");
  const expectedBytes = Buffer.from(expectedSignature, "utf8");
  if (receivedBytes.length !== expectedBytes.length || !timingSafeEqual(receivedBytes, expectedBytes)) {
    throw new Error("AUTHORING_MCP_TOKEN_INVALID");
  }
  const parsed = z.object({
    kind: z.string(),
    issuedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
  }).passthrough().safeParse(decode(parts[0]));
  if (!parsed.success || parsed.data.kind !== expectedKind || parsed.data.expiresAt <= Date.now()) {
    throw new Error(parsed.success && parsed.data.expiresAt <= Date.now() ? "AUTHORING_MCP_TOKEN_EXPIRED" : "AUTHORING_MCP_TOKEN_INVALID");
  }
  return parsed.data as T;
}

function optionToken(kind: "course_choice" | "chapter_choice", value: { courseId: string; chapterId?: string }): string {
  return issueToken({ kind, ...value, ttlMs: 60 * 60 * 1000 });
}

export function sourceSummary(sourcePack: ValidatedSourcePack, quality: SourcePackQualityReport): SourcePackSummary {
  return {
    packId: sourcePack.manifest.packId,
    name: sourcePack.manifest.name,
    archiveChecksum: sourcePack.archive.checksum,
    documentCount: sourcePack.documents.length,
    unitCount: sourcePack.documents.reduce((total, document) => total + document.expectedUnits, 0),
    sectionCount: sourcePack.documents.reduce((total, document) => total + document.sections.length, 0),
    questionCount: sourcePack.documents.reduce((total, document) => total + document.counts.questions, 0),
    solutionCount: sourcePack.documents.reduce((total, document) => total + document.counts.solutions, 0),
    quality,
    documents: sourcePack.documents.map((document) => ({
      id: document.id,
      title: document.title,
      role: document.role,
      unitKind: document.unitKind,
      expectedUnits: document.expectedUnits,
      sectionCount: document.sections.length,
      counts: document.counts,
    })),
  };
}

function decodeBase64(value: string, maxBytes: number): Uint8Array {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) throw new Error("AUTHORING_MCP_BASE64_INVALID");
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const bytes = new Uint8Array(Buffer.from(normalized, "base64"));
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) throw new Error("AUTHORING_MCP_ARTIFACT_LIMIT");
  return bytes;
}

export function listAuthoringWorkflows(): readonly AuthoringWorkflowOption[] {
  return WORKFLOW_OPTIONS;
}

export function getAuthoringWorkflow(workflow: AuthoringWorkflow): AuthoringWorkflowOption {
  const option = WORKFLOW_OPTIONS.find((item) => item.key === workflow);
  if (!option) throw new Error("AUTHORING_MCP_WORKFLOW_INVALID");
  return option;
}

export async function listMcpCourseChoices() {
  const courses = await listAuthoringCourseOptions();
  return courses.map((course) => ({
    key: optionToken("course_choice", { courseId: course.id }),
    code: course.code,
    label: course.title,
    chapterCount: course.chapters.length,
  }));
}

export async function listMcpChapterChoices(courseKey: string) {
  const coursePayload = verifyToken<SignedTokenPayload & { kind: "course_choice"; courseId: string }>(courseKey, "course_choice");
  const course = await getAuthoringCourseOption(coursePayload.courseId);
  if (!course) throw new Error("AUTHORING_MCP_COURSE_NOT_FOUND");
  return course.chapters.map((chapter) => ({
    key: optionToken("chapter_choice", { courseId: course.id, chapterId: chapter.id }),
    code: chapter.code,
    label: chapter.title,
    orderIndex: chapter.orderIndex,
  }));
}

function sourceFileEncryptionKey(): Buffer {
  return Buffer.from(signingSecret(), "hex");
}

function sealSourceFileReference(reference: McpSourceFileReference): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sourceFileEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(reference), "utf8"), cipher.final()]);
  return [iv.toString("base64url"), encrypted.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

function openSourceFileReference(value: string): McpSourceFileReference {
  try {
    const [ivValue, encryptedValue, tagValue, ...rest] = value.split(".");
    if (!ivValue || !encryptedValue || !tagValue || rest.length > 0) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", sourceFileEncryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return z.object({
      materialId: z.string().min(1),
      storageKey: z.string().min(1),
      courseId: z.string().min(1),
      chapterId: z.string().min(1).optional(),
      legacyCourseId: z.string().min(1),
      legacyChapterId: z.string().min(1).optional(),
      updatedAtMs: z.number().int().nonnegative(),
      checksum: z.string().nullable(),
    }).strict().parse(JSON.parse(plaintext));
  } catch {
    throw new Error("AUTHORING_MCP_TOKEN_INVALID");
  }
}

export function readMcpCatalogScope(courseKey: string, chapterKey: string): { courseId: string; chapterId: string } {
  const course = verifyToken<SignedTokenPayload & { kind: "course_choice"; courseId: string }>(courseKey, "course_choice");
  const chapter = verifyToken<SignedTokenPayload & { kind: "chapter_choice"; courseId: string; chapterId: string }>(chapterKey, "chapter_choice");
  if (course.courseId !== chapter.courseId) throw new Error("AUTHORING_MCP_SCOPE_MISMATCH");
  return { courseId: course.courseId, chapterId: chapter.chapterId };
}

export function readMcpCourseChoice(courseKey: string): { courseId: string } {
  const course = verifyToken<SignedTokenPayload & { kind: "course_choice"; courseId: string }>(courseKey, "course_choice");
  return { courseId: course.courseId };
}

export function issueMcpSourceFileKey(input: {
  materialId: string;
  storageKey: string;
  courseId: string;
  chapterId?: string;
  legacyCourseId: string;
  legacyChapterId?: string;
  updatedAtMs: number;
  checksum: string | null;
}): string {
  return issueToken({ kind: "source_file", reference: sealSourceFileReference(input), ttlMs: 60 * 60 * 1000 });
}

export function readMcpSourceFileKey(fileKey: string): McpSourceFileTokenPayload {
  const token = verifyToken<SignedTokenPayload & { kind: "source_file"; reference: string }>(fileKey, "source_file");
  const { reference, ...signed } = token;
  return { ...signed, ...openSourceFileReference(reference) } as McpSourceFileTokenPayload;
}

export function ingestMcpSourcePack(
  filename: string,
  contentBase64: string,
  originals?: ReadonlyMap<string, Uint8Array>,
  boundScope?: { courseId: string; chapterId: string },
) {
  if (!filename.trim()) throw new Error("SOURCE_PACK_FILE_REQUIRED");
  const bytes = decodeBase64(contentBase64, AUTHORING_MCP_MAX_SOURCE_PACK_BYTES);
  let sourcePack: ValidatedSourcePack;
  try {
    sourcePack = validateSourcePack(bytes);
  } catch (error) {
    const raw = error instanceof ZipSecurityError ? error.code : error instanceof Error ? error.message : "SOURCE_PACK_INVALID";
    const [code, ...details] = raw.split(":");
    return {
      ok: false as const,
      error: code,
      detail: details.join(":") || undefined,
    };
  }

  const quality = evaluateSourcePackQuality(sourcePack, originals);
  if (!quality.valid) {
    return {
      ok: false as const,
      valid: false as const,
      filename,
      quality,
      issues: quality.issues,
      next: "agent_revision" as const,
    };
  }
  const summary = sourceSummary(sourcePack, quality);
  const sourcePackToken = issueToken({
    kind: "source",
    checksum: sourcePack.archive.checksum,
    packId: sourcePack.manifest.packId,
    name: sourcePack.manifest.name,
    summary,
    ...(boundScope ? { courseId: boundScope.courseId, chapterId: boundScope.chapterId } : {}),
    ttlMs: 24 * 60 * 60 * 1000,
  });
  return {
    ok: true as const,
    filename,
    sourcePackToken,
    source: summary,
    quality,
  };
}

export function issueSourcePackToken(input: {
  checksum: string;
  packId: string;
  name: string;
  summary: SourcePackSummary;
  courseId?: string;
  chapterId?: string;
  ttlMs?: number;
}): string {
  return issueToken({
    kind: "source",
    checksum: input.checksum,
    packId: input.packId,
    name: input.name,
    summary: input.summary,
    ...(input.courseId && input.chapterId ? { courseId: input.courseId, chapterId: input.chapterId } : {}),
    ttlMs: input.ttlMs ?? 24 * 60 * 60 * 1000,
  });
}

export function readMcpSourcePackBinding(sourcePackToken: string): { courseId?: string; chapterId?: string } {
  const source = verifyToken<SourceTokenPayload>(sourcePackToken, "source");
  return { courseId: source.courseId, chapterId: source.chapterId };
}

export function assertMcpSourceScopeBinding(
  source: { courseId?: string; chapterId?: string },
  selected: { courseId: string; chapterId: string },
): void {
  if ((source.courseId && source.courseId !== selected.courseId) || (source.chapterId && source.chapterId !== selected.chapterId)) {
    throw new Error("AUTHORING_MCP_SOURCE_SCOPE_MISMATCH");
  }
}

export async function startAuthoringWorkflow(input: {
  workflow: AuthoringWorkflow;
  sourcePackToken?: string;
  courseKey: string;
  chapterKey?: string;
}) {
  const workflow = getAuthoringWorkflow(input.workflow);
  const courseChoice = verifyToken<SignedTokenPayload & { kind: "course_choice"; courseId: string }>(input.courseKey, "course_choice");
  if (workflow.key === "reference_question_ingest") {
    if (input.chapterKey || input.sourcePackToken) throw new Error("WORKFLOW_SCOPE_INVALID");
    const course = await getAuthoringCourseOption(courseChoice.courseId);
    if (!course) throw new Error("AUTHORING_MCP_COURSE_NOT_FOUND");
    const runId = `mcp-run-${randomUUID()}`;
    const runToken = issueToken({
      kind: "run",
      runId,
      workflow: workflow.key,
      courseId: course.id,
      courseLabel: course.title,
      sourcePackChecksum: null,
      sourcePackId: null,
      sourcePackName: null,
      sourcePackSummary: null,
      ttlMs: 7 * 24 * 60 * 60 * 1000,
    });
    return {
      runToken,
      runId,
      workflow,
      scope: { course: course.title },
      source: null,
      next: [
        "source.list_reference_files",
        "source.read_file",
        "knowledge.search_course_ideas",
        "knowledge.get_idea",
        "assessment.validate_reference_draft",
        "assessment.submit_reference_draft",
        "assessment.list_reference_questions",
        "assessment.get_reference_question",
      ],
    };
  }
  if (!input.chapterKey) throw new Error("AUTHORING_MCP_CHAPTER_REQUIRED");
  const chapterChoice = verifyToken<SignedTokenPayload & { kind: "chapter_choice"; courseId: string; chapterId: string }>(input.chapterKey, "chapter_choice");
  if (chapterChoice.courseId !== courseChoice.courseId) throw new Error("AUTHORING_MCP_SCOPE_MISMATCH");
  let source: Pick<SourceTokenPayload, "checksum" | "packId" | "name" | "summary" | "courseId" | "chapterId"> | null = null;
  if (input.sourcePackToken) {
    source = verifyToken<SourceTokenPayload>(input.sourcePackToken, "source");
    assertMcpSourceScopeBinding(source, { courseId: courseChoice.courseId, chapterId: chapterChoice.chapterId });
  } else if (workflow.sourcePackRequired) {
    throw new Error("AUTHORING_MCP_SOURCE_PACK_REQUIRED");
  }

  const course = await getAuthoringCourseOption(courseChoice.courseId);
  if (!course) throw new Error("AUTHORING_MCP_COURSE_NOT_FOUND");
  const chapter = course.chapters.find((item) => item.id === chapterChoice.chapterId);
  if (!chapter) throw new Error("AUTHORING_MCP_CHAPTER_NOT_FOUND");
  const runId = `mcp-run-${randomUUID()}`;
  const runToken = issueToken({
    kind: "run",
    runId,
    workflow: workflow.key,
    courseId: course.id,
    chapterId: chapter.id,
    courseLabel: course.title,
    chapterLabel: chapter.title,
    sourcePackChecksum: source?.checksum ?? null,
    sourcePackId: source?.packId ?? null,
    sourcePackName: source?.name ?? null,
    sourcePackSummary: source?.summary ?? null,
    ttlMs: 7 * 24 * 60 * 60 * 1000,
  });
  return {
    runToken,
    runId,
    workflow,
    scope: { course: course.title, chapter: chapter.title },
    source: source ? { packId: source.packId, name: source.name, checksum: source.checksum } : null,
    next: workflow.key === "idea_product"
      ? ["authoring.validate_idea_bundle", "authoring.submit_idea_bundle", "authoring.validate_product_bundle", "authoring.submit_product_bundle"]
      : [
        "assessment.list_ideas",
        "assessment.get_idea",
        "assessment.list_questions",
        "assessment.get_question",
        "assessment.list_reference_questions",
        "assessment.get_reference_question",
        "assessment.validate_quiz_draft",
        "assessment.submit_quiz_draft",
      ],
  };
}

export function readMcpRunToken(runToken: string): RunTokenPayload {
  return verifyToken<RunTokenPayload>(runToken, "run");
}

export function issueMcpRunToken(input: {
  runId?: string;
  workflow?: AuthoringWorkflow;
  courseId: string;
  chapterId?: string;
  courseLabel?: string;
  chapterLabel?: string;
  sourcePackChecksum?: string | null;
  sourcePackId?: string | null;
  sourcePackName?: string | null;
  sourcePackSummary?: string | null;
  ttlMs?: number;
}): string {
  const workflow = input.workflow ?? "idea_product";
  if (workflow !== "reference_question_ingest" && !input.chapterId) throw new Error("AUTHORING_MCP_CHAPTER_REQUIRED");
  if (workflow === "reference_question_ingest" && input.chapterId) throw new Error("WORKFLOW_SCOPE_INVALID");
  return issueToken({
    kind: "run",
    runId: input.runId ?? `mcp-run-${randomUUID()}`,
    workflow,
    courseId: input.courseId,
    ...(input.chapterId ? { chapterId: input.chapterId } : {}),
    courseLabel: input.courseLabel ?? input.courseId,
    ...(input.chapterLabel || input.chapterId ? { chapterLabel: input.chapterLabel ?? input.chapterId } : {}),
    sourcePackChecksum: input.sourcePackChecksum ?? null,
    sourcePackId: input.sourcePackId ?? null,
    sourcePackName: input.sourcePackName ?? null,
    sourcePackSummary: input.sourcePackSummary ?? null,
    ttlMs: input.ttlMs ?? 7 * 24 * 60 * 60 * 1000,
  });
}

export function issueMcpConnectionToken(input: {
  userId: string;
  sessionId: string;
  clientId: string;
  resource: string;
  scopes: readonly string[];
}) {
  return issueToken({
    kind: "connection",
    userId: input.userId,
    sessionId: input.sessionId,
    clientId: input.clientId,
    resource: input.resource,
    scopes: [...input.scopes],
    ttlMs: MCP_CONNECTION_TOKEN_TTL_SECONDS * 1000,
  });
}

export function readMcpConnectionToken(token: string): McpConnectionTokenPayload {
  return verifyToken<McpConnectionTokenPayload>(token, "connection");
}

export function issueMcpClientId(input: { clientName?: string; redirectUris: readonly string[] }): string {
  return issueToken({
    kind: "client",
    clientName: input.clientName?.trim() || "MCP client",
    redirectUris: [...input.redirectUris],
    ttlMs: 365 * 24 * 60 * 60 * 1000,
  });
}

export function readMcpClientId(clientId: string): McpClientPayload {
  return verifyToken<McpClientPayload>(clientId, "client");
}

export function publicMcpRun(runToken: string) {
  const run = readMcpRunToken(runToken);
  return {
    runId: run.runId,
    workflow: getAuthoringWorkflow(run.workflow),
    scope: run.chapterLabel ? { course: run.courseLabel, chapter: run.chapterLabel } : { course: run.courseLabel },
    source: run.sourcePackId
      ? {
        packId: run.sourcePackId,
        name: run.sourcePackName,
        checksum: run.sourcePackChecksum,
        summary: run.sourcePackSummary,
      }
      : null,
  };
}

export function quizBankScopeGuidance() {
  return {
    difficulty: ["easy", "medium", "hard"],
    cognitiveLevel: ["remember", "understand", "apply", "analyze", "evaluate", "create"],
    questionType: ["multiple_choice", "multiple_choices", "short_answer", "essay"],
    ideaRole: ["primary", "supporting", "required"],
    linkingPolicy: {
      required: false,
      recommended: true,
      weightRule: "Jika satu atau lebih Idea dipilih, bobot positif harus berjumlah tepat 1.",
      scopeRule: "Idea yang dirujuk wajib published, satu mata kuliah, dan satu bab dengan run yang dikunci.",
    },
    tagsRule: "Tag bebas berupa string singkat; gunakan huruf kecil dan konsisten, misalnya nama subtopik bab.",
    catalogTool: "assessment.list_ideas",
    detailTool: "assessment.get_idea",
    historicalReferenceTools: {
      listTool: "assessment.list_reference_questions",
      detailTool: "assessment.get_reference_question",
      listLimit: { default: 10, maximum: 10 },
      detailLimit: { maximumPerIdea: 5 },
      lineageRoles: ["inspired_by", "adapted_from", "derived_from"],
      procedure: [
        "Kunci target Idea published dalam scope chapter.",
        "Baca bank soal Zyx original yang sudah ada.",
        "Cari maksimal 10 historical reference per Idea, lalu baca maksimal 5 detail yang relevan.",
        "Gunakan hasil itu untuk gap analysis, bukan untuk menyalin verbatim ke bank soal Zyx.",
        "Soal original yang terinspirasi harus menyimpan referenceLinks dengan role dan tetap origin zyx_original.",
      ],
    },
    coverageHint: "Setiap Idea pada katalog sebaiknya dicover minimal satu soal; MCP melaporkan gap sebagai warning.",
  };
}

export function productBundleV3Contract() {
  return {
    schemaVersion: "product-bundle.v3",
    compatibleReadVersions: ["product-bundle.v2", "product-bundle.v3"],
    writeEntityTypes: ["article", "diktat", "flashcard_set", "flashcard"],
    forbiddenAssessmentEntityTypes: ["question", "solution", "assessment_blueprint"],
    scopeBoundary: {
      learnerProductsOnly: true,
      assessmentProductsForbidden: true,
      historicalReferenceWorkflow: "reference_question_ingest",
      originalQuestionWorkflow: "quiz_bank",
      compatibility: "Existing Product Bundle V2 assessment rows remain readable through legacy readers, but new MCP Product submissions cannot create them.",
    },
    assessmentWorkflowBoundary: "Questions and their historical references belong to reference_question_ingest or quiz_bank, never a new Product Bundle submission.",
    toolSequence: [
      "authoring.validate_product_bundle",
      "authoring.submit_product_bundle",
      "authoring.restage_product_bundle",
      "authoring.review_product_bundle",
    ],
    validationTool: "authoring.validate_product_bundle",
    submitTool: "authoring.submit_product_bundle",
    restageTool: "authoring.restage_product_bundle",
    reviewTool: "authoring.review_product_bundle",
    reviewRequired: true,
    ideaPublicationRequired: true,
    publicationPermitted: false,
    evaluationStages: {
      authorPreflight: "Local AST compilation, schema validation, and quality policy gate checking prior to submission.",
      deterministicValid: "Pure content validity checking pedagogy references, payloads, and typed visuals. Independent from admin review and PDF evidence.",
      adminReview: "Pedagogic quality assessment across eight criteria with content anchors and approved exceptions.",
      pdfEvidence: "Diktat PDF rendering evidence states: pending, ready, failed, stale; ready requires 2-4 pages.",
      publicationReady: "Final readiness requiring valid content, approved review with matching fingerprint and policy, and ready PDF evidence.",
    },
    pedagogyFields: {
      section: {
        objectives: "Array of learning objectives with id, description, explanationBlockIds, and formativeCheckBlockIds.",
        prerequisites: "Array of prerequisite references with id, type (section, idea, or external), label, and supportBlockIds.",
        symbols: "Array of introduced mathematical or domain symbols with symbol, meaning, condition, and introductionBlockId.",
        timeEstimate: "Reading, worked examples, and practice minutes heuristics (readingMinutes, examplesMinutes, practiceMinutes).",
        visualRequirement: "Required with visualIds or not_required with justification reason.",
      },
      blocks: {
        workedExamplePayload: {
          targetBlockType: "worked_example",
          fields: {
            steps: "Contiguous 0-indexed steps with stepIndex, label, explanation, and reason.",
            verification: "Explicit verification or sanity check of the solution.",
          },
        },
        formativeCheckPayload: {
          targetBlockTypes: ["retrieval_prompt", "retrieval_close"],
          fields: {
            checkKind: "multiple_choice, short_answer, numeric_answer, or conceptual_explanation. These are learning checks, not assessment products.",
            answer: "Canonical answer key.",
            explanation: "Self-study explanation or solution walkthrough.",
            options: "For multiple_choice, at least 2 options with id, text, and exactly 1 marked isCorrect.",
            evaluation: "Optional typed evaluator: choice, text_exact, numeric, or ai_rubric. The mode must match checkKind; omitted evaluation keeps the check readable and reveal-only.",
            feedbackPolicy: "Optional learner feedback policy with at most 3 progressive hints and an allowRetry boolean.",
          },
        },
      },
    },
    typedVisuals: {
      supportedKinds: ["epsilon_delta_graph"],
      specFields: {
        id: "Unique visual identifier within article registry.",
        kind: "epsilon_delta_graph",
        label: "Accessible visual title or label.",
        description: "Detailed description for screen readers and search.",
        bounds: "Numeric bounding box: xMin, xMax, yMin, yMax with xMin < xMax and yMin < yMax.",
        limitPoint: "Approached limit point c.",
        limitValue: "Function limit value L.",
        defaultEpsilon: "Default initial epsilon tolerance band.",
        defaultDelta: "Default initial delta radius.",
        functionModel: "constant (c), linear (m, b), or quadratic (a, b, c).",
        staticFallback: "table (summary, headers, rows) or text (summary, content).",
      },
      securityRestrictions: "No executable JavaScript or eval, no raw HTML, and no raw SVG.",
    },
    reviewRubric: {
      criteriaCount: 8,
      criteria: [
        "concept_accuracy",
        "prerequisite_completeness",
        "explanation_sequence",
        "symbol_and_condition_clarity",
        "example_reasoning",
        "representation_or_visual",
        "misconceptions_and_limits",
        "formative_check_and_explanation",
      ],
      statuses: ["not_met", "needs_revision", "met"],
      anchorTargetTypes: ["document", "section", "block", "visual"],
      exceptionPolicy: "Non-met criteria require an explicit approved exception with justification reason.",
    },
    pdfEvidenceStates: {
      statuses: ["pending", "ready", "failed", "stale"],
      readyPageRange: { minPages: 2, maxPages: 4 },
      safeFailureCodes: [
        "RENDER_TIMEOUT",
        "LAYOUT_OVERFLOW",
        "FONT_MISSING",
        "FORMULA_RENDER_ERROR",
        "STORAGE_UNAVAILABLE",
        "INVALID_SOURCE_MARKDOWN",
        "PAGE_BUDGET_EXCEEDED",
      ],
    },
    remediationWorkflow: {
      deterministicIssues: "Resolve reported diagnostic issues pointing to specific section, block, or visual targets.",
      staleReview: "Resubmit modified draft and record fresh review matching the updated content fingerprint.",
      stalePdfEvidence: "Re-render PDF artifact against modified article or diktat generation hash.",
    },
  };
}

export function workflowContract(runToken: string) {
  const run = readMcpRunToken(runToken);
  const workflow = getAuthoringWorkflow(run.workflow);
  const rules = workflow.key === "idea_product"
    ? [
      "Gunakan hanya Source Pack yang telah divalidasi oleh MCP.",
      "Source Pack harus dikirim bersama binary asli setiap dokumen agar originalSha256 dapat diverifikasi independen.",
      "Compatibility check harus selesai sebelum hasil dikirim untuk review.",
      "Technical quality dan content quality report harus valid tanpa issue blocking.",
      "Jika quality report gagal, revisi artifact lalu jalankan validator ulang; jangan mengubah checksum secara manual.",
      "Product Bundle baru hanya boleh berisi article, diktat, flashcard_set, dan flashcard; question, solution, dan assessment_blueprint memakai workflow asesmen.",
      "Jangan membuat soal kuis Zyx atau soal referensi historis dalam Product Bundle; gunakan workflow asesmen yang sesuai.",
      "Publish selalu dilakukan oleh admin melalui alur review.",
    ]
    : workflow.key === "quiz_bank"
      ? [
        "Workflow mengunci course dan chapter; Source Pack bersifat opsional dan harus tetap tervalidasi bila digunakan.",
        "Target Idea wajib berasal dari katalog published dalam scope yang dikunci.",
        "Gunakan historical reference hanya sebagai konteks gap analysis; jangan menyalin soal historis secara verbatim.",
        "Soal baru harus origin zyx_original, memakai referenceLinks bila terinspirasi, lalu masuk review admin tanpa publish otomatis.",
        "Jangan meminta atau mengirim course ID, chapter ID, atau Idea ID internal kepada operator.",
      ]
      : [
        "Workflow berjalan pada scope course tanpa chapter dan tanpa Source Pack.",
        "Gunakan hanya source.list_reference_files untuk file kategori soal dan pembahasan_soal dalam course yang dikunci.",
        "Pertahankan wording, nomor, bagian, opsi, halaman, dan locator sumber; normalisasi hanya whitespace, Markdown, dan LaTeX yang tidak mengubah makna.",
        "Jangan membuat Idea baru, mengarang jawaban, mengoreksi sumber, menerjemahkan, atau menginfer jawaban yang tidak terbukti.",
        "Setiap soal wajib memiliki minimal satu Idea published dari course yang sama; Idea boleh berasal dari chapter berbeda.",
        "Simpan provenance jawaban dan solusi sebagai official, source_solution, zyx_generated, atau unavailable sesuai bukti yang tersedia.",
        "Submit hanya membuat draft generated untuk admin review; workflow tidak memiliki tool direct publish.",
        "Jangan meminta atau mengirim course ID, chapter ID, database ID, atau storage key kepada operator.",
      ];

  return {
    version: AUTHORING_MCP_VERSION,
    workflow,
    scope: run.chapterLabel ? { course: run.courseLabel, chapter: run.chapterLabel } : { course: run.courseLabel },
    source: run.sourcePackId ? { packId: run.sourcePackId, checksum: run.sourcePackChecksum } : null,
    rules,
    outputs: workflow.key === "idea_product"
      ? {
        ideaBundle: { schemaVersion: "idea-bundle.v3", compatibleReadVersions: ["idea-bundle.v2", "idea-bundle.v3"], validationTool: "authoring.validate_idea_bundle", reviewRequired: true },
        productBundle: productBundleV3Contract(),
      }
      : workflow.key === "quiz_bank" ? {
        quizDraft: {
          schemaVersion: "question-bank-draft.v2",
          ideaCatalogTool: "assessment.list_ideas",
          ideaDetailTool: "assessment.get_idea",
          validationTool: "assessment.validate_quiz_draft",
          submitTool: "assessment.submit_quiz_draft",
          ideaLinksRequired: false,
          linkedIdeaWeightRule: "Positive weights must sum to 1 when Idea links are present.",
          scopeGuidance: quizBankScopeGuidance(),
          historicalReferenceBoundary: "Historical questions are read-only context for gap analysis. New quiz questions remain zyx_original and may link lineage with inspired_by, adapted_from, or derived_from.",
          draftExample: {
            schemaVersion: "question-bank-draft.v2",
            draftId: "draft-local-1",
            questions: [{
              id: "question-1",
              questionType: "multiple_choice",
              difficulty: "medium",
              cognitiveLevel: "apply",
              reasoningPattern: "direct_application",
              tags: [],
              prompt: "Tulis pertanyaan di sini.",
              options: ["Opsi A", "Opsi B", "Opsi C", "Opsi D"],
              correctIndices: [0],
              acceptableAnswers: [],
              explanation: "Tulis pembahasan di sini.",
              ideaLinks: [],
            }],
          },
          reviewRequired: true,
          publicationTarget: "question_bank",
          initialStatus: "generated",
        },
      } : {
        referenceQuestionDraft: {
          schemaVersion: "reference-question-draft.v1",
          allowedSourceTools: ["source.list_reference_files", "source.read_file"],
          allowedIdeaTools: ["knowledge.search_course_ideas", "knowledge.get_idea"],
          validationTool: "assessment.validate_reference_draft",
          submitTool: "assessment.submit_reference_draft",
          ideaLinksRequired: true,
          sameCourseAcrossChaptersAllowed: true,
          origin: "historical_reference",
          publicationTarget: "reference_question_review",
          initialStatus: "generated",
        },
      },
  };
}

export function decodeMcpArtifact(value: string, maxBytes: number): Uint8Array {
  return decodeBase64(value, maxBytes);
}
