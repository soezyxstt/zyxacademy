import { createHash } from "node:crypto";
import type { Idea, IdeaProvenance } from "@/lib/ide/contracts";

export type IdeaIdentityInput = Pick<Idea, "courseId" | "chapterId" | "code"> & {
  provenance?: ReadonlyArray<Pick<IdeaProvenance, "sourceChunkId" | "startOffset" | "endOffset" | "sourceChecksum">>;
};

export type IdeaSemanticInput = Pick<
  Idea,
  | "canonicalStatement"
  | "conciseExplanation"
  | "knowledgeKind"
  | "instructionalRole"
  | "sourcePolicy"
> & {
  latex?: string;
  difficultyMetadata?: unknown;
};

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim().replace(/[ \t]+/g, " ");
}

function canonicalValue(value: unknown): unknown {
  if (typeof value === "string") return normalizeText(value);
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested)]),
    );
  }
  return value;
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeSourceText(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

export function computeSourceChecksum(sourceText: string): string {
  return sha256(normalizeSourceText(sourceText));
}

export function generateStableIdeaKey(input: IdeaIdentityInput): string {
  const provenance = [...(input.provenance ?? [])]
    .map((span) => ({
      sourceChunkId: span.sourceChunkId.trim(),
      startOffset: span.startOffset,
      endOffset: span.endOffset,
      sourceChecksum: span.sourceChecksum.toLowerCase(),
    }))
    .sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)));
  return `ide_${sha256(stableSerialize({
    courseId: input.courseId.trim(),
    chapterId: input.chapterId.trim(),
    code: normalizeText(input.code).toLowerCase(),
    provenance,
  }))}`;
}

export function computeIdeaSemanticHash(input: IdeaSemanticInput): string {
  return sha256(stableSerialize({
    canonicalStatement: input.canonicalStatement,
    conciseExplanation: input.conciseExplanation,
    latex: input.latex,
    knowledgeKind: input.knowledgeKind,
    instructionalRole: input.instructionalRole,
    sourcePolicy: input.sourcePolicy,
    difficultyMetadata: input.difficultyMetadata,
  }));
}

export function computeIdeaGenerationHash(value: unknown): string {
  return sha256(stableSerialize(value));
}

export function computeProvenanceChecksum(provenance: Pick<IdeaProvenance, "sourceChunkId" | "startOffset" | "endOffset" | "sourceChecksum">): string {
  return sha256(stableSerialize(provenance));
}
