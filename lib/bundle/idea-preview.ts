import type { ValidatedIdeaBundle } from "./idea-bundle-v2";

export type IdeaBundlePreview = {
  summary: {
    ideaCount: number;
    sourceCount: number;
    excerptCount: number;
    relationCount: number;
    ai: { provider: string; model: string; promptVersion: string } | null;
  };
  ideas: readonly {
    id: string;
    code: string;
    chapterId: string;
    canonicalStatement: string;
    conciseExplanation: string;
    latex: string | null;
    knowledgeKind: string;
    instructionalRole: string;
    provenance: readonly {
      id: string;
      role: string;
      sourceTitle: string;
      excerpt: string;
      sectionLocator: string | null;
      pageNumber: number | null;
      note: string | null;
    }[];
  }[];
  relations: readonly {
    id: string;
    sourceIdeaId: string;
    targetIdeaId: string;
    relationType: string;
    explanation: string | null;
  }[];
};

export function previewIdeaBundle(bundle: ValidatedIdeaBundle): IdeaBundlePreview {
  const chunks = new Map(bundle.entities.sourceChunks.map((chunk) => [chunk.id, chunk]));
  const sources = new Map(bundle.entities.sourceMaterials.map((source) => [source.id, source]));
  const provenanceByIdea = new Map<string, typeof bundle.entities.provenance>();
  for (const item of bundle.entities.provenance) {
    provenanceByIdea.set(item.ideaId, [...(provenanceByIdea.get(item.ideaId) ?? []), item]);
  }
  return {
    summary: {
      ideaCount: bundle.entities.ideas.length,
      sourceCount: bundle.entities.sourceMaterials.length,
      excerptCount: bundle.entities.sourceChunks.length,
      relationCount: bundle.entities.relations.length,
      ai: bundle.manifest.ai ?? null,
    },
    ideas: bundle.entities.ideas.map((idea) => ({
      id: idea.id,
      code: idea.code,
      chapterId: idea.chapterId,
      canonicalStatement: idea.canonicalStatement,
      conciseExplanation: idea.conciseExplanation,
      latex: idea.latex ?? null,
      knowledgeKind: idea.knowledgeKind,
      instructionalRole: idea.instructionalRole,
      provenance: (provenanceByIdea.get(idea.id) ?? []).map((item) => {
        const chunk = chunks.get(item.sourceChunkId);
        const source = chunk ? sources.get(chunk.sourceMaterialId) : undefined;
        return {
          id: item.id,
          role: item.provenanceRole,
          sourceTitle: source?.title ?? item.sourceChunkId,
          excerpt: chunk?.content ?? "",
          sectionLocator: chunk?.sectionLocator ?? null,
          pageNumber: chunk?.pageNumber ?? null,
          note: item.note ?? null,
        };
      }),
    })),
    relations: bundle.entities.relations.map((relation) => ({
      id: relation.id,
      sourceIdeaId: relation.sourceIdeaId,
      targetIdeaId: relation.targetIdeaId,
      relationType: relation.relationType,
      explanation: relation.explanation ?? null,
    })),
  };
}
