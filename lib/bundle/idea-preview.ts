import type { ValidatedIdeaBundle } from "./idea-bundle-v2";

export type IdeaBundlePreview = {
  summary: {
    ideaCount: number;
    sourceCount: number;
    excerptCount: number;
    relationCount: number;
    learningSectionCount: number;
    ai: { provider: string; model: string; promptVersion: string } | null;
  };
  learningSections: readonly {
    id: string;
    chapterId: string;
    parentSectionId: string | null;
    title: string;
    slug: string;
    orderIndex: number;
    learningObjective: string;
    primaryIdeaIds: readonly string[];
    supportingIdeaIds: readonly string[];
    sourceChunkIds: readonly string[];
  }[];
  ideas: readonly {
    id: string;
    code: string;
    chapterId: string;
    canonicalStatement: string;
    conciseExplanation: string;
    latex: string | null;
    knowledgeKind: string;
    instructionalRole: string;
    learningSection: {
      id: string;
      title: string;
      slug: string;
    } | null;
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

  const primarySectionByIdeaId = new Map<string, (typeof bundle.entities.learningSections)[number]>();
  for (const section of bundle.entities.learningSections) {
    for (const ideaId of section.primaryIdeaIds) {
      primarySectionByIdeaId.set(ideaId, section);
    }
  }

  return {
    summary: {
      ideaCount: bundle.entities.ideas.length,
      sourceCount: bundle.entities.sourceMaterials.length,
      excerptCount: bundle.entities.sourceChunks.length,
      relationCount: bundle.entities.relations.length,
      learningSectionCount: bundle.entities.learningSections.length,
      ai: bundle.manifest.ai ?? null,
    },
    learningSections: bundle.entities.learningSections.map((section) => ({
      id: section.id,
      chapterId: section.chapterId,
      parentSectionId: section.parentSectionId ?? null,
      title: section.title,
      slug: section.slug,
      orderIndex: section.orderIndex,
      learningObjective: section.learningObjective,
      primaryIdeaIds: section.primaryIdeaIds,
      supportingIdeaIds: section.supportingIdeaIds,
      sourceChunkIds: section.sourceChunkIds,
    })),
    ideas: bundle.entities.ideas.map((idea) => {
      const section = primarySectionByIdeaId.get(idea.id);
      return {
        id: idea.id,
        code: idea.code,
        chapterId: idea.chapterId,
        canonicalStatement: idea.canonicalStatement,
        conciseExplanation: idea.conciseExplanation,
        latex: idea.latex ?? null,
        knowledgeKind: idea.knowledgeKind,
        instructionalRole: idea.instructionalRole,
        learningSection: section
          ? {
              id: section.id,
              title: section.title,
              slug: section.slug,
            }
          : null,
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
      };
    }),
    relations: bundle.entities.relations.map((relation) => ({
      id: relation.id,
      sourceIdeaId: relation.sourceIdeaId,
      targetIdeaId: relation.targetIdeaId,
      relationType: relation.relationType,
      explanation: relation.explanation ?? null,
    })),
  };
}
