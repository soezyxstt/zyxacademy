import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
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

export const authoringWorkflowSchema = z.enum(["idea_product", "quiz_bank"]);
export type AuthoringWorkflow = z.infer<typeof authoringWorkflowSchema>;

type SignedTokenKind = "course_choice" | "chapter_choice" | "source" | "run" | "connection" | "client";

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

export type AuthoringWorkflowOption = {
  key: AuthoringWorkflow;
  label: string;
  description: string;
  sourcePackRequired: boolean;
  scope: ["course", "chapter"];
  reviewRequired: true;
  publicationTarget: "idea_and_product_review" | "quiz_bank_review";
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

function sourceSummary(sourcePack: ValidatedSourcePack, quality: SourcePackQualityReport): SourcePackSummary {
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

export function ingestMcpSourcePack(filename: string, contentBase64: string, originals?: ReadonlyMap<string, Uint8Array>) {
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

export async function startAuthoringWorkflow(input: {
  workflow: AuthoringWorkflow;
  sourcePackToken?: string;
  courseKey: string;
  chapterKey: string;
}) {
  const courseChoice = verifyToken<SignedTokenPayload & { kind: "course_choice"; courseId: string }>(input.courseKey, "course_choice");
  const chapterChoice = verifyToken<SignedTokenPayload & { kind: "chapter_choice"; courseId: string; chapterId: string }>(input.chapterKey, "chapter_choice");
  if (chapterChoice.courseId !== courseChoice.courseId) throw new Error("AUTHORING_MCP_SCOPE_MISMATCH");

  const workflow = getAuthoringWorkflow(input.workflow);
  let source: Pick<SourceTokenPayload, "checksum" | "packId" | "name" | "summary"> | null = null;
  if (input.sourcePackToken) {
    source = verifyToken<SourceTokenPayload>(input.sourcePackToken, "source");
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
      : ["assessment.list_ideas", "assessment.get_idea", "assessment.validate_quiz_draft", "assessment.submit_quiz_draft"],
  };
}

export function readMcpRunToken(runToken: string): RunTokenPayload {
  return verifyToken<RunTokenPayload>(runToken, "run");
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
    ttlMs: 60 * 60 * 1000,
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
    scope: { course: run.courseLabel, chapter: run.chapterLabel },
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
    coverageHint: "Setiap Idea pada katalog sebaiknya dicover minimal satu soal; MCP melaporkan gap sebagai warning.",
  };
}

export function workflowContract(runToken: string) {
  const run = readMcpRunToken(runToken);
  const workflow = getAuthoringWorkflow(run.workflow);
  return {
    version: AUTHORING_MCP_VERSION,
    workflow,
    scope: { course: run.courseLabel, chapter: run.chapterLabel },
    source: run.sourcePackId ? { packId: run.sourcePackId, checksum: run.sourcePackChecksum } : null,
    rules: [
      "Gunakan hanya source pack yang telah divalidasi oleh MCP.",
      "Source Pack harus dikirim bersama binary asli setiap dokumen agar originalSha256 dapat diverifikasi independen.",
      "Jangan meminta atau mengirim course ID dan chapter ID kepada operator.",
      "Compatibility check harus selesai sebelum hasil dikirim untuk review.",
      "Technical quality dan content quality report harus valid tanpa issue blocking.",
      "Jika quality report gagal, revisi artifact lalu jalankan validator ulang; jangan mengubah checksum secara manual.",
      "Publish selalu dilakukan oleh admin melalui alur review.",
    ],
    outputs: workflow.key === "idea_product"
      ? {
        ideaBundle: { validationTool: "authoring.validate_idea_bundle", reviewRequired: true },
        productBundle: { validationTool: "authoring.validate_product_bundle", reviewRequired: true, ideaPublicationRequired: true },
      }
      : {
        quizDraft: {
          schemaVersion: "question-bank-draft.v2",
          ideaCatalogTool: "assessment.list_ideas",
          ideaDetailTool: "assessment.get_idea",
          validationTool: "assessment.validate_quiz_draft",
          submitTool: "assessment.submit_quiz_draft",
          ideaLinksRequired: false,
          linkedIdeaWeightRule: "Positive weights must sum to 1 when Idea links are present.",
          scopeGuidance: quizBankScopeGuidance(),
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
      },
  };
}

export function decodeMcpArtifact(value: string, maxBytes: number): Uint8Array {
  return decodeBase64(value, maxBytes);
}
