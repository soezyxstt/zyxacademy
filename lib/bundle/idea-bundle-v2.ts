import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ideaRelationGraphSchema,
  ideaRelationSchema,
  ideaSchema,
  ideaProvenanceSchema,
  type Idea,
  type IdeaProvenance,
  type IdeaRelation,
} from "@/lib/ide/contracts";
import { hasExactSourceChunkOffsets, sourceChunkSchema, sourceMaterialSchema, type SourceChunk, type SourceMaterial } from "@/lib/sumber/contracts";
import { readSecureZip, type SecureZipArchive } from "@/lib/bundle/zip-reader";
import { assertCondition, BundleValidationError, parseSchema, parseStrictJson, sha256Bytes, sha256Text, type BundleValidationIssue } from "@/lib/bundle/validator";

const id = z.string().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i, "must be a SHA-256 hex digest");
const timestamp = z.string().datetime({ offset: true });
const path = z.string().min(1).refine((value) => !value.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(value), "path must be relative");

export const ideaBundleEntityTypeSchema = z.enum(["source_materials", "source_chunks", "ideas", "provenance", "relations"]);
export type IdeaBundleEntityType = z.infer<typeof ideaBundleEntityTypeSchema>;

export const ideaBundleSourceVersionSchema = z
  .object({
    sourceMaterialId: id,
    version: z.number().int().positive(),
    checksum: sha256,
    contentPath: path,
  })
  .strict();
export type IdeaBundleSourceVersion = z.infer<typeof ideaBundleSourceVersionSchema>;

export const ideaBundleEntityFileSchema = z
  .object({
    path,
    entityType: ideaBundleEntityTypeSchema,
    checksum: sha256,
    stableIds: z.array(id),
  })
  .strict();
export type IdeaBundleEntityFile = z.infer<typeof ideaBundleEntityFileSchema>;

export const ideaBundleConflictSchema = z
  .object({
    id,
    entityType: id,
    stableId: id,
    reason: z.string().min(1),
  })
  .strict();

const aiMetadataSchema = z
  .object({
    provider: id,
    model: id,
    promptVersion: id,
  })
  .strict();

export const ideaBundleManifestSchema = z
  .object({
    bundleId: id,
    bundleType: z.literal("idea"),
    schemaVersion: z.string().min(1),
    courseId: id,
    sourceVersions: z.array(ideaBundleSourceVersionSchema).min(1),
    entityFiles: z.array(ideaBundleEntityFileSchema).min(1),
    creatorId: id,
    curatorId: id.optional(),
    ai: aiMetadataSchema.optional(),
    createdAt: timestamp,
    bundleChecksum: sha256,
    conflicts: z.array(ideaBundleConflictSchema).default([]),
  })
  .strict();
export type IdeaBundleManifest = z.infer<typeof ideaBundleManifestSchema>;

export interface IdeaBundleEntities {
  sourceMaterials: readonly SourceMaterial[];
  sourceChunks: readonly SourceChunk[];
  ideas: readonly Idea[];
  provenance: readonly IdeaProvenance[];
  relations: readonly IdeaRelation[];
}

export interface ValidatedIdeaBundle {
  manifest: IdeaBundleManifest;
  entities: IdeaBundleEntities;
  files: ReadonlyMap<string, Uint8Array>;
  canonicalChecksum: string;
}

/** Public integration type for a fully validated Idea Bundle V2 payload. */
export type IdeaBundleV2 = ValidatedIdeaBundle;

export interface IdeaBundleValidationResult {
  success: true;
  data: ValidatedIdeaBundle;
  issues: readonly [];
}

export interface IdeaBundleValidationFailure {
  success: false;
  issues: readonly BundleValidationIssue[];
}

export type IdeaBundleValidation = IdeaBundleValidationResult | IdeaBundleValidationFailure;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, canonicalize(nested)]));
  }
  return value;
}

export function serializeDeterministically(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export const stableSerialize = serializeDeterministically;

export function computeIdeaBundleChecksum(
  manifest: Omit<IdeaBundleManifest, "bundleChecksum"> | IdeaBundleManifest,
  files: ReadonlyMap<string, Uint8Array>,
): string {
  const manifestWithoutChecksum = { ...manifest, bundleChecksum: undefined };
  const fileChecksums = [...files.entries()]
    .filter(([filePath]) => filePath !== "manifest.json")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, bytes]) => [filePath, sha256Bytes(bytes)]);
  return createHash("sha256").update(serializeDeterministically({ manifest: manifestWithoutChecksum, files: fileChecksums }), "utf8").digest("hex");
}

function asFiles(input: SecureZipArchive | ReadonlyMap<string, Uint8Array> | Record<string, Uint8Array>): ReadonlyMap<string, Uint8Array> {
  if ("files" in input && input.files instanceof Map) return input.files;
  if (input instanceof Map) return input;
  return new Map(Object.entries(input));
}

function parseEntityArray<T>(files: ReadonlyMap<string, Uint8Array>, file: IdeaBundleEntityFile, schema: z.ZodType<T>): T[] {
  const bytes = files.get(file.path);
  assertCondition(bytes !== undefined, "BUNDLE_ENTITY_FILE_MISSING", `entity file ${file.path} is missing`, file.path);
  const value = parseStrictJson<unknown>(bytes, file.path);
  assertCondition(Array.isArray(value), "BUNDLE_ENTITY_INVALID", `entity file ${file.path} must contain an array`, file.path);
  const parsed = value.map((item, index) => parseSchema(schema, item, `${file.path}[${index}]`));
  const actualIds = parsed.map((item) => String((item as { id: string }).id)).sort();
  const declaredIds = [...file.stableIds].sort();
  assertCondition(JSON.stringify(actualIds) === JSON.stringify(declaredIds), "BUNDLE_STABLE_ID_MISMATCH", `stableIds do not match ${file.path}`, file.path);
  return parsed;
}

function parseSourceText(files: ReadonlyMap<string, Uint8Array>, source: IdeaBundleSourceVersion): string {
  const bytes = files.get(source.contentPath);
  assertCondition(bytes !== undefined, "BUNDLE_MISSING_SOURCE", `source content ${source.contentPath} is missing`, source.contentPath);
  assertCondition(sha256Bytes(bytes) === source.checksum, "BUNDLE_SOURCE_CHECKSUM_MISMATCH", `source checksum does not match ${source.sourceMaterialId}`, source.contentPath);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/\r\n/g, "\n");
  } catch {
    throw new BundleValidationError({ code: "BUNDLE_MISSING_SOURCE", message: `source ${source.contentPath} is not valid UTF-8`, path: source.contentPath });
  }
}

function validateEntities(manifest: IdeaBundleManifest, files: ReadonlyMap<string, Uint8Array>): IdeaBundleEntities {
  const declared = new Map<string, IdeaBundleEntityFile>();
  for (const file of manifest.entityFiles) {
    assertCondition(!declared.has(file.path), "BUNDLE_ENTITY_INVALID", `entity file ${file.path} is declared more than once`, file.path);
    declared.set(file.path, file);
    const bytes = files.get(file.path);
    assertCondition(bytes !== undefined, "BUNDLE_ENTITY_FILE_MISSING", `entity file ${file.path} is missing`, file.path);
    assertCondition(sha256Bytes(bytes) === file.checksum, "BUNDLE_ENTITY_CHECKSUM_MISMATCH", `entity file checksum does not match ${file.path}`, file.path);
  }

  const byType = <T>(entityType: IdeaBundleEntityType, schema: z.ZodType<T>): T[] => {
    const filesForType = [...declared.values()].filter((file) => file.entityType === entityType);
    assertCondition(filesForType.length === 1, "BUNDLE_ENTITY_INVALID", `bundle must declare exactly one ${entityType} file`);
    return parseEntityArray(files, filesForType[0], schema);
  };

  const sourceMaterials = byType("source_materials", sourceMaterialSchema);
  const sourceChunks = byType("source_chunks", sourceChunkSchema);
  const ideas = byType("ideas", ideaSchema);
  const provenance = byType("provenance", ideaProvenanceSchema);
  const parsedRelations = byType("relations", ideaRelationSchema);

  const materialById = new Map(sourceMaterials.map((source) => [source.id, source]));
  const sourceVersionById = new Map(manifest.sourceVersions.map((source) => [source.sourceMaterialId, source]));
  assertCondition(sourceVersionById.size === manifest.sourceVersions.length, "BUNDLE_ENTITY_INVALID", "source material IDs must be unique");
  for (const source of sourceMaterials) {
    const version = sourceVersionById.get(source.id);
    assertCondition(version !== undefined, "BUNDLE_MISSING_SOURCE", `source ${source.id} is not declared in sourceVersions`, source.id);
    assertCondition(source.version === version.version && source.checksum === version.checksum, "BUNDLE_SOURCE_CHECKSUM_MISMATCH", `source metadata does not match sourceVersions for ${source.id}`, source.id);
    parseSourceText(files, version);
  }
  for (const version of manifest.sourceVersions) {
    assertCondition(materialById.has(version.sourceMaterialId), "BUNDLE_MISSING_SOURCE", `source material ${version.sourceMaterialId} is missing`, version.sourceMaterialId);
    parseSourceText(files, version);
  }

  const sourceTextById = new Map(manifest.sourceVersions.map((source) => [source.sourceMaterialId, parseSourceText(files, source)]));
  const chunkById = new Map<string, SourceChunk>();
  for (const chunk of sourceChunks) {
    assertCondition(!chunkById.has(chunk.id), "BUNDLE_ENTITY_INVALID", `duplicate source chunk ${chunk.id}`, chunk.id);
    chunkById.set(chunk.id, chunk);
    const text = sourceTextById.get(chunk.sourceMaterialId);
    assertCondition(text !== undefined, "BUNDLE_MISSING_SOURCE", `source material ${chunk.sourceMaterialId} is missing`, chunk.id);
    assertCondition(chunk.sourceVersion === sourceVersionById.get(chunk.sourceMaterialId)?.version, "BUNDLE_SOURCE_CHUNK_INVALID", `source chunk version does not match source material ${chunk.id}`, chunk.id);
    assertCondition(hasExactSourceChunkOffsets(text, chunk), "BUNDLE_INVALID_SPAN", `source chunk offsets do not address its exact content: ${chunk.id}`, chunk.id);
    assertCondition(sha256Text(chunk.content) === chunk.checksum, "BUNDLE_SOURCE_CHUNK_INVALID", `source chunk checksum does not match its content: ${chunk.id}`, chunk.id);
  }

  const ideaById = new Map<string, Idea>();
  const stableKeys = new Set<string>();
  for (const idea of ideas) {
    assertCondition(idea.courseId === manifest.courseId, "BUNDLE_ENTITY_INVALID", `Idea ${idea.id} belongs to another course`, idea.id);
    assertCondition(!ideaById.has(idea.id), "BUNDLE_ENTITY_INVALID", `duplicate Idea ${idea.id}`, idea.id);
    assertCondition(!stableKeys.has(idea.stableKey), "BUNDLE_DUPLICATE_STABLE_KEY", `duplicate Idea stableKey ${idea.stableKey}`, idea.id);
    ideaById.set(idea.id, idea);
    stableKeys.add(idea.stableKey);
  }

  const provenanceIds = new Set<string>();
  for (const item of provenance) {
    assertCondition(!provenanceIds.has(item.id), "BUNDLE_ENTITY_INVALID", `duplicate provenance ${item.id}`, item.id);
    provenanceIds.add(item.id);
    assertCondition(ideaById.has(item.ideaId), "BUNDLE_MISSING_IDEA", `provenance ${item.id} references a missing Idea`, item.id);
    const chunk = chunkById.get(item.sourceChunkId);
    assertCondition(chunk !== undefined, "BUNDLE_MISSING_SOURCE", `provenance ${item.id} references a missing source chunk`, item.id);
    assertCondition(item.sourceChecksum === chunk.checksum, "BUNDLE_INVALID_SPAN", `provenance ${item.id} has a mismatched source checksum`, item.id);
    assertCondition(item.startOffset >= chunk.startOffset && item.endOffset <= chunk.endOffset && item.endOffset > item.startOffset, "BUNDLE_INVALID_SPAN", `provenance ${item.id} is outside its source chunk`, item.id);
  }

  for (const relation of parsedRelations) {
    assertCondition(ideaById.has(relation.sourceIdeaId) && ideaById.has(relation.targetIdeaId), "BUNDLE_INVALID_RELATION", `relation ${relation.id} references a missing Idea`, relation.id);
  }
  try {
    ideaRelationGraphSchema.parse(parsedRelations);
  } catch {
    throw new BundleValidationError({ code: "BUNDLE_PREREQUISITE_CYCLE", message: "Idea prerequisite relations contain a cycle" });
  }

  const provenanceIdeaIds = new Set(provenance.map((item) => item.ideaId));
  for (const idea of ideas) {
    if (idea.status === "published" && idea.sourcePolicy === "source_grounded") {
      assertCondition(provenanceIdeaIds.has(idea.id), "BUNDLE_MISSING_SOURCE", `published source-grounded Idea ${idea.id} has no provenance`, idea.id);
    }
  }

  return { sourceMaterials, sourceChunks, ideas, provenance, relations: parsedRelations };
}

function validateManifest(value: unknown): IdeaBundleManifest {
  const parsed = ideaBundleManifestSchema.safeParse(value);
  if (!parsed.success) {
    throw new BundleValidationError({ code: "BUNDLE_INVALID_MANIFEST", message: parsed.error.issues.map((issue) => issue.message).join("; "), path: "manifest.json" });
  }
  assertCondition(parsed.data.schemaVersion === "idea-bundle.v2", "BUNDLE_UNSUPPORTED_SCHEMA", "unsupported Idea Bundle schema version", "manifest.json");
  assertCondition(parsed.data.conflicts.length === 0, "BUNDLE_UNRESOLVED_CONFLICT", "bundle contains unresolved conflicts", "manifest.json");
  return parsed.data;
}

export function validateIdeaBundle(input: SecureZipArchive | ReadonlyMap<string, Uint8Array> | Record<string, Uint8Array>): IdeaBundleValidation {
  try {
    const files = asFiles(input);
    const manifestBytes = files.get("manifest.json");
    assertCondition(manifestBytes !== undefined, "BUNDLE_MISSING_MANIFEST", "manifest.json is required", "manifest.json");
    const manifest = validateManifest(parseStrictJson<unknown>(manifestBytes, "manifest.json"));
    const canonicalChecksum = computeIdeaBundleChecksum(manifest, files);
    assertCondition(canonicalChecksum === manifest.bundleChecksum, "BUNDLE_CHECKSUM_MISMATCH", "bundle checksum does not match canonical contents", "manifest.json.bundleChecksum");
    const entities = validateEntities(manifest, files);
    return { success: true, data: { manifest, entities, files, canonicalChecksum }, issues: [] };
  } catch (error) {
    if (error instanceof BundleValidationError) return { success: false, issues: [{ code: error.code, message: error.message, path: error.path }] };
    throw error;
  }
}

export function parseIdeaBundle(input: SecureZipArchive | ReadonlyMap<string, Uint8Array> | Record<string, Uint8Array>): ValidatedIdeaBundle {
  const result = validateIdeaBundle(input);
  if (!result.success) throw new BundleValidationError(result.issues[0]);
  return result.data;
}

export function validateIdeaBundleZip(input: Uint8Array | ArrayBuffer, limits?: Partial<Parameters<typeof readSecureZip>[1]>): IdeaBundleValidation {
  try {
    return validateIdeaBundle(readSecureZip(input, limits));
  } catch (error) {
    if (error instanceof BundleValidationError) return { success: false, issues: [{ code: error.code, message: error.message, path: error.path }] };
    throw error;
  }
}
