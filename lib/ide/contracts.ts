import { z } from "zod";
import type { SourceChunk } from "@/lib/sumber/contracts";

const nonEmptyId = z.string().min(1);
const sha256Hash = z.string().regex(/^[a-f0-9]{64}$/i, "must be a SHA-256 hex digest");
const positiveVersion = z.number().int().positive();
const isoTimestamp = z.string().datetime({ offset: true });

export const ideaKnowledgeKindSchema = z.enum([
  "definition",
  "principle",
  "formula",
  "procedure",
  "example",
  "constraint",
  "misconception",
  "other",
]);
export type IdeaKnowledgeKind = z.infer<typeof ideaKnowledgeKindSchema>;

export const ideaInstructionalRoleSchema = z.enum([
  "core",
  "prerequisite",
  "enrichment",
  "assessment_support",
  "reference",
]);
export type IdeaInstructionalRole = z.infer<typeof ideaInstructionalRoleSchema>;

export const ideaStatusSchema = z.enum(["draft", "published", "needs_review", "superseded", "withdrawn"]);
export type IdeaStatus = z.infer<typeof ideaStatusSchema>;

export const ideaSourcePolicySchema = z.enum(["source_grounded", "tutor_authored"]);
export type IdeaSourcePolicy = z.infer<typeof ideaSourcePolicySchema>;

export const ideaDifficultyMetadataSchema = z
  .object({
    level: z.enum(["introductory", "intermediate", "advanced"]),
    rationale: z.string().min(1).optional(),
  })
  .strict();

/** Canonical learning atom. It intentionally has no provider-specific vector ID. */
export const ideaSchema = z
  .object({
    id: nonEmptyId,
    courseId: nonEmptyId,
    chapterId: nonEmptyId,
    conceptId: nonEmptyId.optional(),
    stableKey: nonEmptyId,
    code: nonEmptyId,
    canonicalStatement: z.string().min(1),
    conciseExplanation: z.string().min(1),
    latex: z.string().min(1).optional(),
    knowledgeKind: ideaKnowledgeKindSchema,
    instructionalRole: ideaInstructionalRoleSchema,
    difficultyMetadata: ideaDifficultyMetadataSchema.optional(),
    version: positiveVersion,
    status: ideaStatusSchema,
    schemaVersion: nonEmptyId,
    semanticHash: sha256Hash,
    generationHash: sha256Hash,
    sourcePolicy: ideaSourcePolicySchema,
    creatorId: nonEmptyId,
    curatorId: nonEmptyId.optional(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict();
export type Idea = z.infer<typeof ideaSchema>;

export const ideaProvenanceRoleSchema = z.enum([
  "primary",
  "supporting",
  "prerequisite",
  "context",
  "tutor_authored",
]);
export type IdeaProvenanceRole = z.infer<typeof ideaProvenanceRoleSchema>;

export const ideaProvenanceSchema = z
  .object({
    id: nonEmptyId,
    ideaId: nonEmptyId,
    sourceChunkId: nonEmptyId,
    provenanceRole: ideaProvenanceRoleSchema,
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    sourceChecksum: sha256Hash,
    note: z.string().min(1).optional(),
  })
  .strict()
  .refine((provenance) => provenance.endOffset > provenance.startOffset, {
    message: "endOffset must be greater than startOffset",
    path: ["endOffset"],
  });
export type IdeaProvenance = z.infer<typeof ideaProvenanceSchema>;

export const ideaPublicationSchema = z
  .object({
    idea: ideaSchema,
    provenance: z.array(ideaProvenanceSchema),
  })
  .strict()
  .superRefine((publication, ctx) => {
    if (publication.idea.status !== "published") return;

    if (publication.idea.sourcePolicy === "source_grounded" && publication.provenance.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "a published source-grounded Idea requires provenance",
        path: ["provenance"],
      });
    }

    if (publication.idea.sourcePolicy === "tutor_authored" && !publication.idea.curatorId) {
      ctx.addIssue({
        code: "custom",
        message: "a published tutor-authored Idea requires an accountable curator",
        path: ["idea", "curatorId"],
      });
    }
  });
export type IdeaPublication = z.infer<typeof ideaPublicationSchema>;

export const uniqueIdeaStableKeysSchema = z.array(ideaSchema).superRefine((ideas, ctx) => {
  const stableKeys = new Set<string>();
  ideas.forEach((idea, index) => {
    if (stableKeys.has(idea.stableKey)) {
      ctx.addIssue({ code: "custom", message: "stableKey must be unique", path: [index, "stableKey"] });
    }
    stableKeys.add(idea.stableKey);
  });
});
export type UniqueIdeaStableKeys = z.infer<typeof uniqueIdeaStableKeysSchema>;

export const ideaRelationTypeSchema = z.enum([
  "prerequisite",
  "related",
  "extends",
  "example_of",
  "misconception_of",
]);
export type IdeaRelationType = z.infer<typeof ideaRelationTypeSchema>;

export const ideaRelationStatusSchema = z.enum(["active", "superseded", "withdrawn"]);

export const ideaRelationSchema = z
  .object({
    id: nonEmptyId,
    sourceIdeaId: nonEmptyId,
    targetIdeaId: nonEmptyId,
    relationType: ideaRelationTypeSchema,
    explanation: z.string().min(1).optional(),
    version: positiveVersion,
    status: ideaRelationStatusSchema,
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict()
  .refine((relation) => relation.sourceIdeaId !== relation.targetIdeaId, {
    message: "an Idea cannot relate to itself",
    path: ["targetIdeaId"],
  });
export type IdeaRelation = z.infer<typeof ideaRelationSchema>;

export const ideaRelationGraphSchema = z.array(ideaRelationSchema).superRefine((relations, ctx) => {
  const prerequisiteEdges = new Map<string, string[]>();
  const edgeKeys = new Set<string>();

  relations.forEach((relation, index) => {
    const edgeKey = `${relation.sourceIdeaId}:${relation.targetIdeaId}:${relation.relationType}`;
    if (edgeKeys.has(edgeKey)) {
      ctx.addIssue({ code: "custom", message: "duplicate Idea relation", path: [index] });
    }
    edgeKeys.add(edgeKey);

    if (relation.relationType !== "prerequisite" || relation.status !== "active") return;
    const targets = prerequisiteEdges.get(relation.sourceIdeaId) ?? [];
    targets.push(relation.targetIdeaId);
    prerequisiteEdges.set(relation.sourceIdeaId, targets);
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;

    visiting.add(node);
    for (const target of prerequisiteEdges.get(node) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  for (const node of prerequisiteEdges.keys()) {
    if (visit(node)) {
      ctx.addIssue({ code: "custom", message: "active prerequisite relations must be acyclic", path: [] });
      break;
    }
  }
});
export type IdeaRelationGraph = z.infer<typeof ideaRelationGraphSchema>;

export const productEntityTypeSchema = z.enum([
  "source_material",
  "source_chunk",
  "idea",
  "learning_material",
  "flashcard_set",
  "question_set",
  "diktat",
]);
export type ProductEntityType = z.infer<typeof productEntityTypeSchema>;

export const dependencyFreshnessSchema = z.enum(["UP_TO_DATE", "NEEDS_REVIEW", "STALE"]);
export type DependencyFreshness = z.infer<typeof dependencyFreshnessSchema>;

export const productDependencySchema = z
  .object({
    id: nonEmptyId,
    upstreamEntityType: productEntityTypeSchema,
    upstreamEntityId: nonEmptyId,
    upstreamVersion: positiveVersion,
    upstreamHash: sha256Hash,
    downstreamEntityType: productEntityTypeSchema,
    downstreamEntityId: nonEmptyId,
    downstreamVersion: positiveVersion,
    downstreamHash: sha256Hash,
    freshness: dependencyFreshnessSchema,
    reason: z.string().min(1).optional(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict()
  .refine(
    (dependency) =>
      dependency.upstreamEntityType !== dependency.downstreamEntityType ||
      dependency.upstreamEntityId !== dependency.downstreamEntityId,
    { message: "a product cannot depend on itself", path: ["downstreamEntityId"] },
  );
export type ProductDependency = z.infer<typeof productDependencySchema>;

export const freshnessEventSchema = z
  .object({
    type: z.enum(["upstream_hash_changed", "upstream_withdrawn", "downstream_revalidated"]),
    validationPassed: z.boolean().optional(),
    upstreamAvailable: z.boolean().optional(),
  })
  .strict();
export type FreshnessEvent = z.infer<typeof freshnessEventSchema>;

/** Pure state machine for dependency freshness; callers persist the resulting state. */
export function transitionDependencyFreshness(
  current: DependencyFreshness,
  event: FreshnessEvent,
): DependencyFreshness {
  if (event.type === "upstream_withdrawn") return "STALE";
  if (event.type === "upstream_hash_changed") return current === "STALE" ? "STALE" : "NEEDS_REVIEW";
  if (event.upstreamAvailable !== true || event.validationPassed !== true) return current;
  return "UP_TO_DATE";
}

/** Verifies that a provenance span is bounded by the chunk it cites. */
export function provenanceMatchesChunk(provenance: IdeaProvenance, chunk: SourceChunk): boolean {
  return (
    provenance.sourceChunkId === chunk.id &&
    provenance.sourceChecksum === chunk.checksum &&
    provenance.startOffset >= chunk.startOffset &&
    provenance.endOffset <= chunk.endOffset &&
    provenance.endOffset > provenance.startOffset
  );
}
