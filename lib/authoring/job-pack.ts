import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { z } from "zod";
import { ideaBundleManifestSchema } from "@/lib/bundle/idea-bundle-v2";
import { productBundleManifestSchema, productDependencySchema, productEntitySchema } from "@/lib/bundle/product-validator";
import { readSecureZip } from "@/lib/bundle/zip-reader";
import { ideaProvenanceSchema, ideaRelationSchema, ideaSchema } from "@/lib/ide/contracts";
import { sourceChunkSchema, sourceMaterialSchema } from "@/lib/sumber/contracts";
import { slugifySegment } from "@/lib/storage/keys";
import { EXTERNAL_AUTHORING_WORKFLOW } from "./policy";
import { sourcePackManifestSchema, validateSourcePack, type SourcePackDocumentAnalysis } from "./source-pack";
import type { AuthoringCourseOption } from "./catalog";

export const AUTHORING_JOB_SCHEMA_VERSION = "zyx-authoring-job.v1";
export const authoringProductTypeSchema = z.enum(["article", "diktat", "flashcard", "question", "solution", "assessment_blueprint"]);

export const authoringSectionMappingSchema = z.object({
  sectionId: z.string().min(1),
  documentId: z.string().min(1),
  sectionTitle: z.string().min(1),
  startUnit: z.number().int().positive(),
  endUnit: z.number().int().positive(),
  chapterId: z.string().min(1),
  chapterLabel: z.string().min(1),
}).strict();

export const authoringJobSchema = z.object({
  schemaVersion: z.literal(AUTHORING_JOB_SCHEMA_VERSION),
  jobId: z.string().min(1),
  sourcePack: z.object({
    packId: z.string().min(1),
    name: z.string().min(1),
    archiveSha256: z.string().regex(/^[a-f0-9]{64}$/),
    manifestPath: z.literal("source-pack/manifest.json"),
  }).strict(),
  target: z.object({ courseId: z.string().min(1), courseCode: z.string().min(1), courseLabel: z.string().min(1) }).strict(),
  chapters: z.array(z.object({ id: z.string().min(1), code: z.string().min(1), label: z.string().min(1), orderIndex: z.number().int().nonnegative() }).strict()).min(1),
  sectionMappings: z.array(authoringSectionMappingSchema).min(1),
  requestedProducts: z.array(authoringProductTypeSchema).min(1),
  attribution: z.object({ creatorId: z.literal("$UPLOADER"), curatorId: z.literal("$APPROVING_REVIEWER") }).strict(),
  workflow: z.object({ ideaPublicationRequiredBeforeProducts: z.literal(true), freshAuthoringContextRequired: z.literal(true) }).strict(),
}).strict().superRefine((job, context) => {
  const products = new Set(job.requestedProducts);
  if (products.size !== job.requestedProducts.length) context.addIssue({ code: "custom", message: "requestedProducts must be unique", path: ["requestedProducts"] });
  if (!products.has("article")) context.addIssue({ code: "custom", message: "article is required", path: ["requestedProducts"] });
  if (products.has("question") !== products.has("solution")) context.addIssue({ code: "custom", message: "question and solution must be requested together", path: ["requestedProducts"] });
  if (products.has("assessment_blueprint") && !products.has("question")) context.addIssue({ code: "custom", message: "assessment_blueprint requires question", path: ["requestedProducts"] });
});
export type AuthoringJob = z.infer<typeof authoringJobSchema>;

export const authoringJobManifestSchema = z.object({
  schemaVersion: z.literal(AUTHORING_JOB_SCHEMA_VERSION),
  jobId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  sourcePackId: z.string().min(1),
  courseId: z.string().min(1),
  files: z.array(z.object({
    path: z.string().min(1),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    byteLength: z.number().int().nonnegative(),
  }).strict()).min(1),
  jobChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type AuthoringJobManifest = z.infer<typeof authoringJobManifestSchema>;

export type AuthoringJobMappingInput = { sectionId: string; chapterId: string };
export type AuthoringJobPackInput = {
  sourcePackBytes: Uint8Array;
  course: AuthoringCourseOption;
  mappings: readonly AuthoringJobMappingInput[];
  requestedProducts: readonly z.infer<typeof authoringProductTypeSchema>[];
  createdAt?: string;
};

export type AuthoringJobPack = {
  bytes: Uint8Array;
  filename: string;
  manifest: {
    schemaVersion: typeof AUTHORING_JOB_SCHEMA_VERSION;
    jobId: string;
    createdAt: string;
    sourcePackId: string;
    courseId: string;
    files: { path: string; checksum: string; byteLength: number }[];
    jobChecksum: string;
  };
  job: AuthoringJob;
};

export type ValidatedAuthoringJobPack = {
  manifest: AuthoringJobManifest;
  job: AuthoringJob;
  sourcePack: ReturnType<typeof validateSourcePack>;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(",")}}`;
  return JSON.stringify(value);
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function jsonBytes(value: unknown): Uint8Array {
  return strToU8(`${stable(value)}\n`);
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`AUTHORING_JOB_INVALID_JSON:${path}`);
  }
}

function allSections(documents: readonly SourcePackDocumentAnalysis[]) {
  return documents.flatMap((document) => document.sections.map((section) => ({ ...section, documentId: document.id })));
}

export function buildAuthoringJobPack(input: AuthoringJobPackInput): AuthoringJobPack {
  const sourcePack = validateSourcePack(input.sourcePackBytes);
  if (input.course.chapters.length === 0) throw new Error("AUTHORING_JOB_COURSE_HAS_NO_CHAPTERS");
  const sections = allSections(sourcePack.documents);
  const mappingBySection = new Map(input.mappings.map((mapping) => [mapping.sectionId, mapping.chapterId]));
  if (mappingBySection.size !== input.mappings.length || input.mappings.length !== sections.length) throw new Error("AUTHORING_JOB_MAPPING_INCOMPLETE");
  const chapterById = new Map(input.course.chapters.map((chapter) => [chapter.id, chapter]));
  const sectionMappings = sections.map((section) => {
    const chapterId = mappingBySection.get(section.id);
    const chapter = chapterId ? chapterById.get(chapterId) : undefined;
    if (!chapter) throw new Error(`AUTHORING_JOB_CHAPTER_INVALID:${section.id}`);
    return {
      sectionId: section.id,
      documentId: section.documentId,
      sectionTitle: section.title,
      startUnit: section.startUnit,
      endUnit: section.endUnit,
      chapterId: chapter.id,
      chapterLabel: chapter.title,
    };
  });
  if (new Set(input.requestedProducts).size !== input.requestedProducts.length || input.requestedProducts.length === 0) throw new Error("AUTHORING_JOB_PRODUCTS_INVALID");
  const chosenChapterIds = [...new Set(sectionMappings.map((mapping) => mapping.chapterId))];
  const chapters = input.course.chapters.filter((chapter) => chosenChapterIds.includes(chapter.id));
  const jobIdentity = stable({ sourcePack: sourcePack.archive.checksum, courseId: input.course.id, sectionMappings, requestedProducts: input.requestedProducts });
  const jobId = `authoring-job-${hashText(jobIdentity).slice(0, 24)}`;
  const job = authoringJobSchema.parse({
    schemaVersion: AUTHORING_JOB_SCHEMA_VERSION,
    jobId,
    sourcePack: { packId: sourcePack.manifest.packId, name: sourcePack.manifest.name, archiveSha256: sourcePack.archive.checksum, manifestPath: "source-pack/manifest.json" },
    target: { courseId: input.course.id, courseCode: input.course.code, courseLabel: input.course.title },
    chapters: chapters.map((chapter) => ({ id: chapter.id, code: chapter.code, label: chapter.title, orderIndex: chapter.orderIndex })),
    sectionMappings,
    requestedProducts: input.requestedProducts,
    attribution: { creatorId: "$UPLOADER", curatorId: "$APPROVING_REVIEWER" },
    workflow: { ideaPublicationRequiredBeforeProducts: true, freshAuthoringContextRequired: true },
  });

  const files = new Map<string, Uint8Array>();
  for (const [path, bytes] of sourcePack.archive.files) files.set(`source-pack/${path}`, bytes);
  files.set("authoring-job.json", jsonBytes(job));
  files.set("contracts/source-pack/manifest.schema.json", jsonBytes(z.toJSONSchema(sourcePackManifestSchema)));
  files.set("contracts/authoring-job.schema.json", jsonBytes(z.toJSONSchema(authoringJobSchema)));
  files.set("contracts/idea-bundle/manifest.schema.json", jsonBytes(z.toJSONSchema(ideaBundleManifestSchema)));
  files.set("contracts/idea-bundle/source-material.schema.json", jsonBytes(z.toJSONSchema(sourceMaterialSchema)));
  files.set("contracts/idea-bundle/source-chunk.schema.json", jsonBytes(z.toJSONSchema(sourceChunkSchema)));
  files.set("contracts/idea-bundle/idea.schema.json", jsonBytes(z.toJSONSchema(ideaSchema)));
  files.set("contracts/idea-bundle/provenance.schema.json", jsonBytes(z.toJSONSchema(ideaProvenanceSchema)));
  files.set("contracts/idea-bundle/relation.schema.json", jsonBytes(z.toJSONSchema(ideaRelationSchema)));
  files.set("contracts/product-bundle/manifest.schema.json", jsonBytes(z.toJSONSchema(productBundleManifestSchema)));
  files.set("contracts/product-bundle/product.schema.json", jsonBytes(z.toJSONSchema(productEntitySchema)));
  files.set("contracts/product-bundle/dependency.schema.json", jsonBytes(z.toJSONSchema(productDependencySchema)));
  files.set("instructions/external-authoring-workflow.json", jsonBytes(EXTERNAL_AUTHORING_WORKFLOW));

  const createdAt = input.createdAt ?? new Date().toISOString();
  const fileEntries = [...files.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([path, bytes]) => ({ path, checksum: hashBytes(bytes), byteLength: bytes.byteLength }));
  const manifestBase = { schemaVersion: AUTHORING_JOB_SCHEMA_VERSION, jobId, createdAt, sourcePackId: sourcePack.manifest.packId, courseId: input.course.id, files: fileEntries } as const;
  const manifest = authoringJobManifestSchema.parse({ ...manifestBase, jobChecksum: hashText(stable(manifestBase)) });
  files.set("manifest.json", jsonBytes(manifest));
  const entries = Object.fromEntries([...files.entries()].sort(([left], [right]) => left.localeCompare(right)));
  return {
    bytes: zipSync(entries, { level: 6 }),
    filename: `authoring-job-${slugifySegment(sourcePack.manifest.name)}.zip`,
    manifest,
    job,
  };
}

export function validateAuthoringJobPack(bytes: Uint8Array): ValidatedAuthoringJobPack {
  const archive = readAuthoringJobArchive(bytes);
  const manifestBytes = archive.files.get("manifest.json");
  const jobBytes = archive.files.get("authoring-job.json");
  if (!manifestBytes) throw new Error("AUTHORING_JOB_MANIFEST_MISSING");
  if (!jobBytes) throw new Error("AUTHORING_JOB_CONFIG_MISSING");

  const manifestResult = authoringJobManifestSchema.safeParse(parseJson(manifestBytes, "manifest.json"));
  if (!manifestResult.success) throw new Error("AUTHORING_JOB_MANIFEST_INVALID");
  const manifest = manifestResult.data;
  const declared = new Map<string, { checksum: string; byteLength: number }>();
  for (const file of manifest.files) {
    if (file.path === "manifest.json" || declared.has(file.path)) throw new Error(`AUTHORING_JOB_FILE_DECLARATION_INVALID:${file.path}`);
    declared.set(file.path, file);
    const fileBytes = archive.files.get(file.path);
    if (!fileBytes) throw new Error(`AUTHORING_JOB_FILE_MISSING:${file.path}`);
    if (fileBytes.byteLength !== file.byteLength || hashBytes(fileBytes) !== file.checksum) throw new Error(`AUTHORING_JOB_FILE_CHECKSUM_MISMATCH:${file.path}`);
  }
  const undeclared = [...archive.files.keys()].filter((path) => path !== "manifest.json" && !declared.has(path));
  if (undeclared.length > 0 || declared.size !== archive.files.size - 1) throw new Error(`AUTHORING_JOB_UNDECLARED_FILE:${undeclared[0] ?? "unknown"}`);
  const { jobChecksum: _jobChecksum, ...manifestBase } = manifest;
  if (hashText(stable(manifestBase)) !== manifest.jobChecksum) throw new Error("AUTHORING_JOB_CHECKSUM_MISMATCH");

  const jobResult = authoringJobSchema.safeParse(parseJson(jobBytes, "authoring-job.json"));
  if (!jobResult.success) throw new Error("AUTHORING_JOB_CONFIG_INVALID");
  const job = jobResult.data;
  if (job.jobId !== manifest.jobId || job.sourcePack.packId !== manifest.sourcePackId || job.target.courseId !== manifest.courseId) throw new Error("AUTHORING_JOB_IDENTITY_MISMATCH");

  const sourceEntries = [...archive.files.entries()]
    .filter(([path]) => path.startsWith("source-pack/"))
    .map(([path, fileBytes]) => [path.slice("source-pack/".length), fileBytes] as const);
  if (sourceEntries.length === 0) throw new Error("AUTHORING_JOB_SOURCE_PACK_MISSING");
  const sourcePack = validateSourcePack(zipSync(Object.fromEntries(sourceEntries), { level: 0 }));
  if (sourcePack.manifest.packId !== job.sourcePack.packId) throw new Error("AUTHORING_JOB_SOURCE_IDENTITY_MISMATCH");

  const sections = allSections(sourcePack.documents);
  if (job.sectionMappings.length !== sections.length) throw new Error("AUTHORING_JOB_MAPPING_INCOMPLETE");
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const chapterIds = new Set(job.chapters.map((chapter) => chapter.id));
  const mappedChapterIds = new Set<string>();
  for (const mapping of job.sectionMappings) {
    const section = sectionById.get(mapping.sectionId);
    if (!section || !chapterIds.has(mapping.chapterId)) throw new Error(`AUTHORING_JOB_MAPPING_INVALID:${mapping.sectionId}`);
    if (section.documentId !== mapping.documentId || section.title !== mapping.sectionTitle || section.startUnit !== mapping.startUnit || section.endUnit !== mapping.endUnit) throw new Error(`AUTHORING_JOB_MAPPING_SOURCE_MISMATCH:${mapping.sectionId}`);
    mappedChapterIds.add(mapping.chapterId);
    sectionById.delete(mapping.sectionId);
  }
  if (sectionById.size > 0 || mappedChapterIds.size !== chapterIds.size) throw new Error("AUTHORING_JOB_MAPPING_INCOMPLETE");
  return { manifest, job, sourcePack };
}

function readAuthoringJobArchive(bytes: Uint8Array) {
  return readSecureZip(bytes, {
    maxArchiveBytes: 128 * 1024 * 1024,
    maxEntries: 2048,
    maxFileBytes: 32 * 1024 * 1024,
    maxUncompressedBytes: 192 * 1024 * 1024,
  });
}
