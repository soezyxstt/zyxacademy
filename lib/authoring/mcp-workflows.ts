import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { VISUAL_CAPABILITIES, UNSUPPORTED_VISUAL_CAPABILITIES } from "@/lib/materials/visual-capabilities";
import { PRODUCT_V4_VERIFICATION_POLICY } from "@/lib/bundle/product-v4-verification";
import { getAuthoringCourseOption, listAuthoringCourseOptions } from "@/lib/authoring/catalog";
import { validateSourcePack, type ValidatedSourcePack } from "@/lib/authoring/source-pack";
import { evaluateSourcePackQuality, type SourcePackQualityReport } from "@/lib/authoring/quality/source-pack";
import { ZipSecurityError } from "@/lib/bundle/zip-reader";
import { resolveAuthSecret } from "@/lib/auth-secret";
import { authoringValidationSnapshot, productV4SchemaDocuments } from "@/lib/authoring/mcp-contract-revision";
import {
  AUTHORING_MCP_BOOTSTRAP_PROTOCOL,
  buildPlaybookResponse,
  evaluatePlaybookCompatibility,
  getStagePlaybookManifest,
  listAllStagePlaybookManifests,
  resolveAuthoringMcpEnvironment,
  resolveAuthoringServerRevision,
  authoringMcpSkillSchema,
  authoringPlaybookStageSchema,
  clientCapabilitiesSchema,
  type AuthoringClientCapabilities,
  type AuthoringMcpSkill,
  type AuthoringPlaybookModuleKey,
  type AuthoringPlaybookStage,
} from "@/lib/authoring/mcp-playbook";

export const AUTHORING_MCP_VERSION = "authoring-mcp.v1";
export const AUTHORING_MCP_MAX_SOURCE_PACK_BYTES = 64 * 1024 * 1024;
export const AUTHORING_MCP_MAX_BUNDLE_BYTES = 32 * 1024 * 1024;
export const AUTHORING_MCP_MAX_ORIGINAL_BYTES = 32 * 1024 * 1024;
export const MCP_CONNECTION_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const MCP_BOOTSTRAP_TOKEN_TTL_MS = 60 * 60 * 1000;

export const authoringWorkflowSchema = z.enum(["idea_product", "quiz_bank", "reference_question_ingest"]);
export type AuthoringWorkflow = z.infer<typeof authoringWorkflowSchema>;

type SignedTokenKind = "course_choice" | "chapter_choice" | "source_file" | "source" | "run" | "bootstrap" | "connection" | "client";

type SignedTokenPayload = {
  kind: SignedTokenKind;
  issuedAt: number;
  expiresAt: number;
  [key: string]: unknown;
};

export type McpBootstrapContext = {
  actorId: string;
  sessionId: string | null;
  audience: string;
  environment: "staging" | "production" | "local";
  skill: AuthoringMcpSkill | null;
  stage: AuthoringPlaybookStage;
  bootstrapProtocol: number;
  pluginVersion: string | null;
  playbookRevision: string;
  playbookChecksum: string;
  contractRevision: string;
  contractChecksum: string;
  clientCapabilities: AuthoringClientCapabilities;
};

export type BootstrapTokenPayload = SignedTokenPayload & McpBootstrapContext & {
  kind: "bootstrap";
};

const bootstrapContextSchema = z.object({
  actorId: z.string().min(1),
  sessionId: z.string().min(1).nullable(),
  audience: z.string().min(1),
  environment: z.enum(["staging", "production", "local"]),
  skill: authoringMcpSkillSchema.nullable(),
  stage: authoringPlaybookStageSchema,
  bootstrapProtocol: z.number().int().positive(),
  pluginVersion: z.string().nullable(),
  playbookRevision: z.string().min(1),
  playbookChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  contractRevision: z.string().min(1),
  contractChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  clientCapabilities: clientCapabilitiesSchema,
});

function bootstrapAudience(): string {
  const environment = resolveAuthoringMcpEnvironment();
  if (environment === "production") return "https://www.zyxacademy.com/api/mcp/authoring";
  if (environment === "staging") return "https://staging.zyxacademy.com/api/mcp/authoring";
  return "urn:zyx-authoring:local";
}

function publicBootstrapContext(context: McpBootstrapContext | null | undefined) {
  if (!context) return null;
  const { actorId: _actorId, sessionId: _sessionId, audience: _audience, ...metadata } = context;
  return metadata;
}

type SourceTokenPayload = SignedTokenPayload & {
  kind: "source";
  checksum: string;
  packId: string;
  importId?: string | null;
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
  sourcePackImportId?: string | null;
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
  bootstrap?: McpBootstrapContext | null;
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

export const MCP_AUTHORING_DEFAULT_SCOPES = [
  "authoring:read",
  "authoring:stage",
  "authoring:review",
  "authoring:withdraw",
] as const;
export const MCP_AUTHORING_SCOPES = MCP_AUTHORING_DEFAULT_SCOPES;

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
  reviewRequired: boolean;
  publicationTarget: "idea_and_product_review" | "quiz_bank_review" | "reference_question_bank";
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
    description: "Mengimpor soal historis dari source tersimpan, mempertahankan provenance, mengaitkannya ke Idea published, dan menyimpannya sebagai published (siap dipakai pada kuis sesuai quizEligible).",
    sourcePackRequired: false,
    scope: ["course"],
    reviewRequired: false,
    publicationTarget: "reference_question_bank",
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

export function readMcpChapterChoice(chapterKey: string): { courseId: string; chapterId: string } {
  const chapter = verifyToken<SignedTokenPayload & { kind: "chapter_choice"; courseId: string; chapterId: string }>(chapterKey, "chapter_choice");
  return { courseId: chapter.courseId, chapterId: chapter.chapterId };
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
  options: { issueToken?: boolean } = {},
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
  if (options.issueToken === false) {
    return {
      ok: true as const,
      filename,
      source: summary,
      quality,
    };
  }
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
  importId?: string | null;
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
    ...(input.importId ? { importId: input.importId } : {}),
    name: input.name,
    summary: input.summary,
    ...(input.courseId && input.chapterId ? { courseId: input.courseId, chapterId: input.chapterId } : {}),
    ttlMs: input.ttlMs ?? 24 * 60 * 60 * 1000,
  });
}

export function readMcpSourcePackToken(sourcePackToken: string): SourceTokenPayload {
  return verifyToken<SourceTokenPayload>(sourcePackToken, "source");
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

const WORKFLOW_ALLOWED_STAGES: Record<AuthoringWorkflow, readonly AuthoringPlaybookStage[]> = {
  idea_product: ["pipeline", "source", "idea", "product"],
  quiz_bank: ["quiz"],
  reference_question_ingest: ["reference"],
};

const OPERATION_ALLOWED_STAGES: Record<AuthoringPlaybookStage, readonly AuthoringPlaybookStage[]> = {
  common: ["common", "pipeline", "source", "idea", "product", "quiz", "reference"],
  pipeline: ["pipeline"],
  source: ["source"],
  idea: ["idea"],
  product: ["product"],
  quiz: ["quiz"],
  reference: ["reference"],
};

function workflowStaticDefinition(workflowKey: AuthoringWorkflow) {
  const workflow = getAuthoringWorkflow(workflowKey);
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
        "Submit melalui assessment.submit_reference_draft menyimpan soal historis dengan status published; soal dengan quizEligible=true langsung dapat dipakai pada perakitan kuis.",
        "Jangan meminta atau mengirim course ID, chapter ID, database ID, atau storage key kepada operator.",
      ];

  const outputs = workflow.key === "idea_product"
    ? {
      ideaBundle: {
        schemaVersion: "idea-bundle.v3",
        compatibleReadVersions: ["idea-bundle.v2", "idea-bundle.v3"],
        validationTool: "authoring.validate_idea_bundle",
        reviewRequired: true,
        attribution: { creatorId: "$UPLOADER", curatorId: "$APPROVING_REVIEWER" },
        creatorRule: "Generator Idea Bundle wajib selalu menghasilkan creatorId: '$UPLOADER', bukan ID placeholder eksternal.",
      },
      productBundle: productBundleV3Contract(),
    }
    : workflow.key === "quiz_bank" ? {
      quizDraft: {
        schemaVersion: "question-bank-draft.v2",
        ideaCatalogTool: "assessment.list_ideas",
        ideaDetailTool: "assessment.get_idea",
        validationTool: "assessment.validate_quiz_draft",
        submitTool: "assessment.submit_quiz_draft",
        ideaLinksRequired: true,
        primaryIdeaCount: 1,
        linkedIdeaWeightRule: "At least one published Idea in the locked course and chapter, exactly one primary, and positive weights summing to 1 are required.",
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
            ideaLinks: [{ ideaId: "published-idea-id-in-locked-chapter", weight: 1, role: "primary" }],
          }],
        },
        reviewRequired: true,
        publicationTarget: "question_bank",
        initialStatus: "generated",
      },
    } : {
      referenceQuestionDraft: {
        schemaVersion: "reference-question-draft.v1",
        allowedSourceTools: ["source.list_reference_files", "source.read_file", "source.get_read_job"],
        allowedIdeaTools: ["knowledge.search_course_ideas", "knowledge.get_idea"],
        validationTool: "assessment.validate_reference_draft",
        submitTool: "assessment.submit_reference_draft",
        ideaLinksRequired: true,
        sameCourseAcrossChaptersAllowed: true,
        origin: "historical_reference",
        reviewRequired: false,
        publicationTarget: "reference_question_bank",
        initialStatus: "published",
        quizEligibilityRule: "Soal yang disubmit langsung berstatus published; soal dengan quizEligible=true langsung memenuhi syarat untuk perakitan kuis.",
      },
    };

  return { workflow, rules, outputs };
}

export function authoringContractSnapshot() {
  const payload = {
    version: AUTHORING_MCP_VERSION,
    validation: authoringValidationSnapshot(),
    workflows: WORKFLOW_OPTIONS,
    contracts: {
      idea_product: workflowStaticDefinition("idea_product"),
      quiz_bank: workflowStaticDefinition("quiz_bank"),
      reference_question_ingest: workflowStaticDefinition("reference_question_ingest"),
    },
  };
  return payload;
}

export function computeAuthoringContractDigest(payload: unknown = authoringContractSnapshot()) {
  const contractChecksum = createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
  const contractRevision = `contract-v1-${contractChecksum.slice(0, 12)}`;
  return { contractRevision, contractChecksum };
}

export function issueMcpBootstrapToken(input: {
  actorId: string;
  sessionId?: string;
  skill?: AuthoringMcpSkill | null;
  stage: AuthoringPlaybookStage;
  bootstrapProtocol?: number;
  pluginVersion?: string | null;
  clientCapabilities?: AuthoringClientCapabilities;
  playbookRevision?: string;
  playbookChecksum?: string;
  contractRevision?: string;
  contractChecksum?: string;
  environment?: "staging" | "production" | "local";
  ttlMs?: number;
}): string {
  const compatibility = evaluatePlaybookCompatibility({
    stage: input.stage,
    bootstrapProtocol: input.bootstrapProtocol,
    pluginVersion: input.pluginVersion ?? undefined,
    clientCapabilities: input.clientCapabilities,
  });
  if (compatibility.status === "incompatible") {
    throw new Error(compatibility.code);
  }
  const manifest = getStagePlaybookManifest(input.stage);
  const contractDigest = computeAuthoringContractDigest();
  return issueToken({
    kind: "bootstrap",
    actorId: input.actorId,
    sessionId: input.sessionId ?? null,
    audience: bootstrapAudience(),
    environment: input.environment ?? resolveAuthoringMcpEnvironment(),
    skill: input.skill ?? null,
    stage: input.stage,
    bootstrapProtocol: input.bootstrapProtocol ?? AUTHORING_MCP_BOOTSTRAP_PROTOCOL,
    pluginVersion: input.pluginVersion ?? null,
    playbookRevision: input.playbookRevision ?? manifest.playbookRevision,
    playbookChecksum: input.playbookChecksum ?? manifest.playbookChecksum,
    contractRevision: input.contractRevision ?? contractDigest.contractRevision,
    contractChecksum: input.contractChecksum ?? contractDigest.contractChecksum,
    clientCapabilities: input.clientCapabilities ?? {},
    ttlMs: input.ttlMs ?? MCP_BOOTSTRAP_TOKEN_TTL_MS,
  });
}

export function readMcpBootstrapToken(bootstrapToken: string): BootstrapTokenPayload {
  const token = verifyToken<BootstrapTokenPayload>(bootstrapToken, "bootstrap");
  const parsed = bootstrapContextSchema.safeParse(token);
  if (!parsed.success) throw new Error("AUTHORING_MCP_BOOTSTRAP_INVALID");
  return { kind: token.kind, issuedAt: token.issuedAt, expiresAt: token.expiresAt, ...parsed.data };
}

function verifyBootstrapIdentity(context: McpBootstrapContext, options: { actorId?: string; sessionId?: string }) {
  const parsed = bootstrapContextSchema.safeParse(context);
  if (!parsed.success) throw new Error("AUTHORING_MCP_BOOTSTRAP_INVALID");
  if (options.actorId && context.actorId !== options.actorId) throw new Error("AUTHORING_MCP_BOOTSTRAP_PRINCIPAL_MISMATCH");
  if (options.sessionId && context.sessionId !== options.sessionId) throw new Error("AUTHORING_MCP_BOOTSTRAP_SESSION_MISMATCH");
  if (context.environment !== resolveAuthoringMcpEnvironment()) throw new Error("AUTHORING_MCP_BOOTSTRAP_ENVIRONMENT_MISMATCH");
  if (context.audience !== bootstrapAudience()) throw new Error("AUTHORING_MCP_BOOTSTRAP_AUDIENCE_MISMATCH");
}

function validateBootstrapContextAgainstActiveServer(
  bootstrap: McpBootstrapContext,
  options: {
    actorId?: string;
    sessionId?: string;
    requiredStage?: AuthoringPlaybookStage;
    expectedWorkflow?: AuthoringWorkflow;
  } = {},
) {
  verifyBootstrapIdentity(bootstrap, options);
  if (options.expectedWorkflow) {
    const allowedForWorkflow = WORKFLOW_ALLOWED_STAGES[options.expectedWorkflow];
    if (!allowedForWorkflow.includes(bootstrap.stage)) {
      throw new Error("AUTHORING_MCP_BOOTSTRAP_STAGE_MISMATCH");
    }
  }
  if (options.requiredStage) {
    const allowedForStage = OPERATION_ALLOWED_STAGES[options.requiredStage];
    if (!allowedForStage.includes(bootstrap.stage)) {
      throw new Error("AUTHORING_MCP_BOOTSTRAP_STAGE_MISMATCH");
    }
    const stageCompatibility = evaluatePlaybookCompatibility({
      stage: options.requiredStage,
      bootstrapProtocol: bootstrap.bootstrapProtocol,
      pluginVersion: bootstrap.pluginVersion ?? undefined,
      clientCapabilities: bootstrap.clientCapabilities,
    });
    if (stageCompatibility.status === "incompatible") {
      throw new Error(stageCompatibility.code);
    }
  }

  const boundStageManifest = getStagePlaybookManifest(bootstrap.stage);
  if (
    bootstrap.playbookChecksum !== boundStageManifest.playbookChecksum ||
    bootstrap.playbookRevision !== boundStageManifest.playbookRevision
  ) {
    throw new Error("AUTHORING_MCP_PLAYBOOK_STALE");
  }

  const activeContract = computeAuthoringContractDigest();
  if (
    bootstrap.contractChecksum !== activeContract.contractChecksum ||
    bootstrap.contractRevision !== activeContract.contractRevision
  ) {
    throw new Error("AUTHORING_MCP_CONTRACT_STALE");
  }

  const compatibility = evaluatePlaybookCompatibility({
    stage: options.requiredStage ?? bootstrap.stage,
    bootstrapProtocol: bootstrap.bootstrapProtocol,
    pluginVersion: bootstrap.pluginVersion ?? undefined,
    clientCapabilities: bootstrap.clientCapabilities,
  });

  return {
    mode: "verified" as const,
    status: compatibility.status,
    code: compatibility.code,
    warning: compatibility.status === "warning" ? compatibility.reason : null,
    remediation: compatibility.remediation,
    bootstrap,
  };
}

export function verifyMcpExecutionBootstrap(input: {
  actorId?: string;
  sessionId?: string;
  bootstrapToken?: string;
  run?: Pick<RunTokenPayload, "workflow" | "bootstrap"> | null;
  requiredStage?: AuthoringPlaybookStage;
  expectedWorkflow?: AuthoringWorkflow;
}) {
  const expectedWorkflow = input.expectedWorkflow ?? input.run?.workflow;
  let verifiedFromToken: ReturnType<typeof validateBootstrapContextAgainstActiveServer> | null = null;

  if (input.bootstrapToken) {
    const tokenPayload = readMcpBootstrapToken(input.bootstrapToken);
    const { kind: _kind, issuedAt: _issuedAt, expiresAt: _expiresAt, ...context } = tokenPayload;
    verifiedFromToken = validateBootstrapContextAgainstActiveServer(context as McpBootstrapContext, {
      actorId: input.actorId,
      sessionId: input.sessionId,
      requiredStage: input.requiredStage,
      expectedWorkflow,
    });
  }

  if (input.run?.bootstrap) {
    verifyBootstrapIdentity(input.run.bootstrap, input);
    if (verifiedFromToken) return verifiedFromToken;
    const verifiedFromRun = validateBootstrapContextAgainstActiveServer(input.run.bootstrap, {
      actorId: input.actorId,
      sessionId: input.sessionId,
      requiredStage: verifiedFromToken ? undefined : input.requiredStage,
      expectedWorkflow,
    });
    return verifiedFromToken ?? verifiedFromRun;
  }

  if (verifiedFromToken) {
    return verifiedFromToken;
  }

  return {
    mode: "legacy" as const,
    status: "warning" as const,
    code: "AUTHORING_MCP_LEGACY_BOOTSTRAP_OMITTED" as const,
    warning: "Bootstrap context omitted; legacy transition mode is active. Call workflow.get_playbook before authoring.",
    remediation: "Call workflow.get_playbook and pass bootstrapToken to workflow.start and mutation tools.",
    bootstrap: null,
  };
}

export function getMcpPlaybook(input: {
  actorId: string;
  sessionId?: string;
  skill?: AuthoringMcpSkill;
  stage?: AuthoringPlaybookStage;
  modules?: readonly AuthoringPlaybookModuleKey[];
  bootstrapProtocol?: number;
  pluginVersion?: string;
  clientCapabilities?: AuthoringClientCapabilities;
  runToken?: string;
  expectedPlaybookRevision?: string;
}) {
  const playbook = buildPlaybookResponse({
    skill: input.skill,
    stage: input.stage,
    modules: input.modules,
    bootstrapProtocol: input.bootstrapProtocol,
    pluginVersion: input.pluginVersion,
    clientCapabilities: input.clientCapabilities,
    expectedPlaybookRevision: input.expectedPlaybookRevision,
  });
  const contractDigest = computeAuthoringContractDigest();

  let runDiagnostics: {
    runId: string;
    workflow: AuthoringWorkflow;
    bootstrapBound: boolean;
    playbookFresh: boolean;
    contractFresh: boolean;
    refreshRequired: boolean;
  } | null = null;

  if (input.runToken) {
    const run = readMcpRunToken(input.runToken);
    if (run.bootstrap) {
      verifyBootstrapIdentity(run.bootstrap, input);
      const boundStageManifest = getStagePlaybookManifest(run.bootstrap.stage);
      const playbookFresh =
        run.bootstrap.playbookChecksum === boundStageManifest.playbookChecksum &&
        run.bootstrap.playbookRevision === boundStageManifest.playbookRevision;
      const contractFresh =
        run.bootstrap.contractChecksum === contractDigest.contractChecksum &&
        run.bootstrap.contractRevision === contractDigest.contractRevision;
      runDiagnostics = {
        runId: run.runId,
        workflow: run.workflow,
        bootstrapBound: true,
        playbookFresh,
        contractFresh,
        refreshRequired: !playbookFresh || !contractFresh,
      };
    } else {
      runDiagnostics = {
        runId: run.runId,
        workflow: run.workflow,
        bootstrapBound: false,
        playbookFresh: true,
        contractFresh: true,
        refreshRequired: false,
      };
    }
  }

  const compatible = playbook.compatibility.status !== "incompatible";
  const bootstrapToken = compatible
    ? issueMcpBootstrapToken({
        actorId: input.actorId,
        sessionId: input.sessionId,
        skill: playbook.skill ?? undefined,
        stage: playbook.stage,
        bootstrapProtocol: playbook.bootstrapProtocol,
        pluginVersion: playbook.pluginVersion,
        clientCapabilities: input.clientCapabilities,
        playbookRevision: playbook.playbookRevision,
        playbookChecksum: playbook.playbookChecksum,
        contractRevision: contractDigest.contractRevision,
        contractChecksum: contractDigest.contractChecksum,
        environment: playbook.environment,
      })
    : null;

  return {
    ok: compatible,
    ...playbook,
    contractRevision: contractDigest.contractRevision,
    contractChecksum: contractDigest.contractChecksum,
    bootstrapToken,
    runDiagnostics,
    next: !compatible
      ? ["remediate_client_compatibility"]
      : playbook.stage === "source"
        ? ["catalog.list_courses", "catalog.list_chapters", "source.list_packs", "source.list_files", "source.read_file", "source.get_read_job", "source.ingest"]
        : ["catalog.list_courses", "catalog.list_chapters", "workflow.start", "workflow.get_contract"],
  };
}

export async function startAuthoringWorkflow(input: {
  workflow: AuthoringWorkflow;
  sourcePackToken?: string;
  courseKey: string;
  chapterKey?: string;
  bootstrapToken?: string;
  actorId?: string;
  sessionId?: string;
}) {
  const workflow = getAuthoringWorkflow(input.workflow);
  const bootstrapCheck = verifyMcpExecutionBootstrap({
    actorId: input.actorId,
    sessionId: input.sessionId,
    bootstrapToken: input.bootstrapToken,
    expectedWorkflow: workflow.key,
  });
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
      sourcePackImportId: null,
      sourcePackName: null,
      sourcePackSummary: null,
      bootstrap: bootstrapCheck.bootstrap,
      ttlMs: 7 * 24 * 60 * 60 * 1000,
    });
    return {
      runToken,
      runId,
      workflow,
      scope: { course: course.title },
      source: null,
      compatibility: {
        mode: bootstrapCheck.mode,
        status: bootstrapCheck.status,
        code: bootstrapCheck.code,
        warning: bootstrapCheck.warning,
        remediation: bootstrapCheck.remediation,
        playbookRevision: bootstrapCheck.bootstrap?.playbookRevision ?? null,
        playbookChecksum: bootstrapCheck.bootstrap?.playbookChecksum ?? null,
        contractRevision: bootstrapCheck.bootstrap?.contractRevision ?? computeAuthoringContractDigest().contractRevision,
        contractChecksum: bootstrapCheck.bootstrap?.contractChecksum ?? computeAuthoringContractDigest().contractChecksum,
      },
      next: [
        "source.list_reference_files",
        "source.read_file",
        "source.get_read_job",
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
  let source: Pick<SourceTokenPayload, "checksum" | "packId" | "importId" | "name" | "summary" | "courseId" | "chapterId"> | null = null;
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
    sourcePackImportId: source?.importId ?? null,
    sourcePackName: source?.name ?? null,
    sourcePackSummary: source?.summary ?? null,
    bootstrap: bootstrapCheck.bootstrap,
    ttlMs: 7 * 24 * 60 * 60 * 1000,
  });
  return {
    runToken,
    runId,
    workflow,
    scope: { course: course.title, chapter: chapter.title },
    source: source
      ? {
          ...(source.importId ? { importId: source.importId } : {}),
          packId: source.packId,
          name: source.name,
          checksum: source.checksum,
        }
      : null,
    compatibility: {
      mode: bootstrapCheck.mode,
      status: bootstrapCheck.status,
      code: bootstrapCheck.code,
      warning: bootstrapCheck.warning,
      remediation: bootstrapCheck.remediation,
      playbookRevision: bootstrapCheck.bootstrap?.playbookRevision ?? null,
      playbookChecksum: bootstrapCheck.bootstrap?.playbookChecksum ?? null,
      contractRevision: bootstrapCheck.bootstrap?.contractRevision ?? computeAuthoringContractDigest().contractRevision,
      contractChecksum: bootstrapCheck.bootstrap?.contractChecksum ?? computeAuthoringContractDigest().contractChecksum,
    },
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
  sourcePackImportId?: string | null;
  sourcePackName?: string | null;
  sourcePackSummary?: string | null;
  bootstrap?: McpBootstrapContext | null;
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
    sourcePackImportId: input.sourcePackImportId ?? null,
    sourcePackName: input.sourcePackName ?? null,
    sourcePackSummary: input.sourcePackSummary ?? null,
    ...(input.bootstrap !== undefined ? { bootstrap: input.bootstrap } : {}),
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

export function publicMcpRun(runToken: string, principal: { actorId?: string; sessionId?: string } = {}) {
  const run = readMcpRunToken(runToken);
  if (run.bootstrap) verifyBootstrapIdentity(run.bootstrap, principal);
  const activeContract = computeAuthoringContractDigest();
  let compatibility: {
    mode: "verified" | "legacy";
    playbookFresh: boolean;
    contractFresh: boolean;
    refreshRequired: boolean;
    boundPlaybookRevision: string | null;
    boundPlaybookChecksum: string | null;
    activePlaybookRevision: string | null;
    activePlaybookChecksum: string | null;
    boundContractRevision: string | null;
    boundContractChecksum: string | null;
    activeContractRevision: string;
    activeContractChecksum: string;
  };

  if (run.bootstrap) {
    const activeStageManifest = getStagePlaybookManifest(run.bootstrap.stage);
    const playbookFresh =
      run.bootstrap.playbookChecksum === activeStageManifest.playbookChecksum &&
      run.bootstrap.playbookRevision === activeStageManifest.playbookRevision;
    const contractFresh =
      run.bootstrap.contractChecksum === activeContract.contractChecksum &&
      run.bootstrap.contractRevision === activeContract.contractRevision;
    compatibility = {
      mode: "verified",
      playbookFresh,
      contractFresh,
      refreshRequired: !playbookFresh || !contractFresh,
      boundPlaybookRevision: run.bootstrap.playbookRevision,
      boundPlaybookChecksum: run.bootstrap.playbookChecksum,
      activePlaybookRevision: activeStageManifest.playbookRevision,
      activePlaybookChecksum: activeStageManifest.playbookChecksum,
      boundContractRevision: run.bootstrap.contractRevision,
      boundContractChecksum: run.bootstrap.contractChecksum,
      activeContractRevision: activeContract.contractRevision,
      activeContractChecksum: activeContract.contractChecksum,
    };
  } else {
    compatibility = {
      mode: "legacy",
      playbookFresh: true,
      contractFresh: true,
      refreshRequired: false,
      boundPlaybookRevision: null,
      boundPlaybookChecksum: null,
      activePlaybookRevision: null,
      activePlaybookChecksum: null,
      boundContractRevision: null,
      boundContractChecksum: null,
      activeContractRevision: activeContract.contractRevision,
      activeContractChecksum: activeContract.contractChecksum,
    };
  }

  return {
    runId: run.runId,
    workflow: getAuthoringWorkflow(run.workflow),
    scope: run.chapterLabel ? { course: run.courseLabel, chapter: run.chapterLabel } : { course: run.courseLabel },
    source: run.sourcePackId
      ? {
        ...(run.sourcePackImportId ? { importId: run.sourcePackImportId } : {}),
        packId: run.sourcePackId,
        name: run.sourcePackName,
        checksum: run.sourcePackChecksum,
        summary: run.sourcePackSummary,
      }
      : null,
    bootstrap: publicBootstrapContext(run.bootstrap),
    compatibility,
  };
}

export function quizBankScopeGuidance() {
  return {
    difficulty: ["easy", "medium", "hard"],
    cognitiveLevel: ["remember", "understand", "apply", "analyze", "evaluate", "create"],
    questionType: ["multiple_choice", "multiple_choices", "short_answer", "essay"],
    ideaRole: ["primary", "supporting", "required"],
    linkingPolicy: {
      required: true,
      primaryCount: 1,
      weightRule: "Setiap soal wajib memiliki minimal satu Idea dan tepat satu primary, dengan bobot positif berjumlah tepat 1.",
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
    compatibleReadVersions: ["product-bundle.v2", "product-bundle.v3", "product-bundle.v4"],
    pilot: { schemaVersion: "product-bundle.v4", articleSchemaVersion: "article.v4", orderedPartKinds: ["markdown", "math_unit", "visual_ref", "worked_example"], publicationReady: "derived from current trusted verification, explicit section review and PDF evidence", articleCount: 1, diktatCount: "at most one in draft, required for publication", scopedSymbolDefinitions: true,
      schemaDocuments: productV4SchemaDocuments().map(({ body: _body, ...document }) => document),
      schemaRetrieval: "GET each path on the same origin as this MCP endpoint. Public type definitions only, no credentials required. Verify the SHA-256 of the response bytes; on 409 refresh the playbook and contract. product is the shared structural entity schema; apply all V4 semantic rules below and use authoring.validate_product_bundle for final validation.",
      semanticRules: {
        envelope: "Use product-bundle.v4, article.v4 and diktat.v4 explicitly. Exactly one Article; at most one Diktat in a draft, required for publication. Only article, diktat, flashcard_set and flashcard may be authored.",
        article: "Require nonempty sections, empty top-level blocks, and nonempty ordered parts in every section block. Part, relation and worked-step IDs are unique across the Article. A supplied contentMarkdown must equal the projection derived from parts; omit it to let the server derive it.",
        mathematics: "Each math_unit has meaningMarkdown and exactly one of latex or relations. Cases require conditionLatex for each relation. symbolRefs resolve within that math_unit. Use explicit math delimiters in prose and scientific multiplication by powers of ten, never numeric e notation.",
        references: "visual_ref.visualId resolves in the Article visuals registry. focusRefs resolve to Article elements. Worked-step sourceElementRefs resolve to previously available elements, not forward references.",
        visuals: "Use the visual schema for the exact family, parameters, controls and bindings. Renderer-owned behavior only; no executable code or persistent remote image URLs. A valid structural visual still requires model, domain, state and print verification.",
        diktat: "Require authored units and matching sourceArticleId, sourceArticleVersion, sourceArticleHash and locked product dependency. Unit sourceElementRefs resolve to Article elements, and aggregate Idea coverage matches. contentMarkdown equals the projection of units. Each top-level visual_ref requires staticMarkdown; omit staticSnapshot for server derivation or provide the current exact pin.",
        review: "Combine the pedagogicReview schema with v4ReviewContext for authoring.review_product_bundle. Approval requires current revision, content fingerprint, policy, verification plan and receipt signature, all rubric criteria, and an approved semanticHash decision for every section. Read current context through authoring.get_import.",
        verification: "After authorized staging, read the content hash and plan from authoring.get_import, request authoring.verify_product_bundle and poll authoring.get_verification. Structural JSON Schema does not encode cross-reference, lineage, security, numerical, editorial or readiness refinements. Never infer publication readiness from schema validation alone.",
      },
      capabilities: VISUAL_CAPABILITIES, unsupportedCapabilities: UNSUPPORTED_VISUAL_CAPABILITIES,
      verification: { policyVersion: PRODUCT_V4_VERIFICATION_POLICY, requestTool: "authoring.verify_product_bundle", getTool: "authoring.get_verification", origin: "server_observed", localReportsGrantReadiness: false, reviewContextTool: "authoring.get_import" },
      sourceFigures: { extractTool: "source.extract_figure", getTool: "source.get_figure", provenanceRequired: true },
    },
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
      pdfEvidence: "Diktat PDF rendering evidence states: pending, ready, failed, stale; ready requires 1-4 pages.",
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
      supportedKinds: ["epsilon_delta_graph", "learning_canvas"],
      specFields: {
        id: "Unique visual identifier within article registry.",
        kind: "epsilon_delta_graph for epsilon-delta limits, or learning_canvas for bounded application-owned 2D learning plots.",
        label: "Accessible visual title or label.",
        description: "Detailed description for screen readers and search.",
        bounds: "For epsilon_delta_graph, numeric bounding box xMin, xMax, yMin, yMax with strict ordering.",
        limitPoint: "For epsilon_delta_graph, approached limit point c.",
        limitValue: "For epsilon_delta_graph, function limit value L.",
        defaultEpsilon: "For epsilon_delta_graph, default initial epsilon tolerance band.",
        defaultDelta: "For epsilon_delta_graph, default initial delta radius.",
        functionModel: "For epsilon_delta_graph, constant (c), linear (m, b), or quadratic (a, b, c).",
        staticFallback: "For epsilon_delta_graph, table (summary, headers, rows) or text (summary, content).",
        interactive: "For learning_canvas, whether the bounded canvas exposes controls; interactive plots require a static fallback.",
        canvas: "For learning_canvas, application-owned CanvasSpec with bounded function/data/derivation/diagram/vector/chemistry payload, controls, labels, domain, and fallback.",
      },
      securityRestrictions: "No executable JavaScript or eval, no raw HTML, no raw SVG, no iframe, and no remote embed. 3D or unsupported canvas kinds are rejected until a typed renderer and PDF fallback exist.",
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
      readyPageRange: { minPages: 1, maxPages: 4 },
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

export function workflowContract(
  runToken: string,
  options: {
    bootstrapToken?: string;
    actorId?: string;
    sessionId?: string;
    skill?: AuthoringMcpSkill;
    bootstrapProtocol?: number;
    pluginVersion?: string;
    clientCapabilities?: AuthoringClientCapabilities;
  } = {},
) {
  const run = readMcpRunToken(runToken);
  const definition = workflowStaticDefinition(run.workflow);
  const contractDigest = computeAuthoringContractDigest();
  const stageManifests = listAllStagePlaybookManifests();

  const bootstrapCheck = verifyMcpExecutionBootstrap({
    actorId: options.actorId,
    sessionId: options.sessionId,
    bootstrapToken: options.bootstrapToken,
    run,
    expectedWorkflow: run.workflow,
  });

  if (options.bootstrapToken && !run.bootstrap) {
    throw new Error("AUTHORING_MCP_LEGACY_RUN_RESTART_REQUIRED");
  }
  const replacementRunToken = options.bootstrapToken && bootstrapCheck.bootstrap
    ? issueToken({ ...run, bootstrap: bootstrapCheck.bootstrap, ttlMs: run.expiresAt - Date.now() })
    : runToken;

  const defaultStageForWorkflow: AuthoringPlaybookStage =
    run.workflow === "idea_product"
      ? (bootstrapCheck.bootstrap?.stage ?? "idea")
      : run.workflow === "quiz_bank"
        ? "quiz"
        : "reference";
  const activePlaybook = stageManifests[defaultStageForWorkflow];

  return {
    version: AUTHORING_MCP_VERSION,
    runToken: replacementRunToken,
    environment: resolveAuthoringMcpEnvironment(),
    serverRevision: resolveAuthoringServerRevision(),
    contractRevision: contractDigest.contractRevision,
    contractChecksum: contractDigest.contractChecksum,
    playbookRevision: activePlaybook.playbookRevision,
    playbookChecksum: activePlaybook.playbookChecksum,
    workflow: definition.workflow,
    scope: run.chapterLabel ? { course: run.courseLabel, chapter: run.chapterLabel } : { course: run.courseLabel },
    source: run.sourcePackId ? { packId: run.sourcePackId, checksum: run.sourcePackChecksum } : null,
    compatibility: {
      mode: bootstrapCheck.mode,
      status: bootstrapCheck.status,
      code: bootstrapCheck.code,
      warning: bootstrapCheck.warning,
      remediation: bootstrapCheck.remediation,
      boundBootstrap: publicBootstrapContext(bootstrapCheck.bootstrap),
    },
    rules: definition.rules,
    outputs: definition.outputs,
  };
}

export type AuthoringMcpRun = ReturnType<typeof publicMcpRun>;

export function decodeMcpArtifact(value: string, maxBytes: number): Uint8Array {
  return decodeBase64(value, maxBytes);
}
