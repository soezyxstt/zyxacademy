import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { ideaSchema, ideaProvenanceSchema, ideaRelationSchema, type Idea, type IdeaProvenance, type IdeaRelation } from "@/lib/ide/contracts";
import { sha256Bytes } from "@/lib/bundle/validator";
import {
  computeIdeaBundleChecksum,
  serializeDeterministically,
  validateIdeaBundle,
  type IdeaBundleEntityType,
  type ValidatedIdeaBundle,
} from "@/lib/bundle/idea-bundle-v2";

export type IdeaBundleDraft = {
  ideas: Idea[];
  provenance: IdeaProvenance[];
  relations: IdeaRelation[];
};

export type FinalizedIdeaBundleDraft = {
  bytes: Uint8Array;
  bundle: ValidatedIdeaBundle;
};

function hash(value: unknown): string {
  return createHash("sha256").update(serializeDeterministically(value), "utf8").digest("hex");
}

function editableIdea(original: Idea, submitted: Idea): Idea {
  const content = {
    code: submitted.code.trim(),
    canonicalStatement: submitted.canonicalStatement.trim(),
    conciseExplanation: submitted.conciseExplanation.trim(),
    latex: submitted.latex?.trim() || undefined,
    knowledgeKind: submitted.knowledgeKind,
    instructionalRole: submitted.instructionalRole,
    difficultyMetadata: submitted.difficultyMetadata,
  };
  const semanticHash = hash(content);
  const merged = { ...original, ...content, semanticHash };
  return ideaSchema.parse({ ...merged, generationHash: hash({ ...merged, generationHash: undefined }) });
}

function byExactIds<T extends { id: string }>(original: readonly T[], submitted: readonly T[], code: string): Map<string, T> {
  if (original.length !== submitted.length) throw new Error(code);
  const submittedById = new Map(submitted.map((item) => [item.id, item]));
  if (submittedById.size !== submitted.length || original.some((item) => !submittedById.has(item.id))) throw new Error(code);
  return submittedById;
}

export function createIdeaBundleDraft(bundle: ValidatedIdeaBundle): IdeaBundleDraft {
  return JSON.parse(JSON.stringify({
    ideas: bundle.entities.ideas,
    provenance: bundle.entities.provenance,
    relations: bundle.entities.relations,
  })) as IdeaBundleDraft;
}

export function finalizeIdeaBundleDraft(original: ValidatedIdeaBundle, draft: IdeaBundleDraft): FinalizedIdeaBundleDraft {
  const submittedIdeas = byExactIds(original.entities.ideas, draft.ideas, "IDEA_DRAFT_IDENTITY_CHANGED");
  const submittedProvenance = byExactIds(original.entities.provenance, draft.provenance, "IDEA_DRAFT_PROVENANCE_CHANGED");
  const submittedRelations = byExactIds(original.entities.relations, draft.relations, "IDEA_DRAFT_RELATION_CHANGED");

  const ideas = original.entities.ideas.map((idea) => editableIdea(idea, submittedIdeas.get(idea.id)!));
  const provenance = original.entities.provenance.map((item) => {
    const submitted = submittedProvenance.get(item.id)!;
    return ideaProvenanceSchema.parse({
      ...item,
      provenanceRole: submitted.provenanceRole,
      note: submitted.note?.trim() || undefined,
    });
  });
  const relations = original.entities.relations.map((item) => {
    const submitted = submittedRelations.get(item.id)!;
    return ideaRelationSchema.parse({
      ...item,
      relationType: submitted.relationType,
      explanation: submitted.explanation?.trim() || undefined,
    });
  });

  const entityValues: Record<IdeaBundleEntityType, readonly unknown[]> = {
    source_materials: original.entities.sourceMaterials,
    source_chunks: original.entities.sourceChunks,
    ideas,
    provenance,
    relations,
  };
  const files = new Map(original.files);
  const entityFiles = original.manifest.entityFiles.map((file) => {
    const bytes = strToU8(`${serializeDeterministically(entityValues[file.entityType])}\n`);
    files.set(file.path, bytes);
    return { ...file, checksum: sha256Bytes(bytes) };
  });
  const manifestBase = { ...original.manifest, entityFiles, bundleChecksum: undefined };
  const bundleChecksum = computeIdeaBundleChecksum(manifestBase as Omit<typeof original.manifest, "bundleChecksum">, files);
  const manifest = { ...original.manifest, entityFiles, bundleChecksum };
  files.set("manifest.json", strToU8(`${serializeDeterministically(manifest)}\n`));

  const validation = validateIdeaBundle(files);
  if (!validation.success) throw new Error(`${validation.issues[0]?.code ?? "IDEA_DRAFT_INVALID"}:${validation.issues[0]?.message ?? "Draft tidak valid"}`);
  const entries = Object.fromEntries([...files.entries()].sort(([left], [right]) => left.localeCompare(right)));
  return { bytes: zipSync(entries, { level: 6 }), bundle: validation.data };
}
