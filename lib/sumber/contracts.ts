import { z } from "zod";

const nonEmptyId = z.string().min(1);
const sha256Hash = z.string().regex(/^[a-f0-9]{64}$/i, "must be a SHA-256 hex digest");
const positiveVersion = z.number().int().positive();
const isoTimestamp = z.string().datetime({ offset: true });

export const sourceMaterialTypeSchema = z.enum([
  "markdown",
  "json",
  "pdf",
  "docx",
  "html",
  "url",
  "transcript",
  "tutor_note",
]);
export type SourceMaterialType = z.infer<typeof sourceMaterialTypeSchema>;

export const sourceMaterialStatusSchema = z.enum(["draft", "active", "withdrawn", "archived"]);
export type SourceMaterialStatus = z.infer<typeof sourceMaterialStatusSchema>;

/** Canonical source metadata. Provider-specific storage details stay in the URI/key. */
export const sourceMaterialSchema = z
  .object({
    id: nonEmptyId,
    courseId: nonEmptyId,
    chapterId: nonEmptyId.optional(),
    sourceType: sourceMaterialTypeSchema,
    title: z.string().min(1),
    canonicalUriOrR2Key: z.string().min(1),
    version: positiveVersion,
    checksum: sha256Hash,
    status: sourceMaterialStatusSchema,
    creatorId: nonEmptyId,
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict();
export type SourceMaterial = z.infer<typeof sourceMaterialSchema>;

/** A source span uses JavaScript string offsets into the canonical source text. */
export const sourceChunkSchema = z
  .object({
    id: nonEmptyId,
    sourceMaterialId: nonEmptyId,
    sourceVersion: positiveVersion,
    content: z.string().min(1),
    pageNumber: z.number().int().positive().optional(),
    sectionLocator: z.string().min(1).optional(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    checksum: sha256Hash,
    embeddingEligible: z.boolean(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict()
  .refine((chunk) => chunk.endOffset > chunk.startOffset, {
    message: "endOffset must be greater than startOffset",
    path: ["endOffset"],
  });
export type SourceChunk = z.infer<typeof sourceChunkSchema>;

/** Checks that a chunk's declared offsets address exactly its declared content. */
export function hasExactSourceChunkOffsets(sourceText: string, chunk: SourceChunk): boolean {
  return sourceText.slice(chunk.startOffset, chunk.endOffset) === chunk.content;
}

export const legacyIdMappingSchema = z
  .object({
    id: nonEmptyId,
    legacyTable: nonEmptyId,
    legacyId: nonEmptyId,
    targetTable: nonEmptyId,
    targetId: nonEmptyId,
    mappingVersion: positiveVersion,
    sourceChecksum: sha256Hash,
    targetChecksum: sha256Hash,
    runId: nonEmptyId,
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict();
export type LegacyIdMapping = z.infer<typeof legacyIdMappingSchema>;

export const uniqueLegacyIdMappingsSchema = z.array(legacyIdMappingSchema).superRefine((mappings, ctx) => {
  const legacyKeys = new Set<string>();
  const targetKeys = new Set<string>();

  mappings.forEach((mapping, index) => {
    const legacyKey = `${mapping.legacyTable}:${mapping.legacyId}`;
    const targetKey = `${mapping.targetTable}:${mapping.targetId}`;
    if (legacyKeys.has(legacyKey)) {
      ctx.addIssue({ code: "custom", message: "legacy identity is mapped more than once", path: [index, "legacyId"] });
    }
    if (targetKeys.has(targetKey)) {
      ctx.addIssue({ code: "custom", message: "target identity is mapped more than once", path: [index, "targetId"] });
    }
    legacyKeys.add(legacyKey);
    targetKeys.add(targetKey);
  });
});
export type UniqueLegacyIdMappings = z.infer<typeof uniqueLegacyIdMappingsSchema>;
